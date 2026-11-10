import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const dir = await mkdtemp(join(tmpdir(), 'adhome-room-images-test-'));
process.env.ADH_ROOM_IMAGE_DIR = dir;
const output = resolve('apps/landing/node_modules/.cache/room-images-test.cjs');
await build({ entryPoints: ['apps/landing/server/roomImagesApi.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handleConsoleRoomImages, handlePublicRoomImage } = require(output);
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const room = { id: 'room-qa', orgId: 'org-qa', buildingId: 'building-qa', title: 'Phòng thử', images: [], publicListingId: 'pub-qa', isPublishedToLanding: true, building: { id: 'building-qa', code: 'QA' }, publicListing: { isPublic: true } };
const listing = { id: 'pub-qa', images: [] };
const prisma = {
  consoleRoom: { findFirst: async () => room, findUnique: async () => room, findUniqueOrThrow: async () => room, update: async ({ data }) => Object.assign(room, data) },
  publicRoomListing: { update: async ({ data }) => Object.assign(listing, data) },
  organization: { update: async () => ({}) },
  $executeRaw: async () => 0,
  $transaction: async fn => fn(prisma),
};
const actor = { id: 'qa', orgId: 'org-qa', role: 'ADMIN', buildingScopes: ['*'], permissions: ['rooms.manage', 'rooms.read'] };
async function call(handler, method, pathname, body = Buffer.alloc(0)) {
  const req = Readable.from(body.length ? [body] : []);
  req.method = method; req.headers = { 'content-type': 'image/png' };
  const res = { statusCode: 200, headers: {}, writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(payload) { this.payload = payload; } };
  const handled = handler === handleConsoleRoomImages ? await handler(req, res, pathname, prisma, actor) : await handler(req, res, pathname, prisma);
  assert.equal(handled, true);
  return res;
}
try {
  const base = '/api/v1/console/v2/rooms/room-qa/images';
  const uploaded = await call(handleConsoleRoomImages, 'POST', base, image);
  assert.equal(uploaded.statusCode, 201, uploaded.payload?.toString());
  assert.equal(room.images.length, 1);
  assert.equal(listing.images.length, 1);
  assert.equal(listing.images[0].url, `/api/v1/public/room-images/room-qa/${room.images[0].id}`);
  const publicUrl = listing.images[0].url;
  const publicImage = await call(handlePublicRoomImage, 'GET', publicUrl);
  assert.equal(publicImage.statusCode, 200);
  assert.deepEqual(publicImage.payload, image, 'public view serves the original image bytes');
  room.isPublishedToLanding = false;
  assert.equal((await call(handlePublicRoomImage, 'GET', publicUrl)).statusCode, 404, 'hidden room images stay private');
  room.isPublishedToLanding = true;
  const removed = await call(handleConsoleRoomImages, 'DELETE', `${base}/${room.images[0].id}`);
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(room.images, []);
  assert.deepEqual(listing.images, []);
  console.log('PASS room album: upload, exact original, publication privacy, landing sync, deletion');
} finally { await rm(dir, { recursive: true, force: true }); }
