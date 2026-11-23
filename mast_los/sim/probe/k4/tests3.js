// Teknik kılavuz §4 (VIV) — v13.2 son motoruyla bütün değişim durumlarının test yanıtları (değişim testleri tabloları):
// T2.1 (bant, en kötü DRR / üst sınır), T2.2 (f_n'de OFF → ON, en kötü, durum; gemide yalnız açısal ve yol ayrımı),
// T2.3 (sapma, durum), işletme B2-01 (600 s, el / xel) ve analitik değerler (bütçe tahmini, gerekli DRR).
// Argüman: 'sub' | 'ship' [durum kimlikleri]. Çıktı: tests3_<tür>.json, konsol özeti.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', only = process.argv.slice(3);
const mk = (k, fn) => { const P = L.defaultParams(k); if (fn) fn(P); return P; };
const all = {
  sub: [
    ['S0', 'Varsayılan', mk('sub')],
    ['S1', 'D = 0,40 m', mk('sub', P => { P.wb.viv.D = 0.40; })],
    ['S2', 'St = 0,25 (transkritik)', mk('sub', P => { P.wb.viv.St = 0.25; })],
    ['S3', 'f_n = 2 Hz', mk('sub', P => { P.wb.viv.fn = 2; })],
    ['S4', 'f_n = 5 Hz', mk('sub', P => { P.wb.viv.fn = 5; })],
    ['S5', 'f_n = 8 Hz', mk('sub', P => { P.wb.viv.fn = 8; })],
    ['S12', 'f_n = 12 Hz (riskli hız yok)', mk('sub', P => { P.wb.viv.fn = 12; })],
    ['S6', 'Genlik 0,10°', mk('sub', P => { P.wb.viv.amp_deg = 0.10; })],
    ['S11', 'Genlik 1,5°', mk('sub', P => { P.wb.viv.amp_deg = 1.5; })],
    ['S7', 'K0 üst sınırı 2,7', mk('sub', P => { P.wb.viv.K0_hi = 2.7; })],
    ['S8', 'Tarama payı 0', mk('sub', P => { P.wb.viv.margin = 0; })],
    ['S13', 'DRR varsayımı −46 dB', mk('sub', P => { P.wb.viv.drr_dB = -46; })],
    ['S10', 'Dar bant kontrol kapalı', mk('sub', P => { P.dut.ctl.res.on = false; })],
    ['S9', 'VIV kapalı', mk('sub', P => { P.wb.viv.on = false; })],
  ],
  ship: [
    ['W0', 'Varsayılan (β = 0°)', mk('ship')],
    ['W1', 'β = 90° (yandan rüzgâr)', mk('ship', P => { P.wb.wviv.beta = 90; })],
    ['W2', 'δ_s = 0,05', mk('ship', P => { P.wb.wviv.delta = 0.05; })],
    ['W3', 'U_max = 6 m/s', mk('ship', P => { P.wb.wviv.Umax = 6; })],
    ['W4', 'f_n = 3 Hz', mk('ship', P => { P.wb.wviv.fn = 3; })],
    ['W5', 'b = 0,30 m', mk('ship', P => { P.wb.wviv.D = 0.30; })],
    ['W6', 'l = 12 m', mk('ship', P => { P.wb.wviv.L = 12; })],
    ['W7', 'm_e = 400 kg/m', mk('ship', P => { P.wb.wviv.me = 400; })],
    ['W8', 'St = 0,20', mk('ship', P => { P.wb.wviv.St = 0.20; })],
    ['W9', 'κ = 1,38', mk('ship', P => { P.wb.wviv.kth = 1.38; })],
    ['W10', 'Ölçülmüş genlik 0,02°', mk('ship', P => { P.wb.wviv.amp_deg = 0.02; })],
    ['W13', 'Ölçülmüş genlik 0,7°', mk('ship', P => { P.wb.wviv.amp_deg = 0.7; })],
    ['W11', 'Öteleme kapalı', mk('ship', P => { P.wb.wviv.lin = false; })],
    ['W12', 'b = 1,0 m (süperkritik)', mk('ship', P => { P.wb.wviv.D = 1.0; })],
  ],
};
const cases = all[kind].filter(c => !only.length || only.includes(c[0]));
const out = [];
for (const [id, nm, P] of cases) {
  const t0 = Date.now(), ctx = {}, o = { id, nm };
  const VS = L.vivSpec(P), VB = L.vivBand(P), al = L.budgetAlloc(P)['B2-01'];
  o.an = { A: VS.A * 180 / Math.PI, f: VS.f, H: VS.H, present: VS.present, fLo: VB.fLo, fHi: VB.fHi, nCand: VB.cand.length,
    est: VS.A / Math.SQRT2 * Math.pow(10, VS.H / 20) * 1e6, req: 20 * Math.log10(al * 1e-6 / (VS.A / Math.SQRT2)), reach: L.derive(P).reach(VS.f) };
  if (VS.kind === 'wind') { const w = VS.w; o.an.w = { vcrit: w.vcrit, Re: w.Re, clat: w.clat, Sc: w.Sc, Kw: w.Kw, yF: w.yF, th: w.theta * 180 / Math.PI, acc: w.acc, active: w.active, regime: w.regime }; }
  // kampanyadaki gibi önce T0.1 (plaka ölçeği kalibrasyonu → ctx.IFOVcal): video genlikleri kalibre IFOV ile çevrilir
  // (ctx = {} ile nominal IFOV kullanılır ve sayfadaki değerlerden ≈ %0,3–0,4 sapar)
  L.runTest('T0.1', P, ctx, null);
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) {
    const r = L.runTest(tid, P, ctx, null);
    o[tid] = { status: r.status, measured: r.measured, fill: r.fill, kv: r.kv };
  }
  const row = L.OP_ROWS.find(q => q.id === 'B2-01'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20, psd: false });
  o.op = { el: M.rms.el * 1e6, xel: M.rms.xel * 1e6 };
  out.push(o);
  console.log(`${id} ${nm} [${((Date.now() - t0) / 1000).toFixed(0)} s] | bant ${o.an.fLo.toFixed(2)}–${o.an.fHi.toFixed(2)} Hz (${o.an.nCand}) · tahmin ${o.an.est.toFixed(2)} µrad · gerekli ${o.an.req.toFixed(1)} dB · erişim@f ${o.an.reach.toFixed(3)}°`);
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) console.log(`   ${tid} ${o[tid].status} | ${o[tid].measured.slice(0, 360)}`);
  console.log(`   işletme B2-01 el ${o.op.el.toFixed(3)} / xel ${o.op.xel.toFixed(3)} µrad · bütçeye (T2.2 fill) ${o['T2.2'].fill && o['T2.2'].fill['B2-01'] != null ? (o['T2.2'].fill['B2-01'] * 1e6).toFixed(2) : '—'} µrad`);
}
require('fs').writeFileSync(path.join(__dirname, `tests3_${kind}${only.length ? '_' + only.join('_') : ''}.json`), JSON.stringify(out, null, 1));
