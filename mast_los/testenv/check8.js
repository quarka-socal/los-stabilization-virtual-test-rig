const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const [vp, name, mob] of [[{ width: 1440, height: 1100 }, 'desk', false], [{ width: 400, height: 860 }, 'mob', true]]) {
    const ctx = await browser.newContext(Object.assign({ viewport: vp }, mob ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}));
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    await page.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await page.waitForTimeout(1200);
    const scrollTo = async (txt, file) => {
      await page.evaluate((t) => { const h3 = Array.from(document.querySelectorAll('#v-yontem h3')).find(e => e.textContent.includes(t)); window.scrollTo(0, h3.getBoundingClientRect().top + window.scrollY - 120); }, txt);
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, file) });
    };
    await scrollTo('İstatistiksel', `30_${name}_seeds.png`);
    await scrollTo('Varsayımlar', `31_${name}_sens.png`);
    if (mob) { await scrollTo('Doğrulama ve geçerleme', `32_${name}_vv.png`); await page.evaluate(() => window.scrollBy(0, 900)); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `33_${name}_vv2.png`) });
      console.log('mobile overflow:', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])); }
    await ctx.close();
  }
  await browser.close(); console.log('errors:', errs.length ? errs : 'none');
})();
