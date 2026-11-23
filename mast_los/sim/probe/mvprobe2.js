// Mikro-titreşimin LOS'a aktarımı: bant bazında (taban → LOS) ve video zinciri karşılığı
const L = require('../engine.js');
const P = L.defaultParams('sub');
const quiet = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: false, gyroBias: false, imbalance: true, gimMode: true, optMode: true, cooler: false, earth: false, compErr: false };
const bands = [[5, 20], [20, 50], [50, 100], [100, 150], [150, 450]];
for (const [stab, fric] of [[true, true], [true, false], [false, true]]) {
  const S = L.labScenario(P, { label: 'mv', T: 70, fs: 4000, stab, seed: 31, cmd: [] });
  S.mech = Object.assign({}, quiet, { friction: fric });
  S.meas = { video: true, ac: true, imu: true, air: false, microvib: true, noise: false };
  S.rec = { fs: 1000, ch: ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y'] };
  const R = L.runSim(P, S, null), i0 = 10000;
  const w = (c) => L.welch(L.detrend(Float64Array.from(R.rec[c].subarray(i0)), 'linear'), 1000, 4096);
  const pe = w('opt_el'), pr = w('base_r'), pp = w('base_p'), py = w('base_y');
  const row = bands.map(([a, b]) => { const e = L.bandRms(pe.f, pe.P, a, b), r = L.bandRms(pr.f, pr.P, a, b); return `${a}-${b} Hz: LOS ${ (e * 1e6).toFixed(2)} / taban roll ${(r * 1e6).toFixed(2)}`; });
  // video: kare ortalaması
  const V = R.video; const v = L.videoAngles ? null : null;
  console.log(`stab ${stab ? 'ON' : 'OFF'}${fric ? '' : ' (sürtünme kapalı)'} | LOS el toplam ${(L.bandRms(pe.f, pe.P, 1, 499) * 1e6).toFixed(2)} µrad | ` + row.join(' | '));
}
