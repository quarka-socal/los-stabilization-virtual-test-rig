// v13.3 ek kontrol: Model VIV paneli "Gerekli DRR" satırı VIV yokken B2-01 = 0 yazar (f_n = 12 Hz; VIV kapalı)
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const row = () => page.evaluate(() => { const b = document.querySelector('#mViv'); return b ? b.innerText.split('\n').filter(l => /Gerekli DRR/.test(l)).join(' | ') : '(yok)'; });
  console.log('[varsayılan]', await row());
  await page.evaluate(() => window.__T.setParam('wb.viv.fn', 12, true)); await page.waitForTimeout(900);
  console.log('[f_n = 12 Hz]', await row());
  await page.evaluate(() => { window.__T.setParam('wb.viv.fn', 3, true); window.__T.setParam('wb.viv.on', false, true); }); await page.waitForTimeout(900);
  console.log('[VIV kapalı]', await row());
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
