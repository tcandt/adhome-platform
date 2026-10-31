import React, { useState, useEffect, useRef } from 'react';

/**
 * Formats integer VND value into localized string with dot thousand separators.
 * Example: 5000000 -> "5.000.000"
 */
export function formatVnd(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '';
  }
  const intVal = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value)));
  return intVal.toLocaleString('vi-VN');
}

/**
 * Formats currency value with trailing symbol.
 * Example: 5000000 -> "5.000.000 đ"
 */
export function formatCurrency(
  value: number | bigint | null | undefined,
  currency = 'đ'
): string {
  const formatted = formatVnd(value);
  if (!formatted) return `0 ${currency}`;
  return `${formatted} ${currency}`;
}

/**
 * Parses user input string with thousand separators into pure integer number.
 * Example: "5.000.000" -> 5000000
 */
export function parseVnd(input: string): number {
  if (!input) return 0;
  // Strip all non-digit characters except minus sign
  const clean = input.replace(/[^\d-]/g, '');
  if (!clean || clean === '-') return 0;
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Validates integer VND amount.
 */
export function validateVnd(value: number, min = 0, max = 100_000_000_000): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | bigint | string;
  onChange: (value: number) => void;
  currencySuffix?: string;
  min?: number;
  max?: number;
  error?: string;
  label?: string;
}

/**
 * Standard Global Money Input Component (UI-01)
 * Enforces caret position stability, dot thousand separation, and integer VND precision.
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  currencySuffix = 'đ',
  min = 0,
  max,
  error,
  label,
  className = '',
  disabled,
  placeholder = '0',
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const num = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : parseVnd(value);
    return num === 0 ? '' : formatVnd(num);
  });

  // Sync external value updates
  useEffect(() => {
    const numeric = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : parseVnd(value);
    const formatted = numeric === 0 ? '' : formatVnd(numeric);
    if (parseVnd(displayValue) !== numeric) {
      setDisplayValue(formatted);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawVal = input.value;
    const prevCaret = input.selectionStart || 0;

    // Digits before caret
    const digitsBeforeCaret = rawVal.slice(0, prevCaret).replace(/\D/g, '').length;

    const parsed = parseVnd(rawVal);
    const clamped = min !== undefined && parsed < min ? min : max !== undefined && parsed > max ? max : parsed;

    const formatted = clamped === 0 && rawVal.trim() === '' ? '' : formatVnd(clamped);
    setDisplayValue(formatted);
    onChange(clamped);

    // Caret restoration
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let newCaret = 0;
      let digitsFound = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          digitsFound++;
        }
        if (digitsFound >= digitsBeforeCaret) {
          newCaret = i + 1;
          break;
        }
      }
      if (digitsBeforeCaret === 0) newCaret = 0;
      inputRef.current.setSelectionRange(newCaret, newCaret);
    });
  };

  return (
    <div className="w-full space-y-1">
      {label && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <div className="relative rounded-lg shadow-sm">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full rounded-lg border text-right pr-9 pl-3 py-2 text-sm tabular-nums transition-colors outline-none font-medium ${
            error
              ? 'border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-900 bg-rose-50/20'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
          } ${disabled ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : ''} ${className}`}
          {...rest}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 select-none">
            {currencySuffix}
          </span>
        </div>
      </div>
      {error && <p className="text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
  );
};

