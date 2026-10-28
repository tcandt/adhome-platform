export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'HELD' | 'MAINTENANCE' | 'ARCHIVED';
export type BuildingStatus = 'ACTIVE' | 'ARCHIVED' | 'MAINTENANCE';
export type BuildingType = 'SERVICED_APARTMENT' | 'MINI_CONDO' | 'CO_LIVING' | 'TRADITIONAL_RENTAL' | 'SHOPHOUSE' | 'MINI_HOTEL' | 'BOARDING_HOUSE' | 'COMMERCIAL';

export interface TenantInfo {
  name: string;
  phone: string;
  checkInDate: string;
  contractEnd: string;
  depositAmount: number;
  debtAmount: number;
  registrationStatus: 'COMPLETED' | 'INCOMPLETE';
}

export interface MeterStatus {
  electricMeterId: string;
  electricLastKwh: number;
  waterLastM3: number;
  hunonicOnline: boolean;
  lastSynced: string;
}

export type RoomCategoryType = 'Studio' | '1PN' | '2PN' | '3PN' | 'Duplex' | 'Penthouse' | 'Căn 2PN mini + PK' | 'Studio view ban công' | string;

export interface Room {
  id: string; // Stable UUID
  organizationId: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  floor: number; // e.g. 0 = Ground/Trệt, 1 = Floor 1, -1 = B1
  floorName: string;
  code: string; // e.g. 101, 31-04, Studio-A
  type: RoomCategoryType;
  area: number; // m²
  price: number; // VND/month
  status: RoomStatus;
  amenities?: string[];
  currentTenant?: TenantInfo;
  meterStatus: MeterStatus;
  hasExpiringContract?: boolean;
  hasDebtWarning?: boolean;
  isIncompleteRegistration?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Floor {
  floor: number;
  floorName: string;
  roomCount: number;
  rooms: string[]; // room codes or IDs
  svgLayoutUrl?: string;
}

export interface Building {
  id: string; // Stable UUID
  organizationId: string;
  code: string; // Unique per organization (e.g. BLD-01, LK01-31, SUNSHINE)
  name: string;
  shortCode: string;
  address: string;
  ward: string;
  city: string;
  buildingType?: BuildingType;
  type?: BuildingType;
  description?: string;
  status: BuildingStatus;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  heldRooms: number;
  maintenanceRooms: number;
  monthlyRevenue: number;
  collectionRate: number; // %
  floorsCount: number;
  managerName: string;
  managerPhone?: string;
  hunonicGatewayStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  floorsSummary: Floor[];
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
}

// Data Transfer Objects for Dynamic CRUD
export interface CreateBuildingDto {
  code: string;
  name: string;
  address: string;
  ward: string;
  city: string;
  buildingType?: BuildingType;
  type?: BuildingType;
  description?: string;
  managerName: string;
  managerPhone?: string;
  initialFloors?: number;
  initialFloorsCount?: number;
}

export interface UpdateBuildingDto {
  name?: string;
  code?: string;
  address?: string;
  ward?: string;
  city?: string;
  buildingType?: BuildingType;
  type?: BuildingType;
  description?: string;
  managerName?: string;
  managerPhone?: string;
  status?: BuildingStatus;
}

export interface CreateFloorDto {
  buildingId: string;
  floor: number;
  floorName: string;
}

export interface CreateRoomDto {
  buildingId: string;
  floor: number;
  code: string;
  type: RoomCategoryType;
  area: number;
  price: number;
  status?: RoomStatus;
  electricMeterId?: string;
}

export interface BatchCreateRoomsDto {
  buildingId: string;
  floor: number;
  count: number;
  prefix: string; // e.g. "20"
  startNumber: number; // e.g. 1 -> 201, 202...
  type: RoomCategoryType;
  area: number;
  price: number;
}

export interface UpdateRoomDto {
  code?: string;
  floor?: number;
  type?: RoomCategoryType;
  area?: number;
  price?: number;
  status?: RoomStatus;
  electricMeterId?: string;
  waterMeterM3?: number;
}

export interface DeleteSafetyReport {
  canDeletePermanently: boolean;
  activeContractsCount: number;
  overdueDebtAmount: number;
  pendingInvoicesCount: number;
  canArchiveInstead: boolean;
  blockReason?: string;
  blockingReasons?: string[];
}
