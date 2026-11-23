// v13.6 kontrolü (§6 ölçüm zinciri ve belirsizlik): Model → Ölçüm zinciri etiketleri ve Kayıt istatistiği grubu, TUR tablosu (U-05
// video / yüksek hızlı, IMU grup gecikmeli toplam faz, U-06 çarpımsal kazanç, örtüşme düzeltmeli ε_r), taban düzeltmesi (toplanır kısım),
// parametre değişince panelin güncellenmesi; Kampanya T0.1 (S-eğrisi satırları ve tarama grafiği), T0.2 (beklenen zincir tabanı,
// DUT payı, otokolimatör tabanı), T3.3 (ölçüme dayalı denetim), T1.9 (piksel fazı satırı); Yöntem bulguları ve V&V (W7, M8, M9);
// koyu tema ve mobil taşma
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
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1500); };
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: ölçüm zinciri satırları]', T(await rows('IMU|Otokolimatör gürültüsü|Senkronizasyon|Centroid|Plaka ölçeği|Piksel fazı')));
    console.log('[Model: kayıt istatistiği grubu]', T(await rows('f_min|periyot sayısı|Welch|Kayıt süresi|Koherans|Taban düzeltmesi örneği')));
    console.log('[TUR tablosu]', T(await tur('U-05|U-06|Toplam belirsizlik|Senkron|Kompanzasyonsuz|PSD')));
    console.log('[Taban düzeltmesi adımları]', T(await tur('^4 ·|^5 ·')));
    await page.evaluate(() => { const b = document.querySelector('#mTur'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '310_model_tur_v136.png') });
    await setP('wb.chain.imu_bw', 100);
    console.log('[TUR, IMU bandı 100 Hz]', T(await tur('Kompanzasyonsuz')));
    await setP('wb.chain.imu_bw', 500);
    await setP('wb.chain.pixlock_px', 0.05);
    console.log('[TUR, piksel fazı 0,05 px]', T(await tur('U-06')));
    await setP('wb.chain.pixlock_px', 0.02);
    await setP('wb.unc.Trec', 300); await setP('wb.unc.fmin', 0.1);
    console.log('[TUR, kayıt 300 s, f_min 0,1 Hz]', T(await tur('PSD')));
    await setP('wb.unc.Trec', 900); await setP('wb.unc.fmin', 0.05);
  }
  if (part === 'all' || part === 'camp') {
    await page.click('#tab-kampanya'); await page.waitForTimeout(600);
    for (const [id, re] of [['T0_1', 'S-eğrisi|kazancı|Uydurma artığı|Ölçüm sayısı'], ['T0_2', 'beklenen zincir|DUT payı|Yüksek hızlı zincir|u_video'], ['T3_3', 'Ölçüme dayalı|TUR_smear'], ['T1_9', 'Piksel fazı']]) {
      await page.click('#ti-' + id); await page.waitForTimeout(500);
      console.log(`[Kampanya ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 200)));
      console.log(`[Kampanya ${id} satırları]`, T(await page.evaluate((r) => Array.from(document.querySelectorAll('#detail tr')).filter(e => new RegExp(r).test(e.innerText)).map(e => e.innerText.slice(0, 300)).join(' || '), re)));
      if (id === 'T0_1') {
        console.log('[T0.1 grafikleri]', await page.evaluate(() => Array.from(document.querySelectorAll('#detail .chartbox')).map(c => (c.innerText || '').split('\n')[0].slice(0, 90)).join(' || ')));
        await page.evaluate(() => { const c = document.querySelectorAll('#detail .chartbox'); if (c[1]) { c[1].scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(out, '311_kampanya_t01_scan.png') });
      }
      if (id === 'T0_2') { await page.evaluate(() => { const m = document.querySelector('#detail .measured'); if (m) m.scrollIntoView({ block: 'start' }); }); await page.screenshot({ path: path.join(out, '312_kampanya_t02.png') }); }
    }
  }
  if (part === 'all' || part === 'rig') {
    await page.click('#tab-duzenek'); await page.waitForTimeout(1500);
    const btn = await page.$$('button'); for (const b of btn) { if ((await b.innerText()).trim() === 'Piksel') { await b.click(); break; } }
    await page.waitForTimeout(600);
    const fp = await page.evaluate(() => { const n = Array.from(document.querySelectorAll('p, div, span')).find(e => /Piksel: hedefi izleyen büyüteç/.test(e.textContent) && e.children.length === 0); return n ? n.textContent.slice(0, 360) : '(not yok)'; });
    console.log('[Düzenek dedektör, Piksel kipi]', T(fp));
    await page.evaluate(() => { const n = Array.from(document.querySelectorAll('p, div, span')).find(e => /Piksel: hedefi izleyen büyüteç/.test(e.textContent) && e.children.length === 0); if (n) n.scrollIntoView({ block: 'end' }); }); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, '316_rig_loupe_pixphase.png') });
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.6]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /Piksel fazı hedef|grup gecikmesi|taban oranıdır/.test(f.innerText)).map(f => f.innerText.slice(0, 420)).join(' || '))));
    console.log('[V&V W7, M8, M9]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(W7|M8|M9)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 300)).join(' || '))));
    console.log('[V&V özeti]', T(await page.evaluate(() => { const e = Array.from(document.querySelectorAll('#method *')).find(x => /doğrulama geçti|kontrol geçti|\/\d+ geçti/.test(x.textContent) && x.children.length === 0); return e ? e.textContent.slice(0, 160) : '(yok)'; })));
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const b = document.querySelector('#mTur'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '313_model_tur_dark.png') });
    await pd.click('#tab-kampanya'); await pd.waitForTimeout(800);
    await pd.click('#ti-T0_1'); await pd.waitForTimeout(600);
    await pd.evaluate(() => { const c = document.querySelectorAll('#detail .chartbox'); if (c[1]) { c[1].scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pd.waitForTimeout(400);
    await pd.screenshot({ path: path.join(out, '314_t01_scan_dark.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'kampanya', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
    await pm.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pm.waitForTimeout(1800);
    await pm.evaluate(() => { const b = document.querySelector('#mTur'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pm.waitForTimeout(300);
    await pm.screenshot({ path: path.join(out, '315_mobile_tur.png') });
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
