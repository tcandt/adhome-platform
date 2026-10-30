import React, { useEffect, useState } from 'react';
import { Globe, Home, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { CreateRoomInput } from '@/shared/types/portfolio';

interface CreateRoomModalProps {
  isOpen: boolean;
  buildingId?: string;
  floorId?: string;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  buildingId: initialBuildingId,
  floorId: initialFloorId,
  onClose,
}) => {
  const { user } = useAuth();
  const { activeBuildings, createRoom, batchCreateRooms } = usePortfolio();

  const canPublish =
    user?.backendRole === 'ADMIN' ||
    Boolean(user?.permissions.includes('rooms.publish.write'));

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [buildingId, setBuildingId] = useState<string>('');
  const [floorId, setFloorId] = useState<string>('');

  // Single Room state
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [roomType, setRoomType] = useState('Studio');
  const [area, setArea] = useState<number>(30);
  const [listPriceVnd, setListPriceVnd] = useState<number>(4500000);
  const [depositMonths, setDepositMonths] = useState<number>(1);
  const [maxOccupants, setMaxOccupants] = useState<number>(2);
  const [furnishedLevel, setFurnishedLevel] = useState<
    'FULL' | 'BASIC' | 'UNFURNISHED'
  >('FULL');
  const [isPublishedToLanding, setIsPublishedToLanding] = useState(false);

  // Batch Room state
  const [batchCount, setBatchCount] = useState<number>(4);
  const [batchPrefix, setBatchPrefix] = useState<string>('P');
  const [batchStartNum, setBatchStartNum] = useState<number>(1);
  const [batchPriceVnd, setBatchPriceVnd] = useState<number>(4500000);
  const [batchArea, setBatchArea] = useState<number>(30);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBuilding =
    activeBuildings.find((b) => b.id === buildingId) || activeBuildings[0];

  useEffect(() => {
    if (isOpen) {
      const bId = initialBuildingId || activeBuildings[0]?.id || '';
      setBuildingId(bId);
      const bld = activeBuildings.find((b) => b.id === bId);
      const fId =
        initialFloorId && bld?.floors.some((f) => f.id === initialFloorId)
          ? initialFloorId
          : bld?.floors[0]?.id || '';
      setFloorId(fId);
      setCode('');
      setTitle('');
      setIsPublishedToLanding(false);
      setError(null);
    }
  }, [isOpen, initialBuildingId, initialFloorId, activeBuildings]);

  if (!isOpen) return null;

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId || !floorId) {
      setError('Vui lòng chọn tòa nhà và tầng trước khi thêm phòng.');
      return;
    }
    if (!code.trim()) {
      setError('Vui lòng nhập mã phòng (VD: P101, 31-05).');
      return;
    }

    setIsSaving(true);
    setError(null);
    const res = await createRoom({
      buildingId,
      floorId,
      code: code.trim().toUpperCase(),
      title: title.trim() || undefined,
      roomType,
      area: Number(area) || 25,
      listPriceVnd: Math.trunc(Number(listPriceVnd) || 0),
      depositMonths: Math.trunc(Number(depositMonths) || 1),
      maxOccupants: Math.trunc(Number(maxOccupants) || 2),
      furnishedLevel,
      isPublishedToLanding: canPublish ? isPublishedToLanding : false,
    });
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể tạo phòng.');
      return;
    }

    onClose();
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId || !floorId) {
      setError('Vui lòng chọn tòa nhà và tầng.');
      return;
    }
    const count = Math.max(1, Math.min(30, Math.trunc(Number(batchCount) || 1)));
    const items: CreateRoomInput[] = [];
    for (let i = 0; i < count; i++) {
      const roomCode = `${batchPrefix.trim().toUpperCase()}${String(
        batchStartNum + i
      ).padStart(2, '0')}`;
      items.push({
        buildingId,
        floorId,
        code: roomCode,
        roomType,
        area: Number(batchArea) || 25,
        listPriceVnd: Math.trunc(Number(batchPriceVnd) || 0),
        depositMonths: 1,
        maxOccupants: 2,
        furnishedLevel,
        isPublishedToLanding: false,
      });
    }

    setIsSaving(true);
    setError(null);
    const res = await batchCreateRooms(items);
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể khởi tạo hàng loạt phòng.');
      return;
    }

    onClose();
  };

  return (
    <div
      data-testid="modal-create-room"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm phòng / căn hộ
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lưu trực tiếp vào PostgreSQL và đồng bộ danh mục tòa nhà
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

        <div className="p-2.5 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              mode === 'single'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Thêm 1 phòng đơn lẻ
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              mode === 'batch'
                ? 'bg-white dark:bg-slate-700 text-brand-primary dark:text-white font-bold shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Tạo hàng loạt
            theo tầng
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {error && (
            <div
              data-testid="create-room-error"
              className="mx-5 mt-4 p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl"
            >
              {error}
            </div>
          )}

          {mode === 'single' ? (
            <form onSubmit={handleSingleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tòa nhà *
                  </label>
                  <select
                    data-testid="select-room-building"
                    value={buildingId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setBuildingId(nextId);
                      const bld = activeBuildings.find((b) => b.id === nextId);
                      setFloorId(bld?.floors[0]?.id || '');
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  >
                    {activeBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tầng *
                  </label>
                  <select
                    data-testid="select-room-floor"
                    value={floorId}
                    onChange={(e) => setFloorId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  >
                    {selectedBuilding?.floors.length ? (
                      selectedBuilding.floors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.roomCount} phòng)
                        </option>
                      ))
                    ) : (
                      <option value="">Chưa có tầng (cần thêm tầng trước)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mã phòng *
                  </label>
                  <input
                    data-testid="input-room-code"
                    type="text"
                    placeholder="VD: P101, 31-05"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loại căn hộ
                  </label>
                  <select
                    data-testid="select-room-type"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="Studio">Studio</option>
                    <option value="1PN">1 Phòng ngủ</option>
                    <option value="2PN">2 Phòng ngủ</option>
                    <option value="Duplex">Duplex gác lửng</option>
                    <option value="Penthouse">Penthouse</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tiêu đề hiển thị (tuỳ chọn)
                </label>
                <input
                  data-testid="input-room-title"
                  type="text"
                  placeholder="Bỏ trống để hệ thống tự sinh theo mã phòng & tòa nhà"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Diện tích (m²) *
                  </label>
                  <input
                    data-testid="input-room-area"
                    type="number"
                    min={10}
                    max={500}
                    step={0.5}
                    value={area}
                    onChange={(e) => setArea(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Giá thuê niêm yết (VND/tháng) *
                  </label>
                  <input
                    data-testid="input-room-price"
                    type="number"
                    min={500000}
                    step={100000}
                    value={listPriceVnd}
                    onChange={(e) =>
                      setListPriceVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                    Số người tối đa
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={maxOccupants}
                    onChange={(e) =>
                      setMaxOccupants(parseInt(e.target.value, 10) || 2)
                    }
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nội thất
                  </label>
                  <select
                    value={furnishedLevel}
                    onChange={(e) =>
                      setFurnishedLevel(
                        e.target.value as 'FULL' | 'BASIC' | 'UNFURNISHED'
                      )
                    }
                    className="w-full text-xs px-2.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="FULL">Đầy đủ (Full)</option>
                    <option value="BASIC">Cơ bản</option>
                    <option value="UNFURNISHED">Nhà trống</option>
                  </select>
                </div>
              </div>

              {canPublish && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <input
                    data-testid="checkbox-room-publish-landing"
                    type="checkbox"
                    checked={isPublishedToLanding}
                    onChange={(e) => setIsPublishedToLanding(e.target.checked)}
                    className="mt-0.5 rounded text-brand-primary"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-brand-primary" />
                      Xuất bản công khai lên Landing Page (adhome.vn)
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Chỉ đồng bộ thông tin phòng công khai; thông tin khách thuê
                      &amp; hợp đồng luôn được bảo mật nội bộ.
                    </span>
                  </div>
                </label>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  data-testid="submit-create-room"
                  type="submit"
                  disabled={isSaving || !floorId}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Tạo phòng</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBatchSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tòa nhà *
                  </label>
                  <select
                    value={buildingId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setBuildingId(nextId);
                      const bld = activeBuildings.find((b) => b.id === nextId);
                      setFloorId(bld?.floors[0]?.id || '');
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  >
                    {activeBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tầng *
                  </label>
                  <select
                    value={floorId}
                    onChange={(e) => setFloorId(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  >
                    {selectedBuilding?.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (hiện có {f.roomCount} phòng)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Quy tắc đánh mã phòng tự
                  động
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">
                      Số lượng (1–30)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={batchCount}
                      onChange={(e) =>
                        setBatchCount(parseInt(e.target.value, 10) || 1)
                      }
                      className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">
                      Tiền tố mã
                    </span>
                    <input
                      type="text"
                      value={batchPrefix}
                      onChange={(e) =>
                        setBatchPrefix(e.target.value.toUpperCase())
                      }
                      placeholder="VD: P2"
                      className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold uppercase"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">
                      Bắt đầu từ
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={batchStartNum}
                      onChange={(e) =>
                        setBatchStartNum(parseInt(e.target.value, 10) || 1)
                      }
                      className="w-full text-xs px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Xem trước:{' '}
                  <b className="font-mono">
                    {batchPrefix}
                    {String(batchStartNum).padStart(2, '0')}
                  </b>
                  ,{' '}
                  <b className="font-mono">
                    {batchPrefix}
                    {String(batchStartNum + 1).padStart(2, '0')}
                  </b>{' '}
                  … ({batchCount} phòng)
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Giá thuê chung (VND/tháng) *
                  </label>
                  <input
                    type="number"
                    min={500000}
                    step={100000}
                    value={batchPriceVnd}
                    onChange={(e) =>
                      setBatchPriceVnd(parseInt(e.target.value, 10) || 0)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Diện tích trung bình (m²) *
                  </label>
                  <input
                    type="number"
                    min={10}
                    value={batchArea}
                    onChange={(e) =>
                      setBatchArea(parseFloat(e.target.value) || 25)
                    }
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  data-testid="submit-batch-create-rooms"
                  type="submit"
                  disabled={isSaving || !floorId}
                  className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Khởi tạo {batchCount} phòng</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
