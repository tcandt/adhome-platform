import crypto from 'node:crypto';
import { readBuildingLandlords, resolveBuildingLandlord } from './buildingLandlord';
import { actorHasPermission, isBuildingAllowedForActor } from './authRbac';
import { availableDeposit, rentalSettlement, vnd } from './rentalFinance';
import { compiledResidencePdf, convertRentalPdf, renderRentalDocx, validateDocumentProfile } from './rentalDocuments';

const fail = (message: string, statusCode = 422) => { throw Object.assign(new Error(message), { statusCode }); };
const active = ['DRAFT', 'ACTIVE', 'EXPIRING', 'EXTENDED'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const validDate = (s: unknown) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export async function saveRentalProfile(tx: any, actor: any, room: any, entityId: string, profile: any) {
  if (!profile) return;
  await tx.consoleAuditLog.create({ data: {
    orgId: actor.orgId, buildingId: room.buildingId, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    entityType: 'RENTAL_DOCUMENT', entityId, action: 'SAVE_RENTAL_PROFILE', summary: 'Lưu thông tin hồ sơ thuê và cư trú',
    metadata: validateDocumentProfile(profile),
  } });
}

// Delegated from the existing authenticated Console API; all reads and writes
// remain scoped to the actor's organization and allowed building.
export async function handleRentalWorkflow(req: any, res: any, pathname: string, prisma: any, actor: any, helpers: any): Promise<boolean> {
  const match = pathname.match(/^\/api\/v1\/console\/v2\/rental-workflow\/([^/]+)(?:\/(quote|start|profile|export|draft))?$/);
  if (!match) return false;
  const { sendJson, readJsonBody, calculateFirstPeriodRent, handleWithIdempotency } = helpers;
  try {
    if (!actorHasPermission(actor, 'rooms.read') && !actorHasPermission(actor, 'contracts.manage')) fail('Không có quyền xem hồ sơ phòng.', 403);
    const room = await prisma.consoleRoom.findUnique({ where: { id: decodeURIComponent(match[1]) }, include: { building: true } });
    if (!room || room.orgId !== actor.orgId) fail('Không tìm thấy phòng.', 404);
    if (!isBuildingAllowedForActor(actor, room.buildingId, room.building.code)) fail('Không có quyền xử lý phòng này.', 403);
    if (actorHasPermission(actor, 'contracts.manage')) room.building.landlord = (await readBuildingLandlords(prisma, actor.orgId, [room.buildingId])).get(room.buildingId) || {};
    else delete room.building.landlord;
    const load = async () => {
      const [reservations, contracts] = await Promise.all([
        prisma.roomReservation.findMany({ where: { orgId: actor.orgId, roomId: room.id }, include: { deposits: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.contract.findMany({ where: { orgId: actor.orgId, roomId: room.id }, include: { tenant: true, deposits: true, occupants: true, invoices: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);
      const reservation = reservations.find((r: any) => ['PENDING', 'CONFIRMED'].includes(r.status)) || reservations[0] || null;
      const contract = contracts.find((c: any) => active.includes(c.status)) || (reservation && ['PENDING', 'CONFIRMED'].includes(reservation.status) ? null : contracts[0]) || null;
      const current = reservation && ['PENDING', 'CONFIRMED'].includes(reservation.status) && (!contract || !active.includes(contract.status)) ? reservation : contract || reservation;
      const ids = [current?.id].filter(Boolean);
      const profile = ids.length ? await prisma.consoleAuditLog.findFirst({ where: { orgId: actor.orgId, entityType: 'RENTAL_DOCUMENT', entityId: { in: ids }, action: 'SAVE_RENTAL_PROFILE' }, orderBy: { createdAt: 'desc' } }) : null;
      const buildingProfile = actorHasPermission(actor, 'contracts.manage') ? await prisma.consoleAuditLog.findFirst({ where: { orgId: actor.orgId, buildingId: room.buildingId, entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE' }, orderBy: { createdAt: 'desc' } }) : null;
      const reusable = buildingProfile?.metadata as any;
      const documentDefaults = {
        landlord: actorHasPermission(actor, 'contracts.manage') ? resolveBuildingLandlord(room.building, reusable?.landlord) : {}, authority: reusable?.authority || '',
        managerContact: reusable?.managerContact || [room.building.managerName, room.building.managerPhone].filter(Boolean).join(' - '),
        rentalAddress: [room.building.streetAddress, room.building.ward, room.building.province].filter(Boolean).join(', '),
      };
      const toPerson = (o: any) => {
        let secondary: any = {};
        try { secondary = JSON.parse(o.notes || '{}')?.secondaryContract || {}; } catch { secondary = {}; }
        return { occupantId: o.id || '', fullName: o.fullName || '', phone: o.phone || '', idNumber: o.idNumber || '', birthDate: o.dateOfBirth || '', gender: o.gender || '', address: secondary.address || '', documentRole: secondary.role || (o.relationToPrimary === 'FAMILY' ? 'HOUSEHOLD_MEMBER' : o.relationToPrimary === 'OTHER' ? 'CO_REPRESENTATIVE' : 'PRIMARY'), ...(o.relationToPrimary !== 'PRIMARY' ? { relationship: secondary.relationship || '', householdHeadOccupantId: secondary.householdHeadOccupantId || '', householdHeadName: secondary.householdHeadName || '' } : {}) };
      };
      const occupants = (contract?.occupants || []).filter((o: any) => !['MOVED_OUT', 'CANCELLED'].includes(o.occupancyStatus));
      const primary = occupants.find((o: any) => o.relationToPrimary === 'PRIMARY');
      const saved = profile?.metadata as any;
      let resolvedProfile = saved || null;
      if (contract && !saved) resolvedProfile = { ...documentDefaults, tenant: primary ? toPerson(primary) : { fullName: contract.tenant?.fullName || '', phone: contract.tenant?.phone || '', idNumber: contract.tenant?.idNumber || '', birthDate: '', gender: '', address: '' }, members: occupants.filter((o: any) => o !== primary).map(toPerson), signedDate: today(), purpose: 'Để ở', durationText: `${Math.max(1, Math.round((Date.parse(contract.endDate) - Date.parse(contract.startDate)) / 86400000) + 1)} ngày`, leaseTemplate: 'LEASE_1PN' };
      if (saved && contract) {
        const members = [...(saved.members || [])];
        for (const o of occupants.filter((o: any) => o.relationToPrimary !== 'PRIMARY')) {
          if (!members.some((p: any) => o.idNumber && p.idNumber === o.idNumber || p.fullName?.trim() === o.fullName?.trim())) members.push(toPerson(o));
        }
        resolvedProfile = { ...saved, members };
      }
      if (resolvedProfile && actorHasPermission(actor, 'contracts.manage')) resolvedProfile = { ...resolvedProfile, landlord: resolveBuildingLandlord(room.building, reusable?.landlord, resolvedProfile.landlord) };
      return { room, reservation, contract, contracts: contracts.filter((c: any) => active.includes(c.status)), reservations, profile: resolvedProfile, documentDefaults,
        bookingBalance: reservation ? reservation.deposits.filter((d: any) => d.depositType === 'BOOKING').reduce((s: number, d: any) => s + availableDeposit(d), 0) : 0 };
    };
    if (req.method === 'GET' && !match[2]) { sendJson(res, 200, { ok: true, ...await load() }); return true; }
    if (req.method !== 'POST') fail('Phương thức không được hỗ trợ.', 405);
    if (!actorHasPermission(actor, 'contracts.manage')) fail('Không có quyền quản lý hợp đồng.', 403);
    const body = await readJsonBody(req);
    if (match[2] === 'quote') {
      if (!validDate(body.startDate) || !validDate(body.endDate) || body.endDate <= body.startDate) fail('Chọn thời hạn hợp đồng hợp lệ.');
      const rent = vnd(body.monthlyRentVnd, 'Giá thuê');
      if (rent < 500000) fail('Giá thuê tối thiểu 500.000 đ.');
      const state = await load();
      if (body.reservationId && state.reservation?.id !== body.reservationId) fail('Phiếu giữ chỗ đã thay đổi. Hãy tải lại.', 409);
      const calc = calculateFirstPeriodRent(body.firstPeriodBillingPolicy || 'CALENDAR_PRORATE', body.startDate, rent);
      sendJson(res, 200, { ok: true, ...rentalSettlement(body.reservationId ? state.bookingBalance : 0, vnd(body.depositVnd), calc.rentFirstPeriodVnd, body.surplusAction || 'RENT_CREDIT'), rent: calc });
      return true;
    }
    if (match[2] === 'draft') {
      const state = await load();
      const current = state.contract;
      if (!current || current.status !== 'DRAFT') fail('Chỉ có thể sửa hợp đồng nháp trước bàn giao.', 409);
      const botKey = process.env.ADHOME_ZALO_BOT_ADMIN_API_KEY;
      if (botKey) {
        const response = await fetch(`https://api.adhome.vn/internal/zalo-bot/${encodeURIComponent(actor.orgId)}/contracts/${encodeURIComponent(current.id)}/status`, {
          headers: { authorization: `Bearer ${botKey}` }, signal: AbortSignal.timeout(10000),
        }).catch(() => null);
        if (!response?.ok) fail('Chưa kiểm tra được trạng thái đăng ký Zalo; hãy thử lại.', 503);
        if ((await response.json()).linked) fail('Khách đã đăng ký nhận tin Zalo; không thể sửa trực tiếp hợp đồng đã thông báo.', 409);
      }
      if (!validDate(body.startDate) || !validDate(body.endDate) || body.endDate <= body.startDate) fail('Chọn thời hạn hợp đồng hợp lệ.');
      const monthly = vnd(body.monthlyRentVnd, 'Giá thuê');
      const deposit = vnd(body.depositVnd, 'Cọc hợp đồng');
      if (monthly < 500000) fail('Giá thuê tối thiểu 500.000 đ.');
      const p = validateDocumentProfile(body.documentProfile);
      if (!p.tenant?.fullName?.trim() || !p.tenant?.phone?.trim()) fail('Nhập tên và số điện thoại khách.');
      const members = Array.isArray(p.members) ? p.members : [];
      const rentalModel = body.rentalModel === 'SHARED_ROOM' || body.rentalModel === 'ENTIRE_ROOM' ? body.rentalModel : current.rentalModel;
      if (members.length + 1 > room.maxOccupants) fail('Số người vượt sức chứa phòng.');
      if (rentalModel === 'SHARED_ROOM' && members.length) fail('Mỗi khách ghép phải có hợp đồng riêng; không thêm người ghép vào hợp đồng này.');
      const result = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT id FROM "contracts" WHERE id = ${current.id} FOR UPDATE`;
        const ct = await tx.contract.findUnique({ where: { id: current.id }, include: { invoices: true, deposits: true, tenant: true } });
        if (!ct || ct.status !== 'DRAFT' || ct.orgId !== actor.orgId) fail('Hợp đồng đã thay đổi. Hãy tải lại.', 409);
        if (ct.invoices.some((i: any) => Number(i.paidAmountVnd) > 0) || ct.deposits.some((d: any) => Number(d.paidAmountVnd) > 0)) fail('Đã có tiền thực thu; không thể sửa trực tiếp hợp đồng nháp. Hãy xử lý điều chỉnh riêng.', 409);
        const phone = p.tenant.phone.replace(/\D/g, '').replace(/^84/, '0');
        const duplicate = await tx.tenant.findFirst({ where: { orgId: actor.orgId, normalizedPhone: phone, id: { not: ct.tenantId } } });
        if (duplicate) fail('Số điện thoại đã thuộc khách khác.', 409);
        await tx.tenant.update({ where: { id: ct.tenantId }, data: { fullName: p.tenant.fullName.trim(), phone: p.tenant.phone.trim(), normalizedPhone: phone, idNumber: p.tenant.idNumber || null } });
        await tx.contract.update({ where: { id: ct.id }, data: { startDate: body.startDate, endDate: body.endDate, rentalModel,
          monthlyRentVnd: BigInt(monthly), depositVnd: BigInt(deposit), occupantsCount: members.length + 1 } });
        const otherContracts = await tx.contract.count({ where: { roomId: room.id, id: { not: ct.id }, status: { in: active } } });
        if (otherContracts && rentalModel !== ct.rentalModel) fail('Không thể đổi dạng phòng khi có hợp đồng ghép khác.', 409);
        await tx.consoleRoom.update({ where: { id: room.id }, data: { rentalModel } });
        if (room.publicListingId) await tx.publicRoomListing.update({ where: { id: room.publicListingId }, data: { rentalModel } });
        await tx.roomOccupant.deleteMany({ where: { contractId: ct.id, orgId: actor.orgId, occupancyStatus: 'SCHEDULED' } });
        for (const [index, person] of [p.tenant, ...members].entries()) {
          if (!person.fullName?.trim()) fail('Nhập họ tên của tất cả người cùng ở.');
          await tx.roomOccupant.create({ data: { orgId: actor.orgId, roomId: room.id, contractId: ct.id,
            tenantId: index === 0 ? ct.tenantId : null, fullName: person.fullName, phone: person.phone || null,
            idNumber: person.idNumber || null, dateOfBirth: person.birthDate || null, gender: person.gender || null,
            relationToPrimary: index === 0 ? 'PRIMARY' : 'ROOMMATE', moveInDate: body.startDate,
            occupancyStatus: 'SCHEDULED', isActive: false } });
        }
        const calc = calculateFirstPeriodRent(body.firstPeriodBillingPolicy || 'CALENDAR_PRORATE', body.startDate, monthly);
        const settlement = rentalSettlement(0, deposit, calc.rentFirstPeriodVnd, 'RENT_CREDIT');
        const first = ct.invoices.find((i: any) => i.policySnapshot?.type === 'FIRST_COMBINED_INVOICE' && i.status !== 'VOID');
        if (!first) fail('Không tìm thấy hóa đơn kỳ đầu để cập nhật.', 409);
        await tx.invoice.update({ where: { id: first.id }, data: { periodKey: body.startDate.slice(0, 7), dueDate: body.startDate,
          roomRentVnd: BigInt(calc.rentFirstPeriodVnd), adjustmentVnd: BigInt(deposit), totalAmountVnd: BigInt(settlement.totalInitialInvoiceDue),
          policySnapshot: { type: 'FIRST_COMBINED_INVOICE', financialSummary: settlement, formula: calc.formula,
            breakdown: [{ label: 'Tiền thuê kỳ đầu', amountVnd: calc.rentFirstPeriodVnd }, { label: 'Cọc hợp đồng', amountVnd: deposit }] } } });
        const contractDeposit = ct.deposits.find((d: any) => d.depositType === 'CONTRACT');
        if (contractDeposit) await tx.deposit.update({ where: { id: contractDeposit.id }, data: { amountVnd: BigInt(deposit) } });
        else if (deposit > 0) await tx.deposit.create({ data: { orgId: actor.orgId, contractId: ct.id, depositType: 'CONTRACT', amountVnd: BigInt(deposit), paidAmountVnd: 0n, paymentStatus: 'PENDING', status: 'HELD' } });
        await saveRentalProfile(tx, actor, room, ct.id, p);
        return { contractId: ct.id, invoiceId: first.id };
      });
      sendJson(res, 200, { ok: true, ...result }); return true;
    }
    if (match[2] === 'profile' || match[2] === 'export') {
      const state = await load();
      // Export only saved record identities; financial values are authoritative.
      const recordId = body.entityId;
      if (!recordId || ![state.contract?.id, state.reservation?.id].includes(recordId)) fail('Hồ sơ đã thay đổi. Hãy tải lại.', 409);
      const profile = validateDocumentProfile(body.profile || state.profile);
      if (match[2] === 'profile') {
        if (state.reservation?.id === recordId && ['PENDING', 'CONFIRMED'].includes(state.reservation.status)) {
          if (!profile.tenant?.fullName?.trim() || !profile.tenant?.phone?.trim()) fail('Nhập tên và số điện thoại khách giữ phòng.');
          if ((profile.members?.length || 0) + 1 > room.maxOccupants) fail('Số người vượt sức chứa phòng.');
          if (profile.members?.some((person: any) => !person.fullName?.trim())) fail('Nhập họ tên của tất cả người cùng ở.');
          await prisma.$transaction(async (tx: any) => {
            const reservation = await tx.roomReservation.findFirst({ where: { id: recordId, orgId: actor.orgId, roomId: room.id, status: { in: ['PENDING', 'CONFIRMED'] } } });
            if (!reservation) fail('Phiếu giữ chỗ đã thay đổi. Hãy tải lại.', 409);
            await tx.roomReservation.update({ where: { id: recordId }, data: { customerName: profile.tenant.fullName.trim(), customerPhone: profile.tenant.phone.trim() } });
            await saveRentalProfile(tx, actor, room, recordId, profile);
          });
        } else {
          await saveRentalProfile(prisma, actor, room, recordId, profile);
        }
        sendJson(res, 200, { ok: true }); return true;
      }
      const invoice = state.contract?.invoices.find((i: any) => i.policySnapshot?.type === 'FIRST_COMBINED_INVOICE');
      const holdFirstRent = vnd(profile.holdFirstRentVnd ?? room.listPriceVnd);
      const holdContractDeposit = vnd(profile.holdContractDepositVnd ?? room.listPriceVnd);
      const holdQuote = rentalSettlement(state.bookingBalance, holdContractDeposit, holdFirstRent, 'RENT_CREDIT');
      Object.assign(profile, { monthlyRentVnd: state.contract?.monthlyRentVnd || room.listPriceVnd,
        firstRentVnd: invoice?.roomRentVnd ?? holdFirstRent, contractDepositVnd: state.contract?.depositVnd ?? holdContractDeposit,
        otherFeesVnd: 0, initialDueVnd: invoice?.totalAmountVnd ?? holdQuote.totalInitialInvoiceDue });
      const kind = String(body.kind);
      if (['CT01', 'RESIDENCE_BUNDLE'].includes(kind) && !state.contract) fail('Khách đang cọc giữ phòng chưa cần khai báo tạm trú. Hãy chuyển sang hợp đồng thuê trước.');
      if (kind === 'HOLD' && !state.reservation) fail('Chưa có phiếu cọc.');
      if (['LEASE_1PN', 'LEASE_2PN', 'RESIDENCE_BUNDLE'].includes(kind) && !state.contract) fail('Chưa có hợp đồng.');
      const isPdf = body.format === 'pdf' || kind === 'RESIDENCE_BUNDLE';
      const buffer = kind === 'RESIDENCE_BUNDLE' ? await compiledResidencePdf(profile, state)
        : isPdf ? await convertRentalPdf(await renderRentalDocx(kind, profile, state, Number(body.personIndex || 0)))
        : await renderRentalDocx(kind, profile, state, Number(body.personIndex || 0));
      res.statusCode = 200;
      res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${kind}-${room.id.replace(/[^a-zA-Z0-9-]/g, '')}.${isPdf ? 'pdf' : 'docx'}"`);
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(buffer); return true;
    }
    if (match[2] !== 'start') fail('Không tìm thấy thao tác.', 404);
    if (!['HOLD', 'DIRECT', 'IMPORT'].includes(body.intent)) fail('Chọn nhu cầu trước khi tiếp tục.');
    const p = validateDocumentProfile(body.documentProfile);
    if (!p.tenant?.fullName?.trim() || !p.tenant?.phone?.trim()) fail('Nhập tên và số điện thoại khách.');
    const amount = vnd(body.depositVnd || 0);
    const monthly = vnd(body.monthlyRentVnd || room.listPriceVnd);
    const paid = vnd(body.paidAmountVnd || 0);
    if (paid > amount) fail('Tiền cọc thực nhận không được vượt cọc thỏa thuận.');
    if (paid > 0 && body.intent !== 'IMPORT' && !actorHasPermission(actor, 'finance.write')) fail('Không có quyền ghi nhận thu tiền.', 403);
    if (!validDate(body.startDate) || (body.intent !== 'HOLD' && (!validDate(body.endDate) || body.endDate <= body.startDate))) fail('Nhập ngày bắt đầu/kết thúc hợp lệ.');
    if (monthly < 500000) fail('Giá thuê tối thiểu 500.000 đ.');
    const members = Array.isArray(p.members) ? p.members : [];
    const rentalModel = body.rentalModel === 'SHARED_ROOM' || body.rentalModel === 'ENTIRE_ROOM' ? body.rentalModel : room.rentalModel || 'ENTIRE_ROOM';
    if (!['SHARED_ROOM', 'ENTIRE_ROOM'].includes(rentalModel)) fail('Chọn hình thức thuê hợp lệ.');
    if (members.length + 1 > room.maxOccupants) fail('Số người vượt sức chứa phòng.');
    if (rentalModel === 'SHARED_ROOM' && members.length) fail('Mỗi khách ghép phải có hợp đồng riêng; không thêm người ghép vào hợp đồng này.');
    if (body.intent === 'IMPORT' && (!validDate(body.paidThrough) || !validDate(body.takeoverDate))) fail('Nhập ngày tiếp quản và ngày đã thanh toán đến.');
    await handleWithIdempotency(prisma, actor.orgId, 'RENTAL_ONBOARDING', req.headers['idempotency-key'], body, res, async () => {
      const result = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT id FROM "console_rooms" WHERE id = ${room.id} FOR UPDATE`;
        const fresh = await tx.consoleRoom.findUnique({ where: { id: room.id } });
        const [existingContracts, resCount] = await Promise.all([
          tx.contract.findMany({ where: { roomId: room.id, status: { in: active } }, select: { rentalModel: true, occupantsCount: true } }),
          tx.roomReservation.count({ where: { roomId: room.id, status: { in: ['PENDING', 'CONFIRMED'] } } }),
        ]);
        const joiningShared = body.intent !== 'HOLD' && rentalModel === 'SHARED_ROOM' && existingContracts.length > 0 && existingContracts.every((contract: any) => contract.rentalModel === 'SHARED_ROOM');
        if ((existingContracts.length && !joiningShared) || resCount || !fresh || (existingContracts.length && fresh.rentalModel !== 'SHARED_ROOM') || !(joiningShared ? ['AVAILABLE', 'VACANT', 'OCCUPIED', 'RESERVED'] : body.intent === 'IMPORT' ? ['AVAILABLE', 'VACANT', 'OCCUPIED'] : ['AVAILABLE', 'VACANT']).includes(fresh.occupancyStatus)) fail('Phòng không còn đủ điều kiện tạo thuê mới. Hãy tải lại hồ sơ.', 409);
        if (joiningShared && existingContracts.reduce((sum: number, contract: any) => sum + contract.occupantsCount, 0) + members.length + 1 > room.maxOccupants) fail('Phòng ghép đã hết chỗ.', 409);
        const code = `${body.intent === 'HOLD' ? 'GC' : 'HD'}-${room.code}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        let entity: any;
        if (body.intent === 'HOLD') {
          const days = Number(body.holdDays);
          if (!Number.isInteger(days) || days < 1 || days > 30) fail('Hạn giữ từ 1 đến 30 ngày.');
          entity = await tx.roomReservation.create({ data: {
            orgId: actor.orgId, buildingId: room.buildingId, roomId: room.id, reservationCode: code,
            customerName: p.tenant.fullName.trim(), customerPhone: p.tenant.phone.trim(), holdAmountVnd: BigInt(amount),
            status: paid >= amount && paid > 0 ? 'CONFIRMED' : 'PENDING', expectedMoveIn: body.startDate,
            holdUntil: new Date(Date.now() + days * 86400000),
          } });
        } else {
          const org = await tx.organization.findUnique({ where: { id: actor.orgId } });
          const phone = p.tenant.phone.replace(/\D/g, '').replace(/^84/, '0');
          let tenant = await tx.tenant.findFirst({ where: { orgId: actor.orgId, normalizedPhone: phone } });
          if (tenant && tenant.fullName.toLocaleLowerCase('vi') !== p.tenant.fullName.trim().toLocaleLowerCase('vi')) fail('Số điện thoại đã thuộc khách khác. Kiểm tra lại khách trước khi lưu.', 409);
          if (tenant && joiningShared && await tx.contract.count({ where: { roomId: room.id, tenantId: tenant.id, status: { in: active } } })) fail('Khách đã có hợp đồng tại phòng ghép này.', 409);
          if (!tenant) tenant = await tx.tenant.create({ data: { orgId: actor.orgId, primaryBuildingId: room.buildingId,
            fullName: p.tenant.fullName.trim(), phone: p.tenant.phone.trim(), normalizedPhone: phone, idNumber: p.tenant.idNumber || null,
            emergencyContact: p.tenant.emergencyContact || null } });
          entity = await tx.contract.create({ data: {
            orgId: actor.orgId, buildingId: room.buildingId, roomId: room.id, tenantId: tenant.id, contractCode: code,
            startDate: body.startDate, endDate: body.endDate, rentalModel, monthlyRentVnd: BigInt(monthly), depositVnd: BigInt(amount), occupantsCount: members.length + 1,
            status: body.intent === 'IMPORT' ? 'ACTIVE' : 'DRAFT', moveInDate: body.intent === 'IMPORT' ? body.startDate : null,
            electricRateVnd: room.electricBillingMode === 'HUNONIC_AUTO' ? 0 : room.electricRateVnd ?? room.building.electricRateVnd ?? org?.defaultElectricRateVnd ?? 3800,
            waterBillingMethod: room.waterBillingMethod || room.building.waterBillingMethod || org?.defaultWaterMethod || 'PER_M3',
            waterRateVnd: room.waterRateVnd ?? room.building.waterRateVnd ?? org?.defaultWaterRateVnd ?? 15000,
            notes: body.intent === 'IMPORT' ? `Tiếp quản ${body.takeoverDate}; đã trả đến ${body.paidThrough}; không thu lại cọc lịch sử.` : null,
          } });
          for (const [index, person] of [p.tenant, ...members].entries()) {
            if (!person.fullName?.trim()) fail('Nhập họ tên của tất cả người cùng ở.');
            await tx.roomOccupant.create({ data: { orgId: actor.orgId, roomId: room.id, contractId: entity.id,
              tenantId: index === 0 ? tenant.id : null, fullName: person.fullName, phone: person.phone || null, idNumber: person.idNumber || null,
              dateOfBirth: person.birthDate || null, gender: person.gender || null, relationToPrimary: index === 0 ? 'PRIMARY' : 'ROOMMATE',
              moveInDate: body.startDate, occupancyStatus: body.intent === 'IMPORT' ? 'ACTIVE' : 'SCHEDULED', isActive: body.intent === 'IMPORT' } });
          }
          if (body.intent === 'IMPORT') await tx.tenant.update({ where: { id: tenant.id }, data: { currentRoomId: room.id } });
          if (body.intent !== 'IMPORT') {
            const calc = calculateFirstPeriodRent(body.firstPeriodBillingPolicy || 'CALENDAR_PRORATE', body.startDate, monthly);
            const q = rentalSettlement(0, amount, calc.rentFirstPeriodVnd, 'RENT_CREDIT');
            await tx.invoice.create({ data: { orgId: actor.orgId, buildingId: room.buildingId, roomId: room.id, tenantId: tenant.id, contractId: entity.id,
              invoiceCode: `INV-${code}`, periodKey: body.startDate.slice(0, 7), dueDate: body.startDate,
              roomRentVnd: BigInt(calc.rentFirstPeriodVnd), adjustmentVnd: BigInt(amount), totalAmountVnd: BigInt(q.totalInitialInvoiceDue), status: 'ISSUED',
              policySnapshot: { type: 'FIRST_COMBINED_INVOICE', financialSummary: q, formula: calc.formula,
                breakdown: [{ label: 'Tiền thuê kỳ đầu', amountVnd: calc.rentFirstPeriodVnd }, { label: 'Cọc hợp đồng', amountVnd: amount }] } } });
          } else {
            const debt = vnd(body.openingDebtVnd || 0);
            if (debt) await tx.invoice.create({ data: { orgId: actor.orgId, buildingId: room.buildingId, roomId: room.id, tenantId: tenant.id, contractId: entity.id,
              invoiceCode: `OPEN-${code}`, periodKey: body.takeoverDate.slice(0, 7), dueDate: body.takeoverDate,
              totalAmountVnd: BigInt(debt), adjustmentVnd: BigInt(debt), status: 'ISSUED', policySnapshot: { type: 'OPENING_BALANCE', paidThrough: body.paidThrough } } });
          }
        }
        if (amount > 0) await tx.deposit.create({ data: { orgId: actor.orgId,
          ...(body.intent === 'HOLD' ? { reservationId: entity.id } : { contractId: entity.id }),
          depositType: body.intent === 'HOLD' ? 'BOOKING' : 'CONTRACT', amountVnd: BigInt(amount),
          paidAmountVnd: BigInt(body.intent === 'DIRECT' ? 0 : paid),
          paymentStatus: body.intent === 'DIRECT' || !paid ? 'PENDING' : paid >= amount ? 'PAID' : 'PARTIALLY_PAID', status: 'HELD',
          paymentMethod: body.intent === 'IMPORT' ? 'OPENING_BALANCE' : paid ? String(body.paymentMethod || 'CASH') : null,
          receivedAt: paid > 0 && body.intent !== 'DIRECT' ? new Date() : null } });
        if (body.intent === 'HOLD' && paid > 0) await tx.ledgerEntry.create({ data: { orgId: actor.orgId, buildingId: room.buildingId,
          periodKey: today().slice(0, 7), entryCode: `PT-${code}`, entryType: 'INCOME', category: 'Cọc giữ chỗ', amountVnd: BigInt(paid),
          description: `Thu cọc giữ phòng ${code}`, recordedBy: actor.email } });
        const status = joiningShared ? fresh.occupancyStatus : body.intent === 'IMPORT' ? 'OCCUPIED' : 'RESERVED';
        await tx.consoleRoom.update({ where: { id: room.id }, data: { occupancyStatus: status, ...(body.intent === 'HOLD' ? {} : { rentalModel }) } });
        if (room.publicListingId) await tx.publicRoomListing.update({ where: { id: room.publicListingId }, data: { status, ...(body.intent === 'HOLD' ? {} : { rentalModel }) } });
        await saveRentalProfile(tx, actor, room, entity.id, p);
        return { entityId: entity.id, intent: body.intent };
      });
      return { status: 201, body: { ok: true, ...result } };
    });
    return true;
  } catch (e: any) { sendJson(res, e.statusCode || 500, { ok: false, message: e.statusCode ? e.message : 'Không thể xử lý hồ sơ thuê. Vui lòng thử lại.' }); return true; }
}
