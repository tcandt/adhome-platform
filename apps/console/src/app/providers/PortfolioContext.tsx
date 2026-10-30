import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CONSOLE_CSRF_HEADER, useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import type {
  ApiActionResult,
  ConsoleBuildingDto,
  ConsoleKpisDto,
  ConsoleLeadDto,
  ConsoleModuleCountsDto,
  ConsoleNotificationItemDto,
  ConsoleOrganizationDto,
  ConsoleRoomDto,
  ConsoleTenantDto,
  CreateBuildingInput,
  CreateFloorInput,
  CreateRoomInput,
  CreateTenantInput,
  DeleteCheckResult,
  UpdateBuildingInput,
  UpdateRoomInput,
  UpdateTenantInput,
} from '@/shared/types/portfolio';

export type SyncStatus = 'idle' | 'loading' | 'refreshing' | 'error';

const EMPTY_KPIS: ConsoleKpisDto = {
  buildingsCount: 0,
  floorsCount: 0,
  totalRooms: 0,
  availableRooms: 0,
  reservedRooms: 0,
  occupiedRooms: 0,
  maintenanceRooms: 0,
  publishedLandingRooms: 0,
  occupancyRatePercent: 0,
  tenantsCount: 0,
  activeContractsCount: 0,
  expiringContractsCount: 0,
  activeReservationsCount: 0,
  contractedMonthlyRentVnd: 0,
  occupiedListValueVnd: 0,
  periodInvoicedVnd: 0,
  periodCollectedVnd: 0,
  periodReceivableVnd: 0,
  overdueInvoicesCount: 0,
  unpaidInvoicesCount: 0,
  periodIncomeVnd: 0,
  periodExpenseVnd: 0,
  periodNetCashflowVnd: 0,
  hunonicStatus: 'UNCONFIGURED',
  hunonicOnlineMeters: 0,
  hunonicTotalMeters: 0,
  newLeadsCount: 0,
};

const EMPTY_MODULE_COUNTS: ConsoleModuleCountsDto = {
  buildings: 0,
  rooms: 0,
  tenants: 0,
  deposits: 0,
  contracts: 0,
  invoicesUnpaid: 0,
};

interface PortfolioContextType {
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  organization: ConsoleOrganizationDto | null;
  /** All authorized buildings in actor's scope (including archived for management) */
  allBuildings: ConsoleBuildingDto[];
  /** Authorized active buildings (status !== 'ARCHIVED') */
  activeBuildings: ConsoleBuildingDto[];
  /** Active buildings matching current Header Building Scope filter */
  scopedBuildings: ConsoleBuildingDto[];
  /** Rooms matching current Header Building Scope filter */
  rooms: ConsoleRoomDto[];
  /** Tenants matching current Header Building Scope filter */
  tenants: ConsoleTenantDto[];
  kpis: ConsoleKpisDto;
  recentLeads: ConsoleLeadDto[];
  notifications: ConsoleNotificationItemDto[];
  unreadNotificationsCount: number;
  moduleCounts: ConsoleModuleCountsDto;
  refreshPortfolio: () => Promise<void>;
  markNotificationsRead: (keys: string[]) => Promise<void>;

  createBuilding: (dto: CreateBuildingInput) => Promise<ApiActionResult>;
  updateBuilding: (
    buildingId: string,
    dto: UpdateBuildingInput
  ) => Promise<ApiActionResult>;
  archiveBuilding: (buildingId: string) => Promise<ApiActionResult>;
  deleteBuilding: (buildingId: string) => Promise<ApiActionResult>;
  checkDeleteBuilding: (buildingId: string) => Promise<DeleteCheckResult>;

  createFloor: (dto: CreateFloorInput) => Promise<ApiActionResult>;
  deleteFloor: (floorId: string) => Promise<ApiActionResult>;

