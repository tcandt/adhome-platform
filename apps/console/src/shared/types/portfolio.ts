export type OccupancyStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED'
  | 'MAINTENANCE'
  | 'ARCHIVED';

export type BuildingStatus = 'ACTIVE' | 'ARCHIVED';

export type BuildingType =
  | 'SERVICED_APARTMENT'
  | 'MINI_CONDO'
  | 'CO_LIVING'
  | 'TRADITIONAL_RENTAL'
  | 'SHOPHOUSE'
  | 'MINI_HOTEL'
  | 'BOARDING_HOUSE'
  | 'COMMERCIAL';

export type WaterBillingMethod = 'PER_M3' | 'PER_PERSON' | 'FIXED_PER_ROOM';

export type MeterConnectionStatus =
  | 'UNCONFIGURED'
  | 'ONLINE'
  | 'OFFLINE'
  | 'STALE';

export interface ConsoleOrganizationDto {
  id: string;
  slug: string;
  name: string;
  hotline: string;
  contactEmail: string;
  addressSummary: string;
  timezone: string;
  defaultElectricRateVnd: number;
  defaultWaterMethod: WaterBillingMethod | string;
  defaultWaterRateVnd: number;
  defaultDepositMonths: number;
  catalogVersion: number;
}

export interface ConsoleFloorDto {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  roomCount: number;
}

export interface ConsoleBuildingDto {
  id: string;
  code: string;
  name: string;
  streetAddress: string;
  ward: string;
  province: string;
  buildingType: BuildingType | string;
  status: BuildingStatus | string;
  isActive: boolean;
  description: string;
  managerName: string;
  managerPhone: string;
  electricRateVnd: number;
  waterBillingMethod: WaterBillingMethod | string;
  waterRateVnd: number;
  floors: ConsoleFloorDto[];
  stats: {
    floorsCount: number;
    totalRooms: number;
    availableRooms: number;
    reservedRooms: number;
    occupiedRooms: number;
    maintenanceRooms: number;
    publishedRooms: number;
    contractedMonthlyVnd: number;
  };
}

export interface ConsoleRoomDto {
  id: string;
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  floorId: string;
  floorNumber: number;
  floorName: string;
  code: string;
  title: string;
  roomType: string;
  area: number;
  listPriceVnd: number;
  depositMonths: number;
  maxOccupants: number;
  occupancyStatus: OccupancyStatus;
  furnishedLevel: 'FULL' | 'BASIC' | 'UNFURNISHED' | string;
  amenities: string[];
  availableFrom: string;
  waterBillingMethod: WaterBillingMethod | string | null;
  waterRateVnd: number | null;
  electricBillingMode?: 'MANUAL' | 'HUNONIC_AUTO' | string;
  electricRateVnd: number | null;
  effectiveWaterMethod: WaterBillingMethod | string;
  effectiveWaterRateVnd: number;
  effectiveElectricRateVnd: number;
  electricMeter?: {
    id: string;
    hunonicDeviceId: string | null;
    meterSerial: string | null;
    meterMode?: string;
    meterType?: string;
    tariffMode?: string;
    tariffRateVnd?: number | null;
    connectionStatus?: string;
    cumulativeKwh?: number | null;
    instantPowerW?: number | null;
    lastSyncedAt?: string | null;
  } | null;
  isPublishedToLanding: boolean;
  publicSlug: string | null;
  internalNotes: string;
  meterStatus: MeterConnectionStatus;
  meterLastSyncedAt: string | null;
  currentTenant: {
    id: string;
    fullName: string;
    phone: string;
    residenceRegStatus: 'PENDING' | 'REGISTERED' | 'EXPIRED' | string;
  } | null;
  activeContract: {
    id: string;
    contractCode: string;
    startDate: string;
    endDate: string;
    monthlyRentVnd: number;
    status: string;
  } | null;
  unpaidInvoicesCount: number;
  unpaidAmountVnd: number;
  rentalModel?: 'ENTIRE_ROOM' | 'SHARED_ROOM' | string;
  totalBeds?: number;
  occupants?: Array<{
    id: string;
    fullName: string;
    phone?: string | null;
    idNumber?: string | null;
    relationToPrimary: string;
    residenceRegStatus: string;
    moveInDate: string;
    moveOutDate?: string | null;
    isActive: boolean;
  }>;
  activeReservation?: {
    id: string;
    reservationCode: string;
    customerName: string;
    customerPhone: string;
    holdAmountVnd: number;
    status: string;
    holdUntil: string | null;
    expectedMoveIn: string | null;
  } | null;
  updatedAt: string;
}

