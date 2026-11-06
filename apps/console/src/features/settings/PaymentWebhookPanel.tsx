import { useState } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { ExternalLink } from 'lucide-react';

export type WebhookGuide = { label: string; docsUrl: string; authentication: string; response: string; steps: string[] };
export type WebhookConnection = {
  id: string; providerId: string; webhookUrl: string | null; webhookPath: string;
  webhookEnabled: boolean; webhookAuth: string; webhookLastReceivedAt: string | null; webhookRegisteredAt: string | null;
  webhookEvents: { id: string; eventType: string; status: string; receivedAt: string; amountVnd: number | null }[];
};
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700';

export function PaymentWebhookPanel({ connection: c, guide, busy, onToggle, onRegister }: {
  connection: WebhookConnection; guide: WebhookGuide; busy: string | null; onToggle: () => void; onRegister: () => void;
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const copy = async (input: HTMLTextAreaElement) => {
    input.select();
    if (!c.webhookUrl) return;
    try { await navigator.clipboard.writeText(c.webhookUrl); setCopyMessage('Đã sao chép URL webhook.'); }
    catch { setCopyMessage('Không tự sao chép được. URL đã được chọn để bạn sao chép thủ công.'); }
  };
  return <div className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/20" data-testid={`webhook-panel-${c.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold">{guide.label}</h4><span className="text-xs">{c.webhookEnabled ? 'Bộ nhận đang bật' : 'Bộ nhận đang tắt'}</span></div>
    <label className="block text-xs font-semibold" htmlFor={`webhook-url-${c.id}`}>URL nhận cho kết nối này</label>
    <textarea id={`webhook-url-${c.id}`} readOnly rows={3} value={c.webhookUrl || c.webhookPath || ''} onFocus={event => event.currentTarget.select()} onClick={event => void copy(event.currentTarget)} title="Chạm vào URL để sao chép" className="w-full min-w-0 resize-none cursor-copy rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-5 dark:border-slate-700 dark:bg-slate-900" />
    {copyMessage && <p role="status" className="text-xs">{copyMessage}</p>}
    <p className="text-[11px] text-slate-500">Chạm vào URL để sao chép.</p>
    {!c.webhookUrl && <p className="text-xs text-amber-800 dark:text-amber-200">Chưa tải được URL. Hãy tải lại danh sách kết nối.</p>}
    <p className="text-xs text-slate-500">Domain được nhận diện tự động từ trang AdHome đang sử dụng; khi chạy local dùng domain quản lý console.adhome.vn. URL cần truy cập được từ Internet sau khi triển khai. Hệ thống chưa tự khẳng định khả năng truy cập công khai chỉ từ việc tạo URL.</p>
    <p className="text-xs"><strong>Xác thực:</strong> {guide.authentication}{c.providerId === 'SEPAY' && <span className="mt-1 block">Đang chọn: {c.webhookAuth === 'API_KEY' ? 'API Key · Authorization: Apikey …' : 'HMAC-SHA256 · X-SePay-Signature + X-SePay-Timestamp'}.</span>}</p>
    <p className="break-words text-xs"><strong>Phản hồi sau khi lưu bền:</strong> {guide.response}</p>
    <div className="flex flex-wrap gap-2"><Button className={button} disabled={!!busy || (!c.webhookEnabled && !c.webhookUrl)} onClick={onToggle}>{busy === `webhook-${c.id}` ? <ShimmeringText text="Đang cập nhật…" /> : c.webhookEnabled ? 'Tắt nhận webhook' : 'Bật nhận webhook'}</Button>{c.providerId === 'PAYOS' && <Button className={button} disabled={!!busy || !c.webhookEnabled || !c.webhookUrl} onClick={onRegister}>{busy === `register-${c.id}` ? <ShimmeringText text="Đang chờ payOS xác nhận…" /> : 'Đăng ký URL với payOS'}</Button>}</div>
    <p className="text-xs text-slate-500">{c.webhookLastReceivedAt ? `Đã nhận callback hợp lệ lần gần nhất: ${new Date(c.webhookLastReceivedAt).toLocaleString('vi-VN')}.` : 'Chưa nhận callback hợp lệ với cấu hình hiện tại.'} {c.webhookRegisteredAt && `payOS xác nhận đăng ký: ${new Date(c.webhookRegisteredAt).toLocaleString('vi-VN')}.`} Sự kiện được lưu chờ đối soát; chưa tự ghi thu.</p>
    <details><summary className="cursor-pointer text-xs font-semibold">Cách cấu hình tại nhà cung cấp</summary><ol className="mt-2 list-decimal space-y-2 pl-5 text-xs">{guide.steps.map((step, i) => <li key={i}>{step}</li>)}</ol><a className="mt-3 inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300" href={guide.docsUrl} target="_blank" rel="noreferrer">Tài liệu webhook chính thức <ExternalLink size={12} /></a></details>
    {!!c.webhookEvents?.length && <details><summary className="cursor-pointer text-xs font-semibold">Sự kiện gần nhất ({c.webhookEvents.length})</summary><ul className="mt-2 space-y-2 text-xs">{c.webhookEvents.map(e => <li key={e.id} className="break-words">{new Date(e.receivedAt).toLocaleString('vi-VN')} · {e.eventType} · {e.amountVnd === null ? '—' : `${e.amountVnd.toLocaleString('vi-VN')}đ`} · {e.status === 'TEST_RECEIVED' ? 'Mẫu thử đã nhận' : 'Đã lưu, chờ đối soát'}</li>)}</ul></details>}
  </div>;
}
