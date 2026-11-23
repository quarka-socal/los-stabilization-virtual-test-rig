// ============================================================================
// 02_model.js — parametreler: temel girdiler (kanal, gereksinim, düzenek, senaryo, bütçe varsayımları), örnek DUT,
// işletme ortamı, laboratuvar; türetilmiş büyüklükler ve analitik döngü modeli. Simülasyon kendi içinde tanımlıdır:
// hiçbir değer dış bir dosyaya bağlı değildir; her parametrenin rolü Model sekmesindeki etiketinde yazar.
// ============================================================================

// SS4/SS5 6-DOF proje test profili (kullanıcı tablosu: ± tepe genlik, frekans bandı). Standart değeri değildir: STANAG
// 4154 işletilebilirlik sınırları ve deniz durumu tanımı verir, MIL-STD-167-1A 4–33 Hz titreşim standardıdır; gemi
// hareketi gemiye, rotaya ve hıza bağlıdır (DOD-STD-1399-301A ya da gemi RAO'su ile değiştirin). Eksenler gövdede:
// surge x (pruva), sway y (iskele), heave z (yukarı). Açılar °, ötelemeler m, frekanslar Hz.
const SEA6 = {
  SS4: { roll: { A: 5.0, f1: 0.10, f2: 0.25 }, pitch: { A: 2.5, f1: 0.15, f2: 0.35 }, yaw: { A: 1.5, f1: 0.05, f2: 0.20 },
         surge: { A: 0.3, f1: 0.10, f2: 0.25 }, sway: { A: 0.4, f1: 0.10, f2: 0.30 }, heave: { A: 0.5, f1: 0.10, f2: 0.30 } },
  SS5: { roll: { A: 10.0, f1: 0.10, f2: 0.25 }, pitch: { A: 5.0, f1: 0.15, f2: 0.35 }, yaw: { A: 3.0, f1: 0.05, f2: 0.20 },
         surge: { A: 0.7, f1: 0.10, f2: 0.25 }, sway: { A: 1.0, f1: 0.10, f2: 0.30 }, heave: { A: 1.2, f1: 0.10, f2: 0.30 } },
};
const SEA_ANG = ['roll', 'pitch', 'yaw'], SEA_LIN = ['surge', 'sway', 'heave'];
// Temel girdilerin varsayılan değerleri (P.wb: tarihsel ad; 'temel girdiler'). Roller: kanal (referans dedektör kanalı),
// gereksinim, kabul kuralı, düzenek (hexapod, kolimatör, ölçüm zinciri, laboratuvar), senaryo (deniz, VIV, dünya),
// bütçe varsayımı (gyro spesifikasyonu, görüntü rotasyonu artığı, EIS). Kullanıcı kendi projesinin değerlerini girer.
function baseDefaults() {
  return {
    channels: [
      { name: 'MWIR-NFOV', p_um: 12, f_mm: 300, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 100 },   // kanal tablosu
      { name: 'MWIR-WFOV', p_um: 12, f_mm: 50, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 25 },
      { name: 'HDTV-NFOV', p_um: 3.45, f_mm: 300, Nh: 1920, Nv: 1080, fps: 50, Tint_ms: 1, Dp_mm: 75 },
      { name: 'SWIR-NFOV', p_um: 15, f_mm: 250, Nh: 640, Nv: 512, fps: 50, Tint_ms: 2, Dp_mm: 70 },
    ],
    refChannel: 'MWIR-NFOV',                 // bütçe referans kanalı
    k_wander: 0.5, k_smear: 0.25,            // gereksinim (IFOV RMS, eksen başına)
    tau: 1, drift_ifov: 1,                   // drift penceresi (s) ve izin verilen drift (IFOV)
    k_conf: 2.576, TUR_target: 4,            // kabul kuralı: güven çarpanı, hedef TUR
    TUR_def: 'k1', k_exp: 2,                 // TUR tanımı (k = 1 | Z540.3) ve genişletme katsayısı
    k_roll: 0.5,                             // görüntü rotasyonu: ölçüt noktasında izin verilen kayma (IFOV RMS; R-01 tahsisi)
    // Görüntü rotasyonu ölçüt noktası: 'corner' = dizinin en dış köşe pikseli (yarı köşegen, r = ½·√(Nh² + Nv²));
    // 'edge' = alan kenarı (yatay yarı genişlik, Nh/2; v10 davranışı)
    rotRef: 'corner',
    // Ek bütçe satırları (v11: B1-08 deniz ötelemesi, B1-09/B1-10 FOG): false → v10 satır seti (regresyon kipi)
    extRows: true,
    hex: { theta_max: 15, omega_max: 40, alpha_max: 400, fbw: 20, rel_ratio: 0.5,   // düzenek: hexapod sınırları
           // L_off: pivotun DUT giriş göz bebeğinden kaçıklığı (m; kurulum toleransı, kolimatör açıklığı denetiminde en kötü yönde
           // L_off·sin θ⊥). v13.4: 0,15 → 0 — testler pivotu göz bebeğine koyar (T0.1, T1.3); önceki değer hiçbir hesaba girmiyordu.
           L_off: 0, theta_test: 5, microvib: 2, stabOff_ratio: 0.4,                // uç poz, masa mikro-titreşimi (µrad RMS), stab-OFF payı
           // taban düzeltmesinde masa mikro-titreşimi: 'zincir' | 'tam' | 'kapalı'. v13.5 (kullanıcı kararı): varsayılan 'kapalı' —
           // örnek DUT'ta masa titreşimi ölçüme karesel eklenmiyor (sürtünme ditheri), düşüm tutucu değil (V&V M7)
           mvCorr: 'kapalı',
           // hexapod ötelemesinin dinamiği — 'fbw' (açıyla aynı bacak dinamiği, Osc2 f_bw, ζ = 0,7071; v13.5 varsayılanı, kullanıcı
           // kararı) | 'ideal' (süzgeçsiz; v13.4'e kadar). Shaker koşuları (hexActive: false) her zaman ideal.
           transDyn: 'fbw' },
    // düzenek: kolimatör (v13.4: uygunluk denetimi — collGeom, pupilExcursion). f_c odak, D_c açıklık (mm), iğne deliği çapı (µm),
    // siyah cisim kontrastı ΔT (K; bilgi), f_c/f_DUT alt sınırı, açıklık payı k: D_c ≥ k·(D_p + 2e)
    // v13.5 (kullanıcı kararları): delta_um kolimatör odak hatası δ (µm; + hedef odak düzleminin ötesinde; 0 = ideal), paralaks
    // payı (δ_max denetimi, µrad); fitTrans: laboratuvar deniz ötelemesi göz bebeği kayması e ≤ e_free olacak biçimde ölçeklenir;
    // vigRule: gerçek vinyetlemede (e > (D_c − D_p)/2) test GEÇERSİZ. Gemide D_c 200 mm (applyPlatform; 12° roll × L_pg = 25 mm).
    coll: { fc_mm: 1500, Dc_mm: 150, pinhole_um: 50, dT: 10, ratio_min: 3, ap_margin: 1.1, delta_um: 0, par_allow_urad: 1, fitTrans: true, vigRule: true },
    // düzenek: ölçüm zinciri. v13.7 (kullanıcı kararı K4): IMU ve otokolimatör gürültüsü tek taraflı genlik yoğunluğu (µrad/√Hz, beyaz).
    // IMU gürültüsü hareketle birlikte IMU süzgecinden (imu_bw, 2. derece Butterworth) geçer: RMS = imu_asd·√ENBW, analog
    // ENBW = (π/(2√2))·f_IMU = 1,111·f_IMU; otokolimatör gürültüsü kayıt bandında (0–f_kayıt/2) beyaz: RMS = ac_asd·√(f_kayıt/2).
    // 0,0224 µrad/√Hz ≈ eski örnek başına 0,5 µrad (1 kHz kayıt). noiseModel 'sample' (compatV10): v13.6'ya kadarki tanım
    // (imu_noise, ac_noise örnek başına RMS, süzgeçsiz). v13.6: kullanılmayan ac_rate kaldırıldı. roi_fps > 0: ROI kanalı
    // (v13.7, kullanıcı kararı K3: hiçbir teste eklenmedi; gizli, 0).
    chain: { imu_bw: 500, imu_asd: 0.0224, ac_asd: 0.0224, noiseModel: 'asd', dt_sync_ms: 0.5,
             centroid_px: 0.03, scale_eps: 0.005, air: 1.0, pixlock_px: 0.02, roi_fps: 0 },
    sea: { roll_A: 3, roll_T: 8, pitch_A: 1.5, pitch_T: 10, yaw_A: 1, yaw_T: 12,            // senaryo (denizaltı örneği)
           // profil kipi ('dar' = eşdeğer sinüs genliği + baskın periyot, log-Gauss dar bant, yalnız açısal;
           // '6dof' = bant sınırlı 6 serbestlik dereceli profil, ± tepe genlik, σ = A/kp), tepe çarpanı kp.
           // Kaldıraç kolu r = (rx, ry, h) m: deniz profilinin tanımlandığı hareket referans noktasından LOS referans
           // noktasına (mast başı / direktör); gövde eksenleri x pruva +, y iskele +, z yukarı +. Denizaltı örneği
           // h = 1 m (v13.1 kullanıcı kararı; kullanıcı girer), rx = ry = 0
           mode: 'dar', kp: 3, h: 1, rx: 0, ry: 0, dof: JSON.parse(JSON.stringify(SEA6.SS4)) },
    viv: { section: 'Dairesel', D: 0.25, St: 0.2, nu: 1.1892e-6, Re_crit: 2e5, fn: 3,         // senaryo: hidrodinamik VIV (denizaltı)
           K0_lo: 0.6, K0_hi: 2.0, margin: 0.2, amp_deg: 0.05,
           // bütçe varsayımı: f_n'de DRR (B2-01 analitik tahmini; v13.2 parametre — önceden sabit −40 dB)
           drr_dB: -40,
           // v13.3 (kullanıcı kararları): mast başı ötelemesi (konsol mast: tepe açısı θ ile tepe ötelemesi y = θ·L/κ birlikte;
           // akışa dik y yönünde, açıyla aynı fazda; gemi direğiyle aynı mekanizma) — L: mast serbest boyu (destekten mast
           // başına; örnek: periskop patenti 4,2 m), κ: tepe eğim oranı. Kütle oranı m* = m/(ρπD²/4) (birim boy; örnek:
           // patentte 260 kg / 4,2 m, D = 0,25 m → ≈ 1,2): kilitlenme aralığının üst ucu ve alt dal frekansı
           // f*_alt = √((m* + 1)/(m* − 0,54)) (Govardhan & Williamson 2000); m* ≤ 0,54 → üst sınır yok (2002); null = kapalı.
           // İşletme hız zarfı (mast açıkken, kn): zarfta riskli ya da sınırda hız yoksa VIV oluşmaz (B2-01 = 0).
           L: 4, kth: 1.5, lin: true, mstar: 1.2, Umin_kn: 2, Umax_kn: 12,
           on: true },   // hidrodinamik VIV açık/kapalı (yalnız denizaltı platformunda etkin)
    // Platform: 'sub' = denizaltı sürülebilir optronik mastı (varsayılan), 'ship' = gemi direğinde EO direktör. Platform, hangi kaynakların var olduğunu belirler: hidrodinamik VIV ve
    // dalga çarpması yalnız denizaltında, rüzgâr kaynaklı girdap kopması yalnız gemide.
    platform: 'sub',
    // Rüzgâr kaynaklı girdap kopması — gemi direği (EN 1991-1-4:2005 Ek E, yaklaşım 1). Örnek direk (kaynak değil):
    // çelik boru D = 0,40 m, et 10 mm (96 kg/m), serbest yükseklik 8 m, tepe kütlesi (direktör + platform) 250 kg →
    // Rayleigh f_n = 4,10 Hz (rijit mesnet), m_e = m + M/∫Φ² = 252 kg/m (Φ = (z/l)²). δ_s kaynaklı çelik mertebesi.
    wviv: { on: true, D: 0.40, L: 8, fn: 4.1, me: 252, delta: 0.02, St: 0.18, Umax: 25, beta: 0, kth: 1.5, lin: true,
            ftol: 0.15, eps0: 0.3, drr_dB: -40, amp_deg: null, rho: 1.25, nu: 1.5e-5, K: 0.13 },
    earth:{ Omega: 7.292115e-5, lat: 40, az: 90, el: 0, comp: true, delta_deg: 1 },          // senaryo/düzenek: dünya dönüşü (Ω WGS 84)
    // bütçe varsayımları: gyro ARW, bias, eksen kaçıklığı, artık roll. v13.8 (§8): kullanılmayan mtf_r kaldırıldı; B1-04'ün tabanı
    // epsBasis: 'los' = LOS ekseni etrafındaki baz dönmesi (benzetimin, T1.1'in ve V&V F3'ün fiziği), 'roll' = v13.7'ye kadar roll genliği
    // v13.9 (§8 K2, kullanıcı kararı): rwMetric 'window' = rastgele yürüyüş satırları wander toplamına wander penceresinin metriğiyle
    // girer (B1-05 = ARW·√(T_w/15), doğrusal trend çıkarılmış); B1-06 ve B1-09 sabit kayma olarak trendle çıkar, yalnız drift'e girer.
    // 'tau' = v13.8'e kadar: üçü de τ drift penceresinin metriğiyle wander toplamına girer
    H: { arw: 0.005, bias: 0.05, eps_mrad: 0.1, roll_res_mrad: 0.5, epsBasis: 'los', rwMetric: 'window',
         // ek bütçe varsayımları (v11): LOS ivme duyarlılığı (optik montaj + dengesizlik, B1-08);
         // FOG: kalibrasyon sonrası açılış bias'ı artığı, bias sıcaklık katsayısı ve sıcaklık farkı (B1-09),
         // g-duyarlılığı (B1-10). 0 = girilmedi (veri sayfasından girin)
         accSens: 2.0, b0_res: 0.04, tc_bias: 0, dT: 40, kg: 0,
         // deniz frekansında DRR varsayımı (B1-01…B1-03 analitik tahmini; v13 parametre — önceden sabit −80 dB)
         drrSea_dB: -80 },
    eis: { fc: 0.5, eta: 0.8, reg_px: 0.1 },                                                 // bütçe varsayımı: EIS
    unc: { fmin: 0.05, Nper: 30, perSeg: 4, Trec: 900, coh: 0.8, rawExample: 8 },            // ölçüm belirsizliği: kayıt istatistiği
  };
}

