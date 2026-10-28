import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Organization,
  Building,
  Floor,
  Room,
  CreateBuildingDto,
  UpdateBuildingDto,
  CreateFloorDto,
  CreateRoomDto,
  BatchCreateRoomsDto,
  UpdateRoomDto,
  DeleteSafetyReport,
} from '@/shared/types/portfolio';
import { BUILDINGS_HOMELAND_MOCK, ROOMS_HOMELAND_MOCK } from '@/shared/data/buildingsData';

const DEFAULT_ORGS: Organization[] = [
  {
    id: 'org-an-phu',
    name: 'Khu đô thị Ân Phú Serviced Living',
    slug: 'an-phu',
    plan: 'PRO',
    contactEmail: 'admin@anphu.vn',
    contactPhone: '0905123456',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'org-green-residences',
    name: 'Tổ chức B — Green Residences (Tổ chức Mới 0 tòa)',
    slug: 'green-residences',
    plan: 'STARTER',
    contactEmail: 'manager@greenresidences.vn',
    contactPhone: '0938112233',
    createdAt: '2026-10-28T10:00:00Z',
  },
];

interface PortfolioContextType {
  // Organizations
  currentOrg: Organization;
  organizations: Organization[];
  setCurrentOrgId: (orgId: string) => void;
  createOrganization: (name: string, plan?: Organization['plan']) => Organization;

  // Buildings & Rooms
  buildings: Building[];
  rooms: Room[];
  selectedBuildingFilter: string; // 'ALL' or buildingId
  setSelectedBuildingFilter: (bldId: string) => void;

  // Building CRUD
  addBuilding: (dto: CreateBuildingDto) => Building;
  updateBuilding: (id: string, dto: UpdateBuildingDto) => Building;
  archiveBuilding: (id: string) => void;
  checkBuildingDeleteSafety: (id: string) => DeleteSafetyReport;
  deleteBuilding: (id: string) => { success: boolean; message: string };

  // Floor CRUD
  addFloor: (dto: CreateFloorDto) => void;
  deleteFloor: (buildingId: string, floor: number) => { success: boolean; message: string };

  // Room CRUD
  addRoom: (dto: CreateRoomDto) => Room;
  addBatchRooms: (dto: BatchCreateRoomsDto) => Room[];
  updateRoom: (id: string, dto: UpdateRoomDto) => Room;
  checkRoomDeleteSafety: (id: string) => DeleteSafetyReport;
  deleteRoom: (id: string) => { success: boolean; message: string };

  // Reset & Helpers
  resetToDemoData: () => void;
  clearAllAssets: () => void;

