import type { ConsoleRoomDto, ConsoleTenantDto } from '../types/portfolio';

// Include scheduled and active residents even when they have no separate CRM identity.
export function tenantDirectory(tenants: ConsoleTenantDto[], rooms: ConsoleRoomDto[]): ConsoleTenantDto[] {
  const rows = tenants.map(t => ({ ...t }));
  for (const room of rooms) for (const occupant of room.occupants || []) {
    if (!occupant.isActive && occupant.occupancyStatus !== 'SCHEDULED') continue;
    const contract = room.activeContracts?.find(c => c.id === occupant.contractId);
    const primaryId = occupant.tenantId || (occupant.relationToPrimary === 'PRIMARY' ? contract?.tenantId || (room.activeContract?.id === occupant.contractId ? room.currentTenant?.id : undefined) : undefined);
    const tenant = primaryId ? rows.find(t => t.id === primaryId && !t.occupantId) : undefined;
    if (tenant) {
      Object.assign(tenant, { occupantId: occupant.id, relationToPrimary: occupant.relationToPrimary,
        currentRoomId: room.id, currentRoomCode: room.code,
        primaryBuildingId: room.buildingId, buildingCode: room.buildingCode, buildingName: room.buildingName });
      continue;
    }
    rows.push({ id: `occupant:${occupant.id}`, occupantId: occupant.id, relationToPrimary: occupant.relationToPrimary,
      fullName: occupant.fullName, phone: occupant.phone || '', idNumber: occupant.idNumber || '', email: '', emergencyContact: '', notes: '',
      residenceRegStatus: occupant.residenceRegStatus, primaryBuildingId: room.buildingId, buildingCode: room.buildingCode,
      buildingName: room.buildingName, currentRoomId: room.id, currentRoomCode: room.code,
      activeContractCode: contract?.contractCode || (room.activeContract && room.activeContract.id === occupant.contractId ? room.activeContract.contractCode : null),
      activeContractEndDate: null, monthlyRentVnd: null, createdAt: room.updatedAt, updatedAt: room.updatedAt });
  }
  return rows;
}
