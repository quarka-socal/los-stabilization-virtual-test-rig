// Teknik kılavuz §3 değişim tablosunun h'ye bağlı sütunu (|a| · laboratuvar q) ve T1.3 gözlemi, yeni denizaltı varsayılanıyla
// (h = 1 m) yeniden: v13 tablosu h = 0 ile hesaplanmıştı. σ, f_dom, B1-01, gerekli DRR ve T1.1 h'den bağımsızdır.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const S = () => L.defaultParams('sub');
const cases = [
  ['Varsayılan (dar)', S(), true],
  ['Roll genliği 6°', (() => { const P = S(); P.wb.sea.roll_A = 6; return P; })(), true],
  ['Roll periyodu 4 s', (() => { const P = S(); P.wb.sea.roll_T = 4; return P; })(), false],
  ['Roll periyodu 16 s', (() => { const P = S(); P.wb.sea.roll_T = 16; return P; })(), false],
  ['Yaw 2° / 6 s', (() => { const P = S(); P.wb.sea.yaw_A = 2; P.wb.sea.yaw_T = 6; return P; })(), false],
  ['σ_ln 0,30', (() => { const P = S(); P.env.seaWidth = 0.30; return P; })(), false],
  ['6-DOF SS4, k_p = 2', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.kp = 2; return P; })(), false],
  ['Roll genliği 20°', (() => { const P = S(); P.wb.sea.roll_A = 20; return P; })(), false],
  ['Deniz frekansında DRR −75 dB', (() => { const P = S(); P.wb.H.drrSea_dB = -75; return P; })(), false],
  ['6-DOF SS4 (h = 1 m)', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); return P; })(), true],
];
for (const [nm, P, t13] of cases) {
  const A = L.seaAccDirector(P), LD = L.seaLabDemand(P), Sx = L.seaLabScenario(P, { T: 620, seed: 1301 });
  let w = '';
  if (t13) { const r = L.runTest('T1.3', P, {}, null); w = ` | T1.3 ${r.status}: ${r.measured.slice(0, 70)}`; }
  console.log(`${nm}: |a| ${A.eff.toFixed(4)} m/s² (tam ilişkili ${A.corrUp.eff.toFixed(4)}), B1-08 ${(P.wb.H.accSens * A.eff).toFixed(3)} µrad | q analitik ${LD.q.toFixed(3)}, koşu ${Sx.seaQ != null ? Sx.seaQ.toFixed(3) : '—'} (talep ${Sx.seaDemand != null ? Sx.seaDemand.toFixed(3) : '—'} m)${w}`);
}
