import React, { useId, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  formatPeriodDisplay,
  getCurrentVnPeriodKey,
  shiftPeriodKey,
} from '@/app/navigation/navigationConfig';

export interface CompactMonthPickerProps {
  value: string; // 'YYYY-MM'
  onChange: (periodKey: string) => void;
  testIdPrefix?: string;
  className?: string;
  showNavButtons?: boolean;
}

export const CompactMonthPicker: React.FC<CompactMonthPickerProps> = ({
  value,
  onChange,
  testIdPrefix = 'module-period',
  className = '',
  showNavButtons = true,
}) => {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descId = useId();

  const currentVnPeriod = getCurrentVnPeriodKey();
  const [curVnYear, curVnMonth] = currentVnPeriod.split('-').map(Number);

  const initialYear = parseInt(value?.slice(0, 4), 10) || curVnYear;
  const initialMonth = parseInt(value?.slice(5, 7), 10) || curVnMonth;

  const [pickerYear, setPickerYear] = useState(initialYear);
  const [tempMonth, setTempMonth] = useState<number>(initialMonth);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const prevMonthNum = curVnMonth === 1 ? 12 : curVnMonth - 1;
  const prevYearNum = curVnMonth === 1 ? curVnYear - 1 : curVnYear;

  const handleOpen = () => {
    const y = parseInt(value?.slice(0, 4), 10) || curVnYear;
    const m = parseInt(value?.slice(5, 7), 10) || curVnMonth;
    setPickerYear(y);
    setTempMonth(m);

    // Identify active preset precisely
    if (y === curVnYear && m === curVnMonth) {
      setActivePreset('current');
    } else if (y === prevYearNum && m === prevMonthNum) {
      setActivePreset('previous');
    } else {
      setActivePreset(null);
    }
    setOpen(true);
  };

  const handleApply = () => {
    const periodStr = `${pickerYear}-${String(tempMonth).padStart(2, '0')}`;
    onChange(periodStr);
    setOpen(false);
  };

  const handleSelectMonth = (month: number) => {
    setTempMonth(month);
    if (pickerYear === curVnYear && month === curVnMonth) {
      setActivePreset('current');
    } else if (pickerYear === prevYearNum && month === prevMonthNum) {
      setActivePreset('previous');
    } else {
      setActivePreset(null);
    }
  };

  const setPresetMonth = (presetKey: string, m: number, y: number = pickerYear) => {
    setPickerYear(y);
    setTempMonth(m);
    setActivePreset(presetKey);
  };

  return (
    <div className={`inline-flex items-center gap-1 sm:gap-1.5 ${className}`}>
      {showNavButtons && (
        <button
          type="button"
          data-testid={`${testIdPrefix}-prev`}
          aria-label="Kỳ trước"
          onClick={() => onChange(shiftPeriodKey(value, -1))}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50/80 text-slate-600 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        data-testid={`${testIdPrefix}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Chọn kỳ tháng"
        title="Chọn kỳ làm việc"
        onClick={handleOpen}
        className="group relative flex h-9 min-w-0 flex-1 md:flex-initial md:min-w-[168px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 text-xs sm:text-sm font-bold text-slate-800 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-100 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:hover:border-slate-700"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-600 transition-transform group-hover:scale-110 dark:text-blue-400" />
        <span className="truncate tracking-tight">Kỳ {formatPeriodDisplay(value)}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
      </button>

      {showNavButtons && (
        <button
          type="button"
          data-testid={`${testIdPrefix}-next`}
          aria-label="Kỳ kế tiếp"
          onClick={() => onChange(shiftPeriodKey(value, 1))}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50/80 text-slate-600 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {showNavButtons && value !== currentVnPeriod && (
        <button
          type="button"
          onClick={() => onChange(currentVnPeriod)}
          className="hidden xl:inline-flex h-9 items-center rounded-xl border border-blue-200/80 bg-blue-50/80 px-2.5 text-xs font-bold text-blue-700 transition-all hover:bg-blue-100 active:scale-95 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300 shadow-2xs"
          title="Về kỳ hiện tại"
        >
          Kỳ này
        </button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[110] bg-slate-950/50 backdrop-blur-xs transition-opacity" />
          <Dialog.Viewport className="fixed inset-0 z-[111] flex items-end justify-center sm:items-center p-0 sm:p-4">
            <Dialog.Popup
              from="bottom"
              className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-[390px] flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <Calendar className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <Dialog.Title id={titleId} className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      Chọn kỳ làm việc
                    </Dialog.Title>
                    <Dialog.Description id={descId} className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Đối soát, tính phí và quản lý hóa đơn
                    </Dialog.Description>
                  </div>
                </div>
                <Dialog.Close
                  aria-label="Đóng"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              {/* Section 1: Quick Presets (Cân đối 100% full width, không vỡ dòng) */}
              <div className="mt-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Chọn nhanh
                  </span>
                </div>

                {/* Hàng 1: Tháng này & Tháng trước (50% - 50%) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPresetMonth('current', curVnMonth, curVnYear)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold transition-all active:scale-[0.98] ${
                      activePreset === 'current'
                        ? 'bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20'
                        : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Tháng này</span>
                    <span className="text-[10.5px] opacity-75 font-normal tabular-nums">(T{curVnMonth}/{curVnYear})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresetMonth('previous', prevMonthNum, prevYearNum)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold transition-all active:scale-[0.98] ${
                      activePreset === 'previous'
                        ? 'bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20'
                        : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Tháng trước</span>
                    <span className="text-[10.5px] opacity-75 font-normal tabular-nums">(T{prevMonthNum})</span>
                  </button>
                </div>

                {/* Hàng 2: Các Quý chia đều 4 cột đối xứng hoàn hảo */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: 'Q1', label: 'Quý 1', sub: 'T1 - T3', m: 1 },
                    { key: 'Q2', label: 'Quý 2', sub: 'T4 - T6', m: 4 },
                    { key: 'Q3', label: 'Quý 3', sub: 'T7 - T9', m: 7 },
                    { key: 'Q4', label: 'Quý 4', sub: 'T10 - T12', m: 10 },
                  ].map((q) => {
                    const isSelected = activePreset === q.key;
                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => setPresetMonth(q.key, q.m, pickerYear)}
                        className={`flex flex-col items-center justify-center rounded-xl py-1.5 px-1 transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold shadow-xs'
                            : 'border border-slate-200/70 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-tight">{q.label}</span>
                        <span className="text-[9px] opacity-70 leading-tight mt-0.5">{q.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Year Selector Header (Thanh chuyển năm tinh tế, thanh thoát) */}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-100/70 dark:bg-slate-800/60 px-2 py-1">
                <button
                  type="button"
                  aria-label="Năm trước"
                  onClick={() => {
                    setPickerYear((y) => y - 1);
                    setActivePreset(null);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-2xs dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-90"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                    Năm {pickerYear}
                  </span>
                  {pickerYear !== curVnYear && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerYear(curVnYear);
                        setActivePreset(null);
                      }}
                      className="rounded-md bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                    >
                      Về {curVnYear}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  aria-label="Năm sau"
                  onClick={() => {
                    setPickerYear((y) => y + 1);
                    setActivePreset(null);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-2xs dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white transition-all active:scale-90"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Section 3: 12-Month Grid (Lưới 12 tháng hài hòa, thanh lịch) */}
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const isSelected = m === tempMonth;
                  const isRealNow = pickerYear === curVnYear && m === curVnMonth;

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectMonth(m)}
                      className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/25 ring-2 ring-blue-500/20'
                          : isRealNow
                          ? 'border border-blue-400/80 bg-blue-50/70 text-blue-700 font-bold hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-950/50 dark:text-blue-300'
                          : 'border border-slate-200/70 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:bg-slate-800 shadow-2xs'
                      }`}
                    >
                      <span className="leading-tight">Tháng {m}</span>
                      {isRealNow && (
                        <span
                          className={`text-[9px] font-medium leading-none mt-0.5 ${
                            isSelected ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          Hiện tại
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Section 4: Preview & Action Footer */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Kỳ đang chọn:</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 text-xs font-extrabold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 tabular-nums">
                    Tháng {String(tempMonth).padStart(2, '0')}/{pickerYear}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    hoverScale={1.01}
                    tapScale={0.97}
                    onClick={() => setOpen(false)}
                    className="flex-1 h-9.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                  >
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    hoverScale={1.01}
                    tapScale={0.97}
                    onClick={handleApply}
                    className="flex-1 h-9.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm shadow-blue-500/25 active:scale-98 transition-colors"
                  >
                    Áp dụng
                  </Button>
                </div>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
