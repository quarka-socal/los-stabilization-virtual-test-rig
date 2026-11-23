// §12 Proje gereksinimleri (test eşikleri): girilmediğinde BİLGİ; ölçülenin altına / üstüne girildiğinde durum. T1.7, T1.8, T2.4, T4.1.
// Wander penceresi ana.Tw: bütçe wander toplamı (iki platform) ve işletme bütün kaynaklar wander'ı (aynı koşudan farklı pencerelerle). Çıktı: req.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const out = { req: [], tw: [] };
const run = (id, fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null); };
for (const [id, key, vals] of [['T1.7', 'trackErr_urad', [null, 5, 50]], ['T1.8', 'settle_ms', [null, 300, 500]], ['T2.4', 'shockPeak_urad', [null, 100, 200]], ['T2.4', 'shockSettle_ms', [1000, 3000]], ['T4.1', 'boresight_urad', [null, 20, 100]]]) {
  for (const v of vals) { const r = run(id, (P) => { P.ana.req[key] = v; }); out.req.push({ id, key, v, st: r.status, m: r.measured }); console.log(`${id} ${key} = ${v}: ${r.status} — ${r.measured.slice(0, 260)}`); }
}
for (const kind of ['sub', 'ship']) {
  const P = L.defaultParams(kind), S = L.opScenario(P, { T: 600, seed: 11, fs: 2000, label: 'tw' }), R = L.runSim(P, S);
  for (const Tw of [60, 120, 240]) { const Q = L.defaultParams(kind); Q.ana.Tw = Tw; const B = L.computeBudget(Q, null), M = L.losMetrics(R, Q, { skip: 20 }), b5 = B.rows.find(r => r.id === 'B1-05');
    out.tw.push({ kind, Tw, wander: B.wander, b105: b5.I, opW: M.video.wander.el, opWx: M.video.wander.xel, req: B.reqW });
    console.log(`${kind} T_w ${Tw} s: bütçe wander ${B.wander.toFixed(2)} (B1-05 ${b5.I.toFixed(2)}; gereksinim ${B.reqW.toFixed(1)}) · işletme wander el ${(M.video.wander.el * 1e6).toFixed(2)} / xel ${(M.video.wander.xel * 1e6).toFixed(2)} µrad`); }
}
require('fs').writeFileSync(path.join(__dirname, 'req.json'), JSON.stringify(out, null, 1));
