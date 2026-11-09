const limits: Record<string, number> = {
  fullName: 150, birthDate: 10, address: 500, idNumber: 20, phone: 30,
  accountNumber: 50, bank: 150, accountName: 150,
};

// Parameterized reads also support backend processes with the previous generated client.
export async function readBuildingLandlords(db: any, orgId: string, ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const rows = await db.$queryRaw`SELECT id, landlord_profile FROM buildings WHERE org_id = ${orgId} AND id = ANY(${ids}::text[])`;
  return new Map<string, any>(rows.map((row: any) => [row.id, row.landlord_profile || {}]));
}

export async function writeBuildingLandlord(db: any, orgId: string, id: string, profile: Record<string, string>) {
  await db.$executeRaw`UPDATE buildings SET landlord_profile = ${JSON.stringify(profile)}::jsonb WHERE org_id = ${orgId} AND id = ${id}`;
}

export function normalizeBuildingLandlord(value: unknown, existing: any = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Thông tin chủ nhà không hợp lệ.'), { statusCode: 422 });
  }
  const result: Record<string, string> = {};
  for (const [key, limit] of Object.entries(limits)) {
    const input = (value as Record<string, unknown>)[key];
    if (input !== undefined && (typeof input !== 'string' || input.length > limit)) {
      throw Object.assign(new Error('Thông tin chủ nhà phải là văn bản và không vượt quá độ dài cho phép.'), { statusCode: 422 });
    }
    result[key] = input === undefined ? String(existing?.[key] || '') : (input as string).trim();
  }
  if (result.idNumber && !/^(\d{9}|\d{12})$/.test(result.idNumber)) {
    throw Object.assign(new Error('CCCD chủ nhà cần 12 chữ số hoặc CMND cũ 9 chữ số.'), { statusCode: 422 });
  }
  if (result.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.birthDate) || !Number.isFinite(Date.parse(result.birthDate)) || new Date(result.birthDate).toISOString().slice(0, 10) !== result.birthDate)) {
    throw Object.assign(new Error('Ngày sinh chủ nhà không hợp lệ.'), { statusCode: 422 });
  }
  return result;
}

// A configured building replaces legacy defaults; saved contract values retain priority.
export function resolveBuildingLandlord(building: any, legacy: any = {}, saved: any = {}) {
  const configured = building.landlord && typeof building.landlord === 'object' && !Array.isArray(building.landlord) && Object.keys(building.landlord).length > 0;
  const defaults = configured ? building.landlord : legacy;
  return { ...defaults, ...Object.fromEntries(Object.entries(saved || {}).filter(([, value]) => typeof value === 'string' && value.trim())) };
}
