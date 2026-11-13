import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { Toast } from '@animate-ui/react/primitives/base-ui/toast';

export const saveToastManager = Toast.createToastManager();

export function notifySave(success: boolean, title: string, description?: string) {
  const type = success ? 'success' : 'error';
  const normalizedDesc = description?.trim() || undefined;
  const dedupeId = `save-toast:${type}:${title.trim()}:${normalizedDesc ?? ''}`;
  saveToastManager.add({
    id: dedupeId,
    type,
    title,
    description: normalizedDesc,
    priority: success ? 'low' : 'high',
  });
}

export function SaveToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={saveToastManager} timeout={3500} limit={3}>
      <ToastItems />
      {children}
    </Toast.Provider>
  );
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}

function ToastItems() {
  const { toasts } = Toast.useToastManager();
  const isMobile = useIsMobileViewport();

  return (
    <Toast.Portal>
      <Toast.Viewport
        data-testid="save-toast-viewport"
        className={
          isMobile
            ? 'fixed top-2.5 left-3 right-3 mx-auto max-w-[360px] z-[120] pointer-events-none outline-none'
            : 'fixed bottom-4 right-4 z-[120] w-[340px] pointer-events-none outline-none'
        }
      >
        {toasts.map((item) => (
          <Toast.Root
            key={item.id}
            toast={item}
            swipeDirection={isMobile ? ['up', 'right'] : ['down', 'right']}
            data-testid="save-toast-item"
            className={`${
              isMobile ? 'top-0' : 'bottom-0'
            } absolute inset-x-0 z-[calc(1000-var(--toast-index,0))] pointer-events-auto rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-lg shadow-slate-900/10 dark:border-slate-700/90 dark:bg-slate-900/95`}
          >
            <Toast.Content className="flex items-start gap-2.5 px-3 py-2.5 text-slate-900 dark:text-slate-100">
              <span data-slot="toast-icon" className="mt-0.5 shrink-0">
                {item.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <CircleAlert className="h-4 w-4 text-rose-600" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Toast.Title className="text-[13px] font-semibold leading-snug" />
                {item.description ? (
                  <Toast.Description className="mt-0.5 break-words text-[11.5px] leading-snug text-slate-600 dark:text-slate-300" />
                ) : null}
              </div>
              <Toast.Close
                aria-label="Đóng thông báo"
                className="-mr-0.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
