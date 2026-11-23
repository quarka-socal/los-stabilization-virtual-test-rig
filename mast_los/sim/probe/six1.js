const L = require('../engine.js');
const rms = (a, i0) => { let m = 0, n = 0; for (let i = i0 || 0; i < a.length; i++) { m += a[i]; n++; } m /= n; let s = 0; for (let i = i0 || 0; i < a.length; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / n); };
const P = L.defaultParams('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5));
const A = L.seaAccDirector(P);
// işletme: ivme dizileri ve analitik RMS
const rngf = L.makeRngFactory(77), SM = L.seaMotion(P, 600, rngf, { world: 'op' });
const fsg = 20, i0 = 20 * fsg, i1 = 580 * fsg;
const accR = SM.acc.map(c => ({ axis: c.axis, rms: rms(c.data.subarray(i0, i1)) }));
console.log('op acc RMS (sim dizisi) ', accR.map(a => 'xyz'[a.axis] + '=' + a.rms.toFixed(3)).join(' '), '| analitik x/y/z', A.x.toFixed(3), A.y.toFixed(3), A.z.toFixed(3), '(z merkezcil hariç)');
const angR = SM.cmd.map(c => (rms(c.data.subarray(i0, i1)) * 180 / Math.PI).toFixed(3));
console.log('açısal σ (°) roll/pitch/yaw', angR.join(' / '), '| hedef', L.seaDOF(P).ang.map(q => (q.sigma * 180 / Math.PI).toFixed(3)).join(' / '));
// tepe aşımı: |θ| > A oranı (σ = A/3 → beklenen ≈ %0,27)
const rd = SM.cmd[0].data.subarray(i0, i1); let ex = 0; for (const v of rd) if (Math.abs(v) > 10 * Math.PI / 180) ex++;
console.log('roll |θ| > 10° oranı', (100 * ex / rd.length).toFixed(3), '% (Gauss beklentisi 0,27 %)');
// laboratuvar
const S = L.seaLabScenario(P, { T: 120, seed: 1301 });
console.log('lab: q =', S.seaQ && S.seaQ.toFixed(4), 'talep', S.seaDemand && S.seaDemand.toFixed(3), 'm; trans kanalları', (S.trans || []).length);
// B1-08 işletme satırı
const row = L.OP_ROWS.find(r => r.id === 'B1-08');
const t0 = Date.now(); const R = L.runSim(P, L.rowScenario(P, row, { T: 300, seed: 11 }), null);
const M = L.losMetrics(R, P, { skip: 20 });
console.log('op B1-08 (SS5, h=15): LOS el', (M.rms.el * 1e6).toFixed(3), 'xel', (M.rms.xel * 1e6).toFixed(3), 'µrad;', ((Date.now() - t0) / 1000).toFixed(1), 's');
const B = L.computeBudget(P); console.log('bütçe B1-08 tahmini', B.rows.find(r => r.id === 'B1-08').E.toFixed(3), 'µrad (accSens 2.0 × a_eff)');
