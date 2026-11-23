// T0.7 tohum çalışmasını özetler → t07.json (Yöntem sekmesi). Girdi: t07_base.log, t07_fresh.log (t07_study.js çıktısı)
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./engine.js');
const rd = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
const DEGPH = Math.PI / 180 / 3600;

// Clopper–Pearson %95 aralığı (kesin binom)
function lnChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
function binomCdf(k, n, p) { if (k < 0) return 0; if (k >= n) return 1; let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnChoose(n, i) + i * Math.log(p) + (n - i) * Math.log1p(-p)); return Math.min(1, s); }
function bisect(f, lo, hi) { for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (f(m)) hi = m; else lo = m; } return 0.5 * (lo + hi); }
function clopperPearson(k, n, a = 0.05) {
  const lo = k === 0 ? 0 : bisect(p => 1 - binomCdf(k - 1, n, p) >= a / 2, 0, 1);
  const hi = k === n ? 1 : bisect(p => binomCdf(k, n, p) <= a / 2, 0, 1);
  return [lo, hi];
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };
const median = (a) => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : 0.5 * (b[n / 2 - 1] + b[n / 2]); };

// dünya dönüşü artığının görüntü eksenlerine izdüşümü (varsayılan geometri): l̇ = Δ × l; el = ·z_r, xel = ·y_r
const P = L.defaultParams(), d = L.derive(P), l = d.los0, D = d.Delta;
let yr = [-l[1], l[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = yr.map(v => v / n); }
const zr = [l[1] * yr[2] - l[2] * yr[1], l[2] * yr[0] - l[0] * yr[2], l[0] * yr[1] - l[1] * yr[0]];
const v = [D[1] * l[2] - D[2] * l[1], D[2] * l[0] - D[0] * l[2], D[0] * l[1] - D[1] * l[0]];
const eV = v[0] * zr[0] + v[1] * zr[1] + v[2] * zr[2], eH = v[0] * yr[0] + v[1] * yr[1] + v[2] * yr[2];

function summarize(rows) {
  rows.sort((a, b) => a.k - b.k);
  const n = rows.length, lim = rows[0].lim, fails = rows.filter(r => r.status !== 'OK');
  const gH = rows.map(r => r.onH - eH), gV = rows.map(r => r.onV - eV);
  const ratio = rows.map(r => Math.max(Math.abs(r.onH), Math.abs(r.onV)) / lim);
  const failH = rows.filter(r => Math.abs(r.onH) > lim).length, failV = rows.filter(r => Math.abs(r.onV) > lim).length;
  const ci = clopperPearson(fails.length, n);
  return { n, fails: fails.length, rate: fails.length / n, ci, failSeeds: fails.map(r => r.k), failH, failV,
    gyro: { meanH: mean(gH), sdH: sd(gH), meanV: mean(gV), sdV: sd(gV) },
    ratio: { median: median(ratio), max: Math.max(...ratio) },
    rows: rows.map(r => ({ k: r.k, s: r.status === 'OK' ? 1 : 0, h: r.onH, v: r.onV })) };
}
const base = summarize(rd('t07_base.log')), fresh = summarize(rd('t07_fresh.log'));
const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds.json'), 'utf8'));
const st5 = seeds.tests['T0.7'] && seeds.tests['T0.7'].status, n5 = seeds.n, fail5 = n5 - ((st5 && st5.OK) || 0);
const out = {
  generated: new Date().toISOString(),
  method: 'runTest(T0.7) varsayılan parametrelerle, P.ana.seedOffset = 0…n−1, kampanyanın IFOV kalibrasyonuyla (ctx.IFOVcal); fresh: gyro bias koşudan hemen önce kalibre (Gauss–Markov bileşenleri sıfırdan, sabit artık ±bias0 kalır)',
  lim: base.rows.length ? rd('t07_base.log')[0].lim : null,
  limParts: (() => { const EL = L.earthLimits(P); return { compRes: EL.comp, B: EL.bias, Bdeg: EL.biasDph, BinstDeg: P.wb.H.bias, b0Deg: EL.ext ? (P.wb.H.b0_res || 0) : 0, tcDeg: EL.ext ? Math.abs((P.wb.H.tc_bias || 0) * (P.wb.H.dT || 0)) : 0 }; })(),   // v13.7: bütçe drift bileşimi
  earth: { h: eH, v: eV },
  dut: { bi: P.dut.gyro.bi, bias0: P.dut.gyro.bias0 },
  five: { n: n5, fails: fail5, pZero: Math.pow(1 - base.rate, n5) },
  base, fresh,
};
fs.writeFileSync(path.join(__dirname, 't07.json'), JSON.stringify(out));
const f = (x, dd = 3) => (x * 1e6).toFixed(dd);
console.log(`dünya payı el ${f(eV)} xel ${f(eH)} µrad/s · eşik ${f(out.lim)}`);
for (const [nm, s] of [['durağan başlangıç', base], ['taze kalibrasyon', fresh]])
  console.log(`${nm}: ${s.fails}/${s.n} AŞIM (%${(100 * s.rate).toFixed(1)}; %95 GA ${(100 * s.ci[0]).toFixed(1)}–${(100 * s.ci[1]).toFixed(1)}) · eksen: xel ${s.failH} el ${s.failV} · gyro payı sd el ${f(s.gyro.sdV)} xel ${f(s.gyro.sdH)} µrad/s (${(s.gyro.sdV / DEGPH).toFixed(3)} / ${(s.gyro.sdH / DEGPH).toFixed(3)} °/h), ort el ${f(s.gyro.meanV)} xel ${f(s.gyro.meanH)} · oran medyan ${s.ratio.median.toFixed(3)} max ${s.ratio.max.toFixed(3)} · tohumlar ${s.failSeeds.join(',')}`);
console.log(`5 tekrarda ${out.five.fails}/${out.five.n}; p̂ ile 5'te sıfır görme olasılığı ${out.five.pZero.toFixed(2)}`);
