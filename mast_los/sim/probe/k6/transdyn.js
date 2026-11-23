// §5 bulgusu: hexapod ötelemesi benzetimde süzgeçsizdi (Osc2 1500 Hz), açı ise f_bw'de (20 Hz) süzülüyordu. Gerçek hexapodda
// açı ve öteleme aynı altı bacaktan gelir. Bu betik wb.hex.transDyn = 'ideal' ↔ 'fbw' farkını açı + öteleme birleşik testlerde
// ölçer: T1.3 (deniz + öteleme), T2.2 (VIV dwell, açı + öteleme aynı fazda), T2.3, T2.5 (öteleme segmentleri).
// Kullanım: node transdyn.js [sub|ship] [f_bw] → konsol, transdyn_<tür>_<f_bw>.json
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', fbw = +(process.argv[3] || 20);
const out = { kind, fbw, runs: {} };
for (const td of ['ideal', 'fbw']) {
  const P = L.defaultParams(kind); P.wb.hex.fbw = fbw; P.wb.hex.transDyn = td;
  const ctx = {}; L.runTest('T0.1', P, ctx, null);
  const o = {};
  for (const id of ['T1.3', 'T2.2', 'T2.3', 'T2.5']) {
    const t0 = Date.now(), r = L.runTest(id, P, ctx, null);
    o[id] = { status: r.status, measured: r.measured, fill: r.fill, kv: (r.kv || []).filter(([k]) => /f_n\)|Hz \(f_n|Öteleme [xyz]|yalnız açısal|iletimi/.test(k)), s: (Date.now() - t0) / 1000 };
  }
  out.runs[td] = o;
  console.log(`== ${kind} f_bw ${fbw} Hz, öteleme dinamiği ${td}`);
  for (const id of Object.keys(o)) {
    console.log(`  ${id} ${o[id].status} | ${String(o[id].measured).slice(0, 260)}`);
    for (const [k, v] of o[id].kv) console.log(`     · ${String(k).slice(0, 90)}: ${String(v).slice(0, 200)}`);
    console.log(`     fill ${JSON.stringify(Object.fromEntries(Object.entries(o[id].fill || {}).map(([k, v]) => [k, +(v * 1e6).toFixed(3)])))}`);
  }
}
fs.writeFileSync(path.join(__dirname, `transdyn_${kind}_${fbw}.json`), JSON.stringify(out, null, 1));
