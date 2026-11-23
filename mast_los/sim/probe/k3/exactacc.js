// Kaldıraç kolu ivmesi: küçük açı ifadesi ↔ Euler hızlarından tam gövde hızlarıyla (ω_B, ω̇_B) rijit cisim ifadesi ↔
// p = Rz·Ry·Rx·r'nin merkezi farkla ikinci türevi (S2 referansı). İki kol: (0, 0, 15) ve (20, −4, 15) m; SS4 ve SS5.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const mm = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv = (A, v) => [0, 1, 2].map(i => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
function run(ss, r, seed) {
  const P = L.defaultParams('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[ss])); P.wb.sea.rx = r[0]; P.wb.sea.ry = r[1]; P.wb.sea.h = r[2];
  for (const k of ['surge', 'sway', 'heave']) P.wb.sea.dof[k].A = 0;
  const T = 3000, fs0 = 20, rngf = L.makeRngFactory(seed);
  const A = [0, 1, 2].map(ax => L.seaSeries(P, T, rngf(['sea_r', 'sea_p', 'sea_y'][ax]), ax, { der: true }));
  const n = A[0].data.length, ph = A[0].data, th = A[1].data, ps = A[2].data, pv = A[0].der.v, qv = A[1].der.v, yv = A[2].der.v, pa = A[0].der.a, qa = A[1].der.a, ya = A[2].der.a;
  const [rx, ry, rz] = r, small = [[], [], []], exact = [[], [], []], ref = [[], [], []], pos = [];
  // referans: 5 noktalı (4. derece) merkezi fark — 3 noktalının (ωΔt)²/12 kesme hatası bant kuyruğunda %0,3–0,7 veriyordu
  for (let i = 0; i < n; i++) pos.push(mv(mm(Rz(ps[i]), mm(Ry(th[i]), Rx(ph[i]))), r));
  for (let i = 0; i < n; i++) {
    small[0].push(rz * (qa[i] + pv[i] * yv[i]) + ry * (pv[i] * qv[i] - ya[i]) - rx * (qv[i] * qv[i] + yv[i] * yv[i]));
    small[1].push(rz * (-pa[i] + qv[i] * yv[i]) + rx * (ya[i] + pv[i] * qv[i]) - ry * (pv[i] * pv[i] + yv[i] * yv[i]));
    small[2].push(-rz * (pv[i] * pv[i] + qv[i] * qv[i]) + rx * (pv[i] * yv[i] - qa[i]) + ry * (pa[i] + qv[i] * yv[i]));
    const cf = Math.cos(ph[i]), sf = Math.sin(ph[i]), ct = Math.cos(th[i]), st = Math.sin(th[i]);
    const p = pv[i] - yv[i] * st, q = qv[i] * cf + yv[i] * ct * sf, w = -qv[i] * sf + yv[i] * ct * cf;
    const pd = pa[i] - ya[i] * st - yv[i] * qv[i] * ct;
    const qd = qa[i] * cf - qv[i] * pv[i] * sf + ya[i] * ct * sf - yv[i] * qv[i] * st * sf + yv[i] * pv[i] * ct * cf;
    const wd = -qa[i] * sf - qv[i] * pv[i] * cf + ya[i] * ct * cf - yv[i] * qv[i] * st * cf - yv[i] * pv[i] * ct * sf;
    const cx = q * rz - w * ry, cy = w * rx - p * rz, cz = p * ry - q * rx;
    exact[0].push((qd * rz - wd * ry) + (q * cz - w * cy)); exact[1].push((wd * rx - pd * rz) + (w * cx - p * cz)); exact[2].push((pd * ry - qd * rx) + (p * cy - q * cx));
    if (i > 1 && i < n - 2) { const R = mm(Rz(ps[i]), mm(Ry(th[i]), Rx(ph[i]))), pdd = [0, 1, 2].map(k => (-pos[i + 2][k] + 16 * pos[i + 1][k] - 30 * pos[i][k] + 16 * pos[i - 1][k] - pos[i - 2][k]) / 12 * fs0 * fs0);
      for (let k = 0; k < 3; k++) ref[k].push(R[0][k] * pdd[0] + R[1][k] * pdd[1] + R[2][k] * pdd[2]); } else for (let k = 0; k < 3; k++) ref[k].push(NaN);
  }
  const i0 = 30 * fs0, i1 = n - 30 * fs0, err = (X, k) => { let e = 0, q = 0; for (let i = i0; i < i1; i++) { e += (X[k][i] - ref[k][i]) ** 2; q += ref[k][i] ** 2; } return Math.sqrt(e / q); };
  console.log(ss, 'r =', JSON.stringify(r), '| küçük açı:', [0, 1, 2].map(k => (err(small, k) * 100).toFixed(3) + '%').join(' '), '| tam gövde hızları:', [0, 1, 2].map(k => (err(exact, k) * 100).toFixed(4) + '%').join(' '));
}
for (const ss of ['SS4', 'SS5']) { run(ss, [0, 0, 15], 77); run(ss, [20, -4, 15], 78); run(ss, [30, 0, 0], 79); }
