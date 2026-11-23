// §11 Örnek DUT — gyro: T0.6 (Allan) kestiricisinin dağılımı, motorla. P.ana.seedOffset = 0…N−1 → ARW ve bias kararsızlığı kestirimleri,
// kabul (ARW ≤ H.arw, BI ≤ H.bias) oranı. Ayrıca DUT değerleri değiştirilmiş iki durum. Çıktı: gyro_eng.json (bağımsız karşılaştırma gyro_ref.py)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const N = +(process.argv[2] || 200), out = { N, cases: [] };
const cases = [['varsayılan (ARW 0,0042, BI 0,042)', null], ['BI 0,035', (P) => { P.dut.gyro.bi = 0.035; }], ['ARW 0,0021', (P) => { P.dut.gyro.arw = 0.0021; }]];
for (const [nm, fn] of cases) {
  const t0 = Date.now(), arw = [], bi = [], tauB = [], ok = [];
  for (let s = 0; s < (fn ? Math.min(N, 100) : N); s++) {
    const P = L.defaultParams('sub'); if (fn) fn(P); P.ana.seedOffset = s;
    const r = L.runTest('T0.6', P, {}, null); arw.push(r.num.arw); bi.push(r.num.bi); ok.push(r.status === 'OK' ? 1 : 0);
    const m = r.kv.find(k => /^Bias kararsızlığı/.test(k[0])); tauB.push(m ? +m[0].match(/τ = ([\d.]+) s/)[1] : NaN);
  }
  const P0 = L.defaultParams('sub'); if (fn) fn(P0);
  const st = (a) => { const s = a.slice().sort((x, y) => x - y), m = a.reduce((x, y) => x + y, 0) / a.length, sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); return { mean: m, sd, p05: s[Math.floor(0.05 * s.length)], p50: s[Math.floor(0.5 * s.length)], p95: s[Math.floor(0.95 * s.length)] }; };
  const c = { nm, n: arw.length, model: { arw: P0.dut.gyro.arw, bi: P0.dut.gyro.bi }, lim: { arw: P0.wb.H.arw, bi: P0.wb.H.bias }, arw: st(arw), bi: st(bi), tauB: st(tauB),
    pFailArw: arw.filter(x => x > P0.wb.H.arw).length / arw.length, pFailBi: bi.filter(x => x > P0.wb.H.bias).length / bi.length, pOk: ok.reduce((x, y) => x + y, 0) / ok.length, raw: { arw, bi } };
  out.cases.push(c);
  console.log(`${nm}: n ${c.n} · ARW ort ${c.arw.mean.toFixed(5)} sd ${c.arw.sd.toFixed(5)} · BI ort ${c.bi.mean.toFixed(4)} sd ${c.bi.sd.toFixed(4)} (%5–%95 ${c.bi.p05.toFixed(4)}–${c.bi.p95.toFixed(4)}) · taban τ ortanca ${c.tauB.p50.toFixed(0)} s · P(BI > ${c.lim.bi}) ${(100 * c.pFailBi).toFixed(1)} % · P(ARW > ${c.lim.arw}) ${(100 * c.pFailArw).toFixed(1)} % · OK ${(100 * c.pOk).toFixed(1)} % [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'gyro_eng.json'), JSON.stringify(out));
