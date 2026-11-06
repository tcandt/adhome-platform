import { useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | string | null;
  onValueChange: (value: number) => void;
};

export function NumberInput({ value, onValueChange, min, max, step, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    const next = value === null ? '' : String(value);
    if (!focused.current) setDraft(next);
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      inputMode={step === undefined || step === 1 ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={event => {
        focused.current = true;
        props.onFocus?.(event);
      }}
      onChange={event => {
        const next = event.currentTarget.value;
        setDraft(next);
        if (next === '' || next === '-' || next.endsWith('.')) return;
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      onBlur={event => {
        focused.current = false;
        if (draft !== '' && draft !== '-' && !draft.endsWith('.')) {
          let parsed = Number(draft);
          if (Number.isFinite(parsed)) {
            if (min !== undefined) parsed = Math.max(Number(min), parsed);
            if (max !== undefined) parsed = Math.min(Number(max), parsed);
            setDraft(String(parsed));
            onValueChange(parsed);
          }
        }
        onBlur?.(event);
      }}
    />
  );
}
