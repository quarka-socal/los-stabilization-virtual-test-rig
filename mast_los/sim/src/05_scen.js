// ============================================================================
// 05_scen.js — işletme (mast başı) senaryosu, kaynak ayrıştırma, LOS metrikleri
// ============================================================================
const SRC_IDS = ['sea_r', 'sea_p', 'sea_y', 'viv', 'slap', 'lat', 'plat', 'aux', 'hfa', 'hfl', 'sea_s', 'sea_w', 'sea_h'];
const SRC_LABEL = {
  sea_r: 'Deniz: roll', sea_p: 'Deniz: pitch', sea_y: 'Deniz: yaw', sea_s: 'Deniz: surge (x)', sea_w: 'Deniz: sway (y)', sea_h: 'Deniz: heave (z)',
  viv: 'VIV / mast modu', slap: 'Dalga çarpması',
  lat: 'Yanal doğrusal ivme', plat: 'Platform titreşimi (4–33 Hz)', aux: 'Yardımcı makine (50 Hz, yapı yolu)',
  hfa: 'Yüksek frekans açısal titreşim', hfl: 'Yüksek frekans doğrusal titreşim',
};
// seri başına yükselen/inen kosinüs rampası
function rampSeries(d, fsg, rampS) {
  const n = d.length, nr = Math.min(Math.floor(n / 2), Math.round(rampS * fsg));
  for (let i = 0; i < nr; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / nr); d[i] *= g; d[n - 1 - i] *= g; }
  return d;
}
// deniz profili, açısal eksen. 'dar': eşdeğer sinüs genliği A → σ = A/√2, log-Gauss dar bant;
// '6dof': bant sınırlı (f1–f2), σ = A_tepe/kp. Tam RMS. opt.der: türevler de döner (kaldıraç kolu ivmesi için).
function seaSeries(P, T, rng, axis, opt) {
  opt = opt || {};
  const sea = P.wb.sea, scale = opt.scale == null ? 1 : opt.scale;
  const fsg = 20, n = Math.ceil((T + 2) * fsg), rp = opt.ramp == null ? 10 : opt.ramp;
  if (sea.mode !== '6dof' && !opt.der) {          // önceki sürümle bit düzeyinde aynı yol
    const A = [sea.roll_A, sea.pitch_A, sea.yaw_A][axis] * D2R * scale, Tp = [sea.roll_T, sea.pitch_T, sea.yaw_T][axis];
    const d = synthSeries(shapeLogGauss(1 / Tp, P.env.seaWidth), fsg, n, rng, A / Math.SQRT2);
    return { type: 'series', axis, data: rampSeries(d, fsg, rp), fs: fsg };
  }
  const q = seaDOF(P).ang[axis];
  const tgt = sea.mode !== '6dof' ? [sea.roll_A, sea.pitch_A, sea.yaw_A][axis] * D2R * scale / Math.SQRT2 : q.sigma * scale;
  const s = synthSeriesDer(q.shape, fsg, n, rng, tgt);
  rampSeries(s.x, fsg, rp); rampSeries(s.v, fsg, rp); rampSeries(s.a, fsg, rp);
  return { type: 'series', axis, data: s.x, fs: fsg, der: { v: s.v, a: s.a } };
}
// 6-DOF deniz hareketi: açısal komutlar + doğrusal etki. İşletme ('op'): ağırlık merkezi ötelemesinin ivmesi (tam ikinci
// türev) ve LOS referans noktasındaki kaldıraç kolu ivmesi, rijit cisim ifadesiyle tam: a = ω̇_B × r + ω_B × (ω_B × r),
// r = (rx, ry, rz) gövdede; ω_B Euler hızlarından (ZYX, benzetimin taban kinematiğiyle aynı ifadeler):
//   p = φ̇ − ψ̇·sinθ,  q = θ̇·cosφ + ψ̇·cosθ·sinφ,  r = −θ̇·sinφ + ψ̇·cosθ·cosφ   (ω̇_B bunların zaman türevi)  → 'acc' (gövde)
// v13.1: önceki küçük açı ifadesi (ω ≈ (φ̇, θ̇, ψ̇)) düşey kolda %1–2 doğruydu, ama boyuna kolda pitch ivmesinin roll'la
// izdüşümünü (−r_x·θ̈·φ) kaçırıyor ve y ivmesini SS4'te %19, SS5'te %36 yanlış veriyordu (probe/k3/exactacc.js, V&V S2).
// Kaldıraç kolu yalnız deniz hareketinden üretilir (VIV, darbe ve yüksek frekans açısal titreşim yerel yapı hareketidir).
// Laboratuvar ('lab'): hexapod öteleme yer değiştirmesi = ağırlık merkezi ötelemesi + (R − I)·r, R = Rz(ψ)·Ry(θ)·Rx(φ)
// (benzetimin taban duruşuyla aynı dönüş sırası); stroku aşmayacak ortak q oranıyla ölçeklenir.
function seaMotion(P, T, rngf, o) {
  o = o || {};
  const on = o.on || { sea_r: true, sea_p: true, sea_y: true, sea_s: true, sea_w: true, sea_h: true };
  const D = seaDOF(P), scale = o.scale == null ? 1 : o.scale, ramp = o.ramp;
  const needDer = D.rOn && (on.sea_r || on.sea_p || on.sea_y);
  const ids = ['sea_r', 'sea_p', 'sea_y'], cmd = [], A = [null, null, null];
  for (let ax = 0; ax < 3; ax++) {
    if (!on[ids[ax]]) continue;
    const c = seaSeries(P, T, rngf(ids[ax]), ax, { scale, ramp, der: needDer });
    A[ax] = c; const e = Object.assign({}, c); delete e.der;
    if (o.angCmd !== false) cmd.push(e);          // angCmd: false → yalnız kaldıraç kolu ivmesi (açısal hareketin kendisi uygulanmaz)
  }
  const out = { cmd, acc: [], trans: [], q: 1, demand: 0, h: D.h, r: D.r, six: D.six };
  const lidx = ['sea_s', 'sea_w', 'sea_h'], L = [null, null, null];
  if (D.six) for (let ax = 0; ax < 3; ax++) {
    const q = D.lin[ax]; if (!on[lidx[ax]] || !q.active) continue;
    const fsg = 20, n = Math.ceil((T + 2) * fsg), s = synthSeriesDer(q.shape, fsg, n, rngf(lidx[ax]), q.sigma * scale);
    const rp = ramp == null ? 10 : ramp; rampSeries(s.x, fsg, rp); rampSeries(s.a, fsg, rp);
    L[ax] = s;
  }
  const fsg = 20, nS = Math.ceil((T + 2) * fsg), z = new Float64Array(nS);
  const get = (s, k) => s ? s : z;
  if (o.world === 'lab') {
    // hexapod yer değiştirmesi (m): ağırlık merkezi ötelemesi + kaldıraç kolunun kinematik konumu (R − I)·r
    const phi = A[0] ? A[0].data : z, th = A[1] ? A[1].data : z, ps = A[2] ? A[2].data : z, rx = D.r[0], ry = D.r[1], rz = D.r[2];
    const dx = new Float64Array(nS), dy = new Float64Array(nS), dz = new Float64Array(nS);
    const lx = get(L[0] && L[0].x), ly = get(L[1] && L[1].x), lz = get(L[2] && L[2].x);
    for (let i = 0; i < nS; i++) {
      const cf = Math.cos(phi[i]), sf = Math.sin(phi[i]), ct = Math.cos(th[i]), st = Math.sin(th[i]), cp = Math.cos(ps[i]), sp = Math.sin(ps[i]);
      const r00 = cp * ct, r01 = cp * st * sf - sp * cf, r02 = cp * st * cf + sp * sf;
      const r10 = sp * ct, r11 = sp * st * sf + cp * cf, r12 = sp * st * cf - cp * sf;
      const r20 = -st, r21 = ct * sf, r22 = ct * cf;
      dx[i] = lx[i] + (r00 - 1) * rx + r01 * ry + r02 * rz;
      dy[i] = ly[i] + r10 * rx + (r11 - 1) * ry + r12 * rz;
      dz[i] = lz[i] + r20 * rx + r21 * ry + (r22 - 1) * rz;
    }
    let pk = 0; for (const d of [dx, dy, dz]) for (let i = 0; i < nS; i++) pk = Math.max(pk, Math.abs(d[i]));
    const stroke = P.lab.hexStroke, q = pk > stroke ? stroke / pk : 1;
    out.q = q; out.demand = pk;
    if (pk > 0) [dx, dy, dz].forEach((d, ax) => { let any = false; for (let i = 0; i < nS; i++) if (d[i] !== 0) { any = true; break; } if (any) out.trans.push({ type: 'series', axis: ax, data: d, fs: fsg, scale: q }); });
    return out;
  }
  // işletme: ivme (m/s², gövde)
  const rx = D.r[0], ry = D.r[1], rz = D.r[2], ax = new Float64Array(nS), ay = new Float64Array(nS), az = new Float64Array(nS);
  let any = false;
  if (D.rOn && (A[0] || A[1] || A[2])) {
    const ph = A[0] ? A[0].data : z, pv = A[0] ? A[0].der.v : z, pa = A[0] ? A[0].der.a : z;
    const th = A[1] ? A[1].data : z, qv = A[1] ? A[1].der.v : z, qa = A[1] ? A[1].der.a : z;
    const yv = (A[2] && A[2].der) ? A[2].der.v : z, ya = (A[2] && A[2].der) ? A[2].der.a : z;
    for (let i = 0; i < nS; i++) {
      const cf = Math.cos(ph[i]), sf = Math.sin(ph[i]), ct = Math.cos(th[i]), st = Math.sin(th[i]);
      const p = pv[i] - yv[i] * st, q = qv[i] * cf + yv[i] * ct * sf, w = -qv[i] * sf + yv[i] * ct * cf;
      const pd = pa[i] - ya[i] * st - yv[i] * qv[i] * ct;
      const qd = qa[i] * cf - qv[i] * pv[i] * sf + ya[i] * ct * sf - yv[i] * qv[i] * st * sf + yv[i] * pv[i] * ct * cf;
      const wd = -qa[i] * sf - qv[i] * pv[i] * cf + ya[i] * ct * cf - yv[i] * qv[i] * st * cf - yv[i] * pv[i] * ct * sf;
      const cx = q * rz - w * ry, cy = w * rx - p * rz, cz = p * ry - q * rx;            // ω_B × r
      ax[i] = (qd * rz - wd * ry) + (q * cz - w * cy);
      ay[i] = (wd * rx - pd * rz) + (w * cx - p * cz);
      az[i] = (pd * ry - qd * rx) + (p * cy - q * cx);
    }
    any = true;
  }
  for (let k = 0; k < 3; k++) if (L[k]) { const d = [ax, ay, az][k]; for (let i = 0; i < nS; i++) d[i] += L[k].a[i]; any = true; }
  if (any) [ax, ay, az].forEach((d, k) => { let nz = false; for (let i = 0; i < nS; i++) if (d[i] !== 0) { nz = true; break; } if (nz) out.acc.push({ type: 'series', axis: k, data: d, fs: fsg }); });
  return out;
}
function narrowSeries(fp, bw, rms, T, rng, axis, ramp) {
  const fsg = Math.max(40, Math.ceil(20 * (fp + 3 * bw))), n = Math.ceil((T + 2) * fsg);
  const d = synthSeries(shapeGauss(fp, bw), fsg, n, rng, rms);
  return { type: 'series', axis, data: rampSeries(d, fsg, ramp == null ? 5 : ramp), fs: fsg };
}
// Rüzgâr VIV'i (gemi direği): kilitlenmede f_n'de dar bantlı direk modu. Tek bir birim RMS gerçekleşme u(t) ve
// tam ikinci türevi ü(t) üretilir; açı = A/√2·u (roll, pitch bileşenleri), öteleme ivmesi = y/√2·ü (x, y bileşenleri).
// Açı ve öteleme aynı moddan geldiği için aynı fazdadır (tepe +y·n'e giderken direk o yana yatar).
function windVivComps(P, VS, T, rng, fOverride, ramp) {
  const f = fOverride || VS.f, bw = P.env.viv.bw;
  const fsg = Math.max(100, Math.ceil(40 * (f + 3 * bw))), n = Math.ceil((T + 2) * fsg);
  const s = synthSeriesD2(shapeGauss(f, bw), fsg, n, rng, 1);
  const rp = ramp == null ? 5 : ramp;
  rampSeries(s.x, fsg, rp); rampSeries(s.a, fsg, rp);
  const cmd = [], acc = [], k = 1 / Math.SQRT2;
  if (Math.abs(VS.roll) > 1e-12) cmd.push({ type: 'series', axis: 0, data: s.x, fs: fsg, scale: VS.roll * VS.A * k });
  if (Math.abs(VS.pitch) > 1e-12) cmd.push({ type: 'series', axis: 1, data: s.x, fs: fsg, scale: VS.pitch * VS.A * k });
  if (VS.lin) {
    if (Math.abs(VS.tx) > 1e-12) acc.push({ type: 'series', axis: 0, data: s.a, fs: fsg, scale: VS.tx * VS.y * k });
    if (Math.abs(VS.ty) > 1e-12) acc.push({ type: 'series', axis: 1, data: s.a, fs: fsg, scale: VS.ty * VS.y * k });
  }
  return { cmd, acc, f };
}
// v13.3: deniz ötelemesi (6-DOF ya da kaldıraç kolu) ile VIV tonunun ötelemesi aynı hexapod strokunu paylaşır. Ton için
// yer ayrılır: deniz ötelemesinin ölçeği q' = min(q, (strok − y_ton)/talep). SM.trans bileşenlerinin ölçeği yerinde değişir.
function reserveStroke(P, SM, yV) {
  if (!SM.trans.length || !(yV > 0) || !(SM.demand > 0)) return SM.q;
  const q2 = Math.max(0, Math.min(SM.q, (P.lab.hexStroke - yV) / SM.demand));
  for (const c of SM.trans) c.scale = q2;
  return q2;
}
// Laboratuvarda rüzgâr VIV tonu (T2.2/T2.3/T4.2 ve düzenek): hexapod açısal sinüs (roll/pitch) + öteleme sinüsü (x/y,
// m) aynı fazda. Genlik hexapod erişimiyle sınırlanırsa öteleme de aynı oranda ölçeklenir (mod biçimi korunur).
function windTone(P, VS, f, t0, t1, ramp, scale) {
  // ölçek: istenen × sc; hexapod açısal erişimi (θ/ω/α) ve öteleme stroku aşılmayacak biçimde ortak oranla küçültülür
  const sc = scale == null ? 1 : scale, qa = VS.A > 0 ? Math.min(sc, derive(P).reach(f) * D2R / VS.A) : 0;
  const q = (VS.lin && VS.y > 0) ? Math.min(qa, P.lab.hexStroke / VS.y) : qa, Ar = VS.A * q, yA = VS.y * q;
  const cmd = [], trans = [], base = { type: 'sine', f, t0, ramp };
  if (t1 != null) base.t1 = t1;
  if (Math.abs(VS.roll) > 1e-12) cmd.push(Object.assign({}, base, { axis: 0, A: VS.roll * Ar }));
  if (Math.abs(VS.pitch) > 1e-12) cmd.push(Object.assign({}, base, { axis: 1, A: VS.pitch * Ar }));
  if (VS.lin) {
    if (Math.abs(VS.tx) > 1e-12) trans.push(Object.assign({}, base, { axis: 0, A: VS.tx * yA }));
    if (Math.abs(VS.ty) > 1e-12) trans.push(Object.assign({}, base, { axis: 1, A: VS.ty * yA }));
  }
  return { cmd, trans, A: Ar, y: yA, acc: sq(TAU * f) * yA, limited: q < sc * (1 - 1e-9) };
}
function slapEvents(P, T, rng, t0) {
  const sl = P.env.slap, ev = [];
  let t = t0 || 10;
  while (true) {
    t += -Math.log(rng.uniform()) / sl.rate;
    if (t > T - 1) break;
    const Tp = sl.Tmin + (sl.Tmax - sl.Tmin) * rng.uniform();
    const A = sl.A * URAD * Math.sqrt(-2 * Math.log(rng.uniform())) / Math.SQRT2 * (rng.uniform() < 0.5 ? -1 : 1);
    ev.push({ t0: t, Tp, A });
  }
  return ev;
}
// İşletme senaryosu: o.src {id:bool}, o.mech {..}
function opScenario(P, o) {
  o = o || {};
  const T = o.T || 600, seed = ((o.seed == null ? 11 : o.seed) + 7919 * ((P.ana && P.ana.seedOffset) || 0)) >>> 0, rngf = makeRngFactory(seed);
  const on = Object.assign(Object.fromEntries(SRC_IDS.map(k => [k, true])), o.src || {});
  const env = P.env, wb = P.wb;
  const cmd = [], vib = [], acc = [], accMount = [];
  const seaScale = o.seaScale == null ? 1 : o.seaScale;
  // deniz: açısal komutlar; 6-DOF kipinde ağırlık merkezi ötelemesi ve kaldıraç kolu (r ≠ 0) ivmesi 'acc' kanalına
  const SM = seaMotion(P, T, rngf, { scale: seaScale, on, world: 'op', angCmd: o.seaAngCmd });
  cmd.push(...SM.cmd); acc.push(...SM.acc);
  const VS = vivSpec(P);
  if (on.viv && VS.present) {
    if (VS.kind === 'hydro' && !VS.lin) cmd.push(narrowSeries(o.vivF || wb.viv.fn, env.viv.bw, wb.viv.amp_deg * D2R / Math.SQRT2, T, rngf('viv'), 0, 5));   // denizaltı, yalnız açısal (uyum kipi)
    else { const wv = windVivComps(P, VS, T, rngf('viv'), o.vivF, 5); cmd.push(...wv.cmd); acc.push(...wv.acc); }   // gemi: rüzgâr VIV'i; v13.3 denizaltı: açı + mast başı ötelemesi ivmesi
  }
  if (on.slap && sourceActive(P, 'slap')) cmd.push({ type: 'halfsine', axis: 0, events: slapEvents(P, T, rngf('slap'), 10) });   // gemi direğinde dalga çarpması yok
  if (on.lat) acc.push(narrowSeries(env.lat.f, env.lat.bw, env.lat.a_rms, T, rngf('lat'), 1, 5));
  if (on.plat) for (let i = 0; i < 3; i++) accMount.push({ type: 'noise', axis: i, rms: env.plat.a_rms, hp: env.plat.f1, hp2: env.plat.f1, lp: env.plat.f2, lp2: env.plat.f2, stream: 'plat' + i, t0: 0, ramp: 5 });
  // yardımcı makine: kafada yapı yolu doğrusal titreşim tonu (optik alt montaj + dengesizlik üzerinden LOS'a)
  if (on.aux) { const r = rngf('aux'); for (let i = 0; i < 3; i++) acc.push({ type: 'sine', axis: i, A: env.aux.a, f: env.aux.f, ph: TAU * r.uniform(), t0: 0, ramp: 2 }); }
  if (on.hfa) for (let i = 0; i < 3; i++) vib.push({ type: 'noise', axis: i, rms: env.hf.ang_rms * URAD, hp: env.hf.f1, lp: env.hf.f2, stream: 'hfa' + i, ramp: 2 });
  if (on.hfl) for (let i = 0; i < 3; i++) acc.push({ type: 'noise', axis: i, rms: env.hf.acc_rms, hp: env.hf.f1, lp: env.hf.f2, stream: 'hfl' + i, ramp: 2 });
  const mech = o.mech ? Object.assign(Object.fromEntries(Object.keys(MECH_DEFAULT).map(k => [k, false])), o.mech) : Object.assign({}, MECH_DEFAULT);
  if (o.mechAll) Object.assign(mech, MECH_DEFAULT);
  return {
    label: o.label || 'İşletme', T, fs: o.fs || 4000, world: 'op', stab: true, seed, hexF: 1500,
    cmd, vib, acc, accMount, mech, earthComp: o.earthComp != null ? o.earthComp : true, derot: o.derot,
    meas: { video: true, ac: false, imu: false, air: false, microvib: false, noise: false },
    rec: { fs: 1000, ch: o.ch || ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'rot', 'rot_res', 'base_r', 'base_p', 'base_y'] },
    vivF: o.vivF, resF: o.vivF || (VS.kind === 'wind' ? VS.f : wb.viv.fn),
  };
}
// kayıttan ve karelerden LOS metrikleri (ilk 'skip' saniye atılır)
function sliceVideo(V, t0) {
  let i0 = 0; while (i0 < V.n && V.t[i0] < t0) i0++;
  const sub = (a) => a.subarray(i0, V.n);
  return { n: V.n - i0, t: sub(V.t), x: sub(V.x), y: sub(V.y), valid: sub(V.valid), mEl: sub(V.mEl), mXel: sub(V.mXel),
    vEl: sub(V.vEl), vXel: sub(V.vXel), oEl: sub(V.oEl), oXel: sub(V.oXel), fps: V.fps, Tint: V.Tint, IFOV: V.IFOV, x0: V.x0, y0: V.y0 };
}
function losMetrics(R, P, opt) {
  opt = opt || {};
  const skip = opt.skip == null ? 20 : opt.skip, fr = R.meta.fRec, i0 = Math.min(R.meta.nRec - 10, Math.round(skip * fr)), n = R.meta.nRec;
  const out = { skip };
  const ser = (c) => R.rec[c] ? Float64Array.from(R.rec[c].subarray(i0, n)) : null;
  const el = ser('opt_el'), xel = ser('opt_xel');
  // RMS: doğrusal trend çıkarılmış (drift ayrı raporlanır)
  if (el) { const de = detrend(el, 'linear'), dx = detrend(xel, 'linear');
    out.rms = { el: aRms(de), xel: aRms(dx) }; out.p99 = { el: aPctAbs(de, 99), xel: aPctAbs(dx, 99) }; }
  const me = ser('mech_el'); if (me) out.rmsMech = { el: aRms(detrend(me, 'linear')), xel: aRms(detrend(ser('mech_xel'), 'linear')) };
  const rr = ser('rot_res'); if (rr) { out.rotRes = aRms(detrend(rr, 'linear')); out.rot = aRms(detrend(ser('rot'), 'linear')); }
  if (opt.psd !== false && el) {
    const nseg = opt.nseg || 32768;
    const pe = welch(el, fr, nseg), px = welch(xel, fr, nseg);
    out.psd = { f: pe.f, el: pe.P, xel: px.P, df: pe.df };
    out.band = { el: { B1: bandRms(pe.f, pe.P, 0, 1), B2: bandRms(pe.f, pe.P, 1, 20), B3: bandRms(pe.f, pe.P, 20, fr / 2), hp1: bandRms(pe.f, pe.P, 1, fr / 2) },
                 xel: { B1: bandRms(px.f, px.P, 0, 1), B2: bandRms(px.f, px.P, 1, 20), B3: bandRms(px.f, px.P, 20, fr / 2), hp1: bandRms(px.f, px.P, 1, fr / 2) } };
  }
  if (R.video && R.video.n > 10) {
    const V = sliceVideo(R.video, skip);
    out.video = videoMetrics(V, { which: 'true', Tw: P.ana.Tw, detrend: P.ana.detrend, tau: P.wb.tau, pdeWin: P.ana.pdeWin });
  }
  return out;
}
// Bütçe satırı → işletme ayrıştırma koşusu tanımı
const OP_ROWS = [
  { id: 'B1-01', src: ['sea_r'], mech: ['coupling', 'earth'] },
  { id: 'B1-02', src: ['sea_p'], mech: ['coupling', 'earth'] },
  { id: 'B1-03', src: ['sea_y'], mech: ['coupling', 'earth'] },
  { id: 'B1-04', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['misalign', 'earth'] },
  { id: 'B1-05', src: [], mech: ['gyroNoise', 'earth'], metric: 'arw' },
  { id: 'B1-06', src: [], mech: ['gyroBias', 'earth'], metric: 'bias' },
  { id: 'B1-07', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['friction', 'earth'] },
  { id: 'B2-01', src: ['viv'], mech: ['coupling', 'earth'] },
  { id: 'B2-02', src: ['slap'], mech: ['coupling', 'earth'] },
  { id: 'B2-03', src: ['lat'], mech: ['imbalance', 'earth'] },
  { id: 'B2-04', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['cogging', 'earth'] },
  { id: 'B2-05', src: [], mech: ['gyroNoise', 'earth'], metric: 'gyroband', same: 'B1-05' },
  { id: 'B2-06', src: ['plat'], mech: ['coupling', 'imbalance', 'optMode', 'earth'] },
  { id: 'B3-01', src: ['aux'], mech: ['optMode', 'imbalance', 'earth'] },
  { id: 'B3-02', src: [], mech: ['cooler', 'earth'] },
  { id: 'B3-03', src: ['hfl'], mech: ['optMode', 'earth'] },
  { id: 'B3-04', src: ['hfa'], mech: ['gimMode', 'earth'] },
  { id: 'R-01', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['coupling', 'earth'], metric: 'rot' },
  { id: 'H7', src: [], mech: ['compErr', 'earth'], metric: 'drift' },
  // ek satır (v11): deniz ötelemesi (6-DOF ağırlık merkezi + kaldıraç kolu) ivmesinin dengesizlik ve optik montaj
  // yoluyla LOS'a etkisi. Açısal diziler yalnız kaldıraç kolu ivmesini üretmek için kullanılır; tabanın kendisi döndürülmez
  // (yerçekiminin eğilen az boyunduruğundaki dengesizlik torku açısal harekete aittir, öteleme değildir).
  { id: 'B1-08', src: ['sea_s', 'sea_w', 'sea_h', 'lever'], srcRun: ['sea_r', 'sea_p', 'sea_y', 'sea_s', 'sea_w', 'sea_h'], seaAngCmd: false, mech: ['imbalance', 'optMode', 'earth'], ext: true },
];
function rowScenario(P, row, o) {
  o = o || {};
  const src = Object.fromEntries(SRC_IDS.map(k => [k, (row.srcRun || row.src).includes(k)]));
  // gemi: rüzgâr VIV'i direk tepesini de öteler → dengesizlik torku ve optik montaj esnemesi de B2-01'in parçasıdır (v13.3:
  // denizaltında da mast başı ötelemesi açıkken)
  const mechL = (row.id === 'B2-01' && vivSpec(P).lin) ? ['coupling', 'imbalance', 'optMode', 'earth'] : row.mech;
  const mech = Object.fromEntries(mechL.map(k => [k, true]));
  const T = o.T || 600;
  const hf = row.src.some(s => s === 'aux' || s === 'hfa' || s === 'hfl') || row.mech.includes('cooler');
  return opScenario(P, { T: hf ? Math.min(T, 60) : T, seed: o.seed, src, mech, fs: o.fs || (hf ? 4000 : 2000), seaAngCmd: row.seaAngCmd,
    derot: row.metric === 'rot' ? true : undefined, label: row.id, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'rot', 'rot_res'] });
}
