import React, { useState, useEffect } from 'react';

export interface DecimalInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  precision?: number; // Default 2 for kWh, 1 for m3
  unitSuffix?: string;
  min?: number;
  max?: number;
  error?: string;
  label?: string;
}

/**
 * Standard Global Decimal Input Component for Meter Readings (kWh, m³) & Measurements (UI-01)
 */
export const DecimalInput: React.FC<DecimalInputProps> = ({
  value,
  onChange,
  precision = 2,
  unitSuffix,
  min = 0,
  max,
  error,
  label,
  className = '',
  disabled,
  placeholder = '0.00',
  ...rest
}) => {
  const [text, setText] = useState<string>(() => {
    if (value === null || value === undefined || isNaN(Number(value))) return '';
    return Number(value).toString();
  });

  useEffect(() => {
    if (value === null || value === undefined || isNaN(Number(value))) {
      setText('');
      return;
    }
    const currentNum = parseFloat(text.replace(',', '.'));
    if (currentNum !== Number(value)) {
      setText(Number(value).toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Allow typing dot or comma
    raw = raw.replace(',', '.');

    // Only allow digits and at most one decimal point
    if (!/^\d*\.?\d*$/.test(raw)) return;

    setText(raw);

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const factor = Math.pow(10, precision);
      const rounded = Math.round(parsed * factor) / factor;
      const clamped = min !== undefined && rounded < min ? min : max !== undefined && rounded > max ? max : rounded;
      onChange(clamped);
    } else {
      onChange(0);
    }
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
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full rounded-lg border text-right pr-12 pl-3 py-2 text-sm tabular-nums transition-colors outline-none font-medium ${
            error
              ? 'border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-900 bg-rose-50/20'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
          } ${disabled ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : ''} ${className}`}
          {...rest}
        />
        {unitSuffix && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 select-none">
              {unitSuffix}
            </span>
          </div>
        )}
      </div>
      {error && <p className="text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
  );
};

