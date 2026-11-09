import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { CalendarDays, Check, CheckCircle2, ChevronRight, Copy, Download, FileCheck2, Home, LoaderCircle, Plus, Receipt, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { usePortfolio } from '../../app/providers/PortfolioContext';
import { useNavigation } from '../../app/providers/NavigationContext';
import { MoneyInput, formatCurrency as cash } from '../../shared/ui/MoneyInput';
import { IdentityQrScanner } from '../../shared/ui/IdentityQrScanner';
import { ContractDocumentLink } from '../../shared/ui/ContractDocumentDialog';
import { ContractIdentityDocuments } from '../../shared/ui/PrivateDocumentFields';
import { ContractRepresentativeSwitch } from '../../shared/ui/ContractRepresentativeSwitch';

import './RentalOnboarding.css';

type Intent = 'HOLD' | 'DIRECT' | 'IMPORT';
type Person = { fullName: string; phone: string; birthDate: string; gender: string; idNumber: string; address: string; emergencyContact?: string; relationship?: string; documentRole?: string; occupantId?: string; householdHeadOccupantId?: string };
const personLabel = (p: Person) => p.documentRole === 'CO_REPRESENTATIVE' ? 'Đại diện HĐ' : 'Người cùng hộ';
const blankPerson = (): Person => ({ fullName: '', phone: '', birthDate: '', gender: '', idNumber: '', address: '' });
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const fieldClass = 'rental-input';
const api = '/api/v1/console/v2';
const requestId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
async function request(path: string, body?: any, key?: string) {
  const r = await fetch(`${api}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'AdHome-Console', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
  return data;
}
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`grid gap-1 text-sm font-medium${wide ? ' rental-field-wide' : ''}`}>{label}{children}</label>; }
function Amount({ label, value, onChange, placeholder }: { label: string; value: number; onChange: (n: number) => void; placeholder?: string }) {
  return <Field label={label}><MoneyInput value={value} onChange={onChange} min={0} placeholder={placeholder} className={fieldClass} /></Field>;
}
function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2 dark:border-slate-700 ${strong ? 'font-bold text-blue-700 dark:text-blue-300' : ''}`}><span>{label}</span><span className="tabular-nums">{cash(value)}</span></div>;
}
const formatRentalDate = (value: unknown) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};
const invoiceStatusLabel = (status: unknown) => ({ DRAFT: 'Nháp', ISSUED: 'Chờ thu', PARTIAL: 'Thu một phần', PAID: 'Đã thanh toán', OVERDUE: 'Quá hạn', VOID: 'Đã hủy' } as Record<string, string>)[String(status)] || String(status || 'Chờ thu');
const billingPolicyLabel = (policy: unknown, formula: string) => {
  const resolved = String(policy || '');
  if (resolved === 'ANNIVERSARY_CYCLE' || formula.startsWith('Chu kỳ tròn tháng')) return 'Trọn chu kỳ';
  if (resolved === 'FULL_FIRST_MONTH' || formula.startsWith('Trọn tháng dương lịch')) return 'Trọn tháng';
  if (resolved === 'CUSTOM_FIRST_CYCLE' || formula.startsWith('Tùy chỉnh')) return 'Kỳ đầu tùy chỉnh';
  return 'Theo ngày thực tế';
};
function PersonFields({ value, onChange, title, landlord = false, requiredErrors = {} }: { value: Person; onChange: (v: Person) => void; title: string; landlord?: boolean; requiredErrors?: Partial<Record<'fullName' | 'phone' | 'idNumber', string>> }) {
  const input = (key: keyof Person, label: string, type = 'text', placeholder?: string) => { const error = requiredErrors[key as 'fullName' | 'phone' | 'idNumber']; const numeric = key === 'idNumber' || key === 'phone'; return <Field label={label} wide={key === 'fullName' || key === 'address'}><input className={fieldClass} type={type} inputMode={numeric ? 'numeric' : undefined} pattern={numeric ? '[0-9]*' : undefined} maxLength={key === 'phone' ? 10 : key === 'idNumber' ? 12 : undefined} value={value[key] || ''} placeholder={error || placeholder} autoComplete={key === 'fullName' ? 'name' : key === 'phone' ? 'tel' : 'off'} aria-invalid={!!error || undefined} aria-label={error ? `${label}: ${error}` : undefined} onChange={e => onChange({ ...value, [key]: numeric ? e.target.value.replace(/\D/g, '').slice(0, key === 'phone' ? 10 : 12) : e.target.value })} /></Field>; };
  return <fieldset className="rental-person"><legend><Users size={16} /><span className="rental-person-title">{title}</span><IdentityQrScanner onApply={details => onChange({ ...value, ...details })} /></legend><div className="rental-fields">
    {input('fullName', 'Họ và tên', 'text', 'Nhập đầy đủ theo giấy tờ')}{input('phone', 'Số điện thoại', 'tel', 'Số điện thoại liên hệ')}
    {input('idNumber', 'Số định danh / giấy tờ', 'text', 'Số căn cước')}{input('birthDate', 'Ngày sinh', 'date')}
    {!landlord && <Field label="Giới tính"><select className={fieldClass} value={value.gender} onChange={e => onChange({ ...value, gender: e.target.value })}><option value="">Chọn giới tính</option><option>Nam</option><option>Nữ</option><option>Khác</option></select></Field>}
    {input('address', 'Địa chỉ thường trú', 'text', 'Số nhà, đường, phường/xã, tỉnh/thành')}
    {!landlord && value.documentRole !== 'CO_REPRESENTATIVE' && value.relationship !== undefined && input('relationship', 'Mối quan hệ với khách chính', 'text', 'Vợ/chồng, con, bạn cùng ở…')}
  </div>{!landlord && <details className="rental-disclosure"><summary>Liên hệ khẩn cấp <span>Không bắt buộc</span></summary>{input('emergencyContact', 'Liên hệ người thân', 'text', 'Họ tên và số điện thoại')}</details>}</fieldset>;
}

function RentalStage({ children }: { children: React.ReactNode }) {
  const flatten = (nodes: React.ReactNode, path = 'stage'): React.ReactNode[] => React.Children.toArray(nodes).flatMap((node, i) => {
    const key = `${path}-${i}`;
    return React.isValidElement<{ children?: React.ReactNode }>(node) ? node.type === React.Fragment ? flatten(node.props.children, key) : [React.cloneElement(node, { key })] : [node];
  });
  const nodes = flatten(children);
  const isActions = (node: React.ReactNode) => React.isValidElement<{ className?: string }>(node) && node.props.className === 'rental-actions';
  const content = nodes.filter(n => !isActions(n));
  const actions = nodes.filter(isActions);
  return <div className="rental-stage"><div className="rental-stage-body">{content}<div className="rental-actions-mobile">{actions}</div></div><div className="rental-actions-desktop">{actions}</div></div>;
}

