const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const dump = () => page.evaluate(() => Array.from(document.querySelectorAll('#v-yontem .tiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || '));
  console.log('[sub] V&V tiles:', await dump());
  console.log('[sub] V rows:', await page.evaluate(() => Array.from(document.querySelectorAll('#v-yontem table.vv tr')).filter(r => /^V\d/.test(r.innerText.trim())).map(r => r.innerText.replace(/\t|\n/g, ' : ').slice(0, 160)).join('\n')));
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  console.log('[ship] V&V tiles:', await dump());
  await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#v-yontem h3')).find(x => /V&V/.test(x.textContent)); t && t.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '105_ship_vv.png') });
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  console.log('[ship] campaign V&V tile:', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  await browser.close(); console.log('errors:', errs.length ? errs : 'none');
})();
