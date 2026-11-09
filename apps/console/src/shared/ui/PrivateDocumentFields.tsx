import { useEffect, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Progress } from '@animate-ui/react/primitives/base-ui/progress';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { Camera, FileText, Trash2, Upload } from 'lucide-react';
import { IdentityDocumentScanner } from './IdentityDocumentScanner';

const maxPrivateDocumentBytes = 25 * 1024 * 1024;

export const buildingDocumentSections = [
  ['TITLE_FRONT', 'Sổ đỏ căn nhà mặt trước'], ['TITLE_BACK', 'Sổ đỏ căn nhà mặt sau'],
  ['BUSINESS_REGISTRATION', 'Giấy chứng nhận đăng ký hộ kinh doanh'], ['SALE_CERTIFICATE', 'Giấy chứng nhận mua bán nhà ở (nếu có)'],
] as const;
const identitySections = [['ID_FRONT', 'CCCD mặt trước'], ['ID_BACK', 'CCCD mặt sau']] as const;
type DocumentMeta = { id: string; kind: string; name: string; mimeType: string; size: number; pages: number };
type PendingDocument = { key: string; kind: string; file: File; uploadId?: string; chunkBytes?: number; part: number };
const headers = { 'X-Requested-With': 'AdHome-Console' };
async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.message || 'Không thể cập nhật tài liệu.');
  return data;
}
const endpointFor = (type: 'buildings' | 'contracts', id: string) => `/api/v1/console/v2/${type}/${encodeURIComponent(id)}/${type === 'buildings' ? 'documents' : 'identity-documents'}`;

export function usePrivateDocuments(type: 'buildings' | 'contracts', entityId?: string) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [pending, setPending] = useState<PendingDocument[]>([]);
  const queue = useRef<PendingDocument[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!entityId);
  const [savedEntityId, setSavedEntityId] = useState<string>();
  const [progress, setProgress] = useState<{ name: string; completed: number; total: number } | null>(null);
  const mounted = useRef(true);
  const flushing = useRef(false);
  const changeQueue = (value: PendingDocument[]) => { queue.current = value; setPending([...value]); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = async (id = entityId, signal?: AbortSignal) => {
    if (!id) return [];
    const data = await responseData(await fetch(endpointFor(type, id), { signal }));
    const verified: DocumentMeta[] = Array.isArray(data.documents) ? data.documents : [];
    if (mounted.current && !signal?.aborted) setDocuments(verified);
    return verified;
  };
  useEffect(() => {
    const controller = new AbortController();
    setDocuments([]); changeQueue([]); setRemoved([]); setError(''); setSavedEntityId(undefined);
    setLoading(!!entityId);
    if (entityId) reload(entityId, controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, entityId]);
  const add = (kind: string, files: File[]) => {
    if (flushing.current) return;
    const oversized = files.find(file => file.size > maxPrivateDocumentBytes);
    if (oversized) { setError(`${oversized.name} vượt quá 25 MB.`); return; }
    const next = files.map(file => ({ key: Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join(''), kind, file, part: 0 }));
    changeQueue([...(type === 'contracts' ? queue.current.filter(item => item.kind !== kind) : queue.current), ...next]); setError('');
  };
  const flush = async (id = entityId) => {
    if (!id) throw new Error('Chưa có hồ sơ để lưu tài liệu.');
    if (flushing.current) throw new Error('Tài liệu đang được lưu.');
    flushing.current = true; setBusy(true); setError('');
    setSavedEntityId(id);
    try {
      const endpoint = endpointFor(type, id);
      for (const documentId of removed) {
        await responseData(await fetch(`${endpoint}/${documentId}`, { method: 'DELETE', headers }));
        setRemoved(previous => previous.filter(value => value !== documentId));
      }
      while (queue.current.length) {
        const item = queue.current[0];
        if (!item.uploadId) {
          const session = await responseData(await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: item.kind, name: item.file.name, mimeType: item.file.type, size: item.file.size }) }));
          item.uploadId = session.uploadId; item.chunkBytes = session.chunkBytes;
        }
        const size = item.chunkBytes!;
        setProgress({ name: item.file.name, completed: Math.min(item.part * size, item.file.size), total: item.file.size });
        for (; item.part < Math.ceil(item.file.size / size); item.part++) {
          const part = await responseData(await fetch(`${endpoint}/${item.uploadId}/chunks?part=${item.part}`, {
            method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: item.file.slice(item.part * size, (item.part + 1) * size),
          }));
          if (part.part !== item.part) throw new Error('Máy chủ chưa xác nhận đủ dữ liệu.');
          setProgress({ name: item.file.name, completed: Math.min((item.part + 1) * size, item.file.size), total: item.file.size });
        }
        const complete = await responseData(await fetch(`${endpoint}/${item.uploadId}/complete`, { method: 'POST', headers }));
        const verified = await reload(id);
        if (!verified.some(d => d.id === complete.document.id)) throw new Error('Chưa xác minh được tệp đã lưu. Vui lòng thử lại.');
        changeQueue(queue.current.slice(1));
      }
      await reload(id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Không thể lưu tài liệu.';
      setError(message); throw new Error(message);
    } finally { flushing.current = false; setBusy(false); setProgress(null); }
  };
  const reset = () => { setDocuments([]); changeQueue([]); setRemoved([]); setError(''); setSavedEntityId(undefined); };
  return { documents: documents.filter(d => !removed.includes(d.id)), pending, error, busy, loading, progress, entityId: entityId || savedEntityId, type,
    add, flush, reset, reload, setError, remove: (id: string) => setRemoved(previous => [...previous, id]),
    discard: (key: string) => changeQueue(queue.current.filter(item => item.key !== key)),
    hasChanges: pending.length > 0 || removed.length > 0 };
}
export type PrivateDocumentState = ReturnType<typeof usePrivateDocuments>;

