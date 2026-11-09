import React, { useId } from 'react';
import locations from '@/shared/data/vietnam-administrative.json';

export function BuildingAddressFields({ province, ward, onProvinceChange, onWardChange }: {
  province: string;
  ward: string;
  onProvinceChange: (value: string) => void;
  onWardChange: (value: string) => void;
}) {
  const id = useId();
  const normalize = (value: string | undefined | null) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi').trim();
  const selected = locations.find(item => normalize(item.name) === normalize(province));
  const inputClass = 'h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-primary dark:border-slate-700 dark:bg-slate-800/80';
  return <div className="grid grid-cols-2 gap-3">
    <div className="min-w-0">
      <label htmlFor={`${id}-province`} className="mb-1 block text-xs font-semibold">Tỉnh / Thành phố</label>
      <input id={`${id}-province`} data-testid="input-building-province" value={province} list={`${id}-provinces`} onChange={event => {
        const value = event.target.value;
        onProvinceChange(value);
        if (value !== province && locations.some(item => normalize(item.name) === normalize(value))) onWardChange('');
      }} className={inputClass} autoComplete="off" placeholder="Nhập tỉnh / thành phố" />
      <datalist id={`${id}-provinces`}>{locations.map(item => <option key={item.code} value={item.name} />)}</datalist>
    </div>
    <div className="min-w-0">
      <label htmlFor={`${id}-ward`} className="mb-1 block text-xs font-semibold">Phường / Xã</label>
      <input id={`${id}-ward`} data-testid="input-building-ward" value={ward} list={`${id}-wards`} onChange={event => onWardChange(event.target.value)} className={inputClass} autoComplete="off" placeholder="Nhập phường / xã" />
      <datalist id={`${id}-wards`}>{(selected ? selected.wards : locations.flatMap(item => item.wards)).map(item => <option key={item.code} value={item.name} />)}</datalist>
    </div>
  </div>;
}
