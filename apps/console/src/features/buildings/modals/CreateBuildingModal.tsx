import React, { useState } from 'react';
import { Building2, Loader2, X } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type { BuildingType } from '@/shared/types/portfolio';
import { BuildingAddressFields } from '@/shared/ui/BuildingAddressFields';
import { BuildingFormDialog } from '@/shared/ui/BuildingFormDialog';
import { BuildingLandlordFields, emptyBuildingLandlord } from '@/shared/ui/BuildingLandlordFields';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { NumberInput } from '@/shared/ui/NumberInput';

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
  const [ward, setWard] = useState('');
  const [province, setProvince] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [landlord, setLandlord] = useState({ ...emptyBuildingLandlord });
  const [buildingType, setBuildingType] =
    useState<BuildingType>('SERVICED_APARTMENT');
  const [initialFloorsCount, setInitialFloorsCount] = useState<number>(3);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setCode('');
    setName('');
    setStreetAddress('');
    setWard('');
    setProvince('');
    setStatus('ACTIVE');
    setManagerName('');
    setManagerPhone('');
    setLandlord({ ...emptyBuildingLandlord });
    setBuildingType('SERVICED_APARTMENT');
    setInitialFloorsCount(3);
    setDescription('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(normalizedCode)) {
      setError('Mã tòa nhà chỉ gồm chữ không dấu, số, dấu chấm và gạch ngang.');
      return;
    }
    if (!normalizedCode) {
      setError('Vui lòng nhập mã tòa nhà hợp lệ.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const res = await createBuilding({
      code: normalizedCode,
      name: name.trim() || normalizedCode,
      streetAddress: streetAddress.trim(),
      ward: ward.trim(),
      province: province.trim(),
      buildingType,
      status,
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      landlord,
      initialFloorsCount: Math.max(
        0,
        Math.min(20, Math.trunc(Number(initialFloorsCount) || 0))
      ),
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
    <BuildingFormDialog title="Thêm tòa nhà mới" testId="modal-create-building" busy={isSaving} onClose={onClose}>
        <div data-testid="create-building-header" className="shrink-0 p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-brand-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="create-building-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
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
            aria-label="Đóng tạo tòa nhà"
            disabled={isSaving}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div data-testid="create-building-content" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          <fieldset disabled={isSaving} className="min-w-0 space-y-4">
          {error && (
            <div
              data-testid="create-building-error"
              className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="createbuildingmodal-field-1" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã tòa nhà *
              </label>
              <input
id="createbuildingmodal-field-1"                 data-testid="input-building-code"
                type="text"
                placeholder="VD: A.01-02"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary uppercase font-bold"
                required
              />
            </div>
            <div>
              <label htmlFor="createbuildingmodal-field-2" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tòa nhà (tùy chọn)
              </label>
              <input
id="createbuildingmodal-field-2"                 data-testid="input-building-name"
                type="text"
                placeholder={code.trim() || 'Để trống để dùng mã tòa nhà'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <BuildingAddressFields province={province} ward={ward} onProvinceChange={setProvince} onWardChange={setWard} />

          <div>
            <label htmlFor="createbuildingmodal-field-3" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ chi tiết (tùy chọn)
            </label>
            <input
id="createbuildingmodal-field-3"               data-testid="input-building-address"
              type="text"
              placeholder="VD: LK02-15 KĐT EcoCity Premia"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="createbuildingmodal-field-4" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại hình vận hành
              </label>
              <select
id="createbuildingmodal-field-4"                 data-testid="select-building-type"
                value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as BuildingType)
                }
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                <option value="SERVICED_APARTMENT">Căn hộ dịch vụ</option>
                <option value="MINI_CONDO">Chung cư mini</option>
                <option value="SHOPHOUSE">Shophouse liền kề</option>
                <option value="CO_LIVING">Co-living</option>
                <option value="BOARDING_HOUSE">Nhà trọ tiêu chuẩn</option>
              </select>
            </div>
            <div className="min-w-0"><label htmlFor="create-building-status" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Trạng thái hoạt động</label><select id="create-building-status" value={status} onChange={e => setStatus(e.target.value as 'ACTIVE' | 'ARCHIVED')} className="min-w-0 w-full min-h-11 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"><option value="ACTIVE">Đang hoạt động</option><option value="ARCHIVED">Lưu trữ</option></select></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0"><label htmlFor="create-building-manager" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Quản lý phụ trách</label><input id="create-building-manager" value={managerName} onChange={e => setManagerName(e.target.value)} placeholder="Không bắt buộc" className="min-w-0 w-full min-h-11 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary" /></div>
            <div className="min-w-0"><label htmlFor="create-building-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại quản lý</label><input id="create-building-phone" type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} placeholder="Không bắt buộc" className="min-w-0 w-full min-h-11 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="createbuildingmodal-field-5" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Số tầng khởi tạo (0 – 20)
              </label>
              <NumberInput
id="createbuildingmodal-field-5"                 data-testid="input-building-initial-floors"
                min={0}
                max={20}
                value={initialFloorsCount}
                onValueChange={value => setInitialFloorsCount(Math.trunc(value))}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
          </div>

          <BuildingLandlordFields value={landlord} onChange={setLandlord} />
          </fieldset>
          </div>

          <div data-testid="create-building-footer" className="building-form-footer shrink-0 border-t border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-[#111827] flex items-center justify-end gap-2">
            <Button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-11 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Hủy
            </Button>
            <Button
              data-testid="submit-create-building"
              type="submit"
              disabled={isSaving}
              className="min-h-11 px-4 py-2 text-xs font-bold bg-brand-primary hover:bg-brand-hover text-white rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Building2 className="w-3.5 h-3.5" />
              )}
              <span>Khởi tạo tòa nhà</span>
            </Button>
          </div>
        </form>
    </BuildingFormDialog>
  );
};
