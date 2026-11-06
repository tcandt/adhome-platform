import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { Banknote, CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';
import { usePortfolio } from '@/app/providers/PortfolioContext';
import { SettingsDialog } from '@/shared/ui/SettingsDialog';
import { FieldInfoHint } from '@/shared/ui/FieldInfoHint';
import { type WebhookConnection, type WebhookGuide } from './PaymentWebhookPanel';

type Provider = { id: string; name: string; description: string; docsUrl: string; canTest: boolean; environments: string[]; fields: { key: string; label: string; secret: boolean; optional?: boolean }[]; testReference: boolean; webhook: WebhookGuide };
type Account = { bankCode: string; accountNumber: string; accountName: string };
type Connection = WebhookConnection & { name: string; environment: string; buildingId: string | null; isEnabled: boolean; status: string; credentialFields: string[]; version: number; lastTestedAt: string | null; lastTestMessage: string | null; verificationScope: string | null; accounts: Account[] };
type Draft = { id?: string; creationId?: string; version?: number; providerId: string; name: string; environment: string; buildingId: string; webhookAuth: string; credentials: Record<string, string>; accounts: Account[] };
const endpoint = '/api/v1/console/v2/settings/payment-connections';
const inputClass = 'mt-1 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700';
const primaryClass = `${buttonClass} bg-brand-primary text-white`;
const emptyAccount = (): Account => ({ bankCode: '', accountNumber: '', accountName: '' });
const creationId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');

async function request(path = '', method = 'GET', body?: unknown) {
  const response = await fetch(`${endpoint}${path}`, { method, credentials: 'include', headers: { Accept: 'application/json', 'X-AdHome-Console-Origin': window.location.origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu tích hợp.');
  return data;
}

export function PaymentIntegrationHub() {
  const { allBuildings } = usePortfolio();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [publicWebhookOrigin, setPublicWebhookOrigin] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [legacy, setLegacy] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ id: string; actorEmail: string; summary: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testTarget, setTestTarget] = useState<Connection | null>(null);
  const [reference, setReference] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    const data = await request();
    setProviders(data.providers); setConnections(data.connections); setLegacy(data.legacyConfigured);
    setPublicWebhookOrigin(data.publicWebhookOrigin || '');
    setAuditLogs(data.auditLogs || []);
    setTestTarget(current => current ? data.connections.find((c: Connection) => c.id === current.id) || null : null);
  }, []);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải tích hợp.'); }
    finally { setLoading(false); }
  }, [load]);
  useEffect(() => { void reload(); }, [reload]);
  const provider = providers.find(p => p.id === draft?.providerId);
  const draftWebhookUrl = draft && publicWebhookOrigin && (draft.id || draft.creationId)
    ? `${publicWebhookOrigin}/api/v1/webhooks/payments/${draft.providerId.toLowerCase()}/${draft.id || draft.creationId}`
    : '';
  const [webhookCopyMessage, setWebhookCopyMessage] = useState('');
  const copyDraftWebhook = async (input: HTMLTextAreaElement) => {
    input.select();
    try { await navigator.clipboard.writeText(input.value); setWebhookCopyMessage('Đã sao chép URL webhook.'); }
    catch { setWebhookCopyMessage('Không tự sao chép được. URL đã được chọn để bạn sao chép thủ công.'); }
  };
  const edit = (connection?: Connection, providerId = providers[0]?.id) => {
    setFormError('');
    setWebhookCopyMessage('');
    setDraft(connection ? { ...connection, buildingId: connection.buildingId || '', webhookAuth: connection.webhookAuth || 'HMAC_SHA256', credentials: {}, accounts: connection.accounts.map(a => ({ bankCode: a.bankCode, accountNumber: a.accountNumber, accountName: a.accountName })) } : { creationId: creationId(), providerId, name: '', environment: providers.find(p => p.id === providerId)?.environments[0] || 'LIVE', buildingId: '', webhookAuth: 'HMAC_SHA256', credentials: {}, accounts: [] });
  };
  const run = async (key: string, operation: () => Promise<unknown>, message: string, inForm = false) => {
    if (working.current) return;
    working.current = true; setBusy(key); setError(''); setNotice(''); setFormError('');
    let committed = false;
    try {
      const result = await operation() as { message?: string };
      committed = true;
      await load();
      if (inForm) setDraft(null);
      setTestTarget(null);
      setNotice(result?.message || message);
    } catch (e) {
      const message = `${committed ? 'Máy chủ đã xử lý nhưng chưa tải lại được danh sách. Không gửi lại; hãy tải lại để xác nhận. ' : ''}${e instanceof Error ? e.message : 'Lỗi kết nối máy chủ.'}`;
      if (inForm) setFormError(message); else setError(message);
      // API test failures persist ERROR on server; refresh that state without a success notification.
      if (!inForm && !committed) { try { await load(); } catch { /* Keep original failure visible. */ } }
    } finally { working.current = false; setBusy(null); }
  };
  const visible = connections.filter(c => (filter === 'ALL' || c.providerId === filter) && `${c.name} ${c.providerId} ${c.accounts.map(a => `${a.bankCode} ${a.accountNumber}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const updateAccount = (index: number, key: keyof Account, value: string) => setDraft(current => current && ({ ...current, accounts: current.accounts.map((a, i) => i === index ? { ...a, [key]: value } : a) }));

  return <section className="space-y-5" data-testid="payment-integration-hub" aria-busy={loading || !!busy}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">Tích hợp thanh toán & ngân hàng</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Quản lý nhiều kết nối và tài khoản nhận tiền. Kiểm tra API và kích hoạt từng kết nối độc lập.</p></div>
      <div className="flex flex-wrap gap-2"><Button className={buttonClass} disabled={loading || !!busy} onClick={() => void reload()} aria-label="Tải lại tích hợp"><RefreshCw size={16} />Tải lại</Button><Button className={primaryClass} disabled={!providers.length || !!busy} onClick={() => edit()}><Plus size={16} />Thêm kết nối</Button></div>
    </div>
    {legacy.length > 0 && <p className="rounded-lg border border-amber-300 p-3 text-sm">Có cấu hình cũ: {legacy.join(', ')}. Dữ liệu cũ vẫn được giữ. Hãy tạo kết nối mới với đầy đủ trường xác thực; module không tự chuyển đổi khóa chung.</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
    {notice && <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="shrink-0" size={18} />{notice}</p>}
    {loading ? <p role="status"><ShimmeringText text="Đang tải cấu hình tích hợp…" /></p> : <>
      <div className="flex gap-2 overflow-x-auto pb-1">{providers.map(p => <Button key={p.id} className={`${buttonClass} whitespace-nowrap`} disabled={!!busy} onClick={() => edit(undefined, p.id)}><Plus size={14} />{p.name}<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{connections.filter(c => c.providerId === p.id).length}</span></Button>)}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Nhà cung cấp<select className={inputClass} value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">Tất cả ({connections.length})</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-xs font-semibold sm:col-span-2">Tìm kết nối / tài khoản<input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên kết nối, ngân hàng hoặc số tài khoản" /></label></div>
      {!visible.length && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500"><Banknote className="mx-auto mb-2" />{connections.length ? 'Không tìm thấy kết nối phù hợp.' : 'Chưa có kết nối. Chọn nhà cung cấp để thêm một hoặc nhiều tài khoản ngân hàng.'}</div>}
      <div className="space-y-3">{visible.map(c => {
        const p = providers.find(p => p.id === c.providerId);
        return <article key={c.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid={`payment-connection-${c.id}`}>
          <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold">{c.name}</h3><p className="mt-1 text-xs text-slate-500">{p?.name} · {c.environment === 'LIVE' ? 'Thực tế (LIVE)' : 'Thử nghiệm'} · {c.buildingId ? allBuildings.find(b => b.id === c.buildingId)?.name || 'Tòa nhà đã gán' : 'Toàn tổ chức'}</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{c.status === 'VERIFIED' ? 'Đã kiểm tra API' : c.status === 'ERROR' ? 'Kiểm tra thất bại' : 'Chưa kiểm tra'}</span><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{c.isEnabled ? 'API: đang bật' : 'API: đang tắt'}</span></div></div>
          <p className="my-3 text-xs text-slate-500">{c.accounts.length ? `${c.accounts.length} tài khoản nhận tiền` : 'Chưa khai báo tài khoản nhận tiền'}</p>
          {c.lastTestMessage && <p className="mb-3 text-xs text-slate-500">{c.lastTestMessage} {c.lastTestedAt && `(${new Date(c.lastTestedAt).toLocaleString('vi-VN')})`}</p>}
          <Button className={primaryClass} disabled={!!busy} onClick={() => edit(c)}>Cấu hình</Button>
        </article>;
      })}</div>
      {auditLogs.length > 0 && <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><summary className="cursor-pointer text-sm font-bold">Nhật ký tích hợp · 20 thao tác gần nhất</summary><ul className="mt-3 space-y-3">{auditLogs.map(log => <li key={log.id} className="break-words border-t border-slate-100 pt-2 text-xs dark:border-slate-800"><p>{log.summary}</p><p className="mt-1 text-slate-500">{log.actorEmail} · {new Date(log.createdAt).toLocaleString('vi-VN')}</p></li>)}</ul></details>}
    </>}
    {draft && provider && <SettingsDialog title={draft.id ? 'Sửa kết nối thanh toán' : 'Thêm kết nối thanh toán'} description="Cấu hình kết nối và tài khoản nhận tiền." busy={!!busy} onClose={() => setDraft(null)}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run('save', () => request(draft.id ? `/${draft.id}` : '', draft.id ? 'PATCH' : 'POST', draft), 'Đã lưu cấu hình và danh sách tài khoản. Kết nối đang tắt, chưa xác thực.', true); }}>
        <fieldset disabled={!!busy} className="space-y-4">
          <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs font-semibold">Nhà cung cấp<select className={inputClass} disabled={!!draft.id} value={draft.providerId} onChange={e => { const p = providers.find(p => p.id === e.target.value)!; setDraft({ ...draft, providerId: p.id, environment: p.environments[0], credentials: {} }); }} >{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="min-w-0 text-xs font-semibold">Tên kết nối<input autoFocus required maxLength={120} className={inputClass} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="VD: Thu tiền nhà An Phú" /></label><label className="min-w-0 text-xs font-semibold">Môi trường<select className={inputClass} value={draft.environment} onChange={e => setDraft({ ...draft, environment: e.target.value })}>{provider.environments.map(env => <option key={env} value={env}>{env === 'LIVE' ? 'Thực tế (LIVE)' : 'Thử nghiệm (SANDBOX)'}</option>)}</select></label><label className="min-w-0 text-xs font-semibold">Phạm vi tòa nhà<select className={inputClass} value={draft.buildingId} onChange={e => setDraft({ ...draft, buildingId: e.target.value })}><option value="">Toàn tổ chức</option>{allBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex items-center gap-1"><h3 className="text-sm font-bold">Thông tin xác thực</h3><FieldInfoHint label="Thông tin xác thực">Khóa được mã hóa trên máy chủ. {draft.id ? 'Để trống để giữ khóa đã lưu.' : 'Cần khóa webhook để bật bộ nhận.'}</FieldInfoHint></div>
            {provider.id === 'SEPAY' && <div className="mt-2">
              <div className="flex min-h-6 items-center gap-1"><label htmlFor="payment-webhook-auth" className="text-xs font-semibold">Xác thực webhook</label><FieldInfoHint label="Xác thực webhook">Chọn đúng phương thức tại mục Bảo mật webhook SePay. Khi đổi phương thức, nhập khóa tương ứng.</FieldInfoHint></div>
              <select id="payment-webhook-auth" className={inputClass} value={draft.webhookAuth} onChange={e => setDraft({ ...draft, webhookAuth: e.target.value, credentials: { ...draft.credentials, webhookSecret: '' } })}>
                <option value="HMAC_SHA256">HMAC-SHA256 (khuyến nghị)</option>
                <option value="API_KEY">API Key · Authorization: Apikey</option>
              </select>
            </div>}
            <div className="mt-2 grid grid-cols-2 gap-3">{provider.fields.map(field => {
              const label = provider.id === 'SEPAY' && field.key === 'webhookSecret'
                ? draft.webhookAuth === 'API_KEY' ? 'Webhook API Key' : 'HMAC Secret Key'
                : provider.id === 'SEPAY' && field.key === 'apiToken' ? 'API Token' : field.label;
              const explanation = provider.id === 'SEPAY' && field.key === 'webhookSecret'
                ? draft.webhookAuth === 'API_KEY' ? 'Dùng API Key ở mục Bảo mật webhook SePay, không dùng API Token đọc tài khoản.' : 'Dùng Secret Key ở mục Bảo mật webhook SePay, không dùng API Token đọc tài khoản.'
                : provider.id === 'SEPAY' && field.key === 'apiToken' ? 'Tùy chọn. Chỉ dùng kiểm tra quyền đọc API SePay, không dùng xác thực webhook.' : '';
              return <div key={field.key} className="min-w-0">
                <div className="flex min-h-6 items-center gap-1"><label htmlFor={`payment-credential-${field.key}`} className="truncate text-xs font-semibold">{label}</label>{explanation && <FieldInfoHint label={label}>{explanation}</FieldInfoHint>}</div>
                <input id={`payment-credential-${field.key}`} required={!draft.id && !field.optional} type={field.secret ? 'password' : 'text'} autoComplete="off" maxLength={4096} className={inputClass} value={draft.credentials[field.key] || ''} onChange={e => setDraft({ ...draft, credentials: { ...draft.credentials, [field.key]: e.target.value } })} placeholder={draft.id ? 'Để trống' : label} />
              </div>;
            })}</div>
          </div>
          {draftWebhookUrl && <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"><div className="flex items-center gap-1"><label htmlFor="payment-draft-webhook-url" className="text-xs font-semibold">URL webhook{draft.id ? '' : ' dự kiến'}</label><FieldInfoHint label="URL webhook">Chạm vào URL để sao chép. {draft.id ? 'URL theo domain Console đang sử dụng.' : 'Lưu kết nối và bật nhận webhook trước khi dùng URL này.'}</FieldInfoHint></div><textarea id="payment-draft-webhook-url" readOnly rows={3} value={draftWebhookUrl} onClick={event => void copyDraftWebhook(event.currentTarget)} onFocus={event => event.currentTarget.select()} className="mt-1 w-full min-w-0 resize-none cursor-copy rounded-lg border border-blue-200 bg-white p-3 font-mono text-xs leading-5 text-blue-800 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200" title="Chạm vào URL để sao chép" />{webhookCopyMessage && <p role="status" className="mt-1 text-xs text-blue-700 dark:text-blue-300">{webhookCopyMessage}</p>}</div>}
          {!provider.canTest && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{provider.name} hỗ trợ nhận webhook/IPN đã xác thực. Có thể bật nhận webhook sau khi lưu khóa và URL. Phép kiểm tra API đọc dữ liệu và luồng tạo thanh toán chưa triển khai.</p>}
          <div><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h3 className="text-sm font-bold">Tài khoản nhận tiền ({draft.accounts.length}/50)</h3><FieldInfoHint label="Tài khoản nhận tiền">Có thể khai báo nhiều tài khoản. Hệ thống chưa xác minh quyền sở hữu hoặc định tuyến thanh toán.</FieldInfoHint></div><Button type="button" className={buttonClass} disabled={draft.accounts.length >= 50} onClick={() => setDraft({ ...draft, accounts: [...draft.accounts, emptyAccount()] })}><Plus size={14} />Thêm tài khoản</Button></div><div className="mt-2 space-y-3">{draft.accounts.map((a, i) => <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold">Tài khoản {i + 1}</span><Button type="button" className="text-xs text-rose-600" aria-label={`Bỏ tài khoản ${i + 1}`} onClick={() => setDraft({ ...draft, accounts: draft.accounts.filter((_, j) => i !== j) })}>Bỏ dòng</Button></div><div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-xs">Mã ngân hàng<input required maxLength={20} className={inputClass} placeholder="VCB / MB / 970436" value={a.bankCode} onChange={e => updateAccount(i, 'bankCode', e.target.value)} /></label><label className="min-w-0 text-xs">Số tài khoản<input required maxLength={50} className={inputClass} value={a.accountNumber} onChange={e => updateAccount(i, 'accountNumber', e.target.value)} /></label><label className="col-span-2 min-w-0 text-xs">Chủ tài khoản<input required maxLength={150} className={inputClass} value={a.accountName} onChange={e => updateAccount(i, 'accountName', e.target.value)} /></label></div></div>)}</div></div>
        </fieldset>
        {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white pt-3 dark:border-slate-800 dark:bg-[#111827]">
          {draft.id && <Button type="button" className={buttonClass} disabled={!!busy || !provider.canTest} onClick={() => { const target = connections.find(c => c.id === draft.id); if (target) { setDraft(null); setError(''); setReference(''); setTestTarget(target); } }}>Kiểm tra API</Button>}
          {draft.id && <Button type="button" className={buttonClass} disabled={!!busy || (!connections.find(c => c.id === draft.id)?.isEnabled && connections.find(c => c.id === draft.id)?.status !== 'VERIFIED')} onClick={() => { const target = connections.find(c => c.id === draft.id); if (target) void run(target.id, () => request(`/${target.id}/enabled`, 'POST', { version: target.version, isEnabled: !target.isEnabled }), target.isEnabled ? 'Đã tắt kết nối.' : 'Đã bật cấu hình API.'); }}>{connections.find(c => c.id === draft.id)?.isEnabled ? 'Tắt API' : 'Bật API'}</Button>}
          <Button type="button" className={buttonClass} disabled={!!busy} onClick={() => setDraft(null)}>Đóng</Button><Button type="submit" className={primaryClass} disabled={!!busy}>{busy === 'save' ? <ShimmeringText text="Đang lưu và tải lại…" /> : 'Lưu kết nối & tài khoản'}</Button>
        </div>
      </form>
    </SettingsDialog>}
    {testTarget && <SettingsDialog title={`Kiểm tra API ${testTarget.name}`} description="Chỉ đọc dữ liệu từ nhà cung cấp, không tạo thanh toán hoặc ghi thu." busy={!!busy} onClose={() => setTestTarget(null)}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void run('test', () => request(`/${testTarget.id}/test`, 'POST', { version: testTarget.version, reference }), 'Đã kiểm tra API.'); }}>
      {testTarget.providerId === 'PAYOS' ? <label className="block text-sm">Mã đơn hàng / ID link payOS đã tồn tại<input required maxLength={100} pattern="[A-Za-z0-9_-]+" className={inputClass} value={reference} disabled={!!busy} onChange={e => setReference(e.target.value)} /><span className="mt-1 block text-xs text-slate-500">Phép kiểm tra xác nhận Client ID/API Key có quyền đọc link này. Không xác minh Checksum Key.</span></label> : <p className="text-sm text-slate-500">SePay sẽ được gọi để kiểm tra quyền đọc danh sách tài khoản. Phép kiểm tra không xác nhận webhook hoặc tài khoản khai báo thủ công.</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" className={buttonClass} disabled={!!busy} onClick={() => setTestTarget(null)}>Đóng</Button><Button type="submit" className={primaryClass} disabled={!!busy}>{busy === 'test' ? <ShimmeringText text="Đang chờ phản hồi API…" /> : 'Kiểm tra ngay'}</Button></div>
    </form></SettingsDialog>}
  </section>;
}
