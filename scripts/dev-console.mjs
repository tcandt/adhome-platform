import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const localApi = 'http://127.0.0.1:5173';
const apiTarget = process.env.ADHOME_API_TARGET || localApi;
const hotReload = process.argv.includes('--hot');
const consolePort = hotReload ? 5175 : 5174;
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('exit', () => { for (const child of children) child.kill(); });

function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = createConnection({ host: '127.0.0.1', port });
    probe.once('connect', () => { probe.destroy(); resolve(false); });
    probe.once('error', error => error.code === 'ECONNREFUSED' ? resolve(true) : reject(error));
    probe.setTimeout(2000, () => { probe.destroy(); reject(new Error(`Port ${port} did not respond.`)); });
  });
}

function viteCommand(app) {
  const cwd = fileURLToPath(new URL(`../apps/${app}/`, import.meta.url));
  const require = createRequire(new URL(`../apps/${app}/package.json`, import.meta.url));
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  return { cwd, vite };
}

function startVite(app, host, port, preview = false) {
  const { cwd, vite } = viteCommand(app);
  const child = spawn(process.execPath, [vite, ...(preview ? ['preview'] : []), '--host', host, '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, TRUST_PROXY: 'false', ADHOME_API_TARGET: apiTarget },
    windowsHide: true,
  });
  children.push(child);
  child.on('error', () => { console.error(`Could not start ${app}.`); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}

async function buildConsole() {
  const { cwd, vite } = viteCommand('console');
  const require = createRequire(new URL('../apps/console/package.json', import.meta.url));
  const tsc = join(dirname(require.resolve('typescript')), 'tsc.js');
  console.log('Building Console for mobile use (no development auto-reload)...');
  for (const args of [[tsc, '-b'], [vite, 'build']]) {
    if (stopping) return;
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
    children.push(child);
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Console build failed.')));
    });
  }
}

async function existingConsoleMode() {
  const response = await fetch(`http://127.0.0.1:${consolePort}/`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Port ${consolePort} is occupied by an unavailable server.`);
  const html = await response.text();
  if (!html.includes('AdHome')) throw new Error(`Port ${consolePort} is occupied by another application.`);
  return html.includes('/@vite/client') ? 'hot' : 'stable';
}

async function apiReady() {
  try {
    const response = await fetch(new URL('/api/v1/console/auth/me', apiTarget), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    const data = await response.json();
    return response.status === 401 && data.errorCode === 'UNAUTHORIZED';
  } catch { return false; }
}

try {
  if (apiTarget === localApi && await portAvailable(5173)) {
    console.log('Starting local Landing/API on 127.0.0.1:5173...');
    startVite('landing', '127.0.0.1', 5173);
    const deadline = Date.now() + 30000;
    while (!stopping && Date.now() < deadline && !await apiReady()) await delay(250);
  }
  if (!stopping && !await apiReady()) {
    throw new Error('Console authentication API is unavailable. Check PostgreSQL and apps/landing/.env. No password was changed.');
  }
  if (!stopping) {
    console.log('Authentication API ready. Existing account passwords are preserved.');
    if (await portAvailable(consolePort)) {
      if (!hotReload) await buildConsole();
      if (!stopping) startVite('console', '0.0.0.0', consolePort, !hotReload);
    } else {
      const existingMode = await existingConsoleMode();
      if (existingMode !== (hotReload ? 'hot' : 'stable')) {
        throw new Error(`Console port ${consolePort} is already running in ${existingMode} mode. Stop that Console server and rerun this command to switch modes.`);
      }
      console.log(`Console is already running in ${existingMode} mode on port ${consolePort}; reusing it.`);
    }
    console.log(hotReload
      ? 'Live development on port 5175: source edits update the open tab without a build. Some edits or mobile background reconnection can still reload the page; use port 5174 for resume testing.'
      : 'Mobile mode: serving the built Console without Vite HMR. Source changes require restarting this command.');
    console.log(`Console: http://127.0.0.1:${consolePort} (also available over LAN/Tailscale).\nCtrl+C stops only servers started by this launcher.`);
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
