// Teknik kılavuz §3 — Düzenek oynatması (deniz profili, 60 s): hexapod açısı ve ötelemesi, q ölçeği, LOS ve video
'use strict';
const L = require('../../engine.js'), fs = require('fs'), path = require('path');
const R2D = 180 / Math.PI;
const S = (k) => L.defaultParams(k || 'sub'), six = (P) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); return P; };
const cases = [['Denizaltı varsayılanı (dar, h = 0)', S()], ['Denizaltı 6-DOF SS4 (h = 0)', six(S())], ['Denizaltı dar, h = 10 m', (() => { const P = S(); P.wb.sea.h = 10; return P; })()],
  ['Gemi varsayılanı (dar, h = 15 m)', S('ship')], ['Gemi 6-DOF SS4 (h = 15 m)', six(S('ship'))]];
const out = [];
for (const [name, P] of cases) {
  const t0 = Date.now(), p = L.playScenario(P, { kind: 'sea', T: 60, stab: true }), D = L.seaDOF(P);
  const pk = (a) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; };
  const rms = (a, i0) => { let s = 0, n = 0; for (let i = i0 || 0; i < a.length; i++) { s += a[i] * a[i]; n++; } return Math.sqrt(s / n); };
  const i0 = 10 * p.fs;            // rampa sonrası
  const ang = ['base_r', 'base_p', 'base_y'].map((c, ax) => ({ ax, pkDeg: pk(p[c]) * R2D, rmsDeg: rms(p[c], i0) * R2D, sigDeg: D.ang[ax].sigma * R2D }));
  const tr = p.tr_x ? ['tr_x', 'tr_y', 'tr_z'].map(c => ({ c, pk: pk(p[c]), rms: rms(p[c], i0) })) : null;
  const rec = { name, sec: (Date.now() - t0) / 1000, seaQ: p.seaQ || null, ang, tr, m: { rmsEl: p.metrics.rmsEl * 1e6, rmsXel: p.metrics.rmsXel * 1e6, wanderEl: p.metrics.wanderEl * 1e6, wanderXel: p.metrics.wanderXel * 1e6, valid: p.metrics.validFrac, base: p.metrics.base } };
  out.push(rec);
  console.log(`\n[${name}] ${rec.sec.toFixed(0)} s` + (p.seaQ ? ` · öteleme talebi ±${p.seaQ.demand.toFixed(3)} m, q = ${p.seaQ.q.toFixed(4)} → ±${(p.seaQ.demand * p.seaQ.q * 1e3).toFixed(1)} mm` : ' · öteleme yok'));
  console.log('  açı (tepe / RMS / profil σ, °): ' + ang.map(a => `${['roll', 'pitch', 'yaw'][a.ax]} ${a.pkDeg.toFixed(2)} / ${a.rmsDeg.toFixed(3)} / ${a.sigDeg.toFixed(3)}`).join(' · '));
  if (tr) console.log('  öteleme (tepe / RMS, mm): ' + tr.map(t => `${t.c} ${(t.pk * 1e3).toFixed(1)} / ${(t.rms * 1e3).toFixed(1)}`).join(' · '));
  console.log(`  LOS RMS el/xel ${rec.m.rmsEl.toFixed(2)} / ${rec.m.rmsXel.toFixed(2)} µrad · wander ${rec.m.wanderEl.toFixed(2)} / ${rec.m.wanderXel.toFixed(2)} µrad · geçerli kare %${(rec.m.valid * 100).toFixed(1)} · hexapod komut tepe roll θ/ω/α ${rec.m.base[0].th.toFixed(2)}° / ${rec.m.base[0].om.toFixed(2)}°/s / ${rec.m.base[0].al.toFixed(2)}°/s²`);
}
fs.writeFileSync(path.join(__dirname, 'play.json'), JSON.stringify(out, null, 1));
