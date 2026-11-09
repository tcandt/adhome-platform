import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(resolve('apps/landing/package.json'));
const {build}=createRequire(require.resolve('vite'))('esbuild');
const output=resolve('apps/landing/node_modules/.cache/rental-tests/customers.cjs');
await build({entryPoints:['apps/landing/server/rentalWorkflowApi.ts'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'});
const {handleRentalWorkflow}=require(output);
const actor={orgId:'org',id:'qa',email:'qa@example.test',role:'ADMIN',permissions:[],buildingScopes:['*']};
const person={fullName:'EXISTING QA',phone:'0900000001',idNumber:'000000000001',birthDate:'1990-01-01',gender:'Nam',address:'SAVED ADDRESS'};
const tenant={...person,id:'tenant-1',orgId:'org',normalizedPhone:person.phone,isActive:true,currentRoomId:null,primaryBuildingId:'b1',contracts:[{id:'old'}],occupants:[]};
const room={id:'room',orgId:'org',buildingId:'b1',code:'101',maxOccupants:4,occupancyStatus:'AVAILABLE',rentalModel:'ENTIRE_ROOM',building:{id:'b1',code:'QA'}};
let flags={},writes=[],lastWhere;
const create=type=>({create:async({data})=>{writes.push({type,data});return{id:type+'-1',...data}}});
const db={
 consoleRoom:{findUnique:async()=>({...room}),update:async()=>({})},
 tenant:{findFirst:async({where})=>where.orgId===tenant.orgId&&(where.id===tenant.id||where.OR)?tenant:null,findMany:async({where})=>{lastWhere=where;return[tenant]},create:async()=>{throw Error('Existing tenant must not be duplicated')}},
 contract:{...create('contract'),findMany:async()=>[],count:async()=>flags.contract?1:0},roomOccupant:{...create('occupant'),count:async()=>flags.occupant?1:0},
 roomReservation:{...create('reservation'),count:async({where})=>where.tenantId&&flags.reservation?1:0},
 invoice:create('invoice'),deposit:create('deposit'),ledgerEntry:create('ledger'),organization:{findUnique:async()=>({})},
 consoleAuditLog:{...create('audit'),findMany:async()=>[{entityId:'old',metadata:{tenant:person}}]},
 $queryRaw:async()=>[{id:'b1',landlord_profile:{}}],$executeRaw:async()=>0,$transaction:async fn=>fn(db),
};
async function call(action,body,who=actor){let data;const res={setHeader(){},end(){}};
 await handleRentalWorkflow({method:body?'POST':'GET',headers:{}},res,`/api/v1/console/v2/rental-workflow/room/${action}`,db,who,{
 readJsonBody:async()=>body,sendJson:(res,status,value)=>{data={status,value}},calculateFirstPeriodRent:()=>({rentFirstPeriodVnd:4500000,formula:'QA'}),
 handleWithIdempotency:async(_db,_org,_action,_key,_body,_res,fn)=>{const result=await fn();data={status:result.status,value:result.body}},
 });return data;}
let result=await call('customers');assert.equal(result.status,200);assert.equal(result.value.customers[0].person.address,'SAVED ADDRESS');
assert.equal(lastWhere.orgId,'org');assert.equal(lastWhere.currentRoomId,null);assert.deepEqual(lastWhere.contracts.none.status.in,['DRAFT','ACTIVE','EXPIRING','EXTENDED']);assert.equal(lastWhere.occupants.none.OR[1].occupancyStatus,'SCHEDULED');assert.deepEqual(lastWhere.reservations.none.status.in,['PENDING','CONFIRMED']);
assert.equal((await call('customers',undefined,{...actor,orgId:'other'})).status,404);
const body={intent:'DIRECT',existingTenantId:'tenant-1',customerSource:'EXISTING',monthlyRentVnd:4500000,depositVnd:4500000,paidAmountVnd:0,startDate:'2026-11-10',endDate:'2027-11-09',holdDays:7,documentProfile:{tenant:person,members:[],landlord:{}}};
for(const flag of ['contract','occupant','reservation']){flags={[flag]:true};writes=[];result=await call('start',body);assert.equal(result.status,409);assert.equal(writes.length,0)}flags={};
for(const key of ['fullName','phone','idNumber']){result=await call('start',{...body,documentProfile:{...body.documentProfile,tenant:{...person,[key]:'changed'}}});assert.equal(result.status,409)}
assert.equal((await call('start',{...body,existingTenantId:'foreign'})).status,404);
assert.equal((await call('start',{...body,existingTenantId:''})).status,422);
assert.equal((await call('start',{...body,customerSource:'NEW',existingTenantId:undefined})).status,409);
for(const intent of ['DIRECT','HOLD']){writes=[];result=await call('start',{...body,intent});assert.equal(result.status,201,JSON.stringify(result));const record=writes.find(w=>w.type===(intent==='HOLD'?'reservation':'contract'));assert.equal(record.data.tenantId,'tenant-1');assert.equal(writes.filter(w=>w.type==='contract').length,intent==='HOLD'?0:1)}
tenant.currentRoomId='another-room';assert.equal((await call('start',body)).status,409);tenant.currentRoomId=null;
console.log('PASS existing-customer scope/filter, historical profile, reuse for direct and hold, no duplicate identity, stale eligibility conflicts and identity tampering blocked');
