function parseRegistration(text) {
  const trimmed = String(text || '').trim();
  const match = /^(?:(?:DK|DANGKY|DANG\s*KY|ĐK|ĐĂNG\s*KÝ)\s+)?(.+)$/i.exec(trimmed);
  if (!match || !match[1]) return null;
  const rawArgs = match[1].trim();
  const phoneRegex = /(?:\+?84|0)(\d{9})\b/g;
  const phones = [];
  let phoneMatch;
  while ((phoneMatch = phoneRegex.exec(rawArgs)) !== null) {
    phones.push('0' + phoneMatch[1]);
  }
  if (!phones.length) return null;
  const uniquePhones = Array.from(new Set(phones));

  const remaining = rawArgs.replace(/(?:\+?84|0)\d{9}\b/g, '').replace(/[,;/]+/g, ' ').trim();
  const tokens = remaining.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const roomCode = tokens[0].toUpperCase();
  if (roomCode.length > 64) return null;
  const contractCode = tokens[1] ? tokens[1].toUpperCase() : undefined;

  return {
    roomCode,
    phone: uniquePhones[0],
    phones: uniquePhones,
    ...(contractCode ? { contractCode } : {}),
  };
}

async function processRegistration(client, { inboxId, oaId, zaloUid, text }) {
  if (!/^(?:DK|DANGKY|DANG\s*KY|ĐK|ĐĂNG\s*KÝ)(?:\s|$)/i.test(String(text || '').trim())) return null;
  const input = parseRegistration(text);
    const previous = await client.query('SELECT status FROM zalo_registration_attempts WHERE inbox_id = $1', [inboxId]);
    if (previous.rowCount) {
      return previous.rows[0].status;
    }

    let status = input ? 'UNAVAILABLE' : 'INVALID_FORMAT';
    let tenantId = null;
    if (input && zaloUid) {
      const tables = await client.query("SELECT to_regclass('public.contracts') AS contracts, to_regclass('public.tenants') AS tenants, to_regclass('public.console_rooms') AS rooms");
      if (tables.rows[0].contracts && tables.rows[0].tenants && tables.rows[0].rooms) {
        const matches = await client.query(
          `SELECT DISTINCT t.id FROM contracts c
             JOIN tenants t ON t.id = c.tenant_id AND t.org_id = c.org_id
             JOIN console_rooms r ON r.id = c.room_id AND r.org_id = c.org_id
            WHERE upper(r.code) = $1 AND t.normalized_phone = $2
              AND t.is_active = true AND c.status IN ('ACTIVE', 'EXPIRING', 'EXTENDED')
              AND c.start_date <= current_date::text AND c.end_date >= current_date::text
            LIMIT 2`,
          [input.roomCode, input.phone],
        );
        if (matches.rowCount === 0) status = 'NO_MATCH';
        else if (matches.rowCount > 1) status = 'AMBIGUOUS';
        else {
          tenantId = matches.rows[0].id;
          const existing = await client.query('SELECT tenant_id, zalo_uid FROM zalo_resident_links WHERE oa_id = $1 AND (zalo_uid = $2 OR tenant_id = $3) FOR UPDATE', [oaId, zaloUid, tenantId]);
          if (existing.rows.some(row => row.zalo_uid === zaloUid && row.tenant_id === tenantId)) status = 'ALREADY_VERIFIED';
          else if (existing.rowCount) status = 'CONFLICT';
          else {
            const inserted = await client.query('INSERT INTO zalo_resident_links (oa_id, zalo_uid, tenant_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id', [oaId, zaloUid, tenantId]);
            status = inserted.rowCount ? 'VERIFIED' : 'CONFLICT';
          }
        }
      }
    }
    await client.query('INSERT INTO zalo_registration_attempts (inbox_id, status, tenant_id) VALUES ($1,$2,$3)', [inboxId, status, tenantId]);
    return status;
}

module.exports = { parseRegistration, processRegistration };
