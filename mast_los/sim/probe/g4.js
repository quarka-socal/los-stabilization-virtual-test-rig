const L = require('../engine.js');
const P = L.defaultParams();
const T0 = Date.now();
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
for (const fs of [1000, 2000]) {
  const n = 620 * fs, r = mulberry32(12345), el = new Float64Array(n), xel = new Float64Array(n);
  for (let i = 0; i < n; i++) { el[i] = 2e-6 * gauss(r); xel[i] = 2e-6 * gauss(r); }
  const m = L.losReqMetrics(P, el, xel, fs, { skip: 20 });
  console.log('white fs', fs, 'td', (m.exp.tdEl * 1e6).toFixed(4), 'psd', (m.exp.el * 1e6).toFixed(4), 'exp N', (2 * Math.sqrt(1 - 1 / Math.round(0.01 * fs))).toFixed(4));
}
for (const fsr of [1000, 2000, 4000]) {
  const S = L.opScenario(P, { T: 140, seed: 3, fs: 4000, derot: true }); S.rec = { fs: fsr, ch: ['opt_el', 'opt_xel'] };
  const R = L.runSim(P, S, null);
  const m = L.losReqMetrics(P, R.rec.opt_el, R.rec.opt_xel, R.meta.fRec, { skip: 20 });
  console.log('op rec', fsr, 'td', (m.exp.tdEl * 1e6).toFixed(4), (m.exp.tdXel * 1e6).toFixed(4), 'psd', (m.exp.el * 1e6).toFixed(4), (m.exp.xel * 1e6).toFixed(4), 'σEl', (m.sEl.pooled * 1e6).toFixed(3), 'bands', m.pe.bands.map(v => (v * 1e6).toFixed(3)).join('/'), 'above', (m.pe.above * 1e6).toFixed(3));
}
console.log(((Date.now() - T0) / 1000).toFixed(1), 's');
