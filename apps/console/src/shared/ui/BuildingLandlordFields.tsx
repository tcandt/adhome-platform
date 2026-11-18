import { useId, type ReactNode } from 'react';
import type { BuildingLandlord } from '@/shared/types/portfolio';
import { DateInput } from '@/shared/ui/DateInput';

export const emptyBuildingLandlord: BuildingLandlord = {
  fullName: '', birthDate: '', address: '', idNumber: '', phone: '', accountNumber: '', bank: '', accountName: '',
};

function LandlordBirthDate({ id, value, onChange }: { id: string; value: string; onChange: (iso: string) => void }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
        Ngày sinh chủ nhà
      </label>
      <DateInput
        id={id}
        data-testid="input-landlord-birthDate"
        value={value}
        onChange={onChange}
        className="building-landlord-input block w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
      />
    </div>
  );
}

export function BuildingLandlordFields({ value, onChange, actions }: {
  value: BuildingLandlord; onChange: (value: BuildingLandlord) => void; actions?: ReactNode;
}) {
  const prefix = useId();
  const field = (key: keyof BuildingLandlord, label: string, options: { wide?: boolean; type?: string; maxLength?: number; numeric?: boolean } = {}) => (
    <div className={`min-w-0 ${options.wide ? 'col-span-2' : ''}`}>
      <label htmlFor={`${prefix}-${key}`} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
      <input id={`${prefix}-${key}`} data-testid={`input-landlord-${key}`} type={options.type || 'text'}
        value={value[key]} maxLength={options.maxLength || 150} inputMode={options.numeric ? 'numeric' : undefined}
        pattern={key === 'idNumber' ? '(\\d{9}|\\d{12})' : undefined}
        title={key === 'idNumber' ? 'CCCD 12 chữ số hoặc CMND cũ 9 chữ số' : undefined}
        onChange={e => onChange({ ...value, [key]: e.target.value })}
        className="building-landlord-input block w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100" />
    </div>
  );
  return <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700" aria-labelledby={`${prefix}-title`}>
    <div className="flex items-center justify-between gap-2"><h3 id={`${prefix}-title`} className="font-semibold text-slate-900 dark:text-slate-100">Thông tin chủ nhà</h3>{actions}</div>
    <div className="grid grid-cols-2 gap-3">
      {field('fullName', 'Họ và tên chủ nhà')}
      {field('phone', 'Số điện thoại', { type: 'tel', maxLength: 30 })}
      {field('idNumber', 'CCCD / CMND', { numeric: true, maxLength: 12 })}
      <LandlordBirthDate id={`${prefix}-birthDate`} value={value.birthDate} onChange={birthDate => onChange({ ...value, birthDate })} />
      {field('address', 'Địa chỉ thường trú', { wide: true, maxLength: 500 })}
    </div>
    <h3 className="pt-1 font-semibold text-slate-900 dark:text-slate-100">Tài khoản ngân hàng</h3>
    <div className="grid grid-cols-2 gap-3">
      {field('accountNumber', 'Số tài khoản', { numeric: true, maxLength: 50 })}
      {field('bank', 'Ngân hàng')}
      {field('accountName', 'Họ tên chủ tài khoản', { wide: true })}
    </div>
  </section>;
}
