import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PDFDocument } from 'pdf-lib';

const root = [process.env.ADH_RENTAL_TEMPLATE_DIR, path.resolve('apps/landing/server/rental-templates'), path.resolve('server/rental-templates')].find((p): p is string => !!p && existsSync(path.join(p, 'CT01.docx'))) || path.resolve('apps/landing/server/rental-templates');
const run = promisify(execFile);
const text = (x: unknown) => String(x ?? '').trim();
const money = (x: unknown) => Number(x || 0).toLocaleString('vi-VN');
const date = (x: unknown) => { const s = (x instanceof Date ? x.toISOString() : text(x)).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s; };

export function moneyWords(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000_000) throw Object.assign(new Error('Số tiền không hợp lệ.'), { statusCode: 422 });
  if (!n) return 'Không đồng';
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const group = (num: number, full: boolean) => {
    const h = Math.floor(num / 100), t = Math.floor(num / 10) % 10, u = num % 10;
    const words: string[] = [];
    if (h || full) words.push(digits[h], 'trăm');
    if (t > 1) words.push(digits[t], 'mươi'); else if (t === 1) words.push('mười'); else if (u && (h || full)) words.push('lẻ');
    if (u) words.push(u === 1 && t > 1 ? 'mốt' : u === 5 && t > 0 ? 'lăm' : digits[u]);
    return words.join(' ');
  };
  const chunks: number[] = []; let rest = n;
  while (rest) { chunks.push(rest % 1000); rest = Math.floor(rest / 1000); }
  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i]) words.push(group(chunks[i], i < chunks.length - 1), ['', 'nghìn', 'triệu', 'tỷ'][i]);
  const result = words.filter(Boolean).join(' ') + ' đồng';
  return result[0].toUpperCase() + result.slice(1);
}

export function validateDocumentProfile(p: any) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || JSON.stringify(p).length > 45000) {
    throw Object.assign(new Error('Thông tin hồ sơ không hợp lệ.'), { statusCode: 422 });
  }
  if (!p.tenant || typeof p.tenant !== 'object' || Array.isArray(p.tenant) || (p.members !== undefined && (!Array.isArray(p.members) || p.members.length > 20))) {
    throw Object.assign(new Error('Thông tin khách và người cùng ở không hợp lệ.'), { statusCode: 422 });
  }
  const result = JSON.parse(JSON.stringify(p));
  result.members ||= []; result.landlord ||= {};
  for (const person of [result.tenant, result.landlord, ...result.members]) {
    if (!person || typeof person !== 'object' || Array.isArray(person) || Object.values(person).some(x => typeof x !== 'string' || x.length > 2000)) throw Object.assign(new Error('Các trường thông tin cá nhân phải là văn bản hợp lệ.'), { statusCode: 422 });
  }
  return result;
}

