export interface InvoiceTransferData {
  roomCode?: string | null;
  buildingCode?: string | null;
  tenantName?: string | null;
  periodKey?: string | null;
  invoiceCode?: string | null;
}

export const DEFAULT_TRANSFER_SYNTAX = '{room} {tenant} {period}';

export const TRANSFER_SYNTAX_PRESETS = [
  {
    label: 'Phòng + Tên khách + Kỳ (Khuyên dùng)',
    syntax: '{room} {tenant} {period}',
    exampleDesc: 'P3101 NGUYENDUCTINH 112026',
  },
  {
    label: 'Phòng + Kỳ (Ngắn gọn)',
    syntax: '{room} {period}',
    exampleDesc: 'P3101 112026',
  },
  {
    label: 'Tòa + Phòng + Kỳ',
    syntax: '{building} {room} {period}',
    exampleDesc: 'LK31 P3101 112026',
  },
  {
    label: 'Mã hóa đơn duy nhất',
    syntax: '{invoiceCode}',
    exampleDesc: '7B053EC5',
  },
];

export const TRANSFER_SYNTAX_TOKENS = [
  { token: '{room}', label: 'Mã phòng', sample: 'P3101' },
  { token: '{building}', label: 'Mã tòa nhà', sample: 'LK31' },
  { token: '{tenant}', label: 'Tên khách (không dấu)', sample: 'NGUYENDUCTINH' },
  { token: '{period}', label: 'Kỳ tháng/năm (MMYYYY)', sample: '112026' },
  { token: '{month}', label: 'Tháng (MM)', sample: '11' },
  { token: '{year}', label: 'Năm (YYYY)', sample: '2026' },
  { token: '{invoiceCode}', label: 'Mã hóa đơn', sample: '7B053EC5' },
];

export function toAsciiNoTone(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim();
}

export function formatTransferContent(
  syntax: string | undefined | null,
  data: InvoiceTransferData
): string {
  const pattern = (syntax && syntax.trim()) || DEFAULT_TRANSFER_SYNTAX;

  // Clean room code: e.g. "P31-01" -> "P3101"
  const rawRoom = toAsciiNoTone(data.roomCode || '');
  const cleanRoom = rawRoom.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Clean building code: e.g. "LK01-31" -> "LK31" or "LK0131"
  const rawBuilding = toAsciiNoTone(data.buildingCode || '');
  const cleanBuilding = rawBuilding.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Clean tenant name: e.g. "Nguyễn Đức Tính" -> "NGUYENDUCTINH"
  const rawTenant = toAsciiNoTone(data.tenantName || '');
  const cleanTenant = rawTenant.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);

  // Period parsing: e.g. "2026-11" -> month "11", year "2026", period "112026"
  const periodDigits = (data.periodKey || '2026-11').replace(/[^0-9]/g, '');
  const periodMMYYYY =
    periodDigits.length === 6
      ? `${periodDigits.slice(4, 6)}${periodDigits.slice(0, 4)}`
      : '112026';
  const month = periodDigits.length === 6 ? periodDigits.slice(4, 6) : '11';
  const year = periodDigits.length === 6 ? periodDigits.slice(0, 4) : '2026';

  // Invoice code clean: e.g. "INV-HD-P31-01-7B053EC5" -> "7B053EC5"
  const rawInvoiceCode = String(data.invoiceCode || '').trim();
  let cleanInvoiceCode = rawInvoiceCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (rawInvoiceCode.includes('-')) {
    const parts = rawInvoiceCode.split('-').map((p) => p.trim()).filter(Boolean);
    const lastPart = parts[parts.length - 1]?.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (lastPart && lastPart.length >= 4) {
      cleanInvoiceCode = lastPart;
    }
  }

  let result = pattern
    .replace(/\{room(?:Code)?\}/gi, cleanRoom)
    .replace(/\{building(?:Code)?\}/gi, cleanBuilding)
    .replace(/\{tenant(?:Name)?\}/gi, cleanTenant)
    .replace(/\{period(?:Key)?\}/gi, periodMMYYYY)
    .replace(/\{month\}/gi, month)
    .replace(/\{year\}/gi, year)
    .replace(/\{invoice(?:Code)?\}/gi, cleanInvoiceCode)
    .replace(/\{code\}/gi, cleanInvoiceCode);

  // Sanitize for bank & intermediary gateway safety (VietQR, SePay, payOS standard)
  result = result
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  // If result is empty after replacement, fallback to default
  if (!result) {
    result = `${cleanRoom || 'ADHOME'} ${periodMMYYYY}`.trim();
  }

  // VietQR / Napas strict limit is 50 characters
  return result.slice(0, 50).trim();
}
