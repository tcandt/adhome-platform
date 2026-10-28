import React, { useState } from 'react';
import { X, Building2, Layers, MapPin, User, ShieldCheck } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { BuildingType } from '@/shared/types/portfolio';

interface CreateBuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (buildingId: string) => void;
}

export const CreateBuildingModal: React.FC<CreateBuildingModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { addBuilding, currentOrg } = usePortfolio();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ward, setWard] = useState('Phường Tân An');
  const [city, setCity] = useState('Buôn Ma Thuột, Đắk Lắk');
  const [type, setType] = useState<BuildingType>('SERVICED_APARTMENT');
  const [initialFloors, setInitialFloors] = useState<number>(4);
  const [managerName, setManagerName] = useState('Nguyễn Văn Quản Lý');
  const [managerPhone, setManagerPhone] = useState('0905123456');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !address.trim()) {
      setError('Vui lòng điền đầy đủ Mã tòa, Tên tòa nhà và Địa chỉ.');
      return;
    }

    try {
      const newBuilding = addBuilding({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim(),
        ward: ward.trim(),
        city: city.trim(),
        type,
        initialFloors: Number(initialFloors) || 1,
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
      });

      setError(null);
      onClose();
      if (onCreated) onCreated(newBuilding.id);
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi tạo tòa nhà');
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
                Thêm Tòa Nhà Mới
              </h3>
              <p className="text-xs text-slate-400">
                Tổ chức: <b className="text-slate-700 dark:text-slate-300">{currentOrg.name}</b>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã tòa nhà *
              </label>
              <input
                type="text"
                placeholder="VD: TOA-A, LK02-15"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary uppercase font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tòa *
              </label>
              <input
                type="text"
                placeholder="VD: Tòa Sapphire, Shophouse 31"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
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
              placeholder="VD: Số 123 Đường Nguyễn Thị Định"
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
                Loại hình tòa nhà
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
                Số tầng khởi tạo ban đầu
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={initialFloors}
                onChange={e => setInitialFloors(parseInt(e.target.value) || 1)}
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-primary"
              />
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
              <Building2 className="w-4 h-4" /> Tạo tòa nhà
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
