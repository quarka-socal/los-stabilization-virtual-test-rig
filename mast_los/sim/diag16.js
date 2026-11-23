const L = require('./engine.js');
const D2R = Math.PI/180, TAU = 2*Math.PI;
function run(label, mod) {
  const P = L.defaultParams(); const f = 0.05, A = 5;
  const sg = L.segSines([{ axis: 0, f, A: A*D2R, nper: 4 }]);
  const S = L.labScenario(P, { label: 'T1.6', T: sg.T, fs: 4000, cmd: sg.cmd, seed: 1600 });
  S.mech = {}; mod && mod(P, S);
  const R = L.runSim(P, S, null);
  const tr = new Float64Array(R.meta.nRec).map((_, i) => i / R.meta.fRec);
  const s = sg.segs[0]; let i0 = 0; while (tr[i0] < s.c0) i0++; let i1 = i0; while (i1 < tr.length && tr[i1] <= s.c1) i1++;
  const out = {};
  for (const ch of ['ac_el', 'opt_el']) {
    const fit = L.sineFit(tr, R.rec[ch], f, { i0, i1 });
    let ss = 0, pk = 0;
    for (let i = i0; i < i1; i++) { const t = tr[i]; const r = R.rec[ch][i] - (fit.a*Math.cos(TAU*f*t) + fit.b*Math.sin(TAU*f*t) + fit.c0 + fit.c1*(t-(tr[i0]+tr[i1-1])/2)); ss += r*r; pk = Math.max(pk, Math.abs(r)); }
    out[ch] = { A: fit.A*1e6, rms: Math.sqrt(ss/(i1-i0))*1e6, pk: pk*1e6 };
  }
  console.log(label.padEnd(28), 'ac: fund', out.ac_el.A.toFixed(2), 'res', out.ac_el.rms.toFixed(2), 'pk', out.ac_el.pk.toFixed(1), '| opt: res', out.opt_el.rms.toFixed(2), 'pk', out.opt_el.pk.toFixed(1));
}
const which = process.argv[2] || 'all';
const V = {
  nominal: null,
  noCog: (P,S) => { S.mech.cogging = false; },
  noFric: (P,S) => { S.mech.friction = false; },
  noMicro: (P,S) => { S.meas = Object.assign({}, S.meas, { microvib: false }); },
  noGyroN: (P,S) => { S.mech.gyroNoise = false; S.mech.gyroBias = false; },
  eta1: (P,S) => { P.dut.ctl.ff.eta = 1.0; },
  ffOff: (P,S) => { P.dut.ctl.ff.on = false; },
  noCogMicro: (P,S) => { S.mech.cogging = false; S.meas = Object.assign({}, S.meas, { microvib: false }); },
  onlyFric: (P,S) => { S.mech.cogging = false; S.mech.gyroNoise = false; S.mech.gyroBias = false; S.mech.imbalance=false; S.meas = Object.assign({}, S.meas, { microvib: false, noise: false, air: false }); },
};
for (const [k, fn] of Object.entries(V)) if (which === 'all' || which.split(',').includes(k)) run(k, fn);
