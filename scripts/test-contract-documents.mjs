import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/rental-tests/contractDocuments.cjs');
await build({ entryPoints: ['apps/landing/server/contractDocumentsApi.ts'], outfile: out, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const { handleContractDocuments } = require(out);
const profile = { tenant: { fullName: 'KHACH HOP DONG CU', phone: '0900000001', birthDate: '1995-05-20', idNumber: '000000000001', address: 'DIA CHI KHACH KIEM THU' }, landlord: { fullName: 'CHU NHA KIEM THU', idNumber: '000000000002', address: 'DIA CHI CHU NHA', phone: '0900000002' }, members: [], rentalAddress: 'CAN HO KIEM THU', signedDate: '2025-01-01', leaseTemplate: 'LEASE_1PN', durationText: '12 thang' };
const room = { id: 'room-1', orgId: 'org-1', buildingId: 'b1', code: 'QA-101', roomType: '2PN', building: { code: 'QA', name: 'TOA NHA KIEM THU', streetAddress: 'DIA CHI CAN HO' } };
const contracts = [{ id: 'old', orgId: 'org-1', buildingId: 'b1', contractCode: 'HD-OLD', status: 'TERMINATED', startDate: '2025-01-01', endDate: '2025-12-31', monthlyRentVnd: 4500000n, depositVnd: 4500000n, tenant: profile.tenant, occupants: [], room },
  { id: 'new', orgId: 'org-1', buildingId: 'b1', contractCode: 'HD-NEW', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRentVnd: 9000000n, depositVnd: 9000000n, tenant: { fullName: 'KHACH MOI', idNumber: '000000000003' }, occupants: [], room }];
const logs = [{ orgId: 'org-1', buildingId: 'b1', entityType: 'RENTAL_DOCUMENT', action: 'SAVE_RENTAL_PROFILE', entityId: 'old', metadata: structuredClone(profile) }];
let saved = 0;
const prisma = {
  $queryRaw: async () => [{ id: 'b1', landlord_profile: room.building.landlord || {} }],
  contract: { findFirst: async ({ where }) => contracts.find(c => c.id === where.id && c.orgId === where.orgId) || null },
  consoleAuditLog: { findFirst: async ({ where }) => [...logs].reverse().find(log => Object.entries(where).every(([key, value]) => log[key] === value)) || null,
    create: async ({ data }) => { saved++; logs.push(data); return data; } },
};
const admin = { orgId: 'org-1', role: 'ADMIN', id: 'qa', email: 'qa@example.test', permissions: [], buildingScopes: ['*'] };
async function call(id, method = 'GET', body, actor = admin, suffix = '') {
  let result; const headers = {};
  const response = { statusCode: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(value) { result = value; } };
  const url = new URL(`/api/v1/console/v2/contracts/${id}/document${suffix}`, 'http://test');
  const handled = await handleContractDocuments({ method, url: url.pathname + url.search }, response, url.pathname, prisma, actor, { readJsonBody: async () => body, sendJson(res, status, value) { res.statusCode = status; res.end(value); } });
  assert.equal(handled, true);
  return { status: response.statusCode, data: result, headers };
}
let result = await call('old');
assert.equal(result.status, 200); assert.equal(result.data.contract.contractCode, 'HD-OLD');
assert.equal(result.data.contract.monthlyRentVnd, 4500000); assert.equal(result.data.profile.tenant.fullName, 'KHACH HOP DONG CU');
assert.deepEqual(result.data.missing, []); assert.equal(saved, 0, 'viewing must not save a profile');
result = await call('new'); assert.equal(result.data.profile.tenant.fullName, 'KHACH MOI'); assert.equal(result.data.profile.leaseTemplate, 'LEASE_2PN');
assert.ok(result.data.missing.includes('Ngày lập / ký hợp đồng hợp lệ'), 'never invent a signing date for an existing contract');
assert.equal((await call('old', 'GET', undefined, { ...admin, orgId: 'other-org' })).status, 404);
assert.equal((await call('old', 'GET', undefined, { ...admin, role: 'STAFF', permissions: [] })).status, 403);
assert.equal((await call('old', 'GET', undefined, { ...admin, role: 'MANAGER', permissions: ['contracts.manage'], buildingScopes: ['another-building'] })).status, 403);
assert.equal((await call('new', 'POST', {})).status, 422);
assert.equal((await call('old', 'POST', { profile: { ...profile, signedDate: '2026-02-31' } })).status, 422);
result = await call('old', 'POST', { profile }, admin, '/profile'); assert.equal(result.status, 200); assert.equal(saved, 1);
assert.equal(contracts[0].monthlyRentVnd, 4500000n); assert.equal(contracts[0].status, 'TERMINATED');
room.building.landlord = { fullName: 'CHU NHA THEO TOA', idNumber: '000000000004', address: 'DIA CHI THEO TOA', bank: 'BANK QA', accountNumber: '0012345', accountName: 'CHU TK QA', phone: '0900000004' };
result = await call('new'); assert.equal(result.data.profile.landlord.fullName, 'CHU NHA THEO TOA'); assert.equal(result.data.profile.landlord.accountNumber, '0012345');
result = await call('old'); assert.equal(result.data.profile.landlord.fullName, profile.landlord.fullName, 'saved contract identity retains priority over new building defaults');
assert.equal(result.data.profile.landlord.idNumber, profile.landlord.idNumber);
console.log('PASS building owner prefill and historical contract identity priority');
console.log('PASS exact historical contract, prefilled profile, missing fields, real calendar dates, organization/building permissions and explicit profile-only save');
contracts[0].occupants.push({ id:'rep-1', fullName:'DAI DIEN KIEM THU', idNumber:'000000000013', dateOfBirth:'1994-02-03', gender:'Nam', relationToPrimary:'OTHER', occupancyStatus:'ACTIVE',
  notes: JSON.stringify({ secondaryContract:{ role:'CO_REPRESENTATIVE', address:'DIA CHI DAI DIEN' } }) },
  { id:'family-1', fullName:'THANH VIEN CUNG HO', idNumber:'000000000014', dateOfBirth:'2014-02-03', gender:'Nam', relationToPrimary:'FAMILY', occupancyStatus:'ACTIVE',
    notes:JSON.stringify({secondaryContract:{role:'HOUSEHOLD_MEMBER',relationship:'Con'}}) });
result=await call('old','GET',undefined,admin,'?occupantId=rep-1');
assert.equal(result.status,200);assert.equal(result.data.personIndex,1);assert.equal(result.data.profile.tenant.fullName,profile.tenant.fullName);
assert.equal(result.data.profile.members[0].documentRole,'CO_REPRESENTATIVE');assert.equal(result.data.profile.members[1].relationship,'Con');
assert.deepEqual(result.data.missing,[]);
assert.equal((await call('old','GET',undefined,admin,'?occupantId=family-1')).status,422);
assert.equal((await call('old','GET',undefined,admin,'?occupantId=foreign-id')).status,422);
assert.equal((await call('old','POST',{personIndex:99})).status,422);
assert.equal((await call('old','POST',{personIndex:-1})).status,422);
assert.equal((await call('old','POST',{personIndex:1.5})).status,422);
console.log('PASS secondary occupants merged into document profiles, stable representative selection, household and invalid selections blocked');
if (process.argv.includes('--pdf')) {
  await mkdir('.artifacts/contract-preview', { recursive: true });
  for (const template of ['LEASE_1PN', 'LEASE_2PN']) {
    result = await call('old', 'POST', { profile: { ...profile, leaseTemplate: template, monthlyRentVnd: 1, depositVnd: 1 } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.headers['content-type'], 'application/pdf'); assert.match(result.headers['content-disposition'], /^inline;.*HD-OLD\.pdf/);
    assert.equal(result.headers['cache-control'], 'private, no-store'); assert.equal(result.data.subarray(0, 5).toString(), '%PDF-');
    const pdf = await require('pdf-lib').PDFDocument.load(result.data); assert.ok(pdf.getPageCount() > 0);
    await writeFile(`.artifacts/contract-preview/${template}.pdf`, result.data);
    console.log(`PASS ${template}: actual filled Word converted to PDF, ${pdf.getPageCount()} pages`);
  }
  assert.equal(saved, 1, 'PDF previews must not save profiles implicitly');
  result=await call('old','POST',{occupantId:'rep-1',bundle:false});
  assert.equal(result.status,200,JSON.stringify(result.data));
  await writeFile('.artifacts/contract-preview/representative.pdf', result.data);
  assert.equal(saved,1);
  console.log('PASS actual PDF for selected representative without overwriting primary profile');
}
