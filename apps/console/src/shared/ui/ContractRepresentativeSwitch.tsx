import { Switch } from "@animate-ui/react/primitives/base-ui/switch";
import { useId } from 'react';

interface ContractRepresentativeSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ContractRepresentativeSwitch({
  checked,
  onCheckedChange,
  disabled = false,
}: ContractRepresentativeSwitchProps) {
  const id = useId();
  const title = checked ? "Người đại diện hợp đồng" : "Người cùng hộ";
  const description = checked
    ? "Có hồ sơ hợp đồng riêng và dùng chung tài chính với hợp đồng chính."
    : "Được ghi nhận là thành viên cùng hộ với người đại diện."

  return (
    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-white/80 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </span>
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold leading-none ${checked ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            {checked ? "Đại diện" : "Cùng hộ"}
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </label>
      <Switch.Root
        id={id}
        disabled={disabled}
        aria-label={title}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative !h-[18px] !w-8 shrink-0 cursor-pointer rounded-full border border-slate-300 bg-slate-200 !p-0 shadow-inner outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 data-[checked]:border-blue-600 data-[checked]:bg-blue-600 dark:border-slate-600 dark:bg-slate-700 dark:focus-visible:ring-offset-slate-900 dark:data-[checked]:border-blue-500 dark:data-[checked]:bg-blue-500"
      >
        <Switch.Thumb className="absolute left-0.5 top-0.5 block h-3 w-3 rounded-full bg-white shadow-sm data-[checked]:translate-x-[14px]" />
      </Switch.Root>
    </div>
  );
}
