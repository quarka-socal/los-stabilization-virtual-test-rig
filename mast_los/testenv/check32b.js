// Düzenek, kompanzasyon KAPALI: enlem değişince dedektördeki dünya dönüşü kayması (lejant + ekran görüntüsü)
const { chromium } = require('playwright-core'); const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(2000);
  for (const lat of [40, 20, 80, 0]) {
    await page.evaluate(([l]) => { window.__T.setParam('wb.earth.comp', false, true); window.__T.setParam('wb.earth.lat', l, true); }, [lat]); await page.waitForTimeout(800);
    await page.click('#tab-duzenek'); await page.waitForTimeout(500);
    const before = await page.evaluate(() => document.querySelector('#pstat').textContent);
    await page.click('#prun'); await page.waitForTimeout(1500);
    for (let w = 0; w < 120; w++) { const s = await page.evaluate(() => [document.querySelector('#pstat').textContent, document.querySelector('#prun').disabled]); if (!s[1] && w > 3) break; if (w % 20 === 0) console.log('  bekle', w, s[0].slice(0, 90), s[1]); await page.waitForTimeout(1000); }
    await page.evaluate(() => { const { RIG } = window.__T; RIG.t = 59.95; window.__T.drawRigFrame(); }); await page.waitForTimeout(400);
    const leg = await page.evaluate(() => Array.from(document.querySelectorAll('span.k')).filter(e => /Dünya dönüşü/.test(e.innerText)).map(e => e.innerText.replace(/\s+/g, ' ')).join(' | '));
    const st = await page.evaluate(() => document.querySelector('#pstat').textContent.slice(0, 200));
    console.log(`φ ${lat}: ${leg} || ${st}`);
    const el = await page.$('canvas#fpa') || null;
    for (const m of ['Tam alan', 'Oto']) { for (const b of await page.$$('button')) { if ((await b.innerText()).trim() === m) { await b.click(); break; } } await page.waitForTimeout(400); await (await page.$('#fpa')).screenshot({ path: path.join(out, `326_lat${lat}_${m === 'Oto' ? 'oto' : 'tam'}.png`) }); }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok'); await browser.close();
})();
