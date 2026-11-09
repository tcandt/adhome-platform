const field = (key: string, label: string, secret = true, optional = false) => ({ key, label, secret, optional });
export const PAYMENT_PROVIDERS = [
  { id: 'SEPAY', name: 'SePay', description: 'Webhook biến động ngân hàng; API đọc tài khoản là tùy chọn.', docsUrl: 'https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook', canTest: true, environments: ['LIVE', 'SANDBOX'], fields: [field('apiToken', 'API Token (tùy chọn, dùng kiểm tra API)', true, true), field('webhookSecret', 'Webhook Secret / Webhook API Key', true, true)], testReference: false,
    webhook: { label: 'Webhook URL', docsUrl: 'https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc', authentication: 'HMAC-SHA256 hoặc API Key, dùng khóa webhook riêng; không dùng API Token đọc tài khoản.', response: 'HTTP 200 · {"success":true}', steps: ['Lưu kết nối và khóa webhook; bật nhận webhook tại AdHome.', 'SePay Dashboard → Tích hợp → Webhooks → Thêm webhook. Dán URL bên dưới, Content-Type application/json; chọn Có tiền vào và các tài khoản / VA cần nhận.', 'Ở bước Bảo mật chọn đúng HMAC-SHA256 hoặc API Key giống AdHome; nhập cùng khóa webhook. Không chọn Không xác thực hoặc OAuth cho endpoint này.', 'Bật retry. Dùng Gửi thử, sau đó tải lại AdHome để xem sự kiện đã nhận. Tách kết nối Test mode và Live.'] } },
  { id: 'PAYOS', name: 'payOS', description: 'Kênh thanh toán, VietQR và webhook ký bằng Checksum Key.', docsUrl: 'https://payos.vn/docs/api/', canTest: true, environments: ['LIVE'], fields: [field('clientId', 'Client ID', false), field('apiKey', 'API Key'), field('checksumKey', 'Checksum Key')], testReference: true,
    webhook: { label: 'Webhook URL', docsUrl: 'https://payos.vn/docs/du-lieu-tra-ve/webhook/', authentication: 'HMAC-SHA256 trên data đã sắp xếp khóa, dùng Checksum Key.', response: 'HTTP 200 (2XX)', steps: ['Lưu Client ID, API Key, Checksum Key của đúng kênh thanh toán; bật nhận webhook tại AdHome.', 'Dán URL vào cấu hình kênh tại my.payos.vn hoặc dùng nút Đăng ký URL với payOS bên dưới. API confirm-webhook sẽ thêm/cập nhật URL của kênh và gửi payload mẫu.', 'Chỉ trạng thái nhận sự kiện có chữ ký hợp lệ mới xác nhận đường callback hoạt động. Kiểm tra API đọc link không thay thế bước này.'] } },
  { id: 'MOMO', name: 'MoMo', description: 'Nhận IPN thanh toán v2; luồng tạo giao dịch chưa triển khai.', docsUrl: 'https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/notification/', canTest: false, environments: ['SANDBOX', 'LIVE'], fields: [field('partnerCode', 'Partner Code', false), field('accessKey', 'Access Key'), field('secretKey', 'Secret Key')], testReference: false,
    webhook: { label: 'IPN URL (ipnUrl)', docsUrl: 'https://developers.momo.vn/v3/vi/docs/payment/api/result-handling/notification/', authentication: 'HMAC-SHA256 theo chuỗi trường IPN v2, dùng Access Key + Secret Key; kiểm tra Partner Code.', response: 'HTTP 204 · body rỗng', steps: ['Lưu bộ khóa đúng môi trường và bật nhận webhook tại AdHome.', 'Khi tích hợp API tạo thanh toán v2, truyền URL bên dưới vào trường ipnUrl. redirectUrl là trang quay về cho khách, không thay thế IPN.', 'AdHome hiện nhận/lưu IPN đã xác thực; chưa có API tạo đơn MoMo hoặc tự ghi thu. Dùng tài khoản sandbox để kiểm thử đầu cuối trước khi chạy LIVE.'] } },
  { id: 'ZALOPAY', name: 'ZaloPay', description: 'Nhận callback đơn hàng; luồng tạo giao dịch chưa triển khai.', docsUrl: 'https://docs.zalopay.vn/docs/developer-tools/knowledge-base/callback/', canTest: false, environments: ['SANDBOX', 'LIVE'], fields: [field('appId', 'App ID', false), field('key1', 'Key 1 (API)'), field('key2', 'Key 2 (Callback)')], testReference: false,
    webhook: { label: 'Callback URL (callback_url)', docsUrl: 'https://docs.zalopay.vn/docs/developer-tools/knowledge-base/callback/', authentication: 'HMAC-SHA256 trên chính chuỗi data gửi tới, dùng Key 2; kiểm tra App ID.', response: 'HTTP 200 · {"return_code":1,"return_message":"success"}', steps: ['Lưu App ID, Key 1 và Key 2 của đúng môi trường; bật nhận webhook tại AdHome.', 'Đăng ký callback ở Merchant Portal hoặc truyền URL dưới đây vào callback_url của API tạo đơn. redirecturl không dùng để xác nhận thanh toán.', 'Endpoint hỗ trợ callback type=1 (Order); không dùng để nhận Agreement/QuickPay khác loại. Kiểm tra callback log trong Sandbox Merchant Portal. Chưa triển khai tạo đơn hoặc tự ghi thu.'] } },
  { id: 'TINGEE', name: 'Tingee', description: 'Nhận webhook thanh toán QR/VA; luồng tạo giao dịch chưa triển khai.', docsUrl: 'https://developers.tingee.vn/en/docs/webhook/webhook-payment-callback/', canTest: false, environments: ['SANDBOX', 'LIVE'], fields: [field('clientId', 'Client ID', false), field('secretKey', 'Secret Token / Secret Key')], testReference: false,
    webhook: { label: 'Webhook URL (Payment Callback)', docsUrl: 'https://developers.tingee.vn/en/docs/webhook/webhook-payment-callback/', authentication: 'x-signature = HMAC-SHA512(timestamp + ":" + JSON body, Secret Token); x-request-timestamp theo UTC+7.', response: 'HTTP 200 · {"code":"00","message":"Success"}', steps: ['Lưu Client ID và Secret Token đúng môi trường; bật nhận webhook tại AdHome.', 'Trong Tingee BaaS Portal → Developers/API Credentials → cấu hình Webhook, dán URL bên dưới; chọn sự kiện thanh toán QR/VA và chứng thực API Credentials (chữ ký).', 'Endpoint này hỗ trợ Payment Callback có transactionCode, không dùng cho Direct Debit, liên kết tài khoản hoặc các loại webhook khác.', 'Chọn tài khoản/VA theo quyền liên kết ngân hàng. Gửi thử giao dịch và xem lịch sử delivery tại Tingee; AdHome chỉ báo nhận khi xác thực và lưu inbox thành công.'] } },
] as const;

