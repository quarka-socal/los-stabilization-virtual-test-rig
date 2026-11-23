// Teknik kılavuz §4 (VIV) — PROTOTİP (varsayılanı değiştirmez): denizaltı mastında VIV'in mast başı ötelemesi.
// Konsol mast: tepe açısı θ ile tepe ötelemesi y = θ·L/κ birlikte oluşur (gemi direğindeki gibi). İleri harekette akış pruvadan
// gelir; girdap kuvveti akışa dik yatay → y (iskele) yönü: öteleme t_y = 1, dönme vektörü θ·(z × y) = −θ·x → roll = −1.
// Motorun genel rüzgâr VIV araçları (windTone, windVivComps) bu hydro VS'yle çağrılır:
//   (a) T2.2 türü dwell, f_n'de, dar bant OFF/ON: yalnız açısal (bugünkü model) ↔ açısal + öteleme; yol ayrımı (ayna, video − ayna)
//   (b) işletme B2-01 satırı (600 s): yalnız açısal (kuplaj) ↔ açısal + öteleme (kuplaj + dengesizlik + optik montaj)
// Argüman yok. Çıktı: subtrans.json, subtrans.log
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const P0 = L.defaultParams('sub'), v = P0.wb.viv, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const mkVS = (Lm, kth, amp) => { const VS = Object.assign({}, L.vivSpec(P0)), th = (amp == null ? v.amp_deg : amp) * D2R;
  return Object.assign(VS, { A: th, roll: -1, pitch: 0, tx: 0, ty: 1, y: Lm > 0 ? th * Lm / kth : 0, lin: Lm > 0 }); };
const CTX = {}; L.runTest('T0.1', P0, CTX, null);       // kampanyadaki gibi kalibre IFOV (video genlikleri sayfayla tutarlı)
const f = Math.round(v.fn * 100) / 100, ramp = Math.max(1, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core;
const dwell = (VS, resOn, seed) => {
  const P = L.cloneParams(P0); P.dut.ctl.res.on = resOn;
  const tn = L.windTone(P, VS, f, t0, t1, ramp);
  const R = L.runSim(P, L.labScenario(P, { label: 'proto', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed }));
  const z = L.fitSegments(P, R, [{ axis: 0, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f }], CTX)[0];
  const ph = (a, b) => Math.hypot(a.a - b.a, a.b - b.b) / Math.SQRT2 * 1e6;
  return { el: z.fe.A / Math.SQRT2 * 1e6, xel: z.fx.A / Math.SQRT2 * 1e6, mEl: z.ae.A / Math.SQRT2 * 1e6, oEl: ph(z.fe, z.ae), mXel: z.ax.A / Math.SQRT2 * 1e6, oXel: ph(z.fx, z.ax), y: tn.y * 1e3, acc: tn.acc, lim: tn.limited };
};
const opB201 = (VS, trans) => {
  // B2-01 satırı: yalnız VIV kaynağı; açısal + öteleme durumunda gemideki gibi dengesizlik ve optik montaj mekanizmaları da açık
  const src = Object.fromEntries(L.SRC_IDS.map(k => [k, false]));
  const mech = trans ? { coupling: true, imbalance: true, optMode: true, earth: true } : { coupling: true, earth: true };
  const S = L.opScenario(P0, { T: 600, seed: 11, src, mech, fs: 2000, label: 'B2-01 proto', ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'rot', 'rot_res'] });
  const wv = L.windVivComps(P0, VS, 600, L.makeRngFactory(((11) >>> 0))('viv'), f, 5);
  S.cmd.push(...wv.cmd); S.acc.push(...wv.acc); S.resF = f;
  const R = L.runSim(P0, S), M = L.losMetrics(R, P0, { skip: 20, psd: false });
  return { el: M.rms.el * 1e6, xel: M.rms.xel * 1e6 };
};
const out = { f, cases: [] };
const t00 = Date.now();
// bugünkü işletme satırı (motorun kendi B2-01 senaryosu) — referans
{ const row = L.OP_ROWS.find(q => q.id === 'B2-01'), R = L.runSim(P0, L.rowScenario(P0, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P0, { skip: 20, psd: false });
  out.opRef = { el: M.rms.el * 1e6, xel: M.rms.xel * 1e6 };
  console.log(`işletme B2-01 (motor, yalnız açısal, narrowSeries): el ${out.opRef.el.toFixed(3)} / xel ${out.opRef.xel.toFixed(3)} µrad`); }
for (const [nm, Lm, kth, amp] of [['yalnız açısal (bugünkü model)', 0, 1.5, null], ['L = 2 m, κ = 1,5', 2, 1.5, null], ['L = 4 m, κ = 1,5', 4, 1.5, null], ['L = 6 m, κ = 1,5', 6, 1.5, null],
  ['L = 4 m, κ = 1,5, genlik 0,10°', 4, 1.5, 0.10], ['L = 4 m, κ = 1,5, genlik 0,82° (patent: ±40 mm / 4,2 m)', 4, 1.5, 0.82]]) {
  const VS = mkVS(Lm, kth, amp), a = dwell(VS, false, 2201), b = dwell(VS, true, 2202), op = opB201(VS, Lm > 0);
  const c = { nm, L: Lm, kth, amp: VS.A / D2R, y: a.y, acc: a.acc, lim: a.lim, off: a, on: b, op };
  out.cases.push(c);
  console.log(`${nm}: θ ${c.amp.toFixed(3)}°, y ±${c.y.toFixed(2)} mm, ivme ${c.acc.toFixed(3)} m/s²${c.lim ? ' (ERİŞİM SINIRLI)' : ''}`);
  console.log(`   dwell f_n: OFF el ${a.el.toFixed(2)} (ayna ${a.mEl.toFixed(2)}, video − ayna ${a.oEl.toFixed(2)}) / xel ${a.xel.toFixed(2)} → ON el ${b.el.toFixed(2)} (ayna ${b.mEl.toFixed(2)}, video − ayna ${b.oEl.toFixed(2)}) / xel ${b.xel.toFixed(2)} µrad`);
  console.log(`   işletme B2-01 (600 s): el ${op.el.toFixed(3)} / xel ${op.xel.toFixed(3)} µrad`);
}
console.log(`süre ${((Date.now() - t00) / 1000).toFixed(0)} s`);
require('fs').writeFileSync(path.join(__dirname, 'subtrans.json'), JSON.stringify(out, null, 1));
