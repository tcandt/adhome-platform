import { useLayoutEffect, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | null;
  onChange: (value: number | null) => void;
};

const format = (value: number | null) => value === null ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);

export function VndAmountInput({ value, onChange, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caretDigits.current === null || !inputRef.current) return;
    const input = inputRef.current;
    const digits = caretDigits.current;
    const shown = input.value;
    let position = 0;
    let seen = 0;
    while (position < shown.length && seen < digits) {
      if (/\d/.test(shown[position])) seen++;
      position++;
    }
    input.setSelectionRange(position, position);
    caretDigits.current = null;
  }, [value]);

  return <input {...props} ref={inputRef} type="text" inputMode="numeric" pattern="[0-9.]*" value={format(value)} onChange={event => {
    const selection = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
    caretDigits.current = (event.currentTarget.value.slice(0, selection).match(/\d/g) || []).length;
    const digits = event.currentTarget.value.replace(/\D/g, '');
    const parsed = digits ? Number(digits) : null;
    onChange(parsed !== null && Number.isSafeInteger(parsed) ? parsed : value);
  }} />;
}
