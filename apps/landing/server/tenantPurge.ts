import { Prisma, type PrismaClient } from '@prisma/client';
import { isBuildingAllowedForActor, type AuthoritativeConsoleActor } from './authRbac';
import { purgePrivateDocuments } from './privateDocuments';
import { purgePaymentProofs } from './paymentProofApi';

const pendingReservations = ['PENDING', 'CONFIRMED'];
const literalPrefix = (prefix: string) => ({ startsWith: prefix.replace(/[\\%_]/g, '\\$&') });
function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

// Zalo stores notification rows in the Console database on installations with its schema applied.
async function purgeZaloRecords(tx: Prisma.TransactionClient, keys: {
  invoiceIds: string[]; contractIds: string[]; paymentIds: string[]; removedTenantIds: string[];
}) {
  const { invoiceIds, contractIds, paymentIds, removedTenantIds } = keys;
  const [tables] = await tx.$queryRaw<Array<{
    residentOutbox: boolean; adminOutbox: boolean; botLinks: boolean; oaLinks: boolean;
  }>>`SELECT to_regclass('zalo_bot_resident_outbox') IS NOT NULL AS "residentOutbox",
    to_regclass('zalo_bot_admin_outbox') IS NOT NULL AS "adminOutbox",
    to_regclass('zalo_bot_resident_links') IS NOT NULL AS "botLinks",
    to_regclass('zalo_resident_links') IS NOT NULL AS "oaLinks"`;
  if (tables.residentOutbox) {
    await tx.$executeRaw`DELETE FROM zalo_bot_resident_outbox WHERE tenant_id = ANY(${removedTenantIds}::text[])
      OR (event_type IN ('INVOICE_ISSUED', 'RENT_NOTICE', 'METER_NOTICE') AND split_part(event_key, ':', 3) = ANY(${invoiceIds}::text[]))
      OR (event_type = 'CONTRACT_EXPIRING' AND split_part(event_key, ':', 3) = ANY(${contractIds}::text[]))
      OR (event_type = 'PAYMENT_CONFIRMED' AND split_part(event_key, ':', 3) = ANY(${paymentIds}::text[]))`;
  }
  if (tables.adminOutbox && paymentIds.length) {
    await tx.$executeRaw`DELETE FROM zalo_bot_admin_outbox WHERE event_type = 'ADMIN_PAYMENT_ALERT'
      AND split_part(event_key, ':', 3) = ANY(${paymentIds}::text[])`;
  }
  if (tables.botLinks && removedTenantIds.length) {
    await tx.$executeRaw`DELETE FROM zalo_bot_resident_links WHERE tenant_id = ANY(${removedTenantIds}::text[])`;
  }
  if (tables.oaLinks && removedTenantIds.length) {
    await tx.$executeRaw`DELETE FROM zalo_resident_links WHERE tenant_id = ANY(${removedTenantIds}::text[])`;
  }
}

