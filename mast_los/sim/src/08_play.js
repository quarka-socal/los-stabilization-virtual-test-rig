// ============================================================================
// 08_play.js — Düzenek sekmesi: kısa oynatma koşuları (hexapod + DUT + kolimatör)
// Çıktı: 50 Hz'e indirgenmiş poz/gimbal/LOS dizileri + video kareleri + özet metrikler
// ============================================================================
const PLAY_KINDS = {
  sea: 'Deniz profili (T1.3 türü, çok eksenli)',
  seaviv: 'Deniz profili + VIV tonu (T2.3 türü)',
  viv: 'Yalnız VIV tonu (T2.2 türü dwell)',
  sine: 'Tek eksen sinüs (T1.1 türü)',
  slap: 'Dalga çarpması darbeleri (T2.4 türü)',
  still: 'Durağan (T0.3 türü, hexapod servo açık)',
};
function playScenario(P, o, prog) {
  o = o || {};
  const kind = o.kind || 'sea', T = Math.max(10, Math.min(300, o.T || 60)), stab = o.stab !== false;
  const seed = o.seed || 1301, rngf = makeRngFactory(seed), scale = o.scale == null ? 1 : o.scale;
  const cmd = [];
  let trans = [];
  // VIV: denizaltında su içinde ilerleyen mastta girdap kopmasının mast başında doğurduğu açısal hareket (f_v = f_n,
  // 0,05°); gemide rüzgârın direk modunda doğurduğu açısal hareket + aynı fazda direk tepesi ötelemesi (EN 1991-1-4)
  const VS = vivSpec(P), ship = VS.kind === 'wind';
  const vivOn = VS.present, fv = o.f || (ship ? VS.f : P.wb.viv.fn), hasViv = vivOn && (kind === 'seaviv' || kind === 'viv');
  let tone = null;
  // gemi ve (v13.3) mast başı ötelemesi açık denizaltı: açısal + aynı fazda öteleme tonu (erişim ve strok sınırlı)
  if (hasViv && (ship || VS.lin)) { tone = windTone(P, VS, fv, kind === 'viv' ? 1 : 5, null, 3, scale); trans = tone.trans; }
  const Aviv = hasViv ? (tone ? tone.A : Math.min(P.wb.viv.amp_deg * scale, derive(P).reach(fv)) * D2R) : 0;     // taban VIV genliği (rad)
  const subLim = hasViv && !tone && P.wb.viv.amp_deg * scale > derive(P).reach(fv);      // v13.2: yalnız açısal ton erişimle küçültüldü mü
  let seaQ = null, SMtr = null;
  if (kind === 'sea' || kind === 'seaviv') {
    // açısal profil; 6-DOF kipinde ve kaldıraç kolunda hexapod ötelemesi (strokla sınırlı ortak oran q)
    const SM = seaMotion(P, T, rngf, { scale, ramp: 5, world: 'lab' });
    cmd.push(...SM.cmd);
    if (SM.trans.length) {
      if (kind === 'seaviv' && tone && tone.y > 0) SM.q = reserveStroke(P, SM, tone.y);      // v13.3: tona strok ayrılır
      trans = SM.trans.concat(trans); seaQ = { q: SM.q, demand: SM.demand }; SMtr = SM.trans;
    }
    if (kind === 'seaviv' && vivOn) { if (tone) cmd.push(...tone.cmd); else cmd.push({ type: 'sine', axis: 0, A: Aviv, f: fv, t0: 5, ramp: 3 }); }
  } else if (kind === 'viv') {
    if (vivOn) { if (tone) cmd.push(...tone.cmd); else cmd.push({ type: 'sine', axis: 0, A: Aviv, f: fv, t0: 1, ramp: 3 }); }
  } else if (kind === 'sine') {
    const f = o.f || 0.125, A = Math.min((o.A || 2) * scale, derive(P).reach(f)) * D2R;
    cmd.push({ type: 'sine', axis: o.axis || 0, A, f, t0: 1, t1: T - 1, ramp: Math.max(1, 0.5 / f) });
  } else if (kind === 'slap') {
    const hx = P.wb.hex, ev = []; let t = 3, i = 0;
    while (t < T - 2) {
      const Tp = [0.05, 0.1, 0.2][i % 3];
      const A = pulseAmpDeg(P, Tp) * 0.9 * D2R * Math.min(1, scale);      // v13.14: genlik kuralı pulseAmpDeg (wb.hex.pulseRule)
      ev.push({ t0: t, Tp, A: A * (i % 2 ? -1 : 1) }); t += 3; i++;
    }
    cmd.push({ type: 'halfsine', axis: 0, events: ev });
  }
  const recCh = ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y', 'cmd_r', 'cmd_p', 'cmd_y', 'enc_a', 'enc_e', 'rot', 'rot_res',
    'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel'];
  if (trans.length) recCh.push('tr_x', 'tr_y', 'tr_z');          // gemi rüzgâr VIV'i: hexapod ötelemesi (3B görünüm)
  const S = labScenario(P, { label: 'Düzenek: ' + (PLAY_KINDS[kind] || kind), T, fs: 2000, stab, cmd, trans, seed,
    resF: (kind === 'seaviv' || kind === 'viv') ? fv : undefined,
    rec: { fs: 1000, ch: recCh } });
  // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırılır (testlerle aynı kural; seaLabScenario)
  if (SMtr && SMtr.length && seaQ) { const F = fitTransToColl(P, Object.assign({}, S, { stab: true }), SMtr); seaQ.qc = F.qc; seaQ.e1 = F.e1; }   // stab ON geometrisi: ON ve OFF oynatmaları aynı hareket
  const R = runSim(P, S, prog);
  const fr = R.meta.fRec, dec = Math.round(fr / 50), n = Math.floor(R.meta.nRec / dec);
  const out = { kind, label: PLAY_KINDS[kind] || kind, T, stab, fs: 50, n, scale, scaleEff: kind === 'slap' ? Math.min(1, scale) : (kind === 'still' ? null : scale), platform: ship ? 'ship' : 'sub' };
  if (seaQ) out.seaQ = seaQ;
  const blk = (a) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < dec; j++) s += a[i * dec + j]; y[i] = s / dec; } return y; };
  for (const c of ['base_r', 'base_p', 'base_y', 'enc_a', 'enc_e', 'opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'rot', 'rot_res']) out[c] = blk(R.rec[c]);
  if (trans.length) for (const c of ['tr_x', 'tr_y', 'tr_z']) out[c] = blk(R.rec[c]);
  // kayma bileşenleri: dünya dönüşü artığı (dr_e) ve gyro bias'ı (dr_b), LOS açısı olarak birikmiş (rad)
  if (stab) for (const c of ['dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel']) out[c] = blk(R.rec[c]);
  // video kareleri (merkez referanslı, px)
  const V = R.video;
  out.video = { n: V.n, fps: V.fps, t: Float32Array.from(V.t.subarray(0, V.n)), x: Float32Array.from(V.x.subarray(0, V.n), v => v - V.x0), y: Float32Array.from(V.y.subarray(0, V.n), v => v - V.y0), ok: Uint8Array.from(V.valid.subarray(0, V.n)) };
  // EIS (videonun son işlemi; T1.3 ile aynı yöntem): ölçülen centroid dizisine Model'deki f_c, η ve registrasyon artığı
  // (px RMS) uygulanır. EIS görüntüyü kaydırır, fiziksel LOS'u değiştirmez.
  const EI = P.wb.eis, rEis = rngf('eis');
  const vx = Float64Array.from(V.x.subarray(0, V.n), v => v - V.x0), vy = Float64Array.from(V.y.subarray(0, V.n), v => v - V.y0), vok = out.video.ok;
  const ex = applyEIS(vx, vok, V.fps, EI.fc, EI.eta, EI.reg_px, rEis), ey = applyEIS(vy, vok, V.fps, EI.fc, EI.eta, EI.reg_px, rEis);
  out.videoEis = { x: Float32Array.from(ex), y: Float32Array.from(ey), fc: EI.fc, eta: EI.eta, reg: EI.reg_px, off: EI.eta === 0 && !(EI.reg_px > 0) };
  const d = derive(P);
  out.geom = { a0: d.a0, e0: d.e0, IFOV: d.IFOV, IFOVt: R.meta.IFOVt, Nh: d.Nh, Nv: d.Nv, FOVh: d.FOVh, FOVv: d.FOVv, Lpg: P.dut.L_pg };
  // v13.4: göz bebeği ↔ kolimatör demeti — gerçekleşen taban duruşu ve ötelemesinden (50 Hz) yanal kayma ve örtüşme dizileri
  {
    const G = collGeom(P), ph = new Float32Array(n), pv = new Float32Array(n), po = new Float32Array(n), t3 = [0, 0, 0];
    let eMax = 0, hMax = 0, vMax = 0, ovMin = 1, nVig = 0, nC = 0; const j0 = Math.round(Math.min(10, T / 4) * 50);
    for (let i = 0; i < n; i++) {
      if (out.tr_x) { t3[0] = out.tr_x[i]; t3[1] = out.tr_y[i]; t3[2] = out.tr_z[i]; }
      const [hz, vt] = pupilShift(G, out.base_r[i], out.base_p[i], out.base_y[i], t3, stab, 0);
      const a = [out.base_r[i], out.base_p[i], out.base_y[i]], l = G.losB, dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2];
      const e = Math.hypot(hz, vt) + G.Loff * Math.sin(Math.min(Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]), Math.PI / 2)), ov = pupilOverlap(G.Dp, G.Dc, e);
      ph[i] = hz; pv[i] = vt; po[i] = ov;
      if (i >= j0) { nC++; if (e > eMax) eMax = e; if (Math.abs(hz) > hMax) hMax = Math.abs(hz); if (Math.abs(vt) > vMax) vMax = Math.abs(vt); if (ov < ovMin) ovMin = ov; if (ov < 1 - 1e-9) nVig++; }
    }
    out.pupil = { h: ph, v: pv, ov: po, Dp: G.Dp, Dc: G.Dc, k: G.k, eFree: G.eFree, Lpg: G.Lpg };
    // v13.5: kolimatör paralaksı (δ ≠ 0): görünür hedef açısı −e·δ/f_c² — tepe ve RMS (yatay / düşey)
    let sH = 0, sV = 0, mH = 0, mV = 0; for (let i = j0; i < n; i++) { mH += ph[i]; mV += pv[i]; } mH /= Math.max(1, n - j0); mV /= Math.max(1, n - j0);
    for (let i = j0; i < n; i++) { sH += sq(ph[i] - mH); sV += sq(pv[i] - mV); }
    const par = G.parK ? { delta_um: G.delta_um, pk: G.parK * eMax, rmsH: G.parK * Math.sqrt(sH / Math.max(1, n - j0)), rmsV: G.parK * Math.sqrt(sV / Math.max(1, n - j0)) } : null;
    out.metricsPupil = { eMax, hMax, vMax, ovMin, fVig: nVig / Math.max(1, nC), req: G.k * (G.Dp + 2 * eMax), ok: eMax <= G.eFree + 1e-12, eFree: G.eFree, Dc: G.Dc, Dp: G.Dp, k: G.k, stab,
      qc: seaQ && seaQ.qc != null ? seaQ.qc : null, par, deltaMax: G.deltaMax(eMax) };
  }
  // özet metrikler
  const skip = Math.min(10, T / 4), i0 = Math.round(skip * fr);
  const det = (c) => detrend(Float64Array.from(R.rec[c].subarray(i0)), 'linear');
  const pe = det('opt_el'), px = det('opt_xel');
  // v13.14: tepe θ / ω / α hexapod'un gerçekleştirdiği nominal hareketten — komut, hexapod dinamiğinden (Osc2, f_bw, ζ 0,7071;
  // mikrotitreşimsiz) geçirilir. Komutun sayısal türevi hız sıçramalı profillerde (yarım sinüs açı darbesi: başta ve sonda ω sıçrar,
  // α → ∞) örnekleme hızına bağlı bir değer verir (1 kHz'de 22 917 °/s²). cmd: komutun kendisi (karşılaştırma için).
  const baseStats = [0, 1, 2].map(ax => {
    const th = R.rec[['cmd_r', 'cmd_p', 'cmd_y'][ax]];          // komut profili (hexapod'un üretmesi gereken)
    let mt = 0, mw = 0, ma = 0, ct = 0, cw = 0, ca = 0;
    for (let i = 1; i + 1 < R.meta.nRec; i++) { ct = Math.max(ct, Math.abs(th[i])); const w = (th[i + 1] - th[i - 1]) * fr / 2, a = (th[i + 1] - 2 * th[i] + th[i - 1]) * fr * fr; cw = Math.max(cw, Math.abs(w)); ca = Math.max(ca, Math.abs(a)); }
    const hxo = new Osc2(P.wb.hex.fbw, 0.7071, 1 / fr); hxo.reset(th[0]);
    for (let i = 1; i < R.meta.nRec; i++) { hxo.step(th[i]); mt = Math.max(mt, Math.abs(hxo.x)); mw = Math.max(mw, Math.abs(hxo.v)); ma = Math.max(ma, Math.abs(hxo.a)); }
    return { th: mt * R2D, om: mw * R2D, al: ma * R2D, cmd: { th: ct * R2D, om: cw * R2D, al: ca * R2D }, fbw: P.wb.hex.fbw };
  });
  let mtfE = NaN, mtfX = NaN, wE = NaN, wX = NaN;
  try { const vm = videoMetrics(sliceVideo(V, skip), { which: 'true', Tw: Math.min(P.ana.Tw, (T - skip) / 2), detrend: 'linear', tau: P.wb.tau, pdeWin: P.ana.pdeWin }); mtfE = vm.mtf.el; mtfX = vm.mtf.xel; wE = vm.wander.el; wX = vm.wander.xel; } catch (e) { /* kısa kayıt */ }
  let nOk = 0; for (let i = 0; i < V.n; i++) nOk += V.valid[i];
  // doğrusal kayma eğimi (dünya dönüşü / bias): trend çıkarılmadan önceki diziden
  const slope = (c) => { const x = R.rec[c], n = R.meta.nRec - i0; let st = 0, sy = 0, stt = 0, sty = 0; for (let i = i0; i < R.meta.nRec; i++) { const t = i / fr; st += t; sy += x[i]; stt += t * t; sty += t * x[i]; } return (n * sty - st * sy) / Math.max(1e-30, n * stt - st * st); };
  const es = earthSheet(P), comp = !!P.wb.earth.comp;
  out.earth = { comp, expH: (comp ? es.comp : es.h) * 1e-6, expV: (comp ? es.comp : es.v) * 1e-6, exit: comp ? es.on.exit : es.off.exit, lat: P.wb.earth.lat, az: P.wb.earth.az };
  const pr = new Float64Array(pe.length); for (let i = 0; i < pe.length; i++) pr[i] = Math.hypot(pe[i], px[i]);      // v13.14: radyal P99 (dedektör çemberi)
  out.metrics = { slopeEl: slope('opt_el'), slopeXel: slope('opt_xel'), rmsEl: aRms(pe), rmsXel: aRms(px), p99El: aPctAbs(pe, 99), p99Xel: aPctAbs(px, 99), p99R: aPctAbs(pr, 99), wanderEl: wE, wanderXel: wX, Tw: Math.min(P.ana.Tw, (T - skip) / 2), mtfEl: mtfE, mtfXel: mtfX,
    validFrac: nOk / Math.max(1, V.n), base: baseStats, sat: R.stats.satCount, maxRelE: R.stats.maxRelE, maxRelA: R.stats.maxRelA, pupil: out.metricsPupil };
  delete out.metricsPupil;
  // wander, ölçülen video: ham ve EIS sonrası (aynı kareler, pencere ve trend işlemi; px → µrad nominal IFOV ile)
  {
    const j0 = Math.min(V.n, Math.round(skip * V.fps)), Tw = Math.min(P.ana.Tw, (T - skip) / 2), per = Math.max(5, Math.round(Tw * V.fps));
    const okc = vok.subarray(j0), w = (a) => windowedWander(Float64Array.from(a.subarray(j0), v => v * V.IFOV), okc, per, 'linear').rms;
    // ayrıştırma: yalnız süzme (registrasyon artığı 0) — EIS'in giderdiği titreşim ile eklediği gürültüyü ayırır
    const ex0 = applyEIS(vx, vok, V.fps, EI.fc, EI.eta, 0, null), ey0 = applyEIS(vy, vok, V.fps, EI.fc, EI.eta, 0, null);
    out.metrics.eis = { Tw, rawEl: w(vy), rawXel: w(vx), eisEl: w(ey), eisXel: w(ex), filtEl: w(ey0), filtXel: w(ex0), regUrad: EI.reg_px * V.IFOV };
  }
  // VIV frekansındaki LOS bileşeni (f_v, el): en küçük kareler sinüs + trend uydurması (rampa sonrası). Taban genliği
  // uyarımın tanımıdır (komut; hexapod 3 Hz'de birim kazançlı) — taban kaydına uydurma büyük deniz hareketinden sızıntı alır
  {
    const j0 = Math.round(Math.max(skip, kind === 'viv' ? 5 : 9) * fr), n = R.meta.nRec, m = n - j0;
    const tt = new Float64Array(m), le = new Float64Array(m), lx = new Float64Array(m);
    for (let i = j0; i < n; i++) { tt[i - j0] = i / fr; le[i - j0] = R.rec.opt_el[i]; lx[i - j0] = R.rec.opt_xel[i]; }
    const fl = sineFit(tt, le, fv), fx = sineFit(tt, lx, fv);
    out.metrics.viv = { f: fv, on: VS.on, present: hasViv, los: fl ? fl.A / Math.SQRT2 : NaN, base: Aviv / Math.SQRT2,
      kind: VS.kind, losXel: fx ? fx.A / Math.SQRT2 : NaN, active: VS.present,
      y: tone ? tone.y : 0, acc: tone ? tone.acc : 0, lin: !!(tone && VS.lin), limited: tone ? tone.limited : subLim };
  }
  // LOS hatası spektrumu (trend çıkarılmış, Welch/Hann, 16 384 nokta), log ızgarada genlik spektral yoğunluğu (µrad/√Hz)
  {
    const se = detrend(Float64Array.from(R.rec.opt_el.subarray(i0)), 'linear'), sx = detrend(Float64Array.from(R.rec.opt_xel.subarray(i0)), 'linear');
    const we = welch(se, fr, 16384), wx = welch(sx, fr, 16384);
    const de = logDecimPSD(we.f, we.P, 170, 0.05), dx = logDecimPSD(wx.f, wx.P, 170, 0.05);
    out.psd = { f: Float32Array.from(de.f), el: Float32Array.from(de.P, v => Math.sqrt(v) * 1e6), xel: Float32Array.from(dx.P, v => Math.sqrt(v) * 1e6) };
  }
  // kayma ayrıştırması (aynı pencerede doğrusal eğim): dünya dönüşü artığı + gyro bias'ı + kalan (ARW, uyarım artığı, diğer)
  if (stab) {
    const m = out.metrics, eEl = slope('dr_e_el'), eXel = slope('dr_e_xel'), bEl = slope('dr_b_el'), bXel = slope('dr_b_xel');
    m.drift = { earthEl: eEl, earthXel: eXel, biasEl: bEl, biasXel: bXel, restEl: m.slopeEl - eEl - bEl, restXel: m.slopeXel - eXel - bXel };
  }
  if (o.keepRec) out._R = R;      // v13.14: yalnız doğrulama koşuları için ham kayıt (arayüz kullanmaz)
  return out;
}
