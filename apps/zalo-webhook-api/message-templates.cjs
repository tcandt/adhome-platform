const defaults = Object.freeze({
  REGISTRATION_SUCCESS: 'Đăng ký nhận tin phòng {roomCode} thành công.',
  INVOICE_ISSUED: 'Hóa đơn {invoiceCode}\nPhòng {roomCode} · {amount}đ\nHạn thanh toán: {dueDate}',
  METER_NOTICE: 'AdHome thông báo tiền điện nước phòng {roomCode}, kỳ {period}: điện {electricAmount}đ, nước {waterAmount}đ. Vui lòng kiểm tra hóa đơn và phản hồi nếu có sai lệch.',
  RENT_NOTICE: 'AdHome thông báo tiền phòng {roomCode}, kỳ {period}: {amount}đ, hạn thanh toán {dueDate}. Vui lòng kiểm tra hóa đơn để biết chi tiết.',
  CONTRACT_EXPIRING: 'Hợp đồng phòng {roomCode} dự kiến hết hạn ngày {endDate}. Vui lòng liên hệ quản lý nếu muốn gia hạn hoặc cần hỗ trợ bàn giao.',
});
const keys = Object.keys(defaults);
function normalizeTemplates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_templates');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('invalid_template_key');
  const result = { ...defaults };
  for (const key of keys) {
    if (value[key] === undefined) continue;
    const text = String(value[key]).trim();
    if (!text || text.length > 1200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('invalid_template_text');
    result[key] = text;
  }
  return result;
}
function renderTemplate(template, fields) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, key) => String(fields[key] ?? '—'));
}
module.exports = { defaults, keys, normalizeTemplates, renderTemplate };
