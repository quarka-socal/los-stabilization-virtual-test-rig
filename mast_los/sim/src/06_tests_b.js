// ============================================================================
// 06_tests_b.js — B1 (deniz durumu, < 1 Hz) testleri
// ============================================================================
// Bütçe tahsisleri IFOV cinsindendir (v13): tablo, 40 µrad'lık referans IFOV (12 µm / 300 mm) için µrad olarak yazılmıştır;
// q = Q / 40 µrad (ör. B1-01 = 0,125 IFOV). Etkin tahsis Q = tablo × IFOV / IFOV_ref; IFOV_ref derive() ile aynı ifadeyle
// hesaplanır, varsayılan kanalda oran tam 1'dir. R-01 tahsisi k_roll·IFOV'dur (bütçe satırında).
const BUDGET_ALLOC = { 'B1-01': 5, 'B1-02': 3, 'B1-03': 3, 'B1-04': 4, 'B1-05': 2, 'B1-06': 1, 'B1-07': 4, 'B2-01': 6, 'B2-02': 3, 'B2-03': 3, 'B2-04': 2,
  'B2-05': 1, 'B2-06': 3, 'B3-01': 4, 'B3-02': 2, 'B3-03': 3, 'B3-04': 2 };
const ALLOC_IFOV_REF = 12 / 300 * 1e-3;
function ifovOf(P) { const wb = P.wb, ch = wb.channels.find(c => c.name === wb.refChannel) || wb.channels[0]; return ch.p_um / ch.f_mm * 1e-3; }
function budgetAlloc(P) { const r = ifovOf(P) / ALLOC_IFOV_REF, o = {}; for (const k of Object.keys(BUDGET_ALLOC)) o[k] = BUDGET_ALLOC[k] * r; return o; }
// tahsis metni: tamsayıysa olduğu gibi (varsayılan kanal), değilse iki ondalık
const fA = (x) => Number.isInteger(x) ? String(x) : fmt(x, 2);
// kaldıraç kolu metni: yalnız düşey bileşen varsa önceki sürümün ifadesi (h = … m), değilse r = (rx, ry, rz) m
function armTxt(P) { const r = seaArm(P); return r[0] === 0 && r[1] === 0 ? `h = ${fA(r[2])} m` : `r = (${r.map(fA).join(', ')}) m`; }
// sinüs testlerinin genliği (°): 'dar' eşdeğer sinüs genliği, '6dof' ± tepe genlik (kullanıcı kararı: sinüs testinde A)
function seaAmpDeg(P, ax) { const s = P.wb.sea; return s.mode === '6dof' ? s.dof[SEA_ANG[ax]].A : [s.roll_A, s.pitch_A, s.yaw_A][ax]; }
// baskın periyot (s): 'dar' girilen periyot, '6dof' bant merkezi 1/√(f1·f2)
function seaPeriod(P, ax) { const s = P.wb.sea; return s.mode === '6dof' ? 1 / seaDOF(P).ang[ax].fdom : [s.roll_T, s.pitch_T, s.yaw_T][ax]; }
// RMS (rad): gerekli DRR = tahsis / σ ('dar' ifadesi önceki sürümle aynı: A·D2R/√2)
function seaSigma(P, ax) { return seaDOF(P).ang[ax].sigma; }
// segment uydurmaları: giriş (IMU), çıkış (video el/xel, otokolimatör, gerçek LOS)
function fitSegments(P, R, segs, ctx) {
  const v = videoAngles(R, ctx), tr = recT(R), out = [];
  const imuCh = ['imu_r', 'imu_p', 'imu_y'];
  for (const s of segs) {
    const [i0, i1] = idxRange(tr, s.c0, s.c1);
    const fin = sineFit(tr, R.rec[imuCh[s.axis]], s.f, { i0, i1 });
    const [j0, j1] = idxRange(v.t, s.c0, s.c1);
    const fe = sineFit(v.t, v.el, s.f, { i0: j0, i1: j1, valid: v.ok }), fx = sineFit(v.t, v.xel, s.f, { i0: j0, i1: j1, valid: v.ok });
    const te = R.rec.opt_el ? sineFit(tr, R.rec.opt_el, s.f, { i0, i1 }) : null, tx = R.rec.opt_xel ? sineFit(tr, R.rec.opt_xel, s.f, { i0, i1 }) : null;
    const ae = R.rec.ac_el ? sineFit(tr, R.rec.ac_el, s.f, { i0, i1 }) : null, ax = R.rec.ac_xel ? sineFit(tr, R.rec.ac_xel, s.f, { i0, i1 }) : null;
    let nv = 0; for (let j = j0; j < j1; j++) nv += v.ok[j];
    const vf = nv / Math.max(1, j1 - j0), vok = vf >= 0.95;          // hedef alan dışına çıktıysa video uydurması geçersiz
    out.push({ seg: s, fin, fe: vok ? fe : null, fx: vok ? fx : null, te, tx, ae, ax, validFrac: vf });
  }
  return out;
}
function drrOf(fo, fi) { return fo && fi ? db(fo.A / fi.A) : NaN; }
function signif(fo) { return fo && fo.A > 3 * fo.seA; }
// deniz spektrumu ağırlıklı artık kestirimi: ölçülen DRR noktalarından log-log ara değer
function seaWeightedResidual(P, ax, pts) {
  const Dq = seaDOF(P), six = Dq.six, q6 = Dq.ang[ax];
  const A = six ? q6.sigma * Math.SQRT2 : seaAmpDeg(P, ax) * D2R, fp = 1 / seaPeriod(P, ax), sh = six ? q6.shape : shapeLogGauss(fp, P.env.seaWidth);
  const fA = six ? q6.f1 / 2 : fp / 3, fB = six ? q6.f2 * 2 : fp * 3;     // 6-DOF: bant ±1 oktav; dar: önceki sürümle aynı
  const fs = []; let norm = 0;
  for (let f = fA; f <= fB; f *= 1.01) { const s = sh(f); fs.push([f, s]); norm += s * f * 0.00995; }
  const g = (f) => {
    const p = pts.slice().sort((a, b) => a.f - b.f);
    if (f <= p[0].f) return p[0].drr + (p.length > 1 ? (p[1].drr - p[0].drr) / Math.log10(p[1].f / p[0].f) * Math.log10(f / p[0].f) : 0);
    for (let i = 1; i < p.length; i++) if (f <= p[i].f) return p[i - 1].drr + (p[i].drr - p[i - 1].drr) * Math.log10(f / p[i - 1].f) / Math.log10(p[i].f / p[i - 1].f);
    return p[p.length - 1].drr;
  };
  let s = 0; for (const [f, v] of fs) s += v * f * 0.00995 * Math.pow(10, g(f) / 10);
  return (A / Math.SQRT2) * Math.sqrt(s / norm);
}
// T1.1 — tek eksen sinüs, DRR(f)
TESTS['T1.1'] = function (P, ctx, prog) {
  const d = derive(P), AL = budgetAlloc(P);
  // test frekansları (0,05–1 Hz) + her eksenin baskın deniz frekansı (gerekli DRR bu frekansta tanımlıdır)
  const D6 = seaDOF(P), edges = D6.six ? [0, 1, 2].flatMap(ax => [D6.ang[ax].f1, D6.ang[ax].f2]) : [];    // 6-DOF: bant kenarları da
  const freqs = Array.from(new Set([0.05, 0.1, 0.2, 0.5, 1, 1 / seaPeriod(P, 0), 1 / seaPeriod(P, 1), 1 / seaPeriod(P, 2), ...edges].map(f => Math.round(f * 1e4) / 1e4))).sort((a, b) => a - b);
  const rowOf = ['B1-01', 'B1-02', 'B1-03'];
  const allRes = [], plots = [];
  let ok = true, okB = true; const kv = [], fill = {}, invalidAx = [], badB = [];
  const axes = [0, 2, 1];
  axes.forEach((ax, ia) => {
    const list = freqs.map(f => ({ axis: ax, f, A: Math.min(seaAmpDeg(P, ax), d.reach(f)) * D2R, nper: 10 }));
    // baskın frekansta yarım genlik ek segmenti: doğrusal artık genlikle ölçeklenir, Coulomb sürtünmesinin temel bileşeni ölçeklenmez
    const fDom0 = Math.round(1 / seaPeriod(P, ax) * 1e4) / 1e4;
    list.push({ axis: ax, f: fDom0, A: 0.5 * Math.min(seaAmpDeg(P, ax), d.reach(fDom0)) * D2R, nper: 10, half: true });
    const sg = segSines(list);
    const S = labScenario(P, { label: 'T1.1 ' + AXN[ax], T: sg.T, fs: 2000, cmd: sg.cmd, seed: 1100 + ax });
    const R = runSim(P, S, (f) => prog && prog((ia + f) / 3));
    const fits = fitSegments(P, R, sg.segs, ctx);
    const map = axisMap(P, ax);
    const req = db(AL[rowOf[ax]] * 1e-6 / seaSigma(P, ax));
    const pts = [], fDom = fDom0;
    let twoAmp = null;
    {
      const full = fits.find(r => !r.seg.half && Math.abs(r.seg.f - fDom) < 1e-6), half = fits.find(r => r.seg.half);
      const pr = (r) => map.los === 'el' ? r.fe : (map.los === 'xel' ? r.fx : null);
      if (full && half && pr(full) && pr(half) && full.fin && half.fin) {
        // giriş fazına göre normalize edilmiş çıkış fazörü: R/X̂ = L·|X| + F
        const nrm = (r) => { const fo = pr(r), xi = r.fin; const xr = xi.a / xi.A, xim = xi.b / xi.A; return { re: fo.a * xr + fo.b * xim, im: fo.b * xr - fo.a * xim, A: xi.A }; };
        const n1 = nrm(full), n2 = nrm(half), dA = n1.A - n2.A;
        const Lr = (n1.re - n2.re) / dA, Li = (n1.im - n2.im) / dA;
        const Fr = n1.re - Lr * n1.A, Fi = n1.im - Li * n1.A;
        twoAmp = { L: Math.hypot(Lr, Li), F: Math.hypot(Fr, Fi) };
      }
    }
    for (const r of fits) {
      if (r.seg.half) continue;
      const f = r.seg.f;
      const prim = map.los === 'el' ? r.fe : (map.los === 'xel' ? r.fx : null);
      const primT = map.los === 'el' ? r.te : (map.los === 'xel' ? r.tx : null);
      if (!prim && map.los !== 'rot') { allRes.push({ ax, f, A: r.fin ? r.fin.A : NaN, drr: NaN, drrT: primT ? drrOf(primT, r.fin) : NaN, sig: false, bound: NaN, req, isDom: Math.abs(f - fDom) < 1e-6, el: null, xel: null, prim: map.los, invalid: true }); continue; }
      const drr = prim ? drrOf(prim, r.fin) : NaN, drrT = primT ? drrOf(primT, r.fin) : NaN;
      const sig = prim ? signif(prim) : false;
      const bound = prim ? db((prim.A + 3 * prim.seA) / r.fin.A) : NaN;
      const isDom = Math.abs(f - fDom) < 1e-6;
      if (prim && isDom && (twoAmp ? db(twoAmp.L) : (sig ? drr : bound)) > req) ok = false;
      pts.push({ f, drr: sig ? drr : bound, drrT, sig });
      allRes.push({ ax, f, A: r.fin.A, drr, drrT, sig, bound, req, isDom, el: r.fe, xel: r.fx, prim: map.los });
    }
    if (map.los !== 'rot') {
      const dom = allRes.find(q => q.ax === ax && q.isDom);
      if (!dom || dom.invalid) { invalidAx.push(AXN[ax]); kv.push([`${AXN[ax]} → ${map.los}`, 'baskın frekans segmenti geçersiz (hedef görüş alanı dışında)']); return; }
      const resid = seaWeightedResidual(P, ax, pts.filter(p => isFinite(p.drr)));
      kv.push([`${AXN[ax]} → ${map.los}: ölçülen DRR @ baskın ${fmt(fDom, 4)} Hz`, (dom.sig ? fmt(dom.drr, 1) : '≤ ' + fmt(dom.bound, 1)) + ' dB (gerçek LOS ' + fmt(dom.drrT, 1) + ' dB)'],
              [`${AXN[ax]}: iki genlikten doğrusal DRR / gerekli`, (twoAmp ? fmt(db(twoAmp.L), 1) : '—') + ' / ' + fmt(req, 1) + ' dB'],
              [`${AXN[ax]}: genlikten bağımsız bileşen (sürtünme temel harmoniği)`, twoAmp ? urad(twoAmp.F / Math.SQRT2, 2) + ' µrad RMS' : '—'],
              [`${AXN[ax]}: deniz spektrumu ağırlıklı artık (ölçülen DRR'dan)`, fmt(resid * 1e6, 2) + ' µrad RMS (tahsis ' + fA(AL[rowOf[ax]]) + ')']);
      fill[rowOf[ax]] = resid;
      if (resid > AL[rowOf[ax]] * 1e-6) { okB = false; badB.push(`${AXN[ax]} ${fmt(resid * 1e6, 2)} > ${fA(AL[rowOf[ax]])} µrad`); }
      plots.push({ ax, pts });
    } else {
      // LOS ekseni etrafında uyarım: el/xel'deki çapraz eksen yanıtı = ε × açı (B1-04)
      const cr = fits.filter(r => r.seg.f <= 0.3 && r.fe && r.fx && r.fin).map(r => Math.max(r.fe.A, r.fx.A) / r.fin.A);
      if (!cr.length) { invalidAx.push(AXN[ax]); kv.push([`${AXN[ax]} (LOS ekseni etrafında)`, 'segmentler geçersiz (hedef görüş alanı dışında)']); return; }
      const eps = aMean(cr), opRms = seaSigma(P, ax);
      // v13.11 (§11): el ve xel katsayıları ayrı da yazılır (xel eksen kaçıklığı Model'de ayrı girilir); kabul ve dolgu önceki gibi büyük olanla
      const sel = fits.filter(r => r.seg.f <= 0.3 && r.fe && r.fx && r.fin), cE = aMean(sel.map(r => r.fe.A / r.fin.A)), cX = aMean(sel.map(r => r.fx.A / r.fin.A));
      kv.push([`${AXN[ax]} (LOS ekseni etrafında): çapraz eksen katsayısı`, fmt(eps * 1e3, 4) + ' mrad/rad (el ' + fmt(cE * 1e3, 4) + ' / xel ' + fmt(cX * 1e3, 4) + '; model ε el ' + P.dut.gyro.epsEl + ' / xel ' + P.dut.gyro.epsXel + ' mrad)'],
              [`${AXN[ax]}: işletme karşılığı ε·θ_RMS (B1-04 tipi)`, fmt(eps * opRms * 1e6, 2) + ' µrad RMS (tahsis ' + fA(AL['B1-04']) + ')']);
      fill['B1-04'] = eps * opRms;
    }
  });
  // her eksen ve her frekansta DRR(f) ≤ gerekli DRR sayımı (bilgi; kabul baskın frekansta)
  const lit = allRes.filter(r => r.prim !== 'rot' && !r.invalid && isFinite(r.sig ? r.drr : r.bound));
  const litFail = lit.filter(r => (r.sig ? r.drr : r.bound) > r.req);
  kv.push(['Her eksen ve frekansta DRR ≤ gerekli DRR (bilgi)', `${lit.length - litFail.length}/${lit.length} nokta sağlıyor` + (litFail.length ? '; aşanlar: ' + litFail.map(r => `${AXN[r.ax]} ${fmt(r.f, 3)} Hz (${fmt(r.sig ? r.drr : r.bound, 1)} > ${fmt(r.req, 1)} dB)`).join(', ') : '')]);
  const res = mkResult('T1.1', {
    status: invalidAx.length ? 'GEÇERSİZ' : stat(ok && okB), measured: (invalidAx.length ? `geçersiz eksen ${invalidAx.join(', ')}; ` : '') + (badB.length ? `deniz spektrumu ağırlıklı artık tahsisi aşıyor (${badB.join(', ')}); ` : '') + 'DRR(f) eğrisi: ' + allRes.filter(r => r.prim !== 'rot' && r.f <= 0.3).map(r => `${AXN[r.ax]} ${fmt(r.f, 3)} Hz ${r.invalid ? 'geçersiz' : (r.sig ? fmt(r.drr, 1) : '≤ ' + fmt(r.bound, 1)) + ' dB'}${r.isDom ? '*' : ''}`).join('; ') + ' (* baskın frekans, kabul burada)' +
      `; her frekansta DRR ≤ gerekli: ${lit.length - litFail.length}/${lit.length} nokta`,
    kv, fill,
    notes: ['Giriş referans IMU\'dan (komuttan değil), çıkış sonsuzdaki hedefi izleyen videodan alındı; her segmentte sinüs + doğrusal trend uyduruldu (dünya dönüşü rampası).',
            'Baskın frekansta iki genlikte (A ve A/2) ölçülür: doğrusal artık genlikle ölçeklenir, Coulomb sürtünmesinin temel bileşeni ölçeklenmez; ikisi fazörlerle ayrılır. Kabul doğrusal DRR\'a uygulanır, sürtünme bileşeni B1-07 ile karşılaştırılır.',
            'Kabul iki koşulludur: (1) girdi genliğinin tanımlandığı baskın deniz frekansında doğrusal DRR ≤ gerekli DRR; (2) deniz spektrumu ağırlıklı artık ≤ tahsis (bandın tamamı; sürtünmenin temel bileşenini de içerdiği için muhafazakâr). Diğer frekanslardaki tekil karşılaştırmalar bilgi amaçlıdır. Her eksen ve frekansta DRR ≤ gerekli DRR sayımı ayrıca raporlanır: test genliği her frekansta deniz genliğine eşit tutulduğu, integratörlü bir döngünün DRR\'ı ise frekansla 20–30 dB/dekad arttığı için bu sayım, bütçenin B1-01 varsayımını (−80 dB, baskın roll frekansında) taşıyan bir döngüyü bile 0,5–1 Hz\'de aşıyor gösterir. Tutarlı ölçüt frekansa bağlı gerekli DRR\'dır: DRR_req(f) = tahsis / (o frekanstaki deniz genliği); spektrum ağırlıklı artık bunu uygular. Bu değer sürtünmenin temel bileşenini de içerir (B1-07 ile örtüşür).',
            'Genlik yeterince büyük değilse (A < 3σ) yalnız üst sınır raporlanır.',
            'LOS iskele yönündeyken pitch, LOS ekseni etrafında döner: el/xel\'deki yanıtı gyro eksen kaçıklığıdır (B1-04), asıl etkisi görüntü rotasyonudur (T1.5). xel yanıtına ayrıca optik alt montajın yerçekimi sarkmasının görüntüyle birlikte dönmesi eklenir (ε_g = g·∂θ/∂a ≈ ' + fmt(P.dut.modes.opt.gAcc * 9.80665 * 1e3, 4) + ' mrad/rad); bu test iki mekanizmayı ayıramaz.'],
    rows: allRes,
  });
  const ser = [];
  for (const p of plots) { const q2 = p.pts.filter(q => isFinite(q.drr)); ser.push({ name: AXN[p.ax] + ' (ölçülen)', x: Float32Array.from(q2.map(q => q.f)), y: Float32Array.from(q2.map(q => q.drr)), dots: true }); }
  const fa = logspace(0.03, 2, 60);
  ser.push({ name: 'Model (el döngüsü)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(d.loopEl.drr(TAU * f))))) });
  ser.push({ name: 'Model (az döngüsü)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(d.loopAz.drr(TAU * f))))) });
  res.plots.push({ title: 'Bozucu bastırma oranı DRR(f)', xLabel: 'Hz', yLabel: 'dB', xLog: true, series: ser,
    refLines: [{ y: db(AL['B1-01'] * 1e-6 / seaSigma(P, 0)), label: 'Gerekli DRR, roll (B1-01)' }] });
  return res;
};
// T1.2 — stab OFF sağlaması (kazanç = 1)
TESTS['T1.2'] = function (P, ctx, prog) {
  const d = derive(P), freqs = [0.05, 0.1, 0.2, 0.5, 1], A = Math.min(0.5, d.stabOffMax) * D2R;
  const kv = []; let ok = true; let worst = 0; const pts = [];
  [0, 2].forEach((ax, ia) => {
    const list = freqs.map(f => ({ axis: ax, f, A: Math.min(A, d.reach(f) * D2R), nper: 5 }));
    const sg = segSines(list);
    const R = runSim(P, labScenario(P, { label: 'T1.2', T: sg.T, fs: 2000, stab: false, cmd: sg.cmd, seed: 1200 + ax }), (f) => prog && prog((ia + f) / 2));
    const fits = fitSegments(P, R, sg.segs, ctx), map = axisMap(P, ax);
    for (const r of fits) {
      const fo = map.los === 'el' ? r.fe : r.fx;
      const g = fo.A / (r.fin.A * Math.abs(map.w));
      worst = Math.max(worst, Math.abs(g - 1));
      if (Math.abs(g - 1) > 0.02) ok = false;
      pts.push({ ax, f: r.seg.f, g, valid: r.validFrac });
      if (r.validFrac < 0.999) ok = false;
    }
  });
  const res = mkResult('T1.2', { num: { worst, pts },
    status: stat(ok), measured: `En büyük |kazanç − 1| = ${fmt(worst * 100, 3)} % (genlik ${fmt(A * R2D, 2)}° ≤ ${fmt(d.stabOffMax, 2)}°)`,
    kv: pts.map(p => [`${AXN[p.ax]} ${p.f} Hz`, `kazanç ${fmt(p.g, 4)}, geçerli kare ${fmt(p.valid * 100, 1)} %`]),
    notes: [ctx.IFOVcal ? 'Ölçek T0.1\'deki kalibre IFOV ile çevrildi.' : 'T0.1 çalıştırılmadı: nominal IFOV kullanıldı; plaka ölçeği hatası doğrudan kazanca yansır.',
            'Kazanç 1 çıkmıyorsa ölçek, işaret veya eksen eşlemesi yanlıştır ve bütün DRR sonuçları da yanlış olur.'],
  });
  res.plots.push({ title: 'Stab OFF kazancı', xLabel: 'Hz', yLabel: 'kazanç', xLog: true,
    series: [0, 2].map(ax => ({ name: AXN[ax], x: Float32Array.from(pts.filter(p => p.ax === ax).map(p => p.f)), y: Float32Array.from(pts.filter(p => p.ax === ax).map(p => p.g)), dots: true })),
    refLines: [{ y: 1.02, label: '+%2' }, { y: 0.98, label: '−%2' }] });
  return res;
};
// deniz profili senaryosu (laboratuvar, hexapod)
function seaLabScenario(P, o) {
  const T = o.T || 600, rngf = makeRngFactory(seedOf(P, o.seed));
  // açısal deniz profili; 6-DOF kipinde ve kaldıraç kolunda hexapod ötelemesi (strokla sınırlı, ortak q oranı)
  const SM = seaMotion(P, T, rngf, { world: 'lab' });
  const cmd = SM.cmd;
  let trans = SM.trans.length ? SM.trans.slice() : null, resF;
  if (o.viv) {
    const VS = vivSpec(P);
    if (!isShip(P) && !VS.lin) { resF = o.vivF || P.wb.viv.fn; cmd.push({ type: 'sine', axis: 0, A: P.wb.viv.amp_deg * D2R, f: resF, t0: 10, ramp: 5 }); }   // denizaltı, yalnız açısal (uyum kipi)
    else if (VS.present) {      // gemi ve (v13.3) denizaltı: açısal + öteleme tonu; deniz ötelemesi tona strok bırakır (v13.3)
      resF = o.vivF || VS.f; const tn = windTone(P, VS, resF, 10, null, 5); cmd.push(...tn.cmd);
      if (tn.y > 0 && SM.trans.length) SM.q = reserveStroke(P, SM, tn.y);
      trans = (trans || []).concat(tn.trans);
    }
  }
  const base = { label: o.label || 'Deniz profili', T, fs: 2000, cmd, seed: o.seed,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y', 'rot', 'rot_res', 'trk_el'] } };
  if (trans && trans.length) base.trans = trans;
  if (resF) base.resF = resF;          // uyarlanır dar bant kontrol VIV tonunu izler (T2.2 ve işletme benzetimiyle aynı)
  const S = labScenario(P, Object.assign(base, o.extra || {}));
  if (SM.trans.length) {
    S.seaQ = SM.q; S.seaDemand = SM.demand;     // laboratuvarda üretilebilen öteleme oranı (bilgi)
    // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırılır (göz bebeği kayması e ≤ e_free); açısal komut ve VIV
    // tonu değişmez. Ötelemenin işletme ivmesindeki etkisini T2.5 ivme eşdeğeriyle ölçer.
    // sığdırma stab ON geometrisiyle yapılır (test planının hareketi); stab OFF koşuları aynı ötelemeyi kullanır
    const F = fitTransToColl(P, Object.assign({}, S, { stab: true }), SM.trans); S.seaQc = F.qc; S.seaE1 = F.e1;
  }
  return S;
}
function profileMetrics(P, R, ctx, skip) {
  const v = videoAngles(R, ctx), fps = R.video.fps, perWin = Math.round(P.ana.Tw * fps);
  const sel = (a) => { const o = [], k = []; for (let i = 0; i < a.length; i++) if (v.t[i] > skip) { o.push(a[i]); k.push(v.ok[i]); } return { x: Float64Array.from(o), ok: Uint8Array.from(k) }; };
  const e = sel(v.el), x = sel(v.xel);
  const wE = windowedWander(e.x, e.ok, perWin, P.ana.detrend), wX = windowedWander(x.x, x.ok, perWin, P.ana.detrend);
  let nOk = 0; for (let i = 0; i < e.ok.length; i++) nOk += e.ok[i];
  const Vt = sliceVideo(R.video, skip), tm = videoMetrics(Vt, { which: 'true', Tw: P.ana.Tw, detrend: P.ana.detrend, tau: P.wb.tau, pdeWin: P.ana.pdeWin });
  // EIS (yol yumuşatma) — ölçülen kare dizisine
  const eis = P.wb.eis, rng = new RNG(seedOf(P, 4242));
  const eisE = applyEIS(e.x, e.ok, fps, eis.fc, eis.eta, eis.reg_px * R.meta.IFOV, rng), eisX = applyEIS(x.x, x.ok, fps, eis.fc, eis.eta, eis.reg_px * R.meta.IFOV, rng);
  const lockE = applyEIS(e.x, e.ok, fps, 0, eis.eta, eis.reg_px * R.meta.IFOV, rng);
  const wEisE = windowedWander(eisE, e.ok, perWin, P.ana.detrend), wEisX = windowedWander(eisX, x.ok, perWin, P.ana.detrend), wLockE = windowedWander(lockE, e.ok, perWin, P.ana.detrend);
  return { wander: { el: wE.rms, xel: wX.rms, radial: Math.hypot(wE.rms, wX.rms) }, p99: { el: aPctAbs(wE.resid, 99), xel: aPctAbs(wX.resid, 99) },
    p95: { el: aPctAbs(wE.resid, 95), xel: aPctAbs(wX.resid, 95) }, fovStay: nOk / Math.max(1, e.ok.length), trueM: tm,
    eis: { el: wEisE.rms, xel: wEisX.rms, lockEl: wLockE.rms }, residE: wE.resid, series: { t: v.t, el: v.el, xel: v.xel, ok: v.ok } };
}
const R0fps = (out) => { const s0 = out[0].m.series; return s0.t.length > 1 ? 1 / (s0.t[1] - s0.t[0]) : 50; };
// T1.3 — gerçekçi deniz profili (çok eksenli, ≥ 10 dk, 3 tohum)
TESTS['T1.3'] = function (P, ctx, prog) {
  const d = derive(P), nS = Math.max(1, P.ana.seeds | 0), T = 600, out = [];
  const wf = P.wb.channels.find(c => c.name === 'MWIR-WFOV' && c.name !== P.wb.refChannel), nTot = nS + (wf ? 1 : 0);
  for (let s = 0; s < nS; s++) {
    const S = seaLabScenario(P, { T: T + 20, seed: 1301 + s });
    const lim = hexLimitCheck(P, S);
    const R = runSim(P, S, (f) => prog && prog((s + f) / nTot));
    out.push({ m: profileMetrics(P, R, ctx, 20), lim, R, q: S.seaQ, qc: S.seaQc, e1: S.seaE1, dem: S.seaDemand, S });
  }
  // v13.4: göz bebeği ↔ kolimatör demeti (tohum 1; deniz profili + kaldıraç kolu ötelemesi)
  const PX = pupilExcursion(P, out[0].S), PXt = pupilTxt(P, PX);
  // WFOV kanalı (test tanımı: NFOV ve WFOV): aynı taban hareketi (tohum 1), kanalın kendi IFOV'u ve gereksinimi k_wander·IFOV_WFOV
  let W = null;
  if (wf) {
    const Rw = runSim(P, seaLabScenario(P, { T: T + 20, seed: 1301, extra: { channel: wf.name } }), (f) => prog && prog((nS + f) / nTot));
    const IFw = wf.p_um / wf.f_mm * 1e-3, ctxW = { IFOVcal: ctx.IFOVcal ? IFw * ctx.IFOVcal / d.IFOV : IFw };
    const mW = profileMetrics(P, Rw, ctxW, 20);
    W = { name: wf.name, IF: IFw, m: mW, req: P.wb.k_wander * IFw, p99req: P.wb.k_conf * P.wb.k_wander * IFw };
  }
  const mx = (k1, k2) => Math.max(...out.map(o => o.m[k1][k2]));
  const wEl = mx('wander', 'el'), wXel = mx('wander', 'xel'), p99 = Math.max(mx('p99', 'el'), mx('p99', 'xel'));
  const fov = Math.min(...out.map(o => o.m.fovStay)), clip = Math.max(...out.map(o => o.lim.clipFrac));
  const okW = !W || (Math.max(W.m.wander.el, W.m.wander.xel) <= W.req && Math.max(W.m.p99.el, W.m.p99.xel) <= W.p99req && W.m.fovStay >= 0.9999);
  const ok = wEl <= d.req.wander && wXel <= d.req.wander && p99 <= d.req.p99 && fov >= 0.9999 && okW;
  // hexapod θ/ω/α sınırları profilin bir kısmında aşılıyorsa test tanımlandığı gibi üretilemez: GEÇERSİZ (DUT kararı verilmez)
  ctx.T13 = { wEl, wXel, perSeed: out.map(o => o.m.wander) };
  const m0 = out[0].m;
  // taban düzeltmesi: masa mikro-titreşiminin video zincirine geçen payı karesel düşülür (kip: Model → Hexapod)
  const mvOn = (P.wb.hex.mvCorr || 'kapalı') !== 'kapalı', sh = mvOn ? tableShare(P) : null;
  const cE = mvOn ? tableCorr(P, wEl, sh.on.vid.el) : null, cX = mvOn ? tableCorr(P, wXel, sh.on.vid.xel) : null;
  const fullE = Math.sqrt(Math.max(0, wEl * wEl - sq(P.wb.hex.microvib * URAD)));
  // v13.7 (K2): karar belirsizliği — tohumlar arası saçılım (tek gerçekleşme) ⊕ kalibre ölçek; düzeltilmemiş toplanır video tabanı yanlılık
  const sdOf = (k) => { const v = out.map(o => o.m.wander[k]), m = aMean(v); return v.length > 1 ? Math.sqrt(v.reduce((t, y) => t + sq(y - m), 0) / (v.length - 1)) : 0; };
  const fl3 = turInfo(P).uvAdd * URAD, sr3 = scaleRelOf(P, ctx);
  const G13 = [decisionGuard(P, { x: wEl, R: d.req.wander, uStat: sdOf('el'), rel: [sr3], floor: fl3, label: 'wander el' }),
               decisionGuard(P, { x: wXel, R: d.req.wander, uStat: sdOf('xel'), rel: [sr3], floor: fl3, label: 'wander xel' })];
  const res = mkResult('T1.3', {
    status: clip > 0 ? 'GEÇERSİZ' : stat(ok), measured: `Wander (en kötü tohum) el ${urad(wEl)} / xel ${urad(wXel)} µrad RMS; P99 ${urad(p99)} µrad; FOV'da kalma ${fmt(fov * 100, 2)} %; kırpma ${fmt(clip * 100, 3)} %` +
      (W ? `; ${W.name}: ${urad(W.m.wander.el)} / ${urad(W.m.wander.xel)} µrad (gereksinim ${urad(W.req, 0)})` : ''),
    kv: [['Tohum başına wander el/xel (µrad)', out.map(o => urad(o.m.wander.el) + '/' + urad(o.m.wander.xel)).join(' · ')],
         ...(W ? [[`${W.name} (IFOV ${fmt(W.IF * 1e6, 0)} µrad), tohum 1`, `wander el/xel ${urad(W.m.wander.el)} / ${urad(W.m.wander.xel)} µrad = ${fmt(W.m.wander.el / W.IF, 3)} / ${fmt(W.m.wander.xel / W.IF, 3)} px; P99 ${urad(Math.max(W.m.p99.el, W.m.p99.xel))} µrad (gereksinim ${urad(W.req, 0)} / ${urad(W.p99req, 0)} µrad)`]] : []),
         ['Radyal wander (tohum 1)', urad(m0.wander.radial) + ' µrad = ' + fmt(m0.wander.radial / d.IFOV, 3) + ' px'],
         ['P95 / P99 (el, tohum 1)', urad(m0.p95.el) + ' / ' + urad(m0.p99.el) + ' µrad'],
         ['Gerçek LOS (simülasyon): wander / smear el', urad(m0.trueM.wander.el) + ' / ' + urad(m0.trueM.smear.el) + ' µrad'],
         [(P.wb.eis.eta === 0 ? (P.wb.eis.reg_px > 0 ? 'EIS düzeltmesiz (η = 0) + registrasyon artığı ' + P.wb.eis.reg_px + ' px' : 'EIS kapalı (η = 0, registrasyon artığı 0)') : 'EIS AÇIK (f_c = ' + P.wb.eis.fc + ' Hz, η = ' + P.wb.eis.eta + ')') + ' wander el/xel', urad(m0.eis.el) + ' / ' + urad(m0.eis.xel) + ' µrad'],
         ['EIS referans kareye kilit (f_c = 0) wander el', urad(m0.eis.lockEl) + ' µrad'],
         ['Hexapod tepe θ/ω/α (roll)', fmt(out[0].lim.axes[0].peakDeg, 2) + '° / ' + fmt(out[0].lim.axes[0].peakRate, 2) + '°/s / ' + fmt(out[0].lim.axes[0].peakAcc, 2) + '°/s²'],
         PXt.kv,
         ['Gereksinim', 'wander ≤ ' + urad(d.req.wander, 1) + ' µrad, P99 ≤ ' + urad(d.req.p99, 1) + ' µrad'],
         [`Karar belirsizliği ve koruma bandı (en kötü tohum; k = ${G13[0].k}; tohumlar arası sd ⊕ kalibre ölçek)`, G13.map(guardTxt).join(' · ') + `; düzeltilmemiş video tabanı (u_v,top ${fmt(turInfo(P).uvAdd)} µrad) ölçülen değeri en çok el +${urad(G13[0].bias)} / xel +${urad(G13[1].bias)} µrad yükseltir (temkinli)`]],
    notes: ['Wander: ' + P.ana.Tw + ' s pencerelerde doğrusal trend çıkarılarak kare ortalamalarının saçılımı (drift ayrı raporlanır). Pencere seçimi ARW katkısını belirgin değiştirir (Bütçe sekmesi).',
            'Ölçülen wander, video ölçüm tabanını (centroid, piksel fazı, hava) da içerir; taban düzeltmesi Bütçe sekmesinde.',
            'WFOV: aynı taban hareketiyle (tohum 1) ayrı koşu. LOS hareketi kanaldan bağımsızdır; px cinsinden tanımlı ölçüm tabanı (centroid, piksel fazı) µrad cinsinden IFOV oranında büyür. Gereksinim kanalın IFOV\'una ölçeklenir (k_wander·IFOV, k_conf·k_wander·IFOV).'],
    fill: { 'T1.3': wEl },
    num: { pupil: PX, guard: G13 },
  });
  if (PXt.note) res.notes.push(PXt.note);
  if (clip > 0) res.notes.unshift(`Komut edilen deniz profili hexapodun θ/ω/α sınırlarını (${P.wb.hex.theta_max}° / ${P.wb.hex.omega_max}°/s / ${P.wb.hex.alpha_max}°/s²) aşıyor (aşım süresi oranı %${fmt(clip * 100, 1)}, roll tepesi ${fmt(out[0].lim.axes[0].peakDeg, 1)}°): hexapod bu profili üretemez, sonuç GEÇERSİZ. Genliği küçültün ya da daha büyük erişimli bir hexapod tanımlayın.`);
  // 6-DOF ötelemesi ya da kaldıraç kolu: hexapod deniz ötelemesini strokuna sığacak q oranıyla küçültür (v13 bilgi satırı)
  if (out[0].q != null) {
    const qc0 = out[0].qc == null ? 1 : out[0].qc;
    res.kv.splice(res.kv.length - 1, 0, ['Deniz ötelemesi (laboratuvar, tohum 1)', `talep ±${fmt(out[0].dem, 2)} m → hexapod ±${fmt(out[0].dem * out[0].q * 1e3, 0)} mm (q = ${fmt(out[0].q, 4)})` +
      (qc0 < 1 - 1e-9 ? ` → kolimatör sınırı (e ≤ ${fmt(PX.eFree * 1e3, 1)} mm) için ×${fmt(qc0, 3)}: ±${fmt(out[0].dem * out[0].q * qc0 * 1e3, 1)} mm (ölçeksiz kayma ${fmt((out[0].e1 || 0) * 1e3, 1)} mm)` : '')]);
    const srcT = [P.wb.sea.mode === '6dof' ? '6-DOF ağırlık merkezi ötelemesi' : null, seaDOF(P).rOn ? `${armTxt(P)} kaldıraç kolunun ötelemesi` : null].filter(Boolean).join(' ve ');
    if (qc0 < 1 - 1e-9) res.notes.push(`Deniz ötelemesi kolimatör demetine sığacak biçimde ayrıca ×${fmt(qc0, 3)} küçültüldü (v13.5): göz bebeği en çok ${fmt(PX.eMax * 1e3, 1)} mm kayar (sınır ${fmt(PX.eFree * 1e3, 1)} mm). Ötelemenin işletme ivmesindeki etkisi T2.5'te ölçülür.`);
    res.notes.push(`Laboratuvar deniz ötelemesini (${srcT}) hexapod stroku içinde q = ${fmt(out[0].q, 4)} oranında üretir; ötelemenin LOS etkisi bu testte tam ölçekte yoktur. İşletme ivmesindeki etkisi T2.5'te ivme eşdeğeriyle ölçülür (B1-08).`);
  }
  // v13.5 (kullanıcı kararı): varsayılan kip kapalı — masa titreşimi düşülmez (bilgi satırı)
  if (!mvOn && P.wb.hex.microvib > 0) res.kv.splice(1, 0, ['Taban düzeltmesi', `kapalı: masa mikro-titreşimi (U-03, ${fmt(P.wb.hex.microvib, 1)} µrad) düşülmez — örnek DUT'ta ölçüme karesel eklenmiyor (sürtünme ditheri, V&V M7); düşüm iyimser olurdu`]);
  if (mvOn) {
    res.kv.splice(1, 0, ['Masa mikro-titreşiminin video zincirine geçen payı (stab ON, yalıtılmış koşu)', `el ${urad(sh.on.vid.el)} / xel ${urad(sh.on.vid.xel)} µrad (tabla ${urad(sh.on.table)} µrad, masa parametresi ${fmt(P.wb.hex.microvib)} µrad)`],
      [`Taban düzeltmeli wander σ = √(σ_ölç² − s²), ${MV_MODE_TXT[cE.mode]}`, `el ${urad(cE.corr)} / xel ${urad(cX.corr)} µrad (s = ${urad(cE.s)} / ${urad(cX.s)})${cE.reliable && cX.reliable ? '' : ' — s² ölçülen varyansın yarısını aşıyor: düzeltme güvenilmez'}; ${fmt(P.wb.hex.microvib)} µrad tam düşülseydi el ${urad(fullE)} µrad`]);
    res.notes.push('Taban düzeltmesi yalnız masa mikro-titreşimini düşer (seçili kip); centroid, piksel fazı ve hava katkısı ölçülen değerde kalır. Ham değer kabul kararında, düzeltilmiş değer Bütçe sekmesinde kullanılır (ikisi birlikte raporlanır). Yöntemin doğrulaması: Yöntem → V&V M7.');
    res.num = Object.assign({}, res.num || {}, { guard: G13, wander: { el: wEl, xel: wXel }, corr: { el: cE.corr, xel: cX.corr, sEl: cE.s, sXel: cX.s, mode: cE.mode, reliable: cE.reliable && cX.reliable }, fullEl: fullE, mvShare: sh });
  }
  // değerlendirilen dizi: Tw pencerelerinde doğrusal trend çıkarılmış kare ortalamaları (ham dizide dünya dönüşü/bias rampası vardır, T0.7)
  const fps0 = R0fps(out), rE = m0.residE, tt = [], yy = [];
  for (let i = 0; i < rE.length; i++) { tt.push(20 + i / fps0); yy.push(rE[i] * 1e6); }
  const dd = decim(tt, yy);
  res.plots.push({ title: `Video LOS artığı (el), tohum 1 — ${P.ana.Tw} s pencerelerde trend çıkarılmış`, xLabel: 's', yLabel: 'µrad', series: [{ name: 'el', x: dd.x, y: dd.y }],
    refLines: [{ y: d.req.p99 * 1e6, label: 'P99 sınırı' }, { y: -d.req.p99 * 1e6, label: '' }] });
  return pupilRule(P, res, PX);      // v13.5: gerçek vinyetlemede GEÇERSİZ
};
// T1.4 — elevasyon bağımlılığı
TESTS['T1.4'] = function (P, ctx, prog) {
  const d = derive(P), els = [0, 30, 60, 75], out = [], Tpr = 320, nRun = 2 * els.length;
  els.forEach((el, ie) => {
    const fR = 1 / seaPeriod(P, 0), fY = 1 / seaPeriod(P, 2), aR = seaAmpDeg(P, 0), aY = seaAmpDeg(P, 2);
    const list = [{ axis: 0, f: fR, A: Math.min(aR, d.reach(fR)) * D2R, nper: 10 }, { axis: 0, f: 0.5, A: Math.min(aR, d.reach(0.5)) * D2R, nper: 10 },
                  { axis: 2, f: fY, A: Math.min(aY, d.reach(fY)) * D2R, nper: 10 }, { axis: 2, f: 0.5, A: Math.min(aY, d.reach(0.5)) * D2R, nper: 10 }];
    list.push({ axis: 0, f: fR, A: 0.5 * list[0].A, nper: 10 }, { axis: 2, f: fY, A: 0.5 * list[2].A, nper: 10 });
    const sg = segSines(list);
    const R = runSim(P, labScenario(P, { label: 'T1.4 el=' + el, T: sg.T, fs: 2000, cmd: sg.cmd, e0: el, seed: 1400 + ie }), (f) => prog && prog((2 * ie + f) / nRun));
    const fits = fitSegments(P, R, sg.segs, ctx);
    // T1.3 spektrumundan deniz profili, aynı tohum, her elevasyonda (test tanımı: "+ T1.3'ten bir profil")
    const Rp = runSim(P, seaLabScenario(P, { T: Tpr, seed: 1301, label: 'T1.4 profil el=' + el, extra: { e0: el } }), (f) => prog && prog((2 * ie + 1 + f) / nRun));
    const mp = profileMetrics(P, Rp, ctx, 20);
    // iki genlik: doğrusal DRR (sürtünmenin genlikten bağımsız temel bileşeni ayrılır)
    const lin = (r1, r2, key) => {
      if (!r1 || !r2 || !r1[key] || !r2[key] || !r1.fin || !r2.fin) return NaN;
      const nrm = (r) => { const fo = r[key], xi = r.fin; const xr = xi.a / xi.A, xim = xi.b / xi.A; return { re: fo.a * xr + fo.b * xim, im: fo.b * xr - fo.a * xim, A: xi.A }; };
      const n1 = nrm(r1), n2 = nrm(r2), dA = n1.A - n2.A; return db(Math.hypot((n1.re - n2.re) / dA, (n1.im - n2.im) / dA));
    };
    out.push({ el, roll01: lin(fits[0], fits[4], 'fe'), roll05: drrOf(fits[1].fe, fits[1].fin), yaw01: lin(fits[2], fits[5], 'fx'), yaw05: drrOf(fits[3].fx, fits[3].fin),
      rawR: drrOf(fits[0].fe, fits[0].fin), rawY: drrOf(fits[2].fx, fits[2].fin), sig: [true, signif(fits[1].fe), true, signif(fits[3].fx)],
      xRX: drrOf(fits[0].fx, fits[0].fin), xYE: drrOf(fits[2].fe, fits[2].fin), wEl: mp.wander.el, wXel: mp.wander.xel, fov: mp.fovStay });
  });
  const invalid14 = out.filter(o => !isFinite(o.roll01) || !isFinite(o.yaw01)).map(o => o.el + '°');
  const AL = budgetAlloc(P), reqR = db(AL['B1-01'] * 1e-6 / seaSigma(P, 0)), reqY = db(AL['B1-03'] * 1e-6 / seaSigma(P, 2));
  const ok = out.every(o => (!o.sig[0] || !isFinite(o.roll01) || o.roll01 <= reqR) && (!o.sig[2] || !isFinite(o.yaw01) || o.yaw01 <= reqY));
  const res = mkResult('T1.4', {
    status: invalid14.length ? 'GEÇERSİZ' : stat(ok), measured: (invalid14.length ? `geçersiz elevasyon ${invalid14.join(', ')}; ` : '') + out.map(o => `el ${o.el}°: roll→el ${fmt(o.roll01, 1)} dB, yaw→xel ${fmt(o.yaw01, 1)} dB`).join('; ') + ' (baskın frekanslarda)',
    kv: out.map(o => [`Elevasyon ${o.el}°`, `roll→el ${fmt(1 / seaPeriod(P, 0), 3)} Hz doğrusal ${fmt(o.roll01, 1)} dB (ham ${fmt(o.rawR, 1)}), 0,5 Hz ${fmt(o.roll05, 1)} dB · yaw→xel ${fmt(1 / seaPeriod(P, 2), 3)} Hz doğrusal ${fmt(o.yaw01, 1)} dB (ham ${fmt(o.rawY, 1)}), 0,5 Hz ${fmt(o.yaw05, 1)} dB`])
      .concat(out.map(o => [`Elevasyon ${o.el}°: çapraz eksen kuplajı / deniz profili`, `roll→xel ${fmt(o.xRX, 1)} dB, yaw→el ${fmt(o.xYE, 1)} dB · profil wander el/xel ${urad(o.wEl)} / ${urad(o.wXel)} µrad, alanda kalma ${fmt(o.fov * 100, 2)} %`]))
      .concat([['Gerekli DRR (baskın frekansta)', `roll ${fmt(reqR, 1)} dB, yaw ${fmt(reqY, 1)} dB`], ['Profil', `T1.3 spektrumu, tohum 1301, ${Tpr - 20} s değerlendirme (bilgi; kabul DRR üzerinden)`]]),
    notes: ['Azimut döngüsünün kazancı elevasyonla sekant çarpanıyla düzeltilir; eylemsizlik J_az(e) değişir, kontrolcü sabittir.',
            'Yüksek elevasyonda taban yaw\'ı çapraz-el\'e cos(e), görüntü rotasyonuna sin(e) oranında yansır.',
            'Çapraz eksen kuplajı: roll uyarımının xel\'de, yaw uyarımının el\'de bıraktığı artık (girdiye göre dB). "Maks." elevasyon örnek DUT için 75° alındı.'],
  });
  res.plots.push({ title: 'DRR — elevasyona göre', xLabel: 'elevasyon (°)', yLabel: 'dB',
    series: [{ name: 'roll→el (baskın)', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.roll01)), dots: true },
             { name: 'roll→el 0,5 Hz', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.roll05)), dots: true },
             { name: 'yaw→xel (baskın)', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.yaw01)), dots: true },
             { name: 'yaw→xel 0,5 Hz', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.yaw05)), dots: true }] });
  return res;
};
// T1.5 — görüntü rotasyonu (LOS ekseni etrafında), türetme OFF/ON
TESTS['T1.5'] = function (P, ctx, prog) {
  const d = derive(P), map0 = axisMap(P, 0), map1 = axisMap(P, 1);
  const ax = Math.abs(map0.rotW || 0) > Math.abs(map1.rotW || 0) ? 0 : 1;          // LOS ekseni etrafındaki gövde ekseni
  const A = seaAmpDeg(P, ax) * D2R, f = 1 / seaPeriod(P, ax);
  const sepPx = 0.5 * d.Nh, sigRot = Math.SQRT2 * P.wb.chain.centroid_px / sepPx;     // iki noktalı retikül, kare başına
  // ölçüm benzetimi: türetme artığının kare içi ortalaması (T_int) + iki nokta centroid gürültüsünden açı gürültüsü;
  // değerlendirmede gürültü varyansı karesel olarak çıkarılır
  const frameMeas = (R, t0, t1, rng) => {
    const x = R.rec.rot_res, fr = R.meta.fRec, Tf = 1 / d.fps, nI = Math.max(1, Math.round(d.Tint * fr)), y = [], yt = [];
    for (let tk = t0; tk + d.Tint <= t1; tk += Tf) { const j = Math.round(tk * fr); let s = 0; for (let q = 0; q < nI; q++) s += x[j + q]; yt.push(s / nI); y.push(s / nI + sigRot * rng.gauss()); }
    const meas = aRms(detrend(y, 'linear')), tru = aRms(detrend(yt, 'linear'));
    return { meas, tru, corr: Math.sqrt(Math.max(0, meas * meas - sigRot * sigRot)) };
  };
  // ölçüt noktası: köşe pikseli (yarı köşegen) ya da alan kenarı (Nh/2) — Model → Görüntü rotasyonu
  const edgeOf = (c) => d.rot.of(c), cn = d.rot.ref === 'corner', nmPt = cn ? 'köşe' : 'kenar', nmPtC = cn ? 'Alan köşesi' : 'Alan kenarı';
  const out = [], Tpr = 320; let k = 0;
  [false, true].forEach((der) => {
    const sg = segSines([{ axis: ax, f, A, nper: 10 }]);
    const R = runSim(P, labScenario(P, { label: 'T1.5', T: sg.T, fs: 2000, cmd: sg.cmd, derot: der, seed: 1500 + k,
      rec: { fs: 1000, ch: ['rot', 'rot_res', 'imu_r', 'imu_p', 'imu_y', 'opt_el', 'opt_xel'] } }), (p) => prog && prog((k + p) / 4)); k++;
    const s = sg.segs[0], mS = frameMeas(R, s.c0, s.c1, new RNG(hash32(seedOf(P, 1550), k)));
    // T1.3 profili (test tanımı: "+ T1.3 profili")
    const Rp = runSim(P, seaLabScenario(P, { T: Tpr, seed: 1301, label: 'T1.5 profil', extra: { derot: der } }), (p) => prog && prog((k + p) / 4)); k++;
    const mP = frameMeas(Rp, 20, Tpr - 1, new RNG(hash32(seedOf(P, 1560), k)));
    const px = (c) => cn ? c * d.rot.rCpx : c * d.Nh / 2;      // kenar kipinde önceki sürümle aynı işlem sırası
    out.push({ der, sine: mS, prof: mP, edge: edgeOf(mS.corr), edgePx: px(mS.corr), edgeP: edgeOf(mP.corr), edgePxP: px(mP.corr) });
  });
  const lim = d.req.rot, on = out[1];
  const ok = Math.max(on.edge, on.edgeP) <= lim;
  const res = mkResult('T1.5', {
    status: stat(ok), measured: `${nmPtC} yer değiştirmesi (türetme ON): sinüs ${urad(on.edge, 2)}, deniz profili ${urad(on.edgeP, 2)} µrad RMS (sınır ${urad(lim, 1)}); türetme OFF sinüs ${urad(out[0].edge, 1)} µrad`,
    kv: out.map(o => [`Türetme ${o.der ? 'ON' : 'OFF'}`, `sinüs: artık rotasyon ${fmt(o.sine.corr * 1e3, 3)} mrad RMS (gerçek ${fmt(o.sine.tru * 1e3, 3)}) → ${nmPt} ${urad(o.edge, 2)} µrad = ${fmt(o.edgePx, 3)} px · profil: ${fmt(o.prof.corr * 1e3, 3)} mrad → ${urad(o.edgeP, 2)} µrad = ${fmt(o.edgePxP, 3)} px`])
      .concat([['Uyarım', `${AXN[ax]} ${fmt(A * R2D, 2)}° @ ${fmt(f, 3)} Hz (LOS ekseni etrafında) + T1.3 spektrumundan ${Tpr - 20} s profil`], ['İki noktalı hedef açı gürültüsü (kare başına)', fmt(sigRot * 1e3, 4) + ' mrad (çıkarıldı)']])
      .concat(cn ? [[`Roll sınırı (LOS etrafında, ${d.Nh}×${d.Nv}): ψ = k_roll·IFOV/θ_köşe`, `${fmt(d.rot.lim * 1e6, 0)} µrad RMS (köşe r = ${fmt(d.rot.rCpx, 1)} px); türetme ON artığı ${fmt(Math.max(on.sine.corr, on.prof.corr) * 1e6, 0)} µrad → %${fmt(100 * Math.max(on.sine.corr, on.prof.corr) / d.rot.lim, 0)}; alan kenarı ölçütüyle ${fmt(d.rot.limE * 1e6, 0)} µrad`]] : []),
    notes: ['2 eksenli gimbal LOS etrafındaki dönmeyi düzeltemez; türetme (optik veya sayısal) gecikme ve ölçek hatasıyla artık bırakır.',
            'Ölçüm: retikülün iki noktası arasındaki açı her karede (T_int ortalaması) centroid gürültüsüyle ölçülür; gürültü varyansı karesel çıkarılır. "Gerçek" değer gürültüsüz kare ortalamasıdır.',
            '"Roll ekseni sinüs" burada LOS ekseni etrafındaki dönmedir; LOS iskele yönünde olduğundan bu eksen gövdenin ' + AXN[ax] + ' eksenidir.'],
    fill: { 'R-01': Math.max(on.edge, on.edgeP) },
  });
  return res;
};
// T1.6 — hız yön değişimi / sürtünme (stick-slip)
// Senkron ortalama (TSA): uyarım periyoduna kilitli tekrarlanan bileşeni (sürtünme/vuruntu geçişleri) rastgele
// tabandan (ARW rastgele yürüyüşü, mikro-titreşim, ölçüm gürültüsü) ayırır. K tam periyot, i0'dan başlar.
function tsaAnalysis(tr, x, f, i0, K, fr, smooth_s) {
  const np = Math.round(fr / f), i1 = i0 + K * np;
  const fit = sineFit(tr, x, f, { i0, i1 });
  const n = i1 - i0, r = new Float64Array(n), tm = (tr[i0] + tr[i1 - 1]) / 2;
  for (let i = i0; i < i1; i++) { const t = tr[i]; r[i - i0] = x[i] - (fit.a * Math.cos(TAU * f * t) + fit.b * Math.sin(TAU * f * t) + fit.c0 + fit.c1 * (t - tm)); }
  // bir periyot uzunluğunda kayan ortalama çıkarılır: periyodik içerik korunur, yavaş sürüklenme ayıklanır
  const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + r[i];
  const hp = new Float64Array(n), h = Math.floor(np / 2);
  for (let i = 0; i < n; i++) { let a = i - h, b = a + np; if (a < 0) { a = 0; b = np; } if (b > n) { b = n; a = n - np; } hp[i] = r[i] - (cs[b] - cs[a]) / np; }
  const avg = new Float64Array(np);
  for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) avg[j] += hp[k * np + j] / K;
  let v = 0; for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) v += sq(hp[k * np + j] - avg[j]);
  const varN = v / (np * Math.max(1, K - 1));
  let ra = 0; for (let j = 0; j < np; j++) ra += avg[j] * avg[j]; ra /= np;
  const det = Math.sqrt(Math.max(0, ra - varN / K));
  // tepe: geçiş süresine göre kısa (≈ 25 ms) dairesel kayan ortalama ile gürültü yanlılığı azaltılır
  const w = Math.max(1, Math.round((smooth_s || 0.025) * fr)), sm = new Float64Array(np);
  for (let j = 0; j < np; j++) { let s = 0; for (let q = -Math.floor(w / 2); q < w - Math.floor(w / 2); q++) s += avg[(j + q + np) % np]; sm[j] = s / w; }
  let pk = 0, ipk = 0; for (let j = 0; j < np; j++) if (Math.abs(sm[j]) > pk) { pk = Math.abs(sm[j]); ipk = j; }
  return { fit, r, hp, avg: sm, np, K, det, noise: Math.sqrt(varN), pk, ipk, rmsRaw: aRms(r), rmsHp: aRms(hp) };
}
// T1.6 — hız yön değişimi / sürtünme
TESTS['T1.6'] = function (P, ctx, prog) {
  const d = derive(P), f = 0.05, Adeg = Math.min(5, d.reach(f));
  const out = [];
  [0, 2].forEach((ax, k) => {
    const sg = segSines([{ axis: ax, f, A: Adeg * D2R, nper: 11 }]);
    const R = runSim(P, labScenario(P, { label: 'T1.6', T: sg.T, fs: 4000, cmd: sg.cmd, seed: 1600 + ax }), (p) => prog && prog((k + p) / 2));
    const map = axisMap(P, ax), tr = recT(R), s = sg.segs[0], fr = R.meta.fRec;
    const ch = map.los === 'el' ? 'ac_el' : 'ac_xel';
    let i0 = 0; while (i0 < tr.length && tr[i0] < s.c0) i0++;
    const K = Math.floor((s.c1 - s.c0) * f + 1e-9);
    const A = tsaAnalysis(tr, R.rec[ch], f, i0, K, fr);
    // yön değişim anları (komut A·sin(2πf(t − tS)) tepeleri) ve tek tek geçiş tepeleri (taban gürültüsü dahil)
    const peaks = [], durs = [];
    for (let nn = 0; ; nn++) {
      const tc = s.tS + (0.25 + 0.5 * nn) / f; if (tc > tr[i0 + K * A.np - 1]) break; if (tc < tr[i0]) continue;
      const [j0, j1] = idxRange(tr, tc - 1.0, tc + 1.5);
      let pk = 0; for (let j = Math.max(j0, i0); j < Math.min(j1, i0 + K * A.np); j++) pk = Math.max(pk, Math.abs(A.hp[j - i0]));
      peaks.push(pk);
      // süre (TSA dalga biçiminde, yarı tepe genişliği)
      const jc = Math.round((tc - tr[i0]) * fr) % A.np, half = 0.5 * Math.max(...Array.from({ length: Math.round(2.5 * fr) }, (_, q) => Math.abs(A.avg[(jc - Math.round(fr) + q + A.np) % A.np])));
      let wN = 0; for (let q = -Math.round(fr); q < Math.round(1.5 * fr); q++) if (Math.abs(A.avg[(jc + q + A.np) % A.np]) > half) wN++;
      durs.push(wN / fr);
    }
    out.push({ ax, los: map.los, A, peaks, durs, n: peaks.length, t0: tr[i0] });
  });
  const lim = P.wb.k_conf * budgetAlloc(P)['B1-07'] * 1e-6;
  const pTSA = Math.max(...out.map(o => o.A.pk));
  const allP = out.flatMap(o => o.peaks), pmed = aPctAbs(Float64Array.from(allP), 50), pmax = Math.max(...allP);
  const ok = pTSA <= lim;
  const elO = out.find(o => o.los === 'el');
  const res = mkResult('T1.6', {
    status: stat(ok), measured: `Yön değişimi geçişi (senkron ortalama): tepe ${urad(pTSA, 1)} µrad (sınır ${urad(lim, 1)}), tekrarlanan bileşen el ${urad(elO.A.det, 2)} µrad RMS; ${allP.length} sıfır geçişi`,
    kv: out.map(o => [`${AXN[o.ax]} → ${o.los}`, `TSA tepe ${urad(o.A.pk, 1)} µrad, tekrarlanan RMS ${urad(o.A.det, 2)} µrad, geçiş süresi (yarı tepe) ${fmt(aMean(o.durs) * 1e3, 0)} ms; ${o.A.K} periyot`])
      .concat(out.map(o => [`${AXN[o.ax]} → ${o.los}: tek tek geçişler`, `tepe ortanca ${urad(aPctAbs(Float64Array.from(o.peaks), 50), 1)} / en büyük ${urad(Math.max(...o.peaks), 1)} µrad (taban gürültüsü ${urad(o.A.noise, 2)} µrad RMS dahil)`]))
      .concat([['Ham artık RMS (el; trend çıkarılmış, ARW yürüyüşü dahil)', urad(elO.A.rmsRaw, 2) + ' µrad'],
               ['Uyarım', `${fmt(Adeg, 1)}° @ ${f} Hz, 11 periyot (bağıl hız tepe ${fmt(Adeg * D2R * TAU * f * 1e3, 1)} mrad/s)`],
               ['Sürtünme modeli', `LuGre: el F_c ${P.dut.el.Fc} N·m, az F_c ${P.dut.az.Fc} N·m (yağ dolu keçe); ileri besleme ${P.dut.ctl.ff.on ? 'açık, η = ' + P.dut.ctl.ff.eta : 'kapalı'}`]]),
    notes: ['Yüksek hızlı kanal (otokolimatör, 1 kHz). Sinüs + trend çıkarıldıktan sonra artık, uyarım periyoduna kilitli ortalanır (senkron ortalama): sürtünme ve vuruntu geçişleri her periyotta tekrarlar, gyro ARW yürüyüşü ve mikro-titreşim tekrarlamaz ve 1/√K ile söner.',
            'Tek tek geçişlerde ölçülen tepeler taban gürültüsünü de içerir; kabul tekrarlanan bileşenin tepesine uygulanmıştır. Ham artığı doğrudan B1-07 diye raporlamak, 200 s kayıtta ARW rastgele yürüyüşünü sürtünmeye yazar.',
            'Sürtünme sıçramaları Gauss değildir: RMS tahsise uyarken k_conf × tahsis tepe ölçütü aşılabilir. Soğukta tekrar: T4.2.',
            'Test tanımındaki "yaw/pitch sinüs" ileri bakan LOS içindir. LOS iskele yönündeyken el gimbalını roll, az gimbalını yaw sürer; pitch LOS ekseni etrafında kalır ve gimbal bağıl hızı üretmez. Bu yüzden roll ve yaw uygulandı.'],
    fill: { 'B1-07': elO.A.det },
  });
  // v12 proje gereksinimi: hız yön değişimi geçişinin tepe-tepe değeri (senkron ortalama dalga biçimi, stick-slip)
  const ppvAx = out.map(o => { let a = Infinity, b = -Infinity; for (const v of o.A.avg) { if (v < a) a = v; if (v > b) b = v; } return b - a; }), ppvRev = Math.max(...ppvAx);
  if (P.ana.los && P.ana.los.on !== false) {      // uyum kipinde (değerlendirme kapalı) sonuç v10 ile aynı kalır
    res.num = { ppvRev, ppvRevAx: ppvAx, los: out.map(o => o.los) };
    const limRev = P.ana.los.kRev * d.IFOV;
    res.kv.push(['Proje gereksinimi (v12): geçiş tepe-tepe (stick-slip, senkron ortalama)', `${out.map((o, i) => `${o.los} ${urad(ppvAx[i], 1)}`).join(' / ')} µrad; sınır ${urad(limRev, 1)} µrad (${P.ana.los.kRev}·IFOV) → ${ppvRev <= limRev ? 'OK' : 'AŞIM'} (Gereksinimler sekmesi)`]);
    res.num.limRev = limRev;
  }
  const tt = (o) => Float32Array.from({ length: o.A.np }, (_, j) => j / (o.A.np / (1 / f)));
  const dsel = (o) => decim(Array.from(tt(o)), Array.from(o.A.avg, v => v * 1e6), 1600);
  res.plots.push({ title: 'Senkron ortalanmış artık (bir periyot, otokolimatör)', xLabel: 's (periyot içi)', yLabel: 'µrad',
    series: out.map(o => { const q = dsel(o); return { name: AXN[o.ax] + '→' + o.los, x: q.x, y: q.y }; }),
    refLines: [{ y: lim * 1e6, label: 'k_conf × tahsis' }, { y: -lim * 1e6, label: '' }] });
  res.plots.push({ title: 'Tek tek geçiş tepeleri (taban gürültüsü dahil)', xLabel: 'geçiş no', yLabel: 'µrad',
    series: out.map(o => ({ name: AXN[o.ax] + '→' + o.los, x: Float32Array.from(o.peaks.map((_, i) => i + 1)), y: Float32Array.from(o.peaks.map(p => p * 1e6)), dots: true })),
    refLines: [{ y: lim * 1e6, label: 'k_conf × tahsis' }] });
  return res;
};
// T1.7 — hedef kilidi / video izleyici
TESTS['T1.7'] = function (P, ctx, prog) {
  const d = derive(P), req = d.req.wander;
  const S = seaLabScenario(P, { T: 620, seed: 1701, extra: { tracker: { bw: 0.5, lat_frames: 2, gate_px: 32 } } });
  const R = runSim(P, S, prog);
  const v = videoAngles(R, ctx), e = [], x = [];
  for (let i = 0; i < v.t.length; i++) if (v.t[i] > 20 && v.ok[i]) { e.push(v.el[i]); x.push(v.xel[i]); }
  const rE = aRms(detrend(e, 'mean')), rX = aRms(detrend(x, 'mean'));
  const p99 = Math.max(aPctAbs(detrend(e, 'mean'), 99), aPctAbs(detrend(x, 'mean'), 99));
  const lost = R.stats.trackLost, rq = P.ana.req.trackErr_urad;
  const ok = lost > 0 ? false : (rq == null ? null : Math.max(rE, rX) <= rq * 1e-6);      // v13.13: gereksinim yoksa BİLGİ (kilit kaybı varsa AŞIM)
  const res = mkResult('T1.7', {
    status: ok == null ? 'BİLGİ' : stat(ok), measured: `Nişan noktası hatası el ${urad(rE)} / xel ${urad(rX)} µrad RMS, P99 ${urad(p99)} µrad; kilit kaybı ${lost}`,
    kv: [['İzleyici', 'PI, bant 0,5 Hz, 2 kare gecikme, kapı ±32 px'], ['Hata RMS (el / xel)', urad(rE) + ' / ' + urad(rX) + ' µrad'], ['P99', urad(p99) + ' µrad'], ['Kilit kaybı', String(lost)],
         ['Hata gereksinimi', rq == null ? 'girilmedi (Model → Proje gereksinimleri); kilit kaybı yoksa sonuç BİLGİ' : rq + ' µrad']],
    notes: ['İzleyici döngüsü düşük frekanslı artığı ve dünya dönüşü/bias rampasını da taşır; trend çıkarılmadan raporlandı.', 'Hata eşiği proje gereksinimidir (Model → Proje gereksinimleri); girilmezse sonuç BİLGİ olur, kilit kaybı varsa AŞIM (T1.8, T2.4, T4.1 gibi).'],
  });
  return res;
};
// T1.8 — dönüş ve oturma (slew & settle)
TESTS['T1.8'] = function (P, ctx, prog) {
  const d = derive(P), thr = d.req.wander;
  const reps = 10, settle = [], over = [], driftRates = [];          // 10 tekrar
  const fogX = P.wb.extRows !== false, holdOff = []; let gMax = 0, gSat = 0;     // v11: FOG ölçek hatası ve ölçüm menzili
  for (let k = 0; k < reps; k++) {
    const S = seaLabScenario(P, { T: 16, seed: 1801 + k, extra: { slew: { t0: 6, ang: 10, rate: 30, acc: 200, hold: 1.0 }, fs: 2000,
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'imu_y'] } } });
    S.cmd.forEach(c => { if (c.type === 'series') c.data = c.data; });
    const R = runSim(P, S, (p) => prog && prog((k + p) / reps));
    // dönüş profilinin bitişi
    const sl = S.slew, wmx = sl.rate, amx = sl.acc; let tc = sl.ang / wmx - wmx / amx, wpk = wmx; if (tc < 0) { tc = 0; wpk = Math.sqrt(sl.ang * amx); }
    const Tm = 2 * wpk / amx + tc, tEnd = sl.t0 + Tm + sl.hold + Tm;
    const tr = recT(R), y0 = R.rec.opt_xel, [i0, i1] = idxRange(tr, tEnd, tEnd + 4);
    if (fogX) {
      // gidiş sonundaki bekleme: LOS komut açısına göre eksik/fazla döner (gyro ölçek hatası: δθ ≈ −S_f·θ, gidiş-dönüşte sıfırlanır)
      const [h0, h1] = idxRange(tr, sl.t0 + Tm + 0.4, sl.t0 + Tm + sl.hold - 0.05);
      holdOff.push(Math.abs(aMean(y0, h0, h1)) - sl.ang * D2R);
      gMax = Math.max(gMax, R.stats.gyroMax || 0); gSat += R.stats.gyroSat || 0;
    }
    // dönüş öncesi penceredeki doğrusal kayma (dünya dönüşü / bias) çıkarılır; aksi halde |hata| eşiğe hiç inmez
    const [p0, p1] = idxRange(tr, 2, sl.t0 - 0.2), tp = Array.from(tr.subarray(p0, p1)), yp = Array.from(y0.subarray(p0, p1));
    const tmP = aMean(tp), slope = tp.reduce((s2, t, i) => s2 + (t - tmP) * (yp[i] - aMean(yp)), 0) / Math.max(1e-12, tp.reduce((s2, t) => s2 + sq(t - tmP), 0));
    driftRates.push(slope);
    const y = Float64Array.from(y0, (v, i) => v - slope * (tr[i] - tmP));
    const [k0, k1] = idxRange(tr, tEnd + 2.5, tEnd + 4);
    const fin = aMean(y, k0, k1);
    let tset = 4, ov = 0;
    for (let i = i1 - 1; i >= i0; i--) if (Math.abs(y[i] - fin) > thr) { tset = tr[i] - tEnd; break; }
    for (let i = i0; i < i1; i++) ov = Math.max(ov, Math.abs(y[i] - fin));
    if (tset === 4) tset = 0;
    settle.push(Math.max(0, tset)); over.push(ov);
  }
  const rq = P.ana.req.settle_ms;
  const ok = rq == null ? null : Math.max(...settle) <= rq * 1e-3;
  let sfPart = NaN;
  if (fogX) {
    // ölçek hatasının payı: aynı tohumla S_f = 0 (ve doğrusalsızlık 0) koşusunun bekleme ortalamasıyla fark (model ayrıştırması)
    const P0 = cloneParams(P); P0.dut.gyro.sf_ppm = 0; P0.dut.gyro.sfnl_ppm = 0;
    const S0 = seaLabScenario(P0, { T: 16, seed: 1801, extra: { slew: { t0: 6, ang: 10, rate: 30, acc: 200, hold: 1.0 }, fs: 2000, rec: { fs: 1000, ch: ['opt_xel'] } } });
    const R0 = runSim(P0, S0, null), sl = S0.slew, wpk = Math.min(sl.rate, Math.sqrt(sl.ang * sl.acc)), Tm = 2 * wpk / sl.acc + Math.max(0, sl.ang / sl.rate - sl.rate / sl.acc), tr0 = recT(R0);
    const [h0, h1] = idxRange(tr0, sl.t0 + Tm + 0.4, sl.t0 + Tm + sl.hold - 0.05);
    sfPart = holdOff[0] - (Math.abs(aMean(R0.rec.opt_xel, h0, h1)) - sl.ang * D2R);
  }
  // beklenen: döngü ölçülen hızı komuta eşitler → gerçek hız ω_c/(1 + S_etkin); S_etkin = S_f − 1,5·S_nl + 2,5·S_nl·⟨ω²⟩/FS² (kübik model)
  const sfEffP = fogScaleEff(P.dut.gyro, slewW2(10 * D2R, 30 * D2R, 200 * D2R)), sfExp = -sfEffP * 1e-6 * 10 * D2R;
  const fogKv = fogX ? [['Gidiş sonu açı hatası (gyro ölçek hatası; dönüşte sıfırlanır)', `bekleme ortalaması ${fmt(aMean(holdOff) * 1e6, 1)} µrad (oturma artığı dahil, 10 tekrar); ölçek hatasının payı (aynı tohum, S_f = S_nl = 0 ile fark) ${fmt(sfPart * 1e6, 1)} µrad; beklenen −S_etkin·θ = ${fmt(sfExp * 1e6, 1)} µrad (S_f = ${P.dut.gyro.sf_ppm} ppm${P.dut.gyro.sfnl_ppm ? `, doğrusalsızlık ${P.dut.gyro.sfnl_ppm} ppm·FS → kübik modelde etkin ${fmt(sfEffP, 1)} ppm` : ''}). Jitter değil, pointing hatası; görüntü izleyici ya da enkoder döngüsü kapatır.`],
    ['Gyro ölçüm menzili', `dönüşte en büyük eylemsiz hız ${fmt(gMax * R2D, 1)} °/s (menzil ±${P.dut.gyro.range_dps} °/s)` + (gSat ? `; ${gSat} örnekte doyum — gyro bu dönüş hızını ölçemiyor, döngü denetimi kaybeder (DUT sınırı; ölçüm zinciri hatası değil)` : '; doyum yok')]] : [];
  return mkResult('T1.8', {
    status: ok == null ? 'BİLGİ' : stat(ok), measured: `Oturma süresi (|hata| ≤ ${urad(thr, 0)} µrad): en büyük ${fmt(Math.max(...settle) * 1e3, 0)} ms, ortalama ${fmt(aMean(settle) * 1e3, 0)} ms; aşma en büyük ${fmt(Math.max(...over) * 1e3, 2)} mrad`,
    kv: settle.map((s, i) => [`Tekrar ${i + 1}`, `oturma ${fmt(s * 1e3, 0)} ms, aşma ${fmt(over[i] * 1e6, 0)} µrad`]).concat([['Dönüş', '10° @ 30°/s, 200°/s², 1 s bekleme, geri dönüş; taban deniz profilinde'],
      ['Dönüş öncesi kayma (çıkarıldı)', `${fmt(aMean(driftRates.map(Math.abs)) * 1e6, 2)} µrad/s${P.wb.earth.comp ? '' : ' — dünya dönüşü kompanzasyonu kapalı'}`],
      ['Gereksinim', rq == null ? 'girilmedi (Model → Proje gereksinimleri)' : rq + ' ms']]).concat(fogKv),
    notes: ['Gerçek LOS (1 kHz) üzerinden. Oturma, PII integratörlerinin düşük köşesi (' + P.dut.el.fi.toFixed(2) + ' Hz) nedeniyle yavaştır; gerçek sistemlerde dönüş için konum döngüsü ve ileri besleme kullanılır.'],
    num: fogX ? { sfPart, hold: aMean(holdOff), sfExp, sfEff: sfEffP, gMax, gSat } : undefined,
  });
};
