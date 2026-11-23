// Sert döngü + güçlü kuplaj: fi seç, (b, k)'yı DRR(1/8) = −80 dB ve DRR(3) = −40 dB için çöz
const L = require('./engine.js');
function solveAxis(ax, J, ctl, gyro, cur, targets) {
  // iki bilinmeyen: b, k ; Newton (log uzayında)
  let b = 2, k = 10;
  for (let it = 0; it < 60; it++) {
    const f = (bb, kk) => { ax.b = bb; ax.k = kk; const lm = L.loopModel(ax, ctl, gyro, cur, J); return targets.map(t => L.db(L.cabs(lm.drr(2 * Math.PI * t.f))) - t.db); };
    const r = f(b, k); if (Math.hypot(...r) < 1e-6) break;
    const h = 1e-4, rb = f(b * (1 + h), k), rk = f(b, k * (1 + h));
    const J11 = (rb[0] - r[0]) / Math.log(1 + h), J12 = (rk[0] - r[0]) / Math.log(1 + h), J21 = (rb[1] - r[1]) / Math.log(1 + h), J22 = (rk[1] - r[1]) / Math.log(1 + h);
    const det = J11 * J22 - J12 * J21; const db_ = (r[0] * J22 - r[1] * J12) / det, dk = (J11 * r[1] - J21 * r[0]) / det;
    b *= Math.exp(-Math.max(-1, Math.min(1, db_))); k *= Math.exp(-Math.max(-1, Math.min(1, dk)));
  }
  ax.b = b; ax.k = k; return L.loopModel(ax, ctl, gyro, cur, J);
}
for (const fi of [4, 6, 8]) {
  const P = L.defaultParams(); const el = P.dut.el; el.fi = fi;
  const lm = solveAxis(el, el.J, P.dut.ctl, P.dut.gyro, P.dut.cur, [{ f: 0.125, db: -80 }, { f: 3, db: -40 }]);
  const tq = (f) => (L.cabs(lm.torque(2 * Math.PI * f)) * 1e6).toFixed(1);
  console.log(`fi ${fi} Hz → b ${el.b.toFixed(3)} N·m·s/rad, k ${el.k.toFixed(3)} N·m/rad, K ${lm.K.toFixed(2)}, PM ${lm.pm.toFixed(1)}°, GM ${lm.gm.toFixed(1)} dB | θ/T µrad/N·m @0.125/1/3/10 Hz: ${tq(0.125)} ${tq(1)} ${tq(3)} ${tq(10)} | DRR 0.05/0.5/1/5/10/20/50: ` +
    [0.05, 0.5, 1, 5, 10, 20, 50].map(f => L.db(L.cabs(lm.drr(2 * Math.PI * f))).toFixed(1)).join(' '));
  const az = P.dut.az; az.fi = fi; const Jaz = az.Ja + az.Jez;
  // az: aynı b/K ve k/K oranları, sonra k'yı DRR(1/12) = −80 için ayarla
  const Kel = lm.K; const lmA0 = L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz);
  az.b = el.b * lmA0.K / Kel; let lo = 0.1, hi = 500;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); az.k = m; const v = L.db(L.cabs(L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz).drr(2 * Math.PI / 12))); if (v > -80) hi = m; else lo = m; }
  const lmA = L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz);
  console.log(`   az: b ${az.b.toFixed(3)}, k ${az.k.toFixed(3)}, K ${lmA.K.toFixed(2)}, PM ${lmA.pm.toFixed(1)}, GM ${lmA.gm.toFixed(1)} | DRR 1/12, 3 Hz: ${L.db(L.cabs(lmA.drr(2 * Math.PI / 12))).toFixed(1)} ${L.db(L.cabs(lmA.drr(2 * Math.PI * 3))).toFixed(1)}`);
}
