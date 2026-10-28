import {
  BUILDINGS_PUBLIC_SEED,
  GALLERY_PHOTOS_SEED,
  ROOMS_PUBLIC_SEED,
} from '../data/roomsSeed';
import {
  BuildingPublicSummary,
  DataMode,
  GalleryPhotoItem,
  LeadInquiryPayload,
  LeadInquiryResult,
  RoomCatalogResponse,
  RoomListing,
} from '../types/room';

const PUBLIC_API_BASE = import.meta.env.VITE_PUBLIC_API_URL || '/api/v1';
const RECENT_INQUIRY_STORAGE_KEY = 'adhome_recent_inquiries_v3';

export function resolveDataMode(): DataMode {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode')?.toLowerCase();
    if (modeParam === 'demo') return 'DEMO';
    if (modeParam === 'live') return 'LIVE';
  }
  if (import.meta.env.VITE_DATA_MODE?.toLowerCase() === 'demo') {
    return 'DEMO';
  }
  return 'LIVE';
}

export function shouldSimulateApiError(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('simulateApiError') === '1';
}

export function getTodayIsoVn(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatIsoDateDdMmYyyy(isoDate?: string): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function normalizeVnPhone(raw: string): string {
  const cleaned = raw.replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) {
    return '0' + cleaned.slice(3);
  }
  return cleaned;
}

export function validateVnPhone(raw: string): boolean {
  const norm = normalizeVnPhone(raw);
  return /^0(3|5|7|8|9)[0-9]{8}$/.test(norm);
}

