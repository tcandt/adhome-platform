import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(resolve('apps/landing/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const out = resolve('apps/landing/node_modules/.cache/rental-tests');
await mkdir(out, { recursive: true });
await build({entryPoints:['apps/landing/server/rentalFinance.ts','apps/landing/server/rentalDocuments.ts','apps/landing/server/consoleBusinessApi.ts'],outdir:out,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'});
const { availableDeposit, rentalSettlement, allocateInitialReceipt } = require(resolve(out,'rentalFinance.js'));
const { renderRentalDocx, convertRentalPdf, compiledResidencePdf } = require(resolve(out,'rentalDocuments.js'));
const { handleConsoleV2Api } = require(resolve(out,'consoleBusinessApi.js'));
assert.equal(availableDeposit({ paidAmountVnd:2000000n,refundedVnd:200000n,deductedAmountVnd:100000n,forfeitedAmountVnd:300000n,transferredAmountVnd:400000n }),1000000);
assert.equal(availableDeposit({paidAmountVnd:2000000n,paymentStatus:'TRANSFERRED'}),0);
for(const [b,n,credit,pending] of [[0,9000000,0,0],[2000000,7000000,0,0],[4500000,4500000,0,0],[6000000,3000000,0,0],[10000000,0,1000000,0]]){
 const q=rentalSettlement(b,4500000,4500000,'RENT_CREDIT'); assert.equal(q.totalInitialInvoiceDue,n);assert.equal(q.remainingSurplusCreditVnd,credit);assert.equal(q.pendingRefundVnd,pending);
 assert.equal(b,q.transferredDepositVnd+q.appliedRentCreditVnd+q.remainingSurplusCreditVnd);
}
assert.equal(rentalSettlement(6000000,4500000,4500000,'REFUND').pendingRefundVnd,1500000);
let deposit={id:'d1',amountVnd:4500000n,paidAmountVnd:2000000n};
const fakeTx={$executeRaw:async()=>0,deposit:{findFirst:async()=>deposit,update:async({data})=>Object.assign(deposit,data)}};
const inv={contractId:'ct',policySnapshot:{type:'FIRST_COMBINED_INVOICE',financialSummary:{additionalDepositDue:2500000}}};
await allocateInitialReceipt(fakeTx,inv,1000000);assert.equal(deposit.paidAmountVnd,3000000n);
await allocateInitialReceipt(fakeTx,inv,5000000);assert.equal(deposit.paidAmountVnd,4500000n);
await allocateInitialReceipt(fakeTx,inv,5000000);assert.equal(deposit.paidAmountVnd,4500000n);
assert.throws(()=>rentalSettlement(-1,1,1,'REFUND'));
console.log('PASS financial conservation: six settlement cases, disposed buckets, partial receipt allocation and retry');

let id=0;let store={room:{id:'test-room',orgId:'test-org',buildingId:'b1',code:'QA-101',listPriceVnd:4500000n,maxOccupants:4,occupancyStatus:'AVAILABLE',electricRateVnd:3800,waterRateVnd:15000,waterBillingMethod:'PER_M3',building:{id:'b1',code:'QA',name:'Tòa nhà kiểm thử',streetAddress:'Địa chỉ kiểm thử',electricRateVnd:3800,waterRateVnd:15000,waterBillingMethod:'PER_M3'}},reservations:[],contracts:[],deposits:[],invoices:[],tenants:[],occupants:[],logs:[],ledger:[],payments:[],idem:[]};
function matches(row,where={}){return Object.entries(where).every(([k,v])=> v&&typeof v==='object' ? ('in' in v ? v.in.includes(row[k]) : 'not' in v ? row[k]!==v.not : k==='orgId_action_idempotencyKey' ? matches(row,v) : true) : row[k]===v)}
const crud=(key)=>({
 findUnique:async({where})=>store[key].find(x=>matches(x,where))||null,
 findFirst:async({where})=>store[key].find(x=>matches(x,where))||null,
 findMany:async({where}={})=>store[key].filter(x=>matches(x,where)),
 count:async({where})=>store[key].filter(x=>matches(x,where)).length,
 create:async({data})=>{if(key==='idem'&&store.idem.some(x=>x.orgId===data.orgId&&x.action===data.action&&x.idempotencyKey===data.idempotencyKey)) throw new Error('unique');const row={id:`id-${++id}`,refundedVnd:0n,deductedAmountVnd:0n,forfeitedAmountVnd:0n,transferredAmountVnd:0n,transferredToDepositId:null,...data};store[key].push(row);return row},
 update:async({where,data})=>Object.assign(store[key].find(x=>matches(x,where)),data),
 updateMany:async()=>({count:0}),
 deleteMany:async({where})=>{store[key]=store[key].filter(x=>!matches(x,where));return {count:1}},
 aggregate:async({where})=>({_sum:{paidAmountVnd:store[key].filter(x=>matches(x,where)).reduce((s,x)=>s+Number(x.paidAmountVnd),0)}})
});
const prisma={publicRoomListing:{updateMany:async()=>({}),findMany:async()=>[],update:async()=>({})},organization:{findMany:async()=>[],findUnique:async()=>({defaultElectricRateVnd:3800,defaultWaterRateVnd:15000})},
 consoleRoom:{findUnique:async()=>store.room,update:async({data})=>Object.assign(store.room,data)},
 roomReservation:crud('reservations'),contract:crud('contracts'),deposit:crud('deposits'),invoice:crud('invoices'),tenant:crud('tenants'),roomOccupant:crud('occupants'),consoleAuditLog:crud('logs'),ledgerEntry:crud('ledger'),paymentTransaction:crud('payments'),idempotencyRecord:crud('idem'),
 $queryRaw:async()=>[{id:'b1',landlord_profile:{}}],$executeRaw:async()=>0,$transaction:async fn=>{const before=structuredClone(store);try{return await fn(prisma)}catch(e){store=before;throw e}}};
// Minimal relation hydration to exercise the actual API without touching a database.
for(const [model,key] of [['roomReservation','reservations'],['contract','contracts']]){
 const original=prisma[model].findUnique;const list=prisma[model].findMany;
 const hydrate=row=>row&&({...row,room:store.room,deposits:store.deposits.filter(d=>d[model==='contract'?'contractId':'reservationId']===row.id),tenant:store.tenants.find(t=>t.id===row.tenantId),occupants:store.occupants.filter(o=>o.contractId===row.id),invoices:store.invoices.filter(i=>i.contractId===row.id)});
 prisma[model].findUnique=async opts=>hydrate(await original(opts));prisma[model].findMany=async opts=>(await list(opts)).reverse().map(hydrate);
}
const findInvoice=prisma.invoice.findUnique; prisma.invoice.findUnique=async opts=>{ const row=await findInvoice(opts); return row&&{...row,building:store.room.building,room:store.room,tenant:store.tenants.find(t=>t.id===row.tenantId)} };
const {Readable}=await import('node:stream');
const actor={id:'qa',orgId:'test-org',role:'ADMIN',email:'qa@example.test',permissions:[],buildingScopes:['*']};
async function call(path,body,who=actor,key){const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.method=body===undefined?'GET':'POST';req.headers=key?{'idempotency-key':key}:{};let value;const res={statusCode:200,setHeader(){},end(s){try{value=JSON.parse(s)}catch{value=s}}};const pathname='/api/v1/console/v2/'+path;await handleConsoleV2Api(req,res,pathname,new URL('http://test'+pathname),prisma,who,'qa',{});return {status:res.statusCode,data:value}}
const profile={tenant:{fullName:'KHÁCH KIỂM THỬ',phone:'0900000001',birthDate:'1995-05-20',gender:'Nam',idNumber:'000000000001',address:'Địa chỉ kiểm thử'},members:[],landlord:{fullName:'CHỦ NHÀ KIỂM THỬ',idNumber:'000000000002',birthDate:'1980-01-01',phone:'0900000002',address:'Địa chỉ chủ nhà kiểm thử',accountName:'KIEM THU',accountNumber:'000000',bank:'Ngân hàng kiểm thử'},rentalAddress:'Căn hộ kiểm thử',signedDate:'2026-11-03',authority:'Công an phường kiểm thử',durationText:'12 tháng',rentWords:'Bốn triệu năm trăm nghìn đồng',depositWords:'Hai triệu đồng',leaseTemplate:'LEASE_1PN'};
const start={intent:'HOLD',depositVnd:2000000,paidAmountVnd:2000000,monthlyRentVnd:4500000,startDate:'2026-11-05',endDate:'2027-11-04',holdDays:7,documentProfile:profile};
assert.equal((await call('rental-workflow/test-room/start',start)).status,201);const reservationId=store.reservations[0].id;
assert.equal(store.ledger.length,1);
assert.equal((await call('rental-workflow/test-room/start',start)).status,409,'duplicate hold blocked');
assert.equal((await call('rental-workflow/test-room',undefined,{...actor,orgId:'foreign'})).status,404,'organization isolation');
let result=await call(`reservations/${reservationId}/cancel`,{refundAmountVnd:1200000,deductionAmountVnd:300000,forfeitAmountVnd:500000,reason:'Kiểm thử',refundPending:true});
assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(store.reservations[0].status,'CANCELLED');assert.equal(store.room.occupancyStatus,'AVAILABLE');assert.equal(store.ledger.length,1,'pending refund and internal allocation do not create cash entries');
let pending=store.deposits.find(d=>d.depositType==='CANCELLATION_REFUND');assert.equal(pending.paidAmountVnd,1200000n);
const refundBody={refundAmountVnd:1200000,deductionAmountVnd:0};assert.equal((await call(`deposits/${pending.id}/refund`,refundBody,actor,'refund-once')).status,200);assert.equal((await call(`deposits/${pending.id}/refund`,refundBody,actor,'refund-once')).data.replay,true);assert.equal(store.ledger.length,2,'actual refund recorded once');
console.log('PASS actual APIs: create hold, duplicate conflict, organization isolation, partial cancellation pending then actual refund');
// A new rental after cancellation uses a new hold; converted receipts are not collected twice.
await call('rental-workflow/test-room/start',start);const resv2=store.reservations.at(-1).id;
result=await call(`reservations/${resv2}/convert-to-contract`,{startDate:'2026-11-01',endDate:'2027-10-31',rentalModel:'SHARED_ROOM',monthlyRentVnd:4500000,depositVnd:4500000,expectedBookingBalance:2000000,surplusAction:'RENT_CREDIT',documentProfile:profile});
assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.additionalDueVnd,7000000);assert.equal(result.data.contract.status,'DRAFT');assert.equal(store.room.occupancyStatus,'RESERVED');assert.equal(store.contracts.at(-1).rentalModel,'SHARED_ROOM');assert.equal(store.room.rentalModel,'SHARED_ROOM');
assert.equal(store.tenants.find(t=>t.id===store.contracts.at(-1).tenantId).currentRoomId ?? null,null,'reservation conversion does not move in tenant before handover');
const ct=store.contracts.at(-1),invoice=store.invoices.at(-1);result=await call(`invoices/${invoice.id}/pay`,{amountVnd:1000000,providerId:'MANUAL_CASH'});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.handedOver,false);assert.equal(store.deposits.find(d=>d.contractId===ct.id&&d.depositType==='CONTRACT').paidAmountVnd,3000000n);
console.log('PASS actual conversion and invoice API: DRAFT, remaining 7m, partial 1m receipt increases deposit from 2m to 3m');
const handoverBody={handoverMeterKwh:10,handoverWaterM3:2,moveInDate:'2026-11-05'};
assert.equal((await call(`contracts/${ct.id}/handover`,handoverBody)).status,422,'unpaid deposit blocks handover');
assert.equal((await call(`contracts/${ct.id}/handover`,{...handoverBody,allowPartialDepositWithApproval:true,depositOverrideReason:'Kiểm thử'}, {...actor,role:'MANAGER',permissions:['contracts.manage'],buildingScopes:['*']})).status,403);
const ledgerBeforeBlockedPayment=store.ledger.length;
store.room.rentalModel='ENTIRE_ROOM';
assert.equal((await call(`invoices/${invoice.id}/pay`,{amountVnd:6000000,providerId:'MANUAL_CASH'})).status,422,'whole-room handover requires initial meter readings');
store.room.rentalModel='SHARED_ROOM';
assert.equal(store.ledger.length,ledgerBeforeBlockedPayment,'rejected handover does not record income');
assert.equal(store.invoices.at(-1).paidAmountVnd,1000000n,'rejected handover rolls back invoice payment');
result=await call(`invoices/${invoice.id}/pay`,{amountVnd:6000000,providerId:'MANUAL_CASH',handoverMeterKwh:10,handoverWaterM3:2});
assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.handedOver,true);assert.equal(store.room.occupancyStatus,'OCCUPIED');assert.equal(store.contracts.at(-1).status,'ACTIVE');assert.equal(store.tenants.find(t=>t.id===ct.tenantId).currentRoomId,store.room.id);
console.log('PASS actual handover API: missing deposit blocks, meter readings required, full invoice payment activates room');
await mkdir(resolve('.artifacts/rental-workflow'),{recursive:true});
const fixtureProfile={...profile,monthlyRentVnd:4500000,firstRentVnd:4500000,contractDepositVnd:4500000,initialDueVnd:7000000,managerContact:'0900000003'};
const record={room:store.room,reservation:{...store.reservations.at(-1),deposits:store.deposits.filter(d=>d.reservationId===resv2)},contract:ct};
for(const kind of ['CT01','HOLD','LEASE_1PN','LEASE_2PN']){
 const buf=await renderRentalDocx(kind,fixtureProfile,record);const Zip=require('pizzip');const xml=new Zip(buf).file('word/document.xml').asText();assert.ok(xml.includes('KHÁCH KIỂM THỬ'));assert.ok(!/\{(?:hoTen|ngaySinh|tienCoc|c0)\}/.test(xml));await writeFile(resolve('.artifacts/rental-workflow',kind+'.docx'),buf);
}
await assert.rejects(renderRentalDocx('CT01',{...profile,tenant:{...profile.tenant,idNumber:''}},record));
const memberDoc=await renderRentalDocx('CT01',{...fixtureProfile,members:[{...profile.tenant,fullName:'THÀNH VIÊN KIỂM THỬ',idNumber:'000000000003',relationship:'Vợ'}]},record,1);
const memberXml=new (require('pizzip'))(memberDoc).file('word/document.xml').asText();assert.ok(memberXml.includes('THÀNH VIÊN KIỂM THỬ'));assert.ok(memberXml.includes('KHÁCH KIỂM THỬ'));assert.ok(memberXml.includes('Vợ'));
console.log('PASS four exact supplied Word templates: real variable mapping, no unresolved expected variables, required identity validation');
const householdPerson = { ...profile.tenant, fullName: 'THANH VIEN HO & <QA>', idNumber: '000000000013', relationship: 'Con', documentRole: 'HOUSEHOLD_MEMBER' };
const representativePerson = { ...profile.tenant, fullName: 'DAI DIEN DONG HOP DONG', idNumber: '000000000014', documentRole: 'CO_REPRESENTATIVE' };
const mixedProfile = { ...fixtureProfile, members: [householdPerson, representativePerson] };
const { DOMParser } = require('@xmldom/xmldom');
const docXml = buffer => new DOMParser().parseFromString(new (require('pizzip'))(buffer).file('word/document.xml').asText(), 'text/xml');
const householdRows = document => Array.from(document.getElementsByTagName('w:tbl').item(2).getElementsByTagName('w:tr')).slice(1).map(row => Array.from(row.getElementsByTagName('w:tc')).map(cell => cell.textContent));
const ct01 = await renderRentalDocx('CT01', mixedProfile, record);
assert.deepEqual(householdRows(docXml(ct01))[0], ['1', householdPerson.fullName, '20/05/1995', 'Nam', householdPerson.idNumber, 'Con']);
assert.ok(!householdRows(docXml(ct01)).flat().includes(representativePerson.fullName), 'representatives are excluded from section 11');
assert.ok(householdRows(docXml(ct01)).slice(1).flat().every(value => value === ''), 'unused household rows are empty');
await writeFile(resolve('.artifacts/rental-workflow/CT01-household.docx'), ct01);
const manyMembers = Array.from({ length: 12 }, (_, i) => ({ ...householdPerson, fullName: `THANH VIEN KIEM THU ${i + 1}`, idNumber: String(i + 100).padStart(12, '0') }));
const largeCt01 = await renderRentalDocx('CT01', { ...mixedProfile, members: manyMembers }, record);
assert.equal(householdRows(docXml(largeCt01)).length, 12);
assert.equal(householdRows(docXml(largeCt01)).at(-1)[1], manyMembers.at(-1).fullName);
await writeFile(resolve('.artifacts/rental-workflow/CT01-large-household.docx'), largeCt01);
const repCt01 = docXml(await renderRentalDocx('CT01', mixedProfile, record, 2));
assert.ok(repCt01.documentElement.textContent.includes(representativePerson.fullName));
assert.ok(householdRows(repCt01).flat().every(value => value === ''), 'independent representative does not inherit the main household');
for (const template of ['LEASE_1PN', 'LEASE_2PN']) {
  const buffer = await renderRentalDocx(template, mixedProfile, record, 2);
  const xml = docXml(buffer).documentElement.textContent;
  assert.ok(xml.includes(representativePerson.fullName)); assert.ok(!xml.includes(profile.tenant.fullName));
  assert.ok(xml.includes('4.500.000'), 'representative copy retains authoritative main rent');
  await writeFile(resolve('.artifacts/rental-workflow', `${template}-representative.docx`), buffer);
  await assert.rejects(renderRentalDocx(template, mixedProfile, record, 1), /không có hợp đồng/);
}
await assert.rejects(renderRentalDocx('CT01', mixedProfile, record, -1));
await assert.rejects(renderRentalDocx('CT01', mixedProfile, record, 99));
await assert.rejects(renderRentalDocx('CT01', { ...mixedProfile, members: [{ ...householdPerson, relationship: '' }] }, record), /mục 11/);
for (const intent of ['DIRECT', 'IMPORT', 'CONVERT']) {
  store.contracts=[]; store.reservations=[]; store.deposits=[]; store.invoices=[]; store.occupants=[]; store.room.occupancyStatus='AVAILABLE'; store.room.maxOccupants=4;
  store.tenants.find(t => t.phone === profile.tenant.phone).fullName = profile.tenant.fullName;
  const body = { ...start, intent: intent === 'CONVERT' ? 'HOLD' : intent, rentalModel: 'ENTIRE_ROOM', paidAmountVnd: intent === 'DIRECT' ? 0 : 2000000, documentProfile: mixedProfile, paidThrough:'2026-11-30',takeoverDate:'2026-11-03',openingDebtVnd:0 };
  result = await call('rental-workflow/test-room/start', body, actor, `roles-${intent}`);
  assert.equal(result.status,201,JSON.stringify(result.data));
  if (intent === 'CONVERT') {
    result = await call(`reservations/${store.reservations[0].id}/convert-to-contract`, { ...body, expectedBookingBalance:2000000, coOccupants:[] });
    assert.equal(result.status,201,JSON.stringify(result.data));
  }
  assert.equal(store.contracts.length,1, 'representatives share one financial contract');
  assert.equal(store.contracts[0].occupantsCount,3);
  assert.equal(store.invoices.length,intent === 'IMPORT' ? 0 : 1);
  assert.equal(store.deposits.filter(d => d.contractId === store.contracts[0].id && d.depositType === 'CONTRACT').length,1);
  assert.deepEqual(store.occupants.map(o=>o.relationToPrimary),['PRIMARY','FAMILY','OTHER']);
  assert.equal(JSON.parse(store.occupants[1].notes).secondaryContract.relationship,'Con');
  assert.equal(JSON.parse(store.occupants[2].notes).secondaryContract.role,'CO_REPRESENTATIVE');
  const loaded = await call('rental-workflow/test-room');
  assert.deepEqual(loaded.data.profile.members.map(p => p.documentRole),['HOUSEHOLD_MEMBER','CO_REPRESENTATIVE']);
  assert.ok(loaded.data.profile.members.every(p => p.occupantId));
}
console.log('PASS household/representative start, import, conversion, persistence, no duplicated finance, exact CT01 section 11, 12-row expansion, selected lease identities and invalid selections');
// Exercise both other entry modes, all cancellation allocations, and rejected dates.
for (const intent of ['DIRECT','IMPORT']) {
 store.contracts=[];store.reservations=[];store.deposits=[];store.invoices=[];store.occupants=[];store.room.occupancyStatus='AVAILABLE';
 for (const tenant of store.tenants) tenant.currentRoomId = null;
 const before=store.ledger.length;
 if(intent==='IMPORT') store.room.occupancyStatus='OCCUPIED';
 store.room.electricRateVnd=null;store.room.building.electricRateVnd=null;store.room.waterRateVnd=null;store.room.building.waterRateVnd=null;store.room.waterBillingMethod=null;store.room.building.waterBillingMethod=null;
 const body={...start,intent,rentalModel:'SHARED_ROOM',depositVnd:4500000,paidAmountVnd:intent==='IMPORT'?2000000:0,paidThrough:'2026-11-30',takeoverDate:'2026-11-03',openingDebtVnd:500000};
 result=await call('rental-workflow/test-room/start',body,actor,`start-${intent}`);
 assert.equal(result.status,201,JSON.stringify(result.data));
 assert.equal((await call('rental-workflow/test-room/start',body,actor,`start-${intent}`)).data.replay,true);
 assert.equal(store.contracts.length,1);assert.equal(store.ledger.length,before,'no new cash for contract creation/historical balances');
 assert.equal(store.contracts[0].rentalModel,'SHARED_ROOM');assert.equal(store.room.rentalModel,'SHARED_ROOM');
 assert.equal(store.contracts[0].electricRateVnd,3800,'null room/building rate inherits organization');
 assert.equal(store.contracts[0].waterRateVnd,15000);assert.equal(store.contracts[0].waterBillingMethod,'PER_M3');
 assert.equal(store.room.occupancyStatus,intent==='IMPORT'?'OCCUPIED':'RESERVED');
 assert.equal(store.contracts[0].status,intent==='IMPORT'?'ACTIVE':'DRAFT');
 assert.equal(store.tenants.find(t=>t.id===store.contracts[0].tenantId).currentRoomId ?? null,intent==='IMPORT'?store.room.id:null);
 assert.equal(store.invoices[0].totalAmountVnd,intent==='IMPORT'?500000n:8400000n);
 if(intent==='DIRECT') {
   const revised={...profile,tenant:{...profile.tenant,fullName:'KHÁCH ĐÃ SỬA'},members:[{fullName:'NGƯỜI Ở CÙNG',phone:'',idNumber:'',birthDate:'',gender:'',address:''}]};
   const originalFetch=globalThis.fetch;
   globalThis.fetch=async url=>{ if(String(url).includes('/internal/zalo-bot/')) return {ok:true,async json(){return {linked:false}}}; return originalFetch(url) };
   const draft=await call('rental-workflow/test-room/draft',{...body,rentalModel:'ENTIRE_ROOM',monthlyRentVnd:5000000,depositVnd:5000000,documentProfile:revised});
   assert.equal(draft.status,200,JSON.stringify(draft.data));
   assert.equal(store.contracts[0].monthlyRentVnd,5000000n);
   assert.equal(store.contracts[0].rentalModel,'ENTIRE_ROOM');assert.equal(store.room.rentalModel,'ENTIRE_ROOM');
   assert.equal(store.tenants.find(t=>t.id===store.contracts[0].tenantId).fullName,'KHÁCH ĐÃ SỬA');
   assert.equal(store.occupants.filter(o=>o.contractId===store.contracts[0].id).length,2);
   assert.equal(store.invoices[0].totalAmountVnd,9333333n);
   store.invoices[0].paidAmountVnd=100000n;
   assert.equal((await call('rental-workflow/test-room/draft',{...body,monthlyRentVnd:4500000,documentProfile:profile})).status,409,'paid draft cannot be rewritten');
   globalThis.fetch=originalFetch;
   store.tenants.find(t=>t.id===store.contracts[0].tenantId).fullName=profile.tenant.fullName;
 }
}
for(const refundAmountVnd of [2000000,0]){
 store.contracts=[];store.reservations=[];store.deposits=[];store.invoices=[];store.room.occupancyStatus='AVAILABLE';
 await call('rental-workflow/test-room/start',start);
 const before=store.ledger.length;
 result=await call(`reservations/${store.reservations[0].id}/cancel`,{refundAmountVnd,deductionAmountVnd:0,forfeitAmountVnd:2000000-refundAmountVnd,reason:'Kiểm thử',refundPending:false});
 assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(store.ledger.length,before+(refundAmountVnd>0?1:0));
}
assert.equal((await call('rental-workflow/test-room/quote',{...start,startDate:'2026-99-99'})).status,422);
console.log('PASS actual APIs: refund replay without duplicate expense, DIRECT and IMPORT creation/replay, full/no-refund cancellation and invalid calendar date');
const createContract = prisma.contract.create;
prisma.contract.create = async () => { throw new Error('Invalid prisma.contract.create() invocation: INTERNAL_DETAILS'); };
store.contracts=[];store.reservations=[];store.deposits=[];store.invoices=[];store.room.occupancyStatus='AVAILABLE';
const rejected = await call('rental-workflow/test-room/start',{...start,intent:'DIRECT',paidAmountVnd:0},actor,'sanitized-contract-error');
assert.equal(rejected.status,500);assert.ok(!JSON.stringify(rejected.data).includes('prisma'));assert.ok(!JSON.stringify(rejected.data).includes('INTERNAL_DETAILS'));
prisma.contract.create=createContract;
console.log('PASS contract creation failures never expose Prisma internals');
// One shared room must freeze one invoice per contract and conserve room charges.
const monthlyContracts = [
  { id: 'shared-c1', contractCode: 'GHEP-1', tenantId: 'tenant-1', monthlyRentVnd: 2000000n, status: 'ACTIVE', waterBillingMethod: 'FIXED_PER_ROOM' },
  { id: 'shared-c2', contractCode: 'GHEP-2', tenantId: 'tenant-2', monthlyRentVnd: 2500000n, status: 'ACTIVE', waterBillingMethod: 'FIXED_PER_ROOM' },
];
const monthlyInvoices = [];
prisma.building = { findUnique: async () => ({ id: 'b1', orgId: 'test-org', code: 'QA', waterBillingMethod: 'FIXED_PER_ROOM', waterRateVnd: 100001 }) };
prisma.billingPeriod = {
  findUnique: async () => null,
  upsert: async ({ create }) => ({ id: 'period-1', ...create }),
};
prisma.consoleRoom.findMany = async () => [{
  id: 'test-room', code: 'QA-101', rentalModel: 'SHARED_ROOM', waterBillingMethod: 'FIXED_PER_ROOM', waterRateVnd: 100001,
  contracts: monthlyContracts, occupants: monthlyContracts.map((contract, index) => ({ contractId: contract.id, id: `resident-${index}` })),
  electricMeter: { monthReportedKwh: 1, tariffRateVnd: 100001 },
}];
prisma.invoice.findUnique = async ({ where }) => monthlyInvoices.find(invoice => invoice.invoiceCode === where.orgId_invoiceCode?.invoiceCode) || null;
prisma.invoice.upsert = async ({ create, update }) => {
  const existing = monthlyInvoices.find(invoice => invoice.invoiceCode === create.invoiceCode);
  if (existing) return Object.assign(existing, update);
  monthlyInvoices.push(create);
  return create;
};
const closed = await call('settlements/month-close', { buildingId: 'b1', periodKey: '2026-12' });
assert.equal(closed.status, 200, JSON.stringify(closed.data));
assert.equal(closed.data.summary.totalInvoicesFrozen, 2);
assert.deepEqual(monthlyInvoices.map(invoice => invoice.contractId), monthlyContracts.map(contract => contract.id));
assert.deepEqual(monthlyInvoices.map(invoice => Number(invoice.electricVnd)), [50000, 50001]);
assert.deepEqual(monthlyInvoices.map(invoice => Number(invoice.waterVnd)), [50000, 50001]);
assert.equal(monthlyInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmountVnd), 0), 4700002);
console.log('PASS shared month close: individual contracts and invoices, electric and room-water charges split exactly');
if(process.argv.includes('--pdf')) for(const kind of ['CT01','HOLD','LEASE_1PN','LEASE_2PN']){const buf=await renderRentalDocx(kind,fixtureProfile,record);await writeFile(resolve('.artifacts/rental-workflow',kind+'.pdf'),await convertRentalPdf(buf));console.log('PDF',kind)}

if(process.argv.includes('--bundle')) {
 const buf=await compiledResidencePdf(fixtureProfile,record); const pdf=await require('pdf-lib').PDFDocument.load(buf);
 assert.equal(pdf.getPageCount(),10);await writeFile(resolve('.artifacts/rental-workflow/RESIDENCE_BUNDLE.pdf'),buf);console.log('PASS compiled residence PDF: 8 lease pages and 2 CT01 pages');
}
