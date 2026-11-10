const PUBLIC_ROOM_COLUMNS = `id, slug, room_code AS "roomCode", short_title AS "shortTitle",
  title, room_type AS "roomType", building_id AS "buildingId",
  building_code AS "buildingCode", building_name AS "buildingName",
  building_address AS "buildingAddress", floor_number AS "floorNumber",
  floor_name AS "floorName", area, price, currency,
  deposit_months AS "depositMonths", max_occupants AS "maxOccupants",
  status, available_from AS "availableFrom",
  available_from_label AS "availableFromLabel",
  short_description AS "shortDescription",
  detailed_description AS "detailedDescription", amenities,
  furnished_level AS "furnishedLevel", furnished_label AS "furnishedLabel",
  images, service_fees AS "serviceFees", featured,
  display_order AS "displayOrder", is_public AS "isPublic",
  source_verified AS "sourceVerified", updated_at AS "updatedAt"`;

async function getPublicRooms(pool, orgId) {
  const org = await pool.query(
    'SELECT catalog_version, updated_at FROM organizations WHERE id = $1 AND is_active = true',
    [orgId],
  );
  if (!org.rowCount) return null;
  const [buildings, floors, listings] = await Promise.all([
    pool.query('SELECT id, code, name, street_address FROM buildings WHERE org_id = $1 AND is_active = true ORDER BY display_order', [orgId]),
    pool.query('SELECT building_id FROM floors WHERE org_id = $1', [orgId]),
    pool.query(`SELECT ${PUBLIC_ROOM_COLUMNS} FROM public_room_listings WHERE org_id = $1 AND is_public = true ORDER BY display_order`, [orgId]),
  ]);
  const rooms = listings.rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  const latest = rooms.reduce((max, room) => Math.max(max, Date.parse(room.updatedAt)), org.rows[0].updated_at.getTime());
  return {
    ok: true,
    orgId,
    sourceVerified: true,
    storageEngine: 'postgresql',
    catalogVersion: org.rows[0].catalog_version,
    updatedAt: new Date(latest).toISOString(),
    buildings: buildings.rows.map(building => ({
      id: building.id,
      code: building.code,
      name: building.name,
      address: building.street_address,
      floorCount: floors.rows.filter(floor => floor.building_id === building.id).length,
      roomCount: rooms.filter(room => room.buildingId === building.id).length,
    })),
    rooms,
  };
}

module.exports = { getPublicRooms };
