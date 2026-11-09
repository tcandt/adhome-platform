import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { Check, Crop, RotateCw, ScanLine, X } from 'lucide-react';
import { detectIdentityDocument, flattenIdentityDocument, type ScanCorners } from './identityDocumentScan';

const defaultCorners: ScanCorners = [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }];
export function IdentityDocumentScanner({ initialFile, side, onSave, onClose }: { initialFile: File | null; side: string; onSave: (file: File) => Promise<void>; onClose: () => void }) {
  const source = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState('');
  const [preview, setPreview] = useState('');
  const cropped = useRef<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<ScanCorners>(defaultCorners);
  const [busy, setBusy] = useState('Đang nhận diện góc…');
  const [error, setError] = useState('');
  const [detected, setDetected] = useState(false);
  const [manual, setManual] = useState(false);
  const generation = useRef(0);
  const orientation = useRef(0);
  const callbacks = useRef({ onSave }); callbacks.current = { onSave };
  const committing = useRef<number | null>(null);
  const commit = async (canvas: HTMLCanvasElement, token: number) => {
    if (committing.current === token || token !== generation.current) return;
    committing.current = token;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể tạo ảnh đã cắt.')), 'image/jpeg', 0.95));
      if (token !== generation.current) return;
      await callbacks.current.onSave(new File([blob], `CCCD-${side === 'mặt trước' ? 'mat-truoc' : 'mat-sau'}.jpg`, { type: 'image/jpeg' }));
    } finally { if (committing.current === token) committing.current = null; }
  };
  const apply = async (canvas: HTMLCanvasElement, points: ScanCorners, token: number, rotation = 0) => {
    const result = await flattenIdentityDocument(canvas, points, rotation);
    if (token !== generation.current) return;
    cropped.current = result; setPreview(result.toDataURL('image/jpeg', 0.95));
    return result;
  };
  useEffect(() => {
    const token = ++generation.current;
    source.current = null; cropped.current = null; orientation.current = 0;
    setImage(''); setPreview(''); setManual(false); setDetected(false); setError(''); setBusy('Đang nhận diện bốn góc…');
    void (async () => {
      if (!initialFile) { setBusy(''); return; }
      const url = URL.createObjectURL(initialFile);
      try {
        const img = new Image(); img.src = url;
        try { await img.decode(); } catch { throw new Error('Không thể đọc ảnh này. Hãy chọn ảnh JPEG hoặc PNG.'); }
        if (token !== generation.current) return;
        const scale = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        source.current = canvas; setImage(canvas.toDataURL('image/jpeg', 0.95));
        const found = await detectIdentityDocument(canvas);
        if (token !== generation.current) return;
        setDetected(found.automatic); setCorners(found.corners || defaultCorners);
        orientation.current = found.rotation;
        if (found.automatic && found.corners) {
          setBusy('Đang cắt và phẳng hoá CCCD…');
          await apply(canvas, found.corners, token, found.rotation);
        } else {
          setError('Chưa xác định chắc chắn đủ bốn góc. Hãy chụp lại ảnh rõ đủ bốn mép CCCD.');
        }
      } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Không thể đọc ảnh này. Hãy chọn ảnh JPEG hoặc PNG.'); }
      finally { URL.revokeObjectURL(url); if (token === generation.current) setBusy(''); }
    })();
    return () => { generation.current++; };
  }, [initialFile]);
  const changeCorner = (index: number, x: number, y: number) => {
    setCorners(previous => previous.map((p, i) => i === index ? { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } : p) as ScanCorners);
    setPreview(''); cropped.current = null; setError('');
  };
  const crop = async () => {
    if (!source.current || busy) return; setBusy('Đang cắt và phẳng hoá…'); setError('');
    const token = generation.current;
    try { await apply(source.current, corners, token, orientation.current); } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Không thể cắt ảnh.'); }
    finally { if (token === generation.current) setBusy(''); }
  };
  const rotate = () => {
    const old = source.current; if (!old || busy) return;
    const canvas = document.createElement('canvas'); canvas.width = old.height; canvas.height = old.width;
    const ctx = canvas.getContext('2d')!; ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(old, 0, 0);
    source.current = canvas; setImage(canvas.toDataURL('image/jpeg', 0.95));
    orientation.current = 0;
    setCorners([corners[3], corners[0], corners[1], corners[2]].map(p => ({ x: 1 - p.y, y: p.x })) as ScanCorners);
    setPreview(''); cropped.current = null;
  };
  const save = async () => {
    if (!cropped.current || busy) return; setBusy('Đang chuẩn bị ảnh CCCD…'); setError('');
    const token = generation.current;
    try {
      await commit(cropped.current, token);
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Không thể lưu ảnh.'); }
    finally { if (token === generation.current) setBusy(''); }
  };
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-[150] bg-slate-950/70" />
    <Dialog.Viewport className="fixed inset-0 z-[151] flex items-center justify-center p-3"><Dialog.Popup from="bottom" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white" aria-busy={!!busy}>
      <header className="flex items-center justify-between gap-2 border-b p-4"><div className="min-w-0"><Dialog.Title className="text-base font-semibold">CCCD {side}</Dialog.Title><Dialog.Description className="text-xs text-slate-500">{detected ? 'Đã nhận diện bốn góc' : manual ? 'Điều chỉnh bốn góc' : 'Quét CCCD tự động'}</Dialog.Description></div><Button type="button" title="Đóng" aria-label="Đóng quét CCCD" disabled={!!busy} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center"><X size={18} /></Button></header>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {busy && <div role="status" className="text-sm"><ShimmeringText text={busy} /></div>}
        {image && (manual || !preview) && <div ref={frame} className="relative mx-auto w-full touch-none" style={{ aspectRatio: `${source.current?.width || 1}/${source.current?.height || 1}` }}>
          <img src={image} alt={`Ảnh CCCD ${side} gốc`} className="absolute inset-0 h-full w-full object-contain" />
          {manual && <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><polygon points={corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="#2563eb22" stroke="#2563eb" strokeWidth="0.5" /></svg>}
          {manual && corners.map((p, index) => <button key={index} type="button" disabled={!!busy} aria-label={`Góc ${index + 1}`} title={`Góc ${index + 1}`} className="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const rect = frame.current?.getBoundingClientRect(); if (rect) changeCorner(index, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
          }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onKeyDown={e => {
            const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const step = directions[e.key]; if (step) { e.preventDefault(); changeCorner(index, p.x + step[0] * (e.shiftKey ? 0.02 : 0.002), p.y + step[1] * (e.shiftKey ? 0.02 : 0.002)); }
          }}>{index + 1}</button>)}
        </div>}
        {preview && <img src={preview} alt={`CCCD ${side} đã cắt và phẳng hoá`} className="mx-auto block max-h-[55dvh] max-w-full rounded border" />}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
        {manual ? <><Button type="button" disabled={!!busy || !image} title="Xoay ảnh 90 độ" aria-label="Xoay ảnh 90 độ" onClick={rotate} className="flex h-11 w-11 items-center justify-center rounded-lg border"><RotateCw size={18} /></Button><Button type="button" disabled={!!busy || !image} onClick={() => void crop()} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><Crop size={16} />Cắt & phẳng hoá</Button></> : <>
          <Button type="button" disabled={!!busy || !image} onClick={() => { setManual(true); setError(''); }} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><ScanLine size={16} />Chỉnh góc</Button>
          {!preview && <Button type="button" disabled={!!busy} onClick={onClose} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Chọn ảnh khác</Button>}
        </>}
        {(preview || manual) && <Button type="button" disabled={!!busy || !preview} onClick={() => void save()} className="flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40"><Check size={16} />Xác nhận ảnh cắt</Button>}
      </footer>
    </Dialog.Popup></Dialog.Viewport>
  </Dialog.Portal></Dialog.Root>;
}
