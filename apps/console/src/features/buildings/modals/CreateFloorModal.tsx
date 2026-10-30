import React, { useEffect, useState } from 'react';
import { Layers, Loader2, Plus, X } from 'lucide-react';
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
  const { activeBuildings, createFloor } = usePortfolio();

  const [buildingId, setBuildingId] = useState<string>('');
  const [floorPreset, setFloorPreset] = useState<string>('numbered');
  const [floorNumber, setFloorNumber] = useState<number>(1);
  const [name, setName] = useState<string>('Tầng 1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const targetBldId = initialBuildingId || activeBuildings[0]?.id || '';
      setBuildingId(targetBldId);
      const bld = activeBuildings.find((b) => b.id === targetBldId);
      const maxFlr = bld?.floors.length
        ? Math.max(...bld.floors.map((f) => f.floorNumber)) + 1
        : 1;
      setFloorPreset('numbered');
      setFloorNumber(maxFlr);
      setName(`Tầng ${maxFlr}`);
      setError(null);
    }
  }, [isOpen, initialBuildingId, activeBuildings]);

  if (!isOpen) return null;

  const handlePresetChange = (preset: string) => {
    setFloorPreset(preset);
    if (preset === 'basement') {
      setFloorNumber(-1);
      setName('Tầng hầm B1');
    } else if (preset === 'ground') {
      setFloorNumber(0);
      setName('Tầng trệt');
    } else if (preset === 'rooftop') {
      setFloorNumber(20);
      setName('Tầng thượng');
    } else {
      const bld = activeBuildings.find((b) => b.id === buildingId);
      const nextNum = bld?.floors.length
        ? Math.max(...bld.floors.map((f) => f.floorNumber)) + 1
        : 1;
      setFloorNumber(nextNum);
      setName(`Tầng ${nextNum}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) {
      setError('Vui lòng chọn tòa nhà.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const intFloor = Math.trunc(Number(floorNumber));
    const res = await createFloor({
      buildingId,
      floorNumber: intFloor,
      name: name.trim() || `Tầng ${intFloor}`,
    });
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể thêm tầng.');
      return;
    }

    onClose();
  };

  return (
    <div
      data-testid="modal-create-floor"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thêm tầng mới
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khai báo tầng vận hành thực tế cho tòa nhà
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tòa nhà *
            </label>
            <select
              data-testid="select-floor-building"
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
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
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mẫu tầng nhanh
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { id: 'numbered', label: 'Tầng số' },
                { id: 'ground', label: 'Tầng trệt (0)' },
                { id: 'basement', label: 'Tầng hầm (-1)' },
                { id: 'rooftop', label: 'Sân thượng' },
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => handlePresetChange(t.id)}
                  className={`py-1.5 px-2 rounded-lg border font-medium text-center transition-colors ${
                    floorPreset === t.id
                      ? 'border-brand-primary bg-blue-50 dark:bg-blue-950/50 text-brand-primary font-bold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                Số tầng (-3 đến 99) *
              </label>
              <input
                data-testid="input-floor-number"
                type="number"
                min={-3}
                max={99}
                step={1}
                value={floorNumber}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setFloorNumber(val);
                  if (floorPreset === 'numbered') {
                    setName(`Tầng ${val}`);
                  }
                }}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tầng *
              </label>
              <input
                data-testid="input-floor-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Tầng 4"
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
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
              data-testid="submit-create-floor"
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Thêm tầng</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
