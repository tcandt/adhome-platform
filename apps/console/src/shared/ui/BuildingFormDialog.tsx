import type { ReactNode } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';

export function BuildingFormDialog({ title, testId, busy, onClose, children }: {
  title: string; testId: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[111] flex items-center justify-center p-3 sm:p-4">
        <Dialog.Popup from="bottom" data-testid={testId} aria-busy={busy} className="building-form-dialog relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-800 dark:bg-[#111827]">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">Thông tin tòa nhà, chủ nhà và tài khoản ngân hàng.</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
