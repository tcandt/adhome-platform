import { actorHasPermission, isBuildingAllowedForActor } from './authRbac';
import { compiledResidencePdf, convertRentalPdf, renderRentalDocx, validateDocumentProfile } from './rentalDocuments';
import { saveRentalProfile } from './rentalWorkflowApi';
import { readBuildingLandlords, resolveBuildingLandlord } from './buildingLandlord';
import { memberRole, mergeRentalOccupants } from './rentalPeople';

const fail = (message: string, statusCode = 422) => { throw Object.assign(new Error(message), { statusCode }); };
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function contractDocumentMissing(profile: any) {
  const missing: string[] = [];
  for (const [value, label] of [
    [profile.tenant?.fullName, 'Họ tên khách thuê'], [profile.tenant?.idNumber, 'Giấy tờ khách thuê'],
    [profile.tenant?.address, 'Địa chỉ khách thuê'], [profile.landlord?.fullName, 'Họ tên bên cho thuê'],
    [profile.landlord?.idNumber, 'Giấy tờ bên cho thuê'], [profile.landlord?.address, 'Địa chỉ bên cho thuê'],
    [profile.rentalAddress, 'Địa chỉ căn hộ'],
  ]) if (!String(value || '').trim()) missing.push(label);
  if (!validDate(profile.tenant?.birthDate)) missing.push('Ngày sinh khách thuê hợp lệ');
  if (!validDate(profile.signedDate)) missing.push('Ngày lập / ký hợp đồng hợp lệ');
  if (!['LEASE_1PN', 'LEASE_2PN'].includes(profile.leaseTemplate)) missing.push('Mẫu hợp đồng căn hộ');
  return missing;
}

export async function handleContractDocuments(req: any, res: any, pathname: string, prisma: any, actor: any, helpers: any): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/contracts\/([^/]+)\/document(?:\/(profile))?$/);
  if (!match) return false;
  const { sendJson, readJsonBody } = helpers;
  try {
    if (!actorHasPermission(actor, 'contracts.manage')) fail('Không có quyền xem và xuất hợp đồng.', 403);
    if (!['GET', 'POST'].includes(req.method) || (match[2] && req.method !== 'POST')) fail('Phương thức không được hỗ trợ.', 405);
    // Resolve the selected contract itself, including archived contracts, never the room's latest contract.
    const contract = await prisma.contract.findFirst({ where: { id: decodeURIComponent(match[1]), orgId: actor.orgId },
      include: { room: { include: { building: true } }, tenant: true, occupants: true } });
    if (!contract || contract.orgId !== actor.orgId || !contract.room || contract.room.orgId !== actor.orgId) fail('Không tìm thấy hợp đồng.', 404);
    const room = contract.room;
    if (!isBuildingAllowedForActor(actor, contract.buildingId, room.building.code)) fail('Không có quyền xem hợp đồng tòa nhà này.', 403);
    room.building.landlord = (await readBuildingLandlords(prisma, actor.orgId, [contract.buildingId])).get(contract.buildingId) || {};
    const saved = await prisma.consoleAuditLog.findFirst({ where: { orgId: actor.orgId, entityType: 'RENTAL_DOCUMENT', entityId: contract.id, action: 'SAVE_RENTAL_PROFILE' }, orderBy: { createdAt: 'desc' } });
    const reusable = await prisma.consoleAuditLog.findFirst({ where: { orgId: actor.orgId, buildingId: contract.buildingId, entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE' }, orderBy: { createdAt: 'desc' } });
    const primary = (contract.occupants || []).find((person: any) => person.relationToPrimary === 'PRIMARY');
    const stored = saved?.metadata || {};
    const profile = mergeRentalOccupants({
      members: [], purpose: 'Để ở', durationText: `${contract.startDate.split('-').reverse().join('/')} đến ${contract.endDate.split('-').reverse().join('/')}`,
      rentalAddress: [room.building.streetAddress, room.building.ward, room.building.province].filter(Boolean).join(', '),
      signedDate: contract.signedAt ? new Date(contract.signedAt).toISOString().slice(0, 10) : '',
      managerContact: [room.building.managerName, room.building.managerPhone].filter(Boolean).join(' - '),
      leaseTemplate: room.roomType === '2PN' ? 'LEASE_2PN' : 'LEASE_1PN', ...stored,
      tenant: { fullName: contract.tenant?.fullName || primary?.fullName || '', phone: contract.tenant?.phone || primary?.phone || '',
        idNumber: contract.tenant?.idNumber || primary?.idNumber || '', birthDate: primary?.dateOfBirth || '', gender: primary?.gender || '', address: '', ...stored.tenant },
      landlord: resolveBuildingLandlord(room.building, reusable?.metadata?.landlord, stored.landlord),
    }, contract.occupants || []);
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const params = new URL(req.url || '/', 'http://localhost').searchParams;
    const occupantId = String(body.occupantId || params.get('occupantId') || '');
    const selected = validateDocumentProfile(body.profile || profile);
    const people = [selected.tenant, ...selected.members];
    const personIndex = occupantId ? people.findIndex((person: any) => person.occupantId === occupantId)
      : Number(body.personIndex ?? params.get('personIndex') ?? 0);
    if (!Number.isInteger(personIndex) || personIndex < 0 || personIndex >= people.length
      || personIndex > 0 && memberRole(people[personIndex]) !== 'CO_REPRESENTATIVE') fail('Chọn người đại diện hợp đồng hợp lệ.');
    const selectedMissing = () => contractDocumentMissing({ ...selected, tenant: people[personIndex] });
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, contract: { id: contract.id, contractCode: contract.contractCode, status: contract.status,
        startDate: contract.startDate, endDate: contract.endDate, monthlyRentVnd: Number(contract.monthlyRentVnd), depositVnd: Number(contract.depositVnd) },
        room: { code: room.code, buildingName: room.building.name }, profile, personIndex, missing: selectedMissing() });
      return true;
    }
    if (match[2] === 'profile') {
      await saveRentalProfile(prisma, actor, room, contract.id, selected);
      sendJson(res, 200, { ok: true, missing: selectedMissing() }); return true;
    }
    const missing = selectedMissing();
    if (missing.length) { sendJson(res, 422, { ok: false, message: 'Bổ sung thông tin trước khi xem hợp đồng.', missing }); return true; }
    const pdf = body.bundle === true ? await compiledResidencePdf(selected, { contract, room }, prisma, personIndex > 0 ? personIndex : undefined)
      : await convertRentalPdf(await renderRentalDocx(selected.leaseTemplate, selected, { contract, room }, personIndex));
    const filename = `Hop-dong-${contract.contractCode.replace(/[^a-zA-Z0-9_-]/g, '-')}${personIndex > 0 ? `-dai-dien-${personIndex}` : ''}.pdf`;
    res.statusCode = 200; res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(pdf); return true;
  } catch (error: any) {
    const status = Number(error.statusCode) || 500;
    sendJson(res, status, { ok: false, message: status >= 500 && status !== 503 ? 'Không thể tạo bản xem hợp đồng. Vui lòng thử lại.' : error.message,
      ...(Array.isArray(error.missing) ? { missing: error.missing } : {}) });
    return true;
  }
}
