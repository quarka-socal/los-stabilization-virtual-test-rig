// v13.10: extra.json'daki T2.2 kestirim hatası koşusunu önhesaptaki T2.2 ile aynı ölçekle (T0.1 kalibre IFOV) yeniler
'use strict';
const fs = require('fs'), path = require('path'), L = require('../../engine.js'), pre = require('../../../app/pre.json');
const fx = path.join(__dirname, '../../extra.json'), X = JSON.parse(fs.readFileSync(fx, 'utf8')), ctx = { IFOVcal: pre.ctx.IFOVcal }, est = [];
for (const e of [0.05, 0.1]) { const Q = L.defaultParams(); Q.dut.ctl.res.estErr = e; const r = L.runTest('T2.2', Q, ctx, null), mm = r.measured.match(/en kötü ([\d.]+) µrad/); est.push({ e, st: r.status, worst: mm ? +mm[1] : null }); }
const Q0 = L.defaultParams(), r0 = L.runTest('T2.2', Q0, ctx, null);
console.log('önceki', JSON.stringify(X.est), '→ yeni', JSON.stringify(est), '| e = 0 denetimi:', r0.measured.match(/en kötü ([\d.]+) µrad/)[1], '(önhesap', pre.tests['T2.2'].measured.match(/en kötü ([\d.]+) µrad/)[1] + ')');
X.est = est; fs.writeFileSync(fx, JSON.stringify(X, null, 1));