  createRoom: (dto: CreateRoomInput) => Promise<ApiActionResult>;
  batchCreateRooms: (rooms: CreateRoomInput[]) => Promise<ApiActionResult>;
  updateRoom: (
    roomId: string,
    dto: UpdateRoomInput
  ) => Promise<ApiActionResult>;
  deleteRoom: (roomId: string) => Promise<ApiActionResult>;
  checkDeleteRoom: (roomId: string) => Promise<DeleteCheckResult>;

  createTenant: (dto: CreateTenantInput) => Promise<ApiActionResult>;
  updateTenant: (
    tenantId: string,
    dto: UpdateTenantInput
  ) => Promise<ApiActionResult>;
  deleteTenant: (tenantId: string) => Promise<ApiActionResult>;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(
  undefined
);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, refreshSession } = useAuth();
  const { selectedBuildingIds, setSelectedBuildingIds, selectedPeriod } =
    useNavigation();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [organization, setOrganization] =
    useState<ConsoleOrganizationDto | null>(null);
  const [allBuildings, setAllBuildings] = useState<ConsoleBuildingDto[]>([]);
  const [rooms, setRooms] = useState<ConsoleRoomDto[]>([]);
  const [tenants, setTenants] = useState<ConsoleTenantDto[]>([]);
  const [kpis, setKpis] = useState<ConsoleKpisDto>(EMPTY_KPIS);
  const [recentLeads, setRecentLeads] = useState<ConsoleLeadDto[]>([]);
  const [notifications, setNotifications] = useState<
    ConsoleNotificationItemDto[]
  >([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [moduleCounts, setModuleCounts] =
    useState<ConsoleModuleCountsDto>(EMPTY_MODULE_COUNTS);

  // Purge any legacy mock localStorage business state from pre-C2 Console builds
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adhome_portfolio_buildings_v3');
      localStorage.removeItem('adhome_portfolio_rooms_v3');
      localStorage.removeItem('adhome_portfolio_buildings_v2');
      localStorage.removeItem('adhome_portfolio_rooms_v2');
    }
  }, []);

  const fetchBootstrap = useCallback(
    async (isBackground: boolean = false) => {
      if (!isAuthenticated || !user) {
        setOrganization(null);
        setAllBuildings([]);
        setRooms([]);
        setTenants([]);
        setKpis(EMPTY_KPIS);
        setRecentLeads([]);
        setNotifications([]);
        setUnreadNotificationsCount(0);
        setModuleCounts(EMPTY_MODULE_COUNTS);
        setSyncStatus('idle');
        setSyncError(null);
        return;
      }

      setSyncStatus((prev) =>
        isBackground && prev !== 'idle' ? 'refreshing' : 'loading'
      );
      setSyncError(null);

      try {
        const params = new URLSearchParams();
        params.set('period', selectedPeriod);
        if (selectedBuildingIds.length > 0) {
          params.set('buildings', selectedBuildingIds.join(','));
        }

        const res = await fetch(
          `/api/v1/console/v2/bootstrap?${params.toString()}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        );

        if (res.status === 401) {
          await refreshSession();
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(
            data.message || 'Không thể tải dữ liệu vận hành từ PostgreSQL.'
          );
        }

        const blds: ConsoleBuildingDto[] = Array.isArray(data.buildings)
          ? data.buildings
          : [];
        setOrganization(data.organization || null);
        setAllBuildings(blds);
        setRooms(Array.isArray(data.rooms) ? data.rooms : []);
        setTenants(Array.isArray(data.tenants) ? data.tenants : []);
        setKpis(data.kpis || EMPTY_KPIS);
        setRecentLeads(Array.isArray(data.recentLeads) ? data.recentLeads : []);
        setNotifications(
          Array.isArray(data.notifications?.items)
            ? data.notifications.items
            : []
        );
        setUnreadNotificationsCount(
          Number(data.notifications?.unreadCount ?? 0)
        );
        setModuleCounts(data.moduleCounts || EMPTY_MODULE_COUNTS);
        setLastSyncedAt(data.syncedAt || new Date().toISOString());
        setSyncStatus('idle');

        // Keep selectedBuildingIds sanitized against actual server-authorized active buildings
        if (selectedBuildingIds.length > 0) {
          const validIds = new Set(
            blds.filter((b) => b.status !== 'ARCHIVED').map((b) => b.id)
          );
          const sanitized = selectedBuildingIds.filter((id) =>
            validIds.has(id)
          );
          if (sanitized.length !== selectedBuildingIds.length) {
            setSelectedBuildingIds(sanitized);
          }
        }
      } catch (err) {
        setSyncStatus('error');
        setSyncError(
          err instanceof Error
            ? err.message
            : 'Lỗi kết nối cơ sở dữ liệu PostgreSQL.'
        );
      }
    },
    [
      isAuthenticated,
      user,
      selectedPeriod,
      selectedBuildingIds,
      refreshSession,
      setSelectedBuildingIds,
    ]
  );

  useEffect(() => {
    void fetchBootstrap(false);
  }, [fetchBootstrap]);

  const refreshPortfolio = useCallback(async () => {
    await fetchBootstrap(true);
  }, [fetchBootstrap]);

  const mutateJson = useCallback(
    async (
      url: string,
      method: 'POST' | 'PATCH' | 'DELETE',
      body?: unknown
    ): Promise<ApiActionResult> => {
      try {
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': CONSOLE_CSRF_HEADER,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        if (res.status === 401) {
          await refreshSession();
          return {
            ok: false,
            errorCode: 'UNAUTHORIZED',
            message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
          };
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            errorCode: data.errorCode || 'API_ERROR',
            message: data.message || 'Thao tác không thành công.',
          };
        }

        await fetchBootstrap(true);
        return { ok: true, data };
      } catch (err) {
        return {
          ok: false,
          errorCode: 'NETWORK_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Không thể kết nối máy chủ AdHome Console.',
        };
      }
    },
    [fetchBootstrap, refreshSession]
  );

  const markNotificationsRead = useCallback(
    async (keys: string[]) => {
      if (keys.length === 0) return;
      await mutateJson('/api/v1/console/v2/notifications/mark-read', 'POST', {
        keys,
      });
    },
    [mutateJson]
  );

  const createBuilding = useCallback(
    (dto: CreateBuildingInput) =>
      mutateJson('/api/v1/console/v2/buildings', 'POST', dto),
    [mutateJson]
  );

  const updateBuilding = useCallback(
    (buildingId: string, dto: UpdateBuildingInput) =>
      mutateJson(
        `/api/v1/console/v2/buildings/${encodeURIComponent(buildingId)}`,
        'PATCH',
        dto
      ),
    [mutateJson]
  );

  const archiveBuilding = useCallback(
    (buildingId: string) =>
      mutateJson(
        `/api/v1/console/v2/buildings/${encodeURIComponent(buildingId)}`,
        'PATCH',
        { status: 'ARCHIVED' }
      ),
    [mutateJson]
  );

  const deleteBuilding = useCallback(
    (buildingId: string) =>
      mutateJson(
        `/api/v1/console/v2/buildings/${encodeURIComponent(buildingId)}`,
        'DELETE'
      ),
    [mutateJson]
  );

  const checkDeleteBuilding = useCallback(
    async (buildingId: string): Promise<DeleteCheckResult> => {
      try {
        const res = await fetch(
          `/api/v1/console/v2/buildings/${encodeURIComponent(
            buildingId
          )}/delete-check`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return {
            canHardDelete: false,
            canArchive: false,
            blockingReasons: [data.message || 'Không thể kiểm tra điều kiện xóa.'],
          };
        }
        return {
          canHardDelete: Boolean(data.canHardDelete),
          canArchive: Boolean(data.canArchive),
          blockingReasons: Array.isArray(data.blockingReasons)
            ? data.blockingReasons
            : [],
        };
      } catch {
        return {
          canHardDelete: false,
          canArchive: false,
          blockingReasons: ['Lỗi kết nối khi kiểm tra điều kiện an toàn dữ liệu.'],
        };
      }
    },
    []
  );

  const createFloor = useCallback(
    (dto: CreateFloorInput) =>
      mutateJson('/api/v1/console/v2/floors', 'POST', dto),
    [mutateJson]
  );

  const deleteFloor = useCallback(
    (floorId: string) =>
      mutateJson(
        `/api/v1/console/v2/floors/${encodeURIComponent(floorId)}`,
        'DELETE'
      ),
    [mutateJson]
  );

  const createRoom = useCallback(
    (dto: CreateRoomInput) =>
      mutateJson('/api/v1/console/v2/rooms', 'POST', dto),
    [mutateJson]
  );

  const batchCreateRooms = useCallback(
    (roomInputs: CreateRoomInput[]) =>
      mutateJson('/api/v1/console/v2/rooms', 'POST', { rooms: roomInputs }),
    [mutateJson]
  );

  const updateRoom = useCallback(
    (roomId: string, dto: UpdateRoomInput) =>
      mutateJson(
        `/api/v1/console/v2/rooms/${encodeURIComponent(roomId)}`,
        'PATCH',
        dto
      ),
    [mutateJson]
  );

  const deleteRoom = useCallback(
    (roomId: string) =>
      mutateJson(
        `/api/v1/console/v2/rooms/${encodeURIComponent(roomId)}`,
        'DELETE'
      ),
    [mutateJson]
  );

  const checkDeleteRoom = useCallback(
    async (roomId: string): Promise<DeleteCheckResult> => {
      try {
        const res = await fetch(
          `/api/v1/console/v2/rooms/${encodeURIComponent(roomId)}/delete-check`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return {
            canHardDelete: false,
            canArchive: false,
            blockingReasons: [data.message || 'Không thể kiểm tra điều kiện xóa.'],
          };
        }
        return {
          canHardDelete: Boolean(data.canHardDelete),
          canArchive: false,
          blockingReasons: Array.isArray(data.blockingReasons)
            ? data.blockingReasons
            : [],
        };
      } catch {
        return {
          canHardDelete: false,
          canArchive: false,
          blockingReasons: ['Lỗi kết nối máy chủ.'],
        };
      }
    },
    []
  );

  const createTenant = useCallback(
    (dto: CreateTenantInput) =>
      mutateJson('/api/v1/console/v2/tenants', 'POST', dto),
    [mutateJson]
  );

  const updateTenant = useCallback(
    (tenantId: string, dto: UpdateTenantInput) =>
      mutateJson(
        `/api/v1/console/v2/tenants/${encodeURIComponent(tenantId)}`,
        'PATCH',
        dto
      ),
    [mutateJson]
  );

  const deleteTenant = useCallback(
    (tenantId: string) =>
      mutateJson(
        `/api/v1/console/v2/tenants/${encodeURIComponent(tenantId)}`,
        'DELETE'
      ),
    [mutateJson]
  );

  const activeBuildings = useMemo(
    () => allBuildings.filter((b) => b.status !== 'ARCHIVED'),
    [allBuildings]
  );

  const scopedBuildings = useMemo(() => {
    if (selectedBuildingIds.length === 0) return activeBuildings;
    const set = new Set(selectedBuildingIds);
    return activeBuildings.filter((b) => set.has(b.id));
  }, [activeBuildings, selectedBuildingIds]);

  return (
    <PortfolioContext.Provider
      value={{
        syncStatus,
        syncError,
        lastSyncedAt,
        organization,
        allBuildings,
        activeBuildings,
        scopedBuildings,
        rooms,
        tenants,
        kpis,
        recentLeads,
        notifications,
        unreadNotificationsCount,
        moduleCounts,
        refreshPortfolio,
        markNotificationsRead,
        createBuilding,
        updateBuilding,
        archiveBuilding,
        deleteBuilding,
        checkDeleteBuilding,
        createFloor,
        deleteFloor,
        createRoom,
        batchCreateRooms,
        updateRoom,
        deleteRoom,
        checkDeleteRoom,
        createTenant,
        updateTenant,
        deleteTenant,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error('usePortfolio must be used within PortfolioProvider');
  }
  return ctx;
}