// Source templates remain intact; form values only replace explicit placeholders.
export async function renderRentalDocx(kind: string, p: any, record: any, personIndex = 0) {
  const file = { CT01: 'CT01.docx', HOLD: 'HD-COC-GIU-PHONG.docx', LEASE_1PN: 'HOP_DONG_1PN.docx', LEASE_2PN: 'HOP_DONG_2PN.docx' }[kind];
  if (!file) throw Object.assign(new Error('Chọn mẫu tài liệu hợp lệ.'), { statusCode: 422 });
  const people = [p.tenant, ...(p.members || [])].filter(Boolean);
  const t = kind === 'CT01' ? people[personIndex] : p.tenant;
  const l = p.landlord || {};
  const head = kind === 'CT01' && text(t?.householdHeadOccupantId)
    ? people.find((person: any) => text(person.occupantId) === text(t.householdHeadOccupantId)) || p.tenant
    : p.tenant;
  if (kind === 'CT01' && personIndex > 0 && text(t?.documentRole) !== 'CO_REPRESENTATIVE' && !text(t?.relationship)) throw Object.assign(new Error('Nhập mối quan hệ của thành viên cùng hộ với người đại diện hộ trước khi xuất CT01.'), { statusCode: 422 });
  const required = kind === 'CT01'
    ? [t?.fullName, t?.birthDate, t?.gender, t?.idNumber, p.rentalAddress]
    : [t?.fullName, t?.birthDate, t?.idNumber, t?.address, l.fullName, l.idNumber, l.address];
  if (required.some(x => !text(x))) throw Object.assign(new Error('Cần bổ sung họ tên, ngày sinh, giấy tờ và địa chỉ của các bên trong mục Hồ sơ trước khi xuất.'), { statusCode: 422 });
  if (kind === 'CT01' && (!/^\d{12}$/.test(text(t.idNumber)) || !/^\d{12}$/.test(text(head.idNumber)) || !text(head.fullName))) throw Object.assign(new Error('CT01 cần số định danh cá nhân đủ 12 chữ số.'), { statusCode: 422 });
  const sign = date(p.signedDate).split('/');
  if (sign.length !== 3) throw Object.assign(new Error('Chọn ngày lập hồ sơ.'), { statusCode: 422 });
  const dob = date(t.birthDate).split('/');
  const ct = record.contract || {};
  const r = record.reservation || {};
  if (kind === 'HOLD' && (!Number(r.holdAmountVnd) || (r.deposits || []).filter((d: any) => d.depositType === 'BOOKING').reduce((sum: number, d: any) => sum + Number(d.paidAmountVnd || 0), 0) < Number(r.holdAmountVnd))) {
    throw Object.assign(new Error('Mẫu thỏa thuận này xác nhận đã nhận đủ cọc. Cần xác nhận thực thu đủ cọc trước khi xuất.'), { statusCode: 422 });
  }
  const mapping: Record<string, any> = {
    hoTen: text(t.fullName), ngaySinh: kind === 'CT01' ? dob[0] : date(t.birthDate), thangSinh: dob[1], namSinh: dob[2], gioiTinh: text(t.gender),
    cccd: text(t.idNumber), diaChi: text(t.address), dienThoai: text(t.phone), dienThoaiNguoithan: text(t.emergencyContact),
    hoTenChuNha: text(l.fullName), ngaySinhChuNha: date(l.birthDate), cccdChuNha: text(l.idNumber),
    diaChiChuNha: kind === 'CT01' ? text(p.rentalAddress) : text(l.address), dienThoaiChuNha: text(l.phone),
    chuTaiKhoan: text(l.accountName), soTaiKhoan: text(l.accountNumber), nganHang: text(l.bank),
    toaNha: record.room.building.name, diachiToanha: text(p.rentalAddress), maPhong: record.room.code,
    mucDichThue: text(p.purpose) || 'Để ở', tienThue: money(ct.monthlyRentVnd ?? p.monthlyRentVnd), tienThueChu: moneyWords(ct.monthlyRentVnd ?? p.monthlyRentVnd),
    tienCoc: money(kind === 'HOLD' ? r.holdAmountVnd : ct.depositVnd), tienCocChu: moneyWords(kind === 'HOLD' ? r.holdAmountVnd : ct.depositVnd),
    ngayBatDau: date(ct.startDate), ngayKetThuc: date(ct.endDate), ngayKetthuc: date(ct.endDate),
    Hanthue: text(p.durationText), thoiHanThue: text(p.durationText),
    ngayKyHD: sign[0], thangKyHD: sign[1], namKyHD: sign[2], ngayHD: sign[0], thangHD: sign[1], namHD: sign[2],
    ngayThanhToanDauTien: date(ct.startDate || r.expectedMoveIn), quanLyToaNha: text(p.managerContact),
    ngayGiuPhongDen: date(r.holdUntil), ngayDuKienVaoO: date(r.expectedMoveIn),
    tienThueThangDau: money(p.firstRentVnd), tienCocThueNha: money(p.contractDepositVnd), phiKhac: money(p.otherFeesVnd),
    tongThanhToanKhiNhanPhong: money(p.initialDueVnd),
    hoTen2: '', ngaySinh2: '', gioiTinh2: '', cccd2: '', moiquanhe: '',
  };
  for (let i = 0; i < 12; i++) { mapping[`c${i}`] = text(t.idNumber)[i] || ''; mapping[`ch${i}`] = text(head.idNumber)[i] || ''; }
  const zip = new PizZip(await fs.readFile(path.join(root, file)));
  if (kind === 'LEASE_1PN') {
    zip.file('word/document.xml', zip.file('word/document.xml')!.asText().replace('0373.129.295 em Nhân', '{quanLyToaNha}'));
  }
  // The provided CT01 has a fixed authority/address sentence. Make authority an explicit reviewed field.
  if (kind === 'CT01') {
    if (!text(p.authority)) throw Object.assign(new Error('Nhập cơ quan tiếp nhận cư trú.'), { statusCode: 422 });
    let occurrences = 0;
    const xml = zip.file('word/document.xml')!.asText().replace(/\{hoTen\}/g, tag => ++occurrences === 2 ? '{hoTenChuHo}' : tag).replace('Chủ hộ</w:t>', '{quanHeChuHo}</w:t>');
    zip.file('word/document.xml', xml.replace('Công an phường Tân An', '{coQuanTiepNhan}'));
    mapping.hoTenChuHo = text(head.fullName);
    mapping.quanHeChuHo = personIndex === 0 ? 'Chủ hộ' : text(t.documentRole) === 'CO_REPRESENTATIVE' ? 'Đồng đại diện hợp đồng' : text(t.relationship);
    mapping.coQuanTiepNhan = text(p.authority);
  }
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(mapping);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function convertRentalPdf(buffer: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adhome-doc-'));
  try {
    const input = path.join(dir, 'document.docx');
    await fs.writeFile(input, buffer);
    try {
      await run(process.env.ADH_DOC_SOFFICE || (process.platform === 'win32' ? 'C:/Program Files/LibreOffice/program/soffice.exe' : 'soffice'),
        [`-env:UserInstallation=${pathToFileURL(path.join(dir, 'lo-profile')).href}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, input],
        { timeout: 60000, windowsHide: true });
    } catch {
      if (process.platform !== 'win32') throw new Error('PDF_CONVERTER_UNAVAILABLE');
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(root, '..', 'rentalDocPdf.ps1'), input, path.join(dir, 'document.pdf')], { timeout: 60000, windowsHide: true });
    }
    const pdf = await fs.readFile(path.join(dir, 'document.pdf'));
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('INVALID_PDF');
    return pdf;
  } catch {
    throw Object.assign(new Error('Không thể chuyển mẫu Word sang PDF trên máy chủ. Bạn có thể tải bản Word; cần cấu hình LibreOffice hoặc Microsoft Word để xuất PDF.'), { statusCode: 503 });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

export async function compiledResidencePdf(profile: any, record: any) {
  if (!record.contract) throw Object.assign(new Error('Cần hợp đồng trước khi tạo bộ hồ sơ cư trú.'), { statusCode: 422 });
  if (!['LEASE_1PN', 'LEASE_2PN'].includes(profile.leaseTemplate || 'LEASE_1PN')) throw Object.assign(new Error('Chọn mẫu hợp đồng căn hộ 1PN hoặc 2PN.'), { statusCode: 422 });
  const result = await PDFDocument.create();
  const lease = await convertRentalPdf(await renderRentalDocx(profile.leaseTemplate || 'LEASE_1PN', profile, record));
  const documents = [lease];
  for (let i = 0; i < 1 + (profile.members || []).length; i++) {
    documents.push(await convertRentalPdf(await renderRentalDocx('CT01', profile, record, i)));
  }
  for (const buffer of documents) {
    const pdf = await PDFDocument.load(buffer);
    for (const page of await result.copyPages(pdf, pdf.getPageIndices())) result.addPage(page);
  }
  // Private source evidence must be explicitly bound to its organization and building.
  if (profile.includeOwnershipEvidence === true) {
    if (!process.env.ADH_OWNERSHIP_EVIDENCE_ORG_ID || record.room.orgId !== process.env.ADH_OWNERSHIP_EVIDENCE_ORG_ID || record.room.buildingId !== process.env.ADH_OWNERSHIP_EVIDENCE_BUILDING_ID) {
      throw Object.assign(new Error('Giấy tờ nhà chưa được cấu hình cho tổ chức và tòa nhà này. Bỏ chọn đính kèm hoặc liên hệ quản trị viên.'), { statusCode: 422 });
    }
    for (const name of ['Giay-phep-KD.jpg', 'so-do-MT.jpg', 'so-do-MS.jpg']) {
      const jpg = await result.embedJpg(await fs.readFile(path.join(root, name)));
      const page = result.addPage([595.28, 841.89]);
      const fit = jpg.scaleToFit(555.28, 801.89);
      page.drawImage(jpg, { x: (595.28 - fit.width) / 2, y: (841.89 - fit.height) / 2, width: fit.width, height: fit.height });
    }
  }
  return Buffer.from(await result.save());
}
