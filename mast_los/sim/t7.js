const L = require('./engine.js');
// FOH Osc2 doğrulaması: rampa, sinüs, yüksek ω·dt
for (const [f, fs] of [[1500, 2000], [1500, 4000], [20, 4000], [180, 2000]]) {
  const o = new L.Osc2(f, 0.7071, 1 / fs);
  let maxEv = 0, maxEx = 0, maxEa = 0;
  const fin = 3, A = 0.05, w = 2 * Math.PI * fin;
  for (let k = 0; k < fs * 4; k++) {
    const t = k / fs; const u = A * Math.sin(w * t); o.step(u);
    if (t > 1) {
      // sürekli zaman kararlı durum: H(jω) = ω_n²/(ω_n² − ω² + j2ζω_nω)
      const wn = 2 * Math.PI * f, z = 0.7071; const re = wn * wn - w * w, im = 2 * z * wn * w; const mag = wn * wn / Math.hypot(re, im), ph = -Math.atan2(im, re);
      const xe = A * mag * Math.sin(w * t + ph), ve = A * mag * w * Math.cos(w * t + ph), ae = -A * mag * w * w * Math.sin(w * t + ph);
      maxEx = Math.max(maxEx, Math.abs(o.x - xe)); maxEv = Math.max(maxEv, Math.abs(o.v - ve)); maxEa = Math.max(maxEa, Math.abs(o.a - ae));
    }
  }
  console.log(`f=${f} fs=${fs}: |Δx|/A=${(maxEx / A).toExponential(2)} |Δv|/(Aω)=${(maxEv / (A * w)).toExponential(2)} |Δa|/(Aω²)=${(maxEa / (A * w * w)).toExponential(2)}`);
}
