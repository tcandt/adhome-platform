export type IdentityDetails = { fullName: string; idNumber: string; birthDate: string; gender: string; address: string };

export function parseIdentityQr(raw: string): IdentityDetails {
  const fields = raw.trim().split('|').map(s => s.trim());
  if (fields.length < 6 || !/^\d{12}$/.test(fields[0]) || !fields[2] || !/^\d{8}$/.test(fields[3])) throw new Error('QR không đúng định dạng căn cước Việt Nam. Chọn ảnh rõ mã QR trên căn cước.');
  const dob = fields[3];
  const birthDate = `${dob.slice(4)}-${dob.slice(2, 4)}-${dob.slice(0, 2)}`;
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate || !['Nam', 'Nữ', 'Khác'].includes(fields[4]) || !fields[5]) throw new Error('Dữ liệu căn cước trong QR chưa hợp lệ. Vui lòng kiểm tra lại ảnh.');
  return { idNumber: fields[0], fullName: fields[2], birthDate, gender: fields[4], address: fields[5] };
}
