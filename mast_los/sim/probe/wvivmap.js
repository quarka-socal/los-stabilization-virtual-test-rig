// İşletme senaryosunda rüzgâr VIV eşlemesi: taban açısı ve öteleme ivmesinin genliği, oranı ve fazı
const L = require('../engine.js'), D2R = Math.PI / 180, TAU = 2 * Math.PI;
for (const beta of [0, 30, 90]) {
  const P = L.defaultParams('ship'); P.wb.wviv.beta = beta;
  const VS = L.vivSpec(P);
  const src = Object.fromEntries(L.SRC_IDS.map(k => [k, k === 'viv']));
  const S = L.opScenario(P, { T: 120, seed: 5, src, mech: { coupling: true, earth: true }, fs: 2000, ch: ['base_r', 'base_p', 'acc_y', 'opt_el', 'opt_xel'] });
  S.rec.ch.push('acc_e');
  const R = L.runSim(P, S, null);
  const i0 = 20000, n = R.meta.nRec;
  const rms = (c) => { let s = 0; for (let i = i0; i < n; i++) s += R.rec[c][i] ** 2; return Math.sqrt(s / (n - i0)); };
  let sxy = 0; for (let i = i0; i < n; i++) sxy += R.rec.base_r[i] * R.rec.acc_y[i];
  const corr = sxy / (n - i0) / (rms('base_r') * rms('acc_y') || 1);
  const th = VS.A / Math.SQRT2, a = VS.y * (TAU * VS.f) ** 2 / Math.SQRT2;
  console.log(`β=${beta}°: roll RMS ${(rms('base_r') * 1e6).toFixed(1)} (beklenen ${(th * Math.abs(Math.cos(beta * D2R)) * 1e6).toFixed(1)}) µrad, pitch RMS ${(rms('base_p') * 1e6).toFixed(1)} (beklenen ${(th * Math.abs(Math.sin(beta * D2R)) * 1e6).toFixed(1)}) µrad, a_y RMS ${rms('acc_y').toFixed(3)} (beklenen ${(a * Math.abs(Math.cos(beta * D2R))).toFixed(3)}) m/s², roll–a_y korelasyon ${corr.toFixed(3)}; LOS el/xel RMS ${(rms('opt_el') * 1e6).toFixed(2)} / ${(rms('opt_xel') * 1e6).toFixed(2)} µrad`);
}
