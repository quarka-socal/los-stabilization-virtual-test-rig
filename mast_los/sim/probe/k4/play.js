// Teknik kılavuz §4 (VIV) — Düzenek oynatması: yalnız VIV tonu (T2.2 türü) ve deniz + VIV (T2.3 türü), iki platform.
// Taban genliği, LOS'taki ton bileşeni (sinüs uydurması), dB, öteleme (gemi), stab ON/OFF ve dar bant kapalı karşılaştırması.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const mk = (k, fn) => { const P = L.defaultParams(k); if (fn) fn(P); return P; };
const cases = [
  ['denizaltı, yalnız VIV tonu', mk('sub'), { kind: 'viv', T: 60 }],
  ['denizaltı, yalnız VIV tonu, dar bant kapalı', mk('sub', P => { P.dut.ctl.res.on = false; }), { kind: 'viv', T: 60 }],
  ['denizaltı, yalnız VIV tonu, stab OFF', mk('sub'), { kind: 'viv', T: 60, stab: false }],
  ['denizaltı, deniz + VIV', mk('sub'), { kind: 'seaviv', T: 60 }],
  ['gemi, yalnız rüzgâr VIV tonu (β = 0°)', mk('ship'), { kind: 'viv', T: 60 }],
  ['gemi, yalnız rüzgâr VIV tonu, dar bant kapalı', mk('ship', P => { P.dut.ctl.res.on = false; }), { kind: 'viv', T: 60 }],
  ['gemi, yalnız rüzgâr VIV tonu, β = 90°', mk('ship', P => { P.wb.wviv.beta = 90; }), { kind: 'viv', T: 60 }],
  ['gemi, deniz + rüzgâr VIV', mk('ship'), { kind: 'seaviv', T: 60 }],
];
const out = [], pk = (a) => a ? a.reduce((m, v) => Math.max(m, Math.abs(v)), 0) : 0;
for (const [nm, P, o] of cases) {
  const t0 = Date.now(), R = L.playScenario(P, Object.assign({ seed: 1301 }, o)), m = R.metrics, v = m.viv;
  const r = { nm, kind: o.kind, stab: o.stab !== false, f: v.f, base: v.base * 1e6, losEl: v.los * 1e6, losXel: v.losXel * 1e6, dB: 20 * Math.log10(Math.max(v.los, v.losXel) / v.base),
    y: v.y * 1e3, acc: v.acc, lim: v.limited, tr: R.tr_x ? [R.tr_x, R.tr_y, R.tr_z].map(a => pk(a) * 1e3) : null, rms: [m.rmsEl * 1e6, m.rmsXel * 1e6], valid: m.validFrac,
    hex: m.base[0], sat: m.sat };
  out.push(r);
  console.log(`${nm} [${((Date.now() - t0) / 1000).toFixed(0)} s] | f ${r.f.toFixed(2)} Hz | taban ${r.base.toFixed(1)} µrad RMS → LOS el ${r.losEl.toFixed(2)} / xel ${r.losXel.toFixed(2)} µrad (${r.dB.toFixed(1)} dB)` +
    (r.tr ? ` | öteleme tepe x/y/z ${r.tr.map(x => x.toFixed(1)).join('/')} mm, ±${r.y.toFixed(1)} mm, ${r.acc.toFixed(2)} m/s²` : '') + ` | LOS RMS el/xel ${r.rms.map(x => x.toFixed(2)).join('/')} µrad | FOV ${(100 * r.valid).toFixed(1)} % | hexapod roll tepe ${r.hex.th.toFixed(3)}°, ${r.hex.al.toFixed(1)}°/s²${r.lim ? ' | SINIRLI' : ''}`);
}
require('fs').writeFileSync(path.join(__dirname, 'play.json'), JSON.stringify(out, null, 1));
