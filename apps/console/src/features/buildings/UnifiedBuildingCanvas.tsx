import React, { useState, useEffect } from 'react';
import {
  Building2,
  Home,
  Layers,
  Search,
  Plus,
  Zap,
  Phone,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Users,
  Grid3X3,
  Compass,
  FileText,
  CreditCard,
  Receipt,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Edit,
  Trash2,
  Archive,
  MoreVertical,
  PlusCircle,
  FolderPlus,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { Room, Building } from '@/shared/types/portfolio';
import { CreateBuildingModal } from './modals/CreateBuildingModal';
import { EditBuildingModal } from './modals/EditBuildingModal';
import { CreateFloorModal } from './modals/CreateFloorModal';
import { CreateRoomModal } from './modals/CreateRoomModal';
import { SafeDeleteModal } from './modals/SafeDeleteModal';

export const UnifiedBuildingCanvas: React.FC = () => {
  const { user, activeBuildingId, setActiveBuildingId } = useAuth();
  const {
    currentOrg,
    buildings,
    rooms,
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
    resetToDemoData,
    clearAllAssets,
  } = usePortfolio();

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roomSearch, setRoomSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'portfolio' | 'floorplan'>('portfolio');

  // Modals state
  const [isCreateBuildingOpen, setIsCreateBuildingOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [createFloorBuildingId, setCreateFloorBuildingId] = useState<string | null>(null);
  const [createRoomTarget, setCreateRoomTarget] = useState<{ buildingId?: string; floor?: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'building' | 'room';
    id: string;
    code: string;
    name?: string;
  } | null>(null);

  // Architectural floorplan selected state
  const [activeBuildingCode, setActiveBuildingCode] = useState<string>('');
  const [activeFloor, setActiveFloor] = useState<number>(1);

  // Sync active building code if list changes
  useEffect(() => {
    if (buildings.length > 0) {
      if (!buildings.some(b => b.code === activeBuildingCode)) {
        setActiveBuildingCode(buildings[0].code);
        if (buildings[0].floorsSummary.length > 0) {
          setActiveFloor(buildings[0].floorsSummary[0].floor);
        }
      }
    }
  }, [buildings, activeBuildingCode]);

  // Close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedRoom) {
        setSelectedRoom(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoom]);

  // Scope buildings by user permission & active header filter
  const scopedBuildings = buildings.filter(b => {
    if (activeBuildingId !== 'ALL' && b.id !== activeBuildingId) return false;
    if (user?.assignedBuildingIds !== 'ALL') {
      return user?.assignedBuildingIds?.includes(b.id);
    }
    return true;
  });

  // Filter rooms
  const filteredRooms = rooms.filter(r => {
    if (activeBuildingId !== 'ALL' && r.buildingId !== activeBuildingId) return false;
    if (statusFilter === 'OCCUPIED' && r.status !== 'OCCUPIED') return false;
    if (statusFilter === 'AVAILABLE' && r.status !== 'AVAILABLE') return false;
    if (statusFilter === 'HELD' && r.status !== 'HELD') return false;
    if (statusFilter === 'MAINTENANCE' && r.status !== 'MAINTENANCE') return false;
    if (statusFilter === 'ALERT' && !r.hasDebtWarning && !r.hasExpiringContract && !r.isIncompleteRegistration)
      return false;
    if (roomSearch.trim()) {
      const q = roomSearch.toLowerCase();
      const matchCode = r.code.toLowerCase().includes(q);
      const matchBuilding = r.buildingCode.toLowerCase().includes(q) || r.buildingName.toLowerCase().includes(q);
      const matchTenant = r.currentTenant?.name.toLowerCase().includes(q) || false;
      if (!matchCode && !matchBuilding && !matchTenant) return false;
    }
    return true;
  });

  // Current building for floorplan view
  const currentFloorplanBuilding =
    buildings.find(b => b.code === activeBuildingCode) || buildings[0];

  return (
    <div className="space-y-5">
      {/* 1. TOP BUILDING QUICK METRIC CARDS (Adaptive Grid) */}
      {scopedBuildings.length > 0 && (
        <div
          className={`grid gap-3 ${
            scopedBuildings.length === 1
              ? 'grid-cols-1'
              : scopedBuildings.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : scopedBuildings.length === 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          {scopedBuildings.map(bld => {
            const bldRooms = rooms.filter(r => r.buildingId === bld.id);
            const bldOccupied = bldRooms.filter(r => r.status === 'OCCUPIED').length;
            const bldHeld = bldRooms.filter(r => r.status === 'HELD').length;
            const bldAvailable = bldRooms.filter(r => r.status === 'AVAILABLE').length;
            const bldExpiring = bldRooms.filter(r => r.hasExpiringContract).length;
            const bldDebt = bldRooms.filter(r => r.hasDebtWarning).length;
            const occupancyPct = bldRooms.length > 0 ? Math.round((bldOccupied / bldRooms.length) * 100) : 0;
            const isCurrentActive =
              activeBuildingId === bld.id || (activeBuildingId === 'ALL' && activeBuildingCode === bld.code);

            return (
              <div
                key={bld.id}
                onClick={() => {
                  setActiveBuildingCode(bld.code);
                  if (activeBuildingId !== 'ALL') {
                    setActiveBuildingId(bld.id);
                  }
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isCurrentActive
                    ? 'border-brand-primary bg-blue-50/40 dark:bg-blue-950/30 ring-1 ring-brand-primary'
                    : 'border-appBorder-light dark:border-appBorder-dark bg-surface dark:bg-surface-dark hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-brand-primary font-bold">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {bld.code}
                      </strong>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] ml-2 font-semibold px-2 py-0.5 rounded-full ${
                          bld.status === 'ACTIVE'
                            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
                            : 'text-amber-600 bg-amber-50 dark:bg-amber-950/60'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            bld.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        ></span>{' '}
                        {bld.status === 'ACTIVE' ? 'Hoạt động' : 'Lưu trữ'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-brand-primary">{occupancyPct}%</span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    <b>{bldOccupied}/{bld.totalRooms}</b> đã thuê
                  </span>
                  <span className="text-amber-600">
                    <b>{bldHeld}</b> cọc giữ
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>{bldAvailable} phòng trống</span>
                  <span>
                    • {bldExpiring} HĐ hết hạn • {bldDebt} nợ
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. TOP KPI ROW (Dynamic Metrics calculated across portfolio) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Doanh thu tháng */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <CreditCard className="w-3 h-3 text-brand-primary" /> DOANH THU THÁNG
          </div>
          <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
            {totalMonthlyRevenue.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            {occupiedRoomsCount > 0
              ? `Tổng ${occupiedRoomsCount} phòng đang thuê`
              : 'Chưa có doanh thu'}
          </div>
        </div>

        {/* Phòng đã thuê */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Home className="w-3 h-3 text-blue-600" /> PHÒNG ĐÃ THUÊ
          </div>
          <div className="mt-1 text-base font-bold text-blue-600">
            {occupiedRoomsCount} / {totalRoomsCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {occupancyRatePct}% công suất
          </div>
        </div>

        {/* Phòng trống */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Users className="w-3 h-3 text-emerald-600" /> PHÒNG TRỐNG
          </div>
          <div className="mt-1 text-base font-bold text-emerald-600">
            {availableRoomsCount} / {totalRoomsCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {totalRoomsCount > 0 ? Math.round((availableRoomsCount / totalRoomsCount) * 100) : 0}% còn trống
          </div>
        </div>

        {/* HĐ sắp hết hạn */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-500" /> HĐ SẮP HẾT HẠN
          </div>
          <div className="mt-1 text-base font-bold text-amber-600">
            {expiringContractsCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Hạn dưới 30 ngày
          </div>
        </div>

        {/* Thanh toán quá hạn */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-500" /> CÔNG NỢ QUÁ HẠN
          </div>
          <div className="mt-1 text-base font-bold text-rose-600">
            {overdueDebtCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Hóa đơn FSM quá hạn
          </div>
        </div>

        {/* Tạm trú chưa hoàn thiện */}
        <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-purple-600" /> TẠM TRÚ CHƯA XONG
          </div>
          <div className="mt-1 text-base font-bold text-purple-600">
            {incompleteRegCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Cần khai báo công an
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR CONTROLS & SAAS ACTION BUTTONS */}
      <div className="p-3 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search & Status Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              placeholder="Tìm số phòng, khách thuê, mã tòa..."
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-0 rounded-lg focus:ring-2 focus:ring-brand-primary text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Status Segmented Buttons */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium overflow-x-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Tất cả ({totalRoomsCount})
            </button>
            <button
              onClick={() => setStatusFilter('OCCUPIED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'OCCUPIED'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Đang thuê ({occupiedRoomsCount})
            </button>
            <button
              onClick={() => setStatusFilter('AVAILABLE')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'AVAILABLE'
                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Trống ({availableRoomsCount})
            </button>
            <button
              onClick={() => setStatusFilter('HELD')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'HELD'
                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Giữ cọc ({heldRoomsCount})
            </button>
            <button
              onClick={() => setStatusFilter('ALERT')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'ALERT'
                  ? 'bg-rose-600 text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Cảnh báo ({expiringContractsCount + overdueDebtCount + incompleteRegCount})
            </button>
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('portfolio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === 'portfolio'
                  ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Xem toàn bộ tòa nhà dạng lưới linh hoạt"
            >
              <Grid3X3 className="w-3.5 h-3.5" /> Bảng Portfolio ({scopedBuildings.length})
            </button>
            <button
              onClick={() => setViewMode('floorplan')}
              disabled={scopedBuildings.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all disabled:opacity-40 ${
                viewMode === 'floorplan'
                  ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Xem sơ đồ mặt bằng kiến trúc & 3D"
            >
              <Compass className="w-3.5 h-3.5" /> Sơ đồ mặt bằng & 3D
            </button>
          </div>

          {/* Action: Add Building */}
          <button
            onClick={() => setIsCreateBuildingOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-hover shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm tòa nhà
          </button>

          {/* Action: Add Room (if buildings exist) */}
          {scopedBuildings.length > 0 && (
            <button
              onClick={() => setCreateRoomTarget({ buildingId: scopedBuildings[0].id })}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
            >
              <PlusCircle className="w-3.5 h-3.5 text-brand-primary" /> Thêm phòng
            </button>
          )}

          {/* Action: Add Floor (if buildings exist) */}
          {scopedBuildings.length > 0 && (
            <button
              onClick={() => setCreateFloorBuildingId(scopedBuildings[0].id)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Thêm tầng cho tòa nhà"
            >
              <Layers className="w-3.5 h-3.5" /> Thêm tầng
            </button>
          )}

          {/* Reset / Demo Data Utilities Dropdown */}
          <button
            onClick={() => {
              if (confirm('Khôi phục lại dữ liệu mẫu demo Homeland (4 tòa, 34 phòng) cho tổ chức này?')) {
                resetToDemoData();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Nạp lại dữ liệu mẫu Homeland"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {scopedBuildings.length === 0 ? (
        /* ========================================================
           EMPTY STATE (0 BUILDINGS IN THIS ORGANIZATION)
           ======================================================== */
        <div className="p-12 text-center bg-surface dark:bg-surface-dark border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl shadow-soft">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-brand-primary flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Chưa có tòa nhà nào trong tổ chức {currentOrg.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
            AdHome V2 là nền tảng SaaS cho thuê linh hoạt. Bạn có thể tự thêm danh mục tòa nhà, khai báo số tầng, tạo phòng đơn lẻ hoặc hàng loạt theo nhu cầu thực tế của đơn vị.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => setIsCreateBuildingOpen(true)}
              className="px-4 py-2.5 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Thêm tòa nhà đầu tiên
            </button>

            <button
              onClick={() => resetToDemoData()}
              className="px-4 py-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-500" /> Nạp dữ liệu mẫu Homeland (4 tòa, 34 phòng)
            </button>
          </div>
        </div>
      ) : viewMode === 'portfolio' ? (
        /* ========================================================
           VIEW A: UNIFIED PORTFOLIO BOARD (Responsive Dynamic Grid)
           ======================================================== */
        <div
          className={`grid gap-4 ${
            scopedBuildings.length === 1
              ? 'grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {scopedBuildings.map(bld => {
            const bldRooms = filteredRooms.filter(r => r.buildingId === bld.id);

            return (
              <div
                key={bld.id}
                className="p-4 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-card shadow-soft flex flex-col justify-between"
              >
                {/* Building Header */}
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-appBorder-light dark:border-appBorder-dark">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary font-bold">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {bld.code} — {bld.name}
                          </h3>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                              bld.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            ● {bld.status === 'ACTIVE' ? 'Đang hoạt động' : 'Lưu trữ'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {bld.address}{bld.ward ? `, ${bld.ward}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Quick action buttons on building card */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCreateRoomTarget({ buildingId: bld.id })}
                        className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Thêm phòng vào tòa này"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCreateFloorBuildingId(bld.id)}
                        className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Thêm tầng vào tòa này"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingBuilding(bld)}
                        className="p-1.5 text-slate-400 hover:text-brand-primary hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Chỉnh sửa thông tin tòa nhà"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            type: 'building',
                            id: bld.id,
                            code: bld.code,
                            name: bld.name,
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                        title="Xóa an toàn hoặc lưu trữ tòa nhà"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Floor Stack with Compact Room Tiles */}
                  <div className="space-y-2.5">
                    {bld.floorsSummary.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        Tòa nhà này chưa có tầng nào.{' '}
                        <button
                          onClick={() => setCreateFloorBuildingId(bld.id)}
                          className="font-bold text-brand-primary underline ml-1"
                        >
                          + Thêm tầng ngay
                        </button>
                      </div>
                    ) : (
                      bld.floorsSummary
                        .slice()
                        .reverse()
                        .map(floorInfo => {
                          const floorRooms = bldRooms.filter(r => r.floor === floorInfo.floor);

                          return (
                            <div
                              key={floorInfo.floor}
                              className="p-2 bg-slate-50/70 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80"
                            >
                              <div className="flex items-center justify-between mb-1.5 px-1">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                  {floorInfo.floorName} ({floorInfo.roomCount} phòng)
                                </span>
                                <button
                                  onClick={() =>
                                    setCreateRoomTarget({ buildingId: bld.id, floor: floorInfo.floor })
                                  }
                                  className="text-[10px] font-semibold text-brand-primary hover:underline flex items-center gap-0.5"
                                >
                                  <Plus className="w-3 h-3" /> Thêm phòng
                                </button>
                              </div>

                              {/* Compact Room Tiles Grid */}
                              {floorRooms.length === 0 ? (
                                <div className="py-2 text-center text-[11px] text-slate-400">
                                  Chưa có phòng trên tầng này.{' '}
                                  <button
                                    onClick={() =>
                                      setCreateRoomTarget({ buildingId: bld.id, floor: floorInfo.floor })
                                    }
                                    className="text-brand-primary font-semibold underline"
                                  >
                                    Thêm phòng
                                  </button>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {floorRooms.map(room => {
                                    const isSelected = selectedRoom?.id === room.id;

                                    return (
                                      <button
                                        key={room.id}
                                        onClick={() => setSelectedRoom(room)}
                                        className={`p-2 rounded-lg border text-left transition-all relative overflow-hidden group ${
                                          isSelected
                                            ? 'border-brand-primary ring-2 ring-brand-primary/30 bg-blue-50/80 dark:bg-blue-950/60'
                                            : room.status === 'OCCUPIED'
                                            ? 'border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-800 hover:border-brand-primary'
                                            : room.status === 'AVAILABLE'
                                            ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-800 hover:border-emerald-500'
                                            : room.status === 'HELD'
                                            ? 'border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-800 hover:border-amber-500'
                                            : 'border-slate-300 bg-slate-100 dark:bg-slate-800'
                                        }`}
                                      >
                                        {/* Top status color strip */}
                                        <div
                                          className={`absolute top-0 left-0 right-0 h-1 ${
                                            room.status === 'OCCUPIED'
                                              ? 'bg-blue-600'
                                              : room.status === 'AVAILABLE'
                                              ? 'bg-emerald-500'
                                              : room.status === 'HELD'
                                              ? 'bg-amber-400'
                                              : 'bg-rose-500'
                                          }`}
                                        />

                                        <div className="flex items-center justify-between mt-1 mb-0.5">
                                          <strong className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                            {room.code}
                                          </strong>
                                          <span
                                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                              room.status === 'OCCUPIED'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                                : room.status === 'AVAILABLE'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                : room.status === 'HELD'
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                : 'bg-rose-100 text-rose-700'
                                            }`}
                                          >
                                            {room.status === 'OCCUPIED'
                                              ? 'Đang ở'
                                              : room.status === 'AVAILABLE'
                                              ? 'Trống'
                                              : room.status === 'HELD'
                                              ? 'Cọc'
                                              : 'Bảo trì'}
                                          </span>
                                        </div>

                                        {/* Tenant short name or room type */}
                                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                          {room.currentTenant
                                            ? room.currentTenant.name
                                            : `${room.type} · ${room.area}m²`}
                                        </div>

                                        {/* Price & Operational Warning Icons */}
                                        <div className="mt-1 pt-1 flex items-center justify-between text-[10px] border-t border-slate-100 dark:border-slate-700/60">
                                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            {(room.price / 1000000).toFixed(1)} tr/th
                                          </span>

                                          <div className="flex items-center gap-1">
                                            {room.hasExpiringContract && (
                                              <span title="Hợp đồng sắp hết hạn trong 30 ngày">
                                                <Clock className="w-3 h-3 text-amber-500" />
                                              </span>
                                            )}
                                            {room.hasDebtWarning && (
                                              <span title="Có công nợ tiền nhà quá hạn">
                                                <AlertTriangle className="w-3 h-3 text-rose-500" />
                                              </span>
                                            )}
                                            {room.isIncompleteRegistration && (
                                              <span title="Tạm trú chưa hoàn thiện">
                                                <UserCheck className="w-3 h-3 text-purple-500" />
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

                {/* Building Foot Status */}
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-500" /> Hunonic IoT:{' '}
                    {bld.hunonicGatewayStatus || 'Chưa gắn'}
                  </span>
                  <span>
                    Quản lý: <b>{bld.managerName || 'Chưa phân công'}</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ========================================================
           VIEW B: ARCHITECTURAL FLOORPLAN & 3D VIEW (Dynamic)
           ======================================================== */
        <div className="space-y-4">
          {/* Header of Active Building */}
          <div className="p-4 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {currentFloorplanBuilding?.code} — {currentFloorplanBuilding?.name}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                  ● Đang hoạt động
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                📍 {currentFloorplanBuilding?.address}, {currentFloorplanBuilding?.ward}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Đổi tòa:</span>
              <select
                value={activeBuildingCode}
                onChange={e => {
                  setActiveBuildingCode(e.target.value);
                  const b = buildings.find(x => x.code === e.target.value);
                  if (b && b.floorsSummary.length > 0) {
                    setActiveFloor(b.floorsSummary[0].floor);
                  }
                }}
                className="text-xs font-bold py-1.5 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg border-0"
              >
                {scopedBuildings.map(b => (
                  <option key={b.id} value={b.code}>
                    {b.code} ({rooms.filter(r => r.buildingId === b.id).length} phòng)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Three-Column Interactive Floorplan Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column (3 Cols): Floor Tabs */}
            <div className="lg:col-span-3 p-4 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Chọn Tầng Tòa Nhà
                </h4>

                {/* Floor Selector Stack */}
                <div className="space-y-2">
                  {currentFloorplanBuilding?.floorsSummary
                    .slice()
                    .reverse()
                    .map(fl => {
                      const flRooms = rooms.filter(
                        r => r.buildingCode === activeBuildingCode && r.floor === fl.floor
                      );
                      const isFlActive = activeFloor === fl.floor;

                      return (
                        <button
                          key={fl.floor}
                          onClick={() => setActiveFloor(fl.floor)}
                          className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                            isFlActive
                              ? 'border-brand-primary ring-2 ring-brand-primary/20 bg-blue-50 dark:bg-blue-950/60 font-bold text-brand-primary'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            <span>{fl.floorName}</span>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-500 shadow-xs">
                            {flRooms.length} phòng
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* 3D Isometric Cutaway Graphic */}
              <div className="mt-4 p-3 bg-slate-100/70 dark:bg-slate-800/50 rounded-xl text-center border border-dashed border-slate-300 dark:border-slate-700">
                <div className="w-full h-36 rounded-lg bg-gradient-to-b from-blue-100 to-indigo-100 dark:from-slate-800 dark:to-slate-900 flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#2563eb_1px,transparent_1px)] [background-size:12px_12px]" />
                  <Building2 className="w-12 h-12 text-brand-primary/60 mb-1" />
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Mô hình mặt bằng động
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Đang chọn: Tầng {activeFloor}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Column (6 Cols): 2D Architectural Floor Plan */}
            <div className="lg:col-span-6 p-4 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-brand-primary" /> Sơ đồ mặt bằng Tầng {activeFloor}
                  </h4>

                  {/* Status Legend */}
                  <div className="flex items-center gap-2 text-[10px] flex-wrap">
                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span> Đã thuê
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Trống
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> HĐ hết hạn
                    </span>
                    <span className="flex items-center gap-1 text-rose-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> Nợ quá hạn
                    </span>
                  </div>
                </div>

                {/* Interactive SVG Floor Plan Canvas */}
                <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 relative overflow-hidden min-h-[300px] flex items-center justify-center">
                  <svg
                    viewBox="0 0 600 340"
                    className="w-full h-auto max-h-[340px] drop-shadow-sm select-none"
                  >
                    {/* Outer building boundary */}
                    <rect
                      x="20"
                      y="20"
                      width="560"
                      height="300"
                      fill="#F8FAFC"
                      stroke="#94A3B8"
                      strokeWidth="4"
                      rx="8"
                      className="dark:fill-slate-800 dark:stroke-slate-600"
                    />

                    {/* Central Corridor / Staircase */}
                    <rect
                      x="260"
                      y="20"
                      width="80"
                      height="300"
                      fill="#E2E8F0"
                      stroke="#94A3B8"
                      strokeWidth="2"
                      className="dark:fill-slate-700 dark:stroke-slate-600"
                    />
                    <line x1="260" y1="60" x2="340" y2="60" stroke="#CBD5E1" strokeWidth="2" />
                    <line x1="260" y1="100" x2="340" y2="100" stroke="#CBD5E1" strokeWidth="2" />
                    <line x1="260" y1="140" x2="340" y2="140" stroke="#CBD5E1" strokeWidth="2" />
                    <line x1="260" y1="180" x2="340" y2="180" stroke="#CBD5E1" strokeWidth="2" />
                    <line x1="260" y1="220" x2="340" y2="220" stroke="#CBD5E1" strokeWidth="2" />
                    <line x1="260" y1="260" x2="340" y2="260" stroke="#CBD5E1" strokeWidth="2" />
                    <text
                      x="300"
                      y="160"
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize="11"
                      fontWeight="bold"
                    >
                      HÀNH LANG
                    </text>

                    {/* Dynamic rooms on this floor */}
                    {(() => {
                      const floorRooms = rooms.filter(
                        r => r.buildingCode === activeBuildingCode && r.floor === activeFloor
                      );
                      const roomLeft = floorRooms[0];
                      const roomRight = floorRooms[1];

                      return (
                        <>
                          {roomLeft && (
                            <g
                              onClick={() => setSelectedRoom(roomLeft)}
                              className="cursor-pointer group"
                            >
                              <rect
                                x="35"
                                y="35"
                                width="210"
                                height="270"
                                fill={
                                  selectedRoom?.id === roomLeft.id
                                    ? '#DBEAFE'
                                    : roomLeft.status === 'OCCUPIED'
                                    ? '#EFF6FF'
                                    : '#ECFDF5'
                                }
                                stroke={
                                  selectedRoom?.id === roomLeft.id
                                    ? '#2563EB'
                                    : roomLeft.status === 'OCCUPIED'
                                    ? '#3B82F6'
                                    : '#10B981'
                                }
                                strokeWidth={selectedRoom?.id === roomLeft.id ? '3' : '2'}
                                rx="6"
                                className="transition-all hover:filter hover:brightness-95"
                              />
                              <rect
                                x="50"
                                y="50"
                                width="60"
                                height="70"
                                fill="#E2E8F0"
                                rx="3"
                                stroke="#CBD5E1"
                              />
                              <text x="80" y="90" textAnchor="middle" fill="#94A3B8" fontSize="9">
                                Giường
                              </text>
                              <rect
                                x="130"
                                y="50"
                                width="40"
                                height="40"
                                fill="#E2E8F0"
                                rx="3"
                                stroke="#CBD5E1"
                              />
                              <text x="150" y="75" textAnchor="middle" fill="#94A3B8" fontSize="8">
                                WC
                              </text>

                              <rect
                                x="75"
                                y="150"
                                width="130"
                                height="45"
                                fill="#FFFFFF"
                                rx="6"
                                stroke="#E2E8F0"
                                className="dark:fill-slate-800 dark:stroke-slate-700"
                              />
                              <text
                                x="140"
                                y="172"
                                textAnchor="middle"
                                fill="#1E293B"
                                fontSize="15"
                                fontWeight="bold"
                                className="dark:fill-white"
                              >
                                {roomLeft.code}
                              </text>
                              <text x="140" y="187" textAnchor="middle" fill="#64748B" fontSize="10">
                                {roomLeft.status === 'OCCUPIED' ? '● Đang ở' : '● Đang trống'}
                              </text>
                            </g>
                          )}

                          {roomRight && (
                            <g
                              onClick={() => setSelectedRoom(roomRight)}
                              className="cursor-pointer group"
                            >
                              <rect
                                x="355"
                                y="35"
                                width="210"
                                height="270"
                                fill={
                                  selectedRoom?.id === roomRight.id
                                    ? '#DBEAFE'
                                    : roomRight.status === 'OCCUPIED'
                                    ? '#EFF6FF'
                                    : '#ECFDF5'
                                }
                                stroke={
                                  selectedRoom?.id === roomRight.id
                                    ? '#2563EB'
                                    : roomRight.status === 'OCCUPIED'
                                    ? '#3B82F6'
                                    : '#10B981'
                                }
                                strokeWidth={selectedRoom?.id === roomRight.id ? '3' : '2'}
                                rx="6"
                                className="transition-all hover:filter hover:brightness-95"
                              />
                              <rect
                                x="490"
                                y="50"
                                width="60"
                                height="70"
                                fill="#E2E8F0"
                                rx="3"
                                stroke="#CBD5E1"
                              />
                              <text x="520" y="90" textAnchor="middle" fill="#94A3B8" fontSize="9">
                                Giường
                              </text>
                              <rect
                                x="430"
                                y="50"
                                width="40"
                                height="40"
                                fill="#E2E8F0"
                                rx="3"
                                stroke="#CBD5E1"
                              />
                              <text x="450" y="75" textAnchor="middle" fill="#94A3B8" fontSize="8">
                                WC
                              </text>

                              <rect
                                x="395"
                                y="150"
                                width="130"
                                height="45"
                                fill="#FFFFFF"
                                rx="6"
                                stroke="#E2E8F0"
                                className="dark:fill-slate-800 dark:stroke-slate-700"
                              />
                              <text
                                x="460"
                                y="172"
                                textAnchor="middle"
                                fill="#1E293B"
                                fontSize="15"
                                fontWeight="bold"
                                className="dark:fill-white"
                              >
                                {roomRight.code}
                              </text>
                              <text x="460" y="187" textAnchor="middle" fill="#64748B" fontSize="10">
                                {roomRight.status === 'OCCUPIED' ? '● Đang ở' : '● Đang trống'}
                              </text>
                            </g>
                          )}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-slate-400 text-center">
                💡 Nhấp trực tiếp vào ô phòng trên mặt bằng để mở hồ sơ vận hành chi tiết
              </p>
            </div>

            {/* Right Column (3 Cols): Floor Info & Selected Rooms */}
            <div className="lg:col-span-3 p-4 bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-xl flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Thông tin Tầng {activeFloor}
                </h4>

                <div className="grid grid-cols-2 gap-2 text-center py-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl mb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Tạm trú</span>
                    <strong className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {
                        rooms.filter(
                          r =>
                            r.buildingCode === activeBuildingCode &&
                            r.floor === activeFloor &&
                            r.currentTenant
                        ).length
                      }{' '}
                      người
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Đã thuê</span>
                    <strong className="text-sm font-bold text-brand-primary">
                      {
                        rooms.filter(
                          r =>
                            r.buildingCode === activeBuildingCode &&
                            r.floor === activeFloor &&
                            r.status === 'OCCUPIED'
                        ).length
                      }
                      /
                      {
                        rooms.filter(
                          r => r.buildingCode === activeBuildingCode && r.floor === activeFloor
                        ).length
                      }
                    </strong>
                  </div>
                </div>

                {/* Rooms of this floor */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {rooms
                    .filter(r => r.buildingCode === activeBuildingCode && r.floor === activeFloor)
                    .map(r => (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRoom(r)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          selectedRoom?.id === r.id
                            ? 'border-brand-primary bg-blue-50/60 dark:bg-blue-950/60'
                            : 'border-slate-200 dark:border-slate-800 hover:border-brand-primary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {r.code}
                          </strong>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              r.status === 'OCCUPIED'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {r.status === 'OCCUPIED' ? 'Đang ở' : 'Đang trống'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {r.type} • {r.area}m² • {(r.price / 1000000).toFixed(1)} tr/th
                        </p>
                      </div>
                    ))}
                </div>
              </div>

              <button
                onClick={() => setViewMode('portfolio')}
                className="mt-4 w-full py-2 text-xs font-semibold text-brand-primary border border-brand-primary/30 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
              >
                Quay lại Bảng Portfolio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ROOM DETAIL DRAWER (Enhanced Operational Hub with ESC Support) */}
      {selectedRoom && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
          onClick={() => setSelectedRoom(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-appBorder-light dark:border-appBorder-dark flex flex-col z-10 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary font-bold">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Căn hộ {selectedRoom.code}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedRoom.buildingName} • {selectedRoom.floorName} • {selectedRoom.type} (
                    {selectedRoom.area}m²)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setDeleteTarget({
                      type: 'room',
                      id: selectedRoom.id,
                      code: selectedRoom.code,
                      name: `Căn hộ ${selectedRoom.code}`,
                    });
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                  title="Xóa an toàn căn hộ này"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50"
                  title="Đóng (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status & Price Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl flex items-center justify-between border border-appBorder-light dark:border-appBorder-dark">
                <div>
                  <span className="text-[11px] text-slate-400 block">Giá thuê niêm yết</span>
                  <strong className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedRoom.price.toLocaleString('vi-VN')}₫
                    <span className="text-xs font-normal text-slate-400">/tháng</span>
                  </strong>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full ${
                    selectedRoom.status === 'OCCUPIED'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : selectedRoom.status === 'AVAILABLE'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {selectedRoom.status === 'OCCUPIED'
                    ? 'Đang cho thuê'
                    : selectedRoom.status === 'AVAILABLE'
                    ? 'Phòng trống'
                    : 'Đang giữ cọc'}
                </span>
              </div>

              {/* Warning Alert if any */}
              {selectedRoom.hasExpiringContract && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <Clock className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>Hợp đồng thuê căn hộ này sắp hết hạn trong vòng 13 ngày.</span>
                </div>
              )}

              {selectedRoom.hasDebtWarning && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center gap-2 text-xs text-rose-800 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                  <span>Phòng đang có hóa đơn quá hạn chưa thanh toán.</span>
                </div>
              )}

              {selectedRoom.isIncompleteRegistration && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 rounded-xl flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 flex-shrink-0 text-purple-600" />
                    <span>Hồ sơ tạm trú chưa hoàn thiện</span>
                  </div>
                  <button
                    onClick={() =>
                      alert(`Mở mẫu khai báo tạm trú công an phường cho ${selectedRoom.code}`)
                    }
                    className="text-[11px] font-bold text-purple-700 dark:text-purple-300 underline"
                  >
                    Khai báo ngay
                  </button>
                </div>
              )}

              {/* Tenant Profile Information */}
              {selectedRoom.currentTenant ? (
                <div className="p-4 border border-appBorder-light dark:border-appBorder-dark rounded-xl space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-brand-primary" /> Khách thuê hiện tại
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Họ và tên:</span>
                      <strong className="text-slate-800 dark:text-slate-200">
                        {selectedRoom.currentTenant.name}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Số điện thoại:</span>
                      <a
                        href={`tel:${selectedRoom.currentTenant.phone}`}
                        className="text-brand-primary font-semibold flex items-center gap-1 hover:underline"
                      >
                        <Phone className="w-3 h-3" /> {selectedRoom.currentTenant.phone}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Hạn hợp đồng:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedRoom.currentTenant.contractEnd}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tiền cọc giữ:</span>
                      <span className="font-semibold text-emerald-600">
                        {selectedRoom.currentTenant.depositAmount.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Công nợ hiện tại:</span>
                      <span
                        className={`font-bold ${
                          selectedRoom.currentTenant.debtAmount > 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {selectedRoom.currentTenant.debtAmount > 0
                          ? `${selectedRoom.currentTenant.debtAmount.toLocaleString('vi-VN')}₫ (Quá hạn)`
                          : '0₫ (Đã thanh toán đầy đủ)'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center py-6">
                  <p className="text-xs text-slate-500">
                    Căn hộ hiện đang trống, sẵn sàng đón khách thuê mới
                  </p>
                  <button
                    onClick={() => alert(`Lập hợp đồng cho phòng ${selectedRoom.code}`)}
                    className="mt-3 px-3.5 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-hover shadow-sm"
                  >
                    Tạo hợp đồng thuê mới
                  </button>
                </div>
              )}

              {/* Hunonic IoT Live Metering */}
              <div className="p-3.5 border border-appBorder-light dark:border-appBorder-dark rounded-xl space-y-2.5 bg-cyan-50/30 dark:bg-cyan-950/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-600" /> Chỉ số công tơ Hunonic IoT
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      selectedRoom.meterStatus.hunonicOnline
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {selectedRoom.meterStatus.hunonicOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] block">Số điện hiện tại</span>
                    <strong className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {selectedRoom.meterStatus.electricLastKwh} kWh
                    </strong>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-400 text-[10px] block">Số nước hiện tại</span>
                    <strong className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {selectedRoom.meterStatus.waterLastM3} m³
                    </strong>
                  </div>
                </div>

                <p className="text-[10.5px] text-slate-400">
                  Mã thiết bị:{' '}
                  <code className="font-mono text-slate-600 dark:text-slate-300">
                    {selectedRoom.meterStatus.electricMeterId}
                  </code>{' '}
                  • Cập nhật: {selectedRoom.meterStatus.lastSynced}
                </p>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-3.5 border-t border-appBorder-light dark:border-appBorder-dark bg-slate-50 dark:bg-slate-800/80 flex items-center gap-2">
              <button
                onClick={() => alert(`Lập hóa đơn chu kỳ cho ${selectedRoom.code}`)}
                className="flex-1 py-2 text-xs font-semibold bg-brand-primary text-white rounded-xl hover:bg-brand-hover shadow-sm"
              >
                Xuất hóa đơn
              </button>
              <button
                onClick={() => alert(`Ghi nhận tiền cọc / thanh toán cho ${selectedRoom.code}`)}
                className="flex-1 py-2 text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-300"
              >
                Thu tiền / Cọc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODALS */}
      <CreateBuildingModal
        isOpen={isCreateBuildingOpen}
        onClose={() => setIsCreateBuildingOpen(false)}
        onCreated={bldId => {
          setActiveBuildingId(bldId);
        }}
      />

      <EditBuildingModal
        isOpen={!!editingBuilding}
        building={editingBuilding}
        onClose={() => setEditingBuilding(null)}
        onRequestDelete={bldId => {
          const b = buildings.find(x => x.id === bldId);
          if (b) {
            setDeleteTarget({
              type: 'building',
              id: b.id,
              code: b.code,
              name: b.name,
            });
          }
        }}
      />

      <CreateFloorModal
        isOpen={!!createFloorBuildingId}
        buildingId={createFloorBuildingId || undefined}
        onClose={() => setCreateFloorBuildingId(null)}
      />

      <CreateRoomModal
        isOpen={!!createRoomTarget}
        buildingId={createRoomTarget?.buildingId}
        floor={createRoomTarget?.floor}
        onClose={() => setCreateRoomTarget(null)}
      />

      <SafeDeleteModal
        isOpen={!!deleteTarget}
        targetType={deleteTarget?.type || 'building'}
        targetId={deleteTarget?.id || ''}
        targetCode={deleteTarget?.code || ''}
        targetName={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        onSuccess={() => {
          if (deleteTarget?.type === 'room' && selectedRoom?.id === deleteTarget.id) {
            setSelectedRoom(null);
          }
        }}
      />
    </div>
  );
};
