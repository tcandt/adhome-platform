export const memberRole = (person: any) => person?.documentRole === 'CO_REPRESENTATIVE' || !person?.documentRole && person?.relationToPrimary === 'OTHER' ? 'CO_REPRESENTATIVE' : 'HOUSEHOLD_MEMBER';

export function personOccupancy(person: any, primary: any) {
  return { relationToPrimary: memberRole(person) === 'CO_REPRESENTATIVE' ? 'OTHER' : 'FAMILY',
    notes: JSON.stringify({ secondaryContract: { role: memberRole(person), address: person.address || '',
      relationship: person.relationship || '', householdHeadOccupantId: person.householdHeadOccupantId || '',
      householdHeadName: person.householdHeadName || primary.fullName || '' } }) };
}

export function occupantPerson(occupant: any) {
  let secondary: any = {};
  try { secondary = JSON.parse(occupant.notes || '{}').secondaryContract || {}; } catch { /* Legacy free-text notes. */ }
  return { occupantId: occupant.id || '', fullName: occupant.fullName || '', phone: occupant.phone || '',
    idNumber: occupant.idNumber || '', birthDate: occupant.dateOfBirth || '', gender: occupant.gender || '',
    address: secondary.address || '', documentRole: occupant.relationToPrimary === 'PRIMARY' ? 'PRIMARY'
      : secondary.role === 'CO_REPRESENTATIVE' || occupant.relationToPrimary === 'OTHER' ? 'CO_REPRESENTATIVE' : 'HOUSEHOLD_MEMBER',
    ...(occupant.relationToPrimary !== 'PRIMARY' ? { relationship: secondary.relationship || '',
      householdHeadOccupantId: secondary.householdHeadOccupantId || '', householdHeadName: secondary.householdHeadName || '' } : {}) };
}

export function mergeRentalOccupants(profile: any, occupants: any[]) {
  const current = occupants.filter(o => !['MOVED_OUT', 'CANCELLED'].includes(o.occupancyStatus));
  const primary = current.find(o => o.relationToPrimary === 'PRIMARY');
  const matchesPerson = (p: any, occupant: any) => p.occupantId === occupant.id || occupant.idNumber && p.idNumber === occupant.idNumber
    || !p.idNumber && p.fullName?.trim() === occupant.fullName?.trim();
  const removed = occupants.filter(o => ['MOVED_OUT', 'CANCELLED'].includes(o.occupancyStatus));
  const members = (profile.members || []).filter((p: any) => !removed.some(o => matchesPerson(p, o)) || current.some(o => matchesPerson(p, o)));
  for (const occupant of current.filter(o => o.relationToPrimary !== 'PRIMARY')) {
    const index = members.findIndex((p: any) => matchesPerson(p, occupant));
    const person = occupantPerson(occupant);
    if (index < 0) members.push(person);
    else members[index] = { ...person, ...members[index], occupantId: person.occupantId,
      documentRole: members[index].documentRole || person.documentRole };
  }
  return { ...profile, tenant: { ...profile.tenant, ...(primary ? { occupantId: primary.id } : {}), documentRole: 'PRIMARY' }, members };
}
