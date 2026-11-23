// v13.14 §13 Düzenek: oynatma koşularının ham kaydı (1 kHz) ve video kareleri → bağımsız Python denetimi (play_ref.py).
// Her durum: ENG.playScenario (keepRec) → <ad>.bin (Float64: kanallar ve video dizileri art arda) + play_dump.json (başlık, meta,
// motorun özet metrikleri, ilgili parametreler). Ayrıca varsayılan deniz profilinin ön hesapla aynılığı (belirlenimcilik).
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const D = __dirname, PRE = JSON.parse(fs.readFileSync(path.join(D, '../../../app/pre.json'), 'utf8'));
const cases = [
  ['sea_on', 'sub', { kind: 'sea', stab: true, T: 60 }],
  ['sea_off', 'sub', { kind: 'sea', stab: false, T: 60 }],
  ['sine_on', 'sub', { kind: 'sine', stab: true, T: 60 }],
  ['sine_off', 'sub', { kind: 'sine', stab: false, T: 60 }],
  ['slap_on', 'sub', { kind: 'slap', stab: true, T: 60 }],
  ['still_on', 'sub', { kind: 'still', stab: true, T: 60 }],
  ['viv_on', 'sub', { kind: 'viv', stab: true, T: 60 }],
  ['sea_x2', 'sub', { kind: 'sea', stab: true, T: 60, scale: 2 }],
  ['sea_120', 'sub', { kind: 'sea', stab: true, T: 120 }],
  ['still_nocomp', 'sub', { kind: 'still', stab: true, T: 60 }, (P) => { P.wb.earth.comp = false; }],
  ['ship_sea_on', 'ship', { kind: 'sea', stab: true, T: 60 }],
  ['ship_viv_on', 'ship', { kind: 'viv', stab: true, T: 60 }],
];
const CH = ['opt_el', 'opt_xel', 'cmd_r', 'cmd_p', 'cmd_y', 'base_r', 'base_p', 'base_y', 'enc_a', 'enc_e', 'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel'];
const VCH = ['t', 'x', 'y', 'valid', 'mEl', 'mXel', 'vEl', 'vXel', 'oEl', 'oXel'];
const head = {};
for (const [nm, plat, opt, mod] of cases) {
  const P = L.defaultParams(plat); if (mod) mod(P);
  const t0 = Date.now(), out = L.playScenario(P, Object.assign({}, opt, { keepRec: true }), null), R = out._R, V = R.video;
  const bufs = [], layout = [];
  let off = 0; const add = (name, a, n) => { const f = Float64Array.from(a.subarray ? a.subarray(0, n) : a.slice(0, n)); bufs.push(Buffer.from(f.buffer)); layout.push([name, off, n]); off += n; };
  for (const c of CH) if (R.rec[c]) add('rec.' + c, R.rec[c], R.meta.nRec);
  if (R.rec.tr_x) for (const c of ['tr_x', 'tr_y', 'tr_z']) add('rec.' + c, R.rec[c], R.meta.nRec);
  for (const c of VCH) add('vid.' + c, V[c], V.n);
  for (const c of ['base_r', 'base_p', 'base_y', 'enc_a', 'enc_e', 'opt_el', 'opt_xel']) add('p50.' + c, out[c], out.n);
  add('p50.pup_h', out.pupil.h, out.n); add('p50.pup_v', out.pupil.v, out.n); add('p50.pup_ov', out.pupil.ov, out.n);
  fs.writeFileSync(path.join(D, nm + '.bin'), Buffer.concat(bufs));
  const d = L.derive(P), G = L.collGeom(P);
  head[nm] = { plat, opt, layout, meta: { fs: R.meta.fs, fRec: R.meta.fRec, nRec: R.meta.nRec, IFOV: R.meta.IFOV, IFOVt: R.meta.IFOVt, Tint: R.meta.Tint, fps: R.meta.fps, a0: R.meta.a0, e0: R.meta.e0,
      vx0: V.x0, vy0: V.y0, vn: V.n, vfps: V.fps, vIFOV: V.IFOV },
    metrics: out.metrics, earth: out.earth, geom: out.geom, seaQ: out.seaQ || null, n50: out.n,
    P: { video: P.dut.video, Nh: d.Nh, Nv: d.Nv, k1: P.dut.optics ? P.dut.optics.k1 : null, hex: P.wb.hex, earth: P.wb.earth, eis: P.wb.eis, viv: P.wb.viv, wviv: P.wb.wviv, Tw: P.ana.Tw,
      coll: { Dc: G.Dc, Dp: G.Dp, k: G.k, eFree: G.eFree, Loff: G.Loff, Lpg: G.Lpg }, req: d.req, slap: P.env.slap },
    s: (Date.now() - t0) / 1000 };
  if (nm === 'sea_on') head[nm].preSame = JSON.stringify(out.metrics) === JSON.stringify(PRE.play.on.metrics);
  if (nm === 'ship_sea_on') head[nm].preSame = JSON.stringify(out.metrics) === JSON.stringify(PRE.ship.play.on.metrics);
  if (nm === 'sea_off') head[nm].preSame = JSON.stringify(out.metrics) === JSON.stringify(PRE.play.off.metrics);
  // VIV: döngü modelinin DRR'ı (f_v'de) — kapalı döngü bastırma beklentisi
  if (/viv/.test(nm)) { const lp = L.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J), f = out.metrics.viv.f; head[nm].drr = L.cabs(lp.drr(2 * Math.PI * f)); head[nm].vs = L.vivSpec(P); delete head[nm].vs.risk; delete head[nm].vs.w; }
  if (nm === 'still_nocomp' || nm === 'still_on') head[nm].es = L.earthSheet(P);
  console.log(nm, head[nm].s.toFixed(1) + ' s', 'preSame' in head[nm] ? 'ön hesapla aynı: ' + head[nm].preSame : '');
}
// pupilOverlap: bağımsız daire kesişimi denetimi için örnek noktalar
head.overlap = [[0.1, 0.15, 0], [0.1, 0.15, 0.02], [0.1, 0.15, 0.025], [0.1, 0.15, 0.05], [0.1, 0.15, 0.1], [0.1, 0.15, 0.13], [0.1, 0.2, 0.04], [0.1, 0.2, 0.08]].map(([Dp, Dc, e]) => [Dp, Dc, e, L.pupilOverlap(Dp, Dc, e)]);
fs.writeFileSync(path.join(D, 'play_dump.json'), JSON.stringify(head));
