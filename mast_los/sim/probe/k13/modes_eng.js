// §11 Örnek DUT — modlar: optik alt montaj ve gimbal yapısal modunun rezonansta yanıtı, benzetim adımına göre (fs 4000 / 16000 Hz).
// Beklenen genlik (sürekli zaman): optik g_acc·a/(2ζ), gimbal g_A·α/(2ζ). Yalnız ilgili mod açık (diğer mekanizmalar ve ölçüm gürültüsü kapalı).
// Çıktı: modes_eng.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const TAU = 2 * Math.PI, sq = (x) => x * x;
const MECH_OFF = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false]));
const MEAS_OFF = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
const out = [];
for (const kind of ['opt', 'gim']) for (const f0 of (kind === 'opt' ? [60, 120, 240, 400] : [90, 180, 360])) for (const fs of [4000, 16000]) {
  const P = L.defaultParams('sub'); P.dut.modes[kind].f = f0;
  const S = { T: 6, fs, world: 'lab', stab: true, seed: 3501, mech: Object.assign({}, MECH_OFF, kind === 'opt' ? { optMode: true } : { gimMode: true }), meas: MEAS_OFF,
    hexActive: false, cooler: false, cmd: [], vib: [], trans: [], acc: [], accMount: [], rec: { fs, ch: ['opt_el', 'mech_el'] } };
  if (kind === 'opt') S.trans = [{ type: 'sine', axis: 2, A: 1.0 / sq(TAU * f0), f: f0, t0: 0.5, ramp: 0.5 }];
  else S.vib = [{ type: 'sine', axis: 0, A: 5 / sq(TAU * f0), f: f0, t0: 0.5, ramp: 0.5 }];
  const R = L.runSim(P, S), n = R.meta.nRec, t = Float64Array.from({ length: n }, (_, i) => i / R.meta.fRec);
  let i0 = 0; while (t[i0] < 2) i0++; let i1 = i0; while (i1 < n && t[i1] < 5.8) i1++;
  const A = L.sineFit(t, R.rec.opt_el, f0, { i0, i1 }).A, M = P.dut.modes[kind], exp = (kind === 'opt' ? M.gAcc * 1.0 : M.gA * 5) / (2 * M.zeta);
  out.push({ kind, f0, fs, A, exp, err: A / exp - 1, wdt: TAU * f0 / fs });
  console.log(`${kind === 'opt' ? 'optik' : 'gimbal'} ${f0} Hz, fs ${fs}: genlik ${(A * 1e6).toFixed(3)} µrad ↔ beklenen ${(exp * 1e6).toFixed(3)} (fark ${(100 * (A / exp - 1)).toFixed(2)} %, ω·dt ${(TAU * f0 / fs).toFixed(3)})`);
}
require('fs').writeFileSync(path.join(__dirname, 'modes_eng.json'), JSON.stringify(out, null, 1));