// Örnek DUT (gerçek ürün değil). Fiziksel yapı Hilkert/Masten ISP modelidir; sayılar,
// varsayılan halde bütçenin örnek tahminlerini yeniden üretecek biçimde ayarlanmıştır.
function dutDefaults() {
  return {
    geom: { a0: 90, e0: null },              // LOS azimutu (pruvaya göre, iskele +); elevasyon null → wb.earth.el (LOS elevasyonu) — dünya dönüşü hesabıyla aynı geometri
    el: { J: 0.25, fc: 40, fi: 4, b: 1.6626, k: 4.8402,            // b, k: DRR(1/8 Hz) = −80 dB ve DRR(3 Hz) = −40 dB için çözüldü
          Fc: 1.5818, Fs: 1.7400, ws: 0.003, sigma0: 1581.8,      // N·m; σ0 = F_c / 1 mrad (ön-kayma; Dahl 1968 ölçeği)
          cogN: 300, cogA: 0.01214, Tmax: 20 },
    az: { Ja: 0.35, Jex: 0.20, Jez: 0.25, fc: 30, fi: 4, b: 2.9694, k: 13.3244,   // k: DRR(1/12 Hz) = −80 dB
          Fc: 3.5590, Fs: 3.9149, ws: 0.003, sigma0: 3559.0,     // yağ dolu keçe: el ekseninin 2,25 katı (Lan ve ark. 2023)
          cogN: 360, cogA: 0.02428, Tmax: 40 },
    ctl: { fctl: 2000, flp: 400, zlp: 0.7, secant: true,
           // v13.10 (§9 K1, kullanıcı kararı): estErr = uyarlanır dar bandın frekans kestirim hatası (oran; 0,05 = %5 yüksek). 0 = ideal
           res: { on: true, f: 3.0, adaptive: true, gain_dB: 20, zeta: 0.08, fmin: 1.2, fmax: 6.0, estErr: 0 },   // örnek: VIV bandında adaptif rezonans kontrolcü (T2.2 'kontrol özelliği')
           // v13.10 (§9 K2, kullanıcı kararı): obs = LuGre gözlemcisinin model parametreleri, tesisin değerine oran (F_c, F_s, v_s, σ0). 1 = tam bilgi
           ff: { on: true, mode: 'lugre', eta: 0.95, f_est: 500, w_ff: 1.5e-3, hys: 0, tempSched: false, obs: { Fc: 1, Fs: 1, vs: 1, s0: 1 } } },
    cur: { fbw: 1500 },
    gyro: { fbw: 1000, arw: 0.0042, bi: 0.042, bias0: 0.04, epsEl: 0.10, epsXel: 0.10, sf_ppm: 100,
            // v11 FOG ekleri (örnek DUT; 0 = etkisiz, veri sayfasından girin): ek gecikme (döngünün 1 kontrol periyodu hesap
            // gecikmesine ek), ölçek doğrusalsızlığı (IEEE 952: en küçük kareler doğrusundan en büyük sapma, ppm·FS), ölçüm
            // menzili, kuantizasyon (LSB), bias ve ölçek sıcaklık katsayıları (kalibrasyon sıcaklığı Tcal, çalışma Top), g-duyarlılığı
            lat_ms: 0, sfnl_ppm: 0, range_dps: 1000, lsb_dph: 0, tcBias: 0, tcSF: 0, Tcal: 20, Top: 20, kg: 0 },
    imb: { me: 20, rcg_e: [0.30, 0.05, 0.40], ma: 30, rcg_a: [0.20, 0.20, 0] },   // kg, mm: el montajı (E çerçevesi) / az boyunduruğu (A çerçevesi); az ekseni ikisinin toplamını taşır
    L_pg: 0.12,                              // giriş göz bebeği → gimbal merkezi (m, LOS'un tersine)
    mount: { f: 25, zeta: 0.05, kappa: 0, yaw: 0.5 },   // direk tepesi açısal modu: öteleme ivmesi → açısal (rad per m/s²). Bütçede satırı yok; varsayılan kapalı (κ = 1e-4 ile 'ne olur' denemesi)
    modes: { gim: { f: 180, zeta: 0.02, gA: 2.0e-7 }, opt: { f: 120, zeta: 0.02, gAcc: 1.5e-6 } },
    cooler: { f: 60, A: 1.982, h2: 0.35, h3: 0.15 },          // µrad (60 Hz temel genlik), harmonik oranları
    derot: { on: true, lat_ms: 30, sf: 0.019 },
    optics: { k1: -0.002, scaleErr: 0.004 },                 // radyal distorsiyon; gerçek IFOV/nominal − 1
    video: { lat_ms: 0, x0: 0.37, y0: -0.21 },
  };
}

