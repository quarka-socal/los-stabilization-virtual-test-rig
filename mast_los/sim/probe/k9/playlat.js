// Düzenek oynatması, kompanzasyon KAPALI: enlem ve α değişince birikmiş dünya dönüşü kayması (60 s) ↔ analitik
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
for (const [lat, az] of [[40, 90], [20, 90], [0, 90], [80, 90], [40, 45], [20, 45], [40, 0]]) {
  const P = L.defaultParams('sub'); P.wb.earth.comp = false; P.wb.earth.lat = lat; P.wb.earth.az = az;
  const r = L.playScenario(P, { kind: 'sea', T: 60 }, null), d = r.metrics.drift, es = L.earthSheet(P);
  const T = r.T || 60;
  console.log(`φ ${lat}° α ${az}°: oynatma eğimi el ${(d.earthEl * 1e6).toFixed(2)} xel ${(d.earthXel * 1e6).toFixed(2)} µrad/s (60 s: ${(d.earthEl * 6e7).toFixed(0)} / ${(d.earthXel * 6e7).toFixed(0)}) · analitik |düşey| ${es.v.toFixed(2)} |yatay| ${es.h.toFixed(2)} · yön ${(Math.atan2(Math.abs(d.earthEl), Math.abs(d.earthXel)) * 180 / Math.PI).toFixed(1)}° yataydan`);
}
