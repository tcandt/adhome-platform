import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9400 + Math.floor(Math.random() * 400);
const output = path.resolve('docs/evidence/invoice-mobile-redesign.png');
const profile = path.resolve(`.tmp-invoice-chrome-${Date.now()}`);
fs.mkdirSync(path.dirname(output), { recursive: true });

const vite = spawn('cmd.exe', ['/c', 'pnpm --filter @adhome/console dev --host 127.0.0.1'], {
  cwd: process.cwd(), stdio: 'ignore', windowsHide: true,
});
for (let i = 0; i < 40; i += 1) {
  try { if ((await fetch('http://127.0.0.1:5174/')).ok) break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let i = 0; i < 30; i += 1) {
  try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
  await wait(200);
}

const target = await (await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:5174/?module=invoices`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const msg = JSON.parse(data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise((resolve) => { const callId = ++id; pending.set(callId, resolve); ws.send(JSON.stringify({ id: callId, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const invoices = [
  { id:'inv-1', invoiceCode:'INV-HD-P25-02-7F293215', buildingCode:'LK08-25', roomCode:'P25-02', tenantName:'Ngô Tú Vũ', dueDate:'2026-11-08', totalAmountVnd:12450000, paidAmountVnd:0, status:'ISSUED', periodKey:'2026-11' },
  { id:'inv-2', invoiceCode:'INV-HD-P25-01-D9A1591A', buildingCode:'LK08-25', roomCode:'P25-01', tenantName:'Nguyễn Đức Tính', dueDate:'2026-11-06', totalAmountVnd:14166667, paidAmountVnd:14166667, status:'PAID', periodKey:'2026-11' },
];
const actor = { id:'preview', displayName:'HT', email:'preview@adhome.vn', role:'ADMIN', orgId:'org-preview', orgName:'AdHome', permissions:['system.admin'], buildingScopes:['*'], sessionVersion:1 };
const bootstrap = { ok:true, organization:{ id:'org-preview', name:'AdHome' }, buildings:[], rooms:[], tenants:[], kpis:{}, recentLeads:[], notifications:{items:[],unreadCount:0}, moduleCounts:{invoicesUnpaid:1}, syncedAt:new Date().toISOString() };
const injection = `(() => { const original=window.fetch.bind(window); const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})); window.fetch=(input,init)=>{ const u=typeof input==='string'?input:input.url; if(u.includes('/auth/me')) return json({ok:true,actor:${JSON.stringify(actor)}}); if(u.includes('/v2/bootstrap')) return json(${JSON.stringify(bootstrap)}); if(u.includes('/v2/module-data')) return json({ok:true,invoices:${JSON.stringify(invoices)}}); return original(input,init); }; sessionStorage.setItem('adhome_v2_active_module','invoices'); })();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
await send('Page.navigate', { url:'http://127.0.0.1:5174/?module=invoices' });
for (let i = 0; i < 40; i += 1) {
  const ready = await send('Runtime.evaluate', { expression: "Boolean(document.querySelector('[data-testid^=invoice-card-]'))", returnByValue: true });
  if (ready?.result?.value) break;
  await wait(250);
}
await wait(2200);
const shot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false, fromSurface:true });
fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
ws.close(); proc.kill(); vite.kill();
console.log(output);
