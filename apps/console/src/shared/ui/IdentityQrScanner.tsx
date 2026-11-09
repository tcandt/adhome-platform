import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Menu } from '@animate-ui/react/primitives/base-ui/menu';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Camera, ImagePlus, ScanLine, X } from 'lucide-react';
import { type IdentityDetails } from './identityQr';
import { decodeIdentityQr } from './decodeIdentityQr';

function scanError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  if (/MIME|dynamically imported|module script|fetch|WebAssembly|CompileError/i.test(message)) return 'Không tải được bộ quét. Kiểm tra kết nối rồi thử lại; nếu vừa cập nhật ứng dụng, hãy lưu thông tin đang nhập trước khi tải lại trang.';
  return message || fallback;
}

export function IdentityQrScanner({ onApply }: { onApply: (details: IdentityDetails) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const onApplyRef = useRef(onApply);
  useEffect(() => { onApplyRef.current = onApply; }, [onApply]);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const stop = () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCamera(false); setBusy(false); };
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => { const hide = () => { if (document.hidden) stop(); }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, []);
  const apply = (data: IdentityDetails) => { stop(); setOpen(false); setError(''); onApplyRef.current(data); };
  const upload = async (selected?: File) => {
    if (!selected) return;
    setOpen(true);
    stop(); const run = generation.current; setBusy(true); setError('');
    let url = '';
    try {
      if (selected.size > 20 * 1024 * 1024) throw new Error('Chọn ảnh nhỏ hơn 20 MB.');
      const img = new Image(); url = URL.createObjectURL(selected); img.src = url; await img.decode();
      const data = await decodeIdentityQr(img, img.naturalWidth, img.naturalHeight, true, () => run === generation.current);
      if (run !== generation.current) return;
      if (!data) throw new Error('Không đọc được QR. Chụp gần mã hơn, đủ sáng và không bị lóa.');
      apply(data);
    } catch (e) { if (run === generation.current) setError(scanError(e, 'Ảnh không đọc được. Thử ảnh JPG hoặc PNG.')); }
    finally { if (url) URL.revokeObjectURL(url); if (run === generation.current) setBusy(false); }
  };
  const startCamera = async () => {
    setOpen(true);
    stop(); const run = generation.current; setError(''); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error('Camera trực tiếp cần HTTPS hoặc localhost. Bạn vẫn có thể chọn Chụp ảnh hoặc tải ảnh QR.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      if (run !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media; setCamera(true); setBusy(false);
    } catch (e) { if (run === generation.current) { setBusy(false); setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Chưa được cấp quyền camera. Cho phép camera hoặc chọn ảnh có QR.' : e instanceof Error ? e.message : 'Không mở được camera.'); } }
  };
  useEffect(() => {
    if (!camera || !video.current || !stream.current) return;
    const run = generation.current; let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (run !== generation.current) return;
      try {
        const v = video.current;
        if (v && v.readyState >= 2) { const data = await decodeIdentityQr(v, v.videoWidth, v.videoHeight); if (run !== generation.current) return; if (data) { apply(data); return; } }
      } catch (e) { if (run === generation.current) setError(scanError(e, 'Không đọc được mã.')); }
      if (run === generation.current) timer = setTimeout(read, 450);
    };
    video.current.srcObject = stream.current;
    void video.current.play().then(read).catch(() => { if (run === generation.current) { stop(); setError('Không phát được camera. Thử chụp ảnh hoặc tải ảnh.'); } });
    return () => { if (timer) clearTimeout(timer); };
  }, [camera]);
  const close = () => { stop(); setOpen(false); setError(''); };
  return <span className="identity-qr" data-scanning={open}>
    <Menu.Root><Menu.Trigger className="identity-qr-trigger" aria-label="Quét QR căn cước" title="Quét QR căn cước"><ScanLine size={17} /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="identity-qr-menu-positioner"><Menu.Popup className="identity-qr-menu"><Menu.Item className="identity-qr-menu-item" onClick={() => file.current?.click()}><ImagePlus size={16} />Tải ảnh</Menu.Item><Menu.Item className="identity-qr-menu-item" onClick={() => photo.current?.click()}><Camera size={16} />Chụp ảnh</Menu.Item><Menu.Item className="identity-qr-menu-item" onClick={() => void startCamera()}><ScanLine size={16} />Camera</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
    <input ref={file} aria-label="Ảnh QR căn cước" type="file" accept="image/*" className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={photo} aria-label="Chụp QR căn cước" type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
    <Dialog.Root open={open} onOpenChange={next => { if (!next) close(); }}><Dialog.Portal><Dialog.Backdrop className="identity-qr-backdrop" /><Dialog.Viewport className="identity-qr-viewport"><Dialog.Popup from="bottom" className="identity-qr-panel"><div className="identity-qr-dialog-heading"><Dialog.Title>Quét căn cước</Dialog.Title><Dialog.Close aria-label="Đóng quét QR" className="identity-qr-trigger"><X size={16} /></Dialog.Close></div><Dialog.Description className="sr-only">Thông tin hợp lệ từ mã QR được tự động điền vào hồ sơ.</Dialog.Description>
      {error && <div className="identity-qr-tools"><Button type="button" className="rental-button rental-button-secondary" disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={14} />Tải ảnh khác</Button><Button type="button" className="rental-button rental-button-secondary" disabled={busy} onClick={() => photo.current?.click()}><Camera size={14} />Chụp lại</Button></div>}
      {busy && <p role="status">Đang đọc mã QR…</p>}
      {camera && <><video ref={video} playsInline muted className="identity-qr-video" /><button type="button" className="rental-text-button" onClick={stop}>Dừng camera</button></>}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
    </Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>
  </span>;
}
