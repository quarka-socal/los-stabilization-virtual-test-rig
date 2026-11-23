const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const [w, hgt, tag] of [[1440, 900, 'desk'], [390, 844, 'mob']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: 'dark', deviceScaleFactor: tag === 'mob' ? 2 : 1 });
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' }); await page.waitForTimeout(1200);
    await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(900);
    console.log(tag, 'V&V tile:', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).filter(s => /V&V/.test(s)).join('')));
    console.log(tag, 'overflow:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await page.screenshot({ path: path.join(__dirname, 'shots', `106_dark_${tag}.png`) });
    await page.click('#tab-model'); await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector('#presetRow').scrollIntoView({ block: 'start' })); await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(__dirname, 'shots', `107_dark_model_${tag}.png`) });
    await ctx.close();
  }
  await browser.close(); console.log('errors:', errs.length ? errs : 'none');
})();
