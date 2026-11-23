const L = require('../engine.js'), D2R = Math.PI / 180;
for (const k of ['sub', 'ship', 'sub']) {
  const P = L.defaultParams(k), d = L.derive(P);
  const freqs = Array.from(new Set([0.05, 0.1, 0.2, 0.5, 1, 1 / P.wb.sea.roll_T, 1 / P.wb.sea.pitch_T, 1 / P.wb.sea.yaw_T].map(f => Math.round(f * 1e4) / 1e4))).sort((a, b) => a - b);
  const amp = [P.wb.sea.roll_A, P.wb.sea.pitch_A, P.wb.sea.yaw_A], per = [P.wb.sea.roll_T, P.wb.sea.pitch_T, P.wb.sea.yaw_T];
  const line = [];
  for (const ax of [0, 2, 1]) {
    const list = freqs.map(f => ({ axis: ax, f, A: Math.min(amp[ax], d.reach(f)) * D2R, nper: 10 }));
    const fDom0 = Math.round(1 / per[ax] * 1e4) / 1e4; list.push({ axis: ax, f: fDom0, A: 0.5 * Math.min(amp[ax], d.reach(fDom0)) * D2R, nper: 10, half: true });
    const sg = L.segSines(list);
    const t0 = Date.now(); L.runSim(P, L.labScenario(P, { label: 'T1.1', T: sg.T, fs: 2000, cmd: sg.cmd, seed: 1100 + ax }), null);
    line.push(`ax${ax} T=${sg.T.toFixed(0)}s → ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log(k, line.join(' | '));
}
