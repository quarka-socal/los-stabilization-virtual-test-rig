// Tam kampanya: tarayıcıda Web Worker havuzuyla 27 test + işletme ayrıştırması
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  // parametre değişikliği: dar bant kapalı (sonuçlar değişmeli)
  await page.click('#tab-model'); await page.waitForTimeout(400);
  await page.click('text=Dar bant kontrol kapalı'); await page.waitForTimeout(400);
  await page.click('#tab-kampanya');
  const t0 = Date.now();
  await page.click('#runAll');
  let last = '';
  while (Date.now() - t0 < 15 * 60e3) {
    await page.waitForTimeout(10000);
    const st = await page.evaluate(() => [document.querySelector('#runAll').disabled, document.querySelector('#progTxt').textContent]);
    if (st[1] !== last) { console.log(Math.round((Date.now() - t0) / 1000) + ' s', st[1]); last = st[1]; }
    if (!st[0]) break;
  }
  const res = await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.querySelector('.id').textContent + ':' + b.querySelector('.pill').textContent + (b.querySelector('.pill').classList.contains('stale') ? '*' : '')).join(' '));
  console.log('statuses:', res);
  const banner = await page.evaluate(() => document.querySelector('#staleBanner').hidden ? 'banner hidden' : document.querySelector('#staleBanner').textContent);
  console.log(banner);
  await page.click('#ti-T2_2'); await page.waitForTimeout(400);
  console.log('T2.2:', await page.evaluate(() => document.querySelector('.measured').textContent));
  await page.click('#ti-T2_3'); await page.waitForTimeout(400);
  console.log('T2.3:', await page.evaluate(() => document.querySelector('.measured').textContent));
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('budget tiles:', await page.evaluate(() => Array.from(document.querySelectorAll('#budTiles .tile')).map(t => t.innerText.replace(/\n/g, ' | ')).join(' || ')));
  await page.screenshot({ path: __dirname + '/shots/7_after_campaign_budget.png', fullPage: false });
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
