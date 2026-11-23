// §12 Proje LOS kalıntı gereksinimleri (v12): T1.9'un parametre değişimlerine yanıtı (karar kuralı, kabul tabanı, pencere, yüksek geçiren,
// takip döngüsü, PPV katsayısı, gemi). Çıktı: los.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const mk = (fn, kind) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const out = [];
const cases = [['varsayılan', mk()], ['karar: en kötü pencere', mk(P => { P.ana.los.decide = 'enkotu'; })], ['karar: havuzlanmış RMS', mk(P => { P.ana.los.decide = 'ortalama'; })],
  ['kabul tabanı: takip öncesi', mk(P => { P.ana.los.basis = 'once'; })], ['RMS / PPV penceresi 120 s', mk(P => { P.ana.los.Tw = 120; })], ['RMS / PPV penceresi 30 s', mk(P => { P.ana.los.Tw = 30; })],
  ['yüksek geçiren 0,05 Hz', mk(P => { P.ana.los.fHP = 0.05; })], ['takip bandı 1,5 Hz', mk(P => { P.ana.los.trk.bw = 1.5; })], ['takip bandı 5 Hz', mk(P => { P.ana.los.trk.bw = 5; })],
  ['takip gecikmesi 1 kare', mk(P => { P.ana.los.trk.lat_frames = 1; })], ['PPV katsayısı 8,5', mk(P => { P.ana.los.kPPV = 8.5; })], ['gemi', mk(null, 'ship')]];
for (const [nm, P] of cases) {
  const t0 = Date.now(), r = L.runTest('T1.9', P, { IFOVcal: pre.ctx.IFOVcal }, null);
  const k = (re) => { const q = r.kv.find(x => re.test(x[0])); return q ? q[1] : '—'; };
  out.push({ nm, st: r.status, m: r.measured, trk: k(/^Dış kamera takip/), post: k(/^Takip sonrası: σ_El/), ppv: k(/^Takip sonrası: PPV/), pre: k(/^Takip öncesi: σ_El/) });
  console.log(`${nm}: ${r.status} — ${r.measured.slice(0, 420)} | takip: ${k(/^Dış kamera takip/).slice(0, 160)} | sonrası σ: ${k(/^Takip sonrası: σ_El/)} | PPV: ${k(/^Takip sonrası: PPV/)} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'los.json'), JSON.stringify(out, null, 1));