export function PrivateDocumentFields({ state, disabled = false, onChange }: { state: PrivateDocumentState; disabled?: boolean; onChange?: () => void }) {
  const [scanKind, setScanKind] = useState<string | null>(null);
  const identity = state.type === 'contracts';
  const sections = identity ? identitySections : buildingDocumentSections;
  const blocked = disabled || state.busy || state.loading;
  const pick = (kind: string, files: File[]) => {
    const oversized = files.find(file => file.size > maxPrivateDocumentBytes);
    if (oversized) { state.setError(`${oversized.name} vượt quá 25 MB.`); return; }
    if (identity) { if (files[0]) { setScanKind(kind); setScanFile(files[0]); } }
    else state.add(kind, files);
  };
  const [scanFile, setScanFile] = useState<File | null>(null);
  return <section className="private-document-section space-y-3 border-t border-slate-200 pt-4 text-[13px] dark:border-slate-700" aria-label={identity ? 'Ảnh CCCD hai mặt' : 'Hồ sơ pháp lý tòa nhà'}>
    <h4 className="text-sm font-semibold">{identity ? 'CCCD hai mặt' : 'Hồ sơ pháp lý tòa nhà'}</h4>
    {state.error && <p role="alert" className="break-words text-rose-600">{state.error}</p>}
    {state.loading && <div role="status"><ShimmeringText text="Đang tải hồ sơ…" /></div>}
    {sections.map(([kind, label]) => <div key={kind} className="min-w-0 space-y-2 border-b border-slate-100 pb-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{label}</span><div className="flex shrink-0 gap-1">
        {identity && <label title={`Chụp ${label}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 has-[:disabled]:opacity-40"><Camera size={17} /><input className="sr-only" type="file" accept="image/*" capture="environment" aria-label={`Chụp ${label}`} disabled={blocked} onChange={e => { pick(kind, Array.from(e.target.files || [])); e.target.value = ''; }} /></label>}
        <label title={`Tải lên ${label}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 has-[:disabled]:opacity-40"><Upload size={17} /><input className="sr-only" type="file" multiple={!identity} accept={identity ? 'image/*' : 'image/jpeg,image/png,application/pdf'} aria-label={`Tải lên ${label}`} disabled={blocked} onChange={e => { pick(kind, Array.from(e.target.files || [])); e.target.value = ''; }} /></label>
      </div></div>
      {state.documents.filter(d => d.kind === kind).map(d => <div key={d.id} className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0" /><a className="min-w-0 flex-1 break-all text-blue-600 underline" href={`${endpointFor(state.type, state.entityId!)}/${d.id}`} target="_blank" rel="noreferrer">{d.name}</a><span className="shrink-0 text-slate-500">{d.pages} trang</span><Button type="button" disabled={blocked} title={`Gỡ ${d.name}`} aria-label={`Gỡ ${d.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center text-rose-600" onClick={() => { state.remove(d.id); onChange?.(); }}><Trash2 size={16} /></Button></div>)}
      {state.pending.filter(d => d.kind === kind).map(d => <div key={d.key} className="flex min-w-0 items-center gap-2 text-slate-600"><span className="min-w-0 flex-1 break-all">{d.file.name}</span><span className="shrink-0">Chờ lưu</span><Button type="button" disabled={blocked} title={`Bỏ ${d.file.name}`} aria-label={`Bỏ ${d.file.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center" onClick={() => state.discard(d.key)}><Trash2 size={16} /></Button></div>)}
    </div>)}
    {!identity && <p className="text-[11px] text-slate-500">Ảnh hoặc PDF nhiều trang · tối đa 25 MB mỗi tệp</p>}
    {state.progress && <div role="status" className="min-w-0 space-y-2"><span className="block break-all">{state.progress.name}</span><Progress.Root value={state.progress.completed} max={state.progress.total} aria-label="Dữ liệu đã được máy chủ xác nhận" className="h-1.5 overflow-hidden rounded bg-slate-200"><Progress.Track><Progress.Indicator className="h-full bg-blue-600" /></Progress.Track></Progress.Root><span><ShimmeringText text="Đang lưu và xác minh tệp…" /></span></div>}
    {scanKind && <IdentityDocumentScanner initialFile={scanFile} side={scanKind === 'ID_FRONT' ? 'mặt trước' : 'mặt sau'} onClose={() => { setScanKind(null); setScanFile(null); }} onSave={async file => { state.add(scanKind, [file]); onChange?.(); setScanKind(null); setScanFile(null); }} />}
  </section>;
}

export function ContractIdentityDocuments({ contractId, onChanged, onBusyChange, onPendingChange }: { contractId: string; onChanged?: () => void; onBusyChange?: (busy: boolean) => void; onPendingChange?: (pending: boolean) => void }) {
  const state = usePrivateDocuments('contracts', contractId);
  useEffect(() => { onBusyChange?.(state.busy); return () => onBusyChange?.(false); }, [state.busy, onBusyChange]);
  useEffect(() => { onPendingChange?.(state.hasChanges); return () => onPendingChange?.(false); }, [state.hasChanges, onPendingChange]);
  return <div className="min-w-0"><PrivateDocumentFields state={state} onChange={onChanged} />{state.hasChanges && <Button type="button" disabled={state.busy || state.loading} className="mt-3 min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => { void state.flush().then(() => onChanged?.()).catch(() => {}); }}>{state.busy ? <ShimmeringText text="Đang lưu CCCD…" /> : 'Lưu ảnh CCCD'}</Button>}</div>;
}
