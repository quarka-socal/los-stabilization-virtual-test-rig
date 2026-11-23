// Kompanzasyon KAPALI ve stab KAPALI durumlarında oklar/lejant; yalnız sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => { const i = document.getElementById('p-wb.earth.comp'); i.closest('details').open = true; i.click(); });
  await page.waitForTimeout(500);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /özel parametreler/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  const pause = async () => { if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp'); };
  await pause();
  await page.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(250);
  console.log('komp KAPALI lejant:', await page.evaluate(() => document.querySelector('#fpaLeg').innerText.replace(/\n/g, ' | ')));
  console.log('komp KAPALI metrik:', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).map(r => r.innerText.replace(/\t|\n/g, ' : ')).filter(t => /kayma|dünya|gyro|kalan|Beklenen/i.test(t)))));
  const el = await page.$('#fpa'); await (await el.evaluateHandle(e => e.closest('.panel'))).asElement().screenshot({ path: path.join(out, '50_compoff_fpa.png') });
  // stab KAPALI
  await page.click('#pstab button[data-v="0"]'); await page.click('#prun');
  await page.waitForFunction(() => /stab KAPALI/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await pause(); await page.waitForTimeout(200);
  console.log('stab KAPALI lejant gizli:', await page.evaluate(() => document.querySelector('#fpaLeg').hidden), '| kayma satırı:', await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).some(r => /gyro bias/.test(r.innerText))));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
