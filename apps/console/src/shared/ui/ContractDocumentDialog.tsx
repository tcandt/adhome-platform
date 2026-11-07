import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { AlertCircle, ChevronDown, Download, ExternalLink, FileText, Printer, RefreshCw, X } from 'lucide-react';
const ContractPdfViewer = React.lazy(() => import('./ContractPdfViewer'));
import './ContractDocumentDialog.css';

type Profile = { tenant: Record<string, string>; landlord: Record<string, string>; members: any[]; [key: string]: any };
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AdHome-Console' };
class MissingContractDetails extends Error {}

export function ContractDocumentLink({ contractId, children, draftProfile, onProfileSaved, className = '' }: { contractId: string; children: React.ReactNode; draftProfile?: Profile; onProfileSaved?: (profile: Profile) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={`contract-document-link ${className}`} onClick={() => setOpen(true)} aria-label={`Xem hợp đồng ${typeof children === 'string' ? children : ''}`}>{children}</button>
    {open && <ContractDocumentDialog contractId={contractId} draftProfile={draftProfile} onProfileSaved={onProfileSaved} onClose={() => setOpen(false)} />}</>;
}

export function ContractDocumentDialog({ contractId, draftProfile, onProfileSaved, onClose }: { contractId: string; draftProfile?: Profile; onProfileSaved?: (profile: Profile) => void; onClose: () => void }) {
  const [record, setRecord] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('Đang lấy thông tin hợp đồng…');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [printError, setPrintError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const request = useRef<AbortController | null>(null);
  const initialDraft = useRef(draftProfile);
  const endpoint = `/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/document`;
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const checkResponse = async (response: Response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 422 && Array.isArray(data.missing) && data.missing.length) {
        setMissing(data.missing); setEditing(true);
        throw new MissingContractDetails(data.message);
      }
      throw new Error(data.message || 'Không thể tải hợp đồng. Vui lòng thử lại.');
    }
  };
  const generate = async (selected: Profile, signal: AbortSignal, save = false) => {
    setError(''); setPrintError(''); setPdfUrl(''); setPdfBlob(null); setFrameReady(false);
    let didSave = false;
    try {
      if (save) {
        setBusy('Đang lưu thông tin hợp đồng…');
        const saved = await fetch(`${endpoint}/profile`, { method: 'POST', headers, body: JSON.stringify({ profile: selected }), signal });
        await checkResponse(saved);
        const savedData = await saved.json();
        if (savedData.ok !== true) throw new Error('Chưa xác nhận được việc lưu thông tin. Vui lòng thử lại.');
        setMissing(savedData.missing || []);
        didSave = true; onProfileSaved?.(selected);
      }
      setBusy('Đang tạo bản PDF…');
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ profile: selected }), signal });
      await checkResponse(response);
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Máy chủ chưa trả về bản PDF hợp lệ. Vui lòng thử lại.');
      const blob = await response.blob();
      if (await blob.slice(0, 5).text() !== '%PDF-') throw new Error('Tệp PDF chưa hợp lệ. Vui lòng tạo lại.');
      if (signal.aborted) return;
      setMissing([]); setEditing(false); setPdfBlob(blob); setPdfUrl(URL.createObjectURL(blob));
    } catch (e) { if (!signal.aborted) setError(e instanceof MissingContractDetails ? '' : `${didSave ? 'Đã lưu thông tin. ' : ''}${e instanceof Error ? e.message : 'Không thể tạo hợp đồng.'}`); }
    finally { if (!signal.aborted) setBusy(''); }
  };
  const load = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy('Đang lấy thông tin hợp đồng…'); setError('');
    try {
      const response = await fetch(endpoint, { signal: controller.signal }); await checkResponse(response);
      const data = await response.json();
      if (controller.signal.aborted) return;
      setRecord(data);
      const selected = initialDraft.current || data.profile; setProfile(selected);
      setMissing(data.missing || []);
      if (!initialDraft.current && data.missing?.length) { setEditing(true); setBusy(''); }
      else await generate(selected, controller.signal);
    } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Không thể tải hợp đồng.'); setBusy(''); } }
  };
  useEffect(() => { void load(); return () => request.current?.abort(); }, [contractId]);
  const preview = (save = false) => {
    if (!profile || busy) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    void generate(profile, controller.signal, save);
  };
  const edit = (key: string, value: any) => { setProfile(p => p ? { ...p, [key]: value } : p); setPdfUrl(''); setFrameReady(false); };
  const input = (group: 'tenant' | 'landlord', key: string, label: string, type = 'text', wide = false) => <label className={wide ? 'contract-field-wide' : ''}>{label}<input type={type} value={profile?.[group][key] || ''} onChange={e => edit(group, { ...profile?.[group], [key]: e.target.value })} /></label>;
  const filename = `Hop-dong-${(record?.contract.contractCode || contractId).replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
  const usesNativePdfPrint = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const openPdf = () => { if (pdfUrl) window.open(pdfUrl, '_blank', 'noopener,noreferrer'); };
  const print = () => {
    setPrintError('');
    try {
      if (usesNativePdfPrint) {
        const pdfWindow = window.open(pdfUrl, '_blank');
        if (!pdfWindow) throw new Error();
        return;
      }
      if (!frame.current?.contentWindow) throw new Error();
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    } catch {
      setPrintError('Không mở được bản PDF đầy đủ. Hãy cho phép cửa sổ bật lên, sau đó mở PDF và chọn In.');
    }
  };

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="contract-document-backdrop" /><Dialog.Viewport className="contract-document-viewport"><Dialog.Popup from="bottom" className="contract-document-dialog" data-testid="contract-document-dialog">
    <header className="contract-document-header"><div><Dialog.Title>{record?.contract.contractCode || 'Hợp đồng thuê căn hộ'}</Dialog.Title><Dialog.Description>{record ? `${record.room.buildingName} · Phòng ${record.room.code}` : 'Bản hợp đồng PDF'}</Dialog.Description></div><Dialog.Close className="contract-icon-button" aria-label="Đóng hợp đồng" title="Đóng"><X size={18} /></Dialog.Close></header>
    <div className="contract-document-toolbar"><div className="contract-view-tabs" role="group" aria-label="Nội dung hợp đồng"><Button type="button" aria-pressed={!editing} disabled={!!busy || !pdfUrl} onClick={() => setEditing(false)}>Bản PDF</Button><Button type="button" aria-pressed={editing} disabled={!!busy || !profile} onClick={() => setEditing(true)}>Thông tin</Button></div>
      <div className="contract-document-tools"><Button type="button" className="contract-icon-button" title="Mở PDF trong tab mới" aria-label="Mở PDF trong tab mới" disabled={!pdfUrl || !!busy} onClick={openPdf}><ExternalLink size={17} /></Button><Button type="button" className="contract-icon-button" title={usesNativePdfPrint ? 'Mở PDF đầy đủ để in tất cả trang' : 'In hợp đồng'} aria-label={usesNativePdfPrint ? 'Mở PDF đầy đủ để in tất cả trang' : 'In hợp đồng'} disabled={!pdfUrl || !!busy || (!usesNativePdfPrint && !frameReady) || editing} onClick={print}><Printer size={17} /></Button><Button type="button" className="contract-icon-button" title="Tải PDF" aria-label="Tải PDF" disabled={!pdfUrl || !!busy} onClick={() => { const link = document.createElement('a'); link.href = pdfUrl; link.download = filename; link.click(); }}><Download size={17} /></Button></div>
    </div>
    {error && <div role="alert" className="contract-document-error">{error}<Button type="button" className="contract-inline-button" disabled={!!busy} onClick={() => profile ? preview() : void load()}><RefreshCw size={14} />Thử lại</Button></div>}
    {printError && <p role="alert" className="contract-document-error">{printError}</p>}
    <div className="contract-document-body" aria-busy={!!busy}>
      {busy ? <div role="status" className="contract-document-loading"><FileText size={28} strokeWidth={1.5} /><span className="sr-only">{busy}</span><span aria-hidden="true"><ShimmeringText text={busy} /></span></div> : editing && profile ? <form id="contract-document-form" className="contract-document-form" onSubmit={e => { e.preventDefault(); preview(true); }}>
        {missing.length > 0 && <details className="contract-missing"><summary><AlertCircle size={16} /><span role="status">Cần bổ sung {missing.length} thông tin</span><ChevronDown size={15} /></summary><ul>{missing.map(label => <li key={label}>{label}</li>)}</ul></details>}
        <section><h3>Khách thuê</h3><div className="contract-document-fields">{input('tenant', 'fullName', 'Họ và tên')}{input('tenant', 'idNumber', 'Số căn cước / giấy tờ')}{input('tenant', 'birthDate', 'Ngày sinh', 'date')}{input('tenant', 'phone', 'Số điện thoại', 'tel')}{input('tenant', 'address', 'Địa chỉ thường trú', 'text', true)}</div></section>
        <section><h3>Bên cho thuê</h3><div className="contract-document-fields">{input('landlord', 'fullName', 'Họ và tên bên cho thuê')}{input('landlord', 'idNumber', 'Giấy tờ bên cho thuê')}{input('landlord', 'birthDate', 'Ngày sinh bên cho thuê', 'date')}{input('landlord', 'phone', 'Điện thoại bên cho thuê', 'tel')}{input('landlord', 'address', 'Địa chỉ bên cho thuê', 'text', true)}{input('landlord', 'accountName', 'Chủ tài khoản')}{input('landlord', 'accountNumber', 'Số tài khoản')}{input('landlord', 'bank', 'Ngân hàng', 'text', true)}</div></section>
        <section><h3>Thông tin hợp đồng</h3><div className="contract-document-fields"><label>Mẫu hợp đồng<select value={profile.leaseTemplate} onChange={e => edit('leaseTemplate', e.target.value)}><option value="LEASE_1PN">Căn hộ 1 phòng ngủ</option><option value="LEASE_2PN">Căn hộ 2 phòng ngủ</option></select></label><label>Ngày lập / ký<input type="date" value={profile.signedDate || ''} onChange={e => edit('signedDate', e.target.value)} /></label><label className="contract-field-wide">Địa chỉ căn hộ<input value={profile.rentalAddress || ''} onChange={e => edit('rentalAddress', e.target.value)} /></label><label>Thời hạn thuê<input value={profile.durationText || ''} onChange={e => edit('durationText', e.target.value)} /></label><label>Mục đích thuê<input value={profile.purpose || ''} onChange={e => edit('purpose', e.target.value)} /></label><label className="contract-field-wide">Liên hệ quản lý<input value={profile.managerContact || ''} onChange={e => edit('managerContact', e.target.value)} /></label></div>
          <dl className="contract-document-terms"><div><dt>Thời hạn</dt><dd>{record?.contract.startDate} → {record?.contract.endDate}</dd></div><div><dt>Tiền thuê / tháng</dt><dd>{record?.contract.monthlyRentVnd.toLocaleString('vi-VN')} đ</dd></div><div><dt>Tiền cọc hợp đồng</dt><dd>{record?.contract.depositVnd.toLocaleString('vi-VN')} đ</dd></div></dl></section>
      </form> : pdfBlob ? <React.Suspense fallback={<div role="status" className="contract-document-loading"><ShimmeringText text="Đang mở các trang PDF…" /></div>}><ContractPdfViewer file={pdfBlob} /></React.Suspense> : <div className="contract-document-empty"><FileText size={32} strokeWidth={1.5} /><p>Chưa có bản PDF</p>{profile && <Button type="button" className="contract-inline-button" onClick={() => setEditing(true)}>Kiểm tra thông tin</Button>}</div>}
    </div>
    {pdfUrl && <iframe ref={frame} className="contract-print-frame" title="In hợp đồng" src={pdfUrl} onLoad={() => setFrameReady(true)} />}
    {editing && profile && <footer className="contract-document-footer"><Button type="button" className="contract-secondary-button" disabled={!!busy} onClick={() => preview()}>Xem trước</Button><Button type="submit" form="contract-document-form" className="contract-primary-button" disabled={!!busy}>Lưu & xem PDF</Button></footer>}
  </Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}
