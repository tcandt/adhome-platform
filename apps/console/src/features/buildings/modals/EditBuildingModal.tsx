import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ClipboardPaste, Copy, Eraser, Loader2, Trash2, X } from 'lucide-react';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import type {
  BuildingStatus,
  BuildingType,
  ConsoleBuildingDto,
} from '@/shared/types/portfolio';
import { BuildingAddressFields } from '@/shared/ui/BuildingAddressFields';
import { BuildingFormDialog } from '@/shared/ui/BuildingFormDialog';
import { BuildingLandlordFields, emptyBuildingLandlord } from '@/shared/ui/BuildingLandlordFields';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { copyBuildingGroup, readBuildingGroup } from '@/shared/ui/buildingQuickCopy';
import { PrivateDocumentFields, usePrivateDocuments } from '@/shared/ui/PrivateDocumentFields';

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
  const documents = usePrivateDocuments('buildings', isOpen ? building?.id : undefined);

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
  const [landlord, setLandlord] = useState({ ...emptyBuildingLandlord });
  const [floorsCount, setFloorsCount] = useState('0');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState('');

  useEffect(() => {
    if (building) {
      setCode(building.code || '');
      setName(building.name || '');
      setStreetAddress(building.streetAddress || '');
      setWard(building.ward || '');
      setProvince(building.province || '');
      setBuildingType(
        (building.buildingType || 'SERVICED_APARTMENT') as BuildingType
      );
      setStatus((building.status || 'ACTIVE') as BuildingStatus);
      setManagerName(building.managerName || '');
      setManagerPhone(building.managerPhone || '');
      setLandlord({ ...emptyBuildingLandlord, ...building.landlord });
      setFloorsCount(String(building.floors.length));
      setError(null);
      setPasteNotice('');
    }
  }, [building]);

  if (!isOpen || !building) return null;

  const pasteGroup = async (kind: 'building' | 'landlord') => {
    const data = await readBuildingGroup(kind);
    if (!data) { setPasteNotice(kind === 'building' ? 'Chưa sao chép thông tin tòa nhà.' : 'Chưa sao chép thông tin chủ nhà.'); return; }
    if (data.kind === 'building') {
      setStreetAddress(data.values.streetAddress);
      setWard(data.values.ward);
      setProvince(data.values.province);
      setBuildingType(data.values.buildingType as BuildingType);
      setManagerName(data.values.managerName);
      setManagerPhone(data.values.managerPhone);
    } else setLandlord({ ...data.values });
    setPasteNotice(`Đã dán thông tin ${kind === 'building' ? 'tòa nhà' : 'chủ nhà'}. Kiểm tra trước khi lưu.`);
  };

  const copyGroup = async (kind: 'building' | 'landlord') => {
    await copyBuildingGroup({ ...building, streetAddress, ward, province, buildingType, managerName, managerPhone, landlord }, kind);
    setPasteNotice(`Đã sao chép thông tin ${kind === 'building' ? 'tòa nhà' : 'chủ nhà'}.`);
  };
  const clearGroup = (kind: 'building' | 'landlord') => {
    if (kind === 'landlord') setLandlord({ ...emptyBuildingLandlord });
    else { setStreetAddress(''); setWard(''); setProvince(''); setBuildingType('SERVICED_APARTMENT'); setManagerName(''); setManagerPhone(''); }
    setPasteNotice(`Đã xóa các trường ${kind === 'building' ? 'địa chỉ và quản lý' : 'chủ nhà'} trong biểu mẫu. Bấm Lưu để áp dụng.`);
  };
  const groupActions = (kind: 'building' | 'landlord') => {
    const label = kind === 'building' ? 'tòa nhà' : 'chủ nhà';
    const actionClass = 'flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-800';
    return <div role="group" aria-label={`Thao tác thông tin ${label}`} className="flex shrink-0 items-center gap-1">
      <Button type="button" aria-label={`Sao chép thông tin ${label}`} title={`Sao chép thông tin ${label}`} onClick={() => void copyGroup(kind)} className={actionClass}><Copy size={17} /></Button>
      <Button type="button" aria-label={`Dán thông tin ${label}`} title={`Dán thông tin ${label}`} onClick={() => void pasteGroup(kind)} className={actionClass}><ClipboardPaste size={17} /></Button>
      <Button type="button" aria-label={`Xóa sạch thông tin ${label}`} title={`Xóa sạch thông tin ${label}`} onClick={() => clearGroup(kind)} className={`${actionClass} text-rose-600 dark:text-rose-400`}><Eraser size={17} /></Button>
    </div>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (!name.trim() || !code.trim()) {
      setError('Mã tòa nhà và tên tòa nhà không được để trống.');
      return;
    }

    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(code.trim().toUpperCase())) {
      setError('Mã tòa nhà chỉ gồm chữ không dấu, số, dấu chấm và gạch ngang.');
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
      landlord,
      ...(Number(floorsCount) !== building.floors.length
        ? { floorsCount: Number(floorsCount) }
        : {}),
    });
    if (!res.ok) {
      setIsSaving(false);
      setError(res.message || 'Không thể cập nhật thông tin tòa nhà.');
      return;
    }

    try { if (documents.hasChanges) await documents.flush(); }
    catch (e) { setIsSaving(false); setError(`Đã cập nhật tòa nhà. ${e instanceof Error ? e.message : 'Chưa lưu đủ tài liệu.'}`); return; }
    setIsSaving(false);
    onClose();
  };

  return (
    <BuildingFormDialog title={`Chỉnh sửa tòa nhà ${building.code}`} testId="modal-edit-building" busy={isSaving} onClose={onClose}>
        <div data-testid="edit-building-header" className="shrink-0 p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
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
            aria-label="Đóng chỉnh sửa tòa nhà"
            disabled={isSaving}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div data-testid="edit-building-content" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <fieldset disabled={isSaving} className="min-w-0 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl">
              {error}
            </div>
          )}
          {pasteNotice && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{pasteNotice}</p>}

          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Thông tin tòa nhà</h4>{groupActions('building')}</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="editbuildingmodal-field-1" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mã tòa nhà *
              </label>
              <input
