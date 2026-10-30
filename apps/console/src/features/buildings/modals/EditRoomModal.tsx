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
} from 'lucide-react';
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
  const [electricRateVnd, setElectricRateVnd] = useState<string>('');
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
      waterBillingMethod: waterBillingMethod
        ? (waterBillingMethod as WaterBillingMethod)
        : null,
      waterRateVnd:
        waterRateVnd.trim() === ''
          ? null
          : Math.max(0, Math.trunc(Number(waterRateVnd))),
      electricRateVnd:
        electricRateVnd.trim() === ''
          ? null
          : Math.max(0, Math.trunc(Number(electricRateVnd))),
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
              <input
                data-testid="edit-room-price"
                type="number"
                min={500000}
                step={100000}
                value={listPriceVnd}
                onChange={(e) =>
                  setListPriceVnd(parseInt(e.target.value, 10) || 0)
                }
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                required
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

          {/* Per-room Tariff Overrides (3 Water Billing Methods + Electric Rate) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-cyan-600" />
                Ghi đè biểu giá điện &amp; nước riêng cho phòng này
              </span>
              <span className="text-[10.5px] font-normal text-slate-400">
                Bỏ trống = kế thừa từ tòa nhà ({room.effectiveElectricRateVnd.toLocaleString('vi-VN')}đ/kWh)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  <Zap className="w-3 h-3 inline text-amber-500 mr-0.5" /> Giá
                  điện riêng (VND/kWh)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder={`Mặc định: ${room.effectiveElectricRateVnd}`}
                  value={electricRateVnd}
                  onChange={(e) => setElectricRateVnd(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Phương thức tính nước
                </label>
                <select
                  value={waterBillingMethod}
                  onChange={(e) => setWaterBillingMethod(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">Kế thừa từ tòa nhà</option>
                  <option value="PER_M3">Theo đồng hồ (m³)</option>
                  <option value="PER_PERSON">Theo đầu người / tháng</option>
                  <option value="FIXED_PER_ROOM">Khoán cố định / phòng</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Đơn giá nước riêng (VND)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder={`Mặc định: ${room.effectiveWaterRateVnd}`}
                  value={waterRateVnd}
                  onChange={(e) => setWaterRateVnd(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
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
    </div>
  );
};

