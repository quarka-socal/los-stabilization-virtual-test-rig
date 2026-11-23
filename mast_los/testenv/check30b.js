// v13.5: Kampanya T2.5 test tanımı panelinde 2 ve 3 Hz metni nerede (eleman türü) ve gemi Düzenek deniz oynatması
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.click('#ti-T2_5'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
  const r = await page.evaluate(() => Array.from(document.querySelectorAll('#detail *')).filter(e => e.children.length === 0 && /2 ve 3 Hz/.test(e.textContent)).map(e => e.tagName + ': ' + e.textContent.slice(0, 260)));
  console.log('[T2.5 tanım]', r.join(' || ') || '(yok)');
  await page.click('#tab-duzenek'); await page.waitForTimeout(800);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#platSeg button')).find(x => x.getAttribute('data-p') === 'ship'); if (b) b.click(); }); await page.waitForTimeout(2500);
  const met = await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Göz bebeği/.test(r.innerText)).map(r => r.innerText).join(' | '));
  console.log('[Düzenek gemi deniz]', met.replace(/\t/g, ' : '));
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
