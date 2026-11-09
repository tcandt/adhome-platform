import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Prisma, type PrismaClient } from '@prisma/client';
import { actorHasPermission, isBuildingAllowedForActor, type AuthoritativeConsoleActor } from './authRbac';

export type RoomImageMeta = { id: string; mimeType: string; alt: string; size: number };
const root = path.resolve(process.env.ADH_ROOM_IMAGE_DIR || 'uploads/room-images');
const maxBytes = 8 * 1024 * 1024;
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const imagePath = (roomId: string, image: RoomImageMeta) => path.join(root, roomId, `${image.id}.${mimeExtensions[image.mimeType]}`);
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
export const roomImages = (value: unknown): RoomImageMeta[] => Array.isArray(value) ? value.filter((item): item is RoomImageMeta =>
  !!item && typeof item.id === 'string' && /^[0-9a-f-]{36}$/.test(item.id) && !!mimeExtensions[item.mimeType] && typeof item.alt === 'string' && typeof item.size === 'number') : [];
export const publicRoomImages = (roomId: string, value: unknown) => roomImages(value).map(image => ({
  url: `/api/v1/public/room-images/${roomId}/${image.id}`,
  alt: image.alt,
  caption: image.alt,
}));
const validImage = (buffer: Buffer, mimeType: string) => mimeType === 'image/jpeg'
  ? buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
  : mimeType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  : mimeType === 'image/webp' ? buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' : false;

async function serveImage(res: ServerResponse, roomId: string, image: RoomImageMeta, isPublic: boolean) {
  try {
    const body = await fs.readFile(imagePath(roomId, image));
    res.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': isPublic ? 'public, max-age=60' : 'private, no-store' });
    res.end(body);
  } catch { send(res, 404, { ok: false, message: 'Không tìm thấy ảnh.' }); }
}

export async function handlePublicRoomImage(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/public\/room-images\/([A-Za-z0-9-]{1,80})\/([0-9a-f-]{36})$/);
  if (!match) return false;
  if (req.method !== 'GET') { send(res, 405, { ok: false, message: 'Chỉ hỗ trợ xem ảnh.' }); return true; }
  const room = await prisma.consoleRoom.findUnique({ where: { id: match[1] }, select: { id: true, images: true, isPublishedToLanding: true, publicListing: { select: { isPublic: true } } } });
  const image = roomImages(room?.images).find(item => item.id === match[2]);
  if (!room?.isPublishedToLanding || !room.publicListing?.isPublic || !image) { send(res, 404, { ok: false, message: 'Không tìm thấy ảnh.' }); return true; }
  await serveImage(res, room.id, image, true);
  return true;
}

export async function handleConsoleRoomImages(req: IncomingMessage, res: ServerResponse, pathname: string, prisma: PrismaClient, actor: AuthoritativeConsoleActor): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/rooms\/([A-Za-z0-9-]{1,80})\/images(?:\/([0-9a-f-]{36}))?$/);
  if (!match) return false;
  const [roomId, imageId] = [match[1], match[2]];
  const room = await prisma.consoleRoom.findFirst({ where: { id: roomId, orgId: actor.orgId }, include: { building: { select: { id: true, code: true } } } });
  if (!room || !isBuildingAllowedForActor(actor, room.buildingId, room.building.code)) { send(res, 404, { ok: false, message: 'Không tìm thấy phòng.' }); return true; }
  const canWrite = actorHasPermission(actor, 'rooms.manage');
  if (req.method === 'GET' && imageId) {
    if (!actorHasPermission(actor, 'rooms.read') && !canWrite) { send(res, 403, { ok: false, message: 'Không có quyền xem ảnh.' }); return true; }
    const image = roomImages(room.images).find(item => item.id === imageId);
    if (!image) send(res, 404, { ok: false, message: 'Không tìm thấy ảnh.' }); else await serveImage(res, roomId, image, false);
    return true;
  }
  if (!canWrite) { send(res, 403, { ok: false, message: 'Không có quyền sửa album.' }); return true; }
  if (req.method === 'POST' && !imageId) {
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!mimeExtensions[mimeType]) { send(res, 415, { ok: false, message: 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.' }); return true; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > maxBytes) { send(res, 413, { ok: false, message: 'Ảnh vượt quá 8 MB.' }); return true; } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    if (!validImage(bytes, mimeType)) { send(res, 422, { ok: false, message: 'Tệp ảnh không hợp lệ.' }); return true; }
    const image: RoomImageMeta = { id: crypto.randomUUID(), mimeType, alt: room.title, size };
    const filename = imagePath(roomId, image);
    try {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, bytes, { flag: 'wx' });
      const images = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT id FROM console_rooms WHERE id = ${roomId} FOR UPDATE`;
        const latest = await tx.consoleRoom.findUniqueOrThrow({ where: { id: roomId } });
        const next = [...roomImages(latest.images), image];
        if (next.length > 12) throw Object.assign(new Error('Album tối đa 12 ảnh.'), { statusCode: 422 });
        await tx.consoleRoom.update({ where: { id: roomId }, data: { images: next as Prisma.InputJsonValue } });
        if (latest.publicListingId) {
          await tx.publicRoomListing.update({ where: { id: latest.publicListingId }, data: { images: publicRoomImages(roomId, next) as Prisma.InputJsonValue } });
          await tx.organization.update({ where: { id: actor.orgId }, data: { catalogVersion: { increment: 1 } } });
        }
        return next;
      });
      send(res, 201, { ok: true, images });
    } catch (error: any) {
      await fs.rm(filename, { force: true });
      send(res, error.statusCode || 500, { ok: false, message: error.statusCode ? error.message : 'Không lưu được ảnh. Vui lòng thử lại.' });
    }
    return true;
  }
  if (req.method === 'DELETE' && imageId) {
    const image = roomImages(room.images).find(item => item.id === imageId);
    if (!image) { send(res, 404, { ok: false, message: 'Không tìm thấy ảnh.' }); return true; }
    try {
      const images = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT id FROM console_rooms WHERE id = ${roomId} FOR UPDATE`;
        const latest = await tx.consoleRoom.findUniqueOrThrow({ where: { id: roomId } });
        const next = roomImages(latest.images).filter(item => item.id !== imageId);
        await tx.consoleRoom.update({ where: { id: roomId }, data: { images: next as Prisma.InputJsonValue } });
        if (latest.publicListingId) {
          await tx.publicRoomListing.update({ where: { id: latest.publicListingId }, data: { images: publicRoomImages(roomId, next) as Prisma.InputJsonValue } });
          await tx.organization.update({ where: { id: actor.orgId }, data: { catalogVersion: { increment: 1 } } });
        }
        return next;
      });
      await fs.rm(imagePath(roomId, image), { force: true });
      send(res, 200, { ok: true, images });
    } catch { send(res, 500, { ok: false, message: 'Không xóa được ảnh. Vui lòng thử lại.' }); }
    return true;
  }
  send(res, 405, { ok: false, message: 'Phương thức không được hỗ trợ.' });
  return true;
}
