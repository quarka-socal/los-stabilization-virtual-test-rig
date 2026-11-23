const L = require('./engine.js');
function run(mod, label) {
  const P = L.defaultParams(); mod(P);
  const S = L.labScenario(P, { label, T: 30, fs: 4000, stab: true, seed: 301, rec: { fs: 2000, ch: ['opt_el', 'opt_xel', 'w_e', 'w_a', 'tq_e', 'tq_a'] } });
  const R = L.runSim(P, S);
  const i0 = 10000, x = Float64Array.from(R.rec.opt_xel.subarray(i0)), e = Float64Array.from(R.rec.opt_el.subarray(i0));
  const p = L.welch(L.detrend(x, 'linear'), 2000, 4096);
  let pk = 0, fpk = 0; for (let i = 1; i < p.f.length; i++) if (p.P[i] > pk) { pk = p.P[i]; fpk = p.f[i]; }
  const wa = Float64Array.from(R.rec.w_a.subarray(i0));
  console.log(label.padEnd(34), 'el', (L.aRms(L.detrend(e, 'linear')) * 1e6).toFixed(2), 'xel', (L.aRms(L.detrend(x, 'linear')) * 1e6).toFixed(2), 'µrad; xel PSD tepe', fpk.toFixed(1), 'Hz; |w_a| RMS', (L.aRms(wa) * 1e3).toFixed(3), 'mrad/s; tq_a RMS', L.aRms(L.detrend(Float64Array.from(R.rec.tq_a.subarray(i0)), 'mean')).toFixed(4));
}
run(P => {}, 'varsayılan (LuGre FF)');
run(P => { P.dut.ctl.ff.on = false; }, 'FF kapalı');
run(P => { P.dut.ctl.ff.f_est = 400; }, 'LuGre FF, f_est 400 Hz');
run(P => { P.dut.ctl.ff.eta = 0.7; }, 'LuGre FF, η 0.7');
run(P => { P.wb.hex.microvib = 0; }, 'mikro-titreşim yok');
run(P => { P.dut.ctl.ff.on = false; P.dut.el.sigma0 = 3e3; P.dut.az.sigma0 = 1.2e4; }, 'FF kapalı, yumuşak σ0');
