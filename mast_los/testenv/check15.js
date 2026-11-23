const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1300);
  if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp');
  await page.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 15.06; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#feis button[data-e="eis"]'); await page.waitForTimeout(200);
  console.log('lejant:', await page.evaluate(() => document.querySelector('#fpaLeg .cap').textContent));
  console.log('metrik:', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).map(r => r.innerText.replace(/\t|\n/g, ' : ')).filter(t => /EIS/.test(t)))));
  const el = await page.$('#fpa'); await (await el.evaluateHandle(e => e.closest('.panel'))).asElement().screenshot({ path: path.join(out, '80_eis_legend.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
