export type RoomListingStatus = 'AVAILABLE' | 'COMING_SOON' | 'RESERVED' | 'OCCUPIED';

export type RoomTypeCategory =
  | 'Studio'
  | 'Studio Ban Công'
  | '1 Phòng Ngủ'
  | '2PN Mini + PK';

export type FurnishedLevel = 'FULL' | 'BASIC' | 'UNFURNISHED';

export interface RoomImage {
  url: string;
  alt: string;
  caption?: string;
}

export interface RoomListing {
  id: string;
  slug: string;
  roomCode: string;
  title: string;
  roomType: RoomTypeCategory;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  buildingAddress: string;
  floorNumber: number;
  floorName: string;
  area: number; // m2
  price: number; // VND / month
  currency: 'VND';
  depositMonths: number;
  maxOccupants: string; // e.g. "1 - 2 người"
  status: RoomListingStatus;
  availableFrom: string; // ISO date or display string when available
  availableFromLabel: string; // e.g. "Dọn vào ở ngay" or "Dự kiến trống từ 10/11/2026"
  shortDescription: string;
  detailedDescription: string;
  highlightNote?: string; // e.g. "Có thể dọn vào ở ngay", "Chỉ còn 1 phòng"
  amenities: string[];
  furnishedLevel: FurnishedLevel;
  furnishedLabel: string; // e.g. "Full nội thất đồng bộ"
  images: RoomImage[];
  featured: boolean;
  displayOrder: number;
  isPublic: boolean;
  serviceFees: {
    electricity: string;
    water: string;
    wifi: string;
    parking: string;
    management: string;
  };
  lastSyncedFromConsole: string;
}

export interface BuildingPublicSummary {
  id: string;
  code: string;
  name: string;
  streetAddress: string;
  ward: string;
  province: string;
  totalUnits: number;
  availableCount: number;
  comingSoonCount: number;
  floorsCount: number;
  highlights: string[];
}

export interface PortfolioAvailabilitySummary {
  totalBuildings: number;
  totalRooms: number;
  availableCount: number;
  comingSoonCount: number;
  minPrice: number;
  maxPrice: number;
  areaRange: string;
  locationLabel: string;
  lastUpdatedLabel: string;
}

export interface GalleryPhotoItem {
  id: string;
  category: 'STUDIO_1PN' | 'KITCHEN_WORK' | 'BATH_AMENITY' | 'EXTERIOR_AREA';
  categoryLabel: string;
  title: string;
  subtitle: string;
  roomRef?: string;
  imageUrl: string;
  aspect?: 'wide' | 'standard';
}

export interface LeadInquiryPayload {
  fullName: string;
  phone: string;
  inquiryType: 'VIEW_ROOM' | 'HOLD_COMING_SOON' | 'GENERAL_CONSULT';
  roomCode?: string;
  roomTitle?: string;
  preferredMoveInDate?: string;
  occupantCount?: string;
  note?: string;
}
