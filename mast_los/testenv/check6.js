const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.pgroup')) if (d.textContent.includes('Dünya dönüşü')) d.open = true; });
  await page.click('[id="p-wb.earth.comp"]'); await page.waitForTimeout(500);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /kompanzasyonu kapalı/.test(document.querySelector('#pstat').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.click('#pp').catch(() => {});   // durdur
  await page.evaluate(() => { window.scrollTo(0, 0); const s = document.querySelector('#scrub'); s.value = 55; s.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: __dirname + '/shots/13_compoff_top.png' });
  await page.evaluate(() => document.querySelector('#rc2').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/shots/14_compoff_charts.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await browser.close();
})();
