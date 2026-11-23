// §10 K1 seçeneği (c): B1-07 / B2-03 / B2-04 tahminleri yapılandırılmış DUT'un işletme değerine (2,71 / 1,64 / 0,85) çekilirse bütçe toplamları
'use strict';
const fs = require('fs'), path = require('path');
let s = fs.readFileSync(path.join(__dirname, '../../engine.js'), 'utf8');
const rep = [["id: 'B1-07', band: 'B1', name: 'Sürtünme / hız işaret değişimi', E: 3,", "id: 'B1-07', band: 'B1', name: 'Sürtünme / hız işaret değişimi', E: 2.71,"],
  ["name: 'Doğrusal ivme × gimbal kütle dengesizliği', E: 2,", "name: 'Doğrusal ivme × gimbal kütle dengesizliği', E: 1.64,"],
  ["name: 'Kablo / keçe torku dalgalanması', E: 1.5,", "name: 'Kablo / keçe torku dalgalanması', E: 0.85,"]];
for (const [a, b] of rep) { if (!s.includes(a)) throw new Error('yok: ' + a); s = s.replace(a, b); }
const tmp = path.join(__dirname, 'engine_budc.js'); fs.writeFileSync(tmp, s);
const L0 = require('../../engine.js'), L1 = require(tmp);
for (const k of ['sub', 'ship']) { const a = L0.computeBudget(L0.defaultParams(k), null), b = L1.computeBudget(L1.defaultParams(k), null);
  console.log(`${k}: wander ${a.wander.toFixed(2)} → ${b.wander.toFixed(2)} µrad, smear ${a.smear.toFixed(2)} → ${b.smear.toFixed(2)} µrad (gereksinim ${a.reqW.toFixed(1)} / ${a.reqS.toFixed(1)})`); }
fs.unlinkSync(tmp);
