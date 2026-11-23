// v13.7 kontrolü (§6 kararları + §7 dünya dönüşü): Model → ölçüm zinciri yoğunluk satırları, TUR tablosu (U-04/U-07 yoğunluktan,
// karar belirsizliği ve koruma bandı tablosu), Dünya dönüşü paneli (çıkış süresi kenar payıyla, T0.7 eşiği, etkilenen testler
// kayıt süresinden; kompanzasyon kapalı), Kampanya (T0.2/T1.3/T1.9 koruma bandı satırları, T0.7 yeni satırlar), Düzenek
// (kompanzasyon kapalı koşu: dedektörde sürüklenen iz, Ω·δ ve bias satırları), Yöntem (bulgular, V&V W4/W12/M10), koyu tema, mobil
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
const T = (s) => (s || '').replace(/\t/g, ' : ').replace(/\n+/g, ' | ');
const part = process.argv[2] || 'all';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1800);
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 170) + ' = ' + ((x.querySelector('input, select') || {}).value || '')).join(' || '), re);
  const tur = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#mTur tr')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 260)).join(' || '), re);
  const earth = () => page.evaluate(() => { const b = document.querySelector('#mEarth'); return b ? Array.from(b.querySelectorAll('p')).map(p => p.innerText).join(' | ') : '(yok)'; });
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1500); };
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: gürültü yoğunluğu satırları]', T(await rows('yoğunluğu')));
    console.log('[TUR tablosu: U-04, U-07, toplam]', T(await tur('U-04|U-07|Toplam belirsizlik|TUR \\(')));
    console.log('[Koruma bandı tablosu]', T(await tur('T0.2 ·|T1.3 ·|T1.9 ·')));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#mTur h4')).find(x => /Karar belirsizliği/.test(x.textContent)); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '320_model_guard_v137.png') });
    console.log('[Dünya dönüşü paneli, AÇIK]', T(await earth()));
    await page.evaluate(() => { const b = document.querySelector('#mEarth'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '321_model_earth_v137.png') });
    await setP('wb.earth.comp', false);
    console.log('[Dünya dönüşü paneli, KAPALI]', T(await earth()));
    await setP('wb.earth.comp', true);
    await setP('wb.chain.imu_bw', 100);
    console.log('[TUR, f_IMU 100 Hz: U-04]', T(await tur('U-04|Kompanzasyonsuz')));
    await setP('wb.chain.imu_bw', 500);
  }
  if (part === 'all' || part === 'camp') {
    await page.click('#tab-kampanya'); await page.waitForTimeout(600);
    for (const [id, re] of [['T0_2', 'Karar belirsizliği|beklenen zincir'], ['T1_3', 'Karar belirsizliği'], ['T1_9', 'Karar belirsizliği|Piksel fazı'], ['T0_7', 'eşik|tolerans|ayrıştırması|alan dışına'], ['T3_3', 'Ölçüme dayalı']]) {
      await page.click('#ti-' + id); await page.waitForTimeout(500);
      console.log(`[Kampanya ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 220)));
      console.log(`[Kampanya ${id} satırları]`, T(await page.evaluate((r) => Array.from(document.querySelectorAll('#detail tr')).filter(e => new RegExp(r).test(e.innerText)).map(e => e.innerText.slice(0, 340)).join(' || '), re)));
      if (id === 'T0_7') { await page.evaluate(() => { const m = document.querySelector('#detail .measured'); if (m) m.scrollIntoView({ block: 'start' }); }); await page.screenshot({ path: path.join(out, '322_kampanya_t07_v137.png') }); }
    }
  }
  if (part === 'all' || part === 'rig') {
    await page.evaluate(() => window.__T.setParam('wb.earth.comp', false, true)); await page.waitForTimeout(800);
    await page.click('#tab-duzenek'); await page.waitForTimeout(1500);
    await page.click('#prun');
    await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 400000 });
    await page.waitForTimeout(500);
    // oynatmanın sonuna git ve Tam alan kipinde bak
    await page.evaluate(() => { const { RIG } = window.__T; RIG.t = RIG.play ? RIG.play.T - 0.05 : 59.9; window.__T.drawRigFrame(); }); await page.waitForTimeout(500);
    const btn = await page.$$('button'); for (const b of btn) { if ((await b.innerText()).trim() === 'Tam alan') { await b.click(); break; } }
    await page.waitForTimeout(500);
    const leg = await page.evaluate(() => Array.from(document.querySelectorAll('div, li, tr')).filter(e => /dünya dönüşü|gyro bias/.test(e.innerText) && e.innerText.length < 300).map(e => e.innerText.replace(/\s+/g, ' ')).slice(0, 4).join(' || '));
    console.log('[Düzenek, kompanzasyon KAPALI, son kare: Ω·δ / bias satırları]', T(leg));
    const met = await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /LOS RMS|FOV|alanda|Kalma/i.test(r.innerText)).map(r => r.innerText).join(' | '));
    console.log('[Düzenek metrikleri]', T(met));
    await page.screenshot({ path: path.join(out, '323_rig_comp_off_v137.png') });
    await page.evaluate(() => window.__T.setParam('wb.earth.comp', true, true)); await page.waitForTimeout(800);
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.7]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /kararları uygulandı|T0.7'nin kabulü|Dünya dönüşü/.test(f.innerText)).map(f => f.innerText.slice(0, 600)).join(' || '))));
    console.log('[V&V W4, W12, M10]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(W4|W12|M10)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 300)).join(' || '))));
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const b = Array.from(document.querySelectorAll('#mTur h4')).find(x => /Karar belirsizliği/.test(x.textContent)); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '324_model_guard_dark.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'kampanya', 'duzenek', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
    await pm.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pm.waitForTimeout(1800);
    await pm.evaluate(() => { const b = Array.from(document.querySelectorAll('#mTur h4')).find(x => /Karar belirsizliği/.test(x.textContent)); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pm.waitForTimeout(300);
    await pm.screenshot({ path: path.join(out, '325_mobile_guard.png') });
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
