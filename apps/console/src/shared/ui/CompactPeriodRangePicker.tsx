import React, { useId, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import {
  type PeriodRange,
  formatPeriodRangeDisplay,
  getCurrentVnPeriodKey,
} from '@/app/navigation/navigationConfig';

export interface CompactPeriodRangePickerProps {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
  testIdPrefix?: string;
  className?: string;
}

export const CompactPeriodRangePicker: React.FC<CompactPeriodRangePickerProps> = ({
  value,
  onChange,
  testIdPrefix = 'finance-range',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descId = useId();

  // Parse initial selection
  const currentVnPeriod = getCurrentVnPeriodKey();
  const [curVnYear, curVnMonth] = currentVnPeriod.split('-').map(Number);

  const initialYear = parseInt(value.to?.slice(0, 4), 10) || curVnYear;
  const initialFromM = parseInt(value.from?.slice(5, 7), 10) || curVnMonth;
  const initialToM = parseInt(value.to?.slice(5, 7), 10) || curVnMonth;

  const [pickerYear, setPickerYear] = useState(initialYear);
  const [tempFromMonth, setTempFromMonth] = useState<number>(initialFromM);
  const [tempToMonth, setTempToMonth] = useState<number>(initialToM);
  const [isSecondClick, setIsSecondClick] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handleOpen = () => {
    const y = parseInt(value.to?.slice(0, 4), 10) || curVnYear;
    setPickerYear(y);
    const fm = parseInt(value.from?.slice(5, 7), 10) || curVnMonth;
    const tm = parseInt(value.to?.slice(5, 7), 10) || curVnMonth;
    setTempFromMonth(fm);
    setTempToMonth(tm);
    setIsSecondClick(false);

    if (y === curVnYear && fm === curVnMonth && tm === curVnMonth) {
      setActivePreset('current');
    } else {
      setActivePreset(null);
    }
    setOpen(true);
  };

  const handleSelectMonth = (month: number) => {
    setActivePreset(null);
    if (!isSecondClick) {
      // First click: set both start and end to this month
      setTempFromMonth(month);
      setTempToMonth(month);
      setIsSecondClick(true);
    } else {
      // Second click: determine range
      if (month < tempFromMonth) {
        setTempToMonth(tempFromMonth);
        setTempFromMonth(month);
      } else {
        setTempToMonth(month);
      }
      setIsSecondClick(false);
    }
  };

  const setPreset = (presetKey: string, fromM: number, toM: number, y: number = pickerYear) => {
    setPickerYear(y);
    setTempFromMonth(fromM);
    setTempToMonth(toM);
    setActivePreset(presetKey);
    setIsSecondClick(false);
  };

  const handleApply = () => {
    const fromStr = `${pickerYear}-${String(tempFromMonth).padStart(2, '0')}`;
    const toStr = `${pickerYear}-${String(tempToMonth).padStart(2, '0')}`;
    onChange({ from: fromStr, to: toStr });
    setOpen(false);
  };

  const monthsCount = tempToMonth >= tempFromMonth ? tempToMonth - tempFromMonth + 1 : 1;

  return (
    <>
      <button
        type="button"
        data-testid={`${testIdPrefix}-trigger`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Chọn khoảng kỳ tài chính"
        title="Chọn khoảng kỳ làm việc"
        onClick={handleOpen}
        className={`group relative flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 text-xs sm:text-sm font-bold text-slate-800 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-100 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900/60 dark:text-white dark:hover:border-slate-700 ${className}`}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-600 transition-transform group-hover:scale-110 dark:text-blue-400" />
        <span className="truncate tracking-tight">{formatPeriodRangeDisplay(value.from, value.to)}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
      </button>

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
                      Chọn kỳ tài chính
                    </Dialog.Title>
                    <Dialog.Description id={descId} className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Xem doanh thu & dòng tiền theo khoảng thời gian
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

              {/* Section 1: Quick Presets */}
              <div className="mt-3.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Chọn nhanh
                </span>

                {/* Hàng 1: Tháng này & Cả năm */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreset('current', curVnMonth, curVnMonth, curVnYear)}
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
                    onClick={() => setPreset('FY', 1, 12, pickerYear)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold transition-all active:scale-[0.98] ${
                      activePreset === 'FY'
                        ? 'bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20'
                        : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>Cả năm {pickerYear}</span>
                    <span className="text-[10.5px] opacity-75 font-normal">(12T)</span>
                  </button>
                </div>

                {/* Hàng 2: Các Quý chia đều 4 cột */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: 'Q1', label: 'Quý 1', sub: 'T1 - T3', f: 1, t: 3 },
                    { key: 'Q2', label: 'Quý 2', sub: 'T4 - T6', f: 4, t: 6 },
                    { key: 'Q3', label: 'Quý 3', sub: 'T7 - T9', f: 7, t: 9 },
                    { key: 'Q4', label: 'Quý 4', sub: 'T10 - T12', f: 10, t: 12 },
                  ].map((q) => {
                    const isSelected = activePreset === q.key;
                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => setPreset(q.key, q.f, q.t, pickerYear)}
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

              {/* Section 2: Year Selector Header */}
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

              {/* Section 3: 12-Month Grid */}
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const isStart = m === tempFromMonth;
                  const isEnd = m === tempToMonth;
                  const inRange = m >= tempFromMonth && m <= tempToMonth;
                  const isEdge = isStart || isEnd;

                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectMonth(m)}
                      className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                        isEdge
                          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/25 ring-2 ring-blue-500/20'
                          : inRange
                          ? 'bg-blue-100/80 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800'
                          : 'border border-slate-200/70 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:bg-slate-800 shadow-2xs'
                      }`}
                    >
                      <span className="leading-tight">Tháng {m}</span>
                    </button>
                  );
                })}
              </div>

              {/* Section 4: Preview & Action Footer */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Khoảng đang chọn:</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 text-xs font-extrabold text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 tabular-nums">
                    {tempFromMonth === tempToMonth
                      ? `Tháng ${tempFromMonth}/${pickerYear}`
                      : `T${String(tempFromMonth).padStart(2, '0')} - T${String(tempToMonth).padStart(2, '0')}/${pickerYear} (${monthsCount} tháng)`}
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
    </>
  );
};
