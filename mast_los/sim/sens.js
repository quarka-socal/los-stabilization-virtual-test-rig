// Duyarlılık: sürtünmenin ön-kayma aralığı (F_c/σ0) — en belirsiz model varsayımı. Ölçütler: T2.2 3 Hz dwell artığı
// (dar bant kapalı/açık), T1.6 senkron ortalama tepesi ve tekrarlanan RMS, işletme B1-07 satırı. Çıktı: sens.json
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const D2R = Math.PI / 180;
const t0 = Date.now(), rows = [];
for (const ps of [0.3e-3, 1e-3, 3e-3]) {
  const P = L.defaultParams();
  for (const a of [P.dut.el, P.dut.az]) a.sigma0 = a.Fc / ps;
  const out = { presliding_mrad: ps * 1e3 };
  // T2.2 türü: 3 Hz, 0,05°, 60 s; dar bant kapalı ve açık
  for (const resOn of [false, true]) {
    const P2 = L.cloneParams(P); P2.dut.ctl.res.on = resOn;
    const f = P.wb.viv.fn, sg = L.segSines([{ axis: 0, f, A: P.wb.viv.amp_deg * D2R, nper: Math.round(60 * f) }]);
    const R = L.runSim(P2, L.labScenario(P2, { label: 'sens', T: sg.T, fs: 2000, cmd: sg.cmd, resF: f, seed: 2200 }));
    const fit = L.fitSegments(P2, R, sg.segs, {})[0];
    out[resOn ? 't22on' : 't22off'] = fit.fe ? fit.fe.A / Math.SQRT2 : NaN;
  }
  // T1.6 ve B1-07
  const r16 = L.runTest('T1.6', P, {}, null);
  out.t16pk = Math.max(...r16.kv.filter(([k]) => / → /.test(k) && !/tek tek/.test(k)).map(([, v]) => +(v.match(/TSA tepe ([\d.]+)/) || [0, NaN])[1])) * 1e-6;
  out.b107lab = r16.fill['B1-07'];
  const Rop = L.runSim(P, L.rowScenario(P, L.OP_ROWS.find(r => r.id === 'B1-07'), { T: 600 }));
  out.b107op = L.losMetrics(Rop, P, { skip: 20, psd: false }).rms.el;
  rows.push(out);
  console.log(JSON.stringify(out));
}
fs.writeFileSync(path.join(__dirname, 'sens.json'), JSON.stringify({ rows, elapsed: (Date.now() - t0) / 1000 }, null, 1));
console.log('bitti', ((Date.now() - t0) / 1000).toFixed(0), 's');
