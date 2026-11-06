import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Menu } from '@animate-ui/react/primitives/base-ui/menu';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { Archive, Download, MoreHorizontal, RotateCcw, Trash2, X } from 'lucide-react';
import { CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { notifySave } from '@/shared/ui/SaveToast';

type Backup = { id: string; name: string; sizeBytes: number; createdAt: string; createdBy: string; digest: string; counts: Record<string, number> };
type Action = { kind: 'RESTORE' | 'DELETE'; scope?: 'CUSTOMERS' | 'BUILDINGS'; backup?: Backup; counts: Record<string, number>; current?: Record<string, number>; phrase: string };
const base = '/api/v1/console/v2/settings/data';
const labels: Record<string, string> = { building: 'Tòa nhà', floor: 'Tầng', consoleRoom: 'Phòng', tenant: 'Khách thuê', roomReservation: 'Đặt cọc giữ phòng', contract: 'Hợp đồng', invoice: 'Hóa đơn', paymentTransaction: 'Giao dịch thu', ledgerEntry: 'Sổ quỹ', leadInquiry: 'Yêu cầu tư vấn' };
const summary = (counts: Record<string, number>) => Object.entries(labels).filter(([key]) => counts[key]).map(([key, label]) => `${label}: ${counts[key]}`).join(' · ') || 'Chưa có dữ liệu';
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

async function api(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER } : {},
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || 'Không thể xử lý dữ liệu.');
  return data;
}

