import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Droplets,
  Edit,
  EyeOff,
  FileSignature,
  Globe,
  Home,
  Layers,
  Plus,
  PlusCircle,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { useNavigation } from '@/app/providers/NavigationContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type {
  ConsoleBuildingDto,
  ConsoleRoomDto,
  OccupancyStatus,
} from '@/shared/types/portfolio';
import { TenantsDirectoryView } from './TenantsDirectoryView';
import { CreateBuildingModal } from './modals/CreateBuildingModal';
import { CreateFloorModal } from './modals/CreateFloorModal';
import { CreateRoomModal } from './modals/CreateRoomModal';
import { EditBuildingModal } from './modals/EditBuildingModal';
import { EditRoomModal } from './modals/EditRoomModal';
import { SafeDeleteModal } from './modals/SafeDeleteModal';
import { RoomProfileModal } from './modals/RoomProfileModal';
import { ContractCreationWizardModal } from '../modules/modals/ContractCreationWizardModal';
import { LegacyImportWizardModal } from '../modules/modals/LegacyImportWizardModal';

function renderOccupancyBadge(status: OccupancyStatus) {
  switch (status) {
    case 'OCCUPIED':
      return (
        <span className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-950/70 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
          Đang thuê
        </span>
      );
    case 'RESERVED':
      return (
        <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          Giữ chỗ
        </span>
      );
    case 'MAINTENANCE':
      return (
        <span className="inline-flex items-center rounded-md bg-rose-100 dark:bg-rose-950/70 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
          Bảo trì
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-md bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
          Trống
        </span>
      );
  }
}

function formatWaterMethodLabel(method: string): string {
  if (method === 'PER_PERSON') return 'Theo người';
  if (method === 'FIXED_PER_ROOM') return 'Khoán phòng';
  return 'Theo m³';
}

