// v13.14 kontrolü (§13 Düzenek sekmesi): 3B kinematik (mekanik zincirin bakış doğrultusu ↔ motorun optik LOS'u, stab KAPALI ve AÇIK),
// metrik tablosu (RMS / wander bilgi satırı, radyal P99, wander penceresi, gerçekleşen hexapod tepeleri), darbe ×2 etiketi, dedektör notu,
// koyu tema, mobil
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
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(2200);
  const met = () => page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).map(r => r.innerText.replace(/\s+/g, ' ') + (r.querySelector('td.over') ? ' [AŞIM]' : '')).join(' || ') + ' ## ' + (document.querySelector('#pmet p') || {}).innerText);
  const play = async (kind, stab, scale) => {
    await page.selectOption('#pk', kind); if (scale) await page.selectOption('#pscale', String(scale));
    await page.click(`#pstab button[data-v="${stab ? 1 : 0}"]`);
    await page.click('#prun'); for (let i = 0; i < 120; i++) { await page.waitForTimeout(500); const s = await page.evaluate(() => document.querySelector('#pstat').textContent); if (/^Gösterilen/.test(s)) break; }
    await page.waitForTimeout(400); if (await page.evaluate(() => window.__T.RIG.playing)) await page.evaluate(() => window.__T.togglePlay()); };
  // 3B: mekanik zincir (taban R · gimbal a, e) bakış doğrultusu kolimatör çerçevesinde ↔ kaydedilen optik LOS hatası (50 Hz)
  const kin = () => page.evaluate(() => {
    const r3 = window.__T.RIG.r3, p = window.__T.RIG.play, TH = window.THREE; if (!r3 || !r3.ok) return 'WebGL yok';
    let mx = 0, s2 = 0, n = 0, big = 0, worst = null;
    for (let i = 0; i < p.n; i += 10) {
      const a = p.geom.a0 + (p.stab ? p.enc_a[i] : 0), e = p.geom.e0 + (p.stab ? p.enc_e[i] : 0), tr = p.tr_x ? [p.tr_x[i], p.tr_y[i], p.tr_z[i]] : null;
      r3.setGeom(p.geom.a0, p.geom.e0, p.geom.Lpg); r3.setPose(p.base_r[i], p.base_p[i], p.base_y[i], a, e, null, tr);
      const dl = new TH.Vector3(1, 0, 0).transformDirection(r3.el.matrixWorld).applyQuaternion(r3.colG.quaternion.clone().invert());
      const elM = Math.atan2(dl.y, -dl.z), xelM = Math.atan2(-dl.x, -dl.z), de = elM - p.opt_el[i], dx = xelM - p.opt_xel[i], d = Math.hypot(de, dx);
      if (d > mx) { mx = d; worst = { t: i / p.fs, elM, xelM, el: p.opt_el[i], xel: p.opt_xel[i] }; } s2 += d * d; n++; big = Math.max(big, Math.hypot(p.opt_el[i], p.opt_xel[i]));
    }
    window.__T.drawRigFrame();
    return `stab ${p.stab ? 'AÇIK' : 'KAPALI'}: ${n} kare; LOS hatası en büyük ${(big * 1e6).toFixed(1)} µrad; mekanik zincir ↔ optik LOS farkı en büyük ${(mx * 1e6).toFixed(2)} µrad, RMS ${(Math.sqrt(s2 / n) * 1e6).toFixed(2)} µrad` +
      (worst ? ` (t ${worst.t.toFixed(2)} s: mekanik el ${(worst.elM * 1e6).toFixed(1)} / xel ${(worst.xelM * 1e6).toFixed(1)} ↔ optik ${(worst.el * 1e6).toFixed(1)} / ${(worst.xel * 1e6).toFixed(1)} µrad)` : '');
  });
  if (part === 'all' || part === 'kin') {
    console.log('[3B kinematik, varsayılan deniz profili]', await kin());
    await play('sea', false); console.log('[3B kinematik]', await kin());
    await play('sine', false); console.log('[3B kinematik, sinüs]', await kin());
    await play('sine', true); console.log('[3B kinematik, sinüs]', await kin());
  }
  if (part === 'all' || part === 'ui') {
    await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(2200);
    console.log('[metrikler: varsayılan deniz, stab AÇIK]', T(await met()));
    await page.evaluate(() => { window.__T.RIG.t = 30; window.__T.drawRigFrame(); }); await page.click('#fpa ~ * button[data-e="raw"]').catch(() => {});
    await page.click('button[data-m="near"]'); await page.waitForTimeout(300);
    console.log('[dedektör notu, piksel büyüteci]', T(await page.evaluate(() => document.querySelector('#fpaNote').textContent)));
    await page.screenshot({ path: path.join(out, '390_duzenek_v1314.png') });
    await page.click('button[data-m="auto"]');
    await play('slap', true, 2); console.log('[metrikler: darbe ×2, stab AÇIK]', T(await met()));
    await page.evaluate(() => { window.__T.RIG.t = 9.1; window.__T.drawRigFrame(); }); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, '391_duzenek_slap_v1314.png') });
    await page.selectOption('#pscale', '1'); await play('viv', true); console.log('[metrikler: VIV, stab AÇIK]', T(await met()));
    await play('still', true); console.log('[metrikler: durağan]', T(await met()));
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await pd.waitForTimeout(2400);
    await pd.evaluate(() => { window.__T.RIG.t = 30; window.__T.drawRigFrame(); }); await pd.waitForTimeout(200);
    await pd.screenshot({ path: path.join(out, '392_duzenek_dark_v1314.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await pm.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await pm.waitForTimeout(2400);
    const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(`[mobil düzenek] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    await pm.screenshot({ path: path.join(out, '393_duzenek_mobile_v1314.png'), fullPage: false });
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