// İşletme ortamı (mast başı, periskop derinliği). Deniz ve VIV Model'deki senaryo değerlerinden;
// diğer düzeyler bütçe satırlarının analitik tahminlerine kalibre edilmiştir.
function envDefaults() {
  return {
    seaWidth: 0.12,                          // log-frekans Gauss tepe genişliği (σ_ln)
    viv: { bw: 0.03 },                       // Hz, kilitlenme → neredeyse tek ton
    slap: { rate: 0.10, Tmin: 0.05, Tmax: 0.20, A: 2100 },    // olay/s, s, s, µrad (tepe RMS ölçeği); v13.13: Campbell beklentisi dar bant kapalı taban döngüde 2 µrad (önce tek gerçekleşmeye, 2458)
    lat: { f: 8, bw: 0.8, a_rms: 0.861 },      // m/s² (gövde y, yanal)
    plat: { f1: 4, f2: 33, a_rms: 0.9066 },   // m/s² RMS eksen başına (4. derece biçim); B2-06 = 2 µrad için kalibre
    aux: { f: 50, a: 2.256 },                  // m/s² (doğrusal tepe, her eksen; yapı yolu)
    hf: { f1: 60, f2: 400, ang_rms: 1.360, acc_rms: 0.3953 },      // µrad RMS açısal, m/s² RMS doğrusal
  };
}
function labDefaults() {
  return {
    microvib: { f1: 5, f2: 150, fres: 70, Qres: 4, gres: 12 },   // spektrum biçimi; RMS wb.hex.microvib (2 µrad)
    air: { fc: 2 },                                               // spektrum biçimi; RMS wb.chain.air (1 µrad)
    floorCoupling: 0,                                             // µrad / (rad/s²) — kolimatör zemin kuplajı
    hexStroke: 0.10,                                              // m (öteleme stroku, örnek)
    rocking: { free: 50, controlled: 2 },                         // µrad/mm (shaker sallanması)
    pivotHull: 1.0,                                               // m (T2.5 ölçekli gövde dönme merkezi)
  };
}
function anaDefaults() {
  // req: projeye özgü gereksinimler (null = girilmedi → test BİLGİ olarak raporlanır)
  return { Tw: 120, detrend: 'linear', pdeWin: 0.1, edgeMargin_px: 2, seeds: 3, seedOffset: 0,
    req: { settle_ms: null, trackErr_urad: null, boresight_urad: null, shockPeak_urad: null, shockSettle_ms: null },
    los: losReqDefaults() };
}
// Proje LOS kalıntı gereksinimleri (v12, kullanıcının proje tablosu). Limitler IFOV = p/f oranıdır:
// σ_vek ≤ 0,10, σ_El ≤ 0,0625, σ_Az ≤ 0,0775 (√(El² + Az²) = σ_vek), kayıt PPV ≤ 6,5·σ_eksen (Gauss uç değer oranı),
// geçiş (stick-slip) PPV ≤ 0,40 (T1.6), ampirik radyal P99,73 ≤ 0,30, pozlama içi RMS (T_e, karelerin karesel ortalaması)
// ≤ 0,05. PSD: bant RMS tahsisi = pay × eksen sınırı (bantlar 0,1–2,5–20–100–500 Hz), düz eşdeğer ASD maskesi = tahsis/√Δf;
// ayrık ton ≤ √toneFrac × bant tahsisi. Zaman alanı: 0,1 Hz sıfır fazlı yüksek geçiren + Tw pencerelerinde doğrusal trend.
// Karar: σ'lar için pencere RMS'lerinin tek taraflı %95 üst güven sınırı (ust95 | enkotu | ortalama); PPV en kötü pencere;
// P99,73 havuzlanmış; pozlama karesel ortalama. Kabul tabanı: dış kamera takip döngüsü sonrası (basis: sonra | once).
function losReqDefaults() {
  return { on: true, kVec: 0.10, kEl: 0.0625, kAz: 0.0775, kPPV: 6.5, kRev: 0.40, k9973: 0.30, kExp: 0.05, Texp_ms: 10,
    Tw: 60, fHP: 0.1, T: 645, skip: 20, bands: [0.1, 2.5, 20, 100, 500], share: [0.6, 0.6, 0.48, 0.2], toneFrac: 0.5, toneMin: 1.0,
    decide: 'ust95', basis: 'sonra', trk: { bw: 2.5, lat_frames: 2, gate_px: 32 } };
}
// Platforma göre deniz hareketi (eşdeğer sinüs genliği, baskın periyot). Denizaltı: senaryo örneği (baseDefaults).
// Gemi (örnek): roll ve pitch NATO işletilebilirlik sınırlarında (4° ve 1,5° RMS → A = √2·RMS); roll periyodu ≈ 10 s
// (R/V Melville 1/23 model, T_n = 2,14 s → Froude ölçeği 10,3 s); pitch 7 s ve yaw (1°, 12 s) tahmini/örnek.
// Gemi örneğinde direktör, direk tepesinde hareket merkezinin 15 m üstündedir (örnek: 8 m direk + güverte yüksekliği);
// boyuna ve enine konumu (rx, ry) varsayılanda 0 — proje kendi yerleşimini girer.
function platformSea(kind) {
  return kind === 'ship' ? { roll_A: 5.66, roll_T: 10, pitch_A: 2.12, pitch_T: 7, yaw_A: 1, yaw_T: 12, mode: 'dar', kp: 3, h: 15, rx: 0, ry: 0, dof: JSON.parse(JSON.stringify(SEA6.SS4)) }
    : baseDefaults().sea;
}
// Deniz hareketinin serbestlik dereceleri (kipten bağımsız erişim). ang: roll, pitch, yaw (rad); lin: surge, sway, heave
// (m). A: test genliği (dar: eşdeğer sinüs genliği; 6dof: ± tepe), Aeq: eşdeğer sinüs genliği (√2·σ), sigma: RMS,
// fdom: baskın (bant merkezi) frekans, shape: tek taraflı PSD biçimi. 'dar' ifadeleri önceki sürümle aynıdır.
function seaDOF(P) {
  const s = P.wb.sea, six = s.mode === '6dof', kp = s.kp || 3, sw = P.env.seaWidth;
  const ang = [0, 1, 2].map(ax => {
    if (!six) {
      const A = [s.roll_A, s.pitch_A, s.yaw_A][ax], T = [s.roll_T, s.pitch_T, s.yaw_T][ax], fp = 1 / T;
      return { key: SEA_ANG[ax], A, Aeq: A, sigma: A * D2R / Math.SQRT2, fdom: fp, f1: fp * Math.exp(-2 * sw), f2: fp * Math.exp(2 * sw), shape: shapeLogGauss(fp, sw), active: A > 0 };
    }
    const q = s.dof[SEA_ANG[ax]], sig = q.A * D2R / kp;
    return { key: SEA_ANG[ax], A: q.A, Aeq: Math.SQRT2 * sig * R2D, sigma: sig, fdom: Math.sqrt(q.f1 * q.f2), f1: q.f1, f2: q.f2, shape: shapeBand(q.f1, q.f2), active: q.A > 0 };
  });
  const lin = [0, 1, 2].map(ax => {
    if (!six) return { key: SEA_LIN[ax], A: 0, Aeq: 0, sigma: 0, fdom: NaN, f1: NaN, f2: NaN, shape: null, active: false };
    const q = s.dof[SEA_LIN[ax]], sig = q.A / kp;
    return { key: SEA_LIN[ax], A: q.A, Aeq: Math.SQRT2 * sig, sigma: sig, fdom: Math.sqrt(q.f1 * q.f2), f1: q.f1, f2: q.f2, shape: shapeBand(q.f1, q.f2), active: q.A > 0 };
  });
  const r = seaArm(P), rOn = r[0] !== 0 || r[1] !== 0 || r[2] !== 0;
  return { six, kp, h: r[2], r, rOn, ang, lin };
}
// Kaldıraç kolu r = (rx, ry, rz = h), m; sayı olmayan ya da girilmemiş bileşen 0 (önceki sürümlerin parametre kümeleri)
function seaArm(P) { const s = P.wb.sea, v = (x) => (typeof x === 'number' && isFinite(x) ? x : 0); return [v(s.rx), v(s.ry), v(s.h)]; }
// Direktördeki doğrusal ivme RMS'i (m/s², gövde eksenleri): ağırlık merkezi ötelemesi + kaldıraç kolu α × r:
// a_x = θ̈·rz − ψ̈·ry, a_y = ψ̈·rx − φ̈·rz, a_z = φ̈·ry − θ̈·rx. Merkezcil ω×(ω×r) ikinci derecedir (bağıl katkısı ≈ açının
// RMS'i, rad); bütçe kestiriminde ihmal, benzetimde tam. Serbestlik dereceleri bağımsız üretilir: terimler karesel toplanır.
// corrUp: bir eksendeki terimler tam ilişkili ve aynı fazda olsaydı RMS üst sınırı (bilgi; gerçek gemi hareketinde roll–sway–
// yaw ve pitch–heave–surge ortak dalga girdisinden gelir). fa: ivme varyansıyla ağırlıklı RMS frekansı √(Σσ²f²/Σσ²) (B1-08
// satırının frekansı); accInt = √Σ(σ_a/(2πf))² (m/s): g-duyarlı hız hatasının döngü bandında integre olan açısı (B1-10).
function seaAccDirector(P) {
  const D = seaDOF(P), h = D.h, r = D.r, ar = r.map(Math.abs);
  const lin = D.lin.map(q => q.active ? q.sigma * accRatio(q.shape, q.fdom) : 0);
  const angAcc = D.ang.map(q => q.active ? q.sigma * accRatio(q.shape, q.fdom) : 0);
  const T = (k, arm) => ({ src: SEA_ANG[k], arm, v: arm * angAcc[k], f: D.ang[k].fdom });
  const terms = [[T(1, ar[2]), T(2, ar[1])], [T(0, ar[2]), T(2, ar[0])], [T(0, ar[1]), T(1, ar[0])]];   // x: θ̈rz, ψ̈ry · y: φ̈rz, ψ̈rx · z: φ̈ry, θ̈rx
  const lever = terms.map(t => Math.hypot(t[0].v, t[1].v));
  const x = Math.hypot(lin[0], lever[0]), y = Math.hypot(lin[1], lever[1]), z = Math.hypot(lin[2], lever[2]);
  const all = [];
  D.lin.forEach((q, k) => { if (lin[k] > 0) all.push({ src: SEA_LIN[k], ax: k, v: lin[k], f: q.fdom }); });
  terms.forEach((t, k) => t.forEach(q => { if (q.v > 0) all.push({ src: q.src, ax: k, v: q.v, f: q.f }); }));
  const s2 = all.reduce((s, q) => s + q.v * q.v, 0);
  const fa = s2 > 0 ? Math.sqrt(all.reduce((s, q) => s + q.v * q.v * q.f * q.f, 0) / s2) : NaN;
  const accInt = Math.sqrt(all.reduce((s, q) => s + sq(q.v / (TAU * q.f)), 0));
  const up = [0, 1, 2].map(k => lin[k] + terms[k][0].v + terms[k][1].v);
  return { x, y, z, eff: Math.hypot(x, y, z), lin, lever, angAcc, h, r, terms, all, fa, accInt,
    corrUp: { x: up[0], y: up[1], z: up[2], eff: Math.hypot(up[0], up[1], up[2]) } };
}
// Laboratuvarda LOS referans noktasının öteleme talebi (analitik, bilgi; koşudaki q zaman serisinden): ağırlık merkezi
// ötelemesi + (R − I)·r. Birinci derece v × r (v = (φ, θ, ψ)): x ← θ·rz, ψ·ry; y ← φ·rz, ψ·rx; z ← φ·ry, θ·rx. İkinci
// derece: r_k·(1 − cos) terimi −½·r_k·(a² + b²) (a, b: k eksenine dik iki açı) → ortalama kayması ½|r_k|(σa² + σb²) ve
// saçılımı |r_k|·√((σa⁴ + σb⁴)/2). Tepe ≈ k_p·σ + ortalama kayması; q = strok / en büyük tepe.
function seaLabDemand(P) {
  const D = seaDOF(P), r = D.r, s = D.ang.map(q => (q.active ? q.sigma : 0)), L = D.lin.map(q => (q.active ? q.sigma : 0));
  const first = [[r[2] * s[1], r[1] * s[2]], [r[2] * s[0], r[0] * s[2]], [r[1] * s[0], r[0] * s[1]]], perp = [[1, 2], [0, 2], [0, 1]];
  const axes = [0, 1, 2].map(k => {
    const a = s[perp[k][0]], b = s[perp[k][1]], rk = Math.abs(r[k]);
    const sd2 = rk * Math.sqrt((a ** 4 + b ** 4) / 2), m2 = rk * (a * a + b * b) / 2, sigma = Math.hypot(L[k], first[k][0], first[k][1], sd2);
    return { sigma, mean2: m2, peak: D.kp * sigma + m2 };
  });
  const pk = Math.max(axes[0].peak, axes[1].peak, axes[2].peak), st = P.lab.hexStroke;
  return { axes, pk, stroke: st, q: pk > st ? st / pk : 1 };
}
function applyPlatform(P, kind) {
  P.wb.platform = kind === 'ship' ? 'ship' : 'sub';
  P.wb.sea = platformSea(P.wb.platform);
  // v13.5 (kullanıcı kararı): gemide kolimatör açıklığı 200 mm — 12° deniz roll'u stab ON'da göz bebeğini ötelemesiz de 25 mm kaydırır
  // (L_pg·sin θ); 150 mm'nin paylı sınırı 18,2 mm. Denizaltında 150 mm (ötelemesiz 13,6 mm).
  if (P.wb.coll) P.wb.coll.Dc_mm = P.wb.platform === 'ship' ? 200 : 150;
  return P;
}
function defaultParams(kind) {
  const P = { wb: baseDefaults(), dut: dutDefaults(), env: envDefaults(), lab: labDefaults(), ana: anaDefaults() };
  if (kind === 'ship') applyPlatform(P, 'ship');
  return P;
}
const isShip = (P) => !!(P && P.wb && P.wb.platform === 'ship');
// v10 ile özdeş sonuç veren ayarlar (bit düzeyinde regresyon kipi): görüntü rotasyonu kenarda,
// ek bütçe satırları kapalı; v11'de eklenen diğer terimler (mikro-titreşim düşümü, kaldıraç kolu,
// 6-DOF öteleme, FOG ekleri) nötr değerlerine çekilir
function compatV10(P) {
  P.wb.rotRef = 'edge'; P.wb.extRows = false; P.wb.hex.mvCorr = 'kapalı';
  P.wb.sea.mode = 'dar'; P.wb.sea.h = 0; P.wb.sea.rx = 0; P.wb.sea.ry = 0;
  P.wb.viv.lin = false; P.wb.viv.mstar = null;      // v13.3 denizaltı VIV ekleri (mast başı ötelemesi, kütle oranı) nötr
  P.wb.hex.transDyn = 'ideal'; Object.assign(P.wb.coll, { fitTrans: false, vigRule: false, delta_um: 0 });   // v13.5 düzenek kuralları nötr
  Object.assign(P.wb.chain, { noiseModel: 'sample', imu_noise: 0.5, ac_noise: 0.5 });                    // v13.7 öncesi gürültü tanımı
  P.wb.H.epsBasis = 'roll';                                                                                // v13.8 öncesi B1-04 tabanı
  P.wb.H.rwMetric = 'tau';                                                                                 // v13.9 öncesi rastgele yürüyüş metriği
  Object.assign(P.dut.gyro, { lat_ms: 0, sfnl_ppm: 0, lsb_dph: 0, tcBias: 0, tcSF: 0, kg: 0, Top: P.dut.gyro.Tcal != null ? P.dut.gyro.Tcal : 20 });
  if (P.ana.los) P.ana.los.on = false;          // v12 proje gereksinim değerlendirmesi (T1.9, işletme takip koşusu) kapalı
  return P;
}