export interface ConsoleTenantDto {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  idNumber: string;
  residenceRegStatus: 'PENDING' | 'REGISTERED' | 'EXPIRED' | string;
  emergencyContact: string;
  notes: string;
  primaryBuildingId: string | null;
  buildingCode: string | null;
  buildingName: string | null;
  currentRoomId: string | null;
  currentRoomCode: string | null;
  activeContractCode: string | null;
  activeContractEndDate: string | null;
  monthlyRentVnd: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleKpisDto {
  buildingsCount: number;
  floorsCount: number;
  totalRooms: number;
  availableRooms: number;
  reservedRooms: number;
  occupiedRooms: number;
  maintenanceRooms: number;
  publishedLandingRooms: number;
  occupancyRatePercent: number;
  tenantsCount: number;
  activeContractsCount: number;
  expiringContractsCount: number;
  activeReservationsCount: number;
  contractedMonthlyRentVnd: number;
  occupiedListValueVnd: number;
  periodInvoicedVnd: number;
  periodCollectedVnd: number;
  periodReceivableVnd: number;
  overdueInvoicesCount: number;
  unpaidInvoicesCount: number;
  periodIncomeVnd: number;
  periodExpenseVnd: number;
  periodNetCashflowVnd: number;
  hunonicStatus: 'UNCONFIGURED' | 'VERIFIED' | 'ERROR' | 'DISABLED' | string;
  hunonicOnlineMeters: number;
  hunonicTotalMeters: number;
  newLeadsCount: number;
}

export interface ConsoleLeadDto {
  id: string;
  referenceCode: string;
  fullName: string;
  phone: string;
  inquiryType: string;
  roomCode: string | null;
  roomTitle: string | null;
  preferredMoveInDateDisplay: string | null;
  status: string;
  createdAt: string;
}

export interface ConsoleNotificationItemDto {
  key: string;
  category: 'LEAD' | 'INVOICE' | 'CONTRACT';
  title: string;
  description: string;
  targetModule: string;
  createdAt: string;
  isRead: boolean;
}

export interface ConsoleModuleCountsDto {
  buildings: number;
  rooms: number;
  tenants: number;
  deposits: number;
  contracts: number;
  invoicesUnpaid: number;
}

export interface CreateBuildingInput {
  code: string;
  name: string;
  streetAddress: string;
  ward: string;
  province: string;
  buildingType?: string;
  description?: string;
  managerName?: string;
  managerPhone?: string;
  initialFloorsCount?: number;
}

export interface UpdateBuildingInput {
  code?: string;
  name?: string;
  streetAddress?: string;
  ward?: string;
  province?: string;
  buildingType?: string;
  description?: string;
  managerName?: string;
  managerPhone?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  electricRateVnd?: number | null;
  waterBillingMethod?: WaterBillingMethod | null;
  waterRateVnd?: number | null;
}

export interface CreateFloorInput {
  buildingId: string;
  floorNumber: number;
  name: string;
}

export interface CreateRoomInput {
  buildingId: string;
  floorId: string;
  code: string;
  title?: string;
  roomType: string;
  area: number;
  listPriceVnd: number;
  depositMonths?: number;
  maxOccupants?: number;
  occupancyStatus?: OccupancyStatus;
  furnishedLevel?: 'FULL' | 'BASIC' | 'UNFURNISHED';
  isPublishedToLanding?: boolean;
  electricBillingMode?: 'MANUAL' | 'HUNONIC_AUTO' | string;
  internalNotes?: string;
}

export interface UpdateRoomInput {
  code?: string;
  title?: string;
  roomType?: string;
  area?: number;
  listPriceVnd?: number;
  depositMonths?: number;
  maxOccupants?: number;
  occupancyStatus?: OccupancyStatus;
  furnishedLevel?: 'FULL' | 'BASIC' | 'UNFURNISHED';
  waterBillingMethod?: WaterBillingMethod | null;
  waterRateVnd?: number | null;
  electricBillingMode?: 'MANUAL' | 'HUNONIC_AUTO' | string;
  electricRateVnd?: number | null;
  isPublishedToLanding?: boolean;
  internalNotes?: string;
}

export interface CreateTenantInput {
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  residenceRegStatus?: 'PENDING' | 'REGISTERED' | 'EXPIRED';
  emergencyContact?: string;
  notes?: string;
  primaryBuildingId?: string | null;
  currentRoomId?: string | null;
}

export interface UpdateTenantInput {
  fullName?: string;
  phone?: string;
  email?: string;
  idNumber?: string;
  residenceRegStatus?: 'PENDING' | 'REGISTERED' | 'EXPIRED';
  emergencyContact?: string;
  notes?: string;
  primaryBuildingId?: string | null;
  currentRoomId?: string | null;
}

export interface DeleteCheckResult {
  canHardDelete: boolean;
  canArchive: boolean;
  blockingReasons: string[];
}

export interface ApiActionResult<T = unknown> {
  ok: boolean;
  message?: string;
  errorCode?: string;
  data?: T;
}

export interface RoomOccupantDto {
  id: string;
  roomId: string;
  contractId?: string | null;
  tenantId?: string | null;
  fullName: string;
  phone?: string | null;
  idNumber?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  residenceRegStatus: 'PENDING' | 'REGISTERED' | 'EXPIRED' | string;
  relationToPrimary: 'PRIMARY' | 'FAMILY' | 'ROOMMATE' | 'OTHER' | string;
  moveInDate: string;
  moveOutDate?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface ContractDto {
  id: string;
  contractCode: string;
  buildingId: string;
  buildingCode: string;
  roomId: string;
  roomCode: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  rentalModel?: string;
  startDate: string;
  endDate: string;
  signedAt?: string | null;
  moveInDate?: string | null;
  handoverMeterKwh?: number | null;
  handoverWaterM3?: number | null;
  monthlyRentVnd: number;
  depositVnd: number;
  occupantsCount: number;
  occupants?: Array<{
    id: string;
    fullName: string;
    phone?: string | null;
    relationToPrimary?: string;
    residenceRegStatus?: string;
  }>;
  electricRateVnd: number;
  waterBillingMethod: string;
  waterRateVnd: number;
  status: string;
  createdAt: string;
}

export interface DepositDto {
  id: string;
  reservationId?: string | null;
  contractId?: string | null;
  depositType: 'BOOKING' | 'CONTRACT' | string;
  amountVnd: number;
  refundedVnd: number;
  paymentStatus: 'PENDING' | 'PAID' | 'TRANSFERRED' | 'REFUNDED' | 'FORFEITED' | string;
  paymentMethod?: string | null;
  receivedAt?: string | null;
  transferredToDepositId?: string | null;
  status: 'HELD' | 'APPLIED_TO_CONTRACT' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FORFEITED' | string;
  notes?: string | null;
  createdAt: string;
}

export interface ReservationDto {
  id: string;
  reservationCode: string;
  buildingCode: string;
  roomCode: string;
  customerName: string;
  customerPhone: string;
  holdAmountVnd: number;
  status: 'PENDING' | 'CONFIRMED' | 'CONVERTED' | 'CANCELLED' | 'EXPIRED' | string;
  holdUntil?: string | null;
  expectedMoveIn: string | null;
  notes?: string | null;
  createdAt: string;
}
