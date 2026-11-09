/** Retain the newest 30 × 20 records per organization for each audit stream. */
export async function pruneConsoleAuditHistory(prisma: any) {
  const business = await prisma.$executeRaw`
    DELETE FROM console_audit_logs AS target
    USING (
      SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at DESC, id DESC) AS row_number
      FROM console_audit_logs
      WHERE entity_type <> 'RENTAL_DOCUMENT'
    ) AS ranked
    WHERE target.id = ranked.id AND ranked.row_number > 600
  `;
  const login = await prisma.$executeRaw`
    DELETE FROM console_login_audit AS target
    USING (
      SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at DESC, id DESC) AS row_number
      FROM console_login_audit
    ) AS ranked
    WHERE target.id = ranked.id AND ranked.row_number > 600
  `;
  return { business, login };
}
