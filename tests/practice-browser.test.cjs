const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

// Real browser + separate devices, with an isolated in-memory cloud. No
// production check-ins or credentials are modified by this test.
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const template = Array.from({length:3}, (_,index) => ({title:`练习 ${index+1}`,minutes:5,translation:'练习说明',tasks:['音准','节奏']}));
let row = {updated_at:'2026-10-13T00:00:00.000Z',state:{days:{[day]:{plans:{U:{
  planSnapshot:template,items:{0:{done:true},1:{checks:{0:true}},2:{note:'原有笔记'}},journal:{}
}}}},typeOverrides:{},newPlanVersion:4,unifiedPlanVersion:6,practiceContentVersion:3}};
let offline = false, writes = 0;
const errors = [];

(async () => {
  const executablePath = process.env.GRACE_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({headless:true,...(fs.existsSync(executablePath)?{executablePath}:{})});
  try {
    async function device() {
      const context = await browser.newContext();
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === 'https://grace.test') {
          const name = decodeURIComponent(url.pathname.slice(1)) || 'Grace_2026年8月每日练习打卡.html';
          if (!['Grace_2026年8月每日练习打卡.html','local-auth.js','practice-sync.js','score-collab.js'].includes(name)) return route.abort();
          return route.fulfill({body:fs.readFileSync(path.join(root,name)),contentType:name.endsWith('.html')?'text/html':'application/javascript'});
        }
        if (url.pathname === '/rest/v1/practice_progress') {
          if (offline) return route.abort('failed');
          if (request.method() === 'GET') return route.fulfill({json:[clone(row)]});
          assert.equal(request.method(),'PATCH');
          const stamp = url.searchParams.get('updated_at').slice(3);
          if (stamp !== row.updated_at) return route.fulfill({json:[]});
          row = request.postDataJSON(); writes++;
          return route.fulfill({json:[clone(row)]});
        }
        if (url.pathname === '/rest/v1/practice_score_links') return route.fulfill({json:[]});
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://grace.test/');
      await page.waitForFunction(() => document.getElementById('syncStatusPanel').dataset.state === 'saved');
      return page;
    }
    const child = await device();
    assert.equal(await child.locator('.practice-card').count(),3);
    assert.equal(await child.locator('.practice-card .check').first().getAttribute('aria-checked'),'true');
    assert.equal(await child.locator('#syncRefresh').isVisible(),false);
    assert.equal(writes,0);
    await child.locator('.practice-card .check').nth(1).click();
    assert.equal(await child.locator('#loginModal').evaluate(el=>el.classList.contains('show')),true);
    assert.equal(writes,0);
    await child.locator('#localPassword').fill('626306');
    await child.locator('#localLoginForm button[type=submit]').click();
    await child.waitForFunction(() => document.getElementById('authBtn').textContent.includes('已登录'));
    await child.locator('.practice-card .check').nth(1).click();
    await child.waitForFunction(() => document.getElementById('syncStatusPanel').dataset.state === 'saved');
    assert.equal(row.state.days[day].plans.U.items[1].done,true);
    const viewer = await device();
    assert.equal(await viewer.locator('.practice-card .check').nth(1).getAttribute('aria-checked'),'true');
    assert.equal(await viewer.locator('#authBtn').innerText(),'密码登录');
    assert.equal(await viewer.locator('textarea').first().getAttribute('readonly'),'');
    console.log('PASS sparse cloud records render, password login, automatic upload, anonymous device sees check-in');

    if (!await child.locator('.practice-card').nth(2).evaluate(el=>el.classList.contains('open'))) {
      await child.locator('.practice-card').nth(2).locator('.card-summary').click();
    }
    const clock = child.locator('.practice-card').nth(2).locator('[data-clock]');
    await child.locator('.practice-card').nth(2).locator('[data-add="300"]').click();
    assert.equal(await clock.innerText(),'05:00');
    await child.waitForFunction(() => document.getElementById('syncStatusPanel').dataset.state === 'saved');
    assert.equal(row.state.days[day].plans.U.items[2].seconds,300);
    console.log('PASS partial note-only record supports timer without NaN');

    offline=true;
    await child.locator('.practice-card .check').nth(2).click();
    assert.equal(await child.locator('.practice-card .check').nth(2).getAttribute('aria-checked'),'true');
    await child.waitForFunction(() => document.getElementById('syncStatusPanel').dataset.state === 'error');
    assert.ok(await child.evaluate(()=>localStorage.getItem('grace-practice-sync-outbox-v2')));
    assert.equal(await child.locator('#syncRefresh').isVisible(),true);
    offline=false;
    await child.evaluate(()=>window.dispatchEvent(new Event('online')));
    await child.waitForFunction(() => document.getElementById('syncStatusPanel').dataset.state === 'saved');
    assert.equal(row.state.days[day].plans.U.items[2].done,true);
    assert.equal(await child.locator('#syncRefresh').isVisible(),false);
    await viewer.waitForFunction(() => document.querySelectorAll('.practice-card .check')[2].getAttribute('aria-checked')==='true');
    assert.deepEqual(errors,[]);
    console.log('PASS network failure does not block check-in; reconnection uploads automatically and viewer refreshes');
    console.log('All browser tests passed. No production data was modified.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