export function RentalOnboardingPage({ roomId, initialIntent, onClose, embedded = false, closeRequestRef }: { roomId: string; initialIntent?: Intent; onClose: () => void; embedded?: boolean; closeRequestRef?: React.MutableRefObject<(() => void) | null> }) {
  const { refreshPortfolio } = usePortfolio();
  const { setActiveModule, setSelectedPeriod } = useNavigation();
  const [state, setState] = useState<any>(null);
  const [stage, setStage] = useState('intent');
  const [detailStep, setDetailStep] = useState<'people' | 'terms'>('people');
  const [profileTab, setProfileTab] = useState('documents');
  const [docKind, setDocKind] = useState('CT01');
  const [docFormat, setDocFormat] = useState('docx');
  const [docPerson, setDocPerson] = useState(0);
  const [intent, setIntent] = useState<Intent | undefined>(initialIntent);
  const [busy, setBusy] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [botStatus, setBotStatus] = useState<{ botConfigured: boolean; linked: boolean; registrationDeliveryStatus: string | null; invoiceDeliveryStatus: string | null; invoiceOutstandingVnd?: number | null; invoiceStatus?: string | null } | null>(null);
  const [botStatusError, setBotStatusError] = useState('');
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false);
  const [error, setError] = useState('');
  const [tenantErrors, setTenantErrors] = useState<Partial<Record<'fullName' | 'phone' | 'idNumber', string>>>({});
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [profile, setProfile] = useState<any>({ tenant: blankPerson(), members: [], landlord: blankPerson(), rentalAddress: '', signedDate: day(), authority: '', purpose: 'Để ở', durationText: '12 tháng', leaseTemplate: 'LEASE_1PN' });
  const [terms, setTerms] = useState({ startDate: day(), endDate: `${Number(day().slice(0, 4)) + 1}${day().slice(4)}`, rentalModel: 'ENTIRE_ROOM' as 'ENTIRE_ROOM' | 'SHARED_ROOM', monthlyRentVnd: 0, depositVnd: 0, paidAmountVnd: 0, holdDays: 7,
    firstPeriodBillingPolicy: 'CALENDAR_PRORATE', surplusAction: 'RENT_CREDIT', paymentMethod: 'BANK_TRANSFER', takeoverDate: day(), paidThrough: day(), openingDebtVnd: 0 });
  const [quote, setQuote] = useState<any>(null);
  const [cancelMode, setCancelMode] = useState('FULL');
  const [cancel, setCancel] = useState({ refundAmountVnd: 0, deductionAmountVnd: 0, reason: '', refundPending: true });
  const keys = useRef(new Map<string, string>());
  const initialized = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const base = `/rental-workflow/${encodeURIComponent(roomId)}`;
  const keyFor = (path: string, body: any) => { const id = path + JSON.stringify(body); if (!keys.current.has(id)) keys.current.set(id, requestId()); return keys.current.get(id)!; };
  const load = async () => { const data = await request(base); setState(data); return data; };
  useEffect(() => {
    let live = true;
    setBusy(true);
    request(base).then(data => {
      if (!live) return;
      setState(data);
      if (!initialized.current) {
        initialized.current = true;
        const r = data.reservation, c = data.contract;
        setDocKind(r && !c ? 'HOLD' : 'CT01');
        setTerms(t => ({ ...t, rentalModel: c?.rentalModel === 'SHARED_ROOM' || (!c && data.room.rentalModel === 'SHARED_ROOM') ? 'SHARED_ROOM' : 'ENTIRE_ROOM', monthlyRentVnd: Number(c?.monthlyRentVnd ?? 0), depositVnd: Number(c?.depositVnd ?? 0), startDate: c?.startDate || r?.expectedMoveIn || t.startDate, endDate: c?.endDate || t.endDate }));
        setProfile((p: any) => data.profile ? { ...p, ...data.profile, landlord: { ...p.landlord, ...data.profile.landlord }, tenant: { ...p.tenant, ...data.profile.tenant } } : { ...p, ...data.documentDefaults, rentalAddress: [data.room.building.streetAddress, data.room.building.ward, data.room.building.province].filter(Boolean).join(', '),
          tenant: { ...p.tenant, fullName: r?.customerName || c?.tenant?.fullName || '', phone: r?.customerPhone || c?.tenant?.phone || '', idNumber: c?.tenant?.idNumber || '' } });
        if (r || c) setStage('record'); else if (initialIntent) setStage('details');
      }
    }).catch(e => live && setError(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [base, initialIntent]);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  useEffect(() => { if (initialized.current) heading.current?.focus({ preventScroll: true }); }, [stage, detailStep]);
  useEffect(() => { const listener = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, [dirty]);
  const close = () => { if (!busy && (!dirty || window.confirm('Bỏ các thay đổi chưa lưu và về phòng?'))) onClose(); };
  useEffect(() => { if (closeRequestRef) closeRequestRef.current = close; return () => { if (closeRequestRef) closeRequestRef.current = null; }; }, [closeRequestRef, busy, dirty, onClose]);
  const scrollTop = () => { if (embedded) workspace.current?.querySelector('.rental-stage-body')?.scrollTo({ top: 0 }); else window.scrollTo({ top: 0, behavior: 'instant' }); };
  const move = (s: string) => { setError(''); setMessage(''); setStage(s); scrollTop(); };
  const editTerms = (key: string, value: any) => { setTerms(t => ({ ...t, [key]: value })); setDirty(true); setQuote(null); };
  const editProfile = (key: string, value: any) => { setProfile((p: any) => ({ ...p, [key]: value })); setDirty(true); };
  const documentProfileSaved = (updated: any) => { setProfile(updated); setDirty(false); };
  const perform = async (path: string, body: any, next = 'record') => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    let committed = false;
    try {
      await request(path, body, keyFor(path, body)); committed = true; setDirty(false); setEditingDraft(false); setStage(next);
      await load(); await refreshPortfolio(); setMessage('Đã lưu và tải lại dữ liệu.');
    } catch (e: any) { setError(committed ? 'Đã lưu giao dịch. Chưa tải lại được dữ liệu; bấm Tải lại, không tạo lại giao dịch.' : e.message); }
    finally { setBusy(false); }
  };
  const reservation = state?.reservation;
  const contract = state?.contract;
  useEffect(() => {
    if (!contract?.id || contract.status !== 'DRAFT' || stage !== 'record') return;
    let live = true;
    setBotStatus(null); setBotStatusError(''); setCopiedCommand(false);
    const check = async () => {
      try {
        const data = await request(`/contracts/${encodeURIComponent(contract.id)}/zalo-bot-status`);
        if (live) { setBotStatus(data); setBotStatusError(''); }
      } catch (e) { if (live) setBotStatusError(e instanceof Error ? e.message : 'Không kiểm tra được trạng thái Bot.'); }
    };
    void check();
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, [contract?.id, contract?.status, stage]);
  const eligibleReservation = reservation && ['PENDING', 'CONFIRMED'].includes(reservation.status);
  const converting = intent === 'DIRECT' && eligibleReservation;
  const invoice = contract?.invoices?.find((i: any) => i.status !== 'VOID');
  const B = Number(state?.bookingBalance || 0);
  const C = Number(contract?.depositVnd || 0);
  const cPaid = (contract?.deposits || []).filter((d: any) => d.depositType === 'CONTRACT').reduce((s: number, d: any) => s + Math.max(0, Number(d.paidAmountVnd) - Number(d.refundedVnd) - Number(d.deductedAmountVnd) - Number(d.forfeitedAmountVnd) - Number(d.transferredAmountVnd)), 0);
  const due = Math.max(0, Number(invoice?.totalAmountVnd || 0) - Number(invoice?.paidAmountVnd || 0));
  const invoiceSnapshot = (invoice?.policySnapshot || {}) as Record<string, any>;
  const invoiceFormula = String(invoiceSnapshot.formula || '');
  const formulaDates = invoiceFormula.match(/\d{4}-\d{2}-\d{2}/g) || [];
  const formulaDays = invoiceFormula.match(/(\d+)\/(\d+)\s*ngày/);
  const firstPeriodStart = invoiceSnapshot.periodStartDate || formulaDates[0] || contract?.startDate;
  const firstPeriodEnd = invoiceSnapshot.periodEndDate || formulaDates[1] || (firstPeriodStart ? `${String(firstPeriodStart).slice(0, 8)}${String(new Date(Number(String(firstPeriodStart).slice(0, 4)), Number(String(firstPeriodStart).slice(5, 7)), 0).getDate()).padStart(2, '0')}` : '');
  const billedDays = Number(invoiceSnapshot.billedDays || formulaDays?.[1] || 0);
  const daysInMonth = Number(invoiceSnapshot.daysInMonth || formulaDays?.[2] || 0);
  const billingPolicy = billingPolicyLabel(invoiceSnapshot.policy, invoiceFormula);
  const invoiceBreakdown = Array.isArray(invoiceSnapshot.breakdown) ? invoiceSnapshot.breakdown : [];
  const firstRentVnd = Number(invoiceSnapshot.rentFirstPeriodVnd ?? invoice?.roomRentVnd ?? 0);
  const firstDepositVnd = Number(invoiceBreakdown.find((item: any) => /cọc/i.test(String(item.label)))?.amountVnd ?? (invoiceSnapshot.type === 'FIRST_COMBINED_INVOICE' ? invoice?.adjustmentVnd : 0) ?? 0);
  const otherInvoiceItems = invoiceBreakdown.filter((item: any) => !/thuê|cọc/i.test(String(item.label)) && Number(item.amountVnd) !== 0);
  const pendingRefunds = [...(reservation?.deposits || []), ...(contract?.deposits || [])].filter((d: any, i: number, arr: any[]) => d.status === 'PENDING_REFUND' && arr.findIndex(x => x.id === d.id) === i);
  const pendingRefund = pendingRefunds[0];
  const pendingAmount = pendingRefund ? Number(pendingRefund.paidAmountVnd) - Number(pendingRefund.refundedVnd) : 0;
  const refund = cancelMode === 'FULL' ? B : cancelMode === 'NONE' ? 0 : cancel.refundAmountVnd;
  const penalty = B - refund - cancel.deductionAmountVnd;
  const preview = async () => {
    setBusy(true); setError('');
    try {
      if (!profile.tenant.fullName.trim() || !profile.tenant.phone.trim()) throw new Error('Nhập họ tên và số điện thoại khách.');
      if (terms.monthlyRentVnd < 500000) throw new Error('Nhập giá thuê hàng tháng (tối thiểu 500.000 đ).');
      if (intent === 'HOLD') { if (terms.paidAmountVnd > terms.depositVnd) throw new Error('Thực nhận không được vượt cọc thỏa thuận.'); setQuote(null); }
      else setQuote(await request(`${base}/quote`, { ...terms, reservationId: converting ? reservation.id : undefined }));
      move('review');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const submit = () => editingDraft ? perform(`${base}/draft`, { ...terms, documentProfile: profile })
    : converting ? perform(`/reservations/${encodeURIComponent(reservation.id)}/convert-to-contract`, { ...terms, expectedBookingBalance: quote.bookingDepositB, documentProfile: profile,
    coOccupants: profile.members.map((p: Person) => ({ ...p, dateOfBirth: p.birthDate, relationToPrimary: p.documentRole === 'CO_REPRESENTATIVE' ? 'OTHER' : 'FAMILY' })) })
    : perform(`${base}/start`, { ...terms, intent, paidAmountVnd: intent === 'DIRECT' ? 0 : terms.paidAmountVnd, documentProfile: profile });
  const exportFile = async (kind: string, format: string, personIndex = 0) => {
    setBusy(true); setError('');
    try {
      await request(`${base}/profile`, { entityId: kind === 'HOLD' ? reservation?.id : contract?.id || reservation?.id, profile });
      setDirty(false);
      const r = await fetch(`${api}${base}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'AdHome-Console' }, body: JSON.stringify({ entityId: kind === 'HOLD' ? reservation?.id : contract?.id || reservation?.id, profile, kind, format, personIndex }) });
      if (!r.ok) throw new Error((await r.json()).message || 'Không thể xuất hồ sơ.');
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${kind}-${state.room.code}.${kind === 'RESIDENCE_BUNDLE' ? 'pdf' : format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const button = (label: string, onClick: () => void, secondary = false, disabled = false) => <Button type="button" disabled={busy || disabled} onClick={onClick} hoverScale={1} tapScale={0.98} className={`rental-button ${secondary ? 'rental-button-secondary' : 'rental-button-primary'}`}>{label}</Button>;
  const input = (label: string, value: string, onChange: (v: string) => void, type = 'text') => <Field label={label}><input className={fieldClass} type={type} value={value || ''} onChange={e => onChange(e.target.value)} /></Field>;
  const flowStep = stage === 'intent' ? -1 : stage === 'details' ? detailStep === 'people' ? 0 : 1 : stage === 'review' ? 2 : -1;
  const registrationCommand = state?.room?.code && contract?.contractCode && profile.tenant.phone ? `DANGKY ${state.room.code} ${profile.tenant.phone.replace(/\D/g, '').replace(/^84/, '0')}${state.room.rentalModel === 'SHARED_ROOM' ? ` ${contract.contractCode}` : ''}` : '';
  const selectedPerson = [profile.tenant, ...profile.members][docPerson] || profile.tenant;
  const leasePersonIndex = docPerson > 0 && selectedPerson.documentRole !== 'CO_REPRESENTATIVE' ? 0 : docPerson;
  const ct01Head = selectedPerson.householdHeadOccupantId ? [profile.tenant, ...profile.members].find((person: Person) => person.occupantId === selectedPerson.householdHeadOccupantId) || profile.tenant
    : docPerson > 0 && selectedPerson.documentRole === 'CO_REPRESENTATIVE' ? selectedPerson : profile.tenant;
  const ct01Household = profile.members.filter((person: Person) => person !== selectedPerson && person.documentRole !== 'CO_REPRESENTATIVE'
    && (person.householdHeadOccupantId ? person.householdHeadOccupantId === ct01Head.occupantId : ct01Head === profile.tenant));
  const exportKind = docKind === 'LEASE' ? profile.leaseTemplate : docKind;
  const missing: string[] = [];
  if (['CT01', 'RESIDENCE_BUNDLE'].includes(docKind) && !contract) missing.push('Chuyển cọc giữ phòng sang hợp đồng trước khi khai báo cư trú');
  if (docKind === 'HOLD' && (reservation?.status !== 'CONFIRMED' || B < Number(reservation?.holdAmountVnd || 0))) missing.push('Xác nhận đã thực nhận đủ cọc trước khi xuất thỏa thuận xác nhận nhận tiền');
  const requireValue = (value: unknown, label: string) => { if (!String(value || '').trim()) missing.push(label); };
  const peopleToCheck = docKind === 'RESIDENCE_BUNDLE' ? [profile.tenant, ...profile.members] : docKind === 'CT01' ? [selectedPerson, ...ct01Household] : [docKind === 'LEASE' ? [profile.tenant, ...profile.members][leasePersonIndex] : profile.tenant];
  peopleToCheck.forEach((person: Person, i: number) => {
    const label = person.fullName || `Người ${i + 1}`;
    requireValue(person.fullName, 'Họ tên'); requireValue(person.birthDate, `Ngày sinh (${label})`); requireValue(person.idNumber, `Giấy tờ (${label})`);
    if (['CT01', 'RESIDENCE_BUNDLE'].includes(docKind)) { requireValue(person.gender, `Giới tính (${label})`); if (person.idNumber && !/^\d{12}$/.test(person.idNumber)) missing.push(`Số định danh đủ 12 chữ số (${label})`); if (person !== profile.tenant && person.documentRole !== 'CO_REPRESENTATIVE') requireValue(person.relationship, `Quan hệ với chủ hộ (${label})`); }
    else requireValue(person.address, 'Địa chỉ thường trú của khách');
  });
  requireValue(profile.signedDate, 'Ngày ký');
  if (['CT01', 'RESIDENCE_BUNDLE'].includes(docKind)) { requireValue(profile.rentalAddress, 'Địa chỉ căn hộ'); requireValue(profile.authority, 'Cơ quan tiếp nhận'); if (!/^\d{12}$/.test((docKind === 'CT01' ? ct01Head : profile.tenant).idNumber || '')) missing.push('Số định danh của chủ hộ'); }
  if (docKind !== 'CT01') { requireValue(profile.landlord.fullName, 'Họ tên bên cho thuê'); requireValue(profile.landlord.idNumber, 'Giấy tờ bên cho thuê'); requireValue(profile.landlord.address, 'Địa chỉ bên cho thuê'); requireValue(profile.tenant.address, 'Địa chỉ thường trú của khách'); }
  const titles: Record<string, string> = { intent: 'Thêm khách thuê', details: detailStep === 'people' ? 'Thông tin khách thuê' : intent === 'HOLD' ? 'Đặt cọc giữ phòng' : intent === 'IMPORT' ? 'Tiếp quản hợp đồng' : 'Điều khoản thuê', review: 'Kiểm tra & xác nhận', record: 'Hồ sơ thuê', cancel: 'Hủy cọc giữ phòng', cancelReview: 'Kiểm tra phương án hủy', profile: 'Hồ sơ & tài liệu' };
  const goTerms = async () => {
    if (busy) return;
    const errors: Partial<Record<'fullName' | 'phone' | 'idNumber', string>> = {
      ...(!profile.tenant.fullName.trim() ? { fullName: 'Vui lòng nhập họ và tên.' } : {}),
      ...(!profile.tenant.phone.trim() ? { phone: 'Vui lòng nhập số điện thoại.' } : {}),
    };
    if (Object.keys(errors).length) { setTenantErrors(errors); requestAnimationFrame(() => workspace.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()); return; }
    setBusy(true);
    try {
      const params = new URLSearchParams({ checkDuplicates: '1', phone: profile.tenant.phone, idNumber: profile.tenant.idNumber, ...(reservation?.tenantId || contract?.tenantId ? { excludeId: reservation?.tenantId || contract?.tenantId } : {}) });
      const matches = await fetch(`${api}/tenants?${params}`, { headers: { 'X-Requested-With': 'AdHome-Console' } });
      const data = await matches.json();
      if (!matches.ok || data.ok === false) throw new Error(data.message || 'Không thể kiểm tra thông tin khách thuê.');
      if (data.duplicatePhone) errors.phone = 'Số điện thoại đã tồn tại.';
      if (data.duplicateIdNumber) errors.idNumber = 'Số định danh đã tồn tại.';
      setTenantErrors(errors);
      if (Object.keys(errors).length) { requestAnimationFrame(() => workspace.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()); return; }
      setError(''); setDetailStep('terms'); scrollTop();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const addMember = () => editProfile('members', [...profile.members, { ...blankPerson(), relationship: '', documentRole: 'HOUSEHOLD_MEMBER' }]);
  const memberFields = (p: Person, i: number, editableRole = true) => <div className="rental-member" key={p.occupantId || i}>
    {editableRole && <ContractRepresentativeSwitch checked={p.documentRole === 'CO_REPRESENTATIVE'} disabled={busy} onCheckedChange={checked => editProfile('members', profile.members.map((x: Person, j: number) => i === j ? { ...x, documentRole: checked ? 'CO_REPRESENTATIVE' : 'HOUSEHOLD_MEMBER' } : x))} />}
    <PersonFields title={`${personLabel(p)} ${i + 1}`} value={{ ...p, relationship: p.relationship || '' }} onChange={v => editProfile('members', profile.members.map((x: Person, j: number) => i === j ? v : x))} />
    {editableRole && <button type="button" disabled={busy} className="rental-text-button text-rose-600" onClick={() => editProfile('members', profile.members.filter((_: Person, j: number) => j !== i))}>Xóa người này</button>}
  </div>;
  const membersEditor = <section className="rental-members"><div className="rental-section-heading"><h2>Người cùng ở</h2><span>{profile.members.length} người</span></div>
    {profile.members.map((p: Person, i: number) => memberFields(p, i))}
    <Button type="button" className="rental-add-member" disabled={busy || profile.members.length >= 20 || profile.members.length + 1 >= state?.room.maxOccupants} onClick={addMember}><Plus size={16} />Thêm người cùng ở</Button>
  </section>;
  const personEditor = <><PersonFields title="HĐ Chính" value={profile.tenant} requiredErrors={tenantErrors} onChange={p => { setTenantErrors(previous => ({ ...previous, ...(p.fullName.trim() ? { fullName: undefined } : {}), ...(p.phone.trim() ? { phone: undefined } : {}), ...(p.idNumber.trim() ? { idNumber: undefined } : {}) })); editProfile('tenant', p); }} />{intent !== 'HOLD' && terms.rentalModel !== 'SHARED_ROOM' && membersEditor}</>;
  return <section ref={workspace} className={`rental-workspace${embedded ? ' rental-embedded' : ''}`} data-testid="rental-onboarding-page" data-stage={stage} data-detail-step={stage === 'details' ? detailStep : undefined} aria-busy={busy}>
    <header className="rental-page-heading"><div><h1 ref={heading} tabIndex={-1} className="outline-none">{titles[stage]}</h1><p>{stage === 'intent' ? 'Từ thông tin khách đến hợp đồng và hồ sơ cư trú.' : stage === 'details' && detailStep === 'people' ? 'Thông tin này sẽ được tự điền vào hợp đồng và CT01.' : stage === 'profile' ? 'Một bộ thông tin, đầy đủ giấy tờ cần dùng.' : 'Kiểm tra thông tin trước khi lưu giao dịch.'}</p></div><span className="rental-room-tag"><Home size={14} />{state?.room.code || '…'}</span></header>
    {error && <div ref={feedback} tabIndex={-1} role="alert" className="rental-feedback rental-error">{error}</div>}{message && <p role="status" className="rental-feedback rental-success"><CheckCircle2 size={16} />{message}</p>}
    {busy && <p role="status" className="rental-loading"><span className="sr-only">Đang xử lý yêu cầu…</span><span aria-hidden="true"><ShimmeringText text="Đang xử lý yêu cầu…" /></span></p>}
    {!state && !busy && button('Tải lại', () => { setBusy(true); load().catch(e => setError(e.message)).finally(() => setBusy(false)); }, true)}
    {state && <div className="rental-layout"><div className="rental-form-card">
      {flowStep >= 0 && <ol className="rental-stepper" aria-label="Các bước thêm thuê">{['Khách thuê', 'Điều khoản', 'Kiểm tra'].map((label, i) => <li key={label} aria-current={flowStep === i ? 'step' : undefined} className={i <= flowStep ? 'is-active' : ''}><span>{i < flowStep ? <Check size={13} /> : i + 1}</span><b>{label}</b></li>)}</ol>}
      <RentalStage key={`${stage}-${stage === 'details' ? detailStep : ''}`}>
      {stage === 'intent' && <>
        <div className="rental-section-heading"><div><h2>Bắt đầu theo nhu cầu của khách</h2><p>Chọn một phương án để mở đúng thông tin cần điền.</p></div></div>
        <fieldset className="rental-intents"><legend className="sr-only">Nhu cầu thuê</legend>{([
          ['DIRECT', 'Thuê ở ngay', 'Lập hợp đồng mới, thu tiền và bàn giao.', Home],
          ['HOLD', 'Đặt cọc giữ phòng', 'Giữ phòng trước ngày khách nhận nhà.', Wallet],
          ['IMPORT', 'Đồng bộ dữ liệu', 'Tiếp quản khách đang ở và số dư đã có.', Users],
        ] as const).map(([id, title, desc, Icon]) => <label key={id} className={`rental-intent ${intent === id ? 'is-selected' : ''}`}><span className="rental-intent-icon"><Icon size={21} strokeWidth={1.7} /></span><span className="min-w-0 flex-1"><b>{title}</b><span className="rental-intent-description">{desc}</span></span><input type="radio" name="rental-intent" aria-label={title} checked={intent === id} onChange={() => setIntent(id)} /></label>)}</fieldset>
        <p className="rental-auto-note"><FileCheck2 size={17} />Nhập thông tin một lần, dùng cho hợp đồng và CT01.</p>
        <div className="rental-actions">{button('Quay lại', close, true)}{button('Tiếp tục', () => { setDetailStep('people'); move('details'); }, false, !intent)}</div>
      </>}
      {stage === 'details' && <>
        {detailStep === 'people' ? <>{personEditor}<div className="rental-actions">{button('Quay lại', () => move(converting || editingDraft ? 'record' : 'intent'), true)}{button('Tiếp tục', goTerms)}</div></> : <>
          <div className="rental-customer-strip"><span className="rental-avatar">{profile.tenant.fullName?.slice(0, 1) || 'K'}</span><div><strong>{profile.tenant.fullName}</strong><span>{profile.tenant.phone}{profile.members.length ? ` và ${profile.members.length} người cùng ở` : ''}</span></div><button type="button" className="rental-text-button" onClick={() => setDetailStep('people')}>Sửa</button></div>
          <section><div className="rental-section-heading"><div><h2>{intent === 'HOLD' ? 'Thỏa thuận giữ phòng' : 'Thời hạn & giá thuê'}</h2><p>Kiểm tra trước khi lập {intent === 'HOLD' ? 'phiếu đặt cọc' : 'hợp đồng'}.</p></div></div><div className="rental-fields">
            {input(intent === 'HOLD' ? 'Ngày dự kiến vào ở' : 'Ngày bắt đầu', terms.startDate, v => editTerms('startDate', v), 'date')}
            {intent !== 'HOLD' && input('Ngày kết thúc', terms.endDate, v => editTerms('endDate', v), 'date')}
            {intent !== 'HOLD' && <Field label="Hình thức thuê" wide><select className={fieldClass} value={terms.rentalModel} onChange={e => { editTerms('rentalModel', e.target.value); if (e.target.value === 'SHARED_ROOM') editProfile('members', []); }}><option value="ENTIRE_ROOM" disabled={Boolean(state?.contracts?.length && state.room.rentalModel === 'SHARED_ROOM')}>Thuê nguyên căn / nguyên phòng</option><option value="SHARED_ROOM" disabled={Boolean(state?.contracts?.length && state.room.rentalModel !== 'SHARED_ROOM')}>Ở ghép · mỗi khách một hợp đồng</option></select><span className="text-xs font-normal text-slate-500 dark:text-slate-400">Ở ghép: mỗi khách cần hợp đồng, hóa đơn và đăng ký Zalo riêng.</span></Field>}
            <Amount label="Giá thuê hàng tháng" value={terms.monthlyRentVnd} onChange={v => editTerms('monthlyRentVnd', v)} placeholder="" />
            <Amount label={intent === 'HOLD' ? 'Cọc giữ phòng thỏa thuận' : 'Cọc hợp đồng yêu cầu'} value={terms.depositVnd} onChange={v => editTerms('depositVnd', v)} placeholder="" />
            {intent === 'HOLD' ? <>{input('Giữ phòng trong (ngày, 1–30)', String(terms.holdDays), v => editTerms('holdDays', Number(v)), 'number')}<Amount label="Tiền cọc đã thực nhận" value={terms.paidAmountVnd} onChange={v => editTerms('paidAmountVnd', v)} /><Field label="Phương thức nhận tiền"><select className={fieldClass} value={terms.paymentMethod} onChange={e => editTerms('paymentMethod', e.target.value)}><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option></select></Field></> : <Field label="Cách tính tiền thuê đầu kỳ"><select className={fieldClass} value={terms.firstPeriodBillingPolicy} onChange={e => editTerms('firstPeriodBillingPolicy', e.target.value)}><option value="CALENDAR_PRORATE">Theo ngày còn lại của tháng</option><option value="ANNIVERSARY_CYCLE">Một chu kỳ từ ngày bắt đầu</option><option value="FULL_FIRST_MONTH">Trọn tháng đầu</option></select></Field>}
          </div></section>
          {intent === 'IMPORT' && <section><div className="rental-section-heading"><div><h2>Số dư tiếp quản</h2><p>Cọc cũ được tiếp nhận, không tạo thêm khoản thu.</p></div></div><div className="rental-fields">{input('Ngày tiếp quản', terms.takeoverDate, v => editTerms('takeoverDate', v), 'date')}{input('Đã trả tiền thuê đến ngày', terms.paidThrough, v => editTerms('paidThrough', v), 'date')}<Amount label="Cọc lịch sử đang giữ" value={terms.paidAmountVnd} onChange={v => editTerms('paidAmountVnd', v)} /><Amount label="Công nợ đầu kỳ" value={terms.openingDebtVnd} onChange={v => editTerms('openingDebtVnd', v)} /></div></section>}
          <details className="rental-disclosure"><summary>Điện & nước <span>Theo cấu hình phòng</span></summary><p className="rental-help">Điện {cash(state.room.electricRateVnd ?? state.room.building.electricRateVnd)}/kWh. Chỉ số điện và nước được ghi khi bàn giao.</p></details>
          <div className="rental-actions">{button('Quay lại', () => setDetailStep('people'), true)}{button('Tiếp tục — xem lại', preview)}</div>
        </>}
      </>}
      {stage === 'review' && <><p className="rental-review-person">{profile.tenant.fullName} · {profile.tenant.phone} · {terms.startDate}{intent !== 'HOLD' && ` → ${terms.endDate} · ${terms.rentalModel === 'SHARED_ROOM' ? 'Ở ghép' : 'Nguyên căn / phòng'}`}</p>
        {intent === 'HOLD' ? <><Line label="Cọc thỏa thuận" value={terms.depositVnd} /><Line label="Thực thu lần này" value={terms.paidAmountVnd} /><Line label="Cọc còn thiếu" value={terms.depositVnd - terms.paidAmountVnd} /></>
          : intent === 'IMPORT' ? <><Line label="Cọc đang giữ từ trước" value={terms.paidAmountVnd} /><Line label="Công nợ đầu kỳ" value={terms.openingDebtVnd} /><p>Tiếp quản ngày {terms.takeoverDate}, đã thanh toán đến {terms.paidThrough}. Không tạo khoản thu mới cho tiền lịch sử.</p></>
          : quote && <><Line label="Cọc hợp đồng yêu cầu" value={quote.contractDepositRequiredC} /><Line label="Tiền thuê kỳ đầu" value={quote.rentFirstPeriodVnd} /><p className="text-xs text-slate-500">{quote.rent.formula}</p><Line label="Cọc giữ phòng khả dụng" value={quote.bookingDepositB} />
            {quote.surplusDepositVnd > 0 && <Field label="Xử lý cọc dư"><select className={fieldClass} value={terms.surplusAction} onChange={async e => { const value = e.target.value; editTerms('surplusAction', value); setBusy(true); try { setQuote(await request(`${base}/quote`, { ...terms, surplusAction: value, reservationId: converting ? reservation.id : undefined })); } catch (err: any) { setError(err.message); } finally { setBusy(false); } }}><option value="RENT_CREDIT">Trừ tiền thuê, bảo lưu phần còn lại</option><option value="REFUND">Hoàn phần dư riêng</option></select></Field>}
            <Line label="Chuyển vào cọc hợp đồng" value={quote.transferredDepositVnd} />{quote.appliedRentCreditVnd > 0 && <Line label="Trừ vào tiền thuê" value={quote.appliedRentCreditVnd} />}{quote.remainingSurplusCreditVnd > 0 && <Line label="Bảo lưu kỳ sau" value={quote.remainingSurplusCreditVnd} />}{quote.pendingRefundVnd > 0 && <Line label="Chờ hoàn riêng" value={quote.pendingRefundVnd} />}<Line label="Cần thu mới" value={quote.totalInitialInvoiceDue} strong /><p className="text-sm text-slate-500">Lập hợp đồng tạo trạng thái Chờ bàn giao. Thu tiền và bàn giao là các thao tác tiếp theo.</p></>}
        <div className="rental-actions">{button('Sửa thông tin', () => { setDetailStep('terms'); move('details'); }, true)}{button(editingDraft ? 'Lưu sửa hợp đồng nháp' : intent === 'HOLD' ? `Xác nhận tạo phiếu${terms.paidAmountVnd ? ` và đã thu ${cash(terms.paidAmountVnd)}` : ''}` : intent === 'IMPORT' ? 'Xác nhận tiếp quản' : 'Xác nhận lập hợp đồng', submit, false, intent === 'DIRECT' && !quote)}</div>
      </>}
      {stage === 'record' && <>
        {reservation && <section className="rounded-xl border border-amber-200 p-4"><h2 className="font-bold">Phiếu {reservation.reservationCode}</h2><p className="text-sm">{reservation.customerName} · {({ PENDING: 'Chờ đủ cọc', CONFIRMED: 'Đã thu cọc', CANCELLED: 'Đã hủy', CONVERTED: 'Đã chuyển hợp đồng', EXPIRED: 'Hết hạn' } as any)[reservation.status] || reservation.status}</p><Line label="Cọc thỏa thuận" value={Number(reservation.holdAmountVnd)} /><Line label="Cọc khả dụng" value={B} /><p className="my-2 text-sm">Hạn giữ: {reservation.holdUntil?.slice(0, 10)} · Dự kiến vào: {reservation.expectedMoveIn}</p>
          {eligibleReservation && <div className="rental-actions">{button('Sửa khách giữ phòng', () => { setProfileTab('people'); move('profile'); }, true)}{reservation.status === 'PENDING' && button('Xác nhận đã thu đủ phần cọc còn thiếu', () => { if (window.confirm('Chỉ xác nhận sau khi thực nhận đủ tiền cọc còn thiếu. Tiếp tục?')) perform(`/reservations/${reservation.id}/confirm-payment`, { paymentMethod: terms.paymentMethod }); }, true)}{button('Hủy cọc', () => { setCancel({ refundAmountVnd: B, deductionAmountVnd: 0, reason: '', refundPending: true }); setCancelMode('FULL'); move('cancel'); }, true)}{button('Tiếp tục thuê', () => { setIntent('DIRECT'); setDetailStep('terms'); move('details'); })}</div>}
        </section>}
        {contract && <section className="rounded-xl border border-blue-200 p-4"><h2 className="font-bold"><ContractDocumentLink contractId={contract.id} onProfileSaved={documentProfileSaved}>{contract.contractCode}</ContractDocumentLink> · {contract.status === 'DRAFT' ? 'Chờ bàn giao' : ['ACTIVE', 'EXPIRING', 'EXTENDED'].includes(contract.status) ? 'Đang ở' : contract.status}</h2><Line label="Cọc hợp đồng yêu cầu" value={C} /><Line label="Cọc đang có" value={cPaid} /><Line label="Cọc còn thiếu" value={Math.max(0, C - cPaid)} />
          {invoice && <><Line label="Tổng hóa đơn" value={Number(invoice.totalAmountVnd)} /><Line label="Đã thực thu mới" value={Number(invoice.paidAmountVnd)} /><Line label="Còn phải thu" value={due} strong /><Button type="button" hoverScale={1} tapScale={0.98} onClick={() => setInvoiceDetailOpen(true)} className="rental-invoice-detail-trigger"><Receipt size={15} />Chi tiết kỳ đầu <ChevronRight size={14} /></Button>{Number(invoice.paidAmountVnd) > Number(invoice.totalAmountVnd) && <Line label="Khách trả dư — cần xử lý riêng" value={Number(invoice.paidAmountVnd) - Number(invoice.totalAmountVnd)} />}</>}
          {contract.status === 'DRAFT' && <div className="rental-registration" data-testid="rental-bot-registration">
            <h3 className="font-semibold">{!botStatus?.linked ? 'Đăng ký nhận tin Zalo Bot' : invoice && Number(botStatus.invoiceOutstandingVnd ?? due) === 0 ? 'Đã thanh toán' : botStatus.invoiceDeliveryStatus === 'SENT' ? 'Đang chờ thanh toán' : 'Đang gửi hóa đơn'}</h3>
            {!botStatus?.linked && <><p>Yêu cầu khách nhắn riêng cho Bot đúng cú pháp bên dưới. Bot đối chiếu mã phòng và số điện thoại trên hợp đồng nháp.</p>
            <div className="rental-command"><code>{registrationCommand}</code><Button type="button" aria-label="Sao chép lệnh đăng ký Zalo" title="Sao chép lệnh" disabled={!registrationCommand} onClick={async () => { try { await navigator.clipboard.writeText(registrationCommand); setCopiedCommand(true); } catch { setBotStatusError('Không sao chép được. Hãy chọn và sao chép lệnh thủ công.'); } }}><Copy size={16} />{copiedCommand ? 'Đã sao chép' : 'Sao chép'}</Button></div></>}
            {botStatusError && <p role="alert">{botStatusError}</p>}
            {!botStatusError && botStatus && !botStatus.botConfigured && <p role="status">Zalo Bot chưa được kết nối. Hãy cấu hình trong Cài đặt trước khi yêu cầu khách đăng ký.</p>}
            {!botStatusError && botStatus?.botConfigured && !botStatus.linked && <p role="status" className="rental-bot-wait"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /><ShimmeringText text="Đang chờ khách đăng ký…" /></p>}
            {botStatus?.linked && <p role="status" className="rental-bot-wait is-complete"><CheckCircle2 size={16} />Đăng ký Zalo Bot thành công.</p>}
            {botStatus?.linked && invoice && botStatus.invoiceDeliveryStatus === 'SENT' && <p role="status" className="rental-bot-wait is-complete"><CheckCircle2 size={16} />Đã gửi hóa đơn cho khách.</p>}
            {botStatus?.linked && invoice && Number(botStatus.invoiceOutstandingVnd ?? due) === 0 && <p role="status" className="rental-bot-wait"><CheckCircle2 size={16} />Hóa đơn {invoice.invoiceCode} đã được thanh toán đầy đủ.</p>}
            {botStatus?.linked && invoice && Number(botStatus.invoiceOutstandingVnd ?? due) > 0 && botStatus.invoiceDeliveryStatus !== 'SENT' && <p role="status" className="rental-bot-wait"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /><ShimmeringText text={botStatus.invoiceDeliveryStatus === 'PENDING' ? 'Đăng ký thành công · đang gửi hóa đơn…' : 'Đăng ký thành công · đang chuẩn bị hóa đơn…'} /></p>}
            {botStatus?.linked && invoice && botStatus.invoiceDeliveryStatus === 'SENT' && Number(botStatus.invoiceOutstandingVnd ?? due) > 0 && <p role="status" className="rental-bot-wait"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /><ShimmeringText text={`Đã gửi ${invoice.invoiceCode} · chờ thanh toán ${cash(Number(botStatus.invoiceOutstandingVnd ?? due))}`} /></p>}
            {!botStatus?.linked && <p>Khách sẽ nhận tin về điện nước, tiền phòng và hạn hợp đồng theo mẫu tại Cài đặt → Zalo Bot.</p>}
          </div>}
          {contract.status === 'DRAFT' && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Thu đủ hóa đơn đầu kỳ trong mục Hóa đơn để hệ thống bàn giao phòng tự động. Chỉ số điện, nước đầu kỳ được nhập tại bước thu hóa đơn.</p>}
          <div className="mt-3 flex flex-wrap gap-2">{contract.status === 'DRAFT' && Number(invoice?.paidAmountVnd || 0) === 0 && cPaid === 0 && botStatus?.linked === false && button('Sửa hợp đồng nháp', () => { setIntent('DIRECT'); setEditingDraft(true); setDetailStep('people'); move('details'); }, true)}{due > 0 && button(`Đến Hóa đơn · ${invoice.invoiceCode}`, () => { sessionStorage.setItem('adhome:open-invoice-payment', invoice.id); if (invoice.periodKey) setSelectedPeriod(invoice.periodKey); onClose(); setActiveModule('invoices'); })}</div>
        </section>}
        {pendingRefund && <section className="rounded-xl border border-rose-200 p-4"><Line label="Còn chờ hoàn cho khách" value={pendingAmount} strong />{button(`Xác nhận đã chi hoàn ${cash(pendingAmount)}`, () => { if (window.confirm('Bạn đã thực chi khoản hoàn này và kiểm tra người nhận/chứng từ?')) perform(`/deposits/${pendingRefund.id}/refund`, { refundAmountVnd: pendingAmount, deductionAmountVnd: 0 }); }, true)}</section>}
        <div className="rental-actions">{button('Quay lại', close, true)}{button('Hồ sơ & tài liệu', () => { setProfileTab('documents'); move('profile'); }, true)}{button('Tải lại dữ liệu', () => { setBusy(true); load().then(() => refreshPortfolio()).catch(e => setError(e.message)).finally(() => setBusy(false)); }, true)}{!eligibleReservation && (state.room.rentalModel === 'SHARED_ROOM' ? (state.contracts || []).reduce((sum: number, item: any) => sum + item.occupantsCount, 0) < state.room.maxOccupants : !contract || !['DRAFT', 'ACTIVE', 'EXPIRING', 'EXTENDED'].includes(contract.status)) && button(state.room.rentalModel === 'SHARED_ROOM' ? 'Thêm khách ghép · hợp đồng riêng' : 'Thêm thuê', () => { setIntent(undefined); setTerms(t => ({ ...t, rentalModel: state.room.rentalModel === 'SHARED_ROOM' ? 'SHARED_ROOM' : 'ENTIRE_ROOM' })); setProfile({ tenant: blankPerson(), members: [], landlord: { ...blankPerson(), ...state.documentDefaults?.landlord }, rentalAddress: state.documentDefaults?.rentalAddress || state.room.building.streetAddress || '', signedDate: day(), authority: '', purpose: 'Để ở', durationText: '12 tháng', leaseTemplate: 'LEASE_1PN' }); move('intent'); })}</div>
      </>}
      {(stage === 'cancel' || stage === 'cancelReview') && <><Line label="Cọc khả dụng để xử lý" value={B} />
        {stage === 'cancel' ? <><fieldset className="grid gap-2 sm:grid-cols-3"><legend className="mb-2 font-semibold">Phương án hủy</legend>{[['FULL', 'Hoàn đủ'], ['PARTIAL', 'Hoàn một phần'], ['NONE', 'Không hoàn']].map(([id, label]) => <label className="flex min-h-11 items-center gap-2 rounded-lg border p-3" key={id}><input type="radio" name="cancelMode" value={id} checked={cancelMode === id} onChange={() => { setCancelMode(id); setCancel(c => ({ ...c, deductionAmountVnd: 0 })); }} />{label}</label>)}</fieldset>
          {cancelMode === 'PARTIAL' && <Amount label="Số tiền hoàn khách" value={cancel.refundAmountVnd} onChange={v => setCancel(c => ({ ...c, refundAmountVnd: v }))} />}
          {cancelMode !== 'FULL' && <Amount label="Chi phí được khấu trừ theo thỏa thuận" value={cancel.deductionAmountVnd} onChange={v => setCancel(c => ({ ...c, deductionAmountVnd: v }))} />}
          {input('Lý do hủy / căn cứ giữ lại tiền', cancel.reason, v => setCancel(c => ({ ...c, reason: v })))}
        </> : <p className="text-sm">Lý do: {cancel.reason}. Phiếu đã hủy không thể dùng lại để chuyển hợp đồng.</p>}
        <Line label="Hoàn cho khách" value={refund} /><Line label="Khấu trừ chi phí" value={cancel.deductionAmountVnd} /><Line label="Phạt / giữ lại theo thỏa thuận" value={penalty} /><Line label="Tổng phân bổ" value={refund + cancel.deductionAmountVnd + penalty} />
        {stage === 'cancelReview' && refund > 0 && <Field label="Tình trạng hoàn tiền"><select className={fieldClass} value={cancel.refundPending ? 'PENDING' : 'PAID'} onChange={e => setCancel(c => ({ ...c, refundPending: e.target.value === 'PENDING' }))}><option value="PENDING">Chưa chi — ghi nhận chờ hoàn</option><option value="PAID">Tôi xác nhận đã thực chi hoàn cho khách</option></select></Field>}
        <div className="rental-actions">{button('Quay lại', () => move(stage === 'cancel' ? 'record' : 'cancel'), true)}{stage === 'cancel' ? button('Tiếp tục — xem lại', () => move('cancelReview'), false, !cancel.reason.trim() || penalty < 0 || (cancelMode === 'PARTIAL' && (refund <= 0 || refund >= B)))
          : button(refund > 0 && cancel.refundPending ? 'Xác nhận hủy và chờ hoàn' : 'Xác nhận hủy cọc', () => perform(`/reservations/${reservation.id}/cancel`, { ...cancel, refundAmountVnd: refund, forfeitAmountVnd: penalty }), false, penalty < 0)}</div>
      </>}
      {stage === 'profile' && <>
        <div className="rental-profile-tabs" role="tablist" aria-label="Thông tin hồ sơ">{[['documents', 'Tài liệu'], ['people', 'Khách thuê'], ['landlord', 'Bên cho thuê'], ['residence', 'Cư trú']].map(([id, label]) => <button type="button" role="tab" id={`rental-tab-${id}`} aria-controls={`rental-panel-${id}`} aria-selected={profileTab === id} tabIndex={profileTab === id ? 0 : -1} onKeyDown={e => { const ids = ['documents', 'people', 'landlord', 'residence']; const i = ids.indexOf(id); const next = e.key === 'ArrowRight' ? ids[(i + 1) % 4] : e.key === 'ArrowLeft' ? ids[(i + 3) % 4] : e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[3] : null; if (next) { e.preventDefault(); setProfileTab(next); document.getElementById(`rental-tab-${next}`)?.focus(); } }} key={id} onClick={() => setProfileTab(id)}>{label}</button>)}</div>
        <div role="tabpanel" id={`rental-panel-${profileTab}`} aria-labelledby={`rental-tab-${profileTab}`} className="rental-profile-panel">
          {profileTab === 'people' && <><PersonFields title="HĐ Chính" value={profile.tenant} requiredErrors={tenantErrors} onChange={p => editProfile('tenant', p)} />{reservation && !contract ? membersEditor : profile.members.map((p: Person, i: number) => memberFields(p, i, false))}</>}
          {profileTab === 'landlord' && <><p className="rental-help">Thông tin bên cho thuê được dùng chung cho các mẫu hợp đồng của tòa nhà.</p><PersonFields title="Bên cho thuê" landlord value={profile.landlord} onChange={p => editProfile('landlord', p)} /><details className="rental-disclosure"><summary>Thanh toán & liên hệ quản lý</summary><div className="rental-fields">{input('Chủ tài khoản', profile.landlord.accountName, v => editProfile('landlord', { ...profile.landlord, accountName: v }))}{input('Số tài khoản', profile.landlord.accountNumber, v => editProfile('landlord', { ...profile.landlord, accountNumber: v }))}{input('Ngân hàng', profile.landlord.bank, v => editProfile('landlord', { ...profile.landlord, bank: v }))}{input('Liên hệ quản lý', profile.managerContact, v => editProfile('managerContact', v))}</div></details></>}
          {profileTab === 'residence' && <><div className="rental-section-heading"><div><h2>Thông tin đăng ký cư trú</h2><p>Địa chỉ căn hộ được lấy từ tòa nhà đang chọn.</p></div></div><div className="rental-fields">{input('Địa chỉ căn hộ đăng ký cư trú', profile.rentalAddress, v => editProfile('rentalAddress', v))}{input('Cơ quan tiếp nhận CT01', profile.authority, v => editProfile('authority', v))}{input('Ngày lập / ký hồ sơ', profile.signedDate, v => editProfile('signedDate', v), 'date')}{input('Thời hạn thuê bằng chữ', profile.durationText, v => editProfile('durationText', v))}<Field label="Mẫu hợp đồng căn hộ"><select className={fieldClass} value={profile.leaseTemplate} onChange={e => editProfile('leaseTemplate', e.target.value)}><option value="LEASE_1PN">Căn hộ 1 phòng ngủ</option><option value="LEASE_2PN">Căn hộ 2 phòng ngủ</option></select></Field></div>{reservation && !contract && <div className="rental-fields"><Amount label="Cọc hợp đồng dự kiến khi nhận phòng" value={profile.holdContractDepositVnd ?? Number(state.room.listPriceVnd)} onChange={v => editProfile('holdContractDepositVnd', v)} /><Amount label="Tiền thuê kỳ đầu dự kiến khi nhận phòng" value={profile.holdFirstRentVnd ?? Number(state.room.listPriceVnd)} onChange={v => editProfile('holdFirstRentVnd', v)} /></div>}<p className="rental-help">Xuất hồ sơ chưa phải là đã nộp đăng ký cư trú.</p></>}
          {profileTab === 'documents' && <>
            {contract && <ContractIdentityDocuments contractId={contract.id} />}
            <div className="rental-document-heading"><span><FileCheck2 size={25} strokeWidth={1.5} /></span><div><h2>Tài liệu tự điền</h2><p>Dùng thông tin khách và điều khoản đã lưu.</p></div></div>
            <div className="rental-fields"><Field label="Loại tài liệu"><select className={fieldClass} value={docKind} onChange={e => setDocKind(e.target.value)}><option value="CT01">Tờ khai cư trú CT01</option>{contract && <><option value="LEASE">Hợp đồng thuê căn hộ</option><option value="RESIDENCE_BUNDLE">Bộ hồ sơ cư trú</option></>}{reservation && <option value="HOLD">Thỏa thuận cọc giữ phòng</option>}</select></Field>{docKind === 'CT01' && <Field label="Người kê khai"><select className={fieldClass} value={docPerson} onChange={e => setDocPerson(Number(e.target.value))}>{[profile.tenant, ...profile.members].map((p: Person, i: number) => <option value={i} key={i}>{p.fullName || `Người ${i + 1}`}</option>)}</select></Field>}{docKind !== 'RESIDENCE_BUNDLE' && <Field label="Định dạng tải xuống"><select className={fieldClass} value={docFormat} onChange={e => setDocFormat(e.target.value)}><option value="docx">Word (.docx) — có thể chỉnh sửa</option><option value="pdf">PDF — sẵn sàng in</option></select></Field>}</div>
            {docKind === 'LEASE' && <Field label="Người đại diện"><select className={fieldClass} value={leasePersonIndex} onChange={e => setDocPerson(Number(e.target.value))}>{[profile.tenant, ...profile.members].map((p: Person, i: number) => (i === 0 || p.documentRole === 'CO_REPRESENTATIVE') && <option value={i} key={i}>{i === 0 ? 'HĐ Chính' : 'Đại diện HĐ'} · {p.fullName || `Người ${i + 1}`}</option>)}</select></Field>}
            <div className={`rental-document-status ${missing.length ? 'needs-info' : 'is-ready'}`}><ShieldCheck size={19} /><div><strong>{missing.length ? `Cần bổ sung ${[...new Set(missing)].length} thông tin` : 'Đã đủ thông tin để tạo tài liệu'}</strong>{missing.length ? <><ul>{[...new Set(missing)].map(item => <li key={item}>{item}</li>)}</ul><button type="button" className="rental-text-button" onClick={() => setProfileTab(missing.some(x => x.includes('bên cho thuê')) ? 'landlord' : missing.some(x => x.includes('Cơ quan') || x.includes('căn hộ') || x.includes('Ngày ký')) ? 'residence' : 'people')}>Bổ sung thông tin <ChevronRight size={14} /></button></> : <p>Kiểm tra bản xuất trước khi ký hoặc nộp hồ sơ.</p>}</div></div>
            <p className="rental-auto-note"><CheckCircle2 size={16} />Số tiền bằng chữ được tạo tự động từ hợp đồng.</p>
          </>}
        </div>
        <div className="rental-actions">{button('Về hồ sơ thuê', () => move('record'), true)}{profileTab === 'documents' && docKind === 'LEASE' && contract && <ContractDocumentLink contractId={contract.id} personIndex={leasePersonIndex} draftProfile={profile} onProfileSaved={documentProfileSaved} className="rental-button rental-button-secondary">Xem PDF</ContractDocumentLink>}{profileTab === 'documents' ? <Button type="button" className="rental-button rental-button-primary" disabled={busy || missing.length > 0} onClick={() => exportFile(exportKind, docKind === 'RESIDENCE_BUNDLE' ? 'pdf' : docFormat, docKind === 'LEASE' ? leasePersonIndex : docPerson)}><Download size={16} />{busy ? 'Đang tạo tài liệu…' : 'Tải tài liệu'}</Button> : button('Lưu thông tin', () => perform(`${base}/profile`, { entityId: contract?.id || reservation?.id, profile }, 'profile'))}</div>
      </>}
      </RentalStage></div><aside className="rental-summary"><div className="rental-summary-room"><span className="rental-summary-icon"><Home size={23} strokeWidth={1.5} /></span><h2>Phòng {state.room.code}</h2><p>{state.room.building.name}</p><dl><div><dt>Giá thuê / tháng</dt><dd>{terms.monthlyRentVnd ? cash(terms.monthlyRentVnd) : 'Chưa nhập'}</dd></div><div><dt>Sức chứa</dt><dd>{state.room.maxOccupants} người</dd></div>{intent && <div><dt>Nhu cầu</dt><dd>{({ DIRECT: 'Thuê ở ngay', HOLD: 'Giữ phòng', IMPORT: 'Tiếp quản' })[intent]}</dd></div>}</dl></div><div className="rental-summary-docs"><FileCheck2 size={19} /><h3>Thông tin được dùng lại</h3><p>Khách thuê, người cùng ở và địa chỉ phòng được điền vào mẫu. Chỉ bổ sung các thông tin còn thiếu trước khi tải.</p><span><Check size={13} />Hợp đồng thuê / cọc</span><span><Check size={13} />Tờ khai CT01 từng người</span></div></aside></div>}
    {invoice && <Dialog.Root open={invoiceDetailOpen} onOpenChange={setInvoiceDetailOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="rental-invoice-backdrop" />
        <Dialog.Viewport className="rental-invoice-viewport">
          <Dialog.Popup from="bottom" className="rental-invoice-dialog" data-testid="first-invoice-detail-dialog">
            <header className="rental-invoice-dialog-header"><div><Dialog.Title><Receipt size={16} />Chi tiết hóa đơn đầu kỳ</Dialog.Title><Dialog.Description>{invoice.invoiceCode} · {invoiceStatusLabel(invoice.status)}</Dialog.Description></div><Dialog.Close aria-label="Đóng chi tiết hóa đơn"><X size={17} /></Dialog.Close></header>
            <div className="rental-invoice-period"><CalendarDays size={17} /><div><strong>{formatRentalDate(firstPeriodStart)} → {formatRentalDate(firstPeriodEnd)}</strong><span>{billingPolicy}{billedDays > 0 && daysInMonth > 0 && billingPolicy === 'Theo ngày thực tế' ? ` · ${billedDays}/${daysInMonth} ngày` : ''}</span></div></div>
            <div className="rental-invoice-rows">
              <div><span>Giá thuê tháng</span><strong>{cash(Number(invoiceSnapshot.monthlyRentVnd ?? contract?.monthlyRentVnd ?? 0))}</strong></div>
              {firstRentVnd > 0 && <div><span>Tiền thuê kỳ đầu</span><strong>{cash(firstRentVnd)}</strong></div>}
              {firstDepositVnd > 0 && <div><span>Tiền cọc hợp đồng</span><strong>{cash(firstDepositVnd)}</strong></div>}
              {otherInvoiceItems.map((item: any, index: number) => <div key={`${item.label}-${index}`}><span>{item.label}</span><strong>{cash(Number(item.amountVnd))}</strong></div>)}
            </div>
            {invoiceFormula && <p className="rental-invoice-formula">{invoiceFormula.replaceAll(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')}</p>}
            <div className="rental-invoice-total"><div><span>Tổng hóa đơn</span><strong>{cash(Number(invoice.totalAmountVnd))}</strong></div>{Number(invoice.paidAmountVnd) > 0 && <div><span>Đã thu</span><strong>{cash(Number(invoice.paidAmountVnd))}</strong></div>}<div className="is-due"><span>Còn phải thu</span><strong>{cash(due)}</strong></div><div><span>Hạn thanh toán</span><strong>{formatRentalDate(invoice.dueDate)}</strong></div></div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>}
  </section>;
}
