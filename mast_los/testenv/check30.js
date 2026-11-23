// v13.5 kontrolü (§5 kullanıcı kararları): Model satırları (δ, paralaks payı, öteleme sığdırma, vinyetleme kuralı, varsayılan
// kipler), kolimatör paneli (odak toleransı, sığdırma, kural; L_off 0,15 m'de GEÇERSİZ; δ = 225 µm), gemi D_c 200 mm, Düzenek
// (sığdırılmış deniz ötelemesi, δ ≠ 0 koşusunda paralaks satırı), Kampanya (T1.3 ×q_c, T2.5 2–3 Hz, T2.2 iletim), Yöntem
// bulguları ve V&V (M7, W11, K7, D5), Bütçe taban düzeltmesi notu, koyu tema ve mobil taşma
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
  const collTxt = () => page.evaluate(() => { const b = document.querySelector('#mColl'); return b ? b.innerText : '(panel yok)'; });
  const collRows = async (re) => (await collTxt()).split('\n').filter(l => new RegExp(re).test(l)).join(' | ');
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 150) + ' = ' + ((x.querySelector('input[type=checkbox]') || {}).checked != null ? (x.querySelector('input[type=checkbox]').checked ? 'açık' : 'kapalı') : ((x.querySelector('input, select') || {}).value || ''))).join(' || '), re);
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1500); };
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model satırları v13.5]', T(await rows('odak hatası|Paralaks payı|sığdır|vinyetlemede|Taban düzeltmesi|ötelemesinin dinamiği|Kolimatör açıklığı')));
    console.log('[Kolimatör paneli, varsayılan]', T(await collRows('Odak toleransı|Laboratuvar deniz|Gerçek vinyetleme|En büyük yanal|^T1.3|^T2.3|^T2.5')));
    await page.evaluate(() => { const b = document.querySelector('#mColl'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '300_model_coll_v135.png') });
    await setP('wb.hex.L_off', 0.15);
    console.log('[Kolimatör paneli, L_off = 0,15 m]', T(await collRows('Laboratuvar deniz|^T0.3|^T1.3|^T2.1|Ne denetleniyor')));
    await setP('wb.hex.L_off', 0);
    await setP('wb.coll.delta_um', 225);
    console.log('[Kolimatör paneli, δ = 225 µm]', T(await collRows('Odak toleransı')));
    await setP('wb.coll.delta_um', 0);
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#platSeg button')).find(x => x.getAttribute('data-p') === 'ship'); if (b) b.click(); }); await page.waitForTimeout(2500);
    console.log('[Gemi: kolimatör paneli]', T(await collRows('Açıklık, durağan|Vinyetlemesiz|En büyük yanal|Laboratuvar deniz|^T1.3')));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#platSeg button')).find(x => x.getAttribute('data-p') === 'sub'); if (b) b.click(); }); await page.waitForTimeout(2500);
  }
  if (part === 'all' || part === 'rig') {
    await page.click('#tab-duzenek'); await page.waitForTimeout(1200);
    const met = () => page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Göz bebeği/.test(r.innerText)).map(r => r.innerText).join(' | '));
    console.log('[Düzenek denizaltı deniz, stab AÇIK]', T(await met()));
    const r0 = await page.evaluate(() => { const { RIG } = window.__T; const p = RIG.play; let mx = 0; for (let i = 0; i < p.pupil.h.length; i++) mx = Math.max(mx, Math.hypot(p.pupil.h[i], p.pupil.v[i])); return { seaQ: p.seaQ, eMax: mx }; });
    console.log('[Düzenek oynatma: deniz ötelemesi]', JSON.stringify(r0));
    await page.screenshot({ path: path.join(out, '301_rig_sub_v135.png') });
    // δ = 225 µm ile koşu: paralaks satırı
    await page.evaluate(() => window.__T.setParam('wb.coll.delta_um', 225, true)); await page.waitForTimeout(800);
    await page.click('#prun');
    await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
    await page.waitForTimeout(500);
    console.log('[Düzenek δ = 225 µm koşusu]', T(await met()));
    await page.evaluate(() => window.__T.setParam('wb.coll.delta_um', 0, true)); await page.waitForTimeout(800);
  }
  if (part === 'all' || part === 'camp') {
    await page.click('#tab-kampanya'); await page.waitForTimeout(500);
    for (const id of ['T0_3', 'T1_3', 'T2_2', 'T2_3', 'T2_5']) {
      await page.click('#ti-' + id); await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
      console.log(`[Kampanya ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 220)));
      console.log(`[Kampanya ${id} satırları]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /Göz bebeği|Deniz ötelemesi|Taban düzeltmesi|iletimi|Öteleme [xyz]|kolimatör demetine sığacak/.test(e.innerText)).map(e => e.innerText.slice(0, 260)).join(' || '))));
    }
    await page.click('#ti-T2_5'); await page.waitForTimeout(300);
    console.log('[T2.5 test tanımı]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail td, #detail p')).filter(e => /2 ve 3 Hz/.test(e.innerText)).map(e => e.innerText.slice(0, 260)).join(' || '))));
    await page.screenshot({ path: path.join(out, '302_kampanya_t25_v135.png') });
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.5]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /Kolimatör|kolimatör|paralaks|bacaklarla|Taban düzeltmesi bu|normalize/.test(f.innerText)).map(f => f.innerText.slice(0, 300)).join(' || '))));
    console.log('[V&V M7, W11, K7, D5]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(M7|W11|K7|D5)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 220)).join(' || '))));
    await page.click('#tab-butce'); await page.waitForTimeout(900);
    console.log('[Bütçe taban düzeltmesi notu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('p')).filter(p => /Taban düzeltmesi kapalı/.test(p.innerText)).map(p => p.innerText.slice(0, 260)).join(' || '))));
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const b = document.querySelector('#mColl'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '303_model_coll_dark.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'duzenek', 'kampanya', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
