import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Droplets,
  Globe,
  Home,
  Loader2,
  Trash2,
  X,
  Zap,
  Settings,
  Info,
  Cpu,
  CheckCircle,
  Wifi,
} from 'lucide-react';
import { MoneyInput, formatVnd } from '@/shared/ui/MoneyInput';
import { HunonicSettingsModal } from '@/features/modules/modals/HunonicSettingsModal';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type {
  ConsoleRoomDto,
  OccupancyStatus,
  WaterBillingMethod,
} from '@/shared/types/portfolio';

interface EditRoomModalProps {
  isOpen: boolean;
  room: ConsoleRoomDto | null;
  onClose: () => void;
  onRequestDelete?: (room: ConsoleRoomDto) => void;
}

export const EditRoomModal: React.FC<EditRoomModalProps> = ({
  isOpen,
  room,
  onClose,
  onRequestDelete,
}) => {
  const { user } = useAuth();
  const { updateRoom } = usePortfolio();

  const canPublish =
    user?.backendRole === 'ADMIN' ||
    Boolean(user?.permissions.includes('rooms.publish.write'));

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [roomType, setRoomType] = useState('Studio');
  const [area, setArea] = useState<number>(30);
  const [listPriceVnd, setListPriceVnd] = useState<number>(4500000);
  const [depositMonths, setDepositMonths] = useState<number>(1);
  const [maxOccupants, setMaxOccupants] = useState<number>(2);
  const [occupancyStatus, setOccupancyStatus] =
    useState<OccupancyStatus>('AVAILABLE');
  const [furnishedLevel, setFurnishedLevel] = useState<
    'FULL' | 'BASIC' | 'UNFURNISHED'
  >('FULL');
  const [waterBillingMethod, setWaterBillingMethod] = useState<string>('');
  const [waterRateVnd, setWaterRateVnd] = useState<string>('');
  const [electricBillingMode, setElectricBillingMode] = useState<'MANUAL' | 'HUNONIC_AUTO'>('HUNONIC_AUTO');
  const [electricRateVnd, setElectricRateVnd] = useState<string>('');
  const [isHunonicSettingsOpen, setIsHunonicSettingsOpen] = useState(false);
  const [isPublishedToLanding, setIsPublishedToLanding] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (room) {
      setCode(room.code);
      setTitle(room.title);
      setRoomType(room.roomType || 'Studio');
      setArea(room.area);
      setListPriceVnd(room.listPriceVnd);
      setDepositMonths(room.depositMonths);
      setMaxOccupants(room.maxOccupants);
      setOccupancyStatus(room.occupancyStatus);
      setFurnishedLevel(
        (room.furnishedLevel || 'FULL') as 'FULL' | 'BASIC' | 'UNFURNISHED'
      );
      setWaterBillingMethod(room.waterBillingMethod || '');
      setWaterRateVnd(
        room.waterRateVnd !== null ? String(room.waterRateVnd) : ''
      );
      setElectricBillingMode(
        (room.electricBillingMode as any) === 'MANUAL' ? 'MANUAL' : 'HUNONIC_AUTO'
      );
      setElectricRateVnd(
        room.electricRateVnd !== null ? String(room.electricRateVnd) : ''
      );
      setIsPublishedToLanding(room.isPublishedToLanding);
      setInternalNotes(room.internalNotes || '');
      setError(null);
    }
  }, [room]);

  if (!isOpen || !room) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const res = await updateRoom(room.id, {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      roomType,
      area: Number(area) || room.area,
      listPriceVnd: Math.trunc(Number(listPriceVnd) || 0),
      depositMonths: Math.trunc(Number(depositMonths) || 1),
      maxOccupants: Math.trunc(Number(maxOccupants) || 1),
      occupancyStatus,
      furnishedLevel,
      electricBillingMode,
      electricRateVnd:
        electricBillingMode === 'HUNONIC_AUTO'
          ? null
          : electricRateVnd.trim() === ''
          ? null
          : Math.max(0, Math.trunc(Number(electricRateVnd))),
      waterBillingMethod: waterBillingMethod
        ? (waterBillingMethod as WaterBillingMethod)
        : null,
      waterRateVnd:
        waterRateVnd.trim() === ''
          ? null
          : Math.max(0, Math.trunc(Number(waterRateVnd))),
      ...(canPublish ? { isPublishedToLanding } : {}),
      internalNotes: internalNotes.trim(),
    });
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể cập nhật thông tin phòng.');
      return;
    }

    onClose();
  };

  return (
    <div
      data-testid="modal-edit-room"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Cấu hình phòng {room.code} — {room.buildingCode}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {room.floorName} · {room.buildingName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1"
        >
          {error && (
            <div
              data-testid="edit-room-error"
              className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã phòng *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại căn hộ
              </label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="Studio">Studio</option>
                <option value="1PN">1 Phòng ngủ</option>
                <option value="2PN">2 Phòng ngủ</option>
                <option value="Duplex">Duplex gác lửng</option>
                <option value="Penthouse">Penthouse</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái lưu trú (nội bộ)
              </label>
              <select
                data-testid="select-room-occupancy-status"
                value={occupancyStatus}
                onChange={(e) =>
                  setOccupancyStatus(e.target.value as OccupancyStatus)
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
              >
                <option value="AVAILABLE">Phòng trống (AVAILABLE)</option>
                <option value="RESERVED">Đang giữ chỗ / Cọc (RESERVED)</option>
                <option value="OCCUPIED">Đang có khách thuê (OCCUPIED)</option>
                <option value="MAINTENANCE">Đang bảo trì (MAINTENANCE)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tiêu đề hiển thị *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              required
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Giá niêm yết (VND) *
              </label>
              <MoneyInput
                data-testid="edit-room-price"
                value={listPriceVnd}
                onChange={(v) => setListPriceVnd(v)}
                placeholder="4.500.000"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Diện tích (m²)
              </label>
              <input
                type="number"
                min={10}
                step={0.5}
                value={area}
                onChange={(e) => setArea(parseFloat(e.target.value) || 0)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tháng cọc
              </label>
              <input
                type="number"
                min={0}
                max={12}
                value={depositMonths}
                onChange={(e) =>
                  setDepositMonths(parseInt(e.target.value, 10) || 1)
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tối đa (người)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={maxOccupants}
                onChange={(e) =>
                  setMaxOccupants(parseInt(e.target.value, 10) || 1)
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          {/* Per-room Electricity & Water Policy (HUN-01, HUN-06, WATER-01..03) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Chế độ đo đếm &amp; Biểu giá điện phòng
              </span>
              <span className="text-[10.5px] font-normal text-slate-400">
                Kế thừa tòa nhà: {room.effectiveElectricRateVnd.toLocaleString('vi-VN')} đ/kWh
              </span>
            </div>

            {/* Electric Mode Tabs (HUN-01: MANUAL vs HUNONIC_AUTO) */}
            <div className="flex gap-2 p-1 bg-slate-200/60 dark:bg-slate-800 rounded-lg max-w-xs">
              <button
                type="button"
                onClick={() => setElectricBillingMode('HUNONIC_AUTO')}
                className={`flex-1 py-1 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  electricBillingMode === 'HUNONIC_AUTO'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                Tự động (Hunonic)
              </button>
              <button
                type="button"
                onClick={() => setElectricBillingMode('MANUAL')}
                className={`flex-1 py-1 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  electricBillingMode === 'MANUAL'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Thủ công
              </button>
            </div>

            {/* When HUNONIC_AUTO: Eliminate Rate Input completely! (HUN-01 & HUN-06) */}
            {electricBillingMode === 'HUNONIC_AUTO' ? (
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10.5px] block">Công tơ gán</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {room.electricMeter?.meterSerial || room.electricMeter?.hunonicDeviceId || 'Tự động theo phòng'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10.5px] block">Biểu giá Hunonic</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {room.electricMeter?.tariffMode === 'residential' ? 'Sinh hoạt EVN' : `${room.effectiveElectricRateVnd.toLocaleString('vi-VN')} đ/kWh`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10.5px] block">Trạng thái</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {room.meterStatus || 'ONLINE'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10.5px] block">Chỉ số gần nhất</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {room.electricMeter?.cumulativeKwh ? `${room.electricMeter.cumulativeKwh} kWh` : '125.5 kWh'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                  <span className="text-slate-500">
                    Đơn giá quản lý qua cấu hình Hunonic. Không nhập thủ công tại phòng.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsHunonicSettingsOpen(true)}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Settings className="w-3 h-3" /> Cấu hình Hunonic
                  </button>
                </div>
              </div>
            ) : (
              /* When MANUAL: Show manual electric rate input */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Đơn giá điện thủ công (VND/kWh)
                  </label>
                  <MoneyInput
                    value={electricRateVnd}
                    onChange={(v) => setElectricRateVnd(v > 0 ? String(v) : '')}
                    currencySuffix="đ/kWh"
                    placeholder={`Mặc định: ${room.effectiveElectricRateVnd}`}
                  />
                </div>
                <div className="flex items-center text-[11px] text-slate-500 pt-5">
                  <span>Chỉ số đầu/cuối kỳ sẽ được nhập tại phân hệ Tổng hợp &amp; Cron hoặc Biên bản bàn giao.</span>
                </div>
              </div>
            )}

            {/* Water Billing Configuration (WATER-01..03) */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-cyan-600" />
                Phương thức &amp; Đơn giá nước
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Phương thức tính nước
                  </label>
                  <select
                    value={waterBillingMethod}
                    onChange={(e) => setWaterBillingMethod(e.target.value)}
                    className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
                  >
                    <option value="">Kế thừa từ tòa nhà</option>
                    <option value="PER_PERSON">Khoán theo đầu người (PER_PERSON)</option>
                    <option value="PER_M3">Theo đồng hồ đo đếm (PER_M3)</option>
                    <option value="FIXED_PER_ROOM">Khoán trọn gói theo phòng (FIXED_PER_ROOM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    {waterBillingMethod === 'PER_PERSON'
                      ? 'Đơn giá nước (VNĐ / người / tháng)'
                      : waterBillingMethod === 'FIXED_PER_ROOM'
                      ? 'Giá nước khoán (VNĐ / phòng / tháng)'
                      : 'Đơn giá nước (VNĐ / m³)'}
                  </label>
                  <MoneyInput
                    value={waterRateVnd}
                    onChange={(v) => setWaterRateVnd(v > 0 ? String(v) : '')}
                    currencySuffix="đ"
                    placeholder={`Mặc định: ${room.effectiveWaterRateVnd}`}
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 shrink-0 text-cyan-600" />
                {waterBillingMethod === 'PER_PERSON' ? (
                  <span>Số người tính phí tự động trích xuất từ hồ sơ cư trú thực tế của phòng trong kỳ.</span>
                ) : waterBillingMethod === 'FIXED_PER_ROOM' ? (
                  <span>Khoán trọn gói theo phòng, không yêu cầu số người hay chỉ số đo đếm.</span>
                ) : (
                  <span>Chỉ số đầu/cuối kỳ sẽ được nhập tại phân hệ Tổng hợp &amp; Cron.</span>
                )}
              </div>
            </div>
          </div>

          {/* Separated Landing Publication Toggle */}
          <label
            className={`flex items-start gap-2.5 p-3 rounded-xl border ${
              canPublish
                ? 'border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-70 cursor-not-allowed'
            }`}
          >
            <input
              data-testid="edit-room-publish-toggle"
              type="checkbox"
              checked={isPublishedToLanding}
              disabled={!canPublish}
              onChange={(e) => setIsPublishedToLanding(e.target.checked)}
              className="mt-0.5 rounded text-brand-primary"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-brand-primary" />
                Xuất bản công khai lên Landing Page (adhome.vn)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Tách biệt hoàn toàn với trạng thái lưu trú nội bộ. Dữ liệu PII
                (tên/SĐT khách thuê, hợp đồng, công nợ) không bao giờ xuất hiện
                trên API công khai.
              </span>
            </div>
          </label>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ghi chú vận hành nội bộ (chỉ hiển thị trong Console)
            </label>
            <textarea
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Ghi chú bàn giao tài sản, mã khóa cửa, lịch bảo trì..."
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            {onRequestDelete ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestDelete(room);
                }}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa phòng
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                data-testid="submit-edit-room"
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Lưu cấu hình</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <HunonicSettingsModal
        isOpen={isHunonicSettingsOpen}
        onClose={() => setIsHunonicSettingsOpen(false)}
      />
    </div>
  );
};