export function isDateInPast(isoDate: string): boolean {
  if (!isoDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return true;
  return isoDate < getTodayIsoVn();
}

/**
 * Fetches public room listings with strict DEMO vs LIVE separation:
 * - In LIVE mode (default on production): fetches from Public Listings API (`/api/v1/public/rooms`),
 *   verifies `isPublic === true` and `sourceVerified === true`, and NEVER falls back to seed data on error.
 * - In DEMO mode (explicitly requested via `?mode=demo` or `VITE_DATA_MODE=demo`): returns seed data
 *   explicitly marked with `sourceVerified: false` and `dataMode: 'DEMO'`.
 */
export async function fetchPublicRoomCatalog(): Promise<RoomCatalogResponse> {
  const dataMode = resolveDataMode();

  if (dataMode === 'DEMO') {
    const seedPublic = ROOMS_PUBLIC_SEED.filter(
      (room) =>
        room.isPublic &&
        (room.status === 'AVAILABLE' || room.status === 'COMING_SOON')
    )
      .map((room) => ({
        ...room,
        sourceVerified: false,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return {
      rooms: seedPublic,
      dataMode: 'DEMO',
      sourceVerified: false,
      updatedAt: null,
      isSeedData: true,
      error: null,
    };
  }

  // LIVE MODE: Must come from verified Public Listings API — never fallback to seed data
  try {
    const failParam = shouldSimulateApiError() ? '?fail=1' : '';
    const response = await fetch(`${PUBLIC_API_BASE}/public/rooms${failParam}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.json();
    const rawRooms: RoomListing[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.rooms)
      ? body.rooms
      : [];
    const verified =
      typeof body?.sourceVerified === 'boolean' ? body.sourceVerified : true;
    const updatedAt =
      typeof body?.updatedAt === 'string' ? body.updatedAt : null;

    const publicRooms = rawRooms
      .filter(
        (room) =>
          room &&
          room.isPublic === true &&
          (room.status === 'AVAILABLE' || room.status === 'COMING_SOON')
      )
      .map((room) => ({
        ...room,
        sourceVerified: verified && room.sourceVerified !== false,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return {
      rooms: publicRooms,
      dataMode: 'LIVE',
      sourceVerified: verified,
      updatedAt,
      isSeedData: false,
      error: null,
    };
  } catch {
    return {
      rooms: [],
      dataMode: 'LIVE',
      sourceVerified: false,
      updatedAt: null,
      isSeedData: false,
      error:
        'Không thể kết nối tới hệ thống dữ liệu phòng công khai (Public Listings API) tại thời điểm này. Để đảm bảo tính minh bạch, hệ thống không tự động hiển thị dữ liệu mẫu thay thế. Vui lòng thử tải lại trang hoặc liên hệ trực tiếp bộ phận quản lý.',
    };
  }
}

export function getAvailableRoomsSync(rooms: RoomListing[]): RoomListing[] {
  return rooms
    .filter((room) => room.isPublic && room.status === 'AVAILABLE')
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getComingSoonRoomsSync(rooms: RoomListing[]): RoomListing[] {
  return rooms
    .filter((room) => room.isPublic && room.status === 'COMING_SOON')
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getPublicBuildingsSummary(): BuildingPublicSummary[] {
  return BUILDINGS_PUBLIC_SEED;
}

export function getGalleryPhotos(): GalleryPhotoItem[] {
  return GALLERY_PHOTOS_SEED;
}

export function formatVndPrice(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

interface RecentInquiryFingerprint {
  fingerprint: string;
  referenceCode: string;
  timestamp: number;
}

function getClientInquiryFingerprint(payload: LeadInquiryPayload): string {
  return [
    normalizeVnPhone(payload.phone),
    payload.roomCode || 'GENERAL',
    payload.inquiryType,
  ].join('::');
}

function checkClientDuplicate(
  payload: LeadInquiryPayload
): RecentInquiryFingerprint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(RECENT_INQUIRY_STORAGE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as RecentInquiryFingerprint[];
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const fp = getClientInquiryFingerprint(payload);
    return (
      list.find(
        (item) => item.fingerprint === fp && item.timestamp >= tenMinutesAgo
      ) || null
    );
  } catch {
    return null;
  }
}

function recordClientSubmission(
  payload: LeadInquiryPayload,
  referenceCode: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(RECENT_INQUIRY_STORAGE_KEY);
    const list: RecentInquiryFingerprint[] = raw ? JSON.parse(raw) : [];
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const filtered = list.filter((item) => item.timestamp >= tenMinutesAgo);
    filtered.push({
      fingerprint: getClientInquiryFingerprint(payload),
      referenceCode,
      timestamp: Date.now(),
    });
    window.sessionStorage.setItem(
      RECENT_INQUIRY_STORAGE_KEY,
      JSON.stringify(filtered)
    );
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Submits a rental lead inquiry.
 * - Gate 03 P0 Requirement: NEVER fakes success when backend has not persisted the lead!
 * - Validates honeypot, Vietnamese phone number, non-past move-in date, privacy consent, and duplicate submissions.
 */
export async function submitRentalInquiry(
  payload: LeadInquiryPayload
): Promise<LeadInquiryResult> {
  if (payload.honeypot && payload.honeypot.trim().length > 0) {
    return {
      ok: false,
      errorCode: 'SPAM_DETECTED',
      message: 'Yêu cầu không hợp lệ (phát hiện trường tự động).',
    };
  }

  if (!payload.fullName || payload.fullName.trim().length < 2) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'Vui lòng nhập họ và tên của bạn (tối thiểu 2 ký tự).',
    };
  }

  if (!validateVnPhone(payload.phone)) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message:
        'Số điện thoại chưa đúng định dạng 10 số tại Việt Nam (ví dụ: 0905 889 123).',
    };
  }

  if (payload.preferredMoveInDate && isDateInPast(payload.preferredMoveInDate)) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: 'Ngày dự kiến xem phòng hoặc chuyển vào không được chọn trong quá khứ.',
    };
  }

  if (!payload.privacyConsent) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message:
        'Vui lòng tích chọn đồng ý chính sách bảo mật thông tin liên hệ trước khi gửi.',
    };
  }

  const dataMode = resolveDataMode();
  if (dataMode === 'DEMO') {
    return {
      ok: false,
      errorCode: 'DEMO_MODE_UNSAVED',
      message:
        'Trang đang chạy ở Chế độ Dữ liệu mẫu (Demo Mode) không kết nối máy chủ lưu trữ. Yêu cầu của bạn CHƯA được lưu vào hệ thống — vui lòng liên hệ trực tiếp qua số điện thoại/Zalo 0905 889 123.',
    };
  }

  const clientDup = checkClientDuplicate(payload);
  if (clientDup) {
    return {
      ok: false,
      errorCode: 'DUPLICATE_SUBMISSION',
      referenceCode: clientDup.referenceCode,
      message: `Yêu cầu cho phòng này từ số điện thoại ${normalizeVnPhone(
        payload.phone
      )} vừa được gửi cách đây ít phút (Mã đã lưu: ${
        clientDup.referenceCode
      }). Bạn không cần gửi lại lần nữa.`,
    };
  }

  try {
    const failParam = shouldSimulateApiError() ? '?fail=1' : '';
    const response = await fetch(
      `${PUBLIC_API_BASE}/public/inquiries${failParam}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          fullName: payload.fullName.trim(),
          phone: normalizeVnPhone(payload.phone),
          preferredMoveInDateDisplay: formatIsoDateDdMmYyyy(
            payload.preferredMoveInDate
          ),
          clientTimestamp: Date.now(),
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.ok !== true || !data.referenceCode) {
      return {
        ok: false,
        errorCode: data?.errorCode || 'BACKEND_UNAVAILABLE',
        referenceCode: data?.referenceCode,
        message:
          data?.message ||
          'Hệ thống tiếp nhận yêu cầu trực tuyến hiện đang gián đoạn, thông tin của bạn CHƯA được lưu. Vui lòng thử lại hoặc gọi/nhắn Zalo trực tiếp tới 0905 889 123.',
      };
    }

    recordClientSubmission(payload, data.referenceCode);

    return {
      ok: true,
      referenceCode: data.referenceCode,
      savedAt: data.savedAt,
    };
  } catch {
    return {
      ok: false,
      errorCode: 'BACKEND_UNAVAILABLE',
      message:
        'Không thể kết nối tới máy chủ tiếp nhận yêu cầu. Thông tin của bạn CHƯA được lưu vào hệ thống — vui lòng kiểm tra kết nối mạng hoặc liên hệ trực tiếp qua số 0905 889 123.',
    };
  }
}
