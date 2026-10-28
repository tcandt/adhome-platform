import React, { useState } from 'react';
import { X, Layers, Plus } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';

interface CreateFloorModalProps {
  isOpen: boolean;
  buildingId?: string;
  onClose: () => void;
}

export const CreateFloorModal: React.FC<CreateFloorModalProps> = ({
  isOpen,
  buildingId: initialBuildingId,
  onClose,
}) => {
  const { buildings, addFloor } = usePortfolio();

  const [buildingId, setBuildingId] = useState<string>(initialBuildingId || buildings[0]?.id || '');
  const [floorType, setFloorType] = useState<string>('numbered');
  const [floorNumber, setFloorNumber] = useState<number>(5);
  const [floorName, setFloorName] = useState<string>('Tầng 5');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTypeChange = (type: string) => {
    setFloorType(type);
    if (type === 'basement') {
      setFloorNumber(-1);
      setFloorName('Tầng hầm B1');
    } else if (type === 'ground') {
      setFloorNumber(0);
      setFloorName('Tầng trệt');
    } else if (type === 'mezzanine') {
      setFloorNumber(1.5);
      setFloorName('Tầng lửng');
    } else if (type === 'tech') {
      setFloorNumber(99);
      setFloorName('Tầng kỹ thuật');
    } else {
      setFloorNumber(5);
      setFloorName('Tầng 5');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) {
      setError('Vui lòng chọn tòa nhà.');
      return;
    }

    try {
      addFloor({
        buildingId,
        floor: Number(floorNumber),
        floorName: floorName.trim() || `Tầng ${floorNumber}`,
      });
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-2xl shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm Tầng Mới
              </h3>
              <p className="text-xs text-slate-400">
                Khai báo tầng động, tầng hầm, tầng trệt hoặc tầng kỹ thuật
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Chọn Tòa Nhà *
            </label>
            <select
              value={buildingId}
              onChange={e => setBuildingId(e.target.value)}
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
              Loại tầng
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { id: 'numbered', label: 'Tầng số' },
                { id: 'ground', label: 'Tầng trệt' },
                { id: 'mezzanine', label: 'Tầng lửng' },
                { id: 'basement', label: 'Tầng hầm' },
                { id: 'tech', label: 'Tầng kỹ thuật' },
                { id: 'other', label: 'Khác' },
              ].map(t => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => handleTypeChange(t.id)}
                  className={`py-1.5 px-2 rounded-lg border font-medium text-center transition-all ${
                    floorType === t.id
                      ? 'border-brand-primary bg-blue-50 dark:bg-blue-950/50 text-brand-primary font-bold'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số thứ tự tầng (Số nguyên)
              </label>
              <input
                type="number"
                value={floorNumber}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setFloorNumber(val);
                  if (floorType === 'numbered') {
                    setFloorName(`Tầng ${val}`);
                  }
                }}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tầng *
              </label>
              <input
                type="text"
                value={floorName}
                onChange={e => setFloorName(e.target.value)}
                placeholder="VD: Tầng 5, Tầng Skyview"
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary font-semibold"
                required
              />
            </div>
          </div>

          {/* Footer Actions */}
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
              <Plus className="w-4 h-4" /> Thêm tầng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
