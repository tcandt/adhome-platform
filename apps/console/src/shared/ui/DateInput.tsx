import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatVnDate, parseVnDateToIso } from '../tokens/designTokens';

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string | null; // ISO 'YYYY-MM-DD' or ''
  onChange: (isoValue: string) => void;
  min?: string; // ISO 'YYYY-MM-DD'
  max?: string; // ISO 'YYYY-MM-DD'
  error?: string;
  label?: string;
  className?: string;
}

const formatDateDraft = (input: string) => {
  // If user pasted ISO YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/**
 * Standard Global Date Input Component
 * Enforces DD/MM/YYYY display, GMT+7 alignment, numeric masking, and native calendar picker fallback.
 */
export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  min,
  max,
  error,
  label,
  className = '',
  disabled = false,
  readOnly = false,
  placeholder = 'dd/mm/yyyy',
  required = false,
  id,
  'aria-label': ariaLabel,
  ...rest
}) => {
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<string>(() => {
    if (!value) return '';
    return formatVnDate(value);
  });

  // Sync external value updates
  useEffect(() => {
    if (!value) {
      setDraft('');
      return;
    }
    const formatted = formatVnDate(value);
    if (formatted !== '—') {
      setDraft(formatted);
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) {
      setDraft('');
      onChange('');
      return;
    }
    const next = formatDateDraft(raw);
    setDraft(next);

    if (next.length === 10) {
      const iso = parseVnDateToIso(next);
      if (iso) {
        onChange(iso);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (draft && draft.length === 10) {
      const iso = parseVnDateToIso(draft);
      if (iso) {
        onChange(iso);
        setDraft(formatVnDate(iso));
      } else {
        // If invalid, reset to previous valid value
        setDraft(value ? formatVnDate(value) : '');
      }
    } else if (draft && draft.length < 10) {
      // Incomplete date, revert to last valid value
      setDraft(value ? formatVnDate(value) : '');
    }
    if (rest.onBlur) {
      rest.onBlur(e);
    }
  };

  const openPicker = () => {
    if (disabled || readOnly) return;
    const picker = nativePickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === 'function') {
      try {
        picker.showPicker();
        return;
      } catch {
        // Fallback
      }
    }
    picker.focus();
  };

  const isoValue = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

  return (
    <div className="relative w-full min-w-0">
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full min-w-0">
        <input
          ref={textInputRef}
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          placeholder={placeholder}
          maxLength={10}
          value={draft}
          onChange={handleTextChange}
          onBlur={handleBlur}
          aria-label={ariaLabel || label}
          aria-invalid={Boolean(error)}
          className={`w-full min-w-0 pr-9 text-left tabular-nums ${className}`}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || readOnly}
          onClick={openPicker}
          aria-label="Mở lịch chọn ngày"
          className="absolute right-0 inset-y-0 flex items-center px-2.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={nativePickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled || readOnly}
          min={min}
          max={max}
          value={isoValue}
          onChange={(e) => {
            const nextIso = e.target.value;
            if (nextIso) {
              onChange(nextIso);
              setDraft(formatVnDate(nextIso));
            }
          }}
          className="sr-only pointer-events-none absolute h-0 w-0 opacity-0"
        />
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
  );
};
