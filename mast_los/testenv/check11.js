const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({ rows: document.querySelectorAll('table.vv tbody tr').length, pass: document.querySelectorAll('table.vv .pill.ok').length, fail: document.querySelectorAll('table.vv .pill.fail').length,
    k5: (Array.from(document.querySelectorAll('table.vv tbody tr')).find(r => /K5/.test(r.innerText)) || {}).innerText, tiles: Array.from(document.querySelectorAll('#v-yontem .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' | ') }));
  console.log(JSON.stringify(info, null, 1));
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('table.vv tbody tr')).find(r => /K5/.test(r.innerText)); r.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, '51_vv_k5.png') });
  await page.evaluate(() => { const p = Array.from(document.querySelectorAll('#v-yontem p')).find(p => /Genişletilmiş tekrar/.test(p.textContent)); p.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, '52_seeds_t07.png') });
  await page.click('#tab-kampanya'); await page.waitForTimeout(400);
  console.log('kampanya V&V kutucuğu:', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).filter(t => /V&V|doğrula/i.test(t)).join(' || ')));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