// ------------------------------------------- rüzgâr kaynaklı girdap kopması --
// EN 1991-1-4:2005 Ek E. Dairesel kesitte temel yanal kuvvet katsayısı c_lat,0(Re) (Şekil E.2): Re ≤ 3·10⁵ → 0,7;
// 3·10⁵–5·10⁵ arasında log(Re)'ye göre doğrusal 0,7 → 0,2; 5·10⁵–5·10⁶ → 0,2 (Rakočević & Popović 2018 örneğinin
// 0,700 / 0,386 / 0,200 değerleriyle doğrulandı). Re > 5·10⁶ (transkritik) doğrulanmadı: muhafazakâr 0,3.
function clat0Circ(Re) {
  if (Re <= 3e5) return 0.7;
  if (Re <= 5e5) return 0.7 - 0.5 * Math.log(Re / 3e5) / Math.log(5 / 3);
  if (Re <= 5e6) return 0.2;
  return 0.3;
}
// Yaklaşım 1 (E.7): y_F,max/b = K·K_W·c_lat / (St²·Sc); Sc = 2·δ_s·m_e/(ρ·b²) (E.4); v_crit = b·f_n/St (E.1.3.1);
// L_j/b Tablo E.4'ten (y_F/b'ye göre, yinelemeli); K_W = ∫_{L_j}Φ / ∫_l Φ, Φ = (z/l)² → 1 − (1 − L_j/l)³ (üst sınır
// uygulanmadı: muhafazakâr); K = 0,13 (konsol). E.1.2(2): v_crit > 1,25·v_m ise girdap kopması incelenmez → c_lat = 0.
// 0,83 < v_crit/v_m ≤ 1,25 aralığında c_lat azaltılmaz (muhafazakâr). Direktör direk tepesindedir: açı θ = κ·y/l
// (κ = 1,5 tepe kütlesi baskın konsol; 1,38 düzgün konsol 1. modu), öteleme ivmesi (2πf_n)²·y.
function windVivCalc(P) {
  const W = P.wb.wviv, b = W.D, St = W.St;
  const vcrit = b * W.fn / St;
  const Re = b * vcrit / W.nu;
  const clat0 = clat0Circ(Re);
  const ratio = vcrit / W.Umax;
  const active = ratio <= 1.25;
  const clat = active ? clat0 : 0;
  const Sc = 2 * W.delta * W.me / (W.rho * b * b);
  const lam = W.L / b;
  let yb = 0, Ljb = 6, Kw = 0, conv = false;
  for (let it = 0; it < 200; it++) {
    Ljb = yb < 0.1 ? 6 : (yb < 0.6 ? 4.8 + 12 * yb : 12);
    const x = Math.min(1, Ljb / lam);
    Kw = 3 * x * (1 - x + x * x / 3);
    const yn = W.K * Kw * clat / (St * St * Sc);
    if (Math.abs(yn - yb) < 1e-13) { yb = yn; conv = true; break; }
    yb = yn;
  }
  const yF = yb * b, thCalc = W.kth * yF / W.L;
  const meas = W.amp_deg != null && isFinite(W.amp_deg);            // ölçülmüş/verilmiş genlik hesabın yerine geçer
  const theta = meas ? W.amp_deg * D2R : thCalc, y = meas ? theta * W.L / W.kth : yF;
  return { vcrit, Re, clat0, clat, ratio, active, Sc, lam, Ljb, Kw, yb, yF, thCalc, theta, y, acc: sq(TAU * W.fn) * y, meas, conv,
    lock: [vcrit * (1 - 0.4 * W.eps0), vcrit * (1 + 0.6 * W.eps0)],
    regime: Re < 3e5 ? 'alt-kritik' : (Re < 5e5 ? 'kritik geçiş' : (Re <= 5e6 ? 'süperkritik' : 'transkritik')) };
}
// Denizaltı mastı: kütle oranının kilitlenmeye etkisi (v13.3). Alt dal frekansı f*_alt = √((m* + 1)/(m* − 0,54))
// (Govardhan & Williamson 2000; f* = f/f_n, f_n durgun suda). Kilitlenme yanıtları "gerçek indirgenmiş hız" U*/f* ile
// çakıştığından (Khalak & Williamson 1999) kilitlenmenin üst ucu f*_alt ile ölçeklenir: K0_üst,etkin = K0_üst·f*_alt
// (ağır mastta f* → 1, kural değişmez). m* ≤ 0,54'te rezonans bütün hızlara uzanır (Govardhan & Williamson 2002):
// üst sınır yok, alt dal yok (yanıt frekansı hızla artar; f_v adayları kapsar). mstar null → eski sabit kural.
function vivMass(P) {
  const v = P.wb.viv, m = v.mstar;
  if (m == null || !isFinite(m)) return { on: false, mstar: null, fstar: 1, k0hi: v.K0_hi, flock: null, inf: false };
  if (m <= 0.54) return { on: true, mstar: m, fstar: Infinity, k0hi: Infinity, flock: null, inf: true };
  const fs = Math.sqrt((m + 1) / (m - 0.54));
  return { on: true, mstar: m, fstar: fs, k0hi: v.K0_hi * fs, flock: fs * v.fn, inf: false };
}
// Denizaltı: işletme hız zarfında (U_min–U_max, kn) K0 = St·U/(D·f_n) aralığı tarama bandıyla (payıyla) kesişiyor mu (v13.3).
// Kesişmiyorsa VIV oluşmaz (gemideki "v_crit > 1,25·U_max → incelenmez" kuralının karşılığı).
// Alt dala erişim (v13.3): üst → alt dal geçişinde yanıt frekansı vakumdaki doğal frekanstan geçer, f ≈ f_n,vak =
// f_n·√((m* + 1)/m*) (Govardhan & Williamson 2000; C_A = 1), ve kilitlenmede yanıt durgun silindirin kopma frekansının
// gerisinde kalır. Bu yüzden alt dal (f*_alt·f_n) ancak zarfın en yüksek hızındaki f_v, taramanın payıyla, f_n,vak'a
// ulaşırsa dwell adayıdır (gerekli koşul; tutucu). Ulaşmıyorsa yanıt f_n ile f_v adayları arasında kalır.
function vivRisk(P) {
  const v = P.wb.viv, M = vivMass(P), kn = 0.514444;
  const Ua = Math.min(v.Umin_kn, v.Umax_kn) * kn, Ub = Math.max(v.Umin_kn, v.Umax_kn) * kn;
  const K0a = v.St * Ua / (v.D * v.fn), K0b = v.St * Ub / (v.D * v.fn);
  const lo = v.K0_lo * (1 - v.margin), hi = M.inf ? Infinity : M.k0hi * (1 + v.margin), risk = K0b >= lo && K0a <= hi;
  const fvMax = K0b * v.fn, fvac = M.on && !M.inf ? v.fn * Math.sqrt((M.mstar + 1) / M.mstar) : null;
  const lock = risk && M.flock != null && fvMax * (1 + v.margin) >= fvac;
  return { K0a, K0b, lo, hi, risk, M, fvMax, fvac, lock };
}
// Etkin VIV kaynağı (platforma göre). A: direk/mast başının açısal genliği (rad, eşdeğer sinüs); roll/pitch: dönme
// vektörünün gövde eksenlerindeki bileşen katsayıları; y: öteleme genliği (m); tx/ty: öteleme yön kosinüsleri.
// Gemi: rüzgârın geldiği yön β (pruvadan); girdap kuvveti akışa dik yatay n = (−sin β, cos β); tepe +y·n'e
// giderken dönme vektörü θ·(z × n) = θ·(−cos β, −sin β, 0).
// Denizaltı (v13.3): ileri harekette akış pruvadan gelir (β = 0 karşılığı): kuvvet ve tepe ötelemesi y (iskele) yönünde,
// dönme vektörü −θ·x (roll = −1); öteleme y = θ·L/κ. Öteleme kapalıysa (lin = false; uyum kipi) eski yalnız açısal biçim.
function vivSpec(P) {
  if (!isShip(P)) {
    const v = P.wb.viv, on = v.on !== false, th = v.amp_deg * D2R, lin = v.lin !== false && v.L > 0, rk = vivRisk(P);
    return { kind: 'hydro', on, present: on && rk.risk, risk: rk, f: v.fn, A: th, roll: lin ? -1 : 1, pitch: 0,
      y: lin ? th * v.L / (v.kth > 0 ? v.kth : 1.5) : 0, tx: 0, ty: lin ? 1 : 0, lin, H: isFinite(v.drr_dB) ? v.drr_dB : -40 };
  }
  const W = P.wb.wviv, w = windVivCalc(P), on = W.on !== false, b = W.beta * D2R;
  return { kind: 'wind', on, present: on && w.theta > 0, f: W.fn, A: w.theta, roll: -Math.cos(b), pitch: -Math.sin(b),
    y: w.y, tx: -Math.sin(b), ty: Math.cos(b), lin: W.lin !== false, H: W.drr_dB, w };
}
// v13.14 (§13): laboratuvar yarım sinüs açı darbesinin genliği (°, ölçeksiz). 'ic' (varsayılan): yalnız iç tepe — θ_max, ω_max·T_p/π,
// α_max·(T_p/π)². 'gercek': ayrıca başta ve sondaki hız sıçramasının (πA/T_p) hexapod dinamiğinden (2. derece, f_bw, ζ 0,7071)
// sonra doğurduğu ivme tepesi κ·ω_b·πA/T_p ≤ α_max, κ = exp(−ζ/√(1−ζ²)·atan(√(1−ζ²)/ζ)) = e^(−π/4).
function pulseAmpDeg(P, Tp) {
  const hx = P.wb.hex; let A = Math.min(hx.theta_max, hx.omega_max * Tp / Math.PI, hx.alpha_max * sq(Tp / Math.PI));
  if (hx.pulseRule === 'gercek') { const z = 0.7071, r = Math.sqrt(1 - z * z), k = Math.exp(-z / r * Math.atan(r / z)); A = Math.min(A, hx.alpha_max * Tp / (k * Math.PI * TAU * hx.fbw)); }
  return A;
}
// Kaynak bu platformda var mı (işletme benzetimi ve bütçe ayrıştırması)
function sourceActive(P, id) {
  if (id === 'viv') return vivSpec(P).present;
  if (id === 'slap') return !isShip(P);          // dalga çarpması yalnız su içindeki mastta
  if (id === 'sea_s' || id === 'sea_w' || id === 'sea_h') { const D = seaDOF(P); return D.six && D.lin[['sea_s', 'sea_w', 'sea_h'].indexOf(id)].active; }
  if (id === 'lever') { const A = seaAccDirector(P); return A.lever[0] > 0 || A.lever[1] > 0 || A.lever[2] > 0; }
  return true;
}
function cloneParams(P) { return JSON.parse(JSON.stringify(P)); }

