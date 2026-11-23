// Teknik kılavuz §5 (hexapod ve kolimatör, taban düzeltmesi) — v13.4 motoruyla değişim durumlarının test yanıtları:
// T0.1 (kalibrasyon, ctx), T0.3 (mikro-titreşim, uç pozlar), T0.4, T1.3 (deniz profili, taban düzeltmesi, göz bebeği),
// T2.1–T2.3 (VIV), T2.5 (öteleme). Her test için durum, ölçülen özet, ilgili kv satırları ve göz bebeği sayıları kaydedilir.
// Argüman: 'sub' | 'ship' [durum kimlikleri]. Çıktı: tests_<tür>.json, konsol özeti.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', only = process.argv.slice(3);
const mk = (k, fn) => { const P = L.defaultParams(k); if (fn) fn(P); return P; };
const base = (k) => [
  ['K0', 'Varsayılan', mk(k)],
  ['K1', 'Küçük hexapod 10°/20°/s/200°/s²', mk(k, P => { Object.assign(P.wb.hex, { theta_max: 10, omega_max: 20, alpha_max: 200 }); })],
  ['K2', 'f_bw = 10 Hz', mk(k, P => { P.wb.hex.fbw = 10; })],
  ['K3', 'Strok ±50 mm', mk(k, P => { P.lab.hexStroke = 0.05; })],
  ['K4', 'θ_test = 10°', mk(k, P => { P.wb.hex.theta_test = 10; })],
  ['K5', 'D_c = 250 mm', mk(k, P => { P.wb.coll.Dc_mm = 250; })],
  ['K6', 'Mikro-titreşim 5 µrad (zincir)', mk(k, P => { P.wb.hex.microvib = 5; })],
  ['K7', 'Mikro-titreşim 5 µrad, taban düzeltmesi kapalı', mk(k, P => { P.wb.hex.microvib = 5; P.wb.hex.mvCorr = 'kapalı'; })],
  ['K8', 'Mikro-titreşim 5 µrad, taban düzeltmesi tam', mk(k, P => { P.wb.hex.microvib = 5; P.wb.hex.mvCorr = 'tam'; })],
  ['K9', 'HDTV-NFOV referans kanal', mk(k, P => { P.wb.refChannel = 'HDTV-NFOV'; })],
  ['K10', 'L_off = 0,15 m', mk(k, P => { P.wb.hex.L_off = 0.15; })],
  ['K11', 'Stab-OFF payı 0,2', mk(k, P => { P.wb.hex.stabOff_ratio = 0.2; })],
];
const all = { sub: base('sub'), ship: base('ship').filter(c => ['K0', 'K1', 'K3', 'K5', 'K6', 'K7', 'K10'].includes(c[0])) };
const TIDS = ['T0.3', 'T0.4', 'T1.3', 'T2.1', 'T2.2', 'T2.3', 'T2.5'];
const RE = /Göz bebeği|göz bebeği|Taban|taban|Hexapod|hexapod|erişim|strok|Strok|öteleme|Öteleme|GEÇERSİZ|mikro|Mikro|kolimatör|Kolimatör|Stab-OFF|stab-OFF|uç poz|Uç poz/;
const cases = all[kind].filter(c => !only.length || only.includes(c[0]));
const out = [];
for (const [id, nm, P] of cases) {
  const t0 = Date.now(), ctx = {}, o = { id, nm };
  const r01 = L.runTest('T0.1', P, ctx, null);
  o['T0.1'] = { status: r01.status, measured: r01.measured, kv: (r01.kv || []).filter(([k, v]) => RE.test(k + ' ' + v)), pupil: r01.num && r01.num.pupil };
  for (const tid of TIDS) {
    const t1 = Date.now(), r = L.runTest(tid, P, ctx, null);
    o[tid] = { status: r.status, measured: r.measured, note: r.note, kv: (r.kv || []).filter(([k, v]) => RE.test(String(k) + ' ' + String(v))), pupil: r.num && r.num.pupil, num: r.num ? Object.fromEntries(Object.entries(r.num).filter(([k, v]) => typeof v === 'number' || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'number')))) : null, s: (Date.now() - t1) / 1000 };
  }
  out.push(o);
  console.log(`\n${id} ${nm} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
  for (const tid of ['T0.1'].concat(TIDS)) {
    const q = o[tid]; if (!q) continue;
    console.log(`   ${tid} ${q.status} | ${String(q.measured || '').slice(0, 300)}`);
    for (const [k, v] of q.kv || []) console.log(`      · ${k}: ${String(v).slice(0, 260)}`);
    if (q.pupil) console.log(`      ⟂ göz bebeği e ${(q.pupil.eMax * 1e3).toFixed(2)} mm, örtüşme %${(100 * q.pupil.ovMin).toFixed(1)}, vinyetleme %${(100 * q.pupil.fVig).toFixed(1)}, ${q.pupil.ok ? 'OK' : 'YETERSİZ'}`);
  }
}
require('fs').writeFileSync(path.join(__dirname, `tests_${kind}${only.length ? '_' + only.join('_') : ''}.json`), JSON.stringify(out, null, 1));
