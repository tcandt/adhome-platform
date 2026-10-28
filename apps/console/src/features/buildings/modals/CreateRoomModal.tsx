import React, { useState } from 'react';
import { X, Home, Layers, Plus, Sparkles, CheckCircle2 } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface CreateRoomModalProps {
  isOpen: boolean;
  buildingId?: string;
  floor?: number;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  buildingId: initialBuildingId,
  floor: initialFloor,
  onClose,
}) => {
  const { buildings, addRoom, addBatchRooms } = usePortfolio();

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [buildingId, setBuildingId] = useState<string>(
    initialBuildingId || buildings[0]?.id || ''
  );

  const selectedBuilding = buildings.find(b => b.id === buildingId) || buildings[0];

  const [floor, setFloor] = useState<number>(
    initialFloor !== undefined ? initialFloor : (selectedBuilding?.floorsSummary[0]?.floor || 1)
  );

  // Single Room State
  const [code, setCode] = useState('');
  const [type, setType] = useState('1PN');
  const [area, setArea] = useState<number>(35);
  const [price, setPrice] = useState<number>(5500000);

  // Batch Rooms State
  const [batchCount, setBatchCount] = useState<number>(4);
  const [batchPrefix, setBatchPrefix] = useState<string>('50');
  const [batchStartNum, setBatchStartNum] = useState<number>(1);
  const [batchPrice, setBatchPrice] = useState<number>(5500000);
  const [batchArea, setBatchArea] = useState<number>(35);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Vui lòng nhập mã phòng (VD: 501, P31-05).');
      return;
    }

    try {
      addRoom({
        buildingId,
        code: code.trim(),
        floor,
        type,
        area: Number(area) || 30,
        price: Number(price) || 5000000,
        status: 'AVAILABLE',
      });
      setError(null);
      setSuccessMsg(`Đã tạo thành công phòng ${code.trim()}`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi tạo phòng');
    }
  };

  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (batchCount <= 0) {
      setError('Số lượng phòng phải lớn hơn 0.');
      return;
    }

    try {
      const createdRooms = addBatchRooms({
        buildingId,
        floor,
        count: Number(batchCount),
        prefix: batchPrefix.trim(),
        startNumber: Number(batchStartNum),
        type,
        area: Number(batchArea),
        price: Number(batchPrice),
      });

      setError(null);
      setSuccessMsg(`Đã tạo thành công ${createdRooms.length} phòng mới!`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi tạo hàng loạt phòng');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-2xl shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm Căn Hộ / Phòng
              </h3>
              <p className="text-xs text-slate-400">
                Tạo từng phòng hoặc khởi tạo hàng loạt theo tầng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Single vs Batch */}
        <div className="p-3 bg-slate-100/60 dark:bg-slate-800/50 border-b border-appBorder-light dark:border-appBorder-dark flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === 'single'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Thêm 1 Phòng đơn lẻ
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'batch'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Tạo hàng loạt theo tầng
          </button>
        </div>

        {/* Feedback alert */}
        <div className="px-5 pt-3">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl mb-3">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {successMsg}
            </div>
          )}
        </div>

        {/* Form Body */}
        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="p-5 pt-1 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Tòa Nhà *
                </label>
                <select
                  value={buildingId}
                  onChange={e => {
                    setBuildingId(e.target.value);
                    const b = buildings.find(x => x.id === e.target.value);
                    if (b && b.floorsSummary.length > 0) {
                      setFloor(b.floorsSummary[0].floor);
                    }
                  }}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-bold"
                  required
                >
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Tầng *
                </label>
                <select
                  value={floor}
                  onChange={e => setFloor(parseFloat(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
                  required
                >
                  {selectedBuilding?.floorsSummary.map(f => (
                    <option key={f.floor} value={f.floor}>
                      {f.floorName} ({f.roomCount} phòng)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mã phòng *
                </label>
                <input
                  type="text"
                  placeholder="VD: 501, 31-06"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Loại phòng
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
                >
                  <option value="Studio">Studio Tiêu Chuẩn</option>
                  <option value="1PN">1 Phòng Ngủ</option>
                  <option value="2PN">2 Phòng Ngủ</option>
                  <option value="Duplex">Duplex Gác Lửng</option>
                  <option value="Penthouse">Penthouse</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Diện tích (m²)
                </label>
                <input
                  type="number"
                  value={area}
                  onChange={e => setArea(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Giá thuê niêm yết (VNĐ/tháng)
                </label>
                <input
                  type="number"
                  step={100000}
                  value={price}
                  onChange={e => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Tạo phòng
              </button>
            </div>
          </form>
        ) : (
          /* BATCH CREATE FORM */
          <form onSubmit={handleBatchSubmit} className="p-5 pt-1 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Tòa Nhà *
                </label>
                <select
                  value={buildingId}
                  onChange={e => {
                    setBuildingId(e.target.value);
                    const b = buildings.find(x => x.id === e.target.value);
                    if (b && b.floorsSummary.length > 0) {
                      setFloor(b.floorsSummary[0].floor);
                    }
                  }}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-bold"
                  required
                >
                  {buildings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Tầng Cần Thêm *
                </label>
                <select
                  value={floor}
                  onChange={e => setFloor(parseFloat(e.target.value))}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
                  required
                >
                  {selectedBuilding?.floorsSummary.map(f => (
                    <option key={f.floor} value={f.floor}>
                      {f.floorName} (hiện có {f.roomCount} phòng)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl space-y-2">
              <span className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Quy tắc sinh mã phòng tự động
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">Số lượng phòng</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={batchCount}
                    onChange={e => setBatchCount(parseInt(e.target.value) || 1)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Tiền tố mã</span>
                  <input
                    type="text"
                    value={batchPrefix}
                    onChange={e => setBatchPrefix(e.target.value)}
                    placeholder="VD: 50 hoặc P31-"
                    className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Bắt đầu từ số</span>
                  <input
                    type="number"
                    min={1}
                    value={batchStartNum}
                    onChange={e => setBatchStartNum(parseInt(e.target.value) || 1)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                👉 Xem trước mã: <b>{batchPrefix}{String(batchStartNum).padStart(2, '0')}</b>, <b>{batchPrefix}{String(batchStartNum + 1).padStart(2, '0')}</b> ... (tổng {batchCount} phòng)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Giá thuê chung (VNĐ/tháng)
                </label>
                <input
                  type="number"
                  step={100000}
                  value={batchPrice}
                  onChange={e => setBatchPrice(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Diện tích trung bình (m²)
                </label>
                <input
                  type="number"
                  value={batchArea}
                  onChange={e => setBatchArea(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Khởi tạo {batchCount} phòng
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
