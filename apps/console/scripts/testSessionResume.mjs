import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = ts.transpileModule(
  readFileSync(new URL('../src/app/providers/AuthContext.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

// Exercise the real provider with a minimal hook host, without a DOM dependency.
function mount() {
  const slots = [];
  let cursor = 0;
  let contextValue;
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useCallback: callback => callback,
    useEffect() {},
  };
  const exports = {};
  const requests = [];
  let respond;
  vm.runInNewContext(source, {
    exports,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (_, props) => { contextValue = props.value; } };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: (...args) => { requests.push(args); return respond(...args); },
  });
  return {
    requests,
    response(handler) { respond = handler; },
    render() { cursor = 0; exports.AuthProvider({ children: null }); return contextValue; },
  };
}

const actor = {
  id: 'manager-1', email: 'manager@example.test', role: 'MANAGER', orgId: 'org-1',
  permissions: ['rooms.read', 'buildings.manage'], buildingScopes: ['a', 'b'],
};
const ok = value => ({ ok: true, status: 200, json: async () => ({ ok: true, actor: value }) });

test('resume preserves user identity and scope when permission/scope order changes', async () => {
  const app = mount();
  app.response(async () => ok(actor));
  await app.render().refreshSession();
  const original = app.render().user;
  app.render().setActiveBuildingId('bld-a');
  assert.equal(app.render().activeBuildingId, 'bld-a', JSON.stringify(app.render().user));
  app.response(async () => ok({ ...actor, permissions: [...actor.permissions].reverse(), buildingScopes: ['b', 'a', 'a'] }));
  await app.render().refreshSession();
  assert.equal(app.render().user, original);
  assert.equal(app.render().activeBuildingId, 'bld-a');
  assert.equal(app.requests.at(-1)[1].cache, 'no-store');
});

test('resume keeps verified UI through network, server and malformed-response failures', async () => {
  const app = mount();
  app.response(async () => ok(actor));
  await app.render().refreshSession();
  const original = app.render().user;
  for (const handler of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('invalid JSON'); } }),
    async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) }),
  ]) {
    app.response(handler);
    assert.equal(await app.render().refreshSession(), false);
    assert.equal(app.render().user, original);
  }
});

test('concurrent resume events share a request; actual permission changes still apply', async () => {
  const app = mount();
  let finish;
  app.response(() => new Promise(resolve => { finish = resolve; }));
  const auth = app.render();
  const first = auth.refreshSession();
  assert.equal(auth.refreshSession(), first);
  assert.equal(app.requests.length, 1);
  finish(ok(actor));
  await first;
  const original = app.render().user;
  app.response(async () => ok({ ...actor, permissions: ['rooms.read'], sessionVersion: 2 }));
  await app.render().refreshSession();
  assert.notEqual(app.render().user, original);
  assert.equal(app.render().hasPermission('buildings.manage'), false);
});

test('explicit expiry/revocation clears the session', async () => {
  for (const status of [401, 403]) {
    const app = mount();
    app.response(async () => ok(actor));
    await app.render().refreshSession();
    app.response(async () => ({ ok: false, status }));
    await app.render().refreshSession();
    assert.equal(app.render().isAuthenticated, false);
  }
});
