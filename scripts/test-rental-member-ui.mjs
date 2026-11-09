import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.ADHOME_UI_URL || 'http://127.0.0.1:5190';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
await mkdir('.artifacts/rental-members/ui', { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.stack); });
    const building = { id:'b1', code:'QA', name:'TOA NHA QA', status:'ACTIVE', electricRateVnd:3800,waterRateVnd:15000,waterBillingMethod:'PER_M3', stats:{ totalRooms:1, availableRooms:1,occupiedRooms:0,reservedRooms:0,totalFloors:1 }, floors:[] };
    const room = { id:'qa-room', buildingId:'b1',buildingCode:'QA',title:'QA ROOM', code:'QA-101', buildingName:building.name, floorName:'1', area:25, roomType:'Studio', rentalModel:'ENTIRE_ROOM', maxOccupants:4,
      listPriceVnd:4500000, depositMonths:1, occupancyStatus:'AVAILABLE', building, effectiveElectricRateVnd:3800, effectiveWaterRateVnd:15000, unpaidAmountVnd:0 };
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({json:{ok:true,actor:{id:'qa',email:'qa@example.test',role:'ADMIN',orgId:'qa',buildingScopes:['*']}}});
      if (path.endsWith('/bootstrap')) return route.fulfill({json:{ok:true,buildings:[building],rooms:[room],tenants:[]}});
      if (path.endsWith('/rental-workflow/qa-room')) return route.fulfill({json:{ok:true,room,contract:null,reservation:null,bookingBalance:0}});
      if (path.endsWith('/quote')) return route.fulfill({json:{ok:true,rent:{formula:'QA'},totalInitialInvoiceDue:9000000,additionalDepositDue:4500000,rentFirstPeriodVnd:4500000}});
      if (path.endsWith('/start')) { writes.push(route.request().postDataJSON()); return route.fulfill({status:422,json:{ok:false,message:'QA: rejected write'}}); }
      return route.fulfill({json:{ok:true,items:[]}});
    });
    await page.goto(`${base}/?module=buildings&rentalRoom=qa-room`);
    try { await page.getByRole('radio',{name:'Thuê ở ngay',exact:true}).check({timeout:6000}); }
    catch(error){console.error(errors);console.error(await page.locator('body').innerText());throw error;}
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    const section = page.locator('.rental-members');
    const mode = section.getByRole('switch').first();
    assert.equal(await mode.isChecked(),false);
    await page.getByRole('button',{name:'Thêm người cùng hộ',exact:true}).click();
    await mode.focus(); await page.keyboard.press('Space');
    assert.equal(await mode.isChecked(),true);
    await page.getByRole('button',{name:'Thêm đại diện HĐ',exact:true}).click();
    assert.equal(await page.getByLabel('Mối quan hệ với khách chính',{exact:true}).count(),1);
    const people = page.locator('.rental-person');
    await people.nth(0).getByLabel('Họ và tên',{exact:true}).fill('KHACH CHINH QA');
    await people.nth(0).getByLabel('Số điện thoại',{exact:true}).fill('0900000001');
    await people.nth(1).getByLabel('Họ và tên',{exact:true}).fill('THANH VIEN HO QA');
    await people.nth(1).getByLabel('Mối quan hệ với khách chính',{exact:true}).fill('Con');
    await people.nth(2).getByLabel('Họ và tên',{exact:true}).fill('DAI DIEN QA');
    const householdSwitch = page.locator('.rental-member').first().getByRole('switch');
    await householdSwitch.focus(); await page.keyboard.press('Space');
    assert.equal(await page.getByLabel('Mối quan hệ với khách chính',{exact:true}).count(),0);
    assert.equal(await people.nth(1).getByLabel('Họ và tên',{exact:true}).inputValue(),'THANH VIEN HO QA');
    await householdSwitch.press('Space');
    assert.equal(await people.nth(1).getByLabel('Mối quan hệ với khách chính',{exact:true}).inputValue(),'Con');
    await mode.focus(); await page.keyboard.press('Space');
    await page.getByRole('button',{name:'Thêm người cùng hộ',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Thêm người cùng hộ',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Xóa người này',exact:true}).last().click();
    await mode.scrollIntoViewIfNeeded();
    const controls = await section.locator('[role=switch],button').evaluateAll(elements => elements.map(el => ({label:el.getAttribute('aria-label') || el.textContent, left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
    assert.ok(controls.every(box=>box.left>=0 && box.right<=width), JSON.stringify(controls));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`.artifacts/rental-members/ui/members-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    await page.locator('label').filter({hasText:'Giá thuê hàng tháng'}).locator('input').fill('4500000');
    await page.locator('label').filter({hasText:'Cọc hợp đồng yêu cầu'}).locator('input').fill('4500000');
    await page.getByRole('button',{name:'Tiếp tục — xem lại',exact:true}).click();
    try { await page.getByRole('heading',{name:'Kiểm tra & xác nhận',exact:true}).waitFor({timeout:6000}); }
    catch (error) { await page.screenshot({path:`.artifacts/rental-members/ui/failure-${width}.png`,fullPage:true}); console.error(await page.getByTestId('rental-onboarding-page').innerText()); throw error; }
    assert.equal(writes.length,0);
    await page.getByRole('button',{name:'Xác nhận lập hợp đồng',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'QA: rejected write'}).waitFor();
    assert.equal(writes.length,1);
    assert.deepEqual(writes[0].documentProfile.members.map(p=>p.documentRole),['HOUSEHOLD_MEMBER','CO_REPRESENTATIVE']);
    assert.equal(await page.getByRole('status').filter({hasText:'Đã lưu'}).count(),0);
    await page.getByRole('button',{name:'Sửa thông tin',exact:true}).click();
    await page.getByRole('button',{name:'Sửa',exact:true}).click();
    assert.equal(await people.nth(1).getByLabel('Mối quan hệ với khách chính',{exact:true}).inputValue(),'Con');
    assert.equal(await page.locator('.rental-member').nth(1).getByRole('switch').isChecked(),true);
    assert.deepEqual(errors,[]);
    results.push({width,mixedRoles:true,keyboard:true,reducedMotion:true,capacity:true,roleAndFieldsPreserved:true,verifiedPayload:true,noFalseSuccess:true,noOverflow:true});
    await context.close();
  }
} finally { await browser.close(); }
await writeFile('.artifacts/rental-members/ui/results.json',JSON.stringify(results,null,2));
console.log('PASS member/representative UI at 1440/390/320px: keyboard switch, mixed roles, capacity, payload, rejected-write recovery and no overflow');
