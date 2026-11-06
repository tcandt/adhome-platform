import { useCallback, useEffect, useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { Dialog } from '@animate-ui/react/primitives/base-ui/dialog';
import { Bot, CheckCircle2, Copy, KeyRound, Link2, MessageSquareText, RefreshCw, Save, X } from 'lucide-react';
import { CONSOLE_CSRF_HEADER } from '@/app/providers/AuthContext';
import { SettingsDialog } from '@/shared/ui/SettingsDialog';
import { SettingsButton } from '@/shared/ui/SettingsButton';

type TemplateKey = 'REGISTRATION_SUCCESS' | 'INVOICE_ISSUED' | 'METER_NOTICE' | 'RENT_NOTICE' | 'CONTRACT_EXPIRING';
type State = { botId: string | null; groupId: string | null; connectedAt: string | null; setupPending: boolean; templates: Record<TemplateKey, string> };
const templateLabels: { key: TemplateKey; title: string; hint: string }[] = [
  { key: 'REGISTRATION_SUCCESS', title: 'Đăng ký nhận tin thành công', hint: '{roomCode}' },
  { key: 'INVOICE_ISSUED', title: 'Gửi hóa đơn', hint: '{invoiceCode}, {roomCode}, {amount}, {dueDate}' },
  { key: 'METER_NOTICE', title: 'Thông báo điện nước', hint: '{roomCode}, {period}, {electricAmount}, {waterAmount}' },
  { key: 'RENT_NOTICE', title: 'Thông báo tiền phòng', hint: '{roomCode}, {period}, {amount}, {dueDate}' },
  { key: 'CONTRACT_EXPIRING', title: 'Sắp tới hạn hợp đồng', hint: '{roomCode}, {endDate}' },
];
const endpoint = '/api/v1/console/v2/settings/zalo-bot';

export function ZaloBotSettings() {
  const [config, setConfig] = useState<State | null>(null);
  const [token, setToken] = useState('');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templates, setTemplates] = useState<State['templates'] | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Không thể tải cấu hình Zalo Bot.');
    setConfig(data);
    setTemplates(data.templates);
  }, []);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  const submit = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': CONSOLE_CSRF_HEADER }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Không thể lưu cấu hình.');
      if (data.command) setCommand(data.command);
      else if (body.action !== 'templates') setToken('');
      await load();
      setNotice(data.command ? 'Đã tạo mã kết nối nhóm. Gửi lệnh vào nhóm Zalo có bot.' : body.action === 'templates' ? 'Đã lưu mẫu tin nhắn Zalo Bot.' : 'Zalo đã xác nhận webhook và lưu cấu hình bot.');
      if (body.action === 'templates') setTemplatesOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể kết nối máy chủ.'); }
    finally { setBusy(false); }
  };
  return <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#111827]" aria-label="Zalo Bot">
    <div className="flex min-h-16 items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><Bot className="h-5 w-5" /></span><div className="min-w-0"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Zalo Bot</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tin cho cư dân và quản trị</p></div></div>
      <div className="flex shrink-0 items-center gap-2"><span className={`hidden rounded-full px-2 py-1 text-[10px] font-semibold sm:inline-flex ${config?.botId ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{config?.botId ? 'Đã kết nối' : 'Chưa kết nối'}</span><SettingsButton type="button" onClick={() => setSettingsOpen(true)}>Thiết lập</SettingsButton></div>
    </div>
    {settingsOpen && <SettingsDialog title="Zalo Bot" description="Kết nối bot, nhóm quản trị và mẫu thông báo." busy={busy} onClose={() => setSettingsOpen(false)}>
    <div className="space-y-4 px-4 py-4 sm:px-5">
    {config?.botId && <div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/70"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /><span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">Token đã lưu · Bot {config.botId}</span></div>}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Token Zalo Bot
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder={config?.botId ? 'Nhập token mới để cập nhật' : 'Dán token Bot API'} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800" />
      </label>
      <Button type="button" disabled={busy || !token.trim()} onClick={() => void submit({ token: token.trim() })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{busy && token.trim() ? 'Đang lưu…' : 'Lưu token'}</Button>
    </div>
    <div className="flex items-start gap-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
      <KeyRound className="h-3.5 w-3.5 shrink-0" /><span>Token được mã hóa và không hiển thị lại.</span>
    </div>
    {config?.botId && <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-600" /><h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Nhóm quản trị</h4></div><Button type="button" onClick={() => void load().catch(e => setError(e.message))} aria-label="Cập nhật trạng thái nhóm" title="Cập nhật trạng thái nhóm" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></Button></div>
      <div className={`rounded-xl border px-3 py-3 ${config.groupId ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'}`}>
        <div className="flex items-start gap-2">{config.groupId ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}<div className="min-w-0"><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{config.groupId ? 'Nhóm đã kết nối' : 'Chưa có nhóm quản trị'}</p>{config.groupId && <p className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={config.groupId}>ID: {config.groupId}</p>}</div></div>
      </div>
      <Button type="button" disabled={busy} onClick={() => void submit({ action: 'setup' })} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"><KeyRound className="h-3.5 w-3.5" />{config.groupId ? 'Tạo mã liên kết lại' : 'Tạo mã kết nối nhóm'}</Button>
      {command && <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/20"><p>Gửi lệnh này vào nhóm Zalo có bot trong 10 phút:</p><div className="flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 select-all break-all rounded-lg bg-white px-2.5 py-2 font-semibold dark:bg-slate-900">{command}</code><Button type="button" aria-label="Sao chép lệnh kết nối" title="Sao chép lệnh kết nối" onClick={() => void navigator.clipboard.writeText(command)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"><Copy className="h-4 w-4" /></Button></div><p className="text-slate-500">Bot sẽ tự lưu ID nhóm và gửi xác nhận.</p></div>}
    </div>}
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800"><Button type="button" onClick={() => setTemplatesOpen(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30 sm:w-auto"><MessageSquareText size={16} />Mẫu thông báo</Button><p className="mt-2 text-xs text-slate-500">Đăng ký · Hóa đơn · Điện nước · Hạn hợp đồng</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</p>}
    </div>
    </SettingsDialog>}
    <Dialog.Root open={templatesOpen} onOpenChange={setTemplatesOpen}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[130] bg-slate-950/60" /><Dialog.Viewport className="fixed inset-0 z-[131] flex items-center justify-center p-3"><Dialog.Popup from="bottom" className="flex max-h-[min(90dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700"><Dialog.Title className="font-bold">Mẫu tin nhắn Zalo Bot</Dialog.Title><Dialog.Close aria-label="Đóng" className="rounded-lg p-2"><X size={18} /></Dialog.Close></div><Dialog.Description className="px-4 pt-3 text-xs leading-5 text-slate-500">Dùng tên biến trong dấu ngoặc nhọn. Bot tự thay bằng dữ liệu thật. Không nhập mật khẩu hoặc thông tin bí mật vào mẫu.</Dialog.Description><div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4">{templateLabels.map(item => <label className="block text-xs font-semibold" key={item.key}>{item.title}<span className="mt-1 block font-normal text-slate-500">Biến: {item.hint}</span><textarea className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm font-normal dark:border-slate-700 dark:bg-slate-800" maxLength={1200} value={templates?.[item.key] || ''} onChange={e => setTemplates(t => t ? { ...t, [item.key]: e.target.value } : t)} /></label>)}<p className="text-xs leading-5 text-slate-500">Hướng dẫn: khách nhắn riêng <code>DANGKY &lt;PHONG&gt; &lt;SĐT&gt;</code> cho Bot. Khi xác minh đúng hợp đồng, Bot gửi tin đăng ký và hóa đơn chưa thanh toán. Mẫu điện nước, tiền phòng và sắp hết hạn chỉ được gửi khi có tác vụ nghiệp vụ tương ứng.</p></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700"><Button type="button" onClick={() => setTemplatesOpen(false)} className="rounded-lg px-4 py-2 text-sm">Hủy</Button><Button type="button" disabled={busy || !config?.botId || !templates || templateLabels.some(item => !templates[item.key].trim())} onClick={() => void submit({ action: 'templates', templates })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu mẫu tin'}</Button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>
  </section>;
}
