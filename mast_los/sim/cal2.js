const L = require('./engine.js');
const P = L.defaultParams();
const target = { 'B1-01': 3.70, 'B1-02': 1.85, 'B1-03': 1.23, 'B1-04': 3.70, 'B1-05': 1.45, 'B1-06': 0.24, 'B1-07': 3.00, 'B2-01': 6.17, 'B2-02': 2.00,
  'B2-03': 2.00, 'B2-04': 1.50, 'B2-05': 0.50, 'B2-06': 2.00, 'B3-01': 3.00, 'B3-02': 1.50, 'B3-03': 2.00, 'B3-04': 1.50, 'R-01': 12.80, 'H7': 1.27 };
const only = process.argv[2] ? process.argv[2].split(',') : null;
const d = L.derive(P);
const halfFovRad = d.FOVh / 2 * L.D2R;
for (const row of L.OP_ROWS) {
  if (only && !only.includes(row.id)) continue;
  const S = L.rowScenario(P, row, { T: 600 });
  const t0 = Date.now(); const R = L.runSim(P, S); const tt = (Date.now() - t0) / 1000;
  const M = L.losMetrics(R, P, { skip: 20 });
  let v = M.rms.el * 1e6, vx = M.rms.xel * 1e6, extra = '';
  if (row.metric === 'rot') { v = M.rotRes * halfFovRad * 1e6; extra = ` rotRes ${(M.rotRes * 1e3).toFixed(3)} mrad, rot ${(M.rot * 1e3).toFixed(2)} mrad`; }
  if (row.metric === 'arw' || row.metric === 'bias' || row.metric === 'drift') extra = ` PDE(1s) el ${(M.video.pde.el.rms * 1e6).toFixed(3)} xel ${(M.video.pde.xel.rms * 1e6).toFixed(3)}  wander el ${(M.video.wander.el*1e6).toFixed(3)}`;
  if (row.metric === 'gyroband') extra = ` band≥1Hz el ${(M.band.el.hp1 * 1e6).toFixed(3)} xel ${(M.band.xel.hp1 * 1e6).toFixed(3)}`;
  const w = M.video ? ` | wander ${(M.video.wander.el * 1e6).toFixed(3)} smear ${(M.video.smear.el * 1e6).toFixed(3)}` : '';
  console.log(row.id.padEnd(6), 'el', v.toFixed(3).padStart(8), ' xel', vx.toFixed(3).padStart(8), ' hedef', target[row.id], ' oran', (target[row.id] / v).toFixed(4), w, extra, ` (${tt.toFixed(1)} s)`);
}
