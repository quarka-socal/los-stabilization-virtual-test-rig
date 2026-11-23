// v13.4 kontrolü (§5 hexapod ve kolimatör): Model → Kolimatör uygunluğu paneli ve yeni parametre satırları,
// Düzenek (kolimatör demeti, göz bebeği diski, HUD ve metrik satırı; denizaltı ve gemi, stab AÇIK/KAPALI),
// Kampanya göz bebeği satırları (T0.1, T0.3, T1.3, T2.1–T2.3, T2.5), D_c = 250 mm değişikliği, koyu tema ve mobil taşma
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
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 170) + ' = ' + ((x.querySelector('input, select') || {}).value || '')).join(' || '), re);
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model satırları v13.4]', T(await rows('kolimatör|Kolimatör|göz bebeği|pivot|Pivot|θ_test|zemin|Zemin|ötelemesinin dinamiği')));
    console.log('[Kolimatör paneli, varsayılan]', T(await collTxt()));
    await page.evaluate(() => { const b = document.querySelector('#mColl'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '290_model_coll.png') });
    await page.evaluate(() => window.__T.setParam('wb.coll.Dc_mm', 250, true)); await page.waitForTimeout(1200);
    console.log('[Kolimatör paneli, D_c = 250 mm]', T(await collTxt()));
    await page.evaluate(() => window.__T.setParam('wb.coll.Dc_mm', 150, true)); await page.waitForTimeout(900);
    await page.evaluate(() => window.__T.setParam('wb.coll.pinhole_um', 100, true)); await page.waitForTimeout(900);
    console.log('[Kolimatör paneli, iğne deliği 100 µm]', T((await collTxt()).split('\n').filter(l => /iğne|İğne|pinhole|IFOV/.test(l)).join(' | ')));
    await page.evaluate(() => window.__T.setParam('wb.coll.pinhole_um', 50, true)); await page.waitForTimeout(900);
  }
  if (part === 'all' || part === 'rig') {
    await page.click('#tab-duzenek'); await page.waitForTimeout(1200);
    const grab = async (tag, file) => {
      const r = await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay();
        const p = RIG.play, ov = p.pupil.ov; let j = 0; for (let i = 0; i < ov.length; i++) if (ov[i] < ov[j]) j = i;
        RIG.t = j / p.fs; drawRigFrame(); window.scrollTo(0, 0);
        const r3 = RIG.r3, pl = r3.pupLocal;
        return { t: RIG.t, ov: ov[j], h: p.pupil.h[j], v: p.pupil.v[j], scene: pl ? [pl.x, pl.y] : null, col: r3.pupC, beamR: r3.cbeam.scale.x, discR: r3.pupDisc.scale.x,
          hud: Array.from(document.querySelectorAll('#hud .row')).map(x => x.innerText).filter(x => /göz bebeği/.test(x)).join(' | '),
          met: Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Göz bebeği/.test(r.innerText)).map(r => r.innerText).join(' | ') }; });
      console.log(`[Düzenek ${tag}]`, T(JSON.stringify(r)));
      await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, file) });
    };
    await grab('denizaltı deniz stab AÇIK (en düşük örtüşme anı)', '291_rig_sub_on.png');
    // yakın görünüm: kolimatör tarafından DUT penceresine bakış (demet silindiri ve göz bebeği diski)
    const close = async (file) => { await page.evaluate(() => { const r3 = window.__T.RIG.r3; r3.orb.az = 3.3; r3.orb.el = 0.22; r3.orb.dist = 1.9; r3.orb.target = r3.pupil0.clone(); r3.render(true); });
      await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, file), clip: { x: 34, y: 250, width: 1016, height: 630 } });
      await page.evaluate(() => { const r3 = window.__T.RIG.r3; r3.orb.target = new r3.T.Vector3(0.1, 0.85, -1.15); r3.resetView(); }); };
    await close('291b_rig_close_vig.png');
    await page.click('#pstab button[data-v="0"]'); await page.click('#prun'); await page.waitForTimeout(1500);
    await grab('denizaltı deniz stab KAPALI', '292_rig_sub_off.png');
    // tam örtüşme anı (renk yeşil)
    const g = await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; const p = RIG.play; let j = 0; for (let i = 0; i < p.pupil.ov.length; i++) if (p.pupil.ov[i] >= 0.999) { j = i; break; } RIG.t = j / p.fs; drawRigFrame(); return { t: RIG.t, ov: p.pupil.ov[j], col: RIG.r3.pupC }; });
    console.log('[Düzenek tam örtüşme anı]', JSON.stringify(g));
    await close('292b_rig_close_full.png');
    await page.click('#pstab button[data-v="1"]');
    // yalnız VIV tonu (öteleme küçük): koşu
    await page.selectOption('#pk', 'viv'); await page.click('#prun');
    await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
    await page.waitForTimeout(500);
    await grab('denizaltı VIV tonu stab AÇIK', '293_rig_sub_viv.png');
  }
  if (part === 'all' || part === 'camp') {
    await page.click('#tab-kampanya'); await page.waitForTimeout(500);
    for (const id of ['T0_1', 'T0_3', 'T1_3', 'T2_1', 'T2_2', 'T2_3', 'T2_5']) {
      await page.click('#ti-' + id); await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
      console.log(`[Kampanya ${id} göz bebeği / iletim]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /Göz bebeği|Kolimatör açıklığı|göz bebeği|iletimi|Kompanzasyon sonrası/.test(e.innerText)).map(e => e.innerText.slice(0, 400)).join(' || '))));
      if (id === 'T2_5' || id === 'T0_4') console.log(`[Kampanya ${id} ölçülen]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 300)));
    }
    await page.click('#ti-T1_3'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '294_kampanya_t13.png') });
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.4]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /Kolimatör|paralaks|normalize|Taban düzeltmesi bu/.test(f.innerText)).map(f => f.innerText.slice(0, 420)).join(' || '))));
    console.log('[V&V W11, D5]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(W11|D5)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 260)).join(' || '))));
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const { RIG, drawRigFrame } = window.__T; const p = RIG.play, ov = p.pupil.ov; let j = 0; for (let i = 0; i < ov.length; i++) if (ov[i] < ov[j]) j = i; RIG.t = j / p.fs; drawRigFrame(); });
    await pd.waitForTimeout(400); await pd.screenshot({ path: path.join(out, '295_rig_dark.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'duzenek']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
    await pm.evaluate(() => { const b = document.querySelector('#mColl'); if (b) b.scrollIntoView({ block: 'start' }); });
    await pm.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await pm.waitForTimeout(1500);
    await pm.evaluate(() => { const b = document.querySelector('#mColl'); if (b) b.scrollIntoView({ block: 'start' }); }); await pm.waitForTimeout(300);
    await pm.screenshot({ path: path.join(out, '296_mobile_coll.png') });
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
