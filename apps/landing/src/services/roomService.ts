import {
  BUILDINGS_PUBLIC_SEED,
  GALLERY_PHOTOS_SEED,
  ROOMS_PUBLIC_SEED,
} from '../data/roomsSeed';
import {
  BuildingPublicSummary,
  GalleryPhotoItem,
  LeadInquiryPayload,
  RoomCatalogResponse,
  RoomListing,
} from '../types/room';

const PUBLIC_API_BASE = import.meta.env.VITE_PUBLIC_API_URL || '';

/**
 * Fetches public room listings.
 * - Filters out any room where `isPublic === false` or `status === 'OCCUPIED'`.
 * - Requirement 8 compliance: If `VITE_PUBLIC_API_URL` is configured on production
 *   and fails, returns an explicit error state rather than silently falling back to demo seed data.
 */
export async function fetchPublicRoomCatalog(): Promise<RoomCatalogResponse> {
  if (PUBLIC_API_BASE) {
    try {
      const response = await fetch(`${PUBLIC_API_BASE}/public/rooms`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: RoomListing[] = await response.json();
      const publicRooms = data
        .filter((room) => room.isPublic && room.status !== 'OCCUPIED')
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return {
        rooms: publicRooms,
        isSeedData: false,
        error: null,
      };
    } catch {
      return {
        rooms: [],
        isSeedData: false,
        error:
          'Không thể tải danh sách phòng từ hệ thống quản lý tại thời điểm này. Vui lòng thử lại hoặc liên hệ trực tiếp để được hỗ trợ.',
      };
    }
  }

  // Local / preview dataset when Console public API URL is not yet attached
  const seedPublic = ROOMS_PUBLIC_SEED.filter(
    (room) => room.isPublic && room.status !== 'OCCUPIED'
  ).sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    rooms: seedPublic,
    isSeedData: true,
    error: null,
  };
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

export async function submitRentalInquiry(
  payload: LeadInquiryPayload
): Promise<{ ok: boolean; referenceCode: string }> {
  if (PUBLIC_API_BASE) {
    const response = await fetch(`${PUBLIC_API_BASE}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('Failed to submit inquiry');
    }
    return await response.json();
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return {
    ok: true,
    referenceCode: `ADH-${randomSuffix}`,
  };
}
