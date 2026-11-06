import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { Toast } from '@animate-ui/react/primitives/base-ui/toast';

export const saveToastManager = Toast.createToastManager();
export function notifySave(success: boolean, title: string, description?: string) {
  saveToastManager.add({ type: success ? 'success' : 'error', title, description, priority: success ? 'low' : 'high' });
}
export function SaveToastProvider({ children }: { children: ReactNode }) {
  return <Toast.Provider toastManager={saveToastManager}><ToastItems />{children}</Toast.Provider>;
}
function ToastItems() {
  const { toasts } = Toast.useToastManager();
  return <Toast.Portal><Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col outline-none max-sm:bottom-20 max-sm:left-4">
    {toasts.map(item => <Toast.Root key={item.id} toast={item} className="mb-2 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"><Toast.Content className="flex items-start gap-3 p-4 text-slate-900 dark:text-slate-100">
      {item.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <CircleAlert className="h-5 w-5 shrink-0 text-rose-600" />}
      <div className="min-w-0 flex-1"><Toast.Title className="text-sm font-semibold" /><Toast.Description className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300" /></div>
      <Toast.Close aria-label="Đóng thông báo" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></Toast.Close>
    </Toast.Content></Toast.Root>)}
  </Toast.Viewport></Toast.Portal>;
}
