import React, { useState, useEffect } from 'react';
import { X, Building2, MapPin, User, CheckCircle2, Archive, Trash2 } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { Building, BuildingStatus, BuildingType } from '@/shared/types/portfolio';

interface EditBuildingModalProps {
  isOpen: boolean;
  building: Building | null;
  onClose: () => void;
  onRequestDelete?: (buildingId: string) => void;
}

export const EditBuildingModal: React.FC<EditBuildingModalProps> = ({
  isOpen,
  building,
  onClose,
  onRequestDelete,
}) => {
  const { updateBuilding, archiveBuilding } = usePortfolio();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ward, setWard] = useState('');
  const [city, setCity] = useState('');
  const [type, setType] = useState<BuildingType>('SERVICED_APARTMENT');
  const [status, setStatus] = useState<BuildingStatus>('ACTIVE');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (building) {
      setName(building.name);
      setAddress(building.address);
      setWard(building.ward);
      setCity(building.city);
      setType((building.buildingType || building.type || 'SERVICED_APARTMENT') as BuildingType);
      setStatus(building.status);
      setManagerName(building.managerName || '');
      setManagerPhone(building.managerPhone || '');
      setError(null);
    }
  }, [building]);

  if (!isOpen || !building) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError('Tên tòa nhà và địa chỉ không được để trống');
      return;
    }

    try {
      updateBuilding(building.id, {
        name: name.trim(),
        address: address.trim(),
        ward: ward.trim(),
        city: city.trim(),
        type,
        status,
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-surface dark:bg-surface-dark border border-appBorder-light dark:border-appBorder-dark rounded-2xl shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-appBorder-light dark:border-appBorder-dark flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Chỉnh Sửa Tòa Nhà — {building.code}
              </h3>
              <p className="text-xs text-slate-400">
                Mã tòa cố định: <b className="font-mono text-slate-600 dark:text-slate-300">{building.code}</b>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tên hiển thị tòa nhà *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ chi tiết *
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phường / Xã
              </label>
              <input
                type="text"
                value={ward}
                onChange={e => setWard(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tỉnh / Thành phố
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại hình
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value as BuildingType)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              >
                <option value="SERVICED_APARTMENT">Căn hộ dịch vụ</option>
                <option value="SHOPHOUSE">Shophouse liền kề</option>
                <option value="MINI_HOTEL">Khách sạn mini / Homestay</option>
                <option value="BOARDING_HOUSE">Nhà trọ cao cấp</option>
                <option value="COMMERCIAL">Tòa nhà thương mại</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái hoạt động
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as BuildingStatus)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              >
                <option value="ACTIVE">Đang hoạt động (Active)</option>
                <option value="ARCHIVED">Lưu trữ (Archived)</option>
                <option value="MAINTENANCE">Bảo trì toàn bộ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quản lý phụ trách
              </label>
              <input
                type="text"
                value={managerName}
                onChange={e => setManagerName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SĐT Quản lý
              </label>
              <input
                type="tel"
                value={managerPhone}
                onChange={e => setManagerPhone(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-appBorder-light dark:border-appBorder-dark flex items-center justify-between">
            {onRequestDelete ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestDelete(building.id);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Xóa / Lưu trữ tòa
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
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
                <CheckCircle2 className="w-4 h-4" /> Lưu thay đổi
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
