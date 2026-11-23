const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.click('#pp'); await page.waitForTimeout(2500); await page.click('#pp'); await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + '/shots/8_duzenek_fixed.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await browser.close();
})();