  // Dynamic Portfolio Metrics
  totalBuildingsCount: number;
  totalRoomsCount: number;
  occupiedRoomsCount: number;
  availableRoomsCount: number;
  heldRoomsCount: number;
  maintenanceRoomsCount: number;
  totalMonthlyRevenue: number;
  occupancyRatePct: number;
  expiringContractsCount: number;
  overdueDebtCount: number;
  incompleteRegCount: number;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [organizations, setOrganizations] = useState<Organization[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_v2_organizations');
      if (stored) {
        try { return JSON.parse(stored); } catch (e) { /* fallback */ }
      }
    }
    return DEFAULT_ORGS;
  });

  const [currentOrgId, setCurrentOrgIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_v2_current_org_id');
      if (stored) return stored;
    }
    return DEFAULT_ORGS[0].id;
  });

  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>('ALL');

  // Load buildings & rooms per organization
  const [allBuildings, setAllBuildings] = useState<Building[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_v2_buildings');
      if (stored) {
        try { return JSON.parse(stored); } catch (e) { /* fallback */ }
      }
    }
    // Seed default org with Homeland mock
    return BUILDINGS_HOMELAND_MOCK.map(b => ({
      ...b,
      organizationId: DEFAULT_ORGS[0].id,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-10-28T00:00:00Z',
    }));
  });

  const [allRooms, setAllRooms] = useState<Room[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('adhome_v2_rooms');
      if (stored) {
        try { return JSON.parse(stored); } catch (e) { /* fallback */ }
      }
    }
    return ROOMS_HOMELAND_MOCK.map(r => ({
      ...r,
      organizationId: DEFAULT_ORGS[0].id,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-10-28T00:00:00Z',
    }));
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('adhome_v2_organizations', JSON.stringify(organizations));
  }, [organizations]);

  useEffect(() => {
    localStorage.setItem('adhome_v2_current_org_id', currentOrgId);
  }, [currentOrgId]);

  useEffect(() => {
    localStorage.setItem('adhome_v2_buildings', JSON.stringify(allBuildings));
  }, [allBuildings]);

  useEffect(() => {
    localStorage.setItem('adhome_v2_rooms', JSON.stringify(allRooms));
  }, [allRooms]);

  const currentOrg = organizations.find(o => o.id === currentOrgId) || organizations[0];

  const setCurrentOrgId = (orgId: string) => {
    setCurrentOrgIdState(orgId);
    setSelectedBuildingFilter('ALL');
  };

  // Buildings and Rooms scoped strictly to current organization
  const orgBuildings = useMemo(() => {
    return allBuildings.filter(b => b.organizationId === currentOrg.id);
  }, [allBuildings, currentOrg.id]);

  const orgRooms = useMemo(() => {
    return allRooms.filter(r => r.organizationId === currentOrg.id);
  }, [allRooms, currentOrg.id]);

  // Dynamic Portfolio Metrics calculated across active org rooms
  const totalBuildingsCount = orgBuildings.filter(b => b.status === 'ACTIVE').length;
  const totalRoomsCount = orgRooms.filter(r => r.status !== 'ARCHIVED').length;
  const occupiedRoomsCount = orgRooms.filter(r => r.status === 'OCCUPIED').length;
  const availableRoomsCount = orgRooms.filter(r => r.status === 'AVAILABLE').length;
  const heldRoomsCount = orgRooms.filter(r => r.status === 'HELD').length;
  const maintenanceRoomsCount = orgRooms.filter(r => r.status === 'MAINTENANCE').length;
  const totalMonthlyRevenue = orgRooms
    .filter(r => r.status === 'OCCUPIED')
    .reduce((acc, r) => acc + (r.price || 0), 0);
  const occupancyRatePct = totalRoomsCount > 0 ? Math.round((occupiedRoomsCount / totalRoomsCount) * 100) : 0;
  const expiringContractsCount = orgRooms.filter(r => r.hasExpiringContract).length;
  const overdueDebtCount = orgRooms.filter(r => r.hasDebtWarning).length;
  const incompleteRegCount = orgRooms.filter(r => r.isIncompleteRegistration).length;

  // --- ACTIONS ---

  const createOrganization = (name: string, plan: Organization['plan'] = 'PRO'): Organization => {
    const newOrg: Organization = {
      id: `org-${Date.now()}`,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      plan,
      contactEmail: 'admin@adhome.vn',
      contactPhone: '0900000000',
      createdAt: new Date().toISOString(),
    };
    setOrganizations(prev => [...prev, newOrg]);
    setCurrentOrgId(newOrg.id);
    return newOrg;
  };

  const addBuilding = (dto: CreateBuildingDto): Building => {
    const bldId = `bld-${Date.now()}`;
    const floorsCount = dto.initialFloorsCount && dto.initialFloorsCount > 0 ? dto.initialFloorsCount : 3;

    // Generate initial floors structure
    const initialFloors: Floor[] = [];
    initialFloors.push({ floor: 0, floorName: 'Tầng trệt', roomCount: 0, rooms: [] });
    for (let f = 1; f < floorsCount; f++) {
      initialFloors.push({ floor: f, floorName: `Tầng ${f}`, roomCount: 0, rooms: [] });
    }

    const newBuilding: Building = {
      id: bldId,
      organizationId: currentOrg.id,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      shortCode: dto.code.trim().toUpperCase(),
      address: dto.address.trim(),
      ward: dto.ward.trim(),
      city: dto.city.trim(),
      buildingType: dto.buildingType,
      description: dto.description || '',
      status: 'ACTIVE',
      totalRooms: 0,
      occupiedRooms: 0,
      availableRooms: 0,
      heldRooms: 0,
      maintenanceRooms: 0,
      monthlyRevenue: 0,
      collectionRate: 100,
      floorsCount,
      managerName: dto.managerName || 'Chưa phân công',
      managerPhone: dto.managerPhone || '',
      hunonicGatewayStatus: 'ONLINE',
      floorsSummary: initialFloors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAllBuildings(prev => [newBuilding, ...prev]);
    return newBuilding;
  };

  const updateBuilding = (id: string, dto: UpdateBuildingDto): Building => {
    let updatedObj: Building | null = null;

    setAllBuildings(prev =>
      prev.map(b => {
        if (b.id !== id) return b;
        const updated: Building = {
          ...b,
          ...dto,
          code: dto.code ? dto.code.trim().toUpperCase() : b.code,
          name: dto.name ? dto.name.trim() : b.name,
          updatedAt: new Date().toISOString(),
        };
        updatedObj = updated;
        return updated;
      })
    );

    // Update building name/code in related rooms
    if (dto.name || dto.code) {
      setAllRooms(prev =>
        prev.map(r => {
          if (r.buildingId !== id) return r;
          return {
            ...r,
            buildingName: dto.name || r.buildingName,
            buildingCode: dto.code ? dto.code.trim().toUpperCase() : r.buildingCode,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }

    return updatedObj!;
  };

  const archiveBuilding = (id: string) => {
    updateBuilding(id, { status: 'ARCHIVED' });
  };

  const checkBuildingDeleteSafety = (id: string): DeleteSafetyReport => {
    const bldRooms = allRooms.filter(r => r.buildingId === id);
    const occupied = bldRooms.filter(r => r.status === 'OCCUPIED' || r.currentTenant);
    const withDebt = bldRooms.filter(r => r.hasDebtWarning || (r.currentTenant && r.currentTenant.debtAmount > 0));
    const expiring = bldRooms.filter(r => r.hasExpiringContract);

    if (occupied.length > 0 || withDebt.length > 0) {
      const debtTotal = bldRooms.reduce((acc, r) => acc + (r.currentTenant?.debtAmount || 0), 0);
      return {
        canDeletePermanently: false,
        activeContractsCount: occupied.length,
        overdueDebtAmount: debtTotal,
        pendingInvoicesCount: withDebt.length,
        canArchiveInstead: true,
        blockReason: `Tòa nhà này đang có ${occupied.length} căn hộ có hợp đồng thuê và công nợ chưa thu hồi. Để bảo toàn lịch sử tài chính, hãy chọn tính năng Lưu Trữ (Archive) thay vì xóa vĩnh viễn.`,
      };
    }

    return {
      canDeletePermanently: true,
      activeContractsCount: 0,
      overdueDebtAmount: 0,
      pendingInvoicesCount: 0,
      canArchiveInstead: true,
    };
  };

  const deleteBuilding = (id: string): { success: boolean; message: string } => {
    const safety = checkBuildingDeleteSafety(id);
    if (!safety.canDeletePermanently) {
      return { success: false, message: safety.blockReason || 'Không thể xóa tòa nhà đã có giao dịch.' };
    }

    setAllBuildings(prev => prev.filter(b => b.id !== id));
    setAllRooms(prev => prev.filter(r => r.buildingId !== id));
    if (selectedBuildingFilter === id) {
      setSelectedBuildingFilter('ALL');
    }
    return { success: true, message: 'Đã xóa tòa nhà an toàn.' };
  };

  const addFloor = (dto: CreateFloorDto) => {
    setAllBuildings(prev =>
      prev.map(b => {
        if (b.id !== dto.buildingId) return b;
        const exists = b.floorsSummary.some(f => f.floor === dto.floor);
        if (exists) return b;

        const newFloors = [
          ...b.floorsSummary,
          { floor: dto.floor, floorName: dto.floorName, roomCount: 0, rooms: [] },
        ].sort((x, y) => x.floor - y.floor);

        return {
          ...b,
          floorsCount: newFloors.length,
          floorsSummary: newFloors,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const deleteFloor = (buildingId: string, floor: number): { success: boolean; message: string } => {
    const roomsOnFloor = allRooms.filter(r => r.buildingId === buildingId && r.floor === floor);
    if (roomsOnFloor.length > 0) {
      return {
        success: false,
        message: `Tầng này đang có ${roomsOnFloor.length} căn hộ. Hãy di chuyển hoặc xóa các phòng trước khi xóa tầng.`,
      };
    }

    setAllBuildings(prev =>
      prev.map(b => {
        if (b.id !== buildingId) return b;
        const newFloors = b.floorsSummary.filter(f => f.floor !== floor);
        return {
          ...b,
          floorsCount: newFloors.length,
          floorsSummary: newFloors,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return { success: true, message: 'Đã xóa tầng thành công.' };
  };

  const addRoom = (dto: CreateRoomDto): Room => {
    const building = allBuildings.find(b => b.id === dto.buildingId);
    if (!building) throw new Error('Không tìm thấy tòa nhà');

    const roomId = `rm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const floorInfo = building.floorsSummary.find(f => f.floor === dto.floor);
    const floorName = floorInfo ? floorInfo.floorName : dto.floor === 0 ? 'Tầng trệt' : `Tầng ${dto.floor}`;

    const newRoom: Room = {
      id: roomId,
      organizationId: currentOrg.id,
      buildingId: building.id,
      buildingCode: building.code,
      buildingName: building.name,
      floor: dto.floor,
      floorName,
      code: dto.code.trim(),
      type: dto.type,
      area: dto.area,
      price: dto.price,
      status: dto.status || 'AVAILABLE',
      meterStatus: {
        electricMeterId: dto.electricMeterId || `HUN-${building.code}-${dto.code}`,
        electricLastKwh: 0,
        waterLastM3: 0,
        hunonicOnline: true,
        lastSynced: 'Vừa tạo',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAllRooms(prev => [newRoom, ...prev]);

    // Update building totals and floor room list
    setAllBuildings(prev =>
      prev.map(b => {
        if (b.id !== dto.buildingId) return b;
        const newSummary = b.floorsSummary.map(f => {
          if (f.floor !== dto.floor) return f;
          return {
            ...f,
            roomCount: f.roomCount + 1,
            rooms: [...f.rooms, newRoom.code],
          };
        });

        return {
          ...b,
          totalRooms: b.totalRooms + 1,
          availableRooms: b.availableRooms + 1,
          floorsSummary: newSummary,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return newRoom;
  };

  const addBatchRooms = (dto: BatchCreateRoomsDto): Room[] => {
    const building = allBuildings.find(b => b.id === dto.buildingId);
    if (!building) throw new Error('Không tìm thấy tòa nhà');

    const floorInfo = building.floorsSummary.find(f => f.floor === dto.floor);
    const floorName = floorInfo ? floorInfo.floorName : dto.floor === 0 ? 'Tầng trệt' : `Tầng ${dto.floor}`;
    const createdList: Room[] = [];

    for (let i = 0; i < dto.count; i++) {
      const roomNum = dto.startNumber + i;
      const code = `${dto.prefix}${roomNum < 10 ? '0' + roomNum : roomNum}`;
      const roomId = `rm-${Date.now()}-${i}`;

      createdList.push({
        id: roomId,
        organizationId: currentOrg.id,
        buildingId: building.id,
        buildingCode: building.code,
        buildingName: building.name,
        floor: dto.floor,
        floorName,
        code,
        type: dto.type,
        area: dto.area,
        price: dto.price,
        status: 'AVAILABLE',
        meterStatus: {
          electricMeterId: `HUN-${building.code}-${code}`,
          electricLastKwh: 0,
          waterLastM3: 0,
          hunonicOnline: true,
          lastSynced: 'Vừa tạo',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    setAllRooms(prev => [...createdList, ...prev]);

    // Update building
    setAllBuildings(prev =>
      prev.map(b => {
        if (b.id !== dto.buildingId) return b;
        const newCodes = createdList.map(r => r.code);
        const newSummary = b.floorsSummary.map(f => {
          if (f.floor !== dto.floor) return f;
          return {
            ...f,
            roomCount: f.roomCount + createdList.length,
            rooms: [...f.rooms, ...newCodes],
          };
        });

        return {
          ...b,
          totalRooms: b.totalRooms + createdList.length,
          availableRooms: b.availableRooms + createdList.length,
          floorsSummary: newSummary,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return createdList;
  };

  const updateRoom = (id: string, dto: UpdateRoomDto): Room => {
    let updatedObj: Room | null = null;
    setAllRooms(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const updated: Room = {
          ...r,
          ...dto,
          meterStatus: {
            ...r.meterStatus,
            electricMeterId: dto.electricMeterId || r.meterStatus.electricMeterId,
            waterLastM3: dto.waterMeterM3 !== undefined ? dto.waterMeterM3 : r.meterStatus.waterLastM3,
          },
          updatedAt: new Date().toISOString(),
        };
        updatedObj = updated;
        return updated;
      })
    );

    return updatedObj!;
  };

  const checkRoomDeleteSafety = (id: string): DeleteSafetyReport => {
    const room = allRooms.find(r => r.id === id);
    if (!room) return { canDeletePermanently: true, activeContractsCount: 0, overdueDebtAmount: 0, pendingInvoicesCount: 0, canArchiveInstead: false };

    if (room.status === 'OCCUPIED' || room.currentTenant || room.hasDebtWarning) {
      return {
        canDeletePermanently: false,
        activeContractsCount: room.currentTenant ? 1 : 0,
        overdueDebtAmount: room.currentTenant?.debtAmount || 0,
        pendingInvoicesCount: room.hasDebtWarning ? 1 : 0,
        canArchiveInstead: true,
        blockReason: `Căn hộ ${room.code} đang có khách thuê (${room.currentTenant?.name}) và dữ liệu tài chính. Không thể xóa vĩnh viễn, bạn có thể chuyển trạng thái phòng sang Bảo trì hoặc Ngừng hoạt động.`,
      };
    }

    return {
      canDeletePermanently: true,
      activeContractsCount: 0,
      overdueDebtAmount: 0,
      pendingInvoicesCount: 0,
      canArchiveInstead: true,
    };
  };

  const deleteRoom = (id: string): { success: boolean; message: string } => {
    const safety = checkRoomDeleteSafety(id);
    if (!safety.canDeletePermanently) {
      return { success: false, message: safety.blockReason || 'Không thể xóa phòng có dữ liệu.' };
    }

    const room = allRooms.find(r => r.id === id);
    if (room) {
      setAllBuildings(prev =>
        prev.map(b => {
          if (b.id !== room.buildingId) return b;
          const newSummary = b.floorsSummary.map(f => {
            if (f.floor !== room.floor) return f;
            return {
              ...f,
              roomCount: Math.max(0, f.roomCount - 1),
              rooms: f.rooms.filter(c => c !== room.code),
            };
          });

          return {
            ...b,
            totalRooms: Math.max(0, b.totalRooms - 1),
            availableRooms: Math.max(0, b.availableRooms - 1),
            floorsSummary: newSummary,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }

    setAllRooms(prev => prev.filter(r => r.id !== id));
    return { success: true, message: 'Đã xóa phòng an toàn.' };
  };

  const resetToDemoData = () => {
    const defaultBlds: Building[] = BUILDINGS_HOMELAND_MOCK.map(b => ({
      ...b,
      buildingType: 'SERVICED_APARTMENT',
      organizationId: currentOrg.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })) as Building[];

    const defaultRms: Room[] = ROOMS_HOMELAND_MOCK.map(r => ({
      ...r,
      organizationId: currentOrg.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })) as Room[];

    setAllBuildings(prev => [...prev.filter(b => b.organizationId !== currentOrg.id), ...defaultBlds]);
    setAllRooms(prev => [...prev.filter(r => r.organizationId !== currentOrg.id), ...defaultRms]);
  };

  const clearAllAssets = () => {
    setAllBuildings(prev => prev.filter(b => b.organizationId !== currentOrg.id));
    setAllRooms(prev => prev.filter(r => r.organizationId !== currentOrg.id));
  };

  return (
    <PortfolioContext.Provider
      value={{
        currentOrg,
        organizations,
        setCurrentOrgId,
        createOrganization,

        buildings: orgBuildings,
        rooms: orgRooms,
        selectedBuildingFilter,
        setSelectedBuildingFilter,

        addBuilding,
        updateBuilding,
        archiveBuilding,
        checkBuildingDeleteSafety,
        deleteBuilding,

        addFloor,
        deleteFloor,

        addRoom,
        addBatchRooms,
        updateRoom,
        checkRoomDeleteSafety,
        deleteRoom,

        resetToDemoData,
        clearAllAssets,

        totalBuildingsCount,
        totalRoomsCount,
        occupiedRoomsCount,
        availableRoomsCount,
        heldRoomsCount,
        maintenanceRoomsCount,
        totalMonthlyRevenue,
        occupancyRatePct,
        expiringContractsCount,
        overdueDebtCount,
        incompleteRegCount,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
};

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within PortfolioProvider');
  }
  return context;
};
