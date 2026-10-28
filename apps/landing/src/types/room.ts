export type RoomListingStatus = 'AVAILABLE' | 'COMING_SOON' | 'RESERVED' | 'OCCUPIED';

export type DataMode = 'LIVE' | 'DEMO';

export type RoomTypeCategory =
  | 'Studio'
  | 'Studio Ban Công'
  | '1 Phòng Ngủ'
  | '2PN Mini + PK';

export type FurnishedLevel = 'FULL' | 'BASIC' | 'UNFURNISHED';

export interface RoomImage {
  url: string;
  srcSet?: string;
  width?: number;
  height?: number;
  alt: string;
  caption?: string;
  isIllustrative?: boolean; // True when using illustrative/AI reference photography instead of verified unit photo
}

export interface RoomListing {
  id: string;
  slug: string;
  roomCode: string;
  shortTitle: string; // Concise card title e.g. "Phòng 31-06 · Studio Ban Công"
  title: string;      // Full descriptive title for detail view
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
  maxOccupants: string;
  status: RoomListingStatus;
  availableFrom: string; // ISO YYYY-MM-DD
  availableFromLabel: string; // Display label with DD/MM/YYYY
  shortDescription: string;
  detailedDescription: string;
  amenities: string[];
  furnishedLevel: FurnishedLevel;
  furnishedLabel: string;
  images: RoomImage[];
  featured: boolean;
  displayOrder: number;
  isPublic: boolean;
  sourceVerified?: boolean;
  updatedAt?: string;
  serviceFees: {
    electricity: string;
    water: string;
    wifi: string;
    parking: string;
  };
}

export interface BuildingPublicSummary {
  id: string;
  code: string;
  name: string;
  streetAddress: string;
  ward: string;
  province: string;
}

export interface GalleryPhotoItem {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  srcSet?: string;
  width?: number;
  height?: number;
  isIllustrative: boolean;
}

export interface LeadInquiryPayload {
  fullName: string;
  phone: string;
  inquiryType: 'VIEW_ROOM' | 'NOTIFY_COMING_SOON' | 'GENERAL_CONSULT';
  roomId?: string;
  roomSlug?: string;
  roomCode?: string;
  roomTitle?: string;
  preferredMoveInDate?: string; // ISO YYYY-MM-DD
  preferredMoveInDateDisplay?: string; // DD/MM/YYYY
  note?: string;
  privacyConsent: boolean;
  honeypot?: string;
  clientTimestamp?: number;
}

export type LeadInquiryErrorCode =
  | 'DEMO_MODE_UNSAVED'
  | 'BACKEND_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_SUBMISSION'
  | 'SPAM_DETECTED'
  | 'API_ERROR';

export interface LeadInquiryResult {
  ok: boolean;
  referenceCode?: string;
  savedAt?: string;
  errorCode?: LeadInquiryErrorCode;
  message?: string;
}

export interface RoomCatalogResponse {
  rooms: RoomListing[];
  dataMode: DataMode;
  sourceVerified: boolean;
  updatedAt: string | null;
  isSeedData: boolean;
  error: string | null;
}
