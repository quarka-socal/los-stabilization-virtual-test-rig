// T2.1 roll süpürmesinde (stab ON, dar bant açık) 3–5 Hz koheransının nedeni: sürtünme mi, izleyen dar bant mı?
const L = require('../engine.js'), D2R = Math.PI / 180;
function run(label, mod) {
  const P = L.defaultParams('ship'); mod(P); const d = L.derive(P);
  const ampFn = (f) => d.reach(f) * D2R;
  const c = { type: 'chirp', axis: 0, f0: 1, f1: 20, octPerMin: 1, ampFn, t0: 2, ramp: 2 };
  const ch = L.makeComponent(c, 1000, L.makeRngFactory(1)), T = 2 + ch.T + 4;
  const S = L.labScenario(P, { label: 'diag', T, fs: 2000, stab: true, seed: 2100, cmd: [c], resTrack: (t) => ch.freqAt(t) || 0, rec: { fs: 1000, ch: ['ac_el', 'imu_r'] } });
  const R = L.runSim(P, S, null);
  const h = L.tfH1(Float64Array.from(R.rec.imu_r), Float64Array.from(R.rec.ac_el), 1000, 8192);
  const sel = []; for (let i = 0; i < h.f.length; i++) if (h.f[i] >= 2.4 && h.f[i] <= 5) sel.push(h.f[i].toFixed(2) + ':' + h.coh[i].toFixed(2));
  console.log(label.padEnd(34), sel.filter((_, i) => i % 2 === 0).join(' '));
}
run('varsayılan (sürtünme + izleyen DB)', () => {});
run('sürtünme yok (F_c = 0)', (P) => { for (const a of [P.dut.el, P.dut.az]) { a.Fc = 0; a.Fs = 0; } P.dut.ctl.ff.on = false; });
run('dar bant izlemesiz (sabit 3 Hz)', (P) => { P.dut.ctl.res.adaptive = false; });
run('dar bant kapalı', (P) => { P.dut.ctl.res.on = false; });
