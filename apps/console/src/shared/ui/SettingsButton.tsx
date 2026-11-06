import type { ComponentProps } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';

export const settingsButtonClass = 'inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:focus-visible:ring-offset-slate-950';
export const settingsPrimaryButtonClass = `${settingsButtonClass} border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-600`;

export function SettingsButton({ primary = false, className = '', ...props }: ComponentProps<typeof Button> & { primary?: boolean }) {
  return <Button hoverScale={1.01} tapScale={0.98} className={`${primary ? settingsPrimaryButtonClass : settingsButtonClass} ${className}`} {...props} />;
}
