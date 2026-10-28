import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ROOMS_PUBLIC_SEED } from '../src/data/roomsSeed';
import type { RoomListing } from '../src/types/room';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'verified-public-rooms.json');
const INQUIRIES_FILE = path.join(DATA_DIR, 'public-inquiries.json');

interface StoredRoomsFile {
  sourceVerified: boolean;
  updatedAt: string;
  rooms: RoomListing[];
}

interface StoredInquiryRecord {
  id: string;
  referenceCode: string;
  savedAt: string;
  fullName: string;
  phone: string;
  normalizedPhone: string;
  inquiryType: 'VIEW_ROOM' | 'NOTIFY_COMING_SOON' | 'GENERAL_CONSULT';
  roomId?: string;
  roomSlug?: string;
  roomCode?: string;
  roomTitle?: string;
  preferredMoveInDate?: string;
  preferredMoveInDateDisplay?: string;
  note?: string;
  privacyConsent: boolean;
}

function ensureDataFiles(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ROOMS_FILE)) {
    const initial: StoredRoomsFile = {
      sourceVerified: true,
      updatedAt: new Date().toISOString(),
      rooms: ROOMS_PUBLIC_SEED.map((r) => ({
        ...r,
        sourceVerified: true,
        updatedAt: new Date().toISOString(),
      })),
    };
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
  if (!fs.existsSync(INQUIRIES_FILE)) {
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readRoomsStore(): StoredRoomsFile {
  ensureDataFiles();
  const raw = fs.readFileSync(ROOMS_FILE, 'utf-8');
  return JSON.parse(raw) as StoredRoomsFile;
}

function writeRoomsStore(store: StoredRoomsFile): void {
  ensureDataFiles();
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function readInquiriesStore(): StoredInquiryRecord[] {
  ensureDataFiles();
  const raw = fs.readFileSync(INQUIRIES_FILE, 'utf-8');
  return JSON.parse(raw) as StoredInquiryRecord[];
}

function writeInquiriesStore(records: StoredInquiryRecord[]): void {
  ensureDataFiles();
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

function normalizeVnPhone(raw: string): string {
  const cleaned = raw.replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) {
    return '0' + cleaned.slice(3);
  }
  return cleaned;
}

function isValidVnPhone(raw: string): boolean {
  const norm = normalizeVnPhone(raw);
  return /^0(3|5|7|8|9)[0-9]{8}$/.test(norm);
}

function isPastDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return true;
  const now = new Date();
  const vnTodayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return isoDate < vnTodayStr;
}

function formatIsoToDdMmYyyy(isoDate?: string): string | undefined {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 64 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function createApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/api/v1/public/')) {
      return next();
    }

    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // Simulate API failure when requested for Resilience / Error State E2E testing
    if (
      parsedUrl.searchParams.get('fail') === '1' ||
      req.headers['x-simulate-api-error'] === '1'
    ) {
      return sendJson(res, 503, {
        ok: false,
        errorCode: 'API_ERROR',
        message: 'Public Listings API temporarily unavailable (simulated 503).',
      });
    }

    // 1. GET /api/v1/public/rooms
    if (req.method === 'GET' && pathname === '/api/v1/public/rooms') {
      const store = readRoomsStore();
      const publicRooms = store.rooms
        .filter(
          (room) =>
            room.isPublic === true &&
            (room.status === 'AVAILABLE' || room.status === 'COMING_SOON')
        )
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return sendJson(res, 200, {
        ok: true,
        sourceVerified: store.sourceVerified,
        updatedAt: store.updatedAt,
        rooms: publicRooms,
      });
    }

    // 2. GET /api/v1/public/rooms/:slug
    if (req.method === 'GET' && pathname.startsWith('/api/v1/public/rooms/')) {
      const slug = decodeURIComponent(
        pathname.slice('/api/v1/public/rooms/'.length)
      );
      const store = readRoomsStore();
      const room = store.rooms.find(
        (r) =>
          (r.slug === slug || r.id === slug) &&
          r.isPublic === true &&
          (r.status === 'AVAILABLE' || r.status === 'COMING_SOON')
      );

      if (!room) {
        return sendJson(res, 404, {
          ok: false,
          message: 'Không tìm thấy phòng công khai hoặc phòng đã ngừng nhận khách.',
        });
      }

      return sendJson(res, 200, {
        ok: true,
        sourceVerified: store.sourceVerified,
        updatedAt: room.updatedAt || store.updatedAt,
        room,
      });
    }

    // 3. PATCH /api/v1/public/rooms/:slug (Console sync support: price, images, status, availableFrom)
    if (
      req.method === 'PATCH' &&
      pathname.startsWith('/api/v1/public/rooms/')
    ) {
      try {
        const slug = decodeURIComponent(
          pathname.slice('/api/v1/public/rooms/'.length)
        );
        const body = await readJsonBody(req);
        const store = readRoomsStore();
        const idx = store.rooms.findIndex(
          (r) => r.slug === slug || r.id === slug || r.roomCode === slug
        );
        if (idx === -1) {
          return sendJson(res, 404, {
            ok: false,
            message: 'Room not found in public store.',
          });
        }

        const current = store.rooms[idx];
        const nowIso = new Date().toISOString();

        const updated: RoomListing = {
          ...current,
          price:
            typeof body.price === 'number' && body.price > 0
              ? body.price
              : current.price,
          status:
            typeof body.status === 'string' &&
            ['AVAILABLE', 'COMING_SOON', 'RESERVED', 'OCCUPIED'].includes(
              body.status
            )
              ? (body.status as RoomListing['status'])
              : current.status,
          availableFrom:
            typeof body.availableFrom === 'string'
              ? body.availableFrom
              : current.availableFrom,
          availableFromLabel:
            typeof body.availableFromLabel === 'string'
              ? body.availableFromLabel
              : typeof body.availableFrom === 'string' &&
                body.status === 'COMING_SOON'
              ? `Dự kiến sau ${formatIsoToDdMmYyyy(body.availableFrom)}`
              : body.status === 'AVAILABLE'
              ? 'Đang trống'
              : current.availableFromLabel,
          images: Array.isArray(body.images)
            ? (body.images as RoomListing['images'])
            : current.images,
          isPublic:
            typeof body.isPublic === 'boolean'
              ? body.isPublic
              : current.isPublic,
          sourceVerified: true,
          updatedAt: nowIso,
        };

        store.rooms[idx] = updated;
        store.updatedAt = nowIso;
        writeRoomsStore(store);

        return sendJson(res, 200, {
          ok: true,
          updatedAt: nowIso,
          room: updated,
        });
      } catch {
        return sendJson(res, 400, {
          ok: false,
          message: 'Invalid room update payload.',
        });
      }
    }

    // 4. POST /api/v1/public/inquiries (Lead Persistence with Validation & Anti-Spam/Deduplication)
    if (req.method === 'POST' && pathname === '/api/v1/public/inquiries') {
      try {
        const body = await readJsonBody(req);
        const honeypot = String(body.honeypot || '').trim();
        if (honeypot.length > 0) {
          return sendJson(res, 400, {
            ok: false,
            errorCode: 'SPAM_DETECTED',
            message: 'Yêu cầu bị từ chối do phát hiện dấu hiệu tự động (spam).',
          });
        }

        const fullName = String(body.fullName || '').trim();
        const phone = String(body.phone || '').trim();
        const inquiryType = String(
          body.inquiryType || 'GENERAL_CONSULT'
        ) as StoredInquiryRecord['inquiryType'];
        const roomId = body.roomId ? String(body.roomId).trim() : undefined;
        const roomSlug = body.roomSlug ? String(body.roomSlug).trim() : undefined;
        const roomCode = body.roomCode ? String(body.roomCode).trim() : undefined;
        const roomTitle = body.roomTitle
          ? String(body.roomTitle).trim()
          : undefined;
        const preferredMoveInDate = body.preferredMoveInDate
          ? String(body.preferredMoveInDate).trim()
          : undefined;
        const note = body.note ? String(body.note).trim() : undefined;
        const privacyConsent = Boolean(body.privacyConsent);

        if (fullName.length < 2) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).',
          });
        }

        if (!isValidVnPhone(phone)) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Số điện thoại không đúng định dạng Việt Nam (ví dụ: 0905889123 hoặc +84905889123).',
          });
        }

        if (preferredMoveInDate && isPastDate(preferredMoveInDate)) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'Ngày dự kiến xem phòng / chuyển vào không được nằm trong quá khứ.',
          });
        }

        if (!privacyConsent) {
          return sendJson(res, 422, {
            ok: false,
            errorCode: 'VALIDATION_ERROR',
            message:
              'Vui lòng xác nhận đồng ý để AdHome sử dụng thông tin liên hệ tư vấn phòng.',
          });
        }

        const normalizedPhone = normalizeVnPhone(phone);
        const existingInquiries = readInquiriesStore();
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

        const duplicate = existingInquiries.find((item) => {
          const itemTime = new Date(item.savedAt).getTime();
          return (
            itemTime >= tenMinutesAgo &&
            item.normalizedPhone === normalizedPhone &&
            (item.roomCode || '') === (roomCode || '') &&
            item.inquiryType === inquiryType
          );
        });

        if (duplicate) {
          return sendJson(res, 409, {
            ok: false,
            errorCode: 'DUPLICATE_SUBMISSION',
            referenceCode: duplicate.referenceCode,
            message: `Yêu cầu của số điện thoại ${normalizedPhone} cho ${
              roomCode ? `phòng ${roomCode}` : 'nhu cầu này'
            } đã được hệ thống ghi nhận trước đó (Mã: ${
              duplicate.referenceCode
            }). Bộ phận quản lý sẽ sớm liên hệ với bạn.`,
          });
        }

        const nowIso = new Date().toISOString();
        const seq = String(existingInquiries.length + 101).padStart(4, '0');
        const referenceCode = `ADH-${seq}`;

        const newRecord: StoredInquiryRecord = {
          id: `inq-${Date.now()}-${seq}`,
          referenceCode,
          savedAt: nowIso,
          fullName,
          phone,
          normalizedPhone,
          inquiryType,
          roomId,
          roomSlug,
          roomCode,
          roomTitle,
          preferredMoveInDate,
          preferredMoveInDateDisplay: formatIsoToDdMmYyyy(preferredMoveInDate),
          note,
          privacyConsent,
        };

        existingInquiries.push(newRecord);
        writeInquiriesStore(existingInquiries);

        return sendJson(res, 201, {
          ok: true,
          referenceCode: newRecord.referenceCode,
          savedAt: newRecord.savedAt,
        });
      } catch {
        return sendJson(res, 500, {
          ok: false,
          errorCode: 'API_ERROR',
          message: 'Không thể lưu yêu cầu vào hệ thống tại thời điểm này.',
        });
      }
    }

    // 5. GET /api/v1/public/inquiries (For E2E verification of persisted leads)
    if (req.method === 'GET' && pathname === '/api/v1/public/inquiries') {
      const inquiries = readInquiriesStore();
      return sendJson(res, 200, {
        ok: true,
        count: inquiries.length,
        inquiries,
      });
    }

    return sendJson(res, 404, {
      ok: false,
      message: 'Public API endpoint not found.',
    });
  };
}

export function adhomePublicApiPlugin(): Plugin {
  return {
    name: 'adhome-public-api-plugin',
    buildStart() {
      ensureDataFiles();
    },
    configureServer(server) {
      ensureDataFiles();
      server.middlewares.use(createApiMiddleware());
    },
    configurePreviewServer(server) {
      ensureDataFiles();
      server.middlewares.use(createApiMiddleware());
    },
  };
}