export function providerFor(id: string) { return PAYMENT_PROVIDERS.find(p => p.id === id); }

export class IntegrationError extends Error {
  constructor(message: string, public statusCode = 422, public code = 'VALIDATION_ERROR') { super(message); }
}

/** Only read-only probes. Credentials never enter URL, logs or returned errors. */
export async function testPaymentProvider(providerId: string, environment: string, credentials: Record<string, string>, reference: string) {
  const provider = providerFor(providerId);
  if (!provider?.canTest) throw new IntegrationError('Adapter kiểm tra nhà cung cấp này chưa được triển khai.', 422, 'NOT_SUPPORTED');
  if (environment !== 'LIVE') throw new IntegrationError('Phép kiểm tra API hiện chỉ hỗ trợ LIVE; kết nối SANDBOX vẫn có thể nhận webhook test.');
  if (providerId === 'SEPAY' && !credentials.apiToken) throw new IntegrationError('Cần API Token để kiểm tra API đọc tài khoản. Nhận webhook chỉ cần khóa webhook riêng.');
  let url: string;
  let headers: Record<string, string>;
  if (providerId === 'SEPAY') {
    url = 'https://my.sepay.vn/userapi/bankaccounts/list?limit=100';
    headers = { Authorization: `Bearer ${credentials.apiToken}` };
  } else {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(reference)) throw new IntegrationError('Nhập mã đơn hàng hoặc ID link thanh toán payOS có thật để kiểm tra.');
    url = `https://api-merchant.payos.vn/v2/payment-requests/${encodeURIComponent(reference)}`;
    headers = { 'x-client-id': credentials.clientId, 'x-api-key': credentials.apiKey };
  }
  try {
    const response = await fetch(url, { headers: { ...headers, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? 'Nhà cung cấp từ chối khóa hoặc quyền truy cập.' : response.status === 429 ? 'Nhà cung cấp giới hạn tần suất. Vui lòng thử lại sau.' : 'Nhà cung cấp chưa xác nhận phép kiểm tra. Kiểm tra mã tham chiếu và thử lại.', 422, 'PROVIDER_REJECTED');
    const data = await response.json();
    if (providerId === 'SEPAY') {
      if (Number(data.status) !== 200 || data.messages?.success !== true || !Array.isArray(data.bankaccounts)) throw new IntegrationError('Phản hồi SePay không xác nhận truy cập tài khoản.', 422, 'PROVIDER_REJECTED');
      return { message: `SePay xác nhận quyền đọc danh sách tài khoản (${data.bankaccounts.length} tài khoản trong trang kiểm tra). Webhook chưa được xác minh.`, scope: 'BANK_ACCOUNT_READ' };
    }
    if (data.code !== '00' || !data.data?.id) throw new IntegrationError('payOS chưa xác nhận truy cập link thanh toán.', 422, 'PROVIDER_REJECTED');
    return { message: 'payOS xác nhận quyền đọc link thanh toán. Checksum Key và webhook chưa được xác minh.', scope: 'PAYMENT_LINK_READ' };
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError('Không thể kiểm tra API nhà cung cấp (kết nối, timeout hoặc phản hồi không hợp lệ).', 502, 'PROVIDER_UNAVAILABLE');
  }
}
