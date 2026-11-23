// v13.11 kontrolü (§11 örnek DUT — gyro, modlar, optik): Model → gyro grubu satırları (xel eksen kaçıklığı yeni), Kampanya sonuçlarında
// T3.4 (harmonik toplamı, küçük hareket kazancı) ve T1.1 (el / xel çapraz katsayı), Yöntem (v13.11 bulguları; kestirim hatası ve mod frekansı
// değişince canlı metin), V&V (M4 dağılım, C3, toplam); koyu tema, mobil
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
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1200); };
  const finds = (re, n) => page.evaluate(([r, n]) => Array.from(document.querySelectorAll('#findings .finding')).filter(f => new RegExp(r).test(f.innerText)).map(f => f.innerText.slice(0, n)).join(' || '), [re, n || 1600]);
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: gyro grubu]', T(await rows('Gyro eksen kaçıklığı|Gyro ARW|bant genişliği|Optik alt montaj|Gimbal yapısal|Kriyo|Soğutucu LOS|Gerçek IFOV|distorsiyon')));
    const R = await page.evaluate(() => { const S = window.__T.STATE.results; const g = (id, re) => { const r = S[id] && S[id].res; const k = r && r.kv ? r.kv.find(q => new RegExp(re).test(q[0])) : null; return k ? k.join(': ') : '—'; };
      return [S['T3.4'] && S['T3.4'].res.status + ' ' + S['T3.4'].res.measured, g('T3.4', 'Gerçek soğutucu'), g('T3.4', 'küçük hareket'), g('T3.4', '^Katlanma'), g('T1.1', 'çapraz eksen')].join(' || '); });
    console.log('[Kampanya sonuçları: T3.4, T1.1]', T(R));
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#pg .prow')).find(x => /Gyro eksen kaçıklığı \(xel\)/.test(x.textContent)); if (r) { r.scrollIntoView({ block: 'center' }); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '360_model_gyro_v1311.png') });
    await setP('dut.modes.opt.f', 200);
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem, optik modu 200 Hz: mod bulgusu]', T(await finds('statik esnekliği', 900)));
    await page.click('#tab-model'); await page.waitForTimeout(400); await setP('dut.modes.opt.f', 120);
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.11]', T(await finds('bias kararsızlığı kestirimi|statik esnekliği|harmonikleri videoda|yerçekimi izdüşümünü|bant genişliği faz payını|Benzetim adımı|T0.1.in ölçek belirsizliği')));
    console.log('[V&V M4, C3]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(M4|C3)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 700)).join(' || '))));
    console.log('[V&V kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.tile')).filter(t => /TOPLAM|ANALİTİK/i.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /bias kararsızlığı kestirimi/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '361_yontem_v1311.png') });
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /statik esnekliği/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '362_yontem_dark_v1311.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'kampanya', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      if (tab === 'model') await pm.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
