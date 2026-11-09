import { useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Copy, X } from 'lucide-react';
import type { ConsoleBuildingDto } from '@/shared/types/portfolio';
import { copyBuildingGroup } from '@/shared/ui/buildingQuickCopy';

const buildingTypes: Record<string, string> = {
  SERVICED_APARTMENT: 'Căn hộ dịch vụ', MINI_CONDO: 'Chung cư mini',
  SHOPHOUSE: 'Shophouse liền kề', CO_LIVING: 'Co-living',
  BOARDING_HOUSE: 'Nhà trọ tiêu chuẩn', TRADITIONAL_RENTAL: 'Nhà cho thuê',
  MINI_HOTEL: 'Khách sạn mini', COMMERCIAL: 'Thương mại',
};

function Detail({ label, value, wide = false }: { label: string; value?: string | number | null; wide?: boolean }) {
  const detail = String(value ?? '').trim();
  if (!detail) return null;
  return <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-0.5 break-words text-sm leading-5 text-slate-800 dark:text-slate-200">{detail}</dd>
  </div>;
}

export function BuildingInfoDialog({ building, onClose }: {
  building: ConsoleBuildingDto | undefined;
  onClose: () => void;
}) {
  const landlord = building?.landlord;
  const [notice, setNotice] = useState('');
  const copyGroup = (kind: 'building' | 'landlord') => { if (!building) return; void copyBuildingGroup(building, kind).then(() => setNotice(kind === 'building' ? 'Đã sao chép thông tin tòa nhà. Mở tòa khác để dán.' : 'Đã sao chép thông tin chủ nhà. Mở tòa khác để dán.')); };
  return <Dialog.Root open={Boolean(building)} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[110] bg-slate-950/50 backdrop-blur-[2px]" />
      <Dialog.Viewport className="fixed inset-0 z-[111] flex items-end justify-center sm:items-center">
        <Dialog.Popup from="bottom" data-testid="building-info-dialog" className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none dark:bg-slate-900 sm:max-w-lg sm:rounded-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">Thông tin tòa nhà</Dialog.Title>
              <div className="mt-1 flex min-w-0 items-center gap-2"><Dialog.Description className="min-w-0 flex-1 break-words text-sm text-slate-500 dark:text-slate-400">{building?.name}{building?.name !== building?.code && ` · ${building?.code}`}</Dialog.Description><Button type="button" onClick={() => copyGroup('building')} aria-label="Sao chép thông tin tòa nhà" title="Sao chép thông tin tòa nhà" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"><Copy size={16} /></Button></div></div>
            <Dialog.Close aria-label="Đóng thông tin tòa nhà" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></Dialog.Close>
          </div>
          {notice && <p role="status" className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{notice}</p>}
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <Detail label="Địa chỉ" value={building?.streetAddress} wide />
              <Detail label="Phường / xã" value={building?.ward} />
              <Detail label="Tỉnh / thành phố" value={building?.province} />
              <Detail label="Loại hình" value={building ? buildingTypes[building.buildingType] || building.buildingType : ''} />
              <Detail label="Trạng thái" value={building?.status === 'ARCHIVED' ? 'Lưu trữ' : 'Đang hoạt động'} />
              <Detail label="Số tầng" value={building?.stats.floorsCount} />
              <Detail label="Số phòng" value={building?.stats.totalRooms} />
            </dl>
            {(building?.managerName || building?.managerPhone) && <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Quản lý</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3"><Detail label="Người phụ trách" value={building.managerName} /><Detail label="Số điện thoại" value={building.managerPhone} /></dl>
            </section>}
            {landlord && Object.values(landlord).some(Boolean) && <section className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Chủ nhà</h3><Button type="button" onClick={() => copyGroup('landlord')} aria-label="Sao chép toàn bộ thông tin chủ nhà" title="Sao chép toàn bộ thông tin chủ nhà" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"><Copy size={16} /></Button></div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label="Họ và tên" value={landlord.fullName} />
                <Detail label="Số điện thoại" value={landlord.phone} />
                <Detail label="CCCD / CMND" value={landlord.idNumber} />
                <Detail label="Địa chỉ" value={landlord.address} wide />
                <Detail label="Số tài khoản" value={landlord.accountNumber} />
                <Detail label="Ngân hàng" value={landlord.bank} />
                <Detail label="Chủ tài khoản" value={landlord.accountName} wide />
              </dl>
            </section>}
            {building?.description && <dl className="border-t border-slate-200 pt-3 dark:border-slate-700"><Detail label="Ghi chú" value={building.description} wide /></dl>}
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
