import { useState, type FormEvent } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';

export interface RoomTenantDeleteTarget {
  id: string;
  kind: 'occupant' | 'contract' | 'reservation';
  fullName: string;
}

export function DeleteRoomTenantDialog({ target, roomId, buildingName, onClose, onSuccess }: {
  target: RoomTenantDeleteTarget;
  roomId: string;
  buildingName: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    let deleted = committed;
    try {
      if (!deleted) {
        const response = await fetch(`/api/v1/console/v2/rooms/${encodeURIComponent(roomId)}/rental-tenant`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER },
          body: JSON.stringify({ kind: target.kind, id: target.id, confirm: true }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          setError(data.message || 'Không thể xóa khách thuê. Vui lòng thử lại.');
          return;
        }
        deleted = true;
        setCommitted(true);
      }
      await onSuccess();
      onClose();
    } catch {
      setError(deleted ? 'Đã xóa trên máy chủ. Hãy tải lại hồ sơ phòng.' : 'Không nhận được xác nhận từ máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[150] bg-slate-950/60" />
        <Dialog.Viewport className="fixed inset-0 z-[151] flex items-center justify-center p-3">
          <Dialog.Popup from="bottom" className="w-full max-w-sm max-h-[92dvh] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <Dialog.Title className="text-base font-bold">Xóa khách thuê</Dialog.Title>
            <Dialog.Description className="mt-2 break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Xóa vĩnh viễn <strong>{target.fullName}</strong> khỏi tòa <strong>{buildingName}</strong>, gồm hồ sơ lưu trú, hợp đồng đứng tên, tiền cọc, hóa đơn và thanh toán liên quan. Thao tác không thể hoàn tác.
            </Dialog.Description>
            {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
            <form onSubmit={submit} className="mt-4 flex flex-wrap justify-end gap-2">
              <Dialog.Close disabled={busy} className="min-h-11 rounded-lg px-3 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">{committed ? 'Đóng' : 'Hủy'}</Dialog.Close>
              <Button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-rose-700 px-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
                {busy ? <span role="status"><ShimmeringText text={committed ? 'Đang tải lại hồ sơ…' : 'Đang xóa khách thuê…'} /></span>
                  : committed ? 'Tải lại hồ sơ' : 'Xác nhận xóa vĩnh viễn'}
              </Button>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
