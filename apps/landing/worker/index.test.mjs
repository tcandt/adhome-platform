import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import worker from './index.mjs';

test('landing room API uses Console API while inquiries keep existing upstream', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return Response.json({ ok: true });
  };
  try {
    const env = {
      PUBLIC_API_ORIGIN: 'https://api.adhome.vn',
      PUBLIC_ROOMS_API_ORIGIN: 'https://console-api.adhome.vn',
    };
    const rooms = await worker.fetch(new Request('https://adhome.vn/api/v1/public/rooms?orgId=test'), env);
    const photo = await worker.fetch(new Request('https://adhome.vn/api/v1/public/room-images/room-1/00000000-0000-0000-0000-000000000001'), env);
    const inquiry = await worker.fetch(new Request('https://adhome.vn/api/v1/public/inquiries', { method: 'POST', body: '{}' }), env);
    assert.equal(rooms.status, 200);
    assert.equal(photo.status, 200);
    assert.equal(inquiry.status, 200);
    assert.deepEqual(requested, [
      'https://console-api.adhome.vn/api/v1/public/rooms?orgId=test',
      'https://console-api.adhome.vn/api/v1/public/room-images/room-1/00000000-0000-0000-0000-000000000001',
      'https://api.adhome.vn/api/v1/public/inquiries',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