export const UnifiedBuildingCanvas: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const canManageBuildings = hasCapability('canManageBuildings');
  const canManageRooms = hasCapability('canManageRooms');
  const canPublishRooms =
    user?.backendRole === 'ADMIN' ||
    Boolean(user?.permissions.includes('rooms.publish.write'));

  const {
    buildingsSubTab,
    setBuildingsSubTab,
    openTenantsWorkspace,
    setActiveModule,
    selectedBuildingIds,
    setSelectedBuildingIds,
  } = useNavigation();

  const {
    organization,
    scopedBuildings,
    rooms,
    tenants,
    kpis,
    updateRoom,
    deleteFloor,
  } = usePortfolio();

  const [roomSearch, setRoomSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modal states
  const [isCreateBuildingOpen, setIsCreateBuildingOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] =
    useState<ConsoleBuildingDto | null>(null);
  const [createFloorBuildingId, setCreateFloorBuildingId] = useState<
    string | null
  >(null);
  const [createRoomTarget, setCreateRoomTarget] = useState<{
    buildingId?: string;
    floorId?: string;
  } | null>(null);
  const [editingRoom, setEditingRoom] = useState<ConsoleRoomDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'building' | 'room';
    id: string;
    code: string;
    name?: string;
  } | null>(null);
  const [wizardTarget, setWizardTarget] = useState<{
    roomId: string;
    reservationId?: string;
  } | null>(null);
  const [legacyImportTargetRoomId, setLegacyImportTargetRoomId] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedRoomId) {
        setSelectedRoomId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRoomId]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (statusFilter === 'AVAILABLE' && r.occupancyStatus !== 'AVAILABLE') {
        return false;
      }
      if (statusFilter === 'OCCUPIED' && r.occupancyStatus !== 'OCCUPIED') {
        return false;
      }
      if (statusFilter === 'RESERVED' && r.occupancyStatus !== 'RESERVED') {
        return false;
      }
      if (statusFilter === 'PUBLISHED' && !r.isPublishedToLanding) {
        return false;
      }
      if (roomSearch.trim()) {
        const q = roomSearch.toLowerCase();
        const matchCode = r.code.toLowerCase().includes(q);
        const matchTitle = r.title.toLowerCase().includes(q);
        const matchBld =
          r.buildingCode.toLowerCase().includes(q) ||
          r.buildingName.toLowerCase().includes(q);
        const matchTenant =
          r.currentTenant?.fullName.toLowerCase().includes(q) || false;
        if (!matchCode && !matchTitle && !matchBld && !matchTenant) {
          return false;
        }
      }
      return true;
    });
  }, [rooms, statusFilter, roomSearch]);

  const handleToggleRoomPublish = async (room: ConsoleRoomDto) => {
    setActionFeedback(null);
    const res = await updateRoom(room.id, {
      isPublishedToLanding: !room.isPublishedToLanding,
    });
    if (!res.ok) {
      setActionFeedback(
        res.message || 'Không thể cập nhật trạng thái xuất bản Landing Page.'
      );
    }
  };

  const handleRemoveEmptyFloor = async (floorId: string) => {
    setActionFeedback(null);
    const res = await deleteFloor(floorId);
    if (!res.ok) {
      setActionFeedback(res.message || 'Không thể xóa tầng.');
    }
  };

  const meterSummaryText =
    kpis.hunonicStatus === 'VERIFIED'
      ? `Hunonic: ${kpis.hunonicOnlineMeters}/${kpis.hunonicTotalMeters} công tơ online`
      : 'Công tơ thông minh: Chưa cấu hình';

  return (
    <div className="space-y-4" data-testid="console-buildings-workspace">
      {/* SUB-NAVIGATION BAR: Sơ đồ & Phòng vs Khách thuê */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl p-2.5">
        <div
          role="tablist"
          aria-label="Không gian làm việc Tòa nhà, Phòng và Khách thuê"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={buildingsSubTab === 'rooms'}
            data-testid="subtab-buildings-rooms"
            onClick={() => setBuildingsSubTab('rooms')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              buildingsSubTab === 'rooms'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Sơ đồ &amp; Phòng</span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {rooms.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={buildingsSubTab === 'tenants'}
            data-testid="subtab-buildings-tenants"
            onClick={() => setBuildingsSubTab('tenants')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              buildingsSubTab === 'tenants'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Khách thuê</span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {tenants.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap px-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-brand-primary" />
            <b>{kpis.publishedLandingRooms}</b>/{kpis.totalRooms} phòng đăng
            Landing
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            {meterSummaryText}
          </span>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 text-rose-500 hover:text-rose-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 2: TENANTS DIRECTORY */}
      {buildingsSubTab === 'tenants' ? (
        <TenantsDirectoryView />
      ) : (
        /* TAB 1: BUILDINGS, FLOORS & ROOMS */
        <div className="space-y-4">
          {/* Building Summary Strip */}
          {scopedBuildings.length > 0 && (
            <div
              className={`grid gap-3 ${
                scopedBuildings.length === 1
                  ? 'grid-cols-1'
                  : scopedBuildings.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
              }`}
            >
              {scopedBuildings.map((bld) => {
                const isSingleSelected =
                  selectedBuildingIds.length === 1 &&
                  selectedBuildingIds[0] === bld.id;
                const occPct =
                  bld.stats.totalRooms > 0
                    ? Math.round(
                        (bld.stats.occupiedRooms / bld.stats.totalRooms) * 100
                      )
                    : 0;

                return (
                  <button
                    key={bld.id}
                    type="button"
                    data-testid={`building-summary-card-${bld.code}`}
                    onClick={() =>
                      setSelectedBuildingIds(isSingleSelected ? [] : [bld.id])
                    }
                    className={`p-3.5 rounded-xl border text-left transition-colors ${
                      isSingleSelected
                        ? 'border-brand-primary bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-brand-primary'
                        : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-brand-primary shrink-0">
                          <Building2 className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                            {bld.code} · {bld.name}
                          </div>
                          <div className="truncate text-[11px] text-slate-400">
                            {bld.streetAddress}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-brand-primary tabular-nums">
                        {occPct}%
                      </span>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        <b className="text-slate-800 dark:text-slate-200">
                          {bld.stats.occupiedRooms}/{bld.stats.totalRooms}
                        </b>{' '}
                        đang thuê · {bld.stats.availableRooms} trống
                      </span>
                      <span className="inline-flex items-center gap-1 text-brand-primary dark:text-blue-400 font-semibold">
                        <Globe className="w-3 h-3" /> {bld.stats.publishedRooms}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Filter & Action Toolbar */}
          <div className="p-3.5 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="input-search-rooms"
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Tìm mã phòng, khách thuê, tòa nhà..."
                  className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs overflow-x-auto">
                {[
                  { id: 'ALL', label: `Tất cả (${rooms.length})` },
                  {
                    id: 'AVAILABLE',
                    label: `Trống (${
                      rooms.filter((r) => r.occupancyStatus === 'AVAILABLE')
                        .length
                    })`,
                  },
                  {
                    id: 'OCCUPIED',
                    label: `Đang thuê (${
                      rooms.filter((r) => r.occupancyStatus === 'OCCUPIED')
                        .length
                    })`,
                  },
                  {
                    id: 'RESERVED',
                    label: `Giữ chỗ (${
                      rooms.filter((r) => r.occupancyStatus === 'RESERVED')
                        .length
                    })`,
                  },
                  {
                    id: 'PUBLISHED',
                    label: `Trên Landing (${
                      rooms.filter((r) => r.isPublishedToLanding).length
                    })`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === tab.id
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canManageBuildings && (
                <button
                  type="button"
                  data-testid="btn-open-create-building"
                  onClick={() => setIsCreateBuildingOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm tòa nhà
                </button>
              )}

              {canManageRooms && scopedBuildings.length > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="btn-open-create-floor"
                    onClick={() =>
                      setCreateFloorBuildingId(scopedBuildings[0].id)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-brand-primary" /> Thêm
                    tầng
                  </button>

                  <button
                    type="button"
                    data-testid="btn-open-create-room"
                    onClick={() =>
                      setCreateRoomTarget({
                        buildingId: scopedBuildings[0].id,
                        floorId: scopedBuildings[0].floors[0]?.id,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-brand-primary" />{' '}
                    Thêm phòng
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Empty Buildings State (Zero mock demo buttons) */}
          {scopedBuildings.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#111827] border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-brand-primary flex items-center justify-center">
                <Building2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Chưa có tòa nhà hoạt động trong phạm vi của{' '}
                {organization?.name || 'AdHome'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                Khởi tạo tòa nhà, tầng và phòng thực tế trên PostgreSQL để bắt
                đầu quản lý lưu trú và đồng bộ danh mục phòng trống ra Landing
                Page.
              </p>
              {canManageBuildings && (
                <button
                  type="button"
                  onClick={() => setIsCreateBuildingOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Thêm tòa nhà đầu tiên
                </button>
              )}
            </div>
          ) : (
            /* Building Cards with Floors & Touch-Friendly Room Cards */
            <div
              className={`grid gap-4 ${
                scopedBuildings.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-1 xl:grid-cols-2'
              }`}
            >
              {scopedBuildings.map((bld) => {
                const bldRooms = filteredRooms.filter(
                  (r) => r.buildingId === bld.id
                );

                return (
                  <section
                    key={bld.id}
                    data-testid={`building-board-${bld.code}`}
                    className="p-4 bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800 rounded-2xl flex flex-col justify-between"
                  >
                    <div>
                      {/* Building Header */}
                      <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              {bld.code} — {bld.name}
                            </h3>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                              Đang hoạt động
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {bld.streetAddress}, {bld.ward}, {bld.province}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {canManageRooms && (
                            <>
                              <button
                                type="button"
                                data-testid={`btn-add-room-to-${bld.code}`}
                                onClick={() =>
                                  setCreateRoomTarget({
                                    buildingId: bld.id,
                                    floorId: bld.floors[0]?.id,
                                  })
                                }
                                title="Thêm phòng vào tòa nhà này"
                                className="p-1.5 text-slate-500 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-add-floor-to-${bld.code}`}
                                onClick={() => setCreateFloorBuildingId(bld.id)}
                                title="Thêm tầng vào tòa nhà này"
                                className="p-1.5 text-slate-500 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg"
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {canManageBuildings && (
                            <>
                              <button
                                type="button"
                                data-testid={`btn-edit-building-${bld.code}`}
                                onClick={() => setEditingBuilding(bld)}
                                title="Chỉnh sửa tòa nhà"
                                className="p-1.5 text-slate-500 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                data-testid={`btn-delete-building-${bld.code}`}
                                onClick={() =>
                                  setDeleteTarget({
                                    type: 'building',
                                    id: bld.id,
                                    code: bld.code,
                                    name: bld.name,
                                  })
                                }
                                title="Xóa hoặc lưu trữ tòa nhà"
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Floors Stack */}
                      <div className="space-y-3">
                        {bld.floors.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                            Tòa nhà chưa có tầng nào.{' '}
                            {canManageRooms && (
                              <button
                                type="button"
                                onClick={() => setCreateFloorBuildingId(bld.id)}
                                className="font-bold text-brand-primary hover:underline ml-1"
                              >
                                + Thêm tầng ngay
                              </button>
                            )}
                          </div>
                        ) : (
                          bld.floors
                            .slice()
                            .sort((a, b) => b.floorNumber - a.floorNumber)
                            .map((flr) => {
                              const floorRooms = bldRooms.filter(
                                (r) => r.floorId === flr.id
                              );

                              return (
                                <div
                                  key={flr.id}
                                  data-testid={`floor-section-${bld.code}-${flr.floorNumber}`}
                                  className="p-2.5 bg-slate-50/80 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800/80"
                                >
                                  <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                                      {flr.name} ({flr.roomCount} phòng)
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {canManageRooms &&
                                        flr.roomCount === 0 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleRemoveEmptyFloor(
                                                flr.id
                                              )
                                            }
                                            className="text-[10.5px] font-medium text-rose-500 hover:underline"
                                          >
                                            Xóa tầng trống
                                          </button>
                                        )}
                                      {canManageRooms && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCreateRoomTarget({
                                              buildingId: bld.id,
                                              floorId: flr.id,
                                            })
                                          }
                                          className="text-[11px] font-semibold text-brand-primary dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <Plus className="w-3 h-3" /> Thêm
                                          phòng
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {floorRooms.length === 0 ? (
                                    <div className="py-3 text-center text-[11px] text-slate-400">
                                      Không có phòng hiển thị theo bộ lọc hiện
                                      tại.
                                    </div>
                                  ) : (
                                    <div
                                      className={`grid gap-2.5 ${
                                        scopedBuildings.length === 1
                                          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                                          : 'grid-cols-1 sm:grid-cols-2'
                                      }`}
                                    >
                                      {floorRooms.map((room) => {
                                        const isSelected =
                                          selectedRoomId === room.id;
                                        return (
                                          <button
                                            key={room.id}
                                            type="button"
                                            data-testid={`room-card-${bld.code}-${room.code}`}
                                            onClick={() =>
                                              setSelectedRoomId(room.id)
                                            }
                                            className={`p-3 rounded-xl border text-left transition-all bg-white dark:bg-slate-800/90 ${
                                              isSelected
                                                ? 'border-brand-primary ring-2 ring-brand-primary/30'
                                                : 'border-slate-200/90 dark:border-slate-700/80 hover:border-brand-primary/60'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-1.5">
                                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                                {room.code}
                                              </span>
                                              <div className="flex items-center gap-1">
                                                {renderOccupancyBadge(
                                                  room.occupancyStatus
                                                )}
                                                {room.isPublishedToLanding ? (
                                                  <span
                                                    title="Đang xuất bản công khai trên Landing Page"
                                                    className="inline-flex items-center gap-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-700 dark:text-cyan-300"
                                                  >
                                                    <Globe className="w-2.5 h-2.5" />
                                                    Web
                                                  </span>
                                                ) : (
                                                  <span
                                                    title="Chỉ lưu hành nội bộ trong Console"
                                                    className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700/70 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500 dark:text-slate-400"
                                                  >
                                                    Nội bộ
                                                  </span>
                                                )}
                                              </div>
                                            </div>

                                            <div className="mt-1.5 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                                              {room.currentTenant ? (
                                                <span className="inline-flex items-center gap-1 font-semibold">
                                                  <UserCheck className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                                                  {room.currentTenant.fullName}
                                                </span>
                                              ) : (
                                                <span className="text-slate-500 dark:text-slate-400">
                                                  {room.roomType} · {room.area}
                                                  m²
                                                </span>
                                              )}
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/70 flex items-center justify-between text-[11px]">
                                              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                                                {room.listPriceVnd.toLocaleString(
                                                  'vi-VN'
                                                )}{' '}
                                                đ
                                              </span>
                                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                <span>
                                                  {formatWaterMethodLabel(
                                                    room.effectiveWaterMethod
                                                  )}
                                                </span>
                                                {room.unpaidInvoicesCount >
                                                  0 && (
                                                  <span
                                                    title={`Còn ${room.unpaidInvoicesCount} hóa đơn chưa thu`}
                                                    className="inline-flex items-center gap-0.5 text-rose-600 font-bold"
                                                  >
                                                    <AlertTriangle className="w-3 h-3" />
                                                    {room.unpaidInvoicesCount}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>

                    {/* Building Footer */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 flex-wrap gap-2">
                      <span>
                        Điện:{' '}
                        <b>{bld.electricRateVnd.toLocaleString('vi-VN')}đ</b>
                        /kWh · Nước:{' '}
                        <b>
                          {bld.waterRateVnd.toLocaleString('vi-VN')}đ (
                          {formatWaterMethodLabel(bld.waterBillingMethod)})
                        </b>
                      </span>
                      <span>
                        Quản lý: <b>{bld.managerName || 'Theo phân quyền'}</b>
                      </span>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5-TAB ROOM PROFILE MODAL */}
      <RoomProfileModal
        isOpen={Boolean(selectedRoom)}
        room={selectedRoom}
        onClose={() => setSelectedRoomId(null)}
        onOpenContractWizard={(roomId, reservationId) => {
          setSelectedRoomId(null);
          setWizardTarget({ roomId, reservationId });
        }}
        onOpenReservationModal={(roomId) => {
          setSelectedRoomId(null);
          setWizardTarget({ roomId });
        }}
        onEditRoom={(rm) => {
          setSelectedRoomId(null);
          setEditingRoom(rm);
        }}
        onOpenLegacyImport={(roomId) => {
          setSelectedRoomId(null);
          setLegacyImportTargetRoomId(roomId);
        }}
      />

      {/* 6-STEP BOOKING & CONTRACT CREATION WIZARD */}
      {wizardTarget && (
        <ContractCreationWizardModal
          isOpen={Boolean(wizardTarget)}
          preselectedRoomId={wizardTarget.roomId}
          preselectedReservationId={wizardTarget.reservationId}
          onClose={() => setWizardTarget(null)}
          onSuccess={async () => {
            setWizardTarget(null);
          }}
        />
      )}

      {/* LEGACY DATA IMPORT WIZARD (C4-IMPORT-01/02) */}
      {legacyImportTargetRoomId && (
        <LegacyImportWizardModal
          isOpen={Boolean(legacyImportTargetRoomId)}
          preselectedRoomId={legacyImportTargetRoomId}
          onClose={() => setLegacyImportTargetRoomId(null)}
          onSuccess={async () => {
            setLegacyImportTargetRoomId(null);
          }}
        />
      )}

      {/* MODALS */}
      <CreateBuildingModal
        isOpen={isCreateBuildingOpen}
        onClose={() => setIsCreateBuildingOpen(false)}
      />

      <EditBuildingModal
        isOpen={Boolean(editingBuilding)}
        building={editingBuilding}
        onClose={() => setEditingBuilding(null)}
        onRequestDelete={(bld) =>
          setDeleteTarget({
            type: 'building',
            id: bld.id,
            code: bld.code,
            name: bld.name,
          })
        }
      />

      <CreateFloorModal
        isOpen={Boolean(createFloorBuildingId)}
        buildingId={createFloorBuildingId || undefined}
        onClose={() => setCreateFloorBuildingId(null)}
      />

      <CreateRoomModal
        isOpen={Boolean(createRoomTarget)}
        buildingId={createRoomTarget?.buildingId}
        floorId={createRoomTarget?.floorId}
        onClose={() => setCreateRoomTarget(null)}
      />

      <EditRoomModal
        isOpen={Boolean(editingRoom)}
        room={editingRoom}
        onClose={() => setEditingRoom(null)}
        onRequestDelete={(rm) => {
          setSelectedRoomId(null);
          setDeleteTarget({
            type: 'room',
            id: rm.id,
            code: rm.code,
            name: rm.title,
          });
        }}
      />

      <SafeDeleteModal
        isOpen={Boolean(deleteTarget)}
        targetType={deleteTarget?.type || 'room'}
        targetId={deleteTarget?.id || ''}
        targetCode={deleteTarget?.code || ''}
        targetName={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