id="editbuildingmodal-field-1"                 type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold uppercase"
                required
              />
            </div>
            <div>
              <label htmlFor="editbuildingmodal-field-2" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tên hiển thị tòa nhà *
              </label>
              <input
id="editbuildingmodal-field-2"                 type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
                required
              />
            </div>
          </div>

          <BuildingAddressFields province={province} ward={ward} onProvinceChange={setProvince} onWardChange={setWard} />

          <div>
            <label htmlFor="editbuildingmodal-field-3" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Địa chỉ chi tiết (tùy chọn)
            </label>
            <input
id="editbuildingmodal-field-3"               type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="editbuildingmodal-field-4" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Loại hình vận hành
              </label>
              <select
id="editbuildingmodal-field-4"                 value={buildingType}
                onChange={(e) =>
                  setBuildingType(e.target.value as BuildingType)
                }
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="SERVICED_APARTMENT">Căn hộ dịch vụ</option>
                <option value="MINI_CONDO">Chung cư mini</option>
                <option value="SHOPHOUSE">Shophouse liền kề</option>
                <option value="CO_LIVING">Co-living</option>
                <option value="BOARDING_HOUSE">Nhà trọ tiêu chuẩn</option>
              </select>
            </div>
            <div>
              <label htmlFor="editbuildingmodal-field-5" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Trạng thái hoạt động
              </label>
              <select
id="editbuildingmodal-field-5"                 value={status}
                onChange={(e) => setStatus(e.target.value as BuildingStatus)}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="ARCHIVED">Lưu trữ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="editbuildingmodal-field-6" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quản lý phụ trách
              </label>
              <input
id="editbuildingmodal-field-6"                 type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label htmlFor="editbuildingmodal-field-7" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                SĐT quản lý
              </label>
              <input
id="editbuildingmodal-field-7"                 type="tel"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                className="min-w-0 w-full min-h-11 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="edit-building-floors-count" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Số tầng
              </label>
              <input
                id="edit-building-floors-count"
                data-testid="input-edit-building-floors-count"
                type="number"
                min={0}
                max={103}
                step={1}
                required
                value={floorsCount}
                onChange={event => setFloorsCount(event.target.value)}
                className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:ring-2 focus:ring-brand-primary dark:border-slate-700 dark:bg-slate-800/80"
              />
            </div>
          </div>

          <BuildingLandlordFields value={landlord} onChange={setLandlord} actions={groupActions('landlord')} />
          <PrivateDocumentFields state={documents} disabled={isSaving} />
          </fieldset>
          </div>
          <div data-testid="edit-building-footer" className="building-form-footer shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            {onRequestDelete ? (
              <Button
                type="button"
                disabled={isSaving}
                aria-label="Xóa / Lưu trữ tòa nhà"
                title="Xóa / Lưu trữ tòa nhà"
                onClick={() => {
                  onClose();
                  onRequestDelete(building);
                }}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Xóa / Lưu trữ</span>
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </Button>
              <Button
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
              </Button>
            </div>
          </div>
        </form>
    </BuildingFormDialog>
  );
};
