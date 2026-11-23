// §9 Örnek DUT — stabilizasyon döngüsü: motorun analitik döngü modelinden (loopModel) değerler → loop_eng.json.
// Bağımsız ikinci uygulama loop_ref.py aynı durumların parametrelerini bu dosyadan okur ve karşılaştırır.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const TAU = 2 * Math.PI, db = (c) => 20 * Math.log10(Math.hypot(c.re, c.im)), ph = (c) => Math.atan2(c.im, c.re) * 180 / Math.PI;
const FQ = [0.0833, 0.1, 0.125, 0.2, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 20, 30, 40, 50, 70, 100, 200];
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
// durum: [ad, eksen, P, resF (adaptif dar bandın ayarlandığı frekans; null = res.f)]
const cases = [
  ['el varsayılan', 'el', mk()], ['az varsayılan (ε 0°)', 'az', mk()],
  ['el dar bant kapalı', 'el', mk(null, P => { P.dut.ctl.res.on = false; })], ['az dar bant kapalı', 'az', mk(null, P => { P.dut.ctl.res.on = false; })],
  ['el f_c 20 Hz', 'el', mk(null, P => { P.dut.el.fc = 20; })], ['el f_c 60 Hz', 'el', mk(null, P => { P.dut.el.fc = 60; })],
  ['el f_i 2 Hz', 'el', mk(null, P => { P.dut.el.fi = 2; })], ['el f_i 8 Hz', 'el', mk(null, P => { P.dut.el.fi = 8; })],
  ['el dar bant 10 dB', 'el', mk(null, P => { P.dut.ctl.res.gain_dB = 10; })], ['el dar bant 30 dB', 'el', mk(null, P => { P.dut.ctl.res.gain_dB = 30; })],
  ['el dar bant @ 1,2 Hz', 'el', mk(), 1.2], ['el dar bant @ 6 Hz', 'el', mk(), 6.0],
  ['az elevasyon 60°', 'az', mk(null, P => { P.wb.earth.el = 60; })],
  ['el f_ctl 1 kHz', 'el', mk(null, P => { P.dut.ctl.fctl = 1000; })], ['el f_ctl 4 kHz', 'el', mk(null, P => { P.dut.ctl.fctl = 4000; })],
  ['el gyro ek gecikmesi 1 ms', 'el', mk(null, P => { P.dut.gyro.lat_ms = 1; })],
  ['az f_c 45 Hz', 'az', mk(null, P => { P.dut.az.fc = 45; })],
];
const out = [];
for (const [nm, ax, P, rf] of cases) {
  const d = L.derive(P), ap = P.dut[ax], J = ax === 'el' ? P.dut.el.J : d.azJ;
  const lp = rf ? L.loopModel(ap, P.dut.ctl, P.dut.gyro, P.dut.cur, J, rf) : (ax === 'el' ? d.loopEl : d.loopAz);
  let Smax = 0, fS = 0, Tmax = 0, fT = 0;
  for (let f = 0.5; f < 0.49 * P.dut.ctl.fctl; f *= 1.005) { const Lw = lp.L(TAU * f), S = 1 / Math.hypot(1 + Lw.re, Lw.im), Tc = Math.hypot(Lw.re, Lw.im) * S; if (S > Smax) { Smax = S; fS = f; } if (Tc > Tmax) { Tmax = Tc; fT = f; } }
  out.push({ nm, ax, par: { J, b: ap.b, k: ap.k, fc: ap.fc, fi: ap.fi, ctl: P.dut.ctl, gyro: { fbw: P.dut.gyro.fbw, lat_ms: P.dut.gyro.lat_ms || 0 }, cur: P.dut.cur, resF: rf || P.dut.ctl.res.f },
    K: lp.K, fcx: lp.fcx, pm: lp.pm, gm: lp.gm, gmF: lp.gmF, Smax_dB: 20 * Math.log10(Smax), fS, Tmax_dB: 20 * Math.log10(Tmax), fT,
    drr: FQ.map(f => [f, db(lp.drr(TAU * f)), ph(lp.drr(TAU * f))]), torque: [1, 10, 100].map(f => [f, db(lp.torque(TAU * f))]), gyroN: [1, 10, 100].map(f => [f, db(lp.gyroN(TAU * f))]),
    Lpts: [5, 20, 40, 80, 150].map(f => { const c = lp.L(TAU * f); return [f, c.re, c.im]; }) });
}
require('fs').writeFileSync(path.join(__dirname, 'loop_eng.json'), JSON.stringify(out));
for (const o of out) console.log(`${o.nm.padEnd(28)} K ${o.K.toFixed(3).padStart(9)} f_kesim ${o.fcx.toFixed(2).padStart(6)} PM ${o.pm.toFixed(2).padStart(6)}° GM ${o.gm.toFixed(2).padStart(6)} dB @ ${o.gmF ? o.gmF.toFixed(1) : '—'} Hz |S|max ${o.Smax_dB.toFixed(2)} dB @ ${o.fS.toFixed(1)} · DRR 0,125 ${o.drr[2][1].toFixed(1)} · 1 ${o.drr[5][1].toFixed(1)} · 3 ${o.drr[7][1].toFixed(1)} · 5 ${o.drr[9][1].toFixed(1)} · 40 ${o.drr[15][1].toFixed(1)} dB`);
