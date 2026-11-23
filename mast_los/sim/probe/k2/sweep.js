// Teknik kılavuz §3 (Deniz hareketi) — analitik tarama: her durumda motorun türettiği büyüklükler ↔ bağımsız kapalı biçim
// Kullanım: node sweep.js  (çıktı: sweep.json)
'use strict';
const L = require('../../engine.js'), fs = require('fs'), path = require('path');
const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = 2 * Math.PI, G0 = 9.80665, SW = 0.12;
const S = (kind) => L.defaultParams(kind || 'sub');
const cases = [
  ['Denizaltı varsayılanı (dar)', S()],
  ['Roll genliği 6°', (() => { const P = S(); P.wb.sea.roll_A = 6; return P; })()],
  ['Roll periyodu 4 s', (() => { const P = S(); P.wb.sea.roll_T = 4; return P; })()],
  ['Roll periyodu 16 s', (() => { const P = S(); P.wb.sea.roll_T = 16; return P; })()],
  ['Pitch genliği 3°', (() => { const P = S(); P.wb.sea.pitch_A = 3; return P; })()],
  ['Yaw 2° / 6 s', (() => { const P = S(); P.wb.sea.yaw_A = 2; P.wb.sea.yaw_T = 6; return P; })()],
  ['Kaldıraç kolu h = 10 m (dar)', (() => { const P = S(); P.wb.sea.h = 10; return P; })()],
  ['Deniz durumu ×1,5', (() => { const P = S(); for (const k of ['roll_A', 'pitch_A', 'yaw_A']) P.wb.sea[k] *= 1.5; for (const q of Object.values(P.wb.sea.dof)) q.A *= 1.5; return P; })()],
  ['Roll 20° (hexapod sınırı)', (() => { const P = S(); P.wb.sea.roll_A = 20; return P; })()],
  ['6-DOF SS4 (h = 0)', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); return P; })()],
  ['6-DOF SS5 (h = 0)', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); return P; })()],
  ['6-DOF SS4, k_p = 2', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.kp = 2; return P; })()],
  ['6-DOF SS4, h = 15 m', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.h = 15; return P; })()],
  ['6-DOF SS4, roll bandı 0,05–0,10 Hz', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.dof.roll.f1 = 0.05; P.wb.sea.dof.roll.f2 = 0.10; return P; })()],
  ['6-DOF SS4, g-duyarlılığı 0,5 °/h/g', (() => { const P = S(); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.H.kg = 0.5; return P; })()],
  ['Gemi varsayılanı (dar, h = 15 m)', S('ship')],
  ['Gemi, 6-DOF SS4 (h = 15 m)', (() => { const P = S('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); return P; })()],
];
// bağımsız spektral momentler: doğrusal ızgarada yamuk (0 … 60·f_üst), biçimler motorun tanımıyla aynı formülden yeniden yazıldı
const band = (f1, f2) => (f) => (f <= 0 ? 0 : 1 / ((1 + (f1 / f) ** 8) * (1 + (f / f2) ** 8)));
const logG = (fp) => (f) => (f <= 0 ? 0 : Math.exp(-0.5 * (Math.log(f / fp) / SW) ** 2) / f);
function moments(sh, fmax) { const N = 400000, h = fmax / N; let m0 = 0, m2 = 0, m4 = 0; for (let i = 1; i <= N; i++) { const f = i * h, w = (i === N ? 0.5 : 1) * sh(f); m0 += w; m2 += w * f * f; m4 += w * f ** 4; } return { m0, m2, m4 }; }
const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));
const out = [];
let worstAll = 0;
for (const [name, P] of cases) {
  const s = P.wb.sea, six = s.mode === '6dof', kp = s.kp || 3, h = s.h > 0 ? s.h : 0;
  const D = L.seaDOF(P), A = L.seaAccDirector(P), B = L.computeBudget(P), rows = Object.fromEntries(B.rows.map(r => [r.id, r])), d = L.derive(P), hx = P.wb.hex;
  const chk = [], ex = {};
  const ang = ['roll', 'pitch', 'yaw'].map((k, ax) => {
    const Adeg = six ? s.dof[k].A : s[k + '_A'], sig = six ? Adeg * D2R / kp : Adeg * D2R / Math.SQRT2;
    const f1 = six ? s.dof[k].f1 : (1 / s[k + '_T']) * Math.exp(-2 * SW), f2 = six ? s.dof[k].f2 : (1 / s[k + '_T']) * Math.exp(2 * SW);
    const fd = six ? Math.sqrt(f1 * f2) : 1 / s[k + '_T'], sh = six ? band(f1, f2) : logG(1 / s[k + '_T']);
    const M = moments(sh, (six ? f2 : f2) * 60), aR = TAU ** 2 * Math.sqrt(M.m4 / M.m0), vR = TAU * Math.sqrt(M.m2 / M.m0);
    const q = D.ang[ax];
    chk.push([k + ' σ', q.sigma, sig], [k + ' f_dom', q.fdom, fd], [k + ' f1', q.f1, f1], [k + ' f2', q.f2, f2], [k + ' A_eq', q.Aeq, Math.SQRT2 * sig * R2D]);
    chk.push([k + ' ivme oranı', L.accRatio(q.shape, q.fdom), aR, 2e-3], [k + ' hız oranı', L.velRatio(q.shape, q.fdom), vR, 2e-3]);
    return { k, A: Adeg, sig, fd, f1, f2, aR, vR, pkDeg: kp * sig * R2D, pkW: kp * sig * vR * R2D, pkA: kp * sig * aR * R2D };
  });
  const lin = ['surge', 'sway', 'heave'].map((k, ax) => {
    if (!six) return { k, sig: 0, acc: 0 };
    const q = s.dof[k], sig = q.A / kp, M = moments(band(q.f1, q.f2), q.f2 * 60), aR = TAU ** 2 * Math.sqrt(M.m4 / M.m0);
    chk.push([k + ' σ (m)', D.lin[ax].sigma, sig]);
    return { k, sig, acc: sig * aR, fd: Math.sqrt(q.f1 * q.f2) };
  });
  // direktör ivmesi: kaldıraç kolu (a_x = h·θ̈, a_y = −h·φ̈) + ağırlık merkezi ötelemesi, bağımsız bileşenler karesel
  const lev = [h * ang[1].sig * ang[1].aR, h * ang[0].sig * ang[0].aR], ax = Math.hypot(lin[0].acc, lev[0]), ay = Math.hypot(lin[1].acc, lev[1]), az = lin[2].acc, eff = Math.hypot(ax, ay, az);
  chk.push(['a_x', A.x, ax, 2e-3], ['a_y', A.y, ay, 2e-3], ['a_z', A.z, az, 2e-3], ['|a|', A.eff, eff, 2e-3]);
  // bütçe satırları
  const IFu = d.IFOV * 1e6, AL = L.budgetAlloc(P), fa = six ? lin[2].fd : ang[1].fd;
  const I = (sigRad, HdB) => sigRad * 1e6 * 10 ** (HdB / 20);
  chk.push(['B1-01 I', rows['B1-01'].I, I(ang[0].sig, -80)], ['B1-02 I', rows['B1-02'].I, I(ang[1].sig, -80)], ['B1-03 I', rows['B1-03'].I, I(ang[2].sig, -80)],
    ['B1-04 I', rows['B1-04'].I, P.wb.H.eps_mrad * 1e-3 * ang[0].sig * 1e6], ['B1-01 G', rows['B1-01'].G, ang[0].fd], ['R-01 G', rows['R-01'].G, ang[0].fd],
    ['gerekli DRR (dB)', B.reqDRR, 20 * Math.log10(AL['B1-01'] / (ang[0].sig * 1e6))]);
  if (rows['B1-08']) chk.push(['B1-08 E', rows['B1-08'].E, P.wb.H.accSens * eff, 2e-3]);
  if (rows['B1-10']) chk.push(['B1-10 E', rows['B1-10'].E, P.wb.H.kg * Math.PI / 180 / 3600 * (eff / G0) / (TAU * fa) * 1e6, 2e-3]);
  let worst = 0, where = '';
  for (const [k, a, b, tol] of chk) { const e = rel(a, b), t = tol || 1e-9; const r = e / t; if (r > worst) { worst = r; where = `${k}: ${a} ↔ ${b}`; } }
  worstAll = Math.max(worstAll, worst);
  // hexapod erişimi (tepe ≈ k_p·σ) ve laboratuvar öteleme talebi (Model paneli formülü) — bilgi
  const reach = ang.map(q => ({ k: q.k, pk: q.pkDeg, w: q.pkW, a: q.pkA, lim: q.pkDeg > hx.theta_max ? 'açı' : (q.pkW > hx.omega_max ? 'hız' : (q.pkA > hx.alpha_max ? 'ivme' : '')) }));
  const sR = ang[0].sig, sP = ang[1].sig, sx = Math.hypot(lin[0].sig, h * sP), sy = Math.hypot(lin[1].sig, h * sR), sz = Math.hypot(lin[2].sig, h * Math.sqrt((sR ** 4 + sP ** 4) / 2));
  const pkT = Math.max(kp * sx, kp * sy, kp * sz + h * (sR * sR + sP * sP) / 2), qEst = pkT > P.lab.hexStroke ? P.lab.hexStroke / pkT : 1;
  out.push({ name, six, kp, h, worstRatio: worst, where, ang: ang.map(q => ({ k: q.k, A: q.A, sigDeg: q.sig * R2D, fd: q.fd, f1: q.f1, f2: q.f2, accRatio: q.aR })),
    acc: { lever: lev, lin: lin.map(q => q.acc), x: ax, y: ay, z: az, eff }, budget: { B101: rows['B1-01'].I, B102: rows['B1-02'].I, B103: rows['B1-03'].I, B104: rows['B1-04'].I, B108: rows['B1-08'] ? rows['B1-08'].E : null, B110: rows['B1-10'] ? rows['B1-10'].E : null, reqDRR: B.reqDRR, wander: B.wander, wanderUse: B.wanderUse, Q101: AL['B1-01'] },
    reach, transPk: pkT, qEst });
  console.log(`${name.padEnd(38)} en kötü (fark/tolerans) ${worst.toExponential(2)}  B1-01 ${rows['B1-01'].I.toFixed(3)} µrad · gerekli DRR ${B.reqDRR.toFixed(2)} dB · |a| ${eff.toFixed(4)} m/s² · B1-08 ${rows['B1-08'] ? rows['B1-08'].E.toFixed(3) : '—'} · q ≈ ${qEst.toFixed(4)} · erişim ${reach.map(r => r.k + ':' + (r.lim || 'ok')).join(' ')}`);
}
console.log('EN KÖTÜ (fark/tolerans):', worstAll.toExponential(2), worstAll <= 1 ? 'GEÇTİ' : 'KALDI');
fs.writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify(out, null, 1));
