import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base=process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190';
const pdf=await readFile('.artifacts/contract-preview/representative.pdf');
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('.artifacts/rental-members/ui',{recursive:true});
try {
  for (const width of [1440,390,320]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page=await context.newPage();const writes=[],previews=[],errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const tenant={fullName:'MAIN QA',idNumber:'000000000001',birthDate:'1990-01-01',address:'MAIN ADDRESS'};
    const rep={occupantId:'rep-1',documentRole:'CO_REPRESENTATIVE',fullName:'REP QA',idNumber:'000000000003',birthDate:'',address:'REP ADDRESS'};
    const profile={tenant,members:[rep],landlord:{fullName:'OWNER QA',idNumber:'000000000002',address:'OWNER ADDRESS'},rentalAddress:'RENTAL QA',signedDate:'2026-11-09',leaseTemplate:'LEASE_1PN'};
    const contract={id:'qa-contract',contractCode:'HD-QA',status:'ACTIVE',tenantName:'MAIN QA',tenantPhone:'0900000001',roomId:'room-1',roomCode:'101',buildingCode:'QA',startDate:'2026-01-01',endDate:'2026-12-31',monthlyRentVnd:4500000,depositVnd:4500000,electricRateVnd:3800,waterBillingMethod:'PER_M3',waterRateVnd:15000,occupants:[{id:'rep-1',fullName:'REP QA',relationToPrimary:'OTHER'}]};
    const building={id:'b1',code:'QA',name:'QA',status:'ACTIVE',stats:{totalRooms:1,occupiedRooms:1},floors:[]};
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path.endsWith('/auth/me'))return route.fulfill({json:{ok:true,actor:{id:'qa',email:'qa@example.test',role:'ADMIN',orgId:'qa',buildingScopes:['*']}}});
      if(path.endsWith('/bootstrap'))return route.fulfill({json:{ok:true,buildings:[building],rooms:[],tenants:[]}});
      if(path.endsWith('/module-data'))return route.fulfill({json:{ok:true,contracts:[contract]}});
      if(path.endsWith('/document/profile')){writes.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,missing:[]}});}
      if(path.endsWith('/document')){
        if(route.request().method()==='GET'){
          assert.equal(url.searchParams.get('occupantId'),'rep-1');
          return route.fulfill({json:{ok:true,contract,room:{code:'101',buildingName:'QA'},profile,personIndex:1,missing:['Ngày sinh khách thuê hợp lệ']}});
        }
        previews.push(route.request().postDataJSON());return route.fulfill({contentType:'application/pdf',body:pdf});
      }
      return route.fulfill({json:{ok:true,items:[]}});
    });
    await page.goto(`${base}/?module=contracts`);
    try { await page.getByRole('button',{name:'Xem hợp đồng Đại diện HĐ · REP QA',exact:true}).click({timeout:6000}); }
    catch(error){console.error(errors);console.error(await page.locator('body').innerText());console.error(await page.getByRole('button').allTextContents());throw error;}
    const dialog=page.getByTestId('contract-document-dialog');
    await dialog.getByLabel('Họ và tên',{exact:true}).waitFor();
    assert.equal(await dialog.getByLabel('Họ và tên',{exact:true}).inputValue(),'REP QA');
    assert.equal(await dialog.getByLabel('Bản in',{exact:true}).inputValue(),'lease');
    await dialog.getByLabel('Họ và tên',{exact:true}).fill('REP QA UPDATED');
    await dialog.getByLabel('Ngày sinh',{exact:true}).fill('1994-02-03');
    await dialog.getByRole('button',{name:'Lưu & xem PDF',exact:true}).click();
    await dialog.locator('.contract-pdf-page').first().waitFor();
    assert.equal(writes.length,1);assert.equal(previews.length,1);
    for(const body of [...writes,...previews]){
      assert.equal(body.occupantId,'rep-1');assert.equal(body.profile.tenant.fullName,'MAIN QA');
      assert.equal(body.profile.members[0].fullName,'REP QA UPDATED');assert.equal(body.profile.members[0].birthDate,'1994-02-03');
    }
    assert.equal(previews[0].bundle,false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`.artifacts/rental-members/ui/representative-pdf-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();}
console.log('PASS representative contract links and PDF dialog at 1440/390/320px: stable identity selection, member edits, primary preserved, actual save response and PDF rendered');
