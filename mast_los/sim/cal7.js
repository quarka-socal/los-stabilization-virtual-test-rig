const L = require('./engine.js');
const row = L.OP_ROWS.find(r => r.id === 'B1-07');
for (const [Fc, hys, wff, eta, fest] of [[0.093, 1e-3, 0, 0.95, 100], [0.093, 3e-4, 0, 0.95, 100], [0.093, 0, 5e-4, 0.95, 100], [0.093, 3e-4, 0, 0.95, 300], [0.06, 3e-4, 0, 0.95, 300]]) {
  const P = L.defaultParams();
  P.dut.el.Fc = Fc; P.dut.el.Fs = 1.1 * Fc; P.dut.az.Fc = Fc * 3.76; P.dut.az.Fs = 1.1 * P.dut.az.Fc;
  P.dut.ctl.ff.hys = hys; if (wff) P.dut.ctl.ff.w_ff = wff; P.dut.ctl.ff.eta = eta; P.dut.ctl.ff.f_est = fest;
  const R = L.runSim(P, L.rowScenario(P, row, { T: 300 }));
  const M = L.losMetrics(R, P, { skip: 20 });
  // durağan (granit) gürültü: T0.2 benzeri, stab ON, yalnız sürtünme + gyro gürültüsü
  const S2 = L.opScenario(P, { T: 60, src: {}, mech: { friction: true, gyroNoise: true, earth: true }, fs: 2000 });
  S2.cmd = []; S2.vib = []; S2.acc = []; S2.accMount = [];
  const R2 = L.runSim(P, S2); const M2 = L.losMetrics(R2, P, { skip: 5 });
  const S3 = L.opScenario(P, { T: 60, src: {}, mech: { gyroNoise: true, earth: true }, fs: 2000 }); S3.cmd = []; S3.vib = []; S3.acc = []; S3.accMount = [];
  const M3 = L.losMetrics(L.runSim(P, S3), P, { skip: 5 });
  console.log(`Fc ${Fc} hys ${hys} wff ${wff} fest ${fest} → B1-07 el ${(M.rms.el*1e6).toFixed(2)} xel ${(M.rms.xel*1e6).toFixed(2)} p99 ${(M.p99.el*1e6).toFixed(1)}/${(M.p99.xel*1e6).toFixed(1)} | durağan (sürtünme+gyro) wander el ${(M2.video.wander.el*1e6).toFixed(2)} xel ${(M2.video.wander.xel*1e6).toFixed(2)} | yalnız gyro ${(M3.video.wander.el*1e6).toFixed(2)}`);
}
