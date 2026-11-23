// V&V sürümü sınaması: Yöntem sekmesi (V&V, tohum, test tanımı tabloları), kampanya kutucuğu, test ayrıntısındaki
// tohum satırı, worker ile iki test (T0.4, T1.5) ve bir oynatma; açık/koyu/mobil ekran görüntüleri, konsol hataları
const { chromium } = require('playwright-core');
const path = require('path');
const out = path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const run = async (opts, name, hash, fn) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(`[${name}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await page.goto('http://127.0.0.1:8765/test.html#' + hash, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await fn(page);
    await ctx.close();
  };
  await run({ viewport: { width: 1440, height: 1000 } }, 'desk', 'yontem', async (page) => {
    const info = await page.evaluate(() => ({
      vvRows: document.querySelectorAll('table.vv tbody tr').length,
      vvPass: document.querySelectorAll('table.vv .pill.ok').length, vvFail: document.querySelectorAll('table.vv .pill.fail').length,
      tiles: Array.from(document.querySelectorAll('#v-yontem .tile')).map(t => t.innerText.replace(/\n/g, ' ')).slice(0, 8),
      tables: document.querySelectorAll('#v-yontem table.dt').length, findings: document.querySelectorAll('#findings .finding').length,
      seedsP: (Array.from(document.querySelectorAll('#v-yontem p')).find(p => /Kararı tohuma bağlı/.test(p.textContent)) || {}).textContent }));
    console.log('yontem:', JSON.stringify(info, null, 1));
    await page.screenshot({ path: path.join(out, '20_yontem_full.png'), fullPage: true });
    await page.click('#tab-kampanya'); await page.waitForTimeout(500);
    console.log('vv tile:', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
    await page.click('#ti-T1_6'); await page.waitForTimeout(400);
    console.log('seed line T1.6:', await page.evaluate(() => (Array.from(document.querySelectorAll('#detail .small')).find(e => /tohumla tekrar/.test(e.textContent)) || {}).textContent));
    await page.screenshot({ path: path.join(out, '21_kampanya_t16.png') });
    for (const id of (process.env.SKIP_RUN ? [] : ['T0_4', 'T1_5'])) {
      await page.click('#ti-' + id); await page.waitForTimeout(300);
      await page.click('#runOne');
      await page.waitForFunction(() => !document.querySelector('#runAll').disabled, null, { timeout: 300000 });
      await page.waitForTimeout(400);
      console.log(id, 'after run:', await page.evaluate((i) => document.querySelector('#ti-' + i + ' .pill').textContent + ' | ' + document.querySelector('.measured').textContent.slice(0, 220), id));
    }
    await page.click('#ti-T1_5'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '22_t15_run.png'), fullPage: true });
    await page.click('#tab-model'); await page.waitForTimeout(700);
    console.log('model tiles:', await page.evaluate(() => Array.from(document.querySelectorAll('#mTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
    await page.screenshot({ path: path.join(out, '23_model.png') });
    await page.click('#tab-duzenek'); await page.waitForTimeout(2500);
    console.log('duzenek:', await page.evaluate(() => document.querySelector('#pstat').textContent));
  });
  await run({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }, 'dark', 'yontem', async (page) => {
    await page.evaluate(() => document.querySelector('table.vv').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '24_dark_vv.png') });
  });
  await run({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile', 'yontem', async (page) => {
    const ov = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    console.log('mobile yontem scrollWidth/innerWidth:', ov);
    await page.evaluate(() => document.querySelector('table.vv').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '25_mobile_vv.png') });
  });
  await browser.close();
  console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
