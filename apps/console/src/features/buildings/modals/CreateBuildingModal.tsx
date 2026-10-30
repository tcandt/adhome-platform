import React, { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { BuildingType } from '@/shared/types/portfolio';

interface CreateBuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (buildingId?: string) => void;
}

export const CreateBuildingModal: React.FC<CreateBuildingModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { createBuilding, organization } = usePortfolio();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [ward, setWard] = useState('Phường Tân An');
  const [province, setProvince] = useState('Buôn Ma Thuột, Đắk Lắk');
  const [buildingType, setBuildingType] =
    useState<BuildingType>('SERVICED_APARTMENT');
  const [initialFloorsCount, setInitialFloorsCount] = useState<number>(3);
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setCode('');
    setName('');
    setStreetAddress('');
    setWard('Phường Tân An');
    setProvince('Buôn Ma Thuột, Đắk Lắk');
    setBuildingType('SERVICED_APARTMENT');
    setInitialFloorsCount(3);
    setManagerName('');
    setManagerPhone('');
    setDescription('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !streetAddress.trim()) {
      setError('Vui lòng điền đầy đủ Mã tòa nhà, Tên tòa nhà và Địa chỉ.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const res = await createBuilding({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      streetAddress: streetAddress.trim(),
      ward: ward.trim(),
      province: province.trim(),
      buildingType,
      initialFloorsCount: Math.max(
        0,
        Math.min(20, Math.trunc(Number(initialFloorsCount) || 0))
      ),
      managerName: managerName.trim() || undefined,
      managerPhone: managerPhone.trim() || undefined,
      description: description.trim() || undefined,
    });
    setIsSaving(false);

    if (!res.ok) {
      setError(res.message || 'Không thể khởi tạo tòa nhà.');
      return;
    }

    const createdId = (res.data as { building?: { id?: string } } | undefined)
      ?.building?.id;
    resetForm();
    onClose();
    if (onCreated) onCreated(createdId);
  };

  return (
    <div
      data-testid="modal-create-building"
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
                Thêm tòa nhà mới
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tổ chức:{' '}
                <b className="text-slate-700 dark:text-slate-200">
                  {organization?.name || 'AdHome'}
                </b>
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
            <div
              data-testid="create-building-error"
              className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã tòa nhà *
              </label>
              <input
                data-testid="input-building-code"
                type="text"
                placeholder="VD: LK02-15, TOA-A"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary uppercase font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tòa nhà *
              </label>
              <input
                data-testid="input-building-name"
                type="text"
                placeholder="VD: AdHome Sapphire"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ số nhà &amp; đường *
            </label>
            <input
              data-testid="input-building-address"
              type="text"
              placeholder="VD: LK02-15 KĐT EcoCity Premia"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Phường / Xã *
              </label>
              <input
                data-testid="input-building-ward"
                type="text"
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tỉnh / Thành phố *
              </label>
              <input
                data-testid="input-building-province"
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại hình vận hành
              </label>
              <select
                data-testid="select-building-type"
                value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as BuildingType)
                }
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
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
                Số tầng khởi tạo (0 – 20)
              </label>
              <input
                data-testid="input-building-initial-floors"
                type="number"
                min={0}
                max={20}
                value={initialFloorsCount}
                onChange={(e) =>
                  setInitialFloorsCount(
                    Math.max(0, parseInt(e.target.value, 10) || 0)
                  )
                }
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quản lý phụ trách (tuỳ chọn)
              </label>
              <input
                type="text"
                placeholder="Nguyễn Văn Minh"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SĐT quản lý (tuỳ chọn)
              </label>
              <input
                type="tel"
                placeholder="0905xxxxxx"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              data-testid="submit-create-building"
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Building2 className="w-3.5 h-3.5" />
              )}
              <span>Khởi tạo tòa nhà</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
