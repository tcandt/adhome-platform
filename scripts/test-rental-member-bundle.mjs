import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
const require=createRequire(resolve('apps/landing/package.json'));
const {build}=createRequire(require.resolve('vite'))('esbuild');
const output=resolve('apps/landing/node_modules/.cache/rental-tests/memberBundle.cjs');
await build({entryPoints:['apps/landing/server/rentalDocuments.ts'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'});
const {compiledResidencePdf}=require(output),{PDFDocument}=require('pdf-lib');
const directory=await mkdtemp(join(tmpdir(),'adhome-member-bundle-'));
process.env.ADH_PRIVATE_DOCUMENT_DIR=directory;
const events=[];
const db={consoleAuditLog:{findMany:async({where})=>events.filter(e=>e.entityId===where.entityId)}};
const orgId='qa-org',contractId='qa-contract',buildingId='qa-building';
const identity=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const attachment=await PDFDocument.create();attachment.addPage([311,400]);const buildingPdf=Buffer.from(await attachment.save());
try{
  for(const kind of ['ID_FRONT','ID_BACK','TITLE_FRONT','TITLE_BACK','BUSINESS_REGISTRATION']){
    const entityId=kind.startsWith('ID_')?contractId:buildingId;
    const bytes=kind.startsWith('ID_')?identity:buildingPdf,id=randomUUID();
    const scope=join(directory,createHash('sha256').update(`${orgId}\0${entityId}`).digest('hex'));
    await mkdir(scope,{recursive:true});await writeFile(join(scope,`${id}.bin`),bytes);
    events.push({entityId,action:'UPLOAD_PRIVATE_DOCUMENT',metadata:{id,kind,name:'QA synthetic attachment',mimeType:kind.startsWith('ID_')?'image/png':'application/pdf',sha256:createHash('sha256').update(bytes).digest('hex')}});
  }
  const tenant={fullName:'MAIN BUNDLE QA',phone:'0900000001',birthDate:'1990-01-01',gender:'Nam',idNumber:'000000000001',address:'QA MAIN ADDRESS'};
  const profile={tenant,members:[{...tenant,fullName:'HOUSEHOLD BUNDLE QA',idNumber:'000000000003',relationship:'Con',documentRole:'HOUSEHOLD_MEMBER'},
    {...tenant,fullName:'REPRESENTATIVE BUNDLE QA',idNumber:'000000000004',documentRole:'CO_REPRESENTATIVE'}],
    landlord:{fullName:'OWNER BUNDLE QA',idNumber:'000000000002',address:'QA OWNER ADDRESS'},rentalAddress:'QA RENTAL ADDRESS',authority:'QA AUTHORITY',signedDate:'2026-11-09',leaseTemplate:'LEASE_1PN'};
  const record={room:{orgId,buildingId,code:'QA-101',building:{name:'QA BUILDING'}},contract:{id:contractId,startDate:'2026-11-09',endDate:'2027-11-08',monthlyRentVnd:4500000,depositVnd:4500000}};
  await mkdir('.artifacts/rental-members',{recursive:true});
  const full=await compiledResidencePdf(profile,record,db);
  const fullPdf=await PDFDocument.load(full);
  assert.equal(fullPdf.getPageCount(),26,'one paired identity page, three 2-page CT01s, two 8-page leases, three building attachment pages');
  await writeFile('.artifacts/rental-members/full-bundle.pdf',full);
  console.log('PASS full mixed household bundle: 26 actual converted pages, representative lease included, household has no extra lease');
  const selected=await compiledResidencePdf(profile,record,db,2);
  assert.equal((await PDFDocument.load(selected)).getPageCount(),14,'selected representative: identity, CT01, own lease, building attachments');
  await writeFile('.artifacts/rental-members/representative-bundle.pdf',selected);
  console.log('PASS selected representative bundle: 14 actual converted pages');
}finally{await rm(directory,{recursive:true,force:true});}