export function DataManagement() {
  const { refreshPortfolio } = usePortfolio();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [backupDeleteIds, setBackupDeleteIds] = useState<string[] | null>(null);
  const [backupDeleteConfirmation, setBackupDeleteConfirmation] = useState('');
  const [backupDeleteError, setBackupDeleteError] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allSelected = backups.length > 0 && selectedIds.size === backups.length;
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = selectedIds.size > 0 && !allSelected; }, [selectedIds, allSelected]);
  const load = useCallback(async () => {
    const [list, current] = await Promise.all([api('/backups'), api('/summary')]);
    setBackups(list.backups); setCounts(current.counts);
    const available = new Set<string>(list.backups.map((backup: Backup) => backup.id));
    setSelectedIds(previous => new Set([...previous].filter(id => available.has(id))));
  }, []);
  useEffect(() => { void load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [load]);

  const createBackup = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await api('/backup', {}); await load(); setNotice('Đã tạo bản sao lưu mã hóa.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể sao lưu.'); }
    finally { setBusy(false); }
  };
  const importBackup = async (file: File) => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (file.size > 80 * 1024 * 1024 + 65536) throw new Error('File sao lưu vượt giới hạn cho phép.');
      const response = await fetch(`${base}/backups/import`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER }, body: await file.text() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || 'Không thể nhập bản sao lưu.');
      await load(); setNotice('Đã nhập bản sao lưu. Chọn Phục hồi để xem trước và xác nhận.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể nhập bản sao lưu.'); }
    finally { setBusy(false); }
  };
  const preview = async (kind: Action['kind'], scope?: Action['scope'], backup?: Backup) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/preview', kind === 'RESTORE' ? { action: kind, backupId: backup?.id } : { action: kind, scope });
      setAction({ kind, scope, backup, counts: result.counts, current: result.current, phrase: kind === 'RESTORE' ? 'PHUC HOI DU LIEU' : result.confirmation });
      setConfirmation('');
      setActionError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xem trước.'); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!action || confirmation !== action.phrase) return;
    setBusy(true); setError(''); setActionError(''); setNotice('');
    let committed = false;
    try {
      const result = action.kind === 'RESTORE'
        ? await api('/restore', { backupId: action.backup?.id, digest: action.backup?.digest, confirmation })
        : await api('/delete', { scope: action.scope, confirmation });
      committed = true;
      await Promise.all([load(), refreshPortfolio()]);
      setAction(null); setConfirmation('');
      const message = `Đã ${action.kind === 'RESTORE' ? 'phục hồi' : 'xóa'} dữ liệu nghiệp vụ. Bản sao lưu trước thao tác: ${result.rollbackBackupId}.`;
      setNotice(message);
      notifySave(true, action.kind === 'RESTORE' ? 'Phục hồi thành công' : 'Xóa dữ liệu thành công', message);
    } catch (e) {
      const message = committed ? 'Thao tác đã hoàn tất nhưng chưa tải lại được dữ liệu. Hãy làm mới trang.' : e instanceof Error ? e.message : 'Không thể xử lý dữ liệu.';
      if (committed) { setAction(null); setError(message); notifySave(false, 'Cần tải lại dữ liệu', message); }
      else setActionError(message);
    }
    finally { setBusy(false); }
  };
  const toggleBackup = (id: string) => setSelectedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const requestBackupDelete = (ids: string[]) => {
    setBackupDeleteIds(ids); setBackupDeleteConfirmation(''); setBackupDeleteError('');
  };
  const deleteBackups = async () => {
    if (!backupDeleteIds?.length || backupDeleteConfirmation !== 'XOA BAN SAO LUU' || busy) return;
    setBusy(true); setBackupDeleteError(''); setError(''); setNotice('');
    try {
      const result = await api('/backups/delete', { ids: backupDeleteIds, confirmation: backupDeleteConfirmation });
      await load();
      if (result.failedIds?.length) {
        setBackupDeleteIds(result.failedIds);
        setBackupDeleteConfirmation('');
        setBackupDeleteError(`Đã xóa ${result.deletedIds.length} bản; ${result.failedIds.length} bản chưa xóa được. Vui lòng thử lại.`);
      } else {
        setBackupDeleteIds(null); setBackupDeleteConfirmation('');
        const message = `Đã xóa ${result.deletedIds.length} bản sao lưu.`;
        setNotice(message); notifySave(true, 'Xóa bản sao lưu thành công', message);
      }
    } catch (e) { setBackupDeleteError(e instanceof Error ? e.message : 'Không thể xóa bản sao lưu.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4" data-testid="settings-data-management">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111827] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-bold"><Archive size={18} />Sao lưu dữ liệu</h2><p className="mt-1 text-xs text-slate-500">Bản sao lưu được mã hóa trên máy chủ. Cài đặt, tài khoản và nhật ký bảo mật được giữ riêng.</p></div><Button type="button" disabled={busy || loading} onClick={() => void createBackup()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang xử lý…' : 'Tạo bản sao lưu'}</Button></div>
      <label className="mt-4 block text-xs font-semibold">Nhập file sao lưu đã tải xuống<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ''; }} className="mt-2 block w-full min-w-0 text-xs file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:font-semibold dark:file:bg-slate-800" /></label>
      <p className="mt-1 text-[11px] text-slate-500">Bản này chỉ chứa dữ liệu nghiệp vụ Console; Zalo Bot dùng cơ sở dữ liệu riêng. Máy chủ khác cần cùng khóa mã hóa để phục hồi.</p>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Dữ liệu hiện có: {loading ? 'Đang tải…' : summary(counts)}</p>
      <div className="mt-4" data-testid="backup-table-section">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Bản sao lưu đã lưu</h3>
          {selectedIds.size > 0 && <Button type="button" disabled={busy} onClick={() => requestBackupDelete([...selectedIds])} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"><Trash2 size={14} />Xóa {selectedIds.size} bản đã chọn</Button>}
        </div>
        {backups.length > 0 && <p className="mb-2 text-[11px] text-slate-500 sm:hidden">Vuốt ngang để xem đầy đủ các cột.</p>}
        {backups.length === 0 ? <p className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700">Chưa có bản sao lưu.</p> : <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[590px] border-collapse text-left text-xs" aria-label="Danh sách bản sao lưu">
            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>
              <th scope="col" className="w-10 px-3 py-3"><input ref={selectAllRef} type="checkbox" checked={allSelected} disabled={busy} onChange={event => setSelectedIds(event.target.checked ? new Set(backups.map(backup => backup.id)) : new Set())} aria-label="Chọn tất cả bản sao lưu" className="h-4 w-4 accent-blue-600" /></th>
              <th scope="col" className="w-12 px-2 py-3">STT</th>
              <th scope="col" className="min-w-44 px-2 py-3">Tên bản sao lưu</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3">Ngày sao lưu</th>
              <th scope="col" className="whitespace-nowrap px-2 py-3">Kích thước</th>
              <th scope="col" className="w-14 px-2 py-3 text-center">Hành động</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{backups.map((backup, index) => <tr key={backup.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-3 py-2"><input type="checkbox" checked={selectedIds.has(backup.id)} disabled={busy} onChange={() => toggleBackup(backup.id)} aria-label={`Chọn ${backup.name}`} className="h-4 w-4 accent-blue-600" /></td>
              <td className="px-2 py-2 tabular-nums">{index + 1}</td>
              <td className="px-2 py-2"><span className="block font-semibold text-slate-900 dark:text-slate-100">{backup.name}</span><span className="mt-0.5 block text-[11px] text-slate-500">{summary(backup.counts)}</span></td>
              <td className="whitespace-nowrap px-2 py-2 tabular-nums">{new Date(backup.createdAt).toLocaleString('vi-VN')}</td>
              <td className="whitespace-nowrap px-2 py-2 tabular-nums">{formatSize(backup.sizeBytes)}</td>
              <td className="px-2 py-2 text-center"><Menu.Root><Menu.Trigger disabled={busy} aria-label={`Hành động với ${backup.name}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700"><MoreHorizontal size={18} /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-[120]"><Menu.Popup className="min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <Menu.Item onClick={() => { window.location.href = `${base}/backups/${backup.id}/download`; }} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"><Download size={14} />Tải bản mã hóa</Menu.Item>
                <Menu.Item onClick={() => void preview('RESTORE', undefined, backup)} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"><RotateCcw size={14} />Khôi phục</Menu.Item>
                <Menu.Item onClick={() => requestBackupDelete([backup.id])} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 size={14} />Xóa bản sao lưu</Menu.Item>
              </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </section>
    <section className="rounded-2xl border border-rose-200 bg-white p-4 dark:border-rose-900 dark:bg-[#111827] sm:p-5"><h2 className="flex items-center gap-2 text-base font-bold"><Trash2 size={18} />Xóa dữ liệu nghiệp vụ</h2><p className="mt-1 text-xs text-slate-500">Hệ thống tự tạo bản sao lưu trước khi xóa. Cài đặt và tài khoản quản trị không bị xóa. Dữ liệu Zalo Bot nằm ở cơ sở dữ liệu riêng.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void preview('DELETE', 'CUSTOMERS')} className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300">Xóa toàn bộ khách & hồ sơ thuê</Button><Button type="button" disabled={busy} onClick={() => void preview('DELETE', 'BUILDINGS')} className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300">Xóa toàn bộ tòa nhà & dữ liệu thuê</Button></div></section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    <Dialog.Root open={!!action} onOpenChange={open => { if (!open && !busy) { setAction(null); setActionError(''); } }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[130] bg-slate-950/60" />
        <Dialog.Viewport className="fixed inset-0 z-[131] flex items-center justify-center p-3">
          <Dialog.Popup from="bottom" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-base font-bold">{action?.kind === 'RESTORE' ? 'Xác nhận phục hồi' : 'Xác nhận xóa dữ liệu'}</Dialog.Title>
              <Dialog.Close disabled={busy} aria-label="Đóng" className="rounded-lg p-2 disabled:opacity-50"><X size={18} /></Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-300">{action?.kind === 'RESTORE' ? 'Dữ liệu nghiệp vụ hiện tại sẽ được thay bằng bản sao lưu.' : action?.scope === 'CUSTOMERS' ? 'Xóa khách, hợp đồng, hóa đơn và sổ sách thuê; giữ tòa nhà/phòng.' : 'Xóa tòa nhà, phòng và toàn bộ dữ liệu thuê.'} Cài đặt và tài khoản vẫn giữ nguyên.</Dialog.Description>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-800">{action && summary(action.counts)}</p>
            <label className="mt-4 block text-xs font-semibold">Nhập <strong>{action?.phrase}</strong> để xác nhận
              <input value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            {actionError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
            {busy && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300"><span className="sr-only">Đang xử lý dữ liệu và chờ máy chủ xác nhận…</span><span aria-hidden="true"><ShimmeringText text={action?.kind === 'DELETE' ? 'Đang sao lưu và xóa dữ liệu…' : 'Đang sao lưu và phục hồi dữ liệu…'} /></span></p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" onClick={() => { setAction(null); setActionError(''); }} disabled={busy} className="min-h-11 rounded-xl border px-4 text-sm">Hủy</Button>
              <Button type="button" onClick={() => void execute()} disabled={busy || confirmation !== action?.phrase} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang xử lý…' : 'Xác nhận'}</Button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={!!backupDeleteIds} onOpenChange={open => { if (!open && !busy) { setBackupDeleteIds(null); setBackupDeleteError(''); } }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[130] bg-slate-950/60" />
        <Dialog.Viewport className="fixed inset-0 z-[131] flex items-center justify-center p-3">
          <Dialog.Popup from="bottom" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-base font-bold">Xóa bản sao lưu</Dialog.Title><Dialog.Close disabled={busy} aria-label="Đóng" className="rounded-lg p-2 disabled:opacity-50"><X size={18} /></Dialog.Close></div>
            <Dialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-300">Bạn sắp xóa {backupDeleteIds?.length || 0} bản sao lưu đã chọn. Các bản này sẽ không thể dùng để khôi phục sau khi xóa.</Dialog.Description>
            <label className="mt-4 block text-xs font-semibold">Nhập <strong>XOA BAN SAO LUU</strong> để xác nhận
              <input value={backupDeleteConfirmation} onChange={event => setBackupDeleteConfirmation(event.target.value)} disabled={busy} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800" />
            </label>
            {backupDeleteError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{backupDeleteError}</p>}
            {busy && <p role="status" className="mt-3 text-sm"><span className="sr-only">Đang xóa bản sao lưu…</span><span aria-hidden="true"><ShimmeringText text="Đang xóa bản sao lưu…" /></span></p>}
            <div className="mt-5 flex justify-end gap-2"><Button type="button" disabled={busy} onClick={() => setBackupDeleteIds(null)} className="min-h-11 rounded-xl border px-4 text-sm">Hủy</Button><Button type="button" disabled={busy || backupDeleteConfirmation !== 'XOA BAN SAO LUU'} onClick={() => void deleteBackups()} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang xóa…' : 'Xóa bản sao lưu'}</Button></div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
