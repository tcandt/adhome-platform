import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BuildingLandlord } from '@/shared/types/portfolio';

export const emptyBuildingLandlord: BuildingLandlord = {
  fullName: '', birthDate: '', address: '', idNumber: '', phone: '', accountNumber: '', bank: '', accountName: '',
};

const displayDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
const formatDateDraft = (input: string) => {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};
const parseDate = (display: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
};

function LandlordBirthDate({ id, value, onChange }: { id: string; value: string; onChange: (iso: string) => void }) {
  const [draft, setDraft] = useState(() => displayDate(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(displayDate(value)); input.current?.setCustomValidity(''); }, [value]);
  const update = (raw: string) => {
    const next = formatDateDraft(raw);
    setDraft(next);
    const iso = next ? parseDate(next) : '';
    const isComplete = next.length === 10;
    input.current?.setCustomValidity(next && (!isComplete || iso === null) ? 'Nhập đủ ngày sinh hợp lệ theo định dạng dd/mm/yyyy.' : '');
    if (iso !== null) onChange(iso);
  };
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Ngày sinh chủ nhà</label>
    <input ref={input} id={id} data-testid="input-landlord-birthDate" type="text" inputMode="numeric" autoComplete="bday"
      placeholder="dd/mm/yyyy" maxLength={10} value={draft} onChange={e => update(e.target.value)}
      onBlur={() => { if (draft && !parseDate(draft)) input.current?.reportValidity(); }}
      className="building-landlord-input block w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100" />
  </div>;
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
