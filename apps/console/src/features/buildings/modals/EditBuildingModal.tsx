import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Trash2, X } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type {
  BuildingStatus,
  BuildingType,
  ConsoleBuildingDto,
} from '@/shared/types/portfolio';

interface EditBuildingModalProps {
  isOpen: boolean;
  building: ConsoleBuildingDto | null;
  onClose: () => void;
  onRequestDelete?: (building: ConsoleBuildingDto) => void;
}

export const EditBuildingModal: React.FC<EditBuildingModalProps> = ({
  isOpen,
  building,
  onClose,
  onRequestDelete,
}) => {
  const { updateBuilding } = usePortfolio();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [ward, setWard] = useState('');
  const [province, setProvince] = useState('');
  const [buildingType, setBuildingType] =
    useState<BuildingType>('SERVICED_APARTMENT');
  const [status, setStatus] = useState<BuildingStatus>('ACTIVE');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (building) {
      setCode(building.code);
      setName(building.name);
      setStreetAddress(building.streetAddress);
      setWard(building.ward);
      setProvince(building.province);
      setBuildingType(
        (building.buildingType || 'SERVICED_APARTMENT') as BuildingType
      );
      setStatus((building.status || 'ACTIVE') as BuildingStatus);
      setManagerName(building.managerName || '');
      setManagerPhone(building.managerPhone || '');
      setError(null);
    }
  }, [building]);

  if (!isOpen || !building) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !streetAddress.trim() || !code.trim()) {
      setError('Mã tòa nhà, tên tòa nhà và địa chỉ không được để trống.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const res = await updateBuilding(building.id, {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      streetAddress: streetAddress.trim(),
      ward: ward.trim(),
      province: province.trim(),
      buildingType,
      status,
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
    });
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể cập nhật thông tin tòa nhà.');
      return;
    }

    onClose();
  };

  return (
    <div
      data-testid="modal-edit-building"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Chỉnh sửa tòa nhà — {building.code}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hiện có {building.stats.totalRooms} phòng ·{' '}
                {building.stats.floorsCount} tầng
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã tòa nhà *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tòa nhà *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ chi tiết *
            </label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phường / Xã
              </label>
              <input
                type="text"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tỉnh / Thành phố
              </label>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại hình vận hành
              </label>
              <select
                value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as BuildingType)
                }
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="SERVICED_APARTMENT">Căn hộ dịch vụ</option>
                <option value="MINI_CONDO">Chung cư mini</option>
                <option value="SHOPHOUSE">Shophouse liền kề</option>
                <option value="CO_LIVING">Co-living</option>
                <option value="BOARDING_HOUSE">Nhà trọ tiêu chuẩn</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái hoạt động
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BuildingStatus)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                <option value="ARCHIVED">Lưu trữ (ARCHIVED)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quản lý phụ trách
              </label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SĐT quản lý
              </label>
              <input
                type="tel"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            {onRequestDelete ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestDelete(building);
                }}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa / Lưu trữ
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
                data-testid="submit-edit-building"
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
