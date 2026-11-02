import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
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

for (const port of [5173, 5174]) {
  const available = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
  if (!available) {
    console.error(`Port ${port} is already in use. If AdHome is running, open http://127.0.0.1:5174. Stop existing dev servers before restarting.`);
    process.exit(1);
  }
}

for (const [app, port] of [['landing', 5173], ['console', 5174]]) {
  const cwd = fileURLToPath(new URL(`../apps/${app}/`, import.meta.url));
  const require = createRequire(new URL(`../apps/${app}/package.json`, import.meta.url));
  const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      TRUST_PROXY: 'false',
      ADHOME_API_TARGET: 'http://127.0.0.1:5173',
    },
    windowsHide: true,
  });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}

console.log(`AdHome local (${root})\nLanding/API: http://127.0.0.1:5173\nConsole: http://127.0.0.1:5174\nCtrl+C stops both servers.`);
