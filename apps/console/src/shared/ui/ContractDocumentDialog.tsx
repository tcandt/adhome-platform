import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Progress } from '@animate-ui/react/primitives/base-ui/progress';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Printer,
  RefreshCw,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
const ContractPdfViewer = React.lazy(() => import('./ContractPdfViewer'));
type ContractPdfViewerHandle = import('./ContractPdfViewer').ContractPdfViewerHandle;
import './ContractDocumentDialog.css';
import { ContractIdentityDocuments, usePrivateDocuments } from './PrivateDocumentFields';
import { DateInput } from './DateInput';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { formatVnDate } from '@/shared/tokens/designTokens';

type Profile = { tenant: Record<string, string>; landlord: Record<string, string>; members: any[]; [key: string]: any };
type ActiveTab = 'pdf' | 'profile' | 'residence';
type PdfViewMode = 'draft' | 'completed';
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'AdHome-Console' };
class MissingContractDetails extends Error {}

export function ContractDocumentLink({
  contractId,
  children,
  draftProfile,
  personIndex,
  occupantId,
  onProfileSaved,
  className = '',
  testId,
  title,
}: {
  contractId: string;
  children: React.ReactNode;
  draftProfile?: Profile;
  personIndex?: number;
  occupantId?: string;
  onProfileSaved?: (profile: Profile) => void;
  className?: string;
  testId?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid={testId}
        title={title}
        className={`contract-document-link ${className}`}
        onClick={() => setOpen(true)}
        aria-label={`Xem hợp đồng ${typeof children === 'string' ? children : ''}`}
      >
        {children}
      </button>
      {open && (
        <ContractDocumentDialog
          contractId={contractId}
          personIndex={personIndex}
          occupantId={occupantId}
          draftProfile={draftProfile}
          onProfileSaved={onProfileSaved}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function ContractDocumentDialog({
  contractId,
  draftProfile,
  personIndex = 0,
  occupantId,
  onProfileSaved,
  onClose,
}: {
  contractId: string;
  draftProfile?: Profile;
  personIndex?: number;
  occupantId?: string;
  onProfileSaved?: (profile: Profile) => void;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pdf');
  const [bundle, setBundle] = useState(!occupantId && personIndex === 0);
  const [resolvedPersonIndex, setResolvedPersonIndex] = useState(personIndex);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [attachmentsPending, setAttachmentsPending] = useState(false);
  const [busy, setBusy] = useState('Đang lấy thông tin hợp đồng…');
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [printError, setPrintError] = useState('');
  const [printReady, setPrintReady] = useState(false);
  const [pdfViewMode, setPdfViewMode] = useState<PdfViewMode>('draft');
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
  const [signedPdfBusy, setSignedPdfBusy] = useState(false);

  const privateDocs = usePrivateDocuments('contracts', contractId);
  const { refreshPortfolio } = usePortfolio();
  const signedResidenceDoc = privateDocs.documents.find(d => d.kind === 'SIGNED_RESIDENCE_PDF');
  const isResidenceRegistered = Boolean(signedResidenceDoc);
  const signedDocInputRef = useRef<HTMLInputElement>(null);

  const pdfViewer = useRef<ContractPdfViewerHandle>(null);
  const request = useRef<AbortController | null>(null);
  const initialDraft = useRef(draftProfile);
  const endpoint = `/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/document`;

  const signedPdfUrl = signedResidenceDoc
    ? `/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/identity-documents/${signedResidenceDoc.id}`
    : '';

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  useEffect(() => {
    if (!isResidenceRegistered && pdfViewMode === 'completed') {
      setPdfViewMode('draft');
    }
  }, [isResidenceRegistered, pdfViewMode]);

  useEffect(() => {
    if (!signedPdfUrl) {
      setSignedPdfBlob(null);
      return;
    }
    let active = true;
    setSignedPdfBusy(true);
    fetch(signedPdfUrl, { headers: { 'X-Requested-With': 'AdHome-Console' } })
      .then(async res => {
        if (!res.ok) throw new Error('Không thể tải bản PDF đã ký');
        const blob = await res.blob();
        if (active) setSignedPdfBlob(blob);
      })
      .catch(err => {
        console.error('Failed to load signed PDF blob:', err);
      })
      .finally(() => {
        if (active) setSignedPdfBusy(false);
      });
    return () => {
      active = false;
    };
  }, [signedPdfUrl]);

  useEffect(() => {
    if (!pdfMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.contract-pdf-tab-group')) {
        setPdfMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [pdfMenuOpen]);

  const checkResponse = async (response: Response) => {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 422 && Array.isArray(data.missing) && data.missing.length) {
        setMissing(data.missing);
        setActiveTab('profile');
        throw new MissingContractDetails(data.message);
      }
      throw new Error(data.message || 'Không thể tải hợp đồng. Vui lòng thử lại.');
    }
  };

  const generate = async (selected: Profile, signal: AbortSignal, save = false, bundleOverride?: boolean) => {
    setError('');
    setPrintError('');
    setPdfUrl('');
    setPdfBlob(null);
    setPrintReady(false);
    let didSave = false;
    try {
      if (save) {
        setBusy('Đang lưu thông tin hợp đồng…');
        const saved = await fetch(`${endpoint}/profile`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ profile: selected, personIndex, occupantId }),
          signal,
        });
        await checkResponse(saved);
        const savedData = await saved.json();
        if (savedData.ok !== true) throw new Error('Chưa xác nhận được việc lưu thông tin. Vui lòng thử lại.');
        setMissing(savedData.missing || []);
        didSave = true;
        onProfileSaved?.(selected);
      }
      setBusy('Đang tạo bản PDF…');
      const targetBundle = bundleOverride !== undefined ? bundleOverride : bundle;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ profile: selected, bundle: targetBundle, personIndex, occupantId }),
        signal,
      });
      await checkResponse(response);
      if (!response.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error('Máy chủ chưa trả về bản PDF hợp lệ. Vui lòng thử lại.');
      }
      const blob = await response.blob();
      if ((await blob.slice(0, 5).text()) !== '%PDF-') throw new Error('Tệp PDF chưa hợp lệ. Vui lòng tạo lại.');
      if (signal.aborted) return;
      setMissing([]);
      setActiveTab('pdf');
      setPdfBlob(blob);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e) {
      if (!signal.aborted) {
        setError(
          e instanceof MissingContractDetails
            ? ''
            : `${didSave ? 'Đã lưu thông tin. ' : ''}${e instanceof Error ? e.message : 'Không thể tạo hợp đồng.'}`,
        );
      }
    } finally {
      if (!signal.aborted) setBusy('');
    }
  };

  const load = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy('Đang lấy thông tin hợp đồng…');
    setError('');
    try {
      const params = new URLSearchParams({ personIndex: String(personIndex), ...(occupantId ? { occupantId } : {}) });
      const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
      await checkResponse(response);
      const data = await response.json();
      if (controller.signal.aborted) return;
      setRecord(data);
      setResolvedPersonIndex(data.personIndex ?? personIndex);
      const selected = initialDraft.current || data.profile;
      setProfile(selected);
      setMissing(data.missing || []);
      if (!initialDraft.current && data.missing?.length) {
        setActiveTab('profile');
        setBusy('');
      } else {
        await generate(selected, controller.signal);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Không thể tải hợp đồng.');
        setBusy('');
      }
    }
  };

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [contractId, personIndex, occupantId]);

  const preview = (save = false) => {
    if (!profile || busy || attachmentsBusy || attachmentsPending) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    void generate(profile, controller.signal, save);
  };

  const edit = (key: string, value: any) => {
    setProfile(p => (p ? { ...p, [key]: value } : p));
    setPdfUrl('');
    setPrintReady(false);
  };

  const input = (group: 'tenant' | 'landlord', key: string, label: string, type = 'text', wide = false) => {
    const person = group === 'tenant' && resolvedPersonIndex > 0 ? profile?.members[resolvedPersonIndex - 1] : profile?.[group];
    const val = person?.[key] || '';
    const updateVal = (newVal: string) =>
      group === 'tenant' && resolvedPersonIndex > 0
        ? edit('members', profile?.members.map((p, i) => (i === resolvedPersonIndex - 1 ? { ...p, [key]: newVal } : p)))
        : edit(group, { ...person, [key]: newVal });
    if (type === 'date') {
      return (
        <label className={wide ? 'contract-field-wide' : ''}>
          {label}
          <DateInput value={val} onChange={updateVal} aria-label={label} />
        </label>
      );
    }
    return (
      <label className={wide ? 'contract-field-wide' : ''}>
        {label}
        <input
          type={type}
          value={val}
          onChange={e => updateVal(e.target.value)}
        />
      </label>
    );
  };

  const filename = `Hop-dong-${(record?.contract.contractCode || contractId).replace(/[^a-zA-Z0-9_-]/g, '-')}${resolvedPersonIndex > 0 ? `-dai-dien-${resolvedPersonIndex}` : ''}.pdf`;
  const openPdf = () => { if (pdfUrl) window.open(pdfUrl, '_blank', 'noopener,noreferrer'); };
  const print = () => {
    setPrintError('');
    if (!pdfViewer.current?.printAll()) setPrintError('Các trang đang được chuẩn bị. Vui lòng thử lại sau vài giây.');
  };

  // Signed residence PDF upload handler
  const handleUploadSignedPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Vui lòng chọn tệp định dạng PDF (.pdf).');
      return;
    }
    setError('');
    try {
      privateDocs.add('SIGNED_RESIDENCE_PDF', [file]);
      await privateDocs.flush(contractId);
      await privateDocs.reload(contractId);
      void refreshPortfolio();
      setPdfViewMode('completed');
      setActiveTab('pdf');
    } catch (err: any) {
      setError(err.message || 'Không thể tải lên file PDF đã ký.');
    } finally {
      if (signedDocInputRef.current) signedDocInputRef.current.value = '';
    }
  };

  // Signed residence PDF remove handler
  const handleRemoveSignedPdf = async (docId: string) => {
    if (!window.confirm('Bạn có chắc muốn gỡ bỏ file PDF đã ký? Trạng thái sẽ trở về Chưa khai báo tạm trú.')) return;
    try {
      const res = await fetch(`/api/v1/console/v2/contracts/${encodeURIComponent(contractId)}/identity-documents/${docId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Không thể xóa tệp.');
      await privateDocs.reload(contractId);
      void refreshPortfolio();
    } catch (err: any) {
      setError(err.message || 'Không thể xóa tệp.');
    }
  };

  const downloadResidenceTemplate = async (bundleMode: boolean) => {
    if (!profile) return;
    setBusy('Đang chuẩn bị hồ sơ cư trú…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ profile, bundle: bundleMode, personIndex: resolvedPersonIndex, occupantId }),
      });
      if (!response.ok) throw new Error('Không thể xuất hồ sơ.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${bundleMode ? 'Bo-ho-so-cu-tru' : 'CT01'}-${(record?.contract.contractCode || contractId).replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err.message || 'Không thể tải hồ sơ.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !attachmentsBusy && !privateDocs.busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="contract-document-backdrop" />
        <Dialog.Viewport className="contract-document-viewport">
          <Dialog.Popup from="bottom" className="contract-document-dialog" data-testid="contract-document-dialog">
            <input
              ref={signedDocInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              style={{ display: 'none' }}
              onChange={handleUploadSignedPdf}
            />

            <header className="contract-document-header">
              <div>
                <Dialog.Title>{record?.contract.contractCode || 'Hợp đồng thuê căn hộ'}</Dialog.Title>
                <Dialog.Description>
                  {record ? `${record.room.buildingName} · Phòng ${record.room.code}` : 'Bản hợp đồng PDF'}
                </Dialog.Description>
              </div>
              <Dialog.Close className="contract-icon-button" aria-label="Đóng hợp đồng" title="Đóng">
                <X size={18} />
              </Dialog.Close>
            </header>

            <div className="contract-document-toolbar">
              <div className="contract-view-tabs" role="group" aria-label="Nội dung hợp đồng">
                <div className="contract-pdf-tab-group">
                  <Button
                    type="button"
                    aria-pressed={activeTab === 'pdf'}
                    disabled={!!busy}
                    onClick={() => {
                      setActiveTab('pdf');
                      setPdfMenuOpen(open => !open);
                    }}
                    className="flex items-center gap-1"
                  >
                    <span>Bản PDF</span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      ({pdfViewMode === 'completed' && isResidenceRegistered ? 'Chính thức' : 'Nháp'})
                    </span>
                    <ChevronDown size={13} className={`transition-transform duration-200 ${pdfMenuOpen ? 'rotate-180' : ''}`} />
                  </Button>

                  {pdfMenuOpen && (
                    <div className="contract-pdf-dropdown-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!isResidenceRegistered}
                        className={`contract-dropdown-item ${pdfViewMode === 'completed' && activeTab === 'pdf' ? 'active' : ''}`}
                        onClick={() => {
                          if (!isResidenceRegistered) return;
                          setActiveTab('pdf');
                          setPdfViewMode('completed');
                          setPdfMenuOpen(false);
                        }}
                      >
                        <FileCheck2 size={16} className={isResidenceRegistered ? 'text-emerald-600' : 'text-slate-400'} />
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-xs flex items-center justify-between gap-2">
                            <span className={!isResidenceRegistered ? 'text-slate-400 dark:text-slate-500' : ''}>Bản chính thức</span>
                            {isResidenceRegistered ? (
                              <span className="contract-pill-badge-success">Đã ký</span>
                            ) : (
                              <span className="contract-pill-badge-empty">Chưa có</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {isResidenceRegistered ? 'Bản PDF đã ký từ tab Tạm trú' : 'Chưa tải lên bản PDF đã ký'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className={`contract-dropdown-item ${pdfViewMode === 'draft' && activeTab === 'pdf' ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab('pdf');
                          setPdfViewMode('draft');
                          setPdfMenuOpen(false);
                        }}
                      >
                        <FileText size={16} />
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-xs flex items-center justify-between gap-2">
                            <span>Bản nháp</span>
                            <span className="text-[10px] text-slate-400 font-normal">Tự động tạo</span>
                          </div>
                          <div className="text-[11px] text-slate-400">Tạo từ dữ liệu hợp đồng</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  aria-pressed={activeTab === 'profile'}
                  disabled={!!busy || !profile}
                  onClick={() => {
                    setActiveTab('profile');
                    setPdfMenuOpen(false);
                  }}
                >
                  Thông tin
                </Button>
                <Button
                  type="button"
                  aria-pressed={activeTab === 'residence'}
                  disabled={!!busy}
                  onClick={() => {
                    setActiveTab('residence');
                    setPdfMenuOpen(false);
                  }}
                >
                  Tạm trú
                </Button>
              </div>

              <div className="contract-document-tools">
                {activeTab === 'pdf' && (
                  <>
                    <Button
                      type="button"
                      className="contract-icon-button"
                      title={pdfViewMode === 'draft' ? 'Mở bản nháp PDF trong tab mới' : 'Mở bản PDF đã ký trong tab mới'}
                      aria-label="Mở PDF trong tab mới"
                      disabled={pdfViewMode === 'draft' ? (!pdfUrl || !!busy) : (!signedPdfUrl || signedPdfBusy)}
                      onClick={() => {
                        if (pdfViewMode === 'draft') openPdf();
                        else if (signedPdfUrl) window.open(signedPdfUrl, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink size={17} />
                    </Button>
                    <Button
                      type="button"
                      className="contract-icon-button"
                      title="In toàn bộ tài liệu"
                      aria-label="In toàn bộ tài liệu"
                      disabled={pdfViewMode === 'draft' ? (!pdfUrl || !!busy || !printReady) : (!signedPdfBlob || signedPdfBusy || !printReady)}
                      onClick={print}
                    >
                      <Printer size={17} />
                    </Button>
                    <Button
                      type="button"
                      className="contract-icon-button"
                      title={pdfViewMode === 'draft' ? 'Tải bản nháp PDF' : 'Tải bản PDF đã ký'}
                      aria-label="Tải PDF"
                      disabled={pdfViewMode === 'draft' ? (!pdfUrl || !!busy) : (!signedPdfUrl || signedPdfBusy)}
                      onClick={() => {
                        const link = document.createElement('a');
                        if (pdfViewMode === 'draft') {
                          link.href = pdfUrl;
                          link.download = filename;
                        } else {
                          link.href = signedPdfUrl;
                          link.download = signedResidenceDoc?.name || `Hop-dong-da-ky-${contractId}.pdf`;
                        }
                        link.click();
                      }}
                    >
                      <Download size={17} />
                    </Button>
                  </>
                )}
                {activeTab === 'residence' && signedPdfUrl && (
                  <>
                    <Button
                      type="button"
                      className="contract-icon-button"
                      title="Mở PDF đã ký trong tab mới"
                      aria-label="Mở PDF đã ký trong tab mới"
                      onClick={() => window.open(signedPdfUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink size={17} />
                    </Button>
                    <Button
                      type="button"
                      className="contract-icon-button"
                      title="Tải PDF đã ký"
                      aria-label="Tải PDF đã ký"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = signedPdfUrl;
                        link.download = signedResidenceDoc?.name || `Xac-nhan-tam-tru-${contractId}.pdf`;
                        link.click();
                      }}
                    >
                      <Download size={17} />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div role="alert" className="contract-document-error">
                {error}
                <Button
                  type="button"
                  className="contract-inline-button"
                  disabled={!!busy}
                  onClick={() => (profile ? preview() : void load())}
                >
                  <RefreshCw size={14} />Thử lại
                </Button>
              </div>
            )}
            {printError && <p role="alert" className="contract-document-error">{printError}</p>}

            <div className="contract-document-body" aria-busy={!!busy}>
              {busy ? (
                <div role="status" className="contract-document-loading">
                  <FileText size={28} strokeWidth={1.5} />
                  <span className="sr-only">{busy}</span>
                  <span aria-hidden="true">
                    <ShimmeringText text={busy} />
                  </span>
                </div>
              ) : activeTab === 'profile' && profile ? (
                <form
                  id="contract-document-form"
                  className="contract-document-form"
                  onSubmit={e => {
                    e.preventDefault();
                    preview(true);
                  }}
                >
                  {missing.length > 0 && (
                    <details open className="contract-missing">
                      <summary>
                        <AlertCircle size={16} />
                        <span role="status">Cần bổ sung {missing.length} thông tin</span>
                        <ChevronDown size={15} />
                      </summary>
                      <ul>
                        {missing.map(label => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <section>
                    <h3>Khách thuê</h3>
                    <div className="contract-document-fields">
                      {input('tenant', 'fullName', 'Họ và tên')}
                      {input('tenant', 'idNumber', 'Số căn cước / giấy tờ')}
                      {input('tenant', 'birthDate', 'Ngày sinh', 'date')}
                      {input('tenant', 'gender', 'Giới tính')}
                      {input('tenant', 'phone', 'Số điện thoại', 'tel')}
                      {input('tenant', 'address', 'Địa chỉ thường trú', 'text', true)}
                      <label className="contract-field-wide">
                        Cơ quan tiếp nhận CT01
                        <input value={profile.authority || ''} onChange={e => edit('authority', e.target.value)} />
                      </label>
                    </div>
                  </section>
                  <ContractIdentityDocuments
                    contractId={contractId}
                    onBusyChange={setAttachmentsBusy}
                    onPendingChange={setAttachmentsPending}
                    onChanged={() => {
                      setPdfUrl('');
                      setPdfBlob(null);
                      setPrintReady(false);
                    }}
                  />
                  <section>
                    <h3>Bên cho thuê</h3>
                    <div className="contract-document-fields">
                      {input('landlord', 'fullName', 'Họ và tên bên cho thuê')}
                      {input('landlord', 'idNumber', 'Giấy tờ bên cho thuê')}
                      {input('landlord', 'birthDate', 'Ngày sinh bên cho thuê', 'date')}
                      {input('landlord', 'phone', 'Điện thoại bên cho thuê', 'tel')}
                      {input('landlord', 'address', 'Địa chỉ bên cho thuê', 'text', true)}
                      {input('landlord', 'accountName', 'Chủ tài khoản')}
                      {input('landlord', 'accountNumber', 'Số tài khoản')}
                      {input('landlord', 'bank', 'Ngân hàng', 'text', true)}
                    </div>
                  </section>
                  <section>
                    <h3>Thông tin hợp đồng</h3>
                    <div className="contract-document-fields">
                      <label>
                        Mẫu hợp đồng
                        <select value={profile.leaseTemplate} onChange={e => edit('leaseTemplate', e.target.value)}>
                          <option value="LEASE_1PN">Căn hộ 1 phòng ngủ</option>
                          <option value="LEASE_2PN">Căn hộ 2 phòng ngủ</option>
                        </select>
                      </label>
                      <label>
                        Ngày lập / ký
                        <DateInput value={profile.signedDate || ''} onChange={v => edit('signedDate', v)} aria-label="Ngày lập / ký" />
                      </label>
                      <label className="contract-field-wide">
                        Địa chỉ căn hộ
                        <input value={profile.rentalAddress || ''} onChange={e => edit('rentalAddress', e.target.value)} />
                      </label>
                      <label>
                        Thời hạn thuê
                        <input value={profile.durationText || ''} onChange={e => edit('durationText', e.target.value)} />
                      </label>
                      <label>
                        Mục đích thuê
                        <input value={profile.purpose || ''} onChange={e => edit('purpose', e.target.value)} />
                      </label>
                      <label className="contract-field-wide">
                        Liên hệ quản lý
                        <input value={profile.managerContact || ''} onChange={e => edit('managerContact', e.target.value)} />
                      </label>
                    </div>
                    <dl className="contract-document-terms">
                      <div>
                        <dt>Thời hạn</dt>
                        <dd>
                          {formatVnDate(record?.contract.startDate)} → {formatVnDate(record?.contract.endDate)}
                        </dd>
                      </div>
                      <div>
                        <dt>Tiền thuê / tháng</dt>
                        <dd>{record?.contract.monthlyRentVnd.toLocaleString('vi-VN')} đ</dd>
                      </div>
                      <div>
                        <dt>Tiền cọc hợp đồng</dt>
                        <dd>{record?.contract.depositVnd.toLocaleString('vi-VN')} đ</dd>
                      </div>
                    </dl>
                  </section>
                </form>
              ) : activeTab === 'residence' ? (
                <div className="contract-residence-tab">
                  {/* Status Banner */}
                  <div className={`contract-residence-status ${isResidenceRegistered ? 'is-registered' : 'is-pending'}`}>
                    {isResidenceRegistered ? (
                      <CheckCircle2 size={24} className="flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Clock size={24} className="flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <div>
                      <h3>
                        {isResidenceRegistered ? 'ĐÃ KHAI BÁO TẠM TRÚ' : 'CHƯA KHAI BÁO TẠM TRÚ'}
                      </h3>
                      <p>
                        {isResidenceRegistered
                          ? 'Hồ sơ đã được xác nhận khai báo tạm trú với tệp PDF đã ký được lưu trên hệ thống.'
                          : 'Tải lên tệp PDF đã ký của hợp đồng hoặc tờ khai CT01 để xác nhận hoàn tất khai báo tạm trú.'}
                      </p>
                    </div>
                  </div>

                  {/* Upload / Signed Document Management Card */}
                  <div className="contract-residence-card">
                    <h3>
                      <span>File PDF đã ký xác nhận tạm trú</span>
                      {signedResidenceDoc && (
                        <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={13} /> Đã xác nhận
                        </span>
                      )}
                    </h3>

                    {privateDocs.busy && privateDocs.progress && (
                      <div className="grid gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="flex justify-between text-xs">
                          <span>Đang tải lên: {privateDocs.progress.name}</span>
                          <span>{Math.round((privateDocs.progress.completed / privateDocs.progress.total) * 100)}%</span>
                        </div>
                        <Progress.Root
                          value={privateDocs.progress.completed}
                          max={privateDocs.progress.total}
                          className="h-1.5 overflow-hidden rounded bg-slate-200"
                        >
                          <Progress.Track>
                            <Progress.Indicator className="h-full bg-blue-600" />
                          </Progress.Track>
                        </Progress.Root>
                      </div>
                    )}

                    {signedResidenceDoc ? (
                      <div className="contract-residence-file-item">
                        <div className="contract-residence-file-info">
                          <FileCheck2 size={24} className="text-emerald-600 flex-shrink-0" />
                          <div>
                            <strong title={signedResidenceDoc.name}>{signedResidenceDoc.name}</strong>
                            <span>
                              {(signedResidenceDoc.size / 1024 / 1024).toFixed(2)} MB
                              {signedResidenceDoc.pages ? ` · ${signedResidenceDoc.pages} trang` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="contract-residence-file-actions">
                          <Button
                            type="button"
                            className="contract-secondary-button flex items-center gap-1"
                            onClick={() => window.open(signedPdfUrl, '_blank', 'noopener,noreferrer')}
                          >
                            <ExternalLink size={14} /> Xem PDF
                          </Button>
                          <Button
                            type="button"
                            className="contract-secondary-button flex items-center gap-1"
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = signedPdfUrl;
                              a.download = signedResidenceDoc.name;
                              a.click();
                            }}
                          >
                            <Download size={14} /> Tải về
                          </Button>
                          <Button
                            type="button"
                            className="contract-secondary-button flex items-center gap-1"
                            onClick={() => signedDocInputRef.current?.click()}
                            disabled={privateDocs.busy}
                          >
                            <Upload size={14} /> Thay thế
                          </Button>
                          <Button
                            type="button"
                            className="contract-secondary-button flex items-center gap-1 text-rose-600 hover:text-rose-700"
                            onClick={() => handleRemoveSignedPdf(signedResidenceDoc.id)}
                            disabled={privateDocs.busy}
                          >
                            <Trash2 size={14} /> Gỡ bỏ
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="contract-residence-dropzone"
                        onClick={() => signedDocInputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && signedDocInputRef.current?.click()}
                      >
                        <UploadCloud size={32} className="text-blue-600 dark:text-blue-400" />
                        <p>Import file PDF đã ký</p>
                        <span>Nhấn để chọn file PDF đã ký hoặc kéo thả vào đây (tối đa 25MB)</span>
                        <Button
                          type="button"
                          className="contract-primary-button mt-2"
                          disabled={privateDocs.busy}
                        >
                          Chọn file PDF đã ký
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Summary of Residence Information */}
                  <div className="contract-residence-card">
                    <h3>Thông tin khai báo cư trú</h3>
                    <div className="contract-residence-grid">
                      <div className="contract-residence-item">
                        <dt>Khách thuê đại diện</dt>
                        <dd>{profile?.tenant.fullName || record?.contract.tenant?.fullName || '—'}</dd>
                      </div>
                      <div className="contract-residence-item">
                        <dt>Số định danh / CCCD</dt>
                        <dd>{profile?.tenant.idNumber || '—'}</dd>
                      </div>
                      <div className="contract-residence-item">
                        <dt>Ngày sinh & Giới tính</dt>
                        <dd>
                          {profile?.tenant.birthDate ? formatVnDate(profile.tenant.birthDate) : '—'} {profile?.tenant.gender ? `(${profile.tenant.gender})` : ''}
                        </dd>
                      </div>
                      <div className="contract-residence-item">
                        <dt>Số điện thoại</dt>
                        <dd>{profile?.tenant.phone || '—'}</dd>
                      </div>
                      <div className="contract-residence-item">
                        <dt>Cơ quan công an tiếp nhận</dt>
                        <dd>{profile?.authority || 'Chưa chọn cơ quan tiếp nhận'}</dd>
                      </div>
                      <div className="contract-residence-item">
                        <dt>Thời hạn đăng ký tạm trú</dt>
                        <dd>
                          {formatVnDate(record?.contract.startDate)} → {formatVnDate(record?.contract.endDate)}
                        </dd>
                      </div>
                      <div className="contract-residence-item contract-field-wide">
                        <dt>Địa chỉ căn hộ đăng ký tạm trú</dt>
                        <dd>{profile?.rentalAddress || record?.room.buildingName || '—'}</dd>
                      </div>
                      {profile?.members && profile.members.length > 0 && (
                        <div className="contract-residence-item contract-field-wide">
                          <dt>Người cùng cư trú ({profile.members.length} người)</dt>
                          <dd>
                            <ul className="list-disc pl-4 mt-1 space-y-1 font-normal text-xs">
                              {profile.members.map((m: any, i: number) => (
                                <li key={i}>
                                  <strong>{m.fullName}</strong> {m.birthDate ? `(${formatVnDate(m.birthDate)})` : ''} - CCCD:{' '}
                                  {m.idNumber || '—'} {m.relationship ? `(${m.relationship})` : ''}
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action card: Download CT01 / Bundle for signing */}
                  <div className="contract-residence-card">
                    <h3>Mẫu hồ sơ tạm trú để ký hoặc nộp</h3>
                    <p className="text-xs text-slate-500 -mt-1">
                      Tải mẫu tờ khai CT01 hoặc toàn bộ hồ sơ cư trú để in ký trực tiếp hoặc nộp qua Cổng Dịch vụ công Quốc gia / VNeID.
                    </p>
                    <div className="contract-residence-actions">
                      <Button
                        type="button"
                        className="contract-secondary-button flex items-center gap-1.5"
                        disabled={!!busy}
                        onClick={() => downloadResidenceTemplate(false)}
                      >
                        <Download size={14} /> Tải mẫu CT01 (PDF)
                      </Button>
                      <Button
                        type="button"
                        className="contract-secondary-button flex items-center gap-1.5"
                        disabled={!!busy}
                        onClick={() => downloadResidenceTemplate(true)}
                      >
                        <Download size={14} /> Tải trọn bộ hồ sơ cư trú (PDF)
                      </Button>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'pdf' ? (
                pdfViewMode === 'draft' ? (
                  pdfBlob ? (
                    <React.Suspense
                      fallback={
                        <div role="status" className="contract-document-loading">
                          <ShimmeringText text="Đang mở các trang PDF…" />
                        </div>
                      }
                    >
                      <ContractPdfViewer
                        ref={pdfViewer}
                        file={pdfBlob}
                        onPrintReady={setPrintReady}
                        extraControls={
                          <label className="contract-pdf-extra-controls text-xs text-slate-600 dark:text-slate-300">
                            <span className="hidden sm:inline">Bản in:</span>
                            <select
                              aria-label="Bản in"
                              className="h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm outline-none cursor-pointer"
                              value={bundle ? 'bundle' : 'lease'}
                              disabled={!!busy || attachmentsBusy}
                              onChange={e => {
                                const nextBundle = e.target.value === 'bundle';
                                setBundle(nextBundle);
                                if (profile) {
                                  const controller = new AbortController();
                                  generate(profile, controller.signal, false, nextBundle);
                                }
                              }}
                            >
                              <option value="bundle">Bộ hồ sơ đầy đủ</option>
                              <option value="lease">Hợp đồng thuê căn hộ</option>
                            </select>
                          </label>
                        }
                      />
                    </React.Suspense>
                  ) : (
                    <div className="contract-document-empty">
                      <FileText size={32} strokeWidth={1.5} />
                      <p>Chưa có bản PDF</p>
                      {profile && (
                        <Button type="button" className="contract-inline-button" onClick={() => setActiveTab('profile')}>
                          Kiểm tra thông tin
                        </Button>
                      )}
                    </div>
                  )
                ) : signedPdfBusy ? (
                  <div role="status" className="contract-document-loading">
                    <FileCheck2 size={28} strokeWidth={1.5} className="text-blue-600 animate-pulse" />
                    <ShimmeringText text="Đang mở bản PDF đã ký…" />
                  </div>
                ) : signedPdfBlob ? (
                  <React.Suspense
                    fallback={
                      <div role="status" className="contract-document-loading">
                        <ShimmeringText text="Đang mở bản PDF đã ký…" />
                      </div>
                    }
                  >
                    <ContractPdfViewer
                      ref={pdfViewer}
                      file={signedPdfBlob}
                      onPrintReady={setPrintReady}
                      extraControls={
                        signedResidenceDoc ? (
                          <span
                            className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[150px] sm:max-w-[220px]"
                            title={signedResidenceDoc.name}
                          >
                            {signedResidenceDoc.name}
                          </span>
                        ) : null
                      }
                    />
                  </React.Suspense>
                ) : (
                  <div className="contract-document-empty contract-completed-empty">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 mb-2">
                      <FileCheck2 size={30} />
                    </div>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Chưa có bản PDF hoàn thiện (đã ký)</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md text-center mt-1">
                      Bản PDF hoàn thiện là tệp hợp đồng / hồ sơ đã ký xác nhận tải lên từ tab <strong>Tạm trú</strong>. Hãy tải lên tệp PDF đã ký tại đây để hoàn tất hồ sơ và xác nhận tạm trú.
                    </p>

                    {privateDocs.busy && privateDocs.progress && (
                      <div className="w-full max-w-xs mt-3">
                        <div className="flex justify-between text-xs text-blue-600 font-medium mb-1">
                          <span>Đang tải lên: {privateDocs.progress.name}</span>
                          <span>{Math.round((privateDocs.progress.completed / privateDocs.progress.total) * 100)}%</span>
                        </div>
                        <Progress.Root value={privateDocs.progress.completed} max={privateDocs.progress.total} className="w-full">
                          <Progress.Track className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <Progress.Indicator
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${Math.round((privateDocs.progress.completed / privateDocs.progress.total) * 100)}%` }}
                            />
                          </Progress.Track>
                        </Progress.Root>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                      <Button
                        type="button"
                        className="contract-primary-button flex items-center gap-1.5"
                        disabled={privateDocs.busy}
                        onClick={() => signedDocInputRef.current?.click()}
                      >
                        <UploadCloud size={16} /> Tải lên bản PDF đã ký
                      </Button>
                      <Button
                        type="button"
                        className="contract-secondary-button flex items-center gap-1.5"
                        onClick={() => setPdfViewMode('draft')}
                      >
                        <FileText size={16} /> Xem bản nháp PDF
                      </Button>
                      <Button
                        type="button"
                        className="contract-inline-button flex items-center gap-1 text-xs"
                        onClick={() => setActiveTab('residence')}
                      >
                        Chuyển đến tab Tạm trú
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="contract-document-empty">
                  <FileText size={32} strokeWidth={1.5} />
                  <p>Chưa có bản PDF</p>
                  {profile && (
                    <Button type="button" className="contract-inline-button" onClick={() => setActiveTab('profile')}>
                      Kiểm tra thông tin
                    </Button>
                  )}
                </div>
              )}
            </div>

            {activeTab === 'profile' && profile && (
              <footer className="contract-document-footer">
                <Button
                  type="button"
                  className="contract-secondary-button"
                  disabled={!!busy || attachmentsBusy || attachmentsPending}
                  onClick={() => preview()}
                >
                  Xem trước
                </Button>
                <Button
                  type="submit"
                  form="contract-document-form"
                  className="contract-primary-button"
                  disabled={!!busy || attachmentsBusy || attachmentsPending}
                >
                  Lưu & xem PDF
                </Button>
              </footer>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
