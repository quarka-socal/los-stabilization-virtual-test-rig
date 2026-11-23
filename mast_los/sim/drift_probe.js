// Düzenek sekmesindeki doğrusal kaymanın kaynak ayrıştırması (ablasyon).
// Her koşu: playScenario (UI ile aynı yol), 60 s, stab AÇIK; eğimler µrad/s.
'use strict';
const L = require('./engine.js');
const IF = 40; // µrad/px (nominal)

function run(label, mod, o) {
  const P = L.defaultParams();
  if (mod) mod(P);
  const opt = Object.assign({ kind: 'sine', T: 60, stab: true, scale: 1 }, o || {});
  const r = L.playScenario(P, opt, null);
  const V = r.video;
  // video karelerinden (UI'deki iz) eğim: 10 s sonrası, geçerli kareler; px → µrad (nominal IFOV)
  let n = 0, st = 0, sx = 0, sy = 0, stt = 0, stx = 0, sty = 0;
  for (let i = 0; i < V.n; i++) {
    if (!V.ok[i] || V.t[i] < 10) continue;
    const t = V.t[i]; n++; st += t; stt += t * t; sx += V.x[i]; sy += V.y[i]; stx += t * V.x[i]; sty += t * V.y[i];
  }
  const den = n * stt - st * st;
  const vx = (n * stx - st * sx) / den * IF, vy = (n * sty - st * sy) / den * IF;
  // UI ekranındaki kare (2140) — karşılaştırma için
  const k = Math.min(2140, V.n - 1);
  const m = r.metrics;
  const out = { label, slEl: m.slopeEl * 1e6, slXel: m.slopeXel * 1e6, vidX: vx, vidY: vy,
    f2140: { x_px: V.x[k], y_px: V.y[k], x_ur: V.x[k] * IF, y_ur: V.y[k] * IF },
    mag: Math.hypot(m.slopeEl, m.slopeXel) * 1e6, angDeg: Math.atan2(m.slopeEl, m.slopeXel) * 180 / Math.PI };
  console.log(JSON.stringify(out));
  return out;
}

const which = (process.argv[2] || 'core').split(',');
const R = {};
const noBias = (P) => { P.dut.gyro.bi = 0; P.dut.gyro.bias0 = 0; };
const noDelta = (P) => { P.wb.earth.delta_deg = 0; };
if (which.includes('core')) {
  R.A = run('A varsayılan (δ=1°, gyro bias açık)');
  R.B = run('B δ=0 (yalnız gyro bias)', noDelta);
  R.C = run('C gyro bias=0 (yalnız Ω·δ)', noBias);
  R.D = run('D δ=0 ve bias=0', (P) => { noDelta(P); noBias(P); });
  R.Dn = run('D2 δ=0, bias=0, ARW=0', (P) => { noDelta(P); noBias(P); P.dut.gyro.arw = 0; });
  R.E = run('E kompanzasyon KAPALI', (P) => { P.wb.earth.comp = false; });
  R.F = run('F stab KAPALI', null, { stab: false });
  R.G = run('G δ=−1° (işaret ters)', (P) => { P.wb.earth.delta_deg = -1; noBias(P); });
  R.H = run('H δ=2° (bias=0)', (P) => { P.wb.earth.delta_deg = 2; noBias(P); });
}
if (which.includes('geo')) {
  for (const lat of [0, 20, 40, 60, 89]) run(`lat=${lat}° (bias=0)`, (P) => { P.wb.earth.lat = lat; noBias(P); });
}
if (which.includes('kinds')) {
  for (const kind of ['still', 'sea', 'slap', 'sine']) run(`kind=${kind} varsayılan`, null, { kind });
  for (const kind of ['still', 'sea', 'sine']) run(`kind=${kind} δ=0 bias=0`, (P) => { noDelta(P); noBias(P); }, { kind });
}
if (which.includes('seeds')) {
  for (const seed of [1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308]) run(`seed=${seed} varsayılan`, null, { seed });
  for (const seed of [1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308]) run(`seed=${seed} δ=0`, noDelta, { seed });
}
