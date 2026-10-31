import React, { useState, useEffect } from 'react';
import {
  X,
  Home,
  Users,
  Wallet,
  FileSignature,
  Receipt,
  Globe,
  EyeOff,
  Zap,
  Droplets,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  Phone,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { usePortfolio } from '../../../app/providers/PortfolioContext';
import { useAuth } from '../../../app/providers/AuthContext';
import { ConsoleRoomDto, RoomOccupantDto } from '../../../shared/types/portfolio';

interface Props {
  isOpen: boolean;
  room: ConsoleRoomDto | null;
  onClose: () => void;
  onOpenContractWizard: (roomId: string, reservationId?: string) => void;
  onOpenReservationModal: (roomId: string) => void;
  onOpenExtendModal?: (contract: any) => void;
  onOpenTerminateModal?: (contract: any) => void;
  onEditRoom?: (room: ConsoleRoomDto) => void;
  onOpenLegacyImport?: (roomId: string) => void;
}

export const RoomProfileModal: React.FC<Props> = ({
  isOpen,
  room,
  onClose,
  onOpenContractWizard,
  onOpenReservationModal,
  onOpenExtendModal,
  onOpenTerminateModal,
  onEditRoom,
  onOpenLegacyImport,
}) => {
  const { refreshPortfolio } = usePortfolio();
  const { user, hasCapability } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'occupants' | 'deposits' | 'contracts' | 'finance'>('overview');
  const [occupantsList, setOccupantsList] = useState<RoomOccupantDto[]>([]);
  const [isLoadingOccupants, setIsLoadingOccupants] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // New occupant form state
  const [isAddingOccupant, setIsAddingOccupant] = useState<boolean>(false);
  const [occFullName, setOccFullName] = useState<string>('');
  const [occPhone, setOccPhone] = useState<string>('');
  const [occIdNumber, setOccIdNumber] = useState<string>('');
  const [occRelation, setOccRelation] = useState<'FAMILY' | 'ROOMMATE' | 'OTHER'>('ROOMMATE');
  const [occRegStatus, setOccRegStatus] = useState<'PENDING' | 'REGISTERED' | 'EXPIRED'>('PENDING');

  // Handover baseline modal
  const [isHandoverOpen, setIsHandoverOpen] = useState<boolean>(false);
  const [handoverKwh, setHandoverKwh] = useState<number>(0);
  const [handoverM3, setHandoverM3] = useState<number>(0);

  // Cancel reservation modal
  const [isCancelResvOpen, setIsCancelResvOpen] = useState<boolean>(false);
  const [cancelRefundVnd, setCancelRefundVnd] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState<string>('Khách hủy không thuê');

  // Load occupants when room changes or modal opens
  const loadOccupants = async () => {
    if (!room) return;
    setIsLoadingOccupants(true);
    try {
      const res = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/occupants`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.occupants)) {
        setOccupantsList(data.occupants);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingOccupants(false);
    }
  };

  useEffect(() => {
    if (isOpen && room) {
      setActiveTab('overview');
      setActionFeedback(null);
      void loadOccupants();
    }
  }, [isOpen, room?.id]);

  if (!isOpen || !room) return null;

  const canManageRooms = hasCapability('canManageRooms');
  const canManageContracts = hasCapability('canManageContracts');
  const canPublishRooms = Boolean(user?.permissions.includes('rooms.publish.write'));

  // Toggle Landing publication
  const handleToggleRoomPublish = async () => {
    try {
      const nextStatus = !room.isPublishedToLanding;
      const res = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublishedToLanding: nextStatus }),
      });
      if (res.ok) {
        await refreshPortfolio();
        setActionFeedback(
          nextStatus
            ? 'Đã xuất bản phòng thành công lên Landing Page.'
            : 'Đã gỡ phòng khỏi Landing Page (chỉ lưu hành nội bộ).'
        );
      }
    } catch {
      setActionFeedback('Lỗi kết nối khi cập nhật trạng thái xuất bản.');
    }
  };

  // Add new occupant
  const handleAddOccupantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!occFullName.trim()) return;

    try {
      const res = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(room.id)}/occupants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: occFullName.trim(),
          phone: occPhone.trim() || undefined,
          idNumber: occIdNumber.trim() || undefined,
          relationToPrimary: occRelation,
          residenceRegStatus: occRegStatus,
        }),
      });
      if (res.ok) {
        setIsAddingOccupant(false);
        setOccFullName('');
        setOccPhone('');
        setOccIdNumber('');
        await loadOccupants();
        await refreshPortfolio();
        setActionFeedback('Đã thêm người lưu trú thành công.');
      }
    } catch {
      setActionFeedback('Lỗi kết nối khi thêm người lưu trú.');
    }
  };

  // Remove occupant
  const handleRemoveOccupant = async (occId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa người lưu trú này?')) return;
    try {
      const res = await fetch(`/api/v1/console/v2/occupants/${encodeURIComponent(occId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadOccupants();
        await refreshPortfolio();
        setActionFeedback('Đã xóa người lưu trú.');
      }
    } catch {
      setActionFeedback('Lỗi kết nối khi xóa người lưu trú.');
    }
  };

  // Confirm Reservation Payment
  const handleConfirmReservationPayment = async (resvId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/reservations/${encodeURIComponent(resvId)}/confirm-payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethod: 'BANK_TRANSFER' }),
        }
      );
      if (res.ok) {
        await refreshPortfolio();
        setActionFeedback('Đã xác nhận thu tiền cọc giữ phòng và ghi nhận sổ quỹ.');
      }
    } catch {
      setActionFeedback('Lỗi xác nhận thanh toán.');
    }
  };

  // Submit Cancel Reservation
  const handleCancelReservationSubmit = async (resvId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/reservations/${encodeURIComponent(resvId)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: cancelReason,
            refundAmountVnd: cancelRefundVnd,
          }),
        }
      );
      if (res.ok) {
        setIsCancelResvOpen(false);
        await refreshPortfolio();
        setActionFeedback('Đã hủy phiếu giữ chỗ và hoàn trả trạng thái phòng.');
      }
    } catch {
      setActionFeedback('Lỗi kết nối khi hủy giữ chỗ.');
    }
  };

  // Submit Handover baseline
  const handleHandoverSubmit = async (contractId: string) => {
    try {
      const res = await fetch(
        `/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/handover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handoverMeterKwh: handoverKwh,
            handoverWaterM3: handoverM3,
          }),
        }
      );
      if (res.ok) {
        setIsHandoverOpen(false);
        await refreshPortfolio();
        setActionFeedback('Đã ghi nhận bàn giao phòng và chỉ số công tơ cơ sở.');
      }
    } catch {
      setActionFeedback('Lỗi kết nối khi bàn giao phòng.');
    }
  };

  return (
    <div
      data-testid="room-profile-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
    >
      <div
        data-testid="room-detail-drawer"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                Phòng {room.code}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                  room.occupancyStatus === 'AVAILABLE'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : room.occupancyStatus === 'RESERVED'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : room.occupancyStatus === 'OCCUPIED'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {room.occupancyStatus === 'AVAILABLE'
                  ? 'Còn trống'
                  : room.occupancyStatus === 'RESERVED'
                  ? 'Đang giữ chỗ'
                  : room.occupancyStatus === 'OCCUPIED'
                  ? 'Đang thuê'
                  : room.occupancyStatus}
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {room.rentalModel === 'SHARED_ROOM' ? '· Ở ghép' : '· Nguyên căn'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {room.buildingCode} — {room.buildingName} · {room.floorName} · {room.roomType} ({room.area}m²)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onEditRoom && (
              <button
                type="button"
                data-testid="btn-open-edit-room"
                onClick={() => onEditRoom(room)}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
              >
                Cấu hình phòng
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 5 NAVIGATION TABS */}
        <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 bg-slate-50/80 dark:bg-slate-900/40 shrink-0 overflow-x-auto text-xs">
          {[
            { id: 'overview', label: '1. Tổng quan', icon: Home },
            { id: 'occupants', label: `2. Khách lưu trú (${occupantsList.length})`, icon: Users },
            { id: 'deposits', label: '3. Đặt cọc & Giữ chỗ', icon: Wallet },
            { id: 'contracts', label: '4. Hợp đồng', icon: FileSignature },
            { id: 'finance', label: '5. Tài chính & Công tơ', icon: Receipt },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`room-modal-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand-primary text-brand-primary dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* FEEDBACK ALERT */}
        {actionFeedback && (
          <div className="p-3 mx-5 mt-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
            <span>{actionFeedback}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="p-1 text-blue-500 hover:text-blue-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB CONTENTS */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* TAB 1: TỔNG QUAN */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                <div>
                  <span className="text-[11px] text-slate-400 block">Giá thuê niêm yết</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {room.listPriceVnd.toLocaleString('vi-VN')} đ/th
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Chính sách cọc</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Cọc {room.depositMonths} tháng
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Ở tối đa</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {room.maxOccupants} người
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Mô hình</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {room.rentalModel === 'SHARED_ROOM' ? 'Ở ghép' : 'Nguyên căn'}
                  </span>
                </div>
              </div>

              {/* Landing Publication Card */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    {room.isPublishedToLanding ? (
                      <Globe className="w-4 h-4 text-brand-primary" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-slate-400" />
                    )}
                    Trạng thái xuất bản Landing Page
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                      room.isPublishedToLanding
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {room.isPublishedToLanding ? 'Đang hiển thị trên Web' : 'Chỉ lưu hành nội bộ'}
                  </span>
                </div>
                {canPublishRooms && (
                  <button
                    type="button"
                    onClick={handleToggleRoomPublish}
                    className="w-full py-2 rounded-lg font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors"
                  >
                    {room.isPublishedToLanding
                      ? 'Gỡ khỏi Landing Page (giữ nguyên dữ liệu nội bộ)'
                      : 'Xuất bản phòng này lên Landing Page'}
                  </button>
                )}
              </div>

              {/* Effective Tariffs */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-100">
                  Biểu giá điện &amp; nước áp dụng
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block">Điện tiêu thụ</span>
                    <b className="text-slate-900 dark:text-white">
                      {room.effectiveElectricRateVnd.toLocaleString('vi-VN')} đ/kWh
                    </b>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block">Nước sinh hoạt ({room.effectiveWaterMethod})</span>
                    <b className="text-slate-900 dark:text-white">
                      {room.effectiveWaterRateVnd.toLocaleString('vi-VN')} đ
                    </b>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KHÁCH LƯU TRÚ & NGƯỜI Ở CÙNG */}
          {activeTab === 'occupants' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">
                    Danh sách người lưu trú tại phòng {room.code}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Tách bạch giữa Khách đứng tên hợp đồng và Người cùng ở (nhân khẩu tạm trú).
                  </p>
                </div>
                {canManageContracts && (
                  <button
                    type="button"
                    onClick={() => setIsAddingOccupant(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-primary text-white flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm người lưu trú
                  </button>
                )}
              </div>

              {/* Add Occupant Form Drawer/Card */}
              {isAddingOccupant && (
                <form
                  onSubmit={handleAddOccupantSubmit}
                  className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-3"
                >
                  <div className="font-bold text-xs text-blue-900 dark:text-blue-200">
                    Thêm người cùng lưu trú vào phòng {room.code}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Họ và tên *"
                      value={occFullName}
                      onChange={(e) => setOccFullName(e.target.value)}
                      required
                      className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="Số điện thoại"
                      value={occPhone}
                      onChange={(e) => setOccPhone(e.target.value)}
                      className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      placeholder="Số CCCD"
                      value={occIdNumber}
                      onChange={(e) => setOccIdNumber(e.target.value)}
                      className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <select
                      value={occRelation}
                      onChange={(e) => setOccRelation(e.target.value as any)}
                      className="p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="ROOMMATE">Bạn cùng phòng</option>
                      <option value="FAMILY">Người thân / Gia đình</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingOccupant(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg"
                    >
                      Lưu người lưu trú
                    </button>
                  </div>
                </form>
              )}

              {/* Occupants List */}
              {occupantsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Chưa có người lưu trú nào được gắn với phòng {room.code}.
                </div>
              ) : (
                <div className="space-y-2">
                  {occupantsList.map((occ) => (
                    <div
                      key={occ.id}
                      className="p-3 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800 flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {occ.fullName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              occ.relationToPrimary === 'PRIMARY'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {occ.relationToPrimary === 'PRIMARY'
                              ? 'Chủ hợp đồng'
                              : occ.relationToPrimary === 'FAMILY'
                              ? 'Người thân'
                              : 'Người ở cùng'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              occ.residenceRegStatus === 'REGISTERED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            Tạm trú: {occ.residenceRegStatus === 'REGISTERED' ? 'Đã ĐK' : 'Chờ ĐK'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {occ.phone ? `SĐT: ${occ.phone}` : 'Chưa có SĐT'}{' '}
                          {occ.idNumber ? `· CCCD: ${occ.idNumber}` : ''} · Ngày vào: {occ.moveInDate}
                        </div>
                      </div>

                      {canManageContracts && occ.relationToPrimary !== 'PRIMARY' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOccupant(occ.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ĐẶT CỌC & GIỮ CHỖ */}
          {activeTab === 'deposits' && (
            <div className="space-y-4">
              {room.activeReservation ? (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-amber-600" />
                      Phiếu giữ chỗ hiện tại ({room.activeReservation.reservationCode})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {room.activeReservation.status === 'CONFIRMED' ? 'Đã thu cọc' : 'Chờ thu cọc'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Khách giữ chỗ: <b>{room.activeReservation.customerName}</b></div>
                    <div>Số điện thoại: <b>{room.activeReservation.customerPhone}</b></div>
                    <div>Tiền giữ phòng: <b>{room.activeReservation.holdAmountVnd.toLocaleString('vi-VN')} đ</b></div>
                    <div>Hạn giữ chỗ: <b>{room.activeReservation.holdUntil ? room.activeReservation.holdUntil.slice(0, 10) : 'Chưa đặt'}</b></div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900 flex items-center justify-end gap-2">
                    {room.activeReservation.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleConfirmReservationPayment(room.activeReservation!.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      >
                        Xác nhận đã nhận tiền cọc
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCancelResvOpen(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    >
                      Hủy giữ chỗ
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenContractWizard(room.id, room.activeReservation!.id)}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white shadow-sm flex items-center gap-1"
                    >
                      Chuyển thành Hợp đồng thuê <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <p>Phòng {room.code} hiện không có phiếu giữ chỗ nào đang hoạt động.</p>
                  {room.occupancyStatus === 'AVAILABLE' && (
                    <button
                      type="button"
                      onClick={() => onOpenReservationModal(room.id)}
                      className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tạo phiếu giữ chỗ mới
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HỢP ĐỒNG THUÊ */}
          {activeTab === 'contracts' && (
            <div className="space-y-4">
              {room.activeContract ? (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FileSignature className="w-4 h-4 text-brand-primary" />
                      {room.activeContract.contractCode}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {room.activeContract.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Thời hạn: <b>{room.activeContract.startDate} → {room.activeContract.endDate}</b></div>
                    <div>Giá thuê: <b>{room.activeContract.monthlyRentVnd.toLocaleString('vi-VN')} đ/tháng</b></div>
                    {room.currentTenant && (
                      <div>Chủ hợp đồng: <b>{room.currentTenant.fullName} ({room.currentTenant.phone})</b></div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsHandoverOpen(true)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    >
                      Bàn giao phòng (Ghi chỉ số)
                    </button>
                    {onOpenExtendModal && (
                      <button
                        type="button"
                        onClick={() => onOpenExtendModal(room.activeContract)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                      >
                        Gia hạn
                      </button>
                    )}
                    {onOpenTerminateModal && (
                      <button
                        type="button"
                        onClick={() => onOpenTerminateModal(room.activeContract)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                      >
                        Thanh lý hợp đồng
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <p>Phòng {room.code} chưa có hợp đồng thuê hoạt động.</p>
                  <button
                    type="button"
                    onClick={() => onOpenContractWizard(room.id)}
                    className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm inline-flex items-center gap-1.5"
                  >
                    <FileSignature className="w-3.5 h-3.5" /> Lập hợp đồng mới ngay
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: TÀI CHÍNH & CÔNG TƠ */}
          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Hóa đơn &amp; Công nợ</span>
                  {room.unpaidInvoicesCount > 0 ? (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Còn {room.unpaidInvoicesCount} hóa đơn chưa thu ({room.unpaidAmountVnd.toLocaleString('vi-VN')} đ)
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã hoàn tất đối soát
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Công tơ điện thông minh
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Trạng thái kết nối Hunonic: <b>{room.meterStatus}</b>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER WITH DYNAMIC PRIMARY ACTION */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#111827]">
          <span className="text-xs text-slate-400">
            Trạng thái phòng: <b>{room.occupancyStatus}</b>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Đóng
            </button>

            {/* Dynamic Buttons based on Room Status (C4-LIFE-01: 3 Explicit Entry Intents) */}
            {room.occupancyStatus === 'AVAILABLE' && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  data-testid="btn-room-intent-reserve"
                  onClick={() => onOpenReservationModal(room.id)}
                  className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Giữ chỗ - đặt cọc
                </button>
                <button
                  type="button"
                  data-testid="btn-room-intent-direct-contract"
                  onClick={() => onOpenContractWizard(room.id)}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <FileSignature className="w-3.5 h-3.5" />
                  Thuê ngay - hợp đồng mới
                </button>
                <button
                  type="button"
                  data-testid="btn-room-intent-legacy-import"
                  onClick={() => {
                    if (onOpenLegacyImport) {
                      onOpenLegacyImport(room.id);
                    } else {
                      onOpenContractWizard(room.id);
                    }
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Đồng bộ từ sổ giấy
                </button>
              </div>
            )}

            {room.occupancyStatus === 'RESERVED' && (
              <button
                type="button"
                data-testid="room-modal-primary-btn"
                onClick={() => onOpenContractWizard(room.id, room.activeReservation?.id)}
                className="px-5 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <FileSignature className="w-3.5 h-3.5" />
                Chuyển thành Hợp đồng thuê
              </button>
            )}

            {room.occupancyStatus === 'OCCUPIED' && (
              <button
                type="button"
                data-testid="room-modal-primary-btn"
                onClick={() => setActiveTab('occupants')}
                className="px-5 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                Quản lý người đang ở ({occupantsList.length})
              </button>
            )}
          </div>
        </div>

        {/* SUB-MODAL: HANDOVER BASELINE */}
        {isHandoverOpen && room.activeContract && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-md border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Bàn giao nhận phòng {room.code} — Ghi nhận chỉ số ban đầu
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Chỉ số công tơ điện cơ sở (kWh)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={handoverKwh}
                    onChange={(e) => setHandoverKwh(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Chỉ số đồng hồ nước cơ sở (m³)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={handoverM3}
                    onChange={(e) => setHandoverM3(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsHandoverOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleHandoverSubmit(room.activeContract!.id)}
                  className="px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg"
                >
                  Lưu biên bản bàn giao
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-MODAL: CANCEL RESERVATION */}
        {isCancelResvOpen && room.activeReservation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 w-full max-w-md border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="font-bold text-sm text-rose-700 dark:text-rose-300">
                Hủy phiếu giữ chỗ {room.activeReservation.reservationCode}
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Lý do hủy</label>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Số tiền hoàn lại cho khách (VND)</label>
                  <input
                    type="number"
                    value={cancelRefundVnd}
                    onChange={(e) => setCancelRefundVnd(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tiền cọc giữ chỗ: {room.activeReservation.holdAmountVnd.toLocaleString('vi-VN')} đ. Phần không hoàn lại sẽ tự động xử lý khấu trừ / tịch thu.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelResvOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-500"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelReservationSubmit(room.activeReservation!.id)}
                  className="px-4 py-1.5 text-xs font-bold bg-rose-600 text-white rounded-lg"
                >
                  Xác nhận hủy giữ chỗ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