// ------------------------------------------------------ karmaşık aritmetik ---
function C(re, im) { return { re, im: im || 0 }; }
function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cdiv(a, b) { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function cabs(a) { return Math.hypot(a.re, a.im); }
function carg(a) { return Math.atan2(a.im, a.re); }
function cexpj(ph) { return { re: Math.cos(ph), im: Math.sin(ph) }; }

// eksen döngüsünün analitik modeli (sürekli zaman yaklaşık eşdeğeri)
// v13.9: Kfix verilirse kazanç yeniden tasarlanmaz — benzetimde K, dar bant res.f'deyken tasarlanır (derive) ve uyarlanır dar bant
// başka frekansa kaydığında aynı kalır; çalışma noktasının döngüsü loopModel(..., resF, d.loopEl.K) ile birebir verilir
function loopModel(ax, ctl, gyro, cur, J, resF, Kfix) {
  const wi = TAU * ax.fi, wlp = TAU * ctl.flp, zlp = ctl.zlp;
  const wg = TAU * gyro.fbw, wc = TAU * cur.fbw, tau = 1.5 / ctl.fctl;
  const res = ctl.res, wr = TAU * (resF || res.f), gr = Math.pow(10, res.gain_dB / 20) - 1;
  const Cs = (w) => {      // C(jω)/K
    const s = C(0, w);
    const pii = cmul(cadd(C(1), cdiv(C(wi), s)), cadd(C(1), cdiv(C(wi), s)));
    const lp = cdiv(C(wlp * wlp), cadd(cadd(cmul(s, s), C(0, 2 * zlp * wlp * w)), C(wlp * wlp)));
    let r = C(1);
    if (res.on) r = cadd(C(1), cdiv(C(0, gr * 2 * res.zeta * wr * w), cadd(cadd(cmul(s, s), C(0, 2 * res.zeta * wr * w)), C(wr * wr))));
    return cmul(cmul(pii, lp), r);
  };
  const Gs = (w) => cmul(cmul(cdiv(C(1), C(1, w / wg)), cdiv(C(1), C(1, w / wc))), cexpj(-w * tau));
  const Ps = (w) => { const s = C(0, w); return cdiv(s, cadd(cadd(cmul(C(J), cmul(s, s)), C(ax.b * 0, ax.b * w)), C(ax.k))); };
  const wct = TAU * ax.fc;
  // K, sürekli zaman tasarım modelinde f_c'de |L| = 1 olacak biçimde seçilir (örnek DUT'un kazanç tasarımı)
  const L1 = cmul(cmul(Cs(wct), Gs(wct)), Ps(wct));
  const K = Kfix != null && isFinite(Kfix) ? Kfix : 1 / cabs(L1);
  // Yanıtlar uygulanan ayrık kontrolcüyle hesaplanır (öykünme modeli, Nyquist altı): geri Euler PII (I[n] = I[n−1] + T·e[n], T/(1 − z⁻¹)),
  // bilineer AG ve rezonans biquadları, bir periyot hesap gecikmesi ve ZOH; akım ve gyro bantları sürekli
  const fctl = ctl.fctl, Tc = 1 / fctl, lpD = bqLP(ctl.flp, fctl, 1 / (2 * zlp)), bpD = bqBP(resF || res.f, fctl, 1 / (2 * res.zeta));
  const Cd = (w) => {
    const fq = w / TAU, zi = cexpj(-w * Tc), it = cdiv(C(wi * Tc), csub(C(1), zi)), p1 = cadd(C(1), it);
    const l = lpD.resp(fq, fctl); let r = C(1);
    if (res.on) { const b = bpD.resp(fq, fctl); r = cadd(C(1), cmul(C(gr), C(b.re, b.im))); }
    return cmul(cmul(cmul(p1, p1), C(l.re, l.im)), r);
  };
  const Zd = (w) => cmul(cexpj(-w * Tc), w === 0 ? C(1) : cdiv(csub(C(1), cexpj(-w * Tc)), C(0, w * Tc)));   // hesap gecikmesi × ZOH
  // FOG ek gecikmesi (v11): kazanç tasarımı (K) gecikmesiz kalır, gerçek döngü gecikmeyi taşır → faz payı azalır
  const tg = (gyro.lat_ms || 0) * 1e-3;
  const Gd0 = (w) => cmul(cmul(cdiv(C(1), C(1, w / wg)), cdiv(C(1), C(1, w / wc))), Zd(w));
  const Gd = tg > 0 ? (w) => cmul(Gd0(w), cexpj(-w * tg)) : Gd0;
  const L = (w) => cmul(C(K), cmul(cmul(Cd(w), Gd(w)), Ps(w)));
  const den = (w) => { const s = C(0, w); return cadd(cadd(cadd(cmul(C(J), cmul(s, s)), C(0, ax.b * w)), C(ax.k)), cmul(s, cmul(C(K), cmul(Cd(w), Gd(w))))); };
  const drr = (w) => cdiv(C(ax.k, ax.b * w), den(w));                         // θ/θ_taban
  const torque = (w) => cdiv(C(1), den(w));                                    // θ/T_d  (rad/N·m)
  const ZdG = tg > 0 ? (w) => cmul(Zd(w), cexpj(-w * tg)) : Zd;
  const gyroN = (w) => cdiv(cmul(C(-K), cmul(Cd(w), cmul(cdiv(C(1), C(1, w / wc)), ZdG(w)))), den(w)); // θ/n (rad per rad/s)
  // kesim frekansı ve faz payı (ayrık öykünme modelinde |L| = 1 noktası), kazanç payı
  let fcx = ax.fc;
  { let lo = 0.3 * ax.fc, hi = 3 * ax.fc; for (let it = 0; it < 60; it++) { const md = Math.sqrt(lo * hi); if (cabs(L(TAU * md)) > 1) lo = md; else hi = md; } fcx = Math.sqrt(lo * hi); }
  const pm = 180 + carg(L(TAU * fcx)) * R2D;
  // kazanç payı: açılmış fazın −180°'yi kestiği frekansta −|L| (dB)
  let gm = Infinity, gmF = null;
  {
    let prev = null, unw = 0;
    for (let f = fcx; f < 0.49 * ctl.fctl; f *= 1.01) {
      const ph = carg(L(TAU * f)) * R2D;
      if (prev != null) { while (ph + unw - prev > 180) unw -= 360; while (ph + unw - prev < -180) unw += 360; }
      const pu = ph + unw;
      if (prev != null && prev > -180 && pu <= -180) {
        // v13.9: kesişme %1'lik ızgara aralığında ikiye bölmeyle bulunur (önceden ızgaranın kesişmeden sonraki noktası: ±0,1 dB, ±%1)
        let a = f / 1.01, c = f; const phU = (x) => { let q = carg(L(TAU * x)) * R2D + unw; while (q - prev > 180) q -= 360; while (q - prev < -180) q += 360; return q; };
        for (let k = 0; k < 50; k++) { const m = Math.sqrt(a * c); if (phU(m) > -180) a = m; else c = m; }
        gmF = Math.sqrt(a * c); gm = -db(cabs(L(TAU * gmF))); break;
      }
      prev = pu;
    }
  }
  return { K, wi, pm, gm, gmF, fcx, L, drr, torque, gyroN, J };
}

// --------------------------------------------------------- türetilmiş ----------
function derive(P) {
  const wb = P.wb, dut = P.dut;
  const ch = wb.channels.find(c => c.name === wb.refChannel) || wb.channels[0];
  const IFOV = ch.p_um / ch.f_mm * 1e-3;                     // rad (12 µm / 300 mm = 40 µrad)
  const FOVh = 2 * Math.atan(ch.Nh * ch.p_um * 1e-6 / (2 * ch.f_mm * 1e-3)) * R2D;
  const FOVv = 2 * Math.atan(ch.Nv * ch.p_um * 1e-6 / (2 * ch.f_mm * 1e-3)) * R2D;
  const Tint = ch.Tint_ms * 1e-3, fps = ch.fps;
  const req = { wander: wb.k_wander * IFOV, smear: wb.k_smear * IFOV, drift: wb.drift_ifov * IFOV,
                p99: wb.k_conf * wb.k_wander * IFOV, rot: wb.k_roll * IFOV };
  // Görüntü rotasyonu: LOS etrafındaki ψ dönmesi optik eksenden θ açısal uzaklıktaki noktayı ≈ ψ·θ kaydırır. Ölçüt
  // noktası köşe (yarı köşegen) ya da kenar (Nh/2). Roll sınırı ψ_lim = k_roll·IFOV / θ_ref ≈ k_roll / r_px (IFOV'dan
  // bağımsız). Kenar ölçütü FOVh/2'dir (v10 davranışı).
  const rCpx = 0.5 * Math.hypot(ch.Nh, ch.Nv), rEpx = ch.Nh / 2;
  const angC = Math.atan(rCpx * ch.p_um * 1e-6 / (ch.f_mm * 1e-3)), angE = FOVh / 2 * D2R;
  const rotCorner = wb.rotRef !== 'edge';
  const rot = { ref: rotCorner ? 'corner' : 'edge', rPx: rotCorner ? rCpx : rEpx, ang: rotCorner ? angC : angE, rCpx, rEpx, angC, angE,
    lim: wb.k_roll * IFOV / (rotCorner ? angC : angE), limC: wb.k_roll * IFOV / angC, limE: wb.k_roll * IFOV / angE,
    // artık rotasyon ψ (rad) → ölçüt noktasının yer değiştirmesi (rad); kenar kipinde önceki sürümle aynı işlem sırası
    of: (psi) => rotCorner ? psi * angC : psi * FOVh / 2 * D2R };
  const hx = wb.hex;
  const reach = (f) => Math.min(hx.theta_max, hx.omega_max / (TAU * f), hx.alpha_max / sq(TAU * f));  // ° (hexapod erişimi)
  const reachLim = (f) => { const a = hx.theta_max, b = hx.omega_max / (TAU * f), c = hx.alpha_max / sq(TAU * f); const m = Math.min(a, b, c); return m === a ? 'Aralık' : (m === b ? 'Hız' : 'İvme'); };
  const stabOffMax = hx.stabOff_ratio * Math.min(FOVh, FOVv);  // °
  // dünya dönüşü: ENU
  const E = wb.earth, phi = E.lat * D2R;
  const OmL = [0, E.Omega * Math.cos(phi), E.Omega * Math.sin(phi)];
  const al = E.az * D2R, ep = E.el * D2R;
  const los0 = [Math.sin(al) * Math.cos(ep), Math.cos(al) * Math.cos(ep), Math.sin(ep)];
  // kompanzasyon hatası: |Δ| = Ω·δ, LOS'a ve Ω'ya dik (görüntü eksenlerine en kötü yansıyan)
  let dvec = [los0[1] * OmL[2] - los0[2] * OmL[1], los0[2] * OmL[0] - los0[0] * OmL[2], los0[0] * OmL[1] - los0[1] * OmL[0]];
  let dn = Math.hypot(dvec[0], dvec[1], dvec[2]);
  if (dn < 1e-12) { dvec = [0, 0, 1]; dn = 1; }
  const dmag = E.Omega * E.delta_deg * D2R;
  const Delta = dvec.map(v => v / dn * dmag);
  const a0 = dut.geom.a0 * D2R, e0 = (dut.geom.e0 != null ? dut.geom.e0 : E.el) * D2R;
  const beta = Math.atan2(los0[1], los0[0]) - a0;              // pruvanın doğudan açısı (CCW)
  // döngüler
  const elJ = dut.el.J;
  const azJ = dut.az.Ja + dut.az.Jex * sq(Math.sin(e0)) + dut.az.Jez * sq(Math.cos(e0));
  const loopEl = loopModel(dut.el, dut.ctl, dut.gyro, dut.cur, elJ);
  const loopAz = loopModel(dut.az, dut.ctl, dut.gyro, dut.cur, azJ);
  // dünya dönüşünün görüntü eksenlerine izdüşümü (ENU; LOS azimutu α, elevasyonu ε)
  const earthImg = {
    h: E.Omega * Math.abs(Math.sin(phi) * Math.cos(ep) - Math.cos(phi) * Math.cos(al) * Math.sin(ep)),
    v: E.Omega * Math.abs(Math.cos(phi) * Math.sin(al)),
    r: E.Omega * Math.abs(Math.cos(phi) * Math.cos(al) * Math.cos(ep) + Math.sin(phi) * Math.sin(ep)),
  };
  return { ch, IFOV, FOVh, FOVv, Tint, fps, Nh: ch.Nh, Nv: ch.Nv, req, rot, reach, reachLim, stabOffMax,
           OmL, los0, Delta, dmag, a0, e0, beta, azJ, loopEl, loopAz, earthImg };
}

// ---------------------------------------------------------------- kolimatör ve göz bebeği kayması (v13.4, kılavuz §5)
// Kolimatör, odak düzlemindeki iğne deliğini (arkasında siyah cisim) paralel demete çevirir: DUT için hedef sonsuzdadır ve
// öteleme görüntüyü kaydırmaz. Uygunluk ölçütleri: (1) f_c/f_DUT ≥ oran_min (hedef görüntüsü küçük kalır, kolimatörün odak ve
// aberasyon hataları DUT odak düzleminde f_DUT/f_c ile küçülür); (2) iğne deliğinin açısal boyutu d/f_c ve DUT odak
// düzlemindeki görüntüsü d·f_DUT/f_c ≤ p (alt piksel nokta hedef); (3) açıklık: demet, hareket boyunca DUT giriş göz bebeğini
// taşırmalıdır, D_c ≥ k·(D_p + 2e), e = en büyük yanal göz bebeği kayması. Göz bebeği E gimbal merkezi G'nin L_pg önündedir
// (LOS boyunca); pivot O testlerin kurulumunda göz bebeğindedir (T2.5'in ikinci koşusunda h aşağıda). Stab ON'da LOS
// laboratuvarda sabittir, G tabanla döner: E − E0 = (R − I)(G − O); stab OFF'ta yük tabanla döner: E − E0 = (R − I)(E0 − O).
// Hexapod ötelemesi (6-DOF, kaldıraç kolu, VIV) göz bebeğini doğrudan taşır. L_off: pivotun göz bebeğinden kaçıklığı
// (kurulum toleransı), en kötü yönde L_off·sin θ⊥ eklenir (θ⊥: dönmenin LOS'a dik bileşeni). ΔT (siyah cisim kontrastı) bilgi.
function collGeom(P, e0Deg) {
  const d = derive(P), C = P.wb.coll, ch = d.ch, hx = P.wb.hex, wb = P.wb;
  const alC = wb.earth.az * D2R, a0 = d.a0, e0 = e0Deg != null ? e0Deg * D2R : d.e0;      // v13.5: senaryonun LOS yükselişi (T1.4)
  const los0 = [Math.sin(alC) * Math.cos(e0), Math.cos(alC) * Math.cos(e0), Math.sin(e0)];
  const beta = Math.atan2(los0[1], los0[0]) - a0;
  let yr = [-los0[1], los0[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = [yr[0] / n, yr[1] / n, 0]; }
  const zr = [los0[1] * yr[2] - los0[2] * yr[1], los0[2] * yr[0] - los0[0] * yr[2], los0[0] * yr[1] - los0[1] * yr[0]];
  const losB = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
  const Dp = (ch.Dp_mm || 0) * 1e-3, Dc = C.Dc_mm * 1e-3, k = C.ap_margin > 0 ? C.ap_margin : 1;
  const ratio = C.fc_mm / ch.f_mm, phRad = C.pinhole_um * 1e-6 / (C.fc_mm * 1e-3), phImg = C.pinhole_um * ch.f_mm / C.fc_mm;
  return { Dp, Dc, k, eFree: (Dc / k - Dp) / 2, apStatic: k * Dp, apOk: Dc >= k * Dp, ratio, ratioMin: C.ratio_min, ratioOk: ratio >= C.ratio_min,
    phRad, phIFOV: phRad / d.IFOV, phImg_um: phImg, p_um: ch.p_um, phOk: phImg <= ch.p_um, dT: C.dT, fc_mm: C.fc_mm, ch: ch.name,
    Lpg: P.dut.L_pg, Loff: hx.L_off || 0, cb: Math.cos(beta), sb: Math.sin(beta), yr, zr, losB,
    // v13.5: paralaks — 1/R = δ/f_c² (1/m); δ_izin = f_c²·θ_izin/e (e verilince)
    delta_um: C.delta_um || 0, parK: (C.delta_um || 0) * 1e-6 / sq(C.fc_mm * 1e-3), parAllow: (C.par_allow_urad > 0 ? C.par_allow_urad : 1) * 1e-6,
    deltaMax: (e) => (e > 0 ? sq(C.fc_mm * 1e-3) * (C.par_allow_urad > 0 ? C.par_allow_urad : 1) * 1e-6 / e : Infinity),
    eVig: (Dc - Dp) / 2 };
}
// D_p çaplı göz bebeği dairesinin, merkezi s kadar kaymış D_c çaplı demet dairesi içinde kalan alan oranı (iki daire kesişimi)
function pupilOverlap(Dp, Dc, s) {
  const r = Dp / 2, R = Dc / 2;
  if (!(r > 0)) return 1;
  if (s >= r + R) return 0; if (s <= R - r) return 1; if (s <= r - R) return (R * R) / (r * r);
  const a = r * r * Math.acos(clamp((s * s + r * r - R * R) / (2 * s * r), -1, 1)), b = R * R * Math.acos(clamp((s * s + R * R - r * r) / (2 * s * R), -1, 1));
  const c = 0.5 * Math.sqrt(Math.max(0, (-s + r + R) * (s + r - R) * (s - r + R) * (s + r + R)));
  return (a + b - c) / (Math.PI * r * r);
}
// Taban duruşu (φ, θ, ψ; 03_sim.js ile aynı dönüş sırası R = Rz·Ry·Rx), gövde eksenindeki öteleme t (m), stab ve pivot
// derinliği hP (pivot göz bebeğinin hP altında; testlerde 0) için göz bebeğinin LOS'a dik kayması: [yatay (yr), düşey (zr)], m
function pupilShift(G, ph, th, ps, t, stab, hP) {
  const cph = Math.cos(ph), sph = Math.sin(ph), cth = Math.cos(th), sth = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps);
  const R = [[cps * cth, cps * sth * sph - sps * cph, cps * sth * cph + sps * sph], [sps * cth, sps * sth * sph + cps * cph, sps * sth * cph - cps * sph], [-sth, cth * sph, cth * cph]];
  const h = hP || 0, L = G.Lpg, lb = G.losB;
  // stab ON: G − O = −L_pg·l̂ + h·ẑ ; stab OFF: E0 − O = h·ẑ
  const v = stab ? [-L * lb[0], -L * lb[1], -L * lb[2] + h] : [0, 0, h];
  const dE = [t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0];
  for (let i = 0; i < 3; i++) dE[i] += R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2] - v[i];
  const l = [G.cb * dE[0] - G.sb * dE[1], G.sb * dE[0] + G.cb * dE[1], dE[2]];
  let hz = l[0] * G.yr[0] + l[1] * G.yr[1] + l[2] * G.yr[2], vt = l[0] * G.zr[0] + l[1] * G.zr[1] + l[2] * G.zr[2];
  return [hz, vt];
}
// Senaryonun komut profilinden (açısal komut + hexapod ötelemesi; hexapodun ilettiği hareket 1 Hz'in altında komutla aynıdır)
// en büyük yanal göz bebeği kayması, vinyetleme süresi ve en düşük örtüşme. o.fs: değerlendirme hızı (Hz). v13.4: 200 Hz — 50 Hz,
// tam sayı frekanslı test sinüslerinde (T2.5: 1 ve 2 Hz) her çevrimde aynı fazları örneklediği için tepeyi %0,2–0,8 ve vinyetleme
// süresini 1,6 puan eksik veriyordu (bağımsız 1 kHz değerlendirmesiyle karşılaştırma: probe/k6/sweep.js)
function pupilExcursion(P, S, o) {
  o = o || {};
  const G = collGeom(P, S.e0), fs = o.fs || 200, n = Math.max(3, Math.round(S.T * fs)), stab = S.stab !== false, hP = S.pivotH || 0;
  const rng = makeRngFactory(S.seed == null ? 1 : S.seed), cm = makeChannel(S.cmd || [], fs, rng), tr = makeChannel(S.trans || [], fs, rng);
  const a = [0, 0, 0], t = [0, 0, 0], l = G.losB;
  let eMax = 0, hMax = 0, vMax = 0, ovMin = 1, nVig = 0, thPerp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / fs; cm.eval(tt, a); if (tr.comps.length) tr.eval(tt, t);
    const [hz, vt] = pupilShift(G, a[0], a[1], a[2], t, stab, hP);
    const dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2], tp = Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]);
    const e = Math.hypot(hz, vt) + G.Loff * Math.sin(Math.min(tp, Math.PI / 2)), ov = pupilOverlap(G.Dp, G.Dc, e);
    if (e > eMax) eMax = e; if (Math.abs(hz) > hMax) hMax = Math.abs(hz); if (Math.abs(vt) > vMax) vMax = Math.abs(vt);
    if (tp > thPerp) thPerp = tp; if (ov < ovMin) ovMin = ov; if (ov < 1 - 1e-9) nVig++;
  }
  return { eMax, hMax, vMax, thPerp, ovMin, fVig: nVig / n, req: G.k * (G.Dp + 2 * eMax), ok: eMax <= G.eFree + 1e-12, eFree: G.eFree, Dc: G.Dc, Dp: G.Dp, k: G.k, stab, hP };
}
// v13.5: oran → yüzde metni. 1'in (0'ın) hemen altındaki (üstündeki) oranlar %100,0 (%0,0) diye yuvarlanmaz: gerçek vinyetlemede
// test GEÇERSİZ olurken örtüşme '%100.0' yazmasın (gemi D_c = 150 mm: en düşük örtüşme 0,99989, sürenin %0,05'i)
function pctFine(x) {
  const p = 100 * x;
  if (x < 1 - 1e-9 && p >= 99.95) return fmt(Math.min(p, 99.999), p >= 99.995 ? 3 : 2);
  if (x > 1e-9 && p < 0.05) return fmt(Math.max(p, 0.001), p < 0.005 ? 3 : 2);
  return fmt(p, 1);
}
// test sonuçları için ortak metin: kv satırı ve (açıklık yetmiyorsa) not
function pupilTxt(P, X) {
  const mm = (v) => fmt(v * 1e3, 1), vig = X.ovMin < 1 - 1e-9, rule = P.wb.coll.vigRule !== false;
  const kv = [`Göz bebeği ↔ kolimatör demeti (${X.stab ? 'stab ON' : 'stab OFF'})`, `en büyük yanal kayma ${mm(X.eMax)} mm (yatay ${mm(X.hMax)}, düşey ${mm(X.vMax)}; sınır (D_c/k − D_p)/2 = ${mm(X.eFree)} mm) → gerekli D_c ${fmt(X.req * 1e3, 0)} mm (mevcut ${fmt(X.Dc * 1e3, 0)}); en düşük örtüşme %${pctFine(X.ovMin)}, vinyetleme süresi %${pctFine(X.fVig)}`];
  const note = X.ok ? null : `Kolimatör açıklığı bu hareket için yetersiz: göz bebeği en çok ${mm(X.eMax)} mm yana kayıyor (k = ${X.k} paylı sınır ${mm(X.eFree)} mm), gerekli D_c ${fmt(X.req * 1e3, 0)} mm. ` +
    (X.ovMin < 1 ? `Demet göz bebeğini sürenin %${pctFine(X.fVig)}'inde tam kaplamıyor (en düşük örtüşme %${pctFine(X.ovMin)}): sinyal bu oranda düşer, centroid gürültüsü artar ve aberasyonlu optikte nokta görüntüsü kayabilir. ` : 'Göz bebeği demetin içinde kalıyor ama pay tükeniyor. ') +
    (vig && rule ? 'Demet göz bebeğini tam kaplamadığı için test bu düzenekte tanımlandığı gibi yapılamaz: sonuç GEÇERSİZ (benzetim kolimatörü ideal alır). '
      : (vig ? 'Benzetim kolimatörü ideal (vinyetlemesiz) alır: sonuç bu kurulumda ölçülebilir olmayabilir. ' : 'Vinyetleme yok; k paylı sınır aşıldı (bilgi). ')) +
    'Daha büyük açıklıklı kolimatör kullanın ya da yanal ötelemeyi ayrı testte (T2.5) ölçün.';
  return { kv, note };
}
// v13.5 (kullanıcı kararı): gerçek vinyetleme (e > (D_c − D_p)/2, örtüşme < 1) → test GEÇERSİZ (hexapod sınırı kuralıyla aynı);
// yalnız k paylı sınır aşılırsa not. res: test sonucu (mkResult), X: pupilExcursion (en kötü koşu)
function pupilRule(P, res, X) {
  if (!X || P.wb.coll.vigRule === false || !(X.ovMin < 1 - 1e-9)) return res;
  const mm = (v) => fmt(v * 1e3, 1);
  res.status = 'GEÇERSİZ';
  res.measured = `Kolimatör demeti göz bebeğini tam kaplamıyor (kayma ${mm(X.eMax)} mm > (D_c − D_p)/2 = ${mm((X.Dc - X.Dp) / 2)} mm, en düşük örtüşme %${pctFine(X.ovMin)}): sonuç GEÇERSİZ. ` + res.measured;
  return res;
}
// v13.5 (kullanıcı kararı): laboratuvar ötelemesini kolimatör sınırına sığdırma. comps: ölçeklenecek öteleme bileşenleri (deniz
// ötelemesi, 'series', scale alanı); S: tam senaryo (açısal komut + bütün ötelemeler). e ≤ e_free olacak en büyük ortak oran
// q_c ∈ [0, 1] ikiye bölmeyle (16 adım, komut profilinden) bulunur; bileşenlerin scale'i q_c ile çarpılır. Açısal hareket tek başına
// sınırı aşıyorsa q_c = 0 (öteleme kaldırılır) ve kalan aşım test kuralına (pupilRule) bırakılır.
function fitTransToColl(P, S, comps) {
  if (!comps || !comps.length || P.wb.coll.fitTrans === false) return { qc: 1 };
  // Kayma ötelemeye göre doğrusaldır: e(t; f) = |a(t) + f·b(t)| + L_off·sin θ⊥(t); a: açısal hareket + ölçeklenmeyen öteleme (ör. VIV
  // tonu), b: ölçeklenen ötelemenin izdüşümü. Diziler bir kez 100 Hz'de çıkarılır (deniz hareketi < 1,5 Hz: tepe örnekleme hatası
  // < %0,1), oran ikiye bölmeyle e ≤ e_free·(1 − 10⁻³) için bulunur; pupilExcursion'ın 200 Hz değerlendirmesi böylece sınırda kalır.
  const G = collGeom(P, S.e0), fs = 100, n = Math.max(3, Math.round(S.T * fs)), stab = S.stab !== false, hP = S.pivotH || 0, tol = 1e-12, eT = G.eFree * (1 - 1e-3);
  const rng = makeRngFactory(S.seed == null ? 1 : S.seed), cm = makeChannel(S.cmd || [], fs, rng), trA = makeChannel(S.trans || [], fs, rng), trS = makeChannel(comps, fs, rng);
  const ah = new Float64Array(n), av = new Float64Array(n), bh = new Float64Array(n), bv = new Float64Array(n), lt = new Float64Array(n);
  const a = [0, 0, 0], tA = [0, 0, 0], tS = [0, 0, 0], tF = [0, 0, 0], l = G.losB;
  for (let i = 0; i < n; i++) {
    const t = i / fs; cm.eval(t, a); trA.eval(t, tA); trS.eval(t, tS);
    for (let k = 0; k < 3; k++) tF[k] = tA[k] - tS[k];
    const [h0, v0] = pupilShift(G, a[0], a[1], a[2], tF, stab, hP);
    // b: ölçeklenen ötelemenin izdüşümü (dönüşsüz pupilShift ile aynı: Rz(β)·t → yr, zr)
    const lx = G.cb * tS[0] - G.sb * tS[1], ly = G.sb * tS[0] + G.cb * tS[1], lz = tS[2];
    ah[i] = h0; av[i] = v0; bh[i] = lx * G.yr[0] + ly * G.yr[1] + lz * G.yr[2]; bv[i] = lx * G.zr[0] + ly * G.zr[1] + lz * G.zr[2];
    const dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2];
    lt[i] = G.Loff * Math.sin(Math.min(Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]), Math.PI / 2));
  }
  const ex = (f) => { let m = 0; for (let i = 0; i < n; i++) { const e = Math.hypot(ah[i] + f * bh[i], av[i] + f * bv[i]) + lt[i]; if (e > m) m = e; } return m; };
  const s0 = comps.map(c => (c.scale == null ? 1 : c.scale)), set = (f) => comps.forEach((c, i) => { c.scale = s0[i] * f; });
  const e1 = ex(1);
  if (e1 <= eT + tol) return { qc: 1, e1, e: e1 };
  const e0 = ex(0);
  if (e0 > eT + tol) { set(0); return { qc: 0, e1, e: e0 }; }
  let lo = 0, hi = 1;
  for (let it = 0; it < 26; it++) { const m = 0.5 * (lo + hi); if (ex(m) <= eT + tol) lo = m; else hi = m; }
  set(lo);
  return { qc: lo, e1, e: ex(lo) };
}
