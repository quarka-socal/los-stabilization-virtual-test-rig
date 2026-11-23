const L = require('./engine.js');
const row = L.OP_ROWS.find(r => r.id === 'B1-07');
const cases = [
  { Fc: 0.093, pre: 1e-5, mode: 'lugre', eta: 0.95, fest: 100 },
  { Fc: 0.093, pre: 1e-5, mode: 'lugre', eta: 0.95, fest: 300 },
  { Fc: 0.093, pre: 1e-5, mode: 'lugre', eta: 0.9, fest: 300 },
  { Fc: 0.15, pre: 1e-5, mode: 'lugre', eta: 0.95, fest: 300 },
  { Fc: 0.093, pre: 1e-5, mode: 'tanh', eta: 0.95, fest: 100, wff: 1.5e-3 },
];
for (const c of cases) {
  const P = L.defaultParams();
  P.dut.el.Fc = c.Fc; P.dut.el.Fs = 1.1 * c.Fc; P.dut.az.Fc = c.Fc * 3.76; P.dut.az.Fs = 1.1 * P.dut.az.Fc;
  P.dut.el.sigma0 = c.Fc / c.pre; P.dut.az.sigma0 = P.dut.az.Fc / c.pre;
  P.dut.ctl.ff.mode = c.mode; P.dut.ctl.ff.eta = c.eta; P.dut.ctl.ff.f_est = c.fest; if (c.wff) P.dut.ctl.ff.w_ff = c.wff;
  const R = L.runSim(P, L.rowScenario(P, row, { T: 300 }));
  const M = L.losMetrics(R, P, { skip: 20 });
  const S2 = L.opScenario(P, { T: 60, src: {}, mech: { friction: true, gyroNoise: true, earth: true }, fs: 2000 }); S2.cmd = []; S2.vib = []; S2.acc = []; S2.accMount = [];
  const M2 = L.losMetrics(L.runSim(P, S2), P, { skip: 5 });
  console.log(JSON.stringify(c), `→ B1-07 el ${(M.rms.el*1e6).toFixed(2)} xel ${(M.rms.xel*1e6).toFixed(2)} p99 ${(M.p99.el*1e6).toFixed(1)}/${(M.p99.xel*1e6).toFixed(1)} | durağan wander el ${(M2.video.wander.el*1e6).toFixed(2)} xel ${(M2.video.wander.xel*1e6).toFixed(2)} smear ${(M2.video.smear.el*1e6).toFixed(2)}`);
}
