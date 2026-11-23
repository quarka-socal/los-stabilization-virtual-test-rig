// ---------------------------------------------------------------- düzenek (sayısal ikiz) görünümü
// Koordinatlar: simülasyon gövdesi (x pruva, y iskele, z yukarı) → three.js (X, Y yukarı, Z): (x, z, −y)
class Rig3D {
  constructor(host) {
    this.host = host; this.ok = false; this.dirty = true;
    if (!window.THREE) { host.append(h('div', { class: 'nogl' }, '3B sahne için three.js yüklenemedi (ağ erişimi). Dedektör görünümü, grafikler ve metrikler çalışmaya devam eder.')); return; }
    const T = window.THREE;
    try { this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
    catch (e) { host.append(h('div', { class: 'nogl' }, 'Bu tarayıcıda WebGL açılamadı; 3B sahne gösterilemiyor.')); return; }
    this.ok = true; this.T = T;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.prepend(this.renderer.domElement);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(36, 1.6, 0.05, 60);
    this.orb = { az: 0.78, el: 0.36, dist: 5.2, target: new T.Vector3(0.1, 0.85, -1.15) };
    this.build(); this.theme(); this.resize(); this.bindOrbit();
    this.ro = new ResizeObserver(() => { this.resize(); this.render(); }); this.ro.observe(host);
  }
  mat(color, o) { return new this.T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.2 }, o || {})); }
  build() {
    const T = this.T, S = this.scene;
    this.hemi = new T.HemisphereLight(0xffffff, 0x4a5560, 0.95); S.add(this.hemi);
    const dl = new T.DirectionalLight(0xffffff, 0.85); dl.position.set(3, 6, 4); S.add(dl);
    const dl2 = new T.DirectionalLight(0xffffff, 0.25); dl2.position.set(-4, 3, -2); S.add(dl2);
    this.grid = new T.GridHelper(12, 48, 0x888888, 0x888888); this.grid.position.y = 0; S.add(this.grid);
    this.M = { dark: this.mat(0x2b3439, { metalness: 0.4 }), steel: this.mat(0x9aa7ae, { metalness: 0.65, roughness: 0.35 }), rod: this.mat(0xd5dde1, { metalness: 0.8, roughness: 0.2 }),
      dut: this.mat(0x6c7a82), head: this.mat(0x56636b), glass: this.mat(0x0a1820, { metalness: 0.6, roughness: 0.08 }), mirror: this.mat(0xe8eef2, { metalness: 0.95, roughness: 0.05 }),
      coll: this.mat(0x1d2327, { metalness: 0.35 }), lens: this.mat(0x6fa8c8, { metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 }),
      beam: new T.MeshBasicMaterial({ color: 0xd1452b }), target: new T.MeshBasicMaterial({ color: 0xffb04a }), ac: this.mat(0x34404a) };
    const cyl = (r1, r2, hh, m, seg) => new T.Mesh(new T.CylinderGeometry(r1, r2, hh, seg || 40), m);
    const box = (x, y, z, m) => new T.Mesh(new T.BoxGeometry(x, y, z), m);
    // hexapod tabanı
    const base = cyl(0.47, 0.52, 0.09, this.M.dark, 56); base.position.y = 0.045; S.add(base);
    this.bj = []; this.tj = [];
    const bAng = [-14, 14, 106, 134, 226, 254], tAng = [46, 74, 166, 194, 286, 314];
    for (const a of bAng) { const r = a * D2R; this.bj.push(new T.Vector3(0.40 * Math.cos(r), 0.11, 0.40 * Math.sin(r))); const k = cyl(0.035, 0.035, 0.05, this.M.steel, 16); k.position.copy(this.bj[this.bj.length - 1]); S.add(k); }
    // hareketli grup (döner merkez = DUT giriş göz bebeği)
    // v13.4: döner merkez setGeom'da nominal giriş göz bebeğine taşınır (testler pivotu göz bebeğine koyar, motor da böyle hesaplar).
    // Parçalar movIn içinde kurulum pivotuna (pivot0) göre konur; movIn.position = pivot0 − pivot.
    this.yG = 1.12; this.pivot0 = new T.Vector3(0, this.yG, -0.12); this.pivot = this.pivot0.clone(); this.Lpg = 0.12;
    this.mov = new T.Group(); this.mov.position.copy(this.pivot); S.add(this.mov);
    this.movIn = new T.Group(); this.mov.add(this.movIn);
    const off = (v) => v.clone().sub(this.pivot0);
    const top = cyl(0.31, 0.31, 0.045, this.M.dark, 56); top.position.copy(off(new T.Vector3(0, 0.66, 0))); this.movIn.add(top);
    for (const a of tAng) { const r = a * D2R; const p = new T.Vector3(0.27 * Math.cos(r), 0.632, 0.27 * Math.sin(r)); this.tj.push(off(p)); const k = cyl(0.03, 0.03, 0.04, this.M.steel, 16); k.position.copy(off(p)); this.movIn.add(k); }
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const g = new T.Group(); const body = cyl(0.03, 0.03, 1, this.M.steel, 18); body.position.y = 0.25; body.scale.y = 0.5; g.add(body);
      const rod = cyl(0.017, 0.017, 1, this.M.rod, 14); rod.position.y = 0.75; rod.scale.y = 0.5; g.add(rod); g.userData = { body, rod }; S.add(g); this.legs.push(g);
    }
    // DUT: kaide, azimut kulesi, elevasyon kafası
    const ped = cyl(0.1, 0.12, 0.24, this.M.dut); ped.position.copy(off(new T.Vector3(0, 0.80, 0))); this.movIn.add(ped);
    this.az = new T.Group(); this.az.position.copy(off(new T.Vector3(0, 0.92, 0))); this.movIn.add(this.az);
    const tur = cyl(0.15, 0.15, 0.1, this.M.dut); tur.position.y = 0.05; this.az.add(tur);
    for (const zz of [-0.17, 0.17]) { const yk = box(0.1, 0.24, 0.035, this.M.dut); yk.position.set(0, 0.17, zz); this.az.add(yk); }
    this.el = new T.Group(); this.el.position.y = this.yG - 0.92; this.az.add(this.el);
    const hd = box(0.32, 0.26, 0.3, this.M.head); this.el.add(hd);
    for (const zz of [-0.165, 0.165]) { const bo = cyl(0.05, 0.05, 0.03, this.M.dut, 24); bo.rotation.x = Math.PI / 2; bo.position.set(0, 0, zz); this.el.add(bo); }
    const win = box(0.006, 0.17, 0.17, this.M.glass); win.position.set(0.161, 0, 0); this.el.add(win);
    const arm = box(0.04, 0.03, 0.14, this.M.dut); arm.position.set(0.12, -0.06, 0.2); this.el.add(arm);
    const mir = box(0.008, 0.06, 0.06, this.M.mirror); mir.position.set(0.145, -0.06, 0.26); this.el.add(mir);
    this.mirLocal = new T.Vector3(0.15, -0.06, 0.26);
    // kolimatör ve otokolimatör (laboratuvara sabit): DUT'un nominal LOS'u (a0, e0) boyunca dizilir. Grup orijini DUT'un
    // nominal giriş göz bebeği, ekseni yerel −Z (setGeom). Parçalar a0 = 90°, e0 = 0 sahnesindeki yerlerine göre konur.
    const zc0 = -2.35, Lc = 1.7, p0 = new T.Vector3(0, this.yG, -0.12);
    this.colG = new T.Group(); S.add(this.colG);
    const put = (m, x, y, z) => { m.position.set(x - p0.x, y - p0.y, z - p0.z); this.colG.add(m); return m; };
    const tube = cyl(0.12, 0.12, Lc, this.M.coll, 48); tube.rotation.x = Math.PI / 2; put(tube, 0, this.yG, zc0 - Lc / 2);
    const lens = cyl(0.105, 0.105, 0.02, this.M.lens, 48); lens.rotation.x = Math.PI / 2; put(lens, 0, this.yG, zc0 + 0.011);
    this.tube = tube; this.lens = lens;
    const tgt = cyl(0.02, 0.02, 0.01, this.M.target, 20); tgt.rotation.x = Math.PI / 2; put(tgt, 0, this.yG, zc0 - Lc + 0.02);
    for (const zz of [zc0 - 0.3, zc0 - Lc + 0.3]) { put(box(0.08, this.yG - 0.12, 0.08, this.M.dark), 0, (this.yG - 0.12) / 2, zz); put(box(0.4, 0.03, 0.22, this.M.dark), 0, 0.015, zz); }
    const acx = 0.26, acz = -1.25;
    const act = cyl(0.045, 0.045, 0.5, this.M.ac, 28); act.rotation.x = Math.PI / 2; put(act, acx, this.yG - 0.06, acz - 0.25);
    put(box(0.05, this.yG - 0.1, 0.05, this.M.dark), acx, (this.yG - 0.1) / 2, acz - 0.25);
    this.acLocal = new T.Vector3(acx - p0.x, this.yG - 0.06 - p0.y, acz - p0.z);
    this.zl = zc0 - p0.z;        // kolimatör objektifi düzlemi (kolimatör çerçevesinde, nominal göz bebeğinden uzaklık)
    // v13.4: kolimatörün paralel demeti (D_c çaplı silindir, objektiften nominal göz bebeğinin hemen ötesine; laboratuvara sabit)
    // ve DUT giriş göz bebeği diski (D_p çaplı, pencere düzleminde; rengi o andaki demet örtüşmesi: tam → yeşil, kısmi → sarı,
    // %50'nin altı → kırmızı). Ölçekler setColl ile gerçek çaplara getirilir.
    this.M.cbeam = new T.MeshBasicMaterial({ color: 0xffc35c, transparent: true, opacity: 0.17, depthWrite: false, side: T.DoubleSide });
    this.cbeam = cyl(1, 1, 1, this.M.cbeam, 56); this.cbeam.rotation.x = Math.PI / 2; this.colG.add(this.cbeam);
    this.M.pup = new T.MeshBasicMaterial({ color: 0x0ca30c, side: T.DoubleSide });
    this.pupDisc = new T.Mesh(new T.CircleGeometry(1, 48), this.M.pup); this.pupDisc.rotation.y = Math.PI / 2; this.pupDisc.position.set(0.166, 0, 0); this.el.add(this.pupDisc);
    this.collKey = null; this.pupC = null; this.pupOv = null; this.setColl(0.15, 0.1);
    // görüş hattı ışını (ince silindir) ve otokolimatör ışını (çizgi)
    this.beam = cyl(0.006, 0.006, 1, this.M.beam, 10); S.add(this.beam);
    this.hit = new T.Mesh(new T.RingGeometry(0.012, 0.022, 24), this.M.beam); S.add(this.hit);
    const lg = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
    this.acLine = new T.Line(lg, new T.LineBasicMaterial({ color: 0x7a8a95, transparent: true, opacity: 0.8 })); S.add(this.acLine);
    this.geomKey = null; this.setGeom(90 * D2R, 0);
    this.setPose(0, 0, 0, 90 * D2R, 0);
  }
  // DUT'un nominal LOS'u: a0 (pruvaya göre, iskele +), e0. Kolimatör bu yönde, nominal göz bebeğine hizalanır (laboratuvarda
  // kolimatör DUT'un nominal görüş hattına kurulur). Göz bebeği: elevasyon ekseni merkezi + 0,12 m LOS boyunca.
  setGeom(a0, e0, Lpg) {
    if (!this.ok) return;
    const L = Lpg > 0 ? Lpg : 0.12, key = a0 + ',' + e0 + ',' + L; if (key === this.geomKey) return; this.geomKey = key; this.Lpg = L;
    const T = this.T, d = new T.Vector3(Math.cos(e0) * Math.cos(a0), Math.sin(e0), -Math.cos(e0) * Math.sin(a0));
    // gimbal merkezi G0 = pivot0 + (0, 0, 0,12); göz bebeği G0'ın L_pg önünde. v13.4: hexapod döner merkezi göz bebeğine taşınır.
    this.pupil0 = this.pivot0.clone().add(new T.Vector3(0, 0, 0.12)).add(d.multiplyScalar(L));
    this.pivot = this.pupil0.clone(); this.movIn.position.copy(this.pivot0).sub(this.pivot);
    this.colG.position.copy(this.pupil0); this.colG.rotation.set(e0, a0 - Math.PI / 2, 0, 'YXZ'); this.colG.updateMatrixWorld(true);
    this.dirty = true;
  }
  // v13.4: kolimatör açıklığı D_c ve DUT giriş göz bebeği D_p (m): objektif, tüp, demet ve göz bebeği diski gerçek çapa ölçeklenir
  setColl(Dc, Dp) {
    if (!this.ok || !(Dc > 0)) return;
    const rc = Dc / 2, rp = Math.max(0.002, (Dp || 0) / 2), key = rc + ',' + rp; if (key === this.collKey) return; this.collKey = key;
    this.lens.scale.set(rc / 0.105, 1, rc / 0.105);
    const rt = (rc + 0.018) / 0.12; this.tube.scale.set(rt, 1, rt);
    const z1 = this.zl, z2 = 0.03; this.cbeam.scale.set(rc, z2 - z1, rc); this.cbeam.position.set(0, 0, (z1 + z2) / 2);
    this.pupDisc.scale.set(rp, rp, 1);
    this.dirty = true;
  }
  // ov: göz bebeğinin demetle örtüşen alan oranı (0–1); null → nötr renk
  setPupil(ov) {
    if (!this.ok) return;
    this.pupOv = ov;
    const c = ov == null || !isFinite(ov) ? '--info' : ov >= 0.999 ? '--ok' : ov >= 0.5 ? '--warn' : '--crit';
    if (c !== this.pupC) { this.pupC = c; this.M.pup.color = new this.T.Color(cssVar(c) || '#0ca30c'); this.dirty = true; }
  }
  theme() {
    if (!this.ok) return;
    const T = this.T;
    this.pupC = null; this.setPupil(this.pupOv);
    this.scene.background = new T.Color(cssVar('--scene') || cssVar('--surface-2') || '#f2f5f5');
    const dark = (cssVar('color-scheme') || '').includes('dark') || matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light';
    const gc = new T.Color(cssVar('--line') || '#d3dbde');
    this.grid.material.color = gc; this.grid.material.transparent = true; this.grid.material.opacity = dark ? 0.6 : 0.9;
    this.M.beam.color = new T.Color(cssVar('--beam') || '#d1452b');
    this.hemi.intensity = dark ? 0.75 : 0.95;
    this.dirty = true; this.render();
  }
  resize() {
    if (!this.ok) return;
    const w = this.host.clientWidth, hh = this.host.clientHeight; if (!w || !hh) return;
    this.renderer.setSize(w, hh, false); this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  bindOrbit() {
    const cv = this.renderer.domElement; let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; this.orb.az -= dx * 0.008; this.orb.el = clamp(this.orb.el + dy * 0.006, 0.03, 1.45); this.render(true); });
    const end = () => { drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.orb.dist = clamp(this.orb.dist * Math.exp(e.deltaY * 0.001), 1.6, 10); this.render(true); }, { passive: false });
  }
  resetView() { this.orb.az = 0.78; this.orb.el = 0.36; this.orb.dist = 5.2; this.render(true); }
  // φ, θ, ψ: taban roll/pitch/yaw (rad); a, e: mutlak gimbal açıları (rad); los: {el, xel, mag} — ışın ve halka kolimatör eksenine göre (mag kadar büyütülmüş) optik LOS hatasıyla çizilir
  // tr: hexapod üst tablasının ötelemesi (m, gövde ekseninde; gemi rüzgâr VIV'inde direk tepesi ötelemesi), gerçek ölçek
  setPose(phi, theta, psi, a, e, los, tr) {
    if (!this.ok) return;
    const T = this.T;
    this.mov.position.copy(this.pivot);
    if (tr) this.mov.position.add(new T.Vector3(tr[0], tr[2], -tr[1]));
    const cf = Math.cos(phi), sf = Math.sin(phi), ct = Math.cos(theta), st = Math.sin(theta), cp = Math.cos(psi), sp = Math.sin(psi);
    // R (gövde → lab), simülasyon çerçevesinde: Rz(ψ)·Ry(θ)·Rx(φ)
    const R = [[cp * ct, cp * st * sf - sp * cf, cp * st * cf + sp * sf], [sp * ct, sp * st * sf + cp * cf, sp * st * cf - cp * sf], [-st, ct * sf, ct * cf]];
    // three çerçevesine: C·R·Cᵀ, C: (x, y, z) → (x, z, −y)
    const Cm = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
    const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
    const Ct = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
    const M3 = mul(mul(Cm, R), Ct);
    const m4 = new T.Matrix4().set(M3[0][0], M3[0][1], M3[0][2], 0, M3[1][0], M3[1][1], M3[1][2], 0, M3[2][0], M3[2][1], M3[2][2], 0, 0, 0, 0, 1);
    this.mov.quaternion.setFromRotationMatrix(m4);
    this.az.rotation.y = a; this.el.rotation.z = e;
    this.mov.updateMatrixWorld(true);
    // bacaklar
    const up = new T.Vector3(0, 1, 0);
    for (let i = 0; i < 6; i++) {
      const b = this.bj[i], t = this.tj[(i + 5) % 6].clone().applyMatrix4(this.movIn.matrixWorld);
      const d = t.clone().sub(b), L = d.length(), g = this.legs[i];
      g.position.copy(b); g.quaternion.setFromUnitVectors(up, d.clone().normalize());
      g.userData.body.scale.y = L * 0.55; g.userData.body.position.y = L * 0.275;
      g.userData.rod.scale.y = L * 0.5; g.userData.rod.position.y = L * 0.75;
    }
    // LOS ışını ve kolimatör objektifindeki halka. Kolimatör hedefi sonsuzda gösterir: DUT'un ötelenmesi görüntüyü kaydırmaz,
    // dedektördeki konumu yalnız LOS'un kolimatör eksenine göre açısal hatası belirler. Işın bu yüzden paralel demetin, göz
    // bebeğinin nominal yanal konumundan geçen ışını olarak çizilir (eksen boyunca DUT'u izler); yönü kaydedilen optik LOS
    // hatasıdır (los.mag kadar büyütülmüş). los yoksa (ön izleme) mekanik zincirin yönü kullanılır.
    const G = this.colG, pupil = new T.Vector3(this.Lpg, 0, 0).applyMatrix4(this.el.matrixWorld), pl = G.worldToLocal(pupil.clone());
    this.pupLocal = pl;      // v13.4: göz bebeğinin kolimatör çerçevesindeki konumu (x, y: demet eksenine göre yanal kayma, m)
    let o, dl;
    if (los) {
      const m = los.mag || 1;
      o = new T.Vector3(0, 0, pl.z);
      dl = new T.Vector3(-Math.tan(clamp(m * los.xel, -1.2, 1.2)), Math.tan(clamp(m * los.el, -1.2, 1.2)), -1).normalize();
    } else { o = pl; dl = new T.Vector3(1, 0, 0).transformDirection(this.el.matrixWorld).applyQuaternion(G.quaternion.clone().invert()); }
    const toward = dl.z < -1e-3, len = clamp(toward ? (this.zl - o.z) / dl.z : 2.2, 0.2, 4), hl = o.clone().add(dl.clone().multiplyScalar(len));
    const org = G.localToWorld(o.clone()), dir = dl.clone().applyQuaternion(G.quaternion);
    this.beam.position.copy(org.clone().add(dir.clone().multiplyScalar(len / 2)));
    this.beam.quaternion.setFromUnitVectors(up, dir); this.beam.scale.y = len;
    this.hit.position.copy(G.localToWorld(hl.clone())); this.hit.quaternion.copy(G.quaternion); this.hit.visible = toward && Math.hypot(hl.x, hl.y) < 0.6;
    this.hitLocal = hl;      // kolimatör çerçevesinde (m): eksenden sapma = halkanın gösterdiği LOS hatası × uzaklık
    const mw = this.mirLocal.clone().applyMatrix4(this.el.matrixWorld), aw = G.localToWorld(this.acLocal.clone());
    const pos = this.acLine.geometry.attributes.position; pos.setXYZ(0, aw.x, aw.y, aw.z); pos.setXYZ(1, mw.x, mw.y, mw.z); pos.needsUpdate = true;
    this.dirty = true;
  }
  render(force) {
    if (!this.ok || (!this.dirty && !force)) return;
    const o = this.orb, T = this.T;
    this.camera.position.set(o.target.x + o.dist * Math.cos(o.el) * Math.sin(o.az), o.target.y + o.dist * Math.sin(o.el), o.target.z + o.dist * Math.cos(o.el) * Math.cos(o.az));
    this.camera.lookAt(o.target);
    this.renderer.render(this.scene, this.camera); this.dirty = false;
  }
}