export async function purgeRoomTenant(
  prisma: PrismaClient,
  actor: AuthoritativeConsoleActor,
  roomId: string,
  target: { kind: 'occupant' | 'contract' | 'reservation'; id: string },
  activeStatuses: readonly string[],
) {
  if (actor.role !== 'ADMIN') fail(403, 'Chỉ quản trị viên được xóa khách thuê.');
  const orgId = actor.orgId;
  const room = await prisma.consoleRoom.findFirst({ where: { id: roomId, orgId }, include: { building: true } });
  if (!room || !isBuildingAllowedForActor(actor, room.buildingId, room.building.code)) fail(404, 'Không tìm thấy phòng.');
  const { buildingId } = room;
  const scope = { orgId, buildingId };
  const occupantScope = { orgId, room: { orgId, buildingId } };
  const live = { OR: [{ isActive: true }, { occupancyStatus: 'SCHEDULED' }] };
  const auditKey = { ...scope, entityType: 'TENANT_PURGE', entityId: target.id, action: 'PURGE_ROOM_TENANT' };

  const cleanup = await prisma.$transaction(async tx => {
    const previous = await tx.consoleAuditLog.findFirst({ where: { ...auditKey, AND: [
      { metadata: { path: ['roomId'], equals: roomId } }, { metadata: { path: ['kind'], equals: target.kind } },
    ] } });
    if (previous) {
      const metadata = previous.metadata as { contractIds?: string[]; paymentIds?: string[] };
      return { auditId: previous.id, contractIds: metadata.contractIds || [], paymentIds: metadata.paymentIds || [] };
    }

    const anchor = { orgId, roomId, id: target.id };
    const occupant = target.kind === 'occupant'
      ? await tx.roomOccupant.findFirst({ where: { ...anchor, ...live } }) : null;
    const draft = target.kind === 'contract'
      ? await tx.contract.findFirst({ where: { ...anchor, buildingId, status: 'DRAFT' } }) : null;
    const reservation = target.kind === 'reservation'
      ? await tx.roomReservation.findFirst({ where: { ...anchor, buildingId, status: { in: pendingReservations } } }) : null;
    const resident = occupant || draft || reservation;
    if (!resident) fail(404, 'Khách thuê đã thay đổi. Vui lòng tải lại hồ sơ phòng.');
    const legacyContract = !resident.tenantId && occupant?.relationToPrimary === 'PRIMARY' && occupant.contractId
      ? await tx.contract.findFirst({ where: { ...scope, roomId, id: occupant.contractId }, select: { tenantId: true } }) : null;
    const tenantId = resident.tenantId || legacyContract?.tenantId;

    const contracts = tenantId ? await tx.contract.findMany({ where: { ...scope, tenantId } }) : [];
    const contractIds = contracts.map(item => item.id);
    const linkedReservationIds = contracts.flatMap(item => item.reservationId ? [item.reservationId] : []);
    const reservations = await tx.roomReservation.findMany({ where: { ...scope, OR: [
      ...(tenantId ? [{ tenantId }] : []),
      { id: { in: linkedReservationIds }, tenantId: null },
      ...(reservation ? [{ id: reservation.id }] : []),
    ], contracts: { none: { id: { notIn: contractIds } } } } });
    const reservationIds = reservations.map(item => item.id);
    if (reservation && !reservationIds.includes(reservation.id)) fail(409, 'Phiếu giữ chỗ đang liên kết với hợp đồng khác.');

    const occupants = await tx.roomOccupant.findMany({ where: { ...occupantScope, OR: [
      { contractId: { in: contractIds } },
      ...(tenantId ? [{ tenantId }] : []),
      ...(occupant ? [{ id: occupant.id }] : []),
    ] } });
    const occupantIds = occupants.map(item => item.id);
    const invoices = await tx.invoice.findMany({ where: { ...scope, OR: [
      { contractId: { in: contractIds } },
      ...(tenantId ? [{ tenantId, contractId: null }] : []),
    ] } });
    const invoiceIds = invoices.map(item => item.id);
    const deposits = await tx.deposit.findMany({ where: { orgId, OR: [
      { contractId: { in: contractIds } }, { reservationId: { in: reservationIds }, contractId: null },
    ] } });
    const depositIds = deposits.map(item => item.id);
    if (await tx.deposit.count({ where: { orgId, id: { notIn: depositIds }, transferredToDepositId: { in: depositIds } } })) {
      fail(409, 'Tiền cọc đang liên kết với hồ sơ khác. Kiểm tra lại khoản chuyển cọc trước khi xóa.');
    }
    const payments = await tx.paymentTransaction.findMany({ where: { orgId, OR: [
      { invoiceId: { in: invoiceIds } },
      { buildingId, invoiceId: null, idempotencyKey: { in: reservationIds.flatMap(id => [`pay-resv-${id}`, `pay-confirm-${id}`]) } },
    ] } });
    const paymentIds = payments.map(item => item.id);
    const webhookEvents = payments.flatMap(item => {
      const match = /^webhook:([^:]+):(.+)$/.exec(item.idempotencyKey);
      return match ? [{ connectionId: match[1], eventKey: match[2] }] : [];
    });

    // Legacy ledger records identify the source by its code in a system-generated description.
    const ledgerLinks: Prisma.LedgerEntryWhereInput[] = [
      ...invoices.flatMap(({ invoiceCode }) => [
        { category: 'Thu tiền hóa đơn phòng', description: literalPrefix(`Thu tiền hóa đơn ${invoiceCode} phòng `) },
        { category: 'Thu tiền hóa đơn phòng', description: literalPrefix(`SePay tự động đối soát hóa đơn ${invoiceCode} phòng `) },
      ]),
      ...contracts.flatMap(({ contractCode }) => [
        { category: 'Cọc hợp đồng', description: literalPrefix(`Thu tiền cọc hợp đồng ${contractCode} - `) },
        { category: 'REFUND_DEPOSIT', description: literalPrefix(`Phiếu chi hoàn tiền cọc thanh lý HĐ ${contractCode} (Phòng `) },
      ]),
      ...reservations.flatMap(({ reservationCode }) => [
        { entryCode: `PT-${reservationCode}` },
        { category: 'Cọc giữ chỗ', description: literalPrefix(`Thu tiền cọc giữ chỗ ${reservationCode} - `) },
        { category: 'Cọc giữ chỗ', description: literalPrefix(`Xác nhận thu tiền cọc giữ chỗ ${reservationCode} - `) },
        { category: 'Hoàn tiền cọc', description: literalPrefix(`Hoàn cọc giữ chỗ ${reservationCode} cho khách `) },
      ]),
      ...[...contracts.map(item => item.contractCode), ...reservations.map(item => item.reservationCode)].flatMap(code => [
        { category: 'Hoàn tiền cọc', description: `Hoàn tiền cọc ${code}` },
        { category: 'Khấu trừ tiền cọc', description: literalPrefix(`Khấu trừ cọc ${code}: `) },
      ]),
    ];

    const affectedRoomIds = [...new Set([roomId, ...contracts.map(item => item.roomId),
      ...reservations.map(item => item.roomId), ...occupants.map(item => item.roomId)])].sort();
    await tx.$queryRaw`SELECT id FROM console_rooms WHERE org_id = ${orgId} AND building_id = ${buildingId}
      AND id IN (${Prisma.join(affectedRoomIds)}) ORDER BY id FOR UPDATE`;

    const sharedContractIds = [...new Set(occupants.flatMap(item => item.contractId && !contractIds.includes(item.contractId) ? [item.contractId] : []))];
    const sharedContracts = await tx.contract.findMany({ where: { ...scope, id: { in: sharedContractIds } } });
    for (const contract of sharedContracts) {
      const removed = occupants.filter(item => item.contractId === contract.id);
      const profiles = await tx.consoleAuditLog.findMany({ where: { ...scope, entityType: 'RENTAL_DOCUMENT', entityId: contract.id, action: 'SAVE_RENTAL_PROFILE' } });
      for (const log of profiles) {
        const profile = log.metadata as Prisma.JsonObject | null;
        if (!profile || !Array.isArray(profile.members)) continue;
        const members = profile.members.filter(person => {
          if (!person || typeof person !== 'object' || Array.isArray(person)) return true;
          return !removed.some(item => person.occupantId ? person.occupantId === item.id
            : item.idNumber && person.idNumber === item.idNumber ||
              !person.idNumber && person.fullName === item.fullName && (person.phone || '') === (item.phone || ''));
        });
        if (members.length !== profile.members.length) {
          await tx.consoleAuditLog.update({ where: { id: log.id }, data: { metadata: { ...profile, members } as Prisma.InputJsonObject } });
        }
      }
    }

    // Keep the deduplication identity so a provider retry cannot recreate a deleted payment.
    if (webhookEvents.length) await tx.paymentWebhookEvent.updateMany({ where: { connection: { orgId }, OR: webhookEvents }, data: {
      payloadEncrypted: Prisma.JsonNull, amountVnd: null,
    } });
    await tx.paymentTransaction.deleteMany({ where: { orgId, id: { in: paymentIds } } });
    await tx.invoice.deleteMany({ where: { ...scope, id: { in: invoiceIds } } });
    await tx.deposit.deleteMany({ where: { orgId, id: { in: depositIds } } });
    await tx.ledgerEntry.deleteMany({ where: { ...scope, OR: ledgerLinks } });
    await tx.roomOccupant.deleteMany({ where: { ...occupantScope, id: { in: occupantIds } } });
    await tx.contract.deleteMany({ where: { ...scope, id: { in: contractIds } } });
    await tx.roomReservation.deleteMany({ where: { ...scope, id: { in: reservationIds } } });

    for (const contract of sharedContracts) {
      if (!['DRAFT', ...activeStatuses].includes(contract.status)) continue;
      const remaining = await tx.roomOccupant.count({ where: { orgId, contractId: contract.id, ...live } });
      await tx.contract.update({ where: { id: contract.id }, data: { occupantsCount: Math.max(1, remaining) } });
    }

    const removedTenantIds: string[] = [];
    for (const id of new Set([tenantId, ...occupants.map(item => item.tenantId)])) {
      if (!id) continue;
      const tenant = await tx.tenant.findFirst({ where: { id, orgId } });
      if (!tenant) continue;
      const [remainingContracts, remainingReservations, remainingInvoices, remainingOccupants, currentRoom] = await Promise.all([
        tx.contract.findMany({ where: { orgId, tenantId: id }, orderBy: { createdAt: 'desc' } }),
        tx.roomReservation.findMany({ where: { orgId, tenantId: id }, orderBy: { createdAt: 'desc' } }),
        tx.invoice.findFirst({ where: { orgId, tenantId: id }, orderBy: { createdAt: 'desc' } }),
        tx.roomOccupant.findMany({ where: { orgId, tenantId: id }, include: { room: true }, orderBy: { createdAt: 'desc' } }),
        tenant.currentRoomId ? tx.consoleRoom.findFirst({ where: { orgId, id: tenant.currentRoomId } }) : null,
      ]);
      const otherBuilding = currentRoom && currentRoom.buildingId !== buildingId ? currentRoom.buildingId
        : tenant.primaryBuildingId && tenant.primaryBuildingId !== buildingId ? tenant.primaryBuildingId : null;
      const remainingBuilding = remainingContracts[0]?.buildingId || remainingOccupants[0]?.room.buildingId ||
        remainingReservations[0]?.buildingId || remainingInvoices?.buildingId || otherBuilding;
      if (!remainingBuilding) {
        await tx.tenant.delete({ where: { id } });
        removedTenantIds.push(id);
        continue;
      }
      if (currentRoom?.buildingId === buildingId && affectedRoomIds.includes(currentRoom.id)) {
        const activeContract = remainingContracts.find(item => activeStatuses.includes(item.status));
        const activeOccupant = remainingOccupants.find(item => item.isActive);
        await tx.tenant.update({ where: { id }, data: {
          currentRoomId: activeContract?.roomId || activeOccupant?.roomId || null,
          primaryBuildingId: activeContract?.buildingId || activeOccupant?.room.buildingId || remainingBuilding,
        } });
      } else if (tenant.primaryBuildingId === buildingId && remainingBuilding !== buildingId) {
        await tx.tenant.update({ where: { id }, data: { primaryBuildingId: remainingBuilding } });
      }
    }

    for (const id of affectedRoomIds) {
      const affectedRoom = await tx.consoleRoom.findFirst({ where: { ...scope, id } });
      if (!affectedRoom) continue;
      const [active, draft, pending, resident] = await Promise.all([
        tx.contract.count({ where: { ...scope, roomId: id, status: { in: [...activeStatuses] } } }),
        tx.contract.count({ where: { ...scope, roomId: id, status: 'DRAFT' } }),
        tx.roomReservation.count({ where: { ...scope, roomId: id, status: { in: pendingReservations } } }),
        tx.roomOccupant.count({ where: { orgId, roomId: id, isActive: true } }),
      ]);
      const occupancyStatus = ['MAINTENANCE', 'ARCHIVED'].includes(affectedRoom.occupancyStatus) ? affectedRoom.occupancyStatus
        : active || resident ? 'OCCUPIED' : draft || pending ? 'RESERVED' : 'AVAILABLE';
      await tx.consoleRoom.update({ where: { id }, data: { occupancyStatus } });
      if (affectedRoom.publicListingId) {
        await tx.publicRoomListing.update({ where: { id: affectedRoom.publicListingId }, data: {
          status: occupancyStatus, currentTenantName: null, currentTenantPhone: null,
        } });
      }
    }

    await purgeZaloRecords(tx, { invoiceIds, contractIds, paymentIds, removedTenantIds });
    const deletedIds = [...occupantIds, ...contractIds, ...reservationIds, ...depositIds, ...invoiceIds, ...paymentIds, ...removedTenantIds];
    const deletedResponse = JSON.stringify({ ok: false, errorCode: 'RENTAL_DATA_REMOVED', message: 'Hồ sơ khách thuê đã bị xóa.' });
    // Retain the request key while invalidating the cached payload of a deleted business record.
    await tx.$executeRaw`UPDATE idempotency_records SET response_status = 410, response_body = ${deletedResponse}::jsonb, updated_at = now()
      WHERE org_id = ${orgId} AND status = 'SUCCEEDED' AND EXISTS (
        SELECT 1 FROM jsonb_path_query(response_body, '$.**.id') AS linked(id)
        WHERE linked.id #>> '{}' = ANY(${deletedIds}::text[])
      )`;
    await tx.consoleAuditLog.deleteMany({ where: { ...scope, OR: [
      ...(tenantId ? [{ entityType: 'TENANT', entityId: tenantId }] : []),
      { entityType: 'OCCUPANT', entityId: { in: occupantIds } },
      { entityType: { in: ['CONTRACT', 'RENTAL_DOCUMENT'] }, entityId: { in: contractIds } },
      { entityType: { in: ['RESERVATION', 'RENTAL_DOCUMENT'] }, entityId: { in: reservationIds } },
      { entityType: 'DEPOSIT', entityId: { in: depositIds } },
      { entityType: 'INVOICE', entityId: { in: invoiceIds } },
      { entityType: 'PAYMENT_TRANSACTION', entityId: { in: paymentIds } },
    ] } });
    const audit = await tx.consoleAuditLog.create({ data: { ...auditKey, actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
      summary: 'Xóa dữ liệu khách thuê khỏi tòa nhà', metadata: { roomId, kind: target.kind, contractIds, paymentIds } } });
    return { auditId: audit.id, contractIds, paymentIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });

  if (!cleanup.contractIds.length && !cleanup.paymentIds.length) return;
  try {
    await Promise.all([
      ...cleanup.contractIds.map(id => purgePrivateDocuments(orgId, id)),
      ...cleanup.paymentIds.map(purgePaymentProofs),
    ]);
    await prisma.consoleAuditLog.update({ where: { id: cleanup.auditId }, data: { metadata: { roomId, kind: target.kind } } });
  } catch {
    fail(503, 'Đã xóa dữ liệu trong cơ sở dữ liệu. Hãy thử lại để hoàn tất xóa tệp đính kèm.');
  }
}
