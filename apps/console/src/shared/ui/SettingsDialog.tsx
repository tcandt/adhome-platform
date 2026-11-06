import { useState, type ReactNode } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';

export function SettingsDialog({ title, description, busy, onClose, children }: {
  title: string; description: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const [returnFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[111] flex items-center justify-center p-3 sm:p-4">
        <Dialog.Popup from="bottom" finalFocus={() => returnFocus?.isConnected ? returnFocus : undefined} aria-busy={busy} className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827]">
          <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-sm text-slate-500">{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
