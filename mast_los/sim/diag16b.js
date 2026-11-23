const L = require('./engine.js');
const D2R = Math.PI/180, TAU = 2*Math.PI;
function run(label, mod, nper) {
  const P = L.defaultParams(); const f = 0.05, A = 5;
  const sg = L.segSines([{ axis: 0, f, A: A*D2R, nper }]);
  const S = L.labScenario(P, { label: 'T1.6', T: sg.T, fs: 4000, cmd: sg.cmd, seed: 1600 });
  S.mech = {}; mod && mod(P, S);
  const R = L.runSim(P, S, null);
  const fr = R.meta.fRec, tr = new Float64Array(R.meta.nRec).map((_, i) => i / fr);
  const s = sg.segs[0]; const Tp = 1/f, np = Math.round(Tp*fr);
  let i0 = 0; while (tr[i0] < s.c0) i0++; const K = Math.floor((s.c1 - s.c0) * f); const i1 = i0 + K*np;
  const ch = 'ac_el';
  const fit = L.sineFit(tr, R.rec[ch], f, { i0, i1 });
  const r = new Float64Array(i1-i0);
  for (let i = i0; i < i1; i++) { const t = tr[i]; r[i-i0] = R.rec[ch][i] - (fit.a*Math.cos(TAU*f*t) + fit.b*Math.sin(TAU*f*t) + fit.c0 + fit.c1*(t-(tr[i0]+tr[i1-1])/2)); }
  // moving average over one period (centered, circular edges by clamping)
  const n = r.length, cs = new Float64Array(n+1); for (let i = 0; i < n; i++) cs[i+1] = cs[i] + r[i];
  const hp = new Float64Array(n); const h = Math.floor(np/2);
  for (let i = 0; i < n; i++) { let a = i - h, b = a + np; if (a < 0) { a = 0; b = np; } if (b > n) { b = n; a = n - np; } hp[i] = r[i] - (cs[b]-cs[a])/np; }
  // TSA
  const avg = new Float64Array(np); for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) avg[j] += hp[k*np+j]/K;
  let v = 0; for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) v += (hp[k*np+j]-avg[j])**2; v /= (K*np); // per-sample noise var (biased by (K-1)/K)
  const varN = v * K/(K-1);
  let ra = 0, pa = 0; for (let j = 0; j < np; j++) { ra += avg[j]**2; pa = Math.max(pa, Math.abs(avg[j])); } ra /= np;
  const det = Math.sqrt(Math.max(0, ra - varN/K));
  const rmsR = Math.sqrt(r.reduce((s,x)=>s+x*x,0)/n), rmsH = Math.sqrt(hp.reduce((s,x)=>s+x*x,0)/n);
  console.log(label.padEnd(12), `K=${K} raw ${(rmsR*1e6).toFixed(2)} hp ${(rmsH*1e6).toFixed(2)} | TSA rms ${(Math.sqrt(ra)*1e6).toFixed(2)} det ${(det*1e6).toFixed(2)} noise ${(Math.sqrt(varN)*1e6).toFixed(2)} pkTSA ${(pa*1e6).toFixed(1)}`);
}
const nper = +(process.argv[3] || 10);
const V = { nominal: null, noFric: (P,S) => { S.mech.friction = false; }, noCog: (P,S)=>{S.mech.cogging=false;}, noFricCog: (P,S)=>{S.mech.friction=false;S.mech.cogging=false;} };
for (const k of (process.argv[2]||'nominal,noFric').split(',')) run(k, V[k], nper);
