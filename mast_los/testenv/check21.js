// Düzenek 3B LOS ışını / halkası ↔ dedektör tutarlılığı: halka yalnız açısal LOS hatasını (×büyütme) göstermeli,
// ötelemeden bağımsız olmalı; dedektör izi halka izinin 180° döndürülmüşü. Dar profil, 6-DOF SS4, a0 = 60°.
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(2000);
  // örnekleme: her zamanda halkanın kolimatör çerçevesindeki konumu → ima ettiği açı / büyütme ↔ kaydedilen optik LOS hatası
  const sample = (mag) => page.evaluate((mag) => {
    const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay();
    RIG.mag = mag; const sel = document.querySelector('#pmag'); if (sel) sel.value = String(mag);
    const p = RIG.play, T3 = window.THREE, r3 = RIG.r3, rows = []; let worstRel = 0, maxRing = 0, maxTr = 0, maxDev = 0;
    for (const t of [3, 9, 17, 23, 31, 38, 44, 52, 58]) {
      RIG.t = t; drawRigFrame();
      const i = Math.min(p.n - 1, Math.round(t * p.fs)), m = p.stab ? mag : 1;
      const pu = new T3.Vector3(0.12, 0, 0).applyMatrix4(r3.el.matrixWorld), pl = r3.colG.worldToLocal(pu.clone()), D = Math.abs(r3.zl - pl.z), hl = r3.hitLocal;
      const thX = Math.atan(-hl.x / D) / m, thY = Math.atan(hl.y / D) / m;     // ima edilen xel, el (rad)
      const k = Math.min(p.video.n - 1, Math.round(t * p.video.fps)), IF = p.geom.IFOVt || p.geom.IFOV;
      const vx = p.video.x[k] * IF, vy = p.video.y[k] * IF;                  // dedektör (centroid) → rad
      const e = Math.max(Math.abs(thX - p.opt_xel[i]), Math.abs(thY - p.opt_el[i])) / Math.max(1e-7, Math.hypot(p.opt_xel[i], p.opt_el[i]));
      worstRel = Math.max(worstRel, e); maxRing = Math.max(maxRing, Math.hypot(hl.x, hl.y));
      if (p.tr_x) maxTr = Math.max(maxTr, Math.hypot(p.tr_x[i], p.tr_z[i]));
      maxDev = Math.max(maxDev, Math.hypot(vx - p.opt_xel[i], vy - p.opt_el[i]));
      rows.push(`t ${t}: opt el/xel ${(p.opt_el[i] * 1e6).toFixed(1)}/${(p.opt_xel[i] * 1e6).toFixed(1)} µrad · halkadan ${(thY * 1e6).toFixed(1)}/${(thX * 1e6).toFixed(1)} · dedektör ${(vy * 1e6).toFixed(1)}/${(vx * 1e6).toFixed(1)} · halka ${(hl.x * 1e3).toFixed(2)}, ${(hl.y * 1e3).toFixed(2)} mm` + (p.tr_x ? ` · öteleme x/z ${(p.tr_x[i] * 1e3).toFixed(0)}/${(p.tr_z[i] * 1e3).toFixed(0)} mm` : ''));
    }
    return { mag, rows, worstRel, maxRingMm: maxRing * 1e3, maxTrMm: maxTr * 1e3, maxDetDevUrad: maxDev * 1e6, hud: document.querySelector('#hud').innerText.replace(/\n/g, ' | '), ttl: document.querySelector('#fpaTtl').textContent };
  }, mag);
  const show = (lab, r) => { console.log(`[${lab} ×${r.mag}] en büyük göreli fark ${r.worstRel.toExponential(2)} · halka en büyük ${r.maxRingMm.toFixed(2)} mm · öteleme en büyük ${r.maxTrMm.toFixed(0)} mm · dedektör − LOS en büyük ${r.maxDetDevUrad.toFixed(2)} µrad · başlık ${r.ttl}`); console.log('   ' + r.rows.slice(0, 4).join('\n   ')); console.log('   HUD: ' + r.hud); };
  show('dar', await sample(1)); show('dar', await sample(100));
  await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; RIG.mag = 100; RIG.t = 30; drawRigFrame(); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '220_rig_dar_x100.png') });
  // 6-DOF SS4
  await page.click('#tab-model'); await page.waitForTimeout(600);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /SS4 6-DOF/.test(x.textContent)); b.click(); }); await page.waitForTimeout(500);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  await page.waitForTimeout(500);
  show('6-DOF SS4', await sample(1)); show('6-DOF SS4', await sample(100)); show('6-DOF SS4', await sample(1000));
  await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; RIG.mag = 100; RIG.t = 30; drawRigFrame(); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '221_rig_6dof_x100.png') });
  await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; RIG.mag = 1; RIG.t = 30; drawRigFrame(); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '222_rig_6dof_x1.png') });
  // stab KAPALI (6-DOF): ışın gerçek açıyla (×1)
  await page.evaluate(() => { const b = document.querySelector('#pstab button[data-v="0"]'); b.click(); document.querySelector('#prun').click(); });
  await page.waitForFunction(() => /stab KAPALI/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  show('6-DOF SS4 stab KAPALI', await sample(100));
  await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; RIG.t = 30; drawRigFrame(); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '223_rig_6dof_off.png') });
  // a0 = 60°: kolimatör nominal LOS boyunca dönmeli, ışın DUT kafasından çıkmalı
  await page.evaluate(() => { document.querySelector('#pstab button[data-v="1"]').click(); window.__T.setParam('dut.geom.a0', 60); });
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && /stab AÇIK/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  show('a0 = 60°', await sample(100));
  console.log('[a0 = 60°] ışın yönü ↔ kafa yönü (°):', await page.evaluate(() => { const { RIG, drawRigFrame } = window.__T; RIG.t = 30; drawRigFrame(); const T3 = window.THREE, r3 = RIG.r3; const head = new T3.Vector3(1, 0, 0).transformDirection(r3.el.matrixWorld); const bq = new T3.Vector3(0, 1, 0).applyQuaternion(r3.beam.quaternion); return (head.angleTo(bq) * 180 / Math.PI).toFixed(4); }));
  await page.screenshot({ path: path.join(out, '224_rig_a060.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