// ---------------------------------------------------------------- oynatma verisi
function normPlay(p) {
  if (!p) return null;
  const o = Object.assign({}, p);
  for (const k of ['base_r', 'base_p', 'base_y', 'enc_a', 'enc_e', 'opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'rot', 'rot_res', 'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel', 'tr_x', 'tr_y', 'tr_z']) if (p[k] != null) o[k] = F32(p[k]);
  if (p.video) o.video = { n: p.video.n, fps: p.video.fps, t: F32(p.video.t), x: F32(p.video.x), y: F32(p.video.y), ok: U8(p.video.ok) };
  if (p.videoEis) o.videoEis = Object.assign({}, p.videoEis, { x: F32(p.videoEis.x), y: F32(p.videoEis.y) });
  if (p.psd) o.psd = { f: F32(p.psd.f), el: F32(p.psd.el), xel: F32(p.psd.xel) };
  if (p.pupil) o.pupil = Object.assign({}, p.pupil, { h: F32(p.pupil.h), v: F32(p.pupil.v), ov: F32(p.pupil.ov) });
  return o;
}
const RIG = { r3: null, play: null, t: 0, playing: false, speed: 1, last: 0, fpaMode: 'auto', eisView: !!load('eisView', false), charts: [], raf: 0, mag: 100, playKey: null, needsRun: false, running: false };
const PRE_PLAY = { on: PRE.play ? normPlay(PRE.play.on) : null, off: PRE.play ? normPlay(PRE.play.off) : null };
const PRE_PLAY_SHIP = { on: PRE.ship && PRE.ship.play ? normPlay(PRE.ship.play.on) : null, off: PRE.ship && PRE.ship.play ? normPlay(PRE.ship.play.off) : null };

function buildRig(root) {
  const stage = h('div', { class: 'stage', id: 'stage' },
    h('div', { class: 'hud', id: 'hud', hidden: load('hud', true) ? null : true }),
    h('div', { class: 'tools' },
      h('label', { class: 'btn sm', title: 'Stab AÇIK iken ışın ve halka, LOS\'un kolimatör eksenine göre açısal hatasını bu oranda büyütür. ×1 gerçek açıdır: birkaç piksellik gezinme kolimatör objektifinde milimetrenin altındadır.' }, 'LOS ×',
        h('select', { id: 'pmag', style: { border: 0, background: 'transparent', padding: 0 }, onchange: (e) => { RIG.mag = +e.target.value; drawRigFrame(); } }, [1, 100, 1000].map(v => h('option', { value: v, selected: v === RIG.mag ? true : null }, String(v))))),
      h('button', { class: 'btn sm', type: 'button', id: 'hudBtn', 'aria-pressed': load('hud', true) ? 'true' : 'false', title: 'Anlık ölçüleri göster ya da gizle', onclick: (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false'); $('#hud').hidden = !on; store('hud', on); } }, 'Ölçüler'),
      h('button', { class: 'btn sm', type: 'button', title: 'Görünümü sıfırla', onclick: () => RIG.r3 && RIG.r3.resetView(), html: ICON.reset + '<span>Görünüm</span>' })));
  const player = h('div', { class: 'player' },
    h('button', { class: 'btn sm', id: 'pp', onclick: togglePlay, html: ICON.play + '<span>Oynat</span>' }),
    h('input', { type: 'range', id: 'scrub', min: 0, max: 60, step: 0.02, value: 0, 'aria-label': 'Zaman', oninput: (e) => { RIG.t = +e.target.value; drawRigFrame(); } }),
    h('span', { class: 't', id: 'tlab' }, '0.00 / 60.00 s'),
    h('label', { class: 'xs muted', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, 'Hız',
      h('select', { id: 'spd', onchange: (e) => { RIG.speed = +e.target.value; } }, [0.25, 0.5, 1, 2, 4].map(v => h('option', { value: v, selected: v === 1 ? true : null }, v + '×')))));
  const left = h('div', { class: 'panel viewport' },
    h('header', null, h('h2', null, 'Hexapod · DUT · kolimatör'), h('span', { class: 'hint', style: { maxWidth: '80ch' } }, 'Sürükleyin: döndür · tekerlek: yakınlaş. Taban açıları ve öteleme gerçek ölçekte. Kırmızı ışın ve halka, LOS\'un kolimatör eksenine göre açısal hatasını gösterir (stab AÇIK iken seçilen oranda büyütülmüş). Kolimatör hedefi sonsuzda gösterdiği için öteleme halkayı da dedektördeki görüntüyü de kaydırmaz.')),
    stage, player);
  const fpaCv = h('canvas', { class: 'fpa', id: 'fpa', role: 'img', 'aria-label': 'Dedektör düzleminde hedef noktası, izi ve kaymanın kaynaklarını gösteren oklar' });
  const side = h('div', { class: 'rigside' },
    h('div', { class: 'panel' }, h('header', null, h('h3', { id: 'fpaTtl' }, `Dedektör (${STATE.P.wb.refChannel})`), h('div', { class: 'seg', role: 'group', 'aria-label': 'Dedektör ölçeği' },
      ['auto', 'near', 'full'].map(m => h('button', { 'aria-pressed': m === 'auto' ? 'true' : 'false', 'data-m': m,
        title: { auto: 'Koşunun tüm yolunu sığdırır (en az ±2,5 px)', near: 'Hedefi izleyen piksel büyüteci (±1,25 px, gerçek piksel sınırları)', full: 'Dedektörün tamamı' }[m], onclick: (e) => { RIG.fpaMode = m; for (const b of e.target.parentNode.children) b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false'); drawRigFrame(); } }, { auto: 'Oto', near: 'Piksel', full: 'Tam alan' }[m])))),
      h('div', { class: 'body' }, fpaCv,
        h('div', { class: 'fparow' }, h('span', { class: 'xs muted' }, 'Video'),
          h('div', { class: 'seg', id: 'feis', role: 'group', 'aria-label': 'Gösterilen video: ham ya da EIS sonrası' },
            [['raw', 'Ham'], ['eis', 'EIS sonrası']].map(([m, lab]) => h('button', { 'aria-pressed': (m === 'eis') === RIG.eisView ? 'true' : 'false', 'data-e': m,
              onclick: (e) => { RIG.eisView = m === 'eis'; store('eisView', RIG.eisView); for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); drawRigFrame(); } }, lab))),
          h('span', { class: 'xs muted', id: 'feisInfo' })),
        h('div', { class: 'fpaleg', id: 'fpaLeg', hidden: true }), h('div', { class: 'xs muted', id: 'fpaNote', style: { marginTop: '6px' } }))),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Bu koşunun metrikleri')), h('div', { class: 'body', id: 'pmet' })));
  const bar = h('div', { class: 'panel' }, h('div', { class: 'rigbar' },
    h('label', { class: 'fld' }, 'Uyarım', h('select', { id: 'pk' }, Object.entries(ENG.PLAY_KINDS).map(([k, v]) => h('option', { value: k }, v)))),
    h('div', { class: 'fld', role: 'group', 'aria-label': 'Stabilizasyon' }, 'Stabilizasyon', h('div', { class: 'seg', id: 'pstab' }, h('button', { type: 'button', 'aria-pressed': 'true', 'data-v': '1', onclick: segPick }, 'AÇIK'), h('button', { type: 'button', 'aria-pressed': 'false', 'data-v': '0', onclick: segPick }, 'KAPALI'))),
    h('div', { class: 'fld', id: 'pvivLbl', role: 'group' }, 'VIV etkisi',
      h('div', { class: 'seg', id: 'pviv' }, h('button', { type: 'button', 'aria-pressed': 'true', 'data-v': '1', onclick: vivPick }, 'AÇIK'), h('button', { type: 'button', 'aria-pressed': 'false', 'data-v': '0', onclick: vivPick }, 'KAPALI'))),
    h('label', { class: 'fld' }, 'Genlik ölçeği', h('select', { id: 'pscale' }, [0.5, 1, 1.5, 2].map(v => h('option', { value: v, selected: v === 1 ? true : null }, '×' + v)))),
    h('label', { class: 'fld' }, 'Süre', h('select', { id: 'pdur' }, [30, 60, 120].map(v => h('option', { value: v, selected: v === 60 ? true : null }, v + ' s')))),
    h('button', { class: 'btn primary', id: 'prun', type: 'button', onclick: runPlay, html: ICON.play + '<span>Koştur</span>' }),
    h('div', { class: 'st', id: 'pstat' }, 'Gösterilen: varsayılan deniz profili, stab AÇIK (önceden hesaplandı).')));
  root.append(scrHead('Düzenek', 'Hexapod, DUT ve kolimatörün 3B oynatması: senaryoyu seçip koşturun, zaman çizgisinde gezinin; dedektör görüntüsü ve bu koşunun metrikleri yan panellerde.', null),
    bar, h('div', { class: 'rig' }, h('div', { class: 'rigmain' }, left, h('div', { class: 'rigcharts' }, h('div', { class: 'chartbox', id: 'rc1' }), h('div', { class: 'chartbox', id: 'rc2' }), h('div', { class: 'chartbox', id: 'rc3' }))), side));
  RIG.r3 = new Rig3D(stage);
  RIG.fpa = fpaCv;
  new ResizeObserver(() => drawFPA()).observe(fpaCv);
  syncVivSeg();
  const shipDef = curKey() === SHIP_KEY && PRE_PLAY_SHIP.on;
  setPlay(shipDef ? PRE_PLAY_SHIP.on : PRE_PLAY.on, `Gösterilen: ${shipDef ? 'gemi direği' : 'denizaltı mastı'} varsayılan deniz profili, stab AÇIK (önceden hesaplandı).`, shipDef ? SHIP_KEY : DEF_KEY);
}
function segPick(e) { const b = e.currentTarget; for (const x of b.parentNode.children) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); e.preventDefault(); }
// VIV etkisi: etkin platformun VIV anahtarı (denizaltı: wb.viv.on — hidrodinamik; gemi: wb.wviv.on — rüzgâr). Model'deki
// anahtarla aynı parametredir; değişince parametre değişikliği zinciri (bayat sonuçlar, düzenek yeniden koşusu) işler
const vivPath = () => isShipP(STATE.P) ? 'wb.wviv.on' : 'wb.viv.on';
function vivPick(e) {
  e.preventDefault();
  const on = e.currentTarget.getAttribute('data-v') === '1', p = vivPath();
  if ((getPath(STATE.P, p) !== false) === on) return;
  setParam(p, on); renderParams(); syncVivSeg();
}
function syncVivSeg() {
  const g = $('#pviv'); if (!g) return; const on = getPath(STATE.P, vivPath()) !== false;
  for (const b of g.children) b.setAttribute('aria-pressed', (b.getAttribute('data-v') === '1') === on ? 'true' : 'false');
  const lb = $('#pvivLbl'); if (lb) { const ship = isShipP(STATE.P); lb.firstChild.textContent = ship ? 'Rüzgâr VIV etkisi' : 'VIV etkisi';
    lb.title = ship ? 'Gemi direği: rüzgârın girdap kopması direk modunu f_n\'de kilitler; direktör tabanı açısal salınım ve öteleme görür (EN 1991-1-4 Ek E). Model ekranındaki "Rüzgâr VIV etkisi" ile aynı ayardır.'
      : 'Denizaltı mastı: su içinde ilerleyen mastta girdap kopması (VIV) mastı f_n\'de titreştirir. Model ekranındaki "Hidrodinamik VIV etkisi" ile aynı ayardır ve bütün sayfayı etkiler.'; }
}
function setPlay(p, note, key) {
  RIG.play = p; RIG.t = 0; RIG.playKey = key || DEF_KEY;
  if (!p) return;
  const sc = $('#scrub'); sc.max = (p.n / p.fs).toFixed(2); sc.value = 0;
  if (note) $('#pstat').textContent = note;
  const ft = $('#fpaTtl'); if (ft) ft.textContent = `Dedektör (${STATE.P.wb.refChannel})`;
  const n = p.n, t = new Float32Array(n); for (let i = 0; i < n; i++) t[i] = i / p.fs;
  const deg = (a) => Float32Array.from(a, v => v * R2D), ur = (a) => Float32Array.from(a, v => v * 1e6);
  const c1 = { title: 'Hexapod üst tabla açıları (komut ölçeğinde, gerçek)', xLabel: 's', yLabel: '°', yUnit: '°', height: 210,
    series: [{ name: 'roll', x: t, y: deg(p.base_r) }, { name: 'pitch', x: t, y: deg(p.base_p) }, { name: 'yaw', x: t, y: deg(p.base_y) }] };
  const c2 = { title: 'Gerçek optik LOS hatası, kolimatöre göre (20 ms ortalama, trend çıkarılmadan)', xLabel: 's', yLabel: 'µrad', yUnit: 'µrad', height: 210,
    series: [{ name: 'el', x: t, y: ur(p.opt_el) }, { name: 'xel', x: t, y: ur(p.opt_xel) }] };
  if (!RIG.charts.length) { RIG.charts = [new Chart($('#rc1'), c1), new Chart($('#rc2'), c2)]; }
  else { RIG.charts[0].set(c1); RIG.charts[1].set(c2); }
  // LOS spektrumu (zaman imleci yok): VIV çizgisi f_v'de, dikey kesikli işaretle
  if (p.psd) {
    const vv = p.metrics.viv, fv = vv ? vv.f : null;
    const c3 = { title: 'LOS hatası spektrumu (genlik spektral yoğunluğu, trend çıkarılmış)', xLabel: 'Hz', yLabel: 'µrad/√Hz', yUnit: 'µrad/√Hz', xLog: true, yLog: true, height: 210,
      series: [{ name: 'el', x: p.psd.f, y: p.psd.el }, { name: 'xel', x: p.psd.f, y: p.psd.xel }],
      vLines: fv ? [{ x: fv, label: vv.kind === 'wind' ? `f_n ${fmt(fv, 1)} Hz (rüzgâr VIV${vv.present ? '' : ' yok'})` : `f_v ${fmt(fv, 1)} Hz${vv.present ? '' : ' (VIV yok)'}` }] : [] };
    if (!RIG.psdChart) RIG.psdChart = new Chart($('#rc3'), c3); else RIG.psdChart.set(c3);
  }
  renderPlayMetrics();
  drawRigFrame();
}
function renderPlayMetrics() {
  const p = RIG.play, box = $('#pmet'); if (!p || !box) return;
  const m = p.metrics, hx = STATE.P.wb.hex, d = ENG.derive(STATE.P);
  const row = (k, v, ok) => h('tr', null, h('td', null, k), h('td', { class: 'n' + (ok === false ? ' over' : '') }, v));
  box.innerHTML = '';
  const E = p.earth || null;
  // kayma ayrışımı: simülasyonun bildiği kaynak katkılarının aynı penceredeki eğimi (dedektör panelindeki oklar)
  const dr = m.drift, sub = (k, v) => h('tr', null, h('td', { class: 'sub' }, k), h('td', { class: 'n' }, v));
  const ur2 = (a, b) => `${fmt(a * 1e6, 2)} / ${fmt(b * 1e6, 2)} µrad/s`;
  const driftRows = (E && dr) ? [
    sub(E.comp ? 'dünya dönüşü artığı (Ω·δ)' : 'dünya dönüşü (kompanzasyonsuz)', ur2(dr.earthEl, dr.earthXel)),
    sub('gyro bias\'ı (sabit + kararsızlık)', ur2(dr.biasEl, dr.biasXel)),
    sub('kalan: ARW, uyarım artığı, diğer', ur2(dr.restEl, dr.restXel))] : [];
  const earthRows = (E && p.stab) ? [
    h('tr', null, h('td', null, 'Dünya dönüşü kompanzasyonu'), h('td', { class: 'w' }, E.comp ? 'AÇIK (artık ≤ Ω·δ)' : 'KAPALI — eylemsiz LOS laboratuvara göre kayar')),
    row('LOS kayma hızı el / xel (eğim)', `${fmt(m.slopeEl * 1e6, 2)} / ${fmt(m.slopeXel * 1e6, 2)} µrad/s`, E.comp ? Math.max(Math.abs(m.slopeEl), Math.abs(m.slopeXel)) <= 1.2 * Math.max(E.expH, E.expV) + 0.3e-6 : null),
    driftRows,
    row(E.comp ? 'Beklenen artık hız (Ω·δ, eksen başına üst sınır)' : 'Beklenen hız yatay / düşey (Model → Dünya dönüşü)', E.comp ? `≤ ${fmt(E.expH * 1e6, 2)} µrad/s` : `${fmt(E.expH * 1e6, 1)} / ${fmt(E.expV * 1e6, 1)} µrad/s`),
    row('Hedefin alanı terk süresi (hesap)', isFinite(E.exit) && E.exit < 1e8 ? fmt(E.exit, 0) + ' s' : '—', E.exit > p.T)] : [];
  box.append(h('table', { class: 'mtab' }, h('tbody', null,
    h('tr', null, h('td', null, 'Senaryo'), h('td', { class: 'w' }, `${p.label}${p.scale !== 1 && p.kind !== 'still' ? ' ×' + p.scale : ''}${p.kind === 'slap' && p.scale > 1 ? ' (darbe genliği hexapod sınırından seçilir; ×1\'in üstü uygulanmaz)' : ''} · stab ${p.stab ? 'AÇIK' : 'KAPALI'}`)),
    earthRows,
    // v13.14: RMS satırı wander gereksinimiyle işaretleniyordu (farklı ölçüt); wander gereksinimi T_w penceresinde tanımlıdır ve
    // oynatmanın penceresi kayıt süresiyle sınırlıdır — iki satır da bilgi amaçlıdır, kabul T1.3 / T1.9'dadır
    row('LOS RMS el / xel (trend çıkarılmış)', `${fu(m.rmsEl, 2)} / ${fu(m.rmsXel, 2)} µrad`),
    row('P99 el / xel (radyal)', `${fu(m.p99El, 1)} / ${fu(m.p99Xel, 1)} µrad${isFinite(m.p99R) ? ` (${fu(m.p99R, 1)})` : ''}`, p.stab ? Math.max(m.p99El, m.p99Xel) <= d.req.p99 : null),
    row(`Wander el / xel (${isFinite(m.Tw) ? fmt(m.Tw, 0) + ' s pencere, ' : ''}kare ortalaması, ölçüm gürültüsüz)`, `${fu(m.wanderEl, 2)} / ${fu(m.wanderXel, 2)} µrad`),
    m.eis ? row(`EIS etkisi — wander el, ölçülen video (${fmt(m.eis.Tw, 0)} s pencere): ham → EIS`, `${fu(m.eis.rawEl, 2)} → ${fu(m.eis.eisEl, 2)} µrad`) : null,
    m.eis ? row('EIS etkisi — wander xel: ham → EIS', `${fu(m.eis.rawXel, 2)} → ${fu(m.eis.eisXel, 2)} µrad`) : null,
    m.eis && isFinite(m.eis.filtEl) ? row('EIS etkisi — yalnız süzme (registrasyon artığı 0) el / xel', `${fu(m.eis.filtEl, 2)} / ${fu(m.eis.filtXel, 2)} µrad`) : null,
    m.viv && m.viv.kind !== 'wind' ? (() => { const v = m.viv, mx = v.lin ? Math.max(v.los, v.losXel) : v.los;
      return row(`VIV (kilitlenmede f_n = ${fmt(v.f, 2)} Hz): taban → LOS el${v.lin ? ' / xel' : ''}`, v.present
        ? `${fu(v.base, 0)} → ${fu(v.los, 2)}${v.lin ? ' / ' + fu(v.losXel, 2) : ''} µrad RMS (${fmt(20 * Math.log10(mx / v.base), 1)} dB)` + (v.limited ? ' — taban genliği hexapod erişimiyle küçültüldü' : '')
        : `VIV yok (${v.on ? 'işletme hız zarfında kilitlenme yok' : 'VIV etkisi kapalı'}); LOS'ta f_n bileşeni ${fu(v.los, 2)} µrad`, v.present && p.stab ? mx * 1e6 <= ENG.budgetAlloc(STATE.P)['B2-01'] : null); })() : null,
    m.viv && m.viv.kind === 'wind' ? (() => { const v = m.viv, mx = Math.max(v.los, v.losXel);
      return row(`Rüzgâr VIV (f_n = ${fmt(v.f, 2)} Hz): taban θ → LOS el / xel`, v.present
        ? `${fu(v.base, 0)} → ${fu(v.los, 2)} / ${fu(v.losXel, 2)} µrad RMS (${fmt(20 * Math.log10(mx / v.base), 1)} dB)`
        : `VIV yok (${v.on ? 'işletme zarfında kilitlenme yok' : 'rüzgâr VIV etkisi kapalı'}); LOS'ta f_n bileşeni el ${fu(v.los, 2)} / xel ${fu(v.losXel, 2)} µrad`, v.present && p.stab ? mx * 1e6 <= ENG.budgetAlloc(STATE.P)['B2-01'] : null); })() : null,
    m.viv && m.viv.present && m.viv.lin ? row(m.viv.kind === 'wind' ? 'Direk tepesi ötelemesi (hexapod, açıyla aynı fazda)' : 'Mast başı ötelemesi (hexapod, açıyla aynı fazda)', `±${fmt(m.viv.y * 1e3, m.viv.kind === 'wind' ? 1 : 2)} mm, ivme ${fmt(m.viv.acc, 2)} m/s²` + (m.viv.limited ? ' — hexapod sınırıyla küçültüldü' : '')) : null,
    p.seaQ ? row(`Deniz ötelemesi (${[STATE.P.wb.sea.mode === '6dof' ? '6-DOF ağırlık merkezi' : null, ENG.seaDOF(STATE.P).rOn ? 'kaldıraç kolu ' + armTxt(STATE.P) : null].filter(Boolean).join(' + ') || 'deniz'}), hexapod`, `talep ±${fmt(p.seaQ.demand, 3)} m → strokla ±${fmt(p.seaQ.demand * p.seaQ.q * 1e3, 0)} mm (q = ${fmt(p.seaQ.q, 3)})` + (p.seaQ.qc != null && p.seaQ.qc < 1 - 1e-9 ? ` → kolimatör demetine sığdırma ×${fmt(p.seaQ.qc, 3)}: ±${fmt(p.seaQ.demand * p.seaQ.q * p.seaQ.qc * 1e3, 0)} mm` : '') + `; eksik ivme T2.5'te ivme eşdeğeriyle ölçülür`) : null,
    row('Jitter MTF @ Nyquist el / xel', `${fmt(m.mtfEl, 3)} / ${fmt(m.mtfXel, 3)}`),
    row('Hedefin FOV\'da kaldığı kare', fmt(100 * m.validFrac, 1) + ' %', m.validFrac > 0.999),
    // v13.2: sınıra en yakın eksen (ör. yandan rüzgârda pitch); önceden yalnız roll gösteriliyordu
    (() => { const rt = (b) => Math.max(b.th / hx.theta_max, b.om / hx.omega_max, b.al / hx.alpha_max), k = [0, 1, 2].reduce((a, i) => rt(m.base[i]) > rt(m.base[a]) ? i : a, 0), b = m.base[k];
      const jump = b.cmd && b.cmd.al > 3 * Math.max(b.al, 1e-9) && b.cmd.al > hx.alpha_max;      // v13.14: komutta hız sıçraması (yarım sinüs açı darbesi)
      return row(`Hexapod tepe θ / ω / α (${['roll', 'pitch', 'yaw'][k]}, sınıra en yakın eksen${b.cmd ? `; gerçekleşen, hexapod dinamiği ${fmt(b.fbw, 0)} Hz` : ''})`, `${fmt(b.th, 2)}° / ${fmt(b.om, 2)}°/s / ${fmt(b.al, 1)}°/s²` +
        (jump ? ' — komutta hız sıçraması var (yarım sinüs açı darbesi: başta ve sonda ω sıçrar, komutun ivmesi tanımsız)' : ''), b.th <= hx.theta_max && b.om <= hx.omega_max && b.al <= hx.alpha_max); })(),
    // v13.4: göz bebeğinin kolimatör demetine göre yanal kayması (gerçekleşen taban duruşu ve ötelemesinden; Model → Hexapod ve kolimatör)
    m.pupil ? row(`Göz bebeği ↔ kolimatör demeti (D_c ${fmt(m.pupil.Dc * 1e3, 0)} mm, D_p ${fmt(m.pupil.Dp * 1e3, 0)} mm, k = ${m.pupil.k})`,
      `en büyük yanal kayma ${fmt(m.pupil.eMax * 1e3, 1)} mm (sınır ${fmt(m.pupil.eFree * 1e3, 1)} mm) · en düşük örtüşme %${ENG.pctFine(m.pupil.ovMin)} · vinyetleme süresi %${ENG.pctFine(m.pupil.fVig)}` +
      (m.pupil.ok ? '' : ` → gerekli D_c ${fmt(m.pupil.req * 1e3, 0)} mm${m.pupil.ovMin < 1 - 1e-9 ? ' (gerçek vinyetleme: testte GEÇERSİZ)' : ''}`) +
      (m.pupil.qc != null && m.pupil.qc < 1 - 1e-9 ? ` · deniz ötelemesi kolimatöre sığdırıldı (×${fmt(m.pupil.qc, 3)})` : '') +
      (m.pupil.par ? ` · paralaks (δ = ${fmt(m.pupil.par.delta_um, 0)} µm): tepe ${fmt(m.pupil.par.pk * 1e6, 2)} µrad, RMS yatay / düşey ${fmt(m.pupil.par.rmsH * 1e6, 2)} / ${fmt(m.pupil.par.rmsV * 1e6, 2)} µrad` : ''), m.pupil.ok) : null,
    row('Gimbal bağıl hız tepe (el / az)', `${fmt(m.maxRelE * R2D, 2)} / ${fmt(m.maxRelA * R2D, 2)} °/s`),
    row('Motor doygunluğu', m.sat ? m.sat + ' adım' : 'yok', !m.sat))));
  box.append(h('p', { class: 'xs muted', style: { margin: '8px 0 0' } }, `Gereksinim: wander ≤ ${fmt(d.req.wander * 1e6, 1)} µrad (${STATE.P.ana.Tw} s pencere), P99 ≤ ${fmt(d.req.p99 * 1e6, 1)} µrad (Model → Referans kanal ve gereksinimler). Oynatmanın wander penceresi kayıt süresiyle sınırlı olduğu için RMS ve wander satırları bilgi amaçlıdır; kabul T1.3 ve T1.9'dadır. Hexapod sınırları ${hx.theta_max}° / ${hx.omega_max}°/s / ${hx.alpha_max}°/s².`));
}
async function runPlay(auto) {
  if (RIG.running) { RIG.needsRun = true; return; }
  RIG.needsRun = false;
  const opt = { kind: $('#pk').value, stab: $('#pstab button[aria-pressed="true"]').getAttribute('data-v') === '1', scale: +$('#pscale').value, T: +$('#pdur').value };
  const isDefSea = opt.kind === 'sea' && opt.scale === 1 && opt.T === 60, ck = curKey();
  const PP = ck === DEF_KEY ? PRE_PLAY : (ck === SHIP_KEY ? PRE_PLAY_SHIP : null);
  if (isDefSea && PP && PP.on) { setPlay(opt.stab ? PP.on : PP.off, `Gösterilen: ${ck === SHIP_KEY ? 'gemi direği' : 'denizaltı mastı'} varsayılan deniz profili, stab ${opt.stab ? 'AÇIK' : 'KAPALI'} (önceden hesaplandı).`, ck); return; }
  const btn = $('#prun'); btn.disabled = true; RIG.running = true; $('#pstat').textContent = (auto === true ? 'Parametreler değişti, yeniden koşuluyor… %0' : 'Koşuyor… %0');
  const P = JSON.parse(JSON.stringify(STATE.P)), key = pKey(P);
  try {
    let res;
    if (PLAYPOOL.broken) { await new Promise(r => setTimeout(r, 30)); res = ENG.playScenario(P, opt, null); }
    else res = (await PLAYPOOL.run({ cmd: 'play', P, opt }, (m) => { if (m.type === 'prog') $('#pstat').textContent = 'Koşuyor… %' + Math.round(100 * m.p); })).play;
    const shipP = isShipP(P), vOn = shipP ? P.wb.wviv.on !== false : P.wb.viv.on !== false;
    setPlay(normPlay(res), `Gösterilen: ${shipP ? 'gemi direği' : 'denizaltı mastı'} · ${ENG.PLAY_KINDS[opt.kind]}, ×${opt.scale}, ${opt.T} s, stab ${opt.stab ? 'AÇIK' : 'KAPALI'}, ${shipP ? 'rüzgâr VIV' : 'VIV'} etkisi ${vOn ? 'açık' : 'kapalı'}, dünya dönüşü kompanzasyonu ${P.wb.earth.comp ? 'açık' : 'kapalı'} — ${nowHM()} koşusu${key !== DEF_KEY && key !== SHIP_KEY ? ' (özel parametreler)' : ''}.`, key);
    if (!RIG.playing && STATE.tab === 'duzenek') togglePlay();
  } catch (e) { $('#pstat').textContent = 'Koşu başarısız: ' + (e.message || e); }
  finally { btn.disabled = false; RIG.running = false; if (RIG.needsRun && STATE.tab === 'duzenek') runPlay(true); }
}
function rigParamsChanged() {     // parametre değişince düzenek koşusu bayatlar: görünürse hemen, değilse ekrana dönüldüğünde yeniden koşulur
  syncVivSeg();
  if (!RIG.play) return;
  if (RIG.playKey === curKey()) return;
  if (STATE.tab === 'duzenek') runPlay(true); else RIG.needsRun = true;
}
function togglePlay() {
  RIG.playing = !RIG.playing;
  const b = $('#pp'); b.innerHTML = (RIG.playing ? ICON.pause + '<span>Durdur</span>' : ICON.play + '<span>Oynat</span>');
  if (RIG.playing) { const p = RIG.play; if (p && RIG.t >= p.n / p.fs - 0.05) RIG.t = 0; RIG.last = performance.now(); RIG.raf = requestAnimationFrame(tick); }
  else cancelAnimationFrame(RIG.raf);
}
function tick(now) {
  if (!RIG.playing) return;
  const p = RIG.play; const dt = Math.min(0.1, (now - RIG.last) / 1000); RIG.last = now;
  if (p) { RIG.t += dt * RIG.speed; const Tm = p.n / p.fs; if (RIG.t >= Tm) { RIG.t = Tm; RIG.playing = false; $('#pp').innerHTML = ICON.play + '<span>Oynat</span>'; } }
  drawRigFrame();
  if (RIG.playing && STATE.tab === 'duzenek') RIG.raf = requestAnimationFrame(tick); else if (RIG.playing) RIG.playing = false, $('#pp').innerHTML = ICON.play + '<span>Oynat</span>';
}
function drawRigFrame() {
  const p = RIG.play; if (!p) return;
  const Tm = p.n / p.fs, t = clamp(RIG.t, 0, Tm), i = clamp(Math.round(t * p.fs), 0, p.n - 1);
  const sc = $('#scrub'); if (sc && Math.abs(+sc.value - t) > 0.01) sc.value = t.toFixed(2);
  $('#tlab').textContent = `${t.toFixed(2)} / ${Tm.toFixed(2)} s`;
  const a = p.geom.a0 + (p.stab ? p.enc_a[i] : 0), e = p.geom.e0 + (p.stab ? p.enc_e[i] : 0);
  const tr = p.tr_x ? [p.tr_x[i], p.tr_y[i], p.tr_z[i]] : null;
  const mag = p.stab ? RIG.mag : 1;     // stab KAPALI'da hata derece mertebesindedir: büyütülmez
  const pu = p.pupil || null;
  if (RIG.r3 && RIG.r3.ok) { RIG.r3.setGeom(p.geom.a0, p.geom.e0, p.geom.Lpg); if (pu) RIG.r3.setColl(pu.Dc, pu.Dp); RIG.r3.setPupil(pu ? pu.ov[Math.min(i, pu.ov.length - 1)] : null); RIG.r3.setPose(p.base_r[i], p.base_p[i], p.base_y[i], a, e, p.opt_el ? { el: p.opt_el[i], xel: p.opt_xel[i], mag } : null, tr); RIG.r3.render(); }
  const Dc = RIG.r3 && RIG.r3.ok ? Math.abs(RIG.r3.zl) : 2.23;
  const hud = $('#hud');
  if (hud) hud.innerHTML = `<div class="row"><span>t</span><b>${t.toFixed(2)} s</b></div>` +
    `<div class="row"><span>roll / pitch / yaw</span><b>${fmt(p.base_r[i] * R2D, 2)}° ${fmt(p.base_p[i] * R2D, 2)}° ${fmt(p.base_y[i] * R2D, 2)}°</b></div>` +
    (tr ? `<div class="row"><span>öteleme x / y / z (hexapod)</span><b>${fmt(tr[0] * 1e3, 1)} ${fmt(tr[1] * 1e3, 1)} ${fmt(tr[2] * 1e3, 1)} mm</b></div>` : '') +
    (pu ? (() => { const j = Math.min(i, pu.ov.length - 1); return `<div class="row"><span>göz bebeği kayması yatay / düşey · demet örtüşmesi</span><b>${fmt(pu.h[j] * 1e3, 1)} ${fmt(pu.v[j] * 1e3, 1)} mm · %${fmt(100 * pu.ov[j], 1)}</b></div>`; })() : '') +
    `<div class="row"><span>gimbal az / el</span><b>${fmt(a * R2D, 3)}° ${fmt(e * R2D, 3)}°</b></div>` +
    `<div class="row"><span>LOS hatası el / xel</span><b>${fmtLos(p.opt_el[i])} ${fmtLos(p.opt_xel[i])}</b></div>` +
    `<div class="row"><span>stabilizasyon</span><b>${p.stab ? 'AÇIK' : 'KAPALI'}</b></div>` +
    (p.earth ? `<div class="row"><span>dünya dönüşü komp.</span><b>${p.earth.comp ? 'AÇIK' : 'KAPALI'}</b></div>` : '') +
    `<div class="row"><span>3B halka (kolimatör objektifi)</span><b>LOS hatası ×${mag} · 1 px ≙ ${fmt(p.geom.IFOV * mag * Dc * 1e3, mag >= 100 ? 1 : 3)} mm</b></div>`;
  for (const c of RIG.charts) c.setCursor(t);
  drawFPA();
}
function fmtLos(v) { const a = Math.abs(v); return a >= 1e-3 ? (v * R2D).toFixed(3) + '°' : (v * 1e6).toFixed(1) + ' µrad'; }
function drawFPA() {
  const cv = RIG.fpa, p = RIG.play; if (!cv || !p) return;
  const W = cv.clientWidth; if (!W) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const C = { bg: cssVar('--surface-2'), grid: cssVar('--line'), ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'), acc: cssVar('--accent'), beam: cssVar('--beam'), crit: cssVar('--crit'),
    dE: cssVar('--drift-earth'), dB: cssVar('--drift-gyro') };
  g.fillStyle = C.bg; g.fillRect(0, 0, W, W);
  const V = p.video, fps = V.fps, t = clamp(RIG.t, 0, p.n / p.fs), k = clamp(Math.round(t * fps), 0, V.n - 1);
  const Nh = p.geom.Nh, Nv = p.geom.Nv, IF = p.geom.IFOV * 1e6;
  // ölçek: tüm koşunun geçerli karelerinin kapsamına göre
  if (!p._ext) { let m = 0; for (let j = 0; j < V.n; j++) if (V.ok[j]) m = Math.max(m, Math.abs(V.x[j]), Math.abs(V.y[j])); p._ext = m; }
  // gösterilen video: ham ya da EIS sonrası (aynı ölçek; EIS görüntüyü kaydırır, fiziksel LOS'u değil)
  const VE = RIG.eisView && p.videoEis ? p.videoEis : null, VX = VE ? VE.x : V.x, VY = VE ? VE.y : V.y;
  const ok = V.ok[k], xs = VX[k], ys = VY[k], xr = V.x[k], yr = V.y[k];
  // yerel ortalama: son 0,5 s'nin geçerli kareleri — büyütecin merkezi ve P99 çemberinin merkezi (P99 trendi
  // çıkarılmış titreşimin istatistiğidir; kayan hedefle birlikte taşınır)
  let lmx = 0, lmy = 0; { let c = 0; for (let j = Math.max(0, k - Math.round(0.5 * fps)); j <= k; j++) if (V.ok[j]) { lmx += VX[j]; lmy += VY[j]; c++; } if (c) { lmx /= c; lmy /= c; } }
  // Oto: koşunun tüm yolunu sığdırır (en az ±2,5 px); Piksel: hedefi izleyen büyüteç (±1,25 px, gerçek piksel
  // sınırlarıyla); Tam alan: dedektörün tamamı. Büyüteç yerel ortalamaya ortalanır, hızlı harekette (darbe, stab
  // KAPALI) hedef pencerenin %70'inden dışarı çıkmayacak biçimde kaydırılır.
  const loupe = RIG.fpaMode === 'near', full = Math.max(Nh, Nv) / 2 * 1.08;
  const half = loupe ? 1.25 : (RIG.fpaMode === 'full' ? full : clamp(p._ext * 1.3, 2.5, full));
  const mrg = 0.7 * half;
  const c0x = loupe ? (ok ? clamp(lmx, xs - mrg, xs + mrg) : lmx) : 0, c0y = loupe ? (ok ? clamp(lmy, ys - mrg, ys + mrg) : lmy) : 0;
  const S = W / (2 * half), cx = W / 2, cy = W / 2;
  // dik ekran görüntüsü: LOS yukarı (+el) / sola (+xel, iskele) dönünce sabit hedef aşağı / sağa kayar → +xel sağa, +el aşağı.
  // 3B'deki halka (LOS'un hedef düzleminde gösterdiği nokta, DUT'un arkasından bakış) bu izin 180° döndürülmüşüdür.
  const X = (x) => cx + (x - c0x) * S, Y = (y) => cy + (y - c0y) * S;
  const vd = STATE.P.dut.video, x0f = vd.x0 - Math.floor(vd.x0), y0f = vd.y0 - Math.floor(vd.y0);
  g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath();
  if (half <= 10) {   // gerçek piksel sınırları (boresight piksel içinde x0, y0 kadar kaymış)
    for (let q = Math.floor(c0x - half - 1); q <= Math.ceil(c0x + half + 1); q++) { const xb = q + 0.5 - x0f; g.moveTo(Math.round(X(xb)) + .5, 0); g.lineTo(Math.round(X(xb)) + .5, W); }
    for (let q = Math.floor(c0y - half - 1); q <= Math.ceil(c0y + half + 1); q++) { const yb = q + 0.5 - y0f; g.moveTo(0, Math.round(Y(yb)) + .5); g.lineTo(W, Math.round(Y(yb)) + .5); }
  } else {
    const st = niceStep(2 * half, 6);
    for (let q = Math.ceil(-half / st) * st; q <= half; q += st) { g.moveTo(Math.round(X(q)) + .5, 0); g.lineTo(Math.round(X(q)) + .5, W); g.moveTo(0, Math.round(Y(q)) + .5); g.lineTo(W, Math.round(Y(q)) + .5); }
  }
  g.stroke();
  if (half > Math.min(Nh, Nv) / 2 * 0.5) {
    g.strokeStyle = C.muted; g.lineWidth = 1.2; g.strokeRect(X(-Nh / 2), Y(-Nv / 2), Nh * S, Nv * S);
    g.fillStyle = C.muted; g.font = '11px "IBM Plex Sans", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(`dedektör ${Nh} × ${Nv} px`, X(-Nh / 2) + 4, Y(-Nv / 2) + 4);
  }
  // koşunun başından bu yana tüm yol (soluk)
  g.strokeStyle = C.muted; g.globalAlpha = 0.45; g.lineWidth = 1; g.beginPath(); let pen = false;
  for (let j = 0; j <= Math.min(V.n - 1, Math.round(t * fps)); j++) { if (!V.ok[j]) { pen = false; continue; } const xx = X(VX[j]), yy = Y(VY[j]); if (!pen) { g.moveTo(xx, yy); pen = true; } else g.lineTo(xx, yy); }
  g.stroke(); g.globalAlpha = 1;
  // nişangâh: boresight (büyüteçte görüntünün dışında kalabilir)
  const bx0 = X(0), by0 = Y(0);
  g.strokeStyle = C.muted; g.lineWidth = 1; g.beginPath(); g.moveTo(bx0 - 14, by0); g.lineTo(bx0 - 4, by0); g.moveTo(bx0 + 4, by0); g.lineTo(bx0 + 14, by0); g.moveTo(bx0, by0 - 14); g.lineTo(bx0, by0 - 4); g.moveTo(bx0, by0 + 4); g.lineTo(bx0, by0 + 14); g.stroke();
  // P99 çemberi (yalnız ham görünümde: fiziksel LOS'un trendi çıkarılmış istatistiği), yerel ortalamada
  if (!VE && p.stab && half <= 10 && isFinite(p.metrics.p99El)) { const r = (isFinite(p.metrics.p99R) ? p.metrics.p99R : Math.max(p.metrics.p99El, p.metrics.p99Xel)) * 1e6 / IF * S;      /* v13.14: radyal P99 */ g.setLineDash([4, 4]); g.strokeStyle = C.muted; g.beginPath(); g.arc(X(lmx), Y(lmy), r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  if (ok) {   // hedef görüntüsü: ≈ 1,3 px FWHM (iğne deliği 0,83 IFOV + kırınım)
    const rr = Math.max(3, 0.55 * S), gx = X(xs), gy = Y(ys);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr); gr.addColorStop(0, 'rgba(255,246,220,0.95)'); gr.addColorStop(0.45, 'rgba(255,176,74,0.75)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, rr, 0, Math.PI * 2); g.fill();
  }
  // iz (son 2 s), hedefin üstünde
  const n0 = Math.max(0, k - 2 * fps);
  g.lineWidth = 1.6; g.lineJoin = 'round';
  for (let j = n0 + 1; j <= k; j++) {
    if (!V.ok[j] || !V.ok[j - 1]) continue;
    g.globalAlpha = 0.12 + 0.88 * (j - n0) / (k - n0 + 1); g.strokeStyle = C.acc; g.beginPath(); g.moveTo(X(VX[j - 1]), Y(VY[j - 1])); g.lineTo(X(VX[j]), Y(VY[j])); g.stroke();
  }
  g.globalAlpha = 1;
  // EIS görünümünde ham konum: halka; ham → EIS düzeltmesi noktalı çizgi
  if (VE && ok) {
    g.save(); g.strokeStyle = C.ink2; g.lineWidth = 1.2;
    if (Math.hypot(X(xr) - X(xs), Y(yr) - Y(ys)) >= 6) { g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(xr), Y(yr)); g.lineTo(X(xs), Y(ys)); g.stroke(); g.setLineDash([]); }
    g.beginPath(); g.arc(X(xr), Y(yr), 4.5, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  // kaymanın kaynakları (stab AÇIK, ham görünüm): dünya dönüşü artığı ve gyro bias'ının koşu başından bu kareye LOS'a
  // biriktirdiği açı, uç uca; izin üstünde, hedef noktasının altında. Ok ucundan hedefe noktalı çizgi: kalan.
  // Büyüteçte oklar çizilmez (boresight'tan başlarlar, pencerenin dışında kalırlar); değerler lejantta kalır.
  const DRv = VE ? null : driftAt(p, t), DR = loupe ? null : DRv;
  if (DR) {
    const IFt = p.geom.IFOVt || p.geom.IFOV;
    const ex = DR.eX / IFt, ey = DR.eY / IFt, bx = ex + DR.bX / IFt, by = ey + DR.bY / IFt;
    const av = ok ? [X(xs), Y(ys)] : null;     // etiketler hedef kümesinden uzak tarafa
    if (ok && Math.hypot(X(xs) - X(bx), Y(ys) - Y(by)) >= 6) {
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = C.ink2; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(bx), Y(by)); g.lineTo(X(xs), Y(ys)); g.stroke(); g.restore();
    }
    drawArrow(g, X(0), Y(0), X(ex), Y(ey), C.dE, DR.comp ? 'Ω·δ' : 'dünya dönüşü', av, C, W);
    drawArrow(g, X(ex), Y(ey), X(bx), Y(by), C.dB, 'bias', av, C, W);
  }
  if (ok) { g.fillStyle = C.ink; g.beginPath(); g.arc(X(xs), Y(ys), 2.6, 0, Math.PI * 2); g.fill(); }
  // ölçek çubuğu
  g.fillStyle = C.ink; g.font = '11px "IBM Plex Sans", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  const barPx = half <= 10 ? 1 : Math.pow(10, Math.floor(Math.log10(half / 2)));
  g.fillRect(10, W - 22, barPx * S, 2.5); g.fillText(`${barPx} px = ${fmt(barPx * IF, barPx < 10 ? 1 : 0)} µrad`, 10, W - 26);
  g.textAlign = 'right'; g.fillStyle = C.muted; g.fillText('+xel →', W - 8, W - 8); g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('↓ +el', 8, 8);
  if (!ok) { g.fillStyle = C.crit; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 12px "IBM Plex Sans", sans-serif'; g.fillText('Hedef görüş alanı dışında — kare geçersiz', W / 2, W / 2 + 30); }
  const nt = $('#fpaNote');
  if (nt) nt.textContent = VE
    ? (ok ? `Kare ${k + 1}/${V.n}, EIS sonrası: el ${fmt(ys * IF, 1)} µrad (${fmt(ys, 3)} px) · xel ${fmt(xs * IF, 1)} µrad (${fmt(xs, 3)} px); ham: el ${fmt(yr * IF, 1)} · xel ${fmt(xr * IF, 1)} µrad.` : `Kare ${k + 1}/${V.n}: hedef alan dışında.`) +
      ' EIS görüntüyü kaydırır, fiziksel LOS\'u değil: 3B ışın ve grafikler LOS\'u gösterir. Soluk çizgi: EIS sonrası yol; renkli: son 2 s; halka: ham konum.'
    : (ok ? `Kare ${k + 1}/${V.n}: el ${fmt(ys * IF, 1)} µrad (${fmt(ys, 3)} px) · xel ${fmt(xs * IF, 1)} µrad (${fmt(xs, 3)} px). Centroid ölçümü (gürültü, piksel fazı ve distorsiyon dahil).` : `Kare ${k + 1}/${V.n}: hedef alan dışında.`) +
      ` Soluk çizgi: koşu başından beri yol; renkli: son 2 s${half <= 10 && p.stab ? '; kesikli çember: radyal P99 (son 0,5 s ortalamasında)' : ''}. Dik ekran görüntüsü: LOS yukarı / sola kayınca hedef aşağı / sağa kayar; 3B'deki halkanın izinin 180° döndürülmüşüdür.` + (p.earth && p.stab && !p.earth.comp ? ` Dünya dönüşü kompanzasyonu kapalı: hedef ≈ ${fmt(Math.hypot(p.earth.expH, p.earth.expV) * 1e6 / IF, 2)} px/s kayar.` : '');
  if (nt) nt.textContent += loupe ? ' Piksel: hedefi izleyen büyüteç (±1,25 px; son 0,5 s ortalamasına ortalı, hızlı harekette hedefle kayar); ızgara gerçek piksel sınırları, nişangâh boresight.' : (RIG.fpaMode === 'auto' ? ' Oto: koşunun tüm yolu sığar (en az ±2,5 px).' : '');
  const fi = $('#feisInfo');
  if (fi) { const e = p.videoEis; fi.textContent = !e ? 'EIS verisi yok — koşuyu yenileyin' : (e.off ? 'Model: EIS kapalı' : `f_c ${e.fc} Hz · η ${e.eta} · artık ${e.reg} px`); }
  // lejant: EIS görünümünde ham/EIS konumu ve wander karşılaştırması; ham görünümde kayma okları
  const lg = $('#fpaLeg');
  if (lg && VE) {
    const u = (v) => isFinite(v) ? fmt(v, 1) : '—', m = p.metrics.eis, w = (v) => isFinite(v) ? fmt(v * 1e6, 2) : '—';
    lg.hidden = false;
    lg.innerHTML =
      `<span class="k"><i class="ring"></i><span>Ham görüntüdeki konum</span><span class="v">el ${ok ? u(yr * IF) : '—'} · xel ${ok ? u(xr * IF) : '—'}</span></span>` +
      `<span class="k"><i class="dot"></i><span>EIS sonrası konum</span><span class="v">el ${ok ? u(ys * IF) : '—'} · xel ${ok ? u(xs * IF) : '—'}</span></span>` +
      `<span class="k rest"><i></i><span>EIS düzeltmesi</span><span class="v">el ${ok ? u((ys - yr) * IF) : '—'} · xel ${ok ? u((xs - xr) * IF) : '—'}</span></span>` +
      `<span class="cap">µrad, bu kare. ` + (VE.off ? 'Model\'de EIS kapalı (η = 0, registrasyon artığı 0): görüntü ham ile aynı.' :
        (m ? `Wander (ölçülen video, ${fmt(m.Tw, 0)} s pencere): el ${w(m.rawEl)} → ${w(m.eisEl)}, xel ${w(m.rawXel)} → ${w(m.eisXel)} µrad.` +
          (isFinite(m.filtEl) ? ` Yalnız süzme (registrasyon artığı 0): el ${w(m.filtEl)}, xel ${w(m.filtXel)} µrad; artık her kareye ≈ ${w(m.regUrad)} µrad RMS gürültü ekler — giderilen titreşimden büyükse EIS sonrası jitter artar.` : '') + ' ' : '') +
        'Yol yumuşatma f_c altındaki yavaş hareketi istenen hareket sayıp bırakır (f_c = 0 referans kareye kilitler); η üstündekinin düzeltilen oranıdır.') + '</span>';
  } else if (lg) {
    lg.hidden = !DRv;
    if (DRv) {
      const DR = DRv, IFt = p.geom.IFOVt || p.geom.IFOV, u = (v) => isFinite(v) ? fmt(v * 1e6, 1) : '—';
      const rY = ok ? ys * IFt - DR.eY - DR.bY : NaN, rX = ok ? xs * IFt - DR.eX - DR.bX : NaN;
      lg.innerHTML =
        `<span class="k"><i style="background:var(--drift-earth)"></i><span>${DR.comp ? '<b>Ω·δ</b> dünya dönüşü kompanzasyon artığı' : '<b>Dünya dönüşü</b> (kompanzasyon kapalı)'}</span><span class="v">el ${u(DR.eY)} · xel ${u(DR.eX)}</span></span>` +
        `<span class="k"><i style="background:var(--drift-gyro)"></i><span><b>bias</b> gyro bias'ı (sabit + kararsızlık)</span><span class="v">el ${u(DR.bY)} · xel ${u(DR.bX)}</span></span>` +
        `<span class="k rest"><i></i><span>Kalan: uyarım artığı (jitter), ARW, ölçüm</span><span class="v">el ${u(rY)} · xel ${u(rX)}</span></span>` +
        `<span class="cap">µrad, koşu başından bu kareye birikmiş. ${loupe ? 'Oklar Oto ve Tam alan görünümünde çizilir.' : 'Oklar uç uca eklenir; ok ucundan hedefe noktalı çizgi kalandır.'}</span>`;
    }
  }
}
// oynatma anındaki kayma katkıları (rad): dünya dönüşü artığı (e) ve gyro bias'ı (b), el ve xel
function driftAt(p, t) {
  if (!p || !p.stab || !p.dr_e_el || !p.n) return null;
  const i = clamp(Math.round(t * p.fs), 0, p.n - 1);
  return { eY: p.dr_e_el[i], eX: p.dr_e_xel[i], bY: p.dr_b_el[i], bX: p.dr_b_xel[i], comp: !p.earth || !!p.earth.comp };
}
// tuval üzerinde ok: gövde 2 px, dolu baş; etiket okun ortasında, normal yönünde ve kaçınılacak noktadan (hedef) uzak
// tarafta, metin rengiyle ve halesiyle
function drawArrow(g, x0, y0, x1, y1, col, label, avoid, C, W) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (!(L >= 6)) return;
  const ux = dx / L, uy = dy / L, hl = Math.min(10, 3 + 0.35 * L), hw = 0.45 * hl;
  g.save();
  g.globalAlpha = 1; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - ux * hl * 0.75, y1 - uy * hl * 0.75); g.stroke();
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw); g.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw); g.closePath(); g.fill();
  if (label && L >= 24) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    let side = 1;
    if (avoid) { const d = (s) => Math.hypot(mx - uy * s * 14 - avoid[0], my + ux * s * 14 - avoid[1]); side = d(1) >= d(-1) ? 1 : -1; }
    const nx = -uy * side, ny = ux * side;
    const tx = clamp(mx + nx * 12, 6, W - 6), ty = clamp(my + ny * 12, 9, W - 9);
    g.font = '500 11px "IBM Plex Sans", system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = Math.abs(nx) < 0.3 ? 'center' : (nx > 0 ? 'left' : 'right');
    g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = C.bg; g.strokeText(label, tx, ty);
    g.fillStyle = C.ink2; g.fillText(label, tx, ty);
  }
  g.restore();
}
