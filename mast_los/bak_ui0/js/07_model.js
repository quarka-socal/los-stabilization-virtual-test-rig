// ---------------------------------------------------------------- model / parametreler
// [yol, etiket, birim, rol, seçenekler]; rol etiketi: kanal, gereksinim, kabul kuralı, düzenek, senaryo, bütçe varsayımı, analiz;
// 'örnek' (DUT, gerçek ürün değil) ve 'kalibre' (analitik bütçeye kalibre edilmiş düzey) turuncu gösterilir
const SCHEMA = [
  { g: 'Referans kanal ve gereksinimler', src: 'kanal · gereksinim · kabul kuralı', open: true, items: [
    ['wb.refChannel', 'Bütçe referans kanalı', '', 'kanal', { sel: ['MWIR-NFOV', 'MWIR-WFOV', 'HDTV-NFOV', 'SWIR-NFOV'], rerender: true }],
    ['@fmt', 'Referans kanalın dizin formatı (sensör çözünürlüğü)', 'px', 'kanal', { fmtSel: true }],
    ['@ch.Nh', 'Referans kanal: yatay piksel sayısı Nh', 'px', 'kanal', { refCh: 'Nh' }], ['@ch.Nv', 'Referans kanal: düşey piksel sayısı Nv', 'px', 'kanal', { refCh: 'Nv' }],
    ['@ch.p_um', 'Referans kanal: piksel aralığı p', 'µm', 'kanal', { refCh: 'p_um' }], ['@ch.f_mm', 'Referans kanal: odak uzaklığı f', 'mm', 'kanal', { refCh: 'f_mm' }],
    ['@ch.fps', 'Referans kanal: kare hızı', 'Hz', 'kanal', { refCh: 'fps' }], ['@ch.Tint_ms', 'Referans kanal: entegrasyon süresi T_int', 'ms', 'kanal', { refCh: 'Tint_ms' }],
    ['@ch.Dp_mm', 'Referans kanal: giriş göz bebeği çapı D_p (kolimatör açıklığı denetimi)', 'mm', 'kanal', { refCh: 'Dp_mm' }],
    ['wb.k_wander', 'k_wander — izin verilen kareler arası kayma', 'IFOV', 'gereksinim'], ['wb.k_smear', 'k_smear — izin verilen kare içi bulanıklık', 'IFOV', 'gereksinim'],
    ['wb.tau', 'Drift penceresi τ', 's', 'gereksinim'], ['wb.drift_ifov', 'İzin verilen drift (τ içinde)', 'IFOV', 'gereksinim'],
    ['wb.k_conf', 'Güven çarpanı k_conf', '—', 'kabul kuralı'], ['wb.TUR_target', 'Hedef TUR', '—', 'kabul kuralı'],
    ['wb.TUR_def', 'TUR tanımı', '', 'kabul kuralı', { sel: [['k1', 'k = 1: TUR = R / u'], ['Z540.3', 'Z540.3: TUR = R / (k·u)']], rerender: true }],
    ['wb.k_exp', 'Genişletme katsayısı k (Z540.3 tanımında)', '—', 'kabul kuralı', { show: (P) => String(P.wb.TUR_def).startsWith('Z540') }],
    ['wb.k_roll', 'Görüntü rotasyonu: ölçüt noktasında izin verilen kayma', 'IFOV', 'gereksinim'],
    ['wb.rotRef', 'Görüntü rotasyonu ölçüt noktası', '', 'gereksinim tanımı', { sel: [['corner', 'köşe pikseli (yarı köşegen)'], ['edge', 'alan kenarı (Nh/2)']] }],
    ['wb.extRows', 'Ek bütçe satırları (B1-08 deniz ötelemesi, B1-09/B1-10 FOG)', '', 'bütçe kapsamı', { bool: true }] ] },
  { g: 'Deniz hareketi (platforma göre)', src: 'senaryo: denizaltı ve gemi örnekleri · 6-DOF: proje profili', items: [
    ['wb.sea.mode', 'Profil kipi', '', 'senaryo', { sel: [['dar', 'dar bant, açısal (eşdeğer sinüs + baskın periyot)'], ['6dof', '6-DOF bant profili (± tepe genlik)']], rerender: true }],
    ['wb.sea.roll_A', 'Roll genliği (eşdeğer sinüs)', '°', 'senaryo (örnek)', { refShip: 'örnek: NATO sınırı 4° RMS', show: (P) => P.wb.sea.mode !== '6dof' }], ['wb.sea.roll_T', 'Roll baskın periyodu', 's', 'senaryo (örnek)', { refShip: 'örnek: ≈ 10 s (model, Froude ölçeği)', show: (P) => P.wb.sea.mode !== '6dof' }],
    ['wb.sea.pitch_A', 'Pitch genliği', '°', 'senaryo (örnek)', { refShip: 'örnek: NATO sınırı 1,5° RMS', show: (P) => P.wb.sea.mode !== '6dof' }], ['wb.sea.pitch_T', 'Pitch periyodu', 's', 'senaryo (örnek)', { refShip: 'örnek (tahmini)', show: (P) => P.wb.sea.mode !== '6dof' }],
    ['wb.sea.yaw_A', 'Yaw genliği', '°', 'senaryo (örnek)', { refShip: 'örnek (denizaltıyla aynı)', show: (P) => P.wb.sea.mode !== '6dof' }], ['wb.sea.yaw_T', 'Yaw periyodu', 's', 'senaryo (örnek)', { refShip: 'örnek (denizaltıyla aynı)', show: (P) => P.wb.sea.mode !== '6dof' }],
    ['env.seaWidth', 'Dar bant genişliği σ_ln (log-frekansta Gauss; bant ≈ f·e^(±2σ_ln))', '—', 'senaryo', { show: (P) => P.wb.sea.mode !== '6dof' }],
    ['@sea6', '6-DOF profil: ± tepe genlik ve frekans bandı', '', 'proje profili (varsayım; standart değil)', { table6: true, show: (P) => P.wb.sea.mode === '6dof' }],
    ['wb.sea.kp', 'Tepe çarpanı k_p (rastgele profilde σ = A/k_p)', '—', 'profil yorumu: 3', { show: (P) => P.wb.sea.mode === '6dof' }],
    ['wb.sea.h', 'Kaldıraç kolu h = r_z: mast başı / direktör yüksekliği (hareket referans noktasının üstünde, yukarı +)', 'm', 'senaryo (örnek: denizaltı 1, gemi 15)'],
    ['wb.sea.rx', 'Kaldıraç kolu r_x: LOS referans noktasının boyuna konumu (pruva +)', 'm', 'senaryo (örnek: 0)'],
    ['wb.sea.ry', 'Kaldıraç kolu r_y: enine konum (iskele +)', 'm', 'senaryo (örnek: 0)'] ] },
  { g: 'Hidrodinamik VIV — denizaltı mastı', src: 'senaryo: su içinde ilerleyen mast', plat: 'sub', items: [
    ['wb.viv.on', 'Hidrodinamik VIV etkisi (su içinde ilerleyen mast)', '', 'senaryo', { bool: true }],
    ['wb.viv.D', 'Mast karakteristik boyutu D', 'm', 'senaryo'], ['wb.viv.St', 'Strouhal sayısı', '—', 'fizik: dairesel kesit ≈ 0,2'],
    ['wb.viv.fn', 'Mast ilk eğilme modu f_n (durgun suda, eklenmiş kütleyle)', 'Hz', 'senaryo'], ['wb.viv.K0_lo', 'VIV tarama bandı alt K0', '—', 'tarama kuralı'],
    ['wb.viv.K0_hi', 'VIV tarama bandı üst K0', '—', 'tarama kuralı'], ['wb.viv.margin', 'Tarama bandı payı (sınırda bölgesi)', 'oran', 'tarama kuralı'],
    ['wb.viv.amp_deg', 'VIV kaynaklı mast başı açısal genliği (f_n\'de, roll; ölçüm ya da yapı analizi)', '°', 'senaryo'],
    ['wb.viv.drr_dB', 'Bütçe varsayımı: f_n\'de DRR (B2-01 tahmini)', 'dB', 'bütçe varsayımı'],
    ['wb.viv.lin', 'Mast başı ötelemesi de uygulanır (dengesizlik + optik montaj yolu)', '', 'senaryo', { bool: true }],
    ['wb.viv.L', 'Mast serbest boyu L (destekten mast başına; öteleme y = θ·L/κ)', 'm', 'örnek: periskop 4,2 m'],
    ['wb.viv.kth', 'Tepe eğim oranı κ = θ·L/y (1,5 tepe kütlesi baskın; 1,38 düzgün konsol)', '—', 'örnek'],
    ['wb.viv.mstar', 'Kütle oranı m* = m/(ρπD²/4), birim boy (boş = sabit K0 kuralı)', '—', 'örnek: periskop ≈ 1,2', { nul: true }],
    ['wb.viv.Umin_kn', 'İşletme hız zarfı, mast açıkken: alt', 'kn', 'proje'], ['wb.viv.Umax_kn', 'İşletme hız zarfı, mast açıkken: üst', 'kn', 'proje'] ] },
  { g: 'Rüzgâr kaynaklı girdap kopması — gemi direği', src: 'EN 1991-1-4:2005 Ek E, yaklaşım 1', plat: 'ship', items: [
    ['wb.wviv.on', 'Rüzgâr VIV etkisi (direk modunun kilitlenmesi)', '', 'senaryo', { bool: true }],
    ['wb.wviv.D', 'Direk çapı b (girdap kopma bölgesi, üst üçte bir)', 'm', 'örnek: Ø0,40 m boru'], ['wb.wviv.L', 'Direk serbest yüksekliği l (mesnet → direktör)', 'm', 'örnek'],
    ['wb.wviv.fn', 'Direk + direktör ilk eğilme modu f_n (rüzgâra dik)', 'Hz', 'örnek: Rayleigh, rijit mesnet'], ['wb.wviv.me', 'Eşdeğer kütle m_e (birim boy, tepe kütlesi dahil)', 'kg/m', 'örnek (EN 1991-1-4 F.4)'],
    ['wb.wviv.delta', 'Yapısal sönüm δ_s (logaritmik azalma)', '—', 'örnek: kaynaklı çelik'], ['wb.wviv.St', 'Strouhal sayısı (dairesel kesit)', '—', 'EN 1991-1-4 Tablo E.1'],
    ['wb.wviv.Umax', 'İşletme zarfı: en büyük görünür rüzgâr (direk yüksekliği, 10 dk ort.)', 'm/s', 'proje'], ['wb.wviv.beta', 'Görünür rüzgârın geliş yönü β (pruvadan, iskele +)', '°', 'senaryo'],
    ['wb.wviv.kth', 'Tepe eğim oranı κ = θ·l/y (1,5 tepe kütlesi baskın; 1,38 düzgün konsol)', '—', 'örnek'], ['wb.wviv.lin', 'Direk tepesi ötelemesi de uygulanır (dengesizlik + optik montaj yolu)', '', 'senaryo', { bool: true }],
    ['wb.wviv.ftol', 'f_n belirsizliği (T2.1 bandı ve T2.2 dwell frekansları)', 'oran', 'örnek'], ['wb.wviv.eps0', 'Kilitlenme hız bandı ε0: [v_crit(1 − 0,4ε0), v_crit(1 + 0,6ε0)] (yalnız tablo)', '—', 'varsayım: ε0 EN 1991-1-4 E.1.5.2.6 bant çarpanı; 2/5–3/5 bölüşüm Clobes ve ark. (2012)'],
    ['wb.wviv.drr_dB', 'Bütçe varsayımı: f_n\'de DRR (B2-01 tahmini)', 'dB', 'bütçe varsayımı'], ['wb.wviv.amp_deg', 'Ölçülmüş direk tepesi açısal genliği (boş = hesap)', '°', 'girin', { nul: true }] ] },
  { g: 'Hexapod ve kolimatör', src: 'düzenek', items: [
    ['wb.hex.theta_max', 'Maks. açısal genlik θ_max', '°', 'düzenek'], ['wb.hex.omega_max', 'Maks. açısal hız ω_max', '°/s', 'düzenek'],
    ['wb.hex.alpha_max', 'Maks. açısal ivme α_max', '°/s²', 'düzenek'], ['wb.hex.fbw', 'Dinamik bant genişliği f_bw', 'Hz', 'düzenek'],
    ['wb.hex.rel_ratio', 'Güvenilir bant oranı', '—', 'düzenek'], ['wb.hex.microvib', 'Statik açısal mikro-titreşim (test masası)', 'µrad', 'düzenek'],
    ['wb.hex.mvCorr', 'Taban düzeltmesi σ = √(σ_ölç² − s²): masa mikro-titreşimi s', '', 'analiz kuralı', { sel: [['zincir', 'zincire özgü pay (T0.3, yalıtılmış koşu)'], ['tam', 'masa mikro-titreşiminin tam değeri'], ['kapalı', 'kapalı']] }],
    ['wb.hex.stabOff_ratio', 'Stab-OFF genlik payı (FOV oranı)', '—', 'kabul kuralı'], ['lab.hexStroke', 'Öteleme stroku (± tepe)', 'm', 'düzenek (örnek)'],
    ['wb.hex.theta_test', 'Uç poz açısı θ_test (T0.3, üç eksen)', '°', 'düzenek'],
    ['wb.hex.transDyn', 'Hexapod ötelemesinin dinamiği (açı her zaman f_bw\'de süzülür)', '', 'düzenek', { sel: [['ideal', 'ideal, süzgeçsiz (v13.3 ile aynı)'], ['fbw', 'açıyla aynı bacak dinamiği (f_bw)']] }],
    ['wb.hex.L_off', 'Pivotun göz bebeğinden kaçıklığı L_off (kurulum toleransı; testlerde pivot göz bebeğinde)', 'm', 'düzenek'],
    ['wb.coll.fc_mm', 'Kolimatör odak uzaklığı f_c', 'mm', 'düzenek (örnek)'], ['wb.coll.Dc_mm', 'Kolimatör açıklığı D_c', 'mm', 'düzenek (örnek)'],
    ['wb.coll.pinhole_um', 'Hedef iğne deliği çapı d', 'µm', 'düzenek (örnek)'], ['wb.coll.dT', 'Siyah cisim kontrastı ΔT (bilgi)', 'K', 'düzenek (örnek)'],
    ['wb.coll.ratio_min', 'f_c / f_DUT alt sınırı', '—', 'kabul kuralı'], ['wb.coll.ap_margin', 'Açıklık payı k: D_c ≥ k·(D_p + 2e)', '—', 'kabul kuralı'],
    ['wb.coll.delta_um', 'Kolimatör odak hatası δ (+: hedef odak düzleminin ötesinde; paralaks R = f_c²/δ)', 'µm', 'düzenek (0 = ideal)'],
    ['wb.coll.par_allow_urad', 'Paralaks payı (odak toleransı δ_max = f_c²·pay/e)', 'µrad', 'kabul kuralı'],
    ['wb.coll.fitTrans', 'Laboratuvar deniz ötelemesini kolimatör sınırına sığdır (e ≤ e_free)', '', 'kabul kuralı', { bool: true }],
    ['wb.coll.vigRule', 'Gerçek vinyetlemede (e > (D_c − D_p)/2) test GEÇERSİZ', '', 'kabul kuralı', { bool: true }],
    ['lab.floorCoupling', 'Kolimatör zemin kuplajı: hexapod açısal ivmesi → hedef açısı', 'µrad/(rad/s²)', 'düzenek (0 = ayrı sismik blok)'] ] },
  { g: 'Ölçüm zinciri', src: 'düzenek', items: [
    ['wb.chain.imu_bw', 'Referans IMU bant genişliği (2. derece Butterworth; grup gecikmesi √2/(2π·f))', 'Hz', 'düzenek'], ['wb.chain.imu_asd', 'IMU açısal gürültü yoğunluğu (beyaz; hareketle birlikte IMU süzgecinden geçer: RMS = yoğunluk·√(1,111·f_IMU))', 'µrad/√Hz', 'düzenek'],
    ['wb.chain.ac_asd', 'Otokolimatör gürültü yoğunluğu (beyaz; 1 kHz kayıtta RMS = yoğunluk·√500)', 'µrad/√Hz', 'düzenek'], ['wb.chain.dt_sync_ms', 'Senkronizasyon belirsizliği Δt (IMU grup gecikmesi ayrıca)', 'ms', 'düzenek'],
    ['wb.chain.centroid_px', 'Centroid gürültüsü (kare başına)', 'px', 'düzenek'], ['wb.chain.scale_eps', 'Plaka ölçeği belirsizliği ε (çarpımsal)', 'oran', 'düzenek'],
    ['wb.chain.air', 'Hava türbülansı + kolimatör kararlılığı', 'µrad', 'düzenek'], ['wb.chain.pixlock_px', 'Piksel fazı yanlılığı (RMS; S-eğrisi genliği √2 katı)', 'px', 'düzenek'] ] },
  { g: 'Kayıt istatistiği (PSD ve belirsizlik)', src: 'analiz · kabul kuralı', items: [
    ['wb.unc.fmin', 'Çözülecek en düşük frekans f_min', 'Hz', 'analiz'], ['wb.unc.Nper', 'f_min\'de en az periyot sayısı (T_min = N/f_min)', '—', 'kabul kuralı'],
    ['wb.unc.perSeg', 'Welch segmentindeki f_min periyodu (T_seg = n/f_min; Hann, %50 örtüşme)', '—', 'analiz'], ['wb.unc.Trec', 'Kayıt süresi T_rec (T0.7 kompanzasyon AÇIK koşusu da bu süreyle)', 's', 'düzenek'],
    ['wb.unc.coh', 'Koherans eşiği γ² (T2.1: VIV bandında H1 kestirimi geçerli sayılır)', '—', 'kabul kuralı'], ['wb.unc.rawExample', 'Taban düzeltmesi örneği: ham σ (Model → TUR tablosu)', 'µrad', 'analiz (örnek)'] ] },
  { g: 'Dünya dönüşü', src: 'düzenek · bütçe varsayımı', items: [
    ['wb.earth.lat', 'Laboratuvar enlemi φ', '°', 'düzenek'], ['wb.earth.az', 'Kolimatör yönü α (gerçek kuzeyden)', '°', 'düzenek'],
    ['wb.earth.el', 'LOS elevasyonu (kolimatör ve DUT)', '°', 'düzenek'], ['wb.earth.comp', 'Dünya dönüşü kompanzasyonu', '', 'DUT ayarı', { bool: true }],
    ['wb.earth.delta_deg', 'Yönelim bilgisi hatası δ', '°', 'bütçe varsayımı'] ] },
  { g: 'Bütçe varsayımları (gyro, görüntü rotasyonu, EIS)', src: 'bütçe varsayımı', items: [
    ['wb.H.arw', 'Gyro ARW (spesifikasyon)', '°/√h', 'bütçe varsayımı'], ['wb.H.bias', 'Gyro bias kararsızlığı', '°/h', 'bütçe varsayımı'],
    ['wb.H.eps_mrad', 'Gyro eksen kaçıklığı ε', 'mrad', 'bütçe varsayımı'],
    ['wb.H.epsBasis', 'B1-04 tabanı: kaçıklığın sızdırdığı baz dönmesi', '', 'bütçe tanımı', { sel: [['los', 'LOS ekseni etrafındaki dönme (yanal bakışta pitch; benzetim ve T1.1 ile aynı)'], ['roll', 'roll genliği (v13.7\'ye kadar; yanal bakışta muhafazakâr)']] }],
    ['wb.H.rwMetric', 'B1-05, B1-06, B1-09: wander toplamındaki metrik', '', 'bütçe tanımı', { sel: [['window', 'wander penceresi: B1-05 = ARW·√(T_w/15); B1-06, B1-09 yalnız drift (v13.9)'], ['tau', 'τ drift penceresi, üçü de wander toplamında (v13.8\'e kadar)']] }],
    ['wb.H.roll_res_mrad', 'Türetme sonrası artık görüntü rotasyonu (R-01 tahmini; EIS değil)', 'mrad', 'bütçe varsayımı'],
    ['wb.H.drrSea_dB', 'Deniz frekansında DRR (B1-01…B1-03 tahmini)', 'dB', 'bütçe varsayımı'],
    ['wb.eis.fc', 'EIS yol yumuşatma kesimi f_c (0 = referans kareye kilit, kapatmaz)', 'Hz', 'bütçe varsayımı'], ['wb.eis.eta', 'EIS verimi η (0 = düzeltme yok)', '—', 'bütçe varsayımı'],
    ['wb.eis.reg_px', 'EIS registrasyon artığı (η\'dan bağımsız eklenir)', 'px RMS', 'bütçe varsayımı'],
    ['wb.H.accSens', 'LOS ivme duyarlılığı (B1-08)', 'µrad/(m/s²)', 'bütçe varsayımı'], ['wb.H.b0_res', 'Gyro açılış bias\'ı artığı, kalibrasyon sonrası (B1-09)', '°/h', 'bütçe varsayımı'],
    ['wb.H.tc_bias', 'Gyro bias sıcaklık katsayısı (B1-09)', '°/h/°C', 'bütçe varsayımı (0 = girilmedi)'], ['wb.H.dT', 'Kalibrasyon ↔ işletme sıcaklık farkı |ΔT|', '°C', 'senaryo (T4.2: −20…55 °C)'],
    ['wb.H.kg', 'Gyro g-duyarlılığı (B1-10)', '°/h/g', 'bütçe varsayımı (0 = girilmedi)'] ] },
  { g: 'Örnek DUT — stabilizasyon döngüsü', src: 'örnek (kaynak değil)', ex: true, items: [
    ['dut.geom.a0', 'LOS azimutu (pruvaya göre, iskele +)', '°', 'örnek'], ['dut.el.fc', 'El döngüsü kesim frekansı', 'Hz', 'örnek'],
    ['dut.az.fc', 'Az döngüsü kesim frekansı', 'Hz', 'örnek'], ['dut.el.fi', 'Çift integratör köşesi (el)', 'Hz', 'örnek'],
    ['dut.az.fi', 'Çift integratör köşesi (az)', 'Hz', 'örnek'],
    ['dut.ctl.res.on', 'Adaptif dar bant (rezonans) kontrol', '', 'örnek', { bool: true }], ['dut.ctl.res.gain_dB', 'Rezonans kazancı', 'dB', 'örnek'],
    ['dut.ctl.res.fmin', 'Dar bant çalışma alt sınırı', 'Hz', 'örnek'], ['dut.ctl.res.fmax', 'Dar bant çalışma üst sınırı', 'Hz', 'örnek'],
    ['dut.ctl.res.estErr', 'Dar bant frekans kestirim hatası (oran; 0,05 = %5 yüksek)', '—', 'örnek: 0 = ideal (v13.10)'],
    ['dut.ctl.ff.on', 'Sürtünme ileri beslemesi (LuGre gözlemci)', '', 'örnek', { bool: true }], ['dut.ctl.ff.eta', 'İleri besleme oranı η', '—', 'örnek'],
    ['dut.ctl.ff.f_est', 'Bağıl hız kestirimi bant genişliği', 'Hz', 'örnek'], ['dut.ctl.ff.tempSched', 'Sıcaklık programlı sürtünme modeli', '', 'örnek', { bool: true }],
    ['dut.ctl.ff.obs.Fc', 'Gözlemcinin Coulomb sürtünmesi F_c (tesise oranı)', '—', 'örnek: 1 = tam bilgi (v13.10)'], ['dut.ctl.ff.obs.Fs', 'Gözlemcinin statik sürtünmesi F_s (tesise oranı)', '—', 'örnek: 1'],
    ['dut.ctl.ff.obs.vs', 'Gözlemcinin Stribeck hızı v_s (tesise oranı)', '—', 'örnek: 1'], ['dut.ctl.ff.obs.s0', 'Gözlemcinin kıl rijitliği σ0 (tesise oranı)', '—', 'örnek: 1'],
    ['dut.derot.on', 'Görüntü türetme (derotasyon)', '', 'örnek', { bool: true }] ] },
  { g: 'Örnek DUT — mekanik ve sürtünme', src: 'örnek / kalibre', ex: true, items: [
    ['dut.el.J', 'El ataleti', 'kg·m²', 'örnek'], ['dut.el.b', 'El viskoz kuplaj b', 'N·m·s/rad', 'örnek: DRR(3 Hz) = −40 dB (dar bant kapalı; 3 Hz\'de b belirler)'],
    ['dut.el.k', 'El yay kuplajı k', 'N·m/rad', 'örnek: DRR(1/8 Hz) = −80 dB (deniz bandında k belirler)'], ['dut.el.Fc', 'El Coulomb sürtünmesi F_c', 'N·m', 'kalibre: B1-07 = 3 µrad (dar bant kapalı taban döngüde)'],
    ['dut.el.sigma0', 'El kıl rijitliği σ0 (ön-kayma)', 'N·m/rad', 'örnek: F_c / 1 mrad; F_c değişince sabit kalır'], ['dut.az.Fc', 'Az Coulomb sürtünmesi F_c', 'N·m', 'kalibre: ×2,25 el'],
    ['dut.az.sigma0', 'Az kıl rijitliği σ0', 'N·m/rad', 'örnek: F_c / 1 mrad; F_c değişince sabit kalır'], ['dut.el.cogA', 'El vuruntu / kablo torku genliği', 'N·m', 'kalibre: B2-04 = 1,5 µrad (taban döngüde)'],
    ['dut.imb.me', 'El grubu kütlesi (dengesizlik)', 'kg', 'örnek'], ['dut.mount.kappa', 'Direk tepesi açısal modu κ (bütçe dışı yol)', 'rad/(m/s²)', 'örnek: 0 = kapalı'] ] },
  { g: 'Örnek DUT — gyro, modlar, optik', src: 'örnek / kalibre', ex: true, items: [
    ['dut.gyro.arw', 'Gyro ARW', '°/√h', 'örnek (T0.6)'], ['dut.gyro.bi', 'Gyro bias kararsızlığı', '°/h', 'örnek (T0.6)'],
    ['dut.gyro.bias0', 'Gyro sabit artık bias b0, kalibrasyon sonrası (işareti eksen başına tohumdan)', '°/h', 'örnek (T0.7)'],
    ['dut.gyro.epsEl', 'Gyro eksen kaçıklığı (el)', 'mrad', 'örnek'], ['dut.gyro.epsXel', 'Gyro eksen kaçıklığı (xel)', 'mrad', 'örnek'], ['dut.gyro.sf_ppm', 'Gyro ölçek faktörü hatası S_f', 'ppm', 'örnek'],
    ['dut.gyro.fbw', 'Gyro bant genişliği (1. derece)', 'Hz', 'örnek'], ['dut.gyro.lat_ms', 'Gyro ek gecikmesi (döngünün 1 periyot hesap gecikmesine ek)', 'ms', 'örnek: 0'],
    ['dut.gyro.sfnl_ppm', 'Ölçek doğrusalsızlığı (IEEE 952)', 'ppm·FS', 'örnek: 0'], ['dut.gyro.range_dps', 'Ölçüm menzili ±', '°/s', 'örnek'],
    ['dut.gyro.lsb_dph', 'Kuantizasyon (LSB)', '°/h', 'örnek: 0'], ['dut.gyro.tcBias', 'Bias sıcaklık katsayısı', '°/h/°C', 'örnek: 0'],
    ['dut.gyro.tcSF', 'Ölçek sıcaklık katsayısı', 'ppm/°C', 'örnek: 0'], ['dut.gyro.Tcal', 'Kalibrasyon sıcaklığı', '°C', 'örnek'],
    ['dut.gyro.kg', 'g-duyarlılığı', '°/h/g', 'örnek: 0'],
    ['dut.modes.opt.f', 'Optik alt montaj modu', 'Hz', 'örnek (B3-03)'], ['dut.modes.gim.f', 'Gimbal yapısal modu', 'Hz', 'örnek (B3-04)'],
    ['dut.cooler.f', 'Kriyo-soğutucu temel frekansı', 'Hz', 'örnek (B3-02)'], ['dut.cooler.A', 'Soğutucu LOS genliği (temel)', 'µrad', 'kalibre: B3-02'],
    ['dut.optics.scaleErr', 'Gerçek IFOV / nominal − 1', 'oran', 'örnek (T0.1)'], ['dut.optics.k1', 'Radyal distorsiyon k1', '—', 'örnek (T0.1)'] ] },
  { g: 'İşletme ortamı (kalibre düzeyler)', src: 'kalibre: bütçe tahminleri', ex: true, items: [
    ['env.slap.A', 'Dalga çarpması genlik ölçeği', 'µrad', 'kalibre: B2-02'], ['env.slap.rate', 'Dalga çarpması sıklığı', '1/s', 'örnek'],
    ['env.lat.a_rms', 'Yanal ivme (8 Hz dar bant)', 'm/s²', 'kalibre: B2-03'], ['env.plat.a_rms', 'Platform titreşimi 4–33 Hz (eksen başına)', 'm/s²', 'kalibre: B2-06'],
    ['env.aux.a', 'Yardımcı makine tonu 50 Hz (tepe)', 'm/s²', 'kalibre: B3-01'], ['env.hf.acc_rms', 'Geniş bant 60–400 Hz ivme', 'm/s²', 'kalibre: B3-03'],
    ['env.hf.ang_rms', 'Geniş bant 60–400 Hz açısal', 'µrad', 'kalibre: B3-04'] ] },
  { g: 'Proje gereksinimleri (test eşikleri)', src: 'boş = BİLGİ', items: [
    ['ana.req.trackErr_urad', 'İzleme hatası (T1.7)', 'µrad', 'gereksinim (girin)', { nul: true }], ['ana.req.settle_ms', 'Dönüş sonrası oturma (T1.8)', 'ms', 'gereksinim (girin)', { nul: true }],
    ['ana.req.shockPeak_urad', 'Darbe tepe hatası (T2.4)', 'µrad', 'gereksinim (girin)', { nul: true }], ['ana.req.shockSettle_ms', 'Darbe oturma süresi (T2.4)', 'ms', 'gereksinim (girin)', { nul: true }],
    ['ana.req.boresight_urad', 'Boresight kayması (T4.1)', 'µrad', 'gereksinim (girin)', { nul: true }], ['ana.Tw', 'Wander penceresi', 's', 'analiz'], ['ana.seeds', 'T1.3 tohum sayısı', '—', 'analiz'] ] },
  { g: 'Proje LOS kalıntı gereksinimleri (v12)', src: 'kullanıcının proje tablosu · sonuçlar Gereksinimler sekmesinde', items: [
    ['ana.los.on', 'Proje LOS kalıntı değerlendirmesi (T1.9, işletme, Gereksinimler sekmesi)', '', 'v12', { bool: true }],
    ['ana.los.kVec', 'Bütünsel RMS σ_vek = √(σ_El² + σ_Az²) sınırı', 'IFOV', 'proje: 0,10 (4,0 µrad)'],
    ['ana.los.kEl', 'Yükseliş RMS σ_El sınırı', 'IFOV', 'proje: 2,5 µrad (0,0625)'], ['ana.los.kAz', 'Azimut (çapraz yükseliş) RMS σ_Az sınırı', 'IFOV', 'proje: 3,1 µrad (0,0775)'],
    ['ana.los.kPPV', 'Kayıt PPV sınırı (en kötü pencere, σ_eksen katı)', '×σ', 'v12 kararı: 6,5'],
    ['ana.los.kRev', 'Geçiş (stick-slip) PPV sınırı — T1.6 senkron ortalama', 'IFOV', 'proje: 0,40 (16 µrad)'],
    ['ana.los.k9973', 'P99,73 radyal sınırı (proje: 3σ)', 'IFOV', 'proje: 12 µrad (0,30)'],
    ['ana.los.kExp', 'Pozlama içi jitter sınırı', 'IFOV', 'proje: 0,05 (2,0 µrad)'], ['ana.los.Texp_ms', 'Pozlama penceresi T_e', 'ms', 'proje: 10 ms'],
    ['ana.los.Tw', 'RMS / PPV penceresi', 's', 'proje: ≥ 60 s'], ['ana.los.fHP', 'Sıfır fazlı yüksek geçiren köşesi (PSD alt sınırı)', 'Hz', 'v12: 0,1 Hz'],
    ['ana.los.decide', 'σ karar kuralı', '', 'v12 kararı', { sel: [['ust95', 'pencere RMS %95 üst güven sınırı'], ['enkotu', 'en kötü pencere'], ['ortalama', 'havuzlanmış RMS']] }],
    ['ana.los.basis', 'Kabul tabanı (laboratuvar, T1.9)', '', 'v12 kararı', { sel: [['sonra', 'dış kamera takip döngüsü sonrası'], ['once', 'takip öncesi (stabilizasyon çıkışı)']] }],
    ['ana.los.share.0', 'Bant payı 0,1–2,5 Hz (eksen sınırının oranı)', 'oran', 'v12: 0,6'], ['ana.los.share.1', 'Bant payı 2,5–20 Hz', 'oran', 'v12: 0,6'],
    ['ana.los.share.2', 'Bant payı 20–100 Hz', 'oran', 'v12: 0,48'], ['ana.los.share.3', 'Bant payı 100–500 Hz', 'oran', 'v12: 0,2'],
    ['ana.los.toneFrac', 'Ayrık ton: bant tahsisi varyansının en çok payı', 'oran', 'v12: 0,5'],
    ['ana.los.trk.bw', 'Dış kamera takip döngüsü bant genişliği', 'Hz', 'örnek (proje: 50 Hz kare hızıyla)'],
    ['ana.los.trk.lat_frames', 'Takip döngüsü gecikmesi (ölçümden komuta, tam kare)', 'kare', 'örnek'] ] },
];
// plat: yalnız o platformda gösterilen hazır ayarlar; 'Varsayılan' etkin platformun varsayılanına döner
const PRESETS = [
  { n: 'Varsayılan', f: (P) => Object.assign(P, ENG.defaultParams(platOf(P))) },
  { n: 'Dar bant kontrol kapalı', f: (P) => { P.dut.ctl.res.on = false; } },
  { n: 'Sürtünme ileri beslemesi kapalı', f: (P) => { P.dut.ctl.ff.on = false; } },
  { n: 'Sıcaklık programlı FF', f: (P) => { P.dut.ctl.ff.tempSched = true; } },
  { n: 'Direk açısal modu açık', f: (P) => { P.dut.mount.kappa = 1e-4; } },
  { n: 'Gyro spesifikasyon sınırında', f: (P) => { P.dut.gyro.arw = P.wb.H.arw; P.dut.gyro.bi = P.wb.H.bias; } },
  { n: 'Gyro bias\'ı yok', f: (P) => { P.dut.gyro.bias0 = 0; P.dut.gyro.bi = 0; } },
  { n: 'EIS kapalı', f: (P) => { P.wb.eis.eta = 0; P.wb.eis.reg_px = 0; } },
  { n: 'Deniz durumu ×1,5', f: (P) => { for (const k of ['roll_A', 'pitch_A', 'yaw_A']) P.wb.sea[k] *= 1.5; for (const q of Object.values(P.wb.sea.dof || {})) q.A *= 1.5; } },
  { n: 'SS4 6-DOF (proje profili)', f: (P) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(ENG.SEA6.SS4)); } },
  { n: 'SS5 6-DOF (proje profili)', f: (P) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(ENG.SEA6.SS5)); } },
  { n: 'Görüntü rotasyonu: alan kenarı', f: (P) => { P.wb.rotRef = 'edge'; } },
  { n: 'FOG: kullanıcı örnek değerleri', f: (P) => Object.assign(P.dut.gyro, { fbw: 500, lat_ms: 1, sfnl_ppm: 50, range_dps: 300, lsb_dph: 0.01 }) },
  { n: 'FOG gecikmesi 1 ms', f: (P) => { P.dut.gyro.lat_ms = 1; } },
  { n: 'VIV kapalı', f: (P) => { if (isShipP(P)) P.wb.wviv.on = false; else P.wb.viv.on = false; } },
  { n: 'Mast başı ötelemesi kapalı (yalnız açısal)', plat: 'sub', f: (P) => { P.wb.viv.lin = false; } },
  { n: 'Ağır mast (m* = 10)', plat: 'sub', f: (P) => { P.wb.viv.mstar = 10; } },
  { n: 'Direk sönümü ×2,5 (δ_s = 0,05)', plat: 'ship', f: (P) => { P.wb.wviv.delta = 0.05; } },
  { n: 'Yandan rüzgâr (β = 90°)', plat: 'ship', f: (P) => { P.wb.wviv.beta = 90; } },
  { n: 'Direk ötelemesi kapalı (yalnız açısal)', plat: 'ship', f: (P) => { P.wb.wviv.lin = false; } },
  { n: 'Direktör boyuna kolu r_x = 20 m (ne olur)', plat: 'ship', f: (P) => { P.wb.sea.rx = 20; } },
  { n: 'Proje LOS tablosu (v12 varsayılanı)', f: (P) => { P.ana.los = ENG.losReqDefaults(); } },
  { n: 'Takip gecikmesi 1 kare', f: (P) => { P.ana.los.trk.lat_frames = 1; } },
  { n: 'Takip bandı 1,5 Hz', f: (P) => { P.ana.los.trk.bw = 1.5; } },
  { n: 'σ kararı: en kötü pencere', f: (P) => { P.ana.los.decide = 'enkotu'; } },
];
function renderPresets() {
  const box = $('#presetRow'); if (!box) return; box.innerHTML = '';
  box.append(h('span', { class: 'xs muted' }, 'Hazır ayar:'), ...PRESETS.filter(p => !p.plat || p.plat === platOf(STATE.P)).map(p => h('button', { class: 'btn sm', onclick: () => applyPreset(p) }, p.n)));
}
// Platform seçimi: deniz hareketini o platformun örnek değerlerine getirir; VIV kaynağını ve dalga çarpmasını platform belirler
function setPlatform(kind) {
  kind = kind === 'ship' ? 'ship' : 'sub';
  if (platOf(STATE.P) === kind) return;
  ENG.applyPlatform(STATE.P, kind);
  renderParams(); renderPresets(); syncPlatformUI(); onParamsChanged();
}
function syncPlatformUI() {
  const k = platOf(STATE.P);
  for (const b of $$('#platSeg button')) b.setAttribute('aria-pressed', b.getAttribute('data-p') === k ? 'true' : 'false');
  const t = $('#mVivTtl'); if (t) t.textContent = k === 'ship' ? 'Rüzgâr kaynaklı girdap kopması (EN 1991-1-4 Ek E)' : 'Hidrodinamik VIV taraması';
  document.documentElement.setAttribute('data-plat', k);
  syncVivSeg();
}
function buildModel(root) {
  const left = h('div', { class: 'panel', id: 'pgroups' }, h('header', null, h('h2', null, 'Parametreler'), h('span', { class: 'hint' }, 'Etiket parametrenin rolünü gösterir: kanal, gereksinim, kabul kuralı, düzenek, senaryo, bütçe varsayımı, analiz. Turuncu: örnek DUT ya da kalibre düzey (gerçek bir ürünün değeri değil). Platform (üstteki seçici) deniz hareketini o platformun örnek değerlerine getirir.')),
    h('div', { class: 'body', style: { paddingBottom: '6px' } }, h('div', { class: 'presets', id: 'presetRow' })),
    h('div', { id: 'pg' }));
  const right = h('div', { style: { display: 'grid', gap: '16px', minWidth: 0 } },
    h('div', { class: 'tiles', id: 'mTiles' }),
    h('div', { class: 'chartbox', id: 'mDrr' }), h('div', { class: 'chartbox', id: 'mReach' }),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Kolimatör uygunluğu ve göz bebeği kayması')), h('div', { class: 'body tscroll', id: 'mColl' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', { id: 'mVivTtl' }, isShipP(STATE.P) ? 'Rüzgâr kaynaklı girdap kopması (EN 1991-1-4 Ek E)' : 'Hidrodinamik VIV taraması')), h('div', { class: 'body tscroll', id: 'mViv' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Görüntü rotasyonu: dizin formatı ve köşe pikseli ölçütü')), h('div', { class: 'body tscroll', id: 'mRot' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Deniz hareketi: 6 serbestlik derecesi, kaldıraç kolu ve hexapod')), h('div', { class: 'body tscroll', id: 'mSea6' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'FOG parametrelerinin etkisi (doğrudan stabilizasyon)')), h('div', { class: 'body tscroll', id: 'mFog' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Ölçüm belirsizliği, TUR ve taban düzeltmesi')), h('div', { class: 'body tscroll', id: 'mTur' })),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Dünya dönüşü')), h('div', { class: 'body tscroll', id: 'mEarth' })));
  root.append(h('div', { class: 'mgrid' }, left, right));
  renderPresets(); renderParams(); renderDerived();
}
function renderParams() {
  const box = $('#pg'); if (!box) return; box.innerHTML = '';     // Model sekmesi henüz kurulmadıysa (ör. düzenekten VIV anahtarı) atla
  const pl = platOf(STATE.P), def = ENG.defaultParams(pl);        // "değişti" işareti etkin platformun varsayılanına göre
  const refIdx = Math.max(0, STATE.P.wb.channels.findIndex(c => c.name === STATE.P.wb.refChannel));
  const numInp = (path, v, opt) => h('input', { type: 'number', id: 'p-' + path, value: v == null ? '' : String(+(+v).toPrecision(6)), step: 'any', placeholder: opt && opt.nul ? 'girilmedi' : '', onchange: (e) => { const t = e.target.value.trim(); if (t === '' && opt && opt.nul) setParam(path, null); else { const x = parseFloat(t.replace(',', '.')); if (isFinite(x)) setParam(path, x); else e.target.value = v; } } });
  for (const G of SCHEMA) {
    const other = G.plat && G.plat !== pl;
    const det = h('details', { class: 'pgroup' + (other ? ' inactive' : ''), open: (G.open || (G.plat && G.plat === pl)) ? true : null },
      h('summary', null, h('h3', null, G.g), h('span', { class: 'src' }, other ? (G.plat === 'ship' ? 'yalnız gemi platformunda etkin' : 'yalnız denizaltı platformunda etkin') : G.src)));
    for (const [path0, label0, unit, ref0, o] of G.items) {
      const opt = o || {};
      // referans kanala bağlı satırlar: kanal tablosunun seçili kanala ait değeri (etiket kanal adını gösterir)
      const ref = (pl === 'ship' && opt.refShip) ? opt.refShip : ref0;
      const label = opt.refCh ? `${label0} (${STATE.P.wb.channels[refIdx].name})` : label0;
      if (opt.show && !opt.show(STATE.P)) continue;
      const isEx = /^(örnek|kalibre)/.test(ref);
      const lbl = (forId) => h('label', { class: 'lb', for: forId }, label, h('span', { class: 'ref' + (isEx ? ' ex' : '') }, ref));
      if (opt.fmtSel) {        // dizin formatı: hazır seçenekler, Nh ve Nv birlikte değişir
        const ch = STATE.P.wb.channels[refIdx], cur = `${ch.Nh}×${ch.Nv}`, opts = ['640×512', '1024×768', '1280×1024', '1920×1080', '2048×1536'];
        const sel = h('select', { id: 'p-@fmt', onchange: (e) => { if (e.target.value === 'özel') return; const [a, b] = e.target.value.split('×').map(Number); setPath(STATE.P, `wb.channels.${refIdx}.Nh`, a); setPath(STATE.P, `wb.channels.${refIdx}.Nv`, b); renderParams(); onParamsChanged(); } },
          opts.map(x => h('option', { value: x, selected: x === cur ? true : null }, x.replace('×', ' × '))), h('option', { value: 'özel', selected: opts.includes(cur) ? null : true }, 'özel (aşağıda girin)'));
        det.append(h('div', { class: 'prow' }, h('label', { class: 'lb', for: 'p-@fmt' }, `${label} — ${ch.name}`, h('span', { class: 'ref' }, ref)), sel, h('span', { class: 'u' }, unit)));
        continue;
      }
      if (opt.table6) {        // 6-DOF profil tablosu (± tepe, f1, f2)
        const D = STATE.P.wb.sea.dof, dd = def.wb.sea.dof, rows = [['roll', 'Roll (Φ)', '°'], ['pitch', 'Pitch (Θ)', '°'], ['yaw', 'Yaw (Ψ)', '°'], ['heave', 'Heave (z)', 'm'], ['surge', 'Surge (x)', 'm'], ['sway', 'Sway (y)', 'm']];
        const cell = (k, f) => { const p = `wb.sea.dof.${k}.${f}`, inp = numInp(p, D[k][f]); if (dd && dd[k] && dd[k][f] !== D[k][f]) inp.classList.add('changed'); return h('td', null, inp); };
        det.append(h('div', { class: 'prow wide' }, lbl('p-wb.sea.dof.roll.A'), h('table', { class: 'dt t6' }, h('thead', null, h('tr', null, h('th', null, 'Serbestlik'), h('th', null, '± tepe'), h('th', null, 'f1 (Hz)'), h('th', null, 'f2 (Hz)'))),
          h('tbody', null, rows.map(([k, n, u]) => h('tr', null, h('td', null, `${n}, ${u}`), cell(k, 'A'), cell(k, 'f1'), cell(k, 'f2')))))));
        continue;
      }
      const path = opt.refCh ? `wb.channels.${refIdx}.${opt.refCh}` : path0;
      const v = getPath(STATE.P, path), dv = getPath(def, path), changed = JSON.stringify(v) !== JSON.stringify(dv);
      let inp;
      if (opt.sel) { const pairs = opt.sel.map(x => Array.isArray(x) ? x : [x, x]); inp = h('select', { id: 'p-' + path, onchange: (e) => setParam(path, e.target.value, opt.rerender) }, pairs.map(([x, t]) => h('option', { value: x, selected: x === v ? true : null }, t))); }
      else if (opt.bool) inp = h('label', { class: 'switch' }, h('input', { type: 'checkbox', id: 'p-' + path, checked: v ? true : null, onchange: (e) => setParam(path, e.target.checked) }), h('span', { class: 'xs' }, v ? 'açık' : 'kapalı'));
      else inp = numInp(path, v, opt);
      if (changed && inp.classList) inp.classList.add('changed');
      det.append(h('div', { class: 'prow' + (opt.sel && Array.isArray(opt.sel[0]) ? ' selw' : '') }, lbl('p-' + path), inp, h('span', { class: 'u' }, unit)));
    }
    box.append(det);
  }
}
function setParam(path, v, rerender) {
  setPath(STATE.P, path, v);
  if (path === 'dut.el.Fc') { STATE.P.dut.el.Fs = 1.1 * v; }
  if (path === 'dut.az.Fc') { STATE.P.dut.az.Fs = 1.1 * v; }
  if (rerender || /\.N[hv]$/.test(path)) renderParams();      // kipe bağlı satırlar ve format seçicisi yeniden çizilir
  onParamsChanged();
}
function applyPreset(p) {
  if (p.n === 'Varsayılan') STATE.P = ENG.defaultParams(platOf(STATE.P)); else p.f(STATE.P);
  renderParams(); onParamsChanged();
}
const onParamsChanged = debounce(() => {
  store('P', STATE.P);
  restorePre();          // bir platformun varsayılanına dönüldüyse önceden hesaplanmış sonuçlar
  const def = ENG.defaultParams(platOf(STATE.P));
  for (const inp of $$('#pg input, #pg select')) { const path = inp.id.slice(2); const v = getPath(STATE.P, path), dv = getPath(def, path); inp.classList.toggle('changed', JSON.stringify(v) !== JSON.stringify(dv)); if (inp.type === 'checkbox') inp.nextSibling.textContent = inp.checked ? 'açık' : 'kapalı'; }
  renderDerived(); renderBudget(); renderCampSummary(); renderSeq(); renderDetail(); renderStale(); renderPlayMetrics(); renderMethodDyn(); renderReq();
  rigParamsChanged();
}, 120);
function renderStale() {
  const b = $('#staleBanner'); if (!b) return;
  const nSt = TEST_ORDER.filter(isStale).length, opSt = STATE.op && STATE.opKey !== curKey();
  b.hidden = !(nSt || opSt);
  if (!b.hidden) { b.innerHTML = ''; b.append(h('span', null, h('b', null, 'Parametreler değişti. '), `${nSt} test sonucu${opSt ? ' ve işletme ayrıştırması' : ''} önceki parametrelerle hesaplandı.`), h('button', { class: 'btn sm primary', onclick: () => runTests(TEST_ORDER, { op: true }), disabled: STATE.running ? true : null }, 'Tümünü yeniden koştur'), h('button', { class: 'btn sm', onclick: () => applyPreset(PRESETS[0]) }, 'Varsayılana dön')); }
}
function renderDerived() {
  if (!$('#mTiles')) return;
  const P = STATE.P, d = ENG.derive(P);
  const t = $('#mTiles'); t.innerHTML = '';
  t.append(tileEl('IFOV · FOV', fmt(d.IFOV * 1e6, 2), 'µrad', `${fmt(d.FOVh, 3)}° × ${fmt(d.FOVv, 3)}° · ${d.Nh}×${d.Nv} px`));
  t.append(tileEl('Gereksinimler (eksen başına)', fmt(d.req.wander * 1e6, 1), 'µrad wander', `smear ${fmt(d.req.smear * 1e6, 1)} · drift ${fmt(d.req.drift * 1e6, 1)} / ${P.wb.tau} s · P99 ${fmt(d.req.p99 * 1e6, 1)} µrad`));
  t.append(tileEl('Roll sınırı (LOS etrafında)', fmt(d.rot.lim * 1e6, 0), 'µrad RMS', `${d.rot.ref === 'corner' ? 'köşe pikseli' : 'alan kenarı'} ${fmt(d.rot.rPx, 1)} px · ${d.Nh}×${d.Nv} · k_roll ${P.wb.k_roll} IFOV`));
  // v13.9: uyarlanır dar bant çalışma bandında [f_min, f_max] gezerken en düşük faz payı (rezonans süzgecinin kesimdeki faz katkısı)
  const RS = P.dut.ctl.res, VSo = ENG.vivSpec(P), inBandR = (x) => x >= (RS.fmin || 0) && x <= (RS.fmax || 1e9);
  // v13.10: uyarlanır kipte dar bant kestirilen frekansta (f_VIV·(1 + estErr)); ton f_VIV'de kalır
  const resOp = RS.on ? (RS.adaptive && VSo.present && inBandR(VSo.f * (1 + (RS.estErr || 0))) ? VSo.f * (1 + (RS.estErr || 0)) : RS.f) : null;
  const pmBand = (ax, J, K0) => { if (!RS.on || !RS.adaptive) return null; let w = { pm: Infinity, f: NaN }; const n = 12, a = RS.fmin || 1, b = RS.fmax || 6;
    for (let i = 0; i <= n; i++) { const fr = a * Math.pow(b / a, i / n), m = ENG.loopModel(P.dut[ax], P.dut.ctl, P.dut.gyro, P.dut.cur, J, fr, K0); if (m.pm < w.pm) w = { pm: m.pm, f: fr }; } return w; };
  const pbE = pmBand('el', P.dut.el.J, d.loopEl.K), pbA = pmBand('az', d.azJ, d.loopAz.K), pbT = (pb) => pb ? ` · dar bant ${fmt(RS.fmin, 1)}–${fmt(RS.fmax, 1)} Hz'de en düşük PM ${fmt(pb.pm, 1)}° @ ${fmt(pb.f, 1)} Hz${pb.pm < 45 ? ' (45°\'nin altında)' : ''}` : '';
  t.append(tileEl('El döngüsü', fmt(d.loopEl.pm, 1), '° PM', `kazanç payı ${fmt(d.loopEl.gm, 1)} dB · kesim ${fmt(d.loopEl.fcx, 1)} Hz (tasarım ${P.dut.el.fc}) · K ${fmt(d.loopEl.K, 1)}${RS.on ? ` · dar bant @ ${RS.f} Hz ile` : ''}${pbT(pbE)}`));
  t.append(tileEl('Az döngüsü', fmt(d.loopAz.pm, 1), '° PM', `kazanç payı ${fmt(d.loopAz.gm, 1)} dB · kesim ${fmt(d.loopAz.fcx, 1)} Hz (tasarım ${P.dut.az.fc}) · K ${fmt(d.loopAz.K, 1)}${RS.on ? ` · dar bant @ ${RS.f} Hz ile` : ''}${pbT(pbA)}`));
  // DRR
  const fa = ENG.logspace(0.02, 200, 220);
  const ctlOff = Object.assign({}, P.dut.ctl, { res: Object.assign({}, RS, { on: false }) });
  const baseE = ENG.loopModel(P.dut.el, ctlOff, P.dut.gyro, P.dut.cur, P.dut.el.J), baseA = ENG.loopModel(P.dut.az, ctlOff, P.dut.gyro, P.dut.cur, d.azJ);
  const db = (c) => 20 * Math.log10(ENG.cabs(c));
  const ser = [{ name: 'El, taban döngü', x: fa, y: Float32Array.from(fa, f => db(baseE.drr(2 * Math.PI * f))) },
    { name: 'Az, taban döngü', x: fa, y: Float32Array.from(fa, f => db(baseA.drr(2 * Math.PI * f))), slot: 2 }];
  // v13.9: dar bant, uyarlanır kipte platformun VIV frekansına (çalışma bandındaysa) ayarlı çizilir — benzetim ve T2.2 böyle çalışır
  if (RS.on) { const lpOp = ENG.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, resOp, d.loopEl.K);
    ser.splice(1, 0, { name: `El + dar bant @ ${fmt(resOp, 2)} Hz${resOp !== RS.f ? (RS.estErr ? ` (VIV ${fmt(VSo.f, 2)} Hz, kestirim hatası %${fmt(100 * RS.estErr, 1)})` : ' (VIV frekansına uyarlanmış)') : ''}`, x: fa, y: Float32Array.from(fa, f => db(lpOp.drr(2 * Math.PI * f))), slot: 1 }); }
  const VB = ENG.vivBand(P), VS = VB.VS, ship = VS.kind === 'wind', fLo = VB.fLo, fHi = VB.fHi;
  const reqV = 20 * Math.log10(ENG.budgetAlloc(P)['B2-01'] * 1e-6 / (VS.A / Math.SQRT2));
  const B = ENG.computeBudget(P, null);
  if (VS.present && isFinite(fLo) && isFinite(reqV)) ser.push({ name: ship ? 'Gerekli: B2-01 (rüzgâr VIV, f_n ± bant)' : 'Gerekli: B2-01 (VIV bandı)', x: [fLo, fHi], y: [reqV, reqV], color: '--crit', dash: [6, 4], width: 2 });
  ser.push({ name: 'Gerekli: B1-01 roll (baskın frekansta)', x: [ENG.seaDOF(P).ang[0].fdom], y: [B.reqDRR], dots: true, color: '--crit' });
  const spec = { title: 'Bozucu bastırma oranı DRR(f) — analitik döngü modeli (ayrık kontrolcü öykünmesi)', xLabel: 'Hz', yLabel: 'dB', yUnit: 'dB', xLog: true, series: ser, height: 260 };
  if (!renderDerived.drr) renderDerived.drr = new Chart($('#mDrr'), spec); else renderDerived.drr.set(spec);
  // hexapod erişimi
  const hx = P.wb.hex, fr = ENG.logspace(0.01, 100, 200);
  const rs = [{ name: 'Erişilebilir genlik', x: fr, y: Float32Array.from(fr, f => d.reach(f)), width: 2.4 },
    { name: 'ω_max / 2πf', x: fr, y: Float32Array.from(fr, f => hx.omega_max / (2 * Math.PI * f)), dash: [4, 4], slot: 6, width: 1.3 },
    { name: 'α_max / (2πf)²', x: fr, y: Float32Array.from(fr, f => hx.alpha_max / sq(2 * Math.PI * f)), dash: [2, 4], slot: 6, width: 1.3 },
    { name: P.wb.sea.mode === '6dof' ? 'Deniz (roll, pitch, yaw: ± tepe @ bant merkezi)' : 'Deniz (roll, pitch, yaw)', x: [0, 1, 2].map(ax => 1 / ENG.seaPeriod(P, ax)), y: [0, 1, 2].map(ax => ENG.seaAmpDeg(P, ax)), dots: true, slot: 1 },
    ...(VS.present ? [{ name: ship ? 'Rüzgâr VIV dwell (f_n, f_n ± bant)' : 'VIV adayları', x: VB.cand, y: VB.cand.map(() => VS.A * R2D), dots: true, slot: 2 }] : [])];
  const sp2 = { title: 'Hexapod erişimi ve gereken genlikler', xLabel: 'Hz', yLabel: '° genlik', yUnit: '°', xLog: true, yLog: true, series: rs, height: 250, yMin: 0.001, yMax: 100,
    refLines: [{ y: d.stabOffMax, label: 'stab-OFF sınırı ' + fmt(d.stabOffMax, 2) + '°', kind: 'ref' }], vLines: [{ x: hx.fbw, label: 'f_bw' }, { x: hx.fbw * hx.rel_ratio, label: 'güvenilir' }] };
  if (!renderDerived.reach) renderDerived.reach = new Chart($('#mReach'), sp2); else renderDerived.reach.set(sp2);
  // VIV tablosu: denizaltında hidrodinamik tarama, gemide rüzgâr kaynaklı girdap kopması (EN 1991-1-4 Ek E)
  renderCollPanel(P, d);
  renderVivPanel(P);
  renderRotPanel(P, d); renderSea6Panel(P, d); renderFogPanel(P, d);
  // TUR
  const ti = ENG.turInfo(P), us = ENG.uncertaintySheet(P), pp = ENG.pixPhaseInfo(P, null);
  $('#mTur').innerHTML = ''; $('#mTur').append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, h('th', null, 'Kalem'), h('th', { class: 'n' }, 'µrad'), h('th', null, 'Video'), h('th', null, 'Yüksek hızlı'))),
    h('tbody', null, ti.U.map(u => h('tr', null, h('td', null, u.id + ' ' + u.name + (u.mult ? ' — çarpımsal' : '')), h('td', { class: 'n' }, u.vh != null ? `${fmt(u.v, 2)} / ${fmt(u.vh, 2)}` : fmt(u.v, 2)), h('td', null, u.vid ? '●' : ''), h('td', null, u.hs ? '●' : ''))),
      h('tr', { class: 'tot' }, h('td', null, 'Toplam belirsizlik (karesel)'), h('td', { class: 'n' }, `${fmt(ti.uv, 2)} / ${fmt(ti.uh, 2)}`), h('td', { colspan: 2 }, 'video / yüksek hızlı')),
      h('tr', null, h('td', null, `TUR (${P.wb.TUR_def}) wander / smear`), h('td', { class: 'n' + (ti.turW < P.wb.TUR_target ? ' over' : '') }, `${fmt(ti.turW, 2)} / ${fmt(ti.turS, 2)}`), h('td', { colspan: 2 }, 'hedef ' + P.wb.TUR_target)),
      h('tr', null, h('td', null, 'Gereksinim düzeyinde şişme (wander / smear)'), h('td', { class: 'n' }, `%${fmt(100 * us.inflW, 1)} / %${fmt(100 * us.inflS, 1)}`), h('td', { colspan: 2 }, '√(1 + (u/R)²) − 1')),
      h('tr', null, h('td', null, `Senkron Δt = ${P.wb.chain.dt_sync_ms} ms → faz @ f_bw`), h('td', { class: 'n' }, fmt(us.phase, 2) + '°'), h('td', { colspan: 2 }, 'fark tabanlı hata ' + fmt(100 * us.diffErr, 2) + ' %')),
      h('tr', null, h('td', null, `Kompanzasyonsuz toplam gecikme Δt + τ_g (IMU süzgeci τ_g = √2/(2π·${P.wb.chain.imu_bw} Hz) = ${fmt(us.gd * 1e3, 3)} ms) → faz @ f_bw`), h('td', { class: 'n' }, fmt(us.phaseTot, 2) + '°'), h('td', { colspan: 2 }, 'fark tabanlı hata ' + fmt(100 * us.diffErrTot, 2) + ' % · T0.4 ölçer ve düzeltir')),
      h('tr', null, h('td', null, `U-06 hedef sabitken (takip, durağan koşu): çarpımsal kazanç 1 + 2πa·cos 2πφ (a = √2·${P.wb.chain.pixlock_px} px; hedef fazı ${fmt(pp.phX, 2)} / ${fmt(pp.phY, 2)})`), h('td', { class: 'n' }, `×${fmt(pp.gX, 3)} / ×${fmt(pp.gY, 3)}`), h('td', { colspan: 2 }, `xel / el; faza göre ${fmt(2 - pp.gMax, 3)}–${fmt(pp.gMax, 3)} · T0.1 ölçer`)),
      h('tr', null, h('td', null, 'PSD: en kısa kayıt / segment / n_d'), h('td', { class: 'n' }, `${fmt(us.Tmin, 0)} s · ${fmt(us.Tseg, 0)} s · ${us.nd}`), h('td', { colspan: 2 }, `ε_r ≈ ${fmt(us.epsR, 3)} (Hann %50 örtüşme düzeltmeli; 1/√n_d = ${fmt(us.epsR0, 3)})`)))));
  renderFloorCorr(P, ti, us);
  renderGuard(P);
  // dünya dönüşü
  const es = ENG.earthSheet(P), EL = ENG.earthLimits(P);
  const compOn = !!P.wb.earth.comp, exitS = es.off.exit;
  // v13.7 (§7): etkilenen testler, sonuçların kaydettiği en uzun stab AÇIK video kaydından (izleyicisiz); kayıt yoksa eski sabit liste
  const recD = Object.entries(STATE.results || {}).filter(([id, r]) => r && r.res && r.res.recT && id !== 'T0.7' && id !== 'T1.8').map(([id, r]) => [id, r.res.recT.stabMax]);
  const longTests = (recD.length ? recD : [['T1.1', 640], ['T1.3', 620], ['T1.4', 400], ['T2.3', 620], ['T1.9', 645]]).filter(([, T]) => T > exitS).map(([id]) => id).sort();
  $('#mEarth').innerHTML = ''; $('#mEarth').append(
    h('p', { class: 'small', style: { margin: '0 0 8px', color: 'var(--ink-2)' } }, `Eylemsiz stabilize LOS, laboratuvara sabit kolimatöre göre dünya dönüşüyle kayar: yatay ${fmt(es.h, 2)}, düşey ${fmt(es.v, 2)}, LOS etrafında ${fmt(es.r, 2)} µrad/s; hedef ${fmt(exitS, 0)} s'de alandan çıkar (kenar payı ${P.ana.edgeMargin_px} px). Kompanzasyon açıkken artık ≈ Ω·δ = ${fmt(es.comp, 3)} µrad/s; T0.7 AÇIK eşiği buna gyro bias payını ekler (bütçe drift satırıyla aynı bileşim): ${fmt(EL.comp * 1e6, 3)} + ${fmt(EL.bias * 1e6, 3)} = ${fmt(EL.on * 1e6, 2)} µrad/s.`),
    h('p', { class: 'small', style: { margin: '0 0 10px', padding: '8px 10px', borderRadius: '6px', background: compOn ? 'var(--ok-soft)' : 'var(--warn-soft)' } },
      compOn ? h('span', null, h('b', null, 'Şu an: kompanzasyon AÇIK. '), `${exitS.toFixed(0)} s'den uzun stab AÇIK kaydı olan testler (${longTests.length ? longTests.join(', ') : 'yok'}) bu durumda geçerlidir; kompanzasyon kapatılırsa GEÇERSİZ olurlar (T1.7'de video izleyici kaymayı telafi eder). Artık kayma T0.7 ve H7 ile izlenir.`)
             : h('span', null, h('b', null, 'Şu an: kompanzasyon KAPALI. '), `Düzenek koşusunda hedef ≈ ${fmt(Math.hypot(es.h, es.v), 1)} µrad/s kayar (LOS grafiğinde rampa, dedektörde sürüklenen iz). ${exitS.toFixed(0)} s'den uzun stab AÇIK kayıtlarda hedef alandan çıkar: ${longTests.length ? longTests.join(', ') + ' "GEÇERSİZ" olur' : 'etkilenen test yok'}; T1.7'de video izleyici kaymayı telafi eder.`)),
    h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['α (°)', 'yatay', 'düşey', 'LOS etrafında', 'px / 120 s'].map((c, i) => h('th', { class: i ? 'n' : '' }, c)))),
      h('tbody', null, es.tab.map(r => h('tr', null, h('td', null, String(r.az)), h('td', { class: 'n' }, fmt(r.h, 2)), h('td', { class: 'n' }, fmt(r.v, 2)), h('td', { class: 'n' }, fmt(r.r, 2)), h('td', { class: 'n' }, fmt(r.px2, 1)))))));
}
// VIV paneli: denizaltında hidrodinamik tarama; gemide rüzgâr kaynaklı girdap kopması hesabı (EN 1991-1-4
// Ek E, yaklaşım 1) ve görünür rüzgâr hızına göre kilitlenme taraması
function renderVivPanel(P) {
  const box = $('#mViv'); if (!box) return; box.innerHTML = '';
  const note = (b, t) => h('p', { class: 'small', style: { margin: '0 0 8px' } }, h('b', null, b), t);
  if (!isShipP(P)) {
    const vt2 = ENG.vivTable(P), v = P.wb.viv, VS = ENG.vivSpec(P), VB = ENG.vivBand(P), d = ENG.derive(P), RS = P.dut.ctl.res;
    const M = ENG.vivMass(P), rk = ENG.vivRisk(P), cm = (x, n) => fmt(x, n).replace('.', ',');
    const hiTxt = M.inf ? 'sınırsız (m* ≤ 0,54)' : cm(M.k0hi, 2) + (M.on ? ' (m* ile)' : '');
    if (v.on === false) box.append(note('Hidrodinamik VIV kapalı. ', 'Tarama bilgi amaçlıdır: B2-01 sıfırdır, T2.1 bilgi olarak raporlanır, T2.2 ve T2.3 uygulanmaz, işletme benzetiminde VIV kaynağı yoktur.'));
    else if (!VS.present) box.append(note('İşletme hız zarfında kilitlenme yok. ', `${cm(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${cm(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn'de K0 ${cm(rk.K0a, 2)}–${cm(rk.K0b, 2)}, tarama bandı (paylı) ${cm(rk.lo, 2)}–${isFinite(rk.hi) ? cm(rk.hi, 2) : '∞'}: kesişmiyor. Tarama bilgi amaçlıdır: B2-01 sıfırdır, T2.1 bilgi olarak raporlanır, T2.2 ve T2.3 uygulanmaz, işletme benzetiminde VIV kaynağı yoktur.`));
    else box.append(note('Su içinde ilerleyen mast: ', `girdap kopma frekansı f_v = St·U/D hızla artar; K0 = f_v/f_n tarama bandına (${cm(v.K0_lo, 1)}–${hiTxt}, ±%${fmt(100 * v.margin, 0)} pay) giren hızlarda mast modu kilitlenebilir. Senaryo, mast başında f_n'de ${String(v.amp_deg).replace('.', ',')}° açısal genlik (roll) tanımlar` +
      (VS.lin ? `; konsol mastın başı aynı fazda y = θ·L/κ = ±${cm(VS.y * 1e3, 2)} mm ötelenir (akışa dik, iskele yönü)` : '; mast başı ötelemesi kapalı (yalnız açısal)') +
      `. Laboratuvarda kuvvet değil bu hareket yeniden üretilir (T2.2). Genlik ölçüm ya da yapı analizinden girilir: serbest VIV korelasyonları bu Re aralığında geçerli değildir. Akış yönündeki titreşim (2·f_v) modellenmez.`));
    // gerekli DRR, bütçe tahmini, örnek DUT'un doğrusal DRR'ı, hexapod erişimi, dwell adaylarının kapsamı, Re rejimi
    const alB201 = ENG.budgetAlloc(P)['B2-01'], reqDRR = 20 * Math.log10(alB201 * 1e-6 / (VS.A / Math.SQRT2)), est = VS.A / Math.SQRT2 * Math.pow(10, VS.H / 20) * 1e6;
    const dbc = (c) => 20 * Math.log10(ENG.cabs(c)), ctlOff = Object.assign({}, P.dut.ctl, { res: Object.assign({}, RS, { on: false }) });
    const linB = dbc(ENG.loopModel(P.dut.el, ctlOff, P.dut.gyro, P.dut.cur, P.dut.el.J).drr(2 * Math.PI * v.fn));
    const fnIn = v.fn >= RS.fmin && v.fn <= RS.fmax, linR = RS.on && fnIn ? dbc(ENG.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, v.fn).drr(2 * Math.PI * v.fn)) : NaN;
    const cand = VB.cand, outRes = cand.filter(f => f < RS.fmin || f > RS.fmax), nyq = d.fps / 2, overNyq = cand.filter(f => f > nyq), hx = P.wb.hex, overBw = cand.filter(f => f > hx.rel_ratio * hx.fbw);
    const reArr = vt2.map(r => r.Re), nRe = vt2.filter(r => r.reWarn).length, reachFn = d.reach(v.fn);
    const fl = (a) => a.map(f => fmt(f, 2)).join(', ') + ' Hz';
    const kv = [
      [`Gerekli DRR (B2-01 tahsisi ${fmt(alB201, 2)} µrad RMS)`, VS.present ? `${fmt(reqDRR, 1)} dB; bütçe varsayımı ${VS.H} dB → analitik tahmin ${fmt(est, 2)} µrad` : `${fmt(reqDRR, 1)} dB (VIV olsaydı); ${v.on === false ? 'VIV kapalı' : 'işletme hız zarfında kilitlenme yok'} → B2-01 = 0`],
      [`Örnek DUT doğrusal DRR @ f_n = ${fmt(v.fn, 2)} Hz`, `taban döngü ${fmt(linB, 1)} dB` + (RS.on ? (fnIn ? ` · dar bant kontrolle ${fmt(linR, 1)} dB` : ` · f_n dar bant kontrol bandının (${RS.fmin}–${RS.fmax} Hz) DIŞINDA`) : ' · dar bant kontrol kapalı') + '; sürtünme küçük genlikte bunu kötüleştirir (T2.2)'],
      ['Hexapod @ f_n: erişim / gerekli', h('span', null, `${fmt(reachFn, 3)}° / ${fmt(v.amp_deg, 3)}°` + (VS.lin ? `; öteleme ±${fmt(VS.y * 1e3, 2)} mm (strok ±${fmt(P.lab.hexStroke * 1e3, 0)} mm)` : '') + ' → ', okSpan(reachFn >= v.amp_deg, reachFn >= v.amp_deg ? 'üretilebilir' : 'ERİŞİM YETMİYOR (T2.2 GEÇERSİZ)'))],
      ['Mast başı ötelemesi y = θ·L/κ', VS.lin ? `±${fmt(VS.y * 1e3, 2)} mm (L = ${v.L} m, κ = ${v.kth}) · ivme (2πf_n)²·y = ${fmt(sq(2 * Math.PI * v.fn) * VS.y, 3)} m/s² · y yönünde, roll ile aynı fazda` : 'kapalı (yalnız açısal; dengesizlik ve optik montaj yolu yok)'],
      ['Kütle oranı m* · f*_alt · etkin K0 üst · alt dal frekansı f*·f_n', M.on ? (M.inf ? `${v.mstar} ≤ 0,54: kilitlenme bütün hızlara uzanır (üst sınır yok, alt dal yok)` : `${v.mstar} · ${fmt(M.fstar, 3)} · ${fmt(M.k0hi, 2)} · ${fmt(M.flock, 2)} Hz ` + (VB.flock ? `(zarfta erişilir: en yüksek hızda f_v·(1 + pay) ${fmt(rk.fvMax * (1 + v.margin), 2)} Hz ≥ f_n,vak ${fmt(rk.fvac, 2)} Hz; dwell adayı)` : (VS.present ? `(zarfta erişilmez: en yüksek hızda f_v·(1 + pay) ${fmt(rk.fvMax * (1 + v.margin), 2)} Hz < f_n,vak ${fmt(rk.fvac, 2)} Hz; aday değil)` : '(VIV yok; aday değil)'))) : `girilmedi: sabit kural (K0 üst ${v.K0_hi}), alt dal adayı yok`],
      ['İşletme hız zarfı · K0 aralığı · VIV', h('span', null, `${fmt(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${fmt(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn · ${fmt(rk.K0a, 2)}–${fmt(rk.K0b, 2)} · `, okSpan(!rk.risk, rk.risk ? 'tarama bandıyla kesişiyor: VIV var' : 'kesişmiyor: VIV yok (B2-01 = 0)'))],
      [`Dwell adayları (f_v ∪ f_n${VB.flock ? ' ∪ f*·f_n' : ''}; ${VB.nRisk} riskli/sınırda hız)`, `${fl(cand)} · dar bant kontrol bandı dışı: ${outRes.length ? fl(outRes) : 'yok'} · video Nyquist (${fmt(nyq, 1)} Hz) üstü: ${overNyq.length ? fl(overNyq) : 'yok'} · hexapod güvenilir bant (${fmt(hx.rel_ratio * hx.fbw, 0)} Hz) üstü: ${overBw.length ? fl(overBw) : 'yok'}`],
      ['Reynolds sayısı (hız aralığı) · Re_crit', `${(Math.min(...reArr) / 1e5).toFixed(2)}–${(Math.max(...reArr) / 1e5).toFixed(2)}·10⁵ · ${(v.Re_crit / 1e5).toFixed(1)}·10⁵ üstünde ${nRe}/${vt2.length} hız (†)`],
      ['İndirgenmiş hız U_r = U/(f_n·D)', `${fmt(Math.min(...vt2.map(r => r.Ur)), 1)}–${fmt(Math.max(...vt2.map(r => r.Ur)), 1)} (K0 = St·U_r)`],
    ];
    box.append(h('table', { class: 'kv' }, h('tbody', null, kv.map(([k, val]) => h('tr', null, h('th', null, k), h('td', null, val))))));
    box.append(h('p', { class: 'xs muted', style: { margin: '10px 0 6px' } }, `Hıza göre tarama. † Re > Re_crit: dairesel kesitte kritik/süperkritik rejim; düzenli girdap kopması zayıflar ya da kaybolur, transkritikte St ≈ 0,25–0,3 ile yeniden belirginleşir (pürüzlülük ve türbülansa bağlı). Bu rejimlerde St = ${String(v.St).replace('.', ',')} varsayımı belirsizdir; St'yi değiştirip bandın kaydığına bakın.`));
    box.append(h('div', { class: 'tscroll' }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Hız (kn)', 'Re', 'f_v (Hz)', 'K0', 'U_r', 'Tarama', 'Erişim @ f_v (°)', 'Dwell'].map((c, i) => h('th', { class: i && i !== 5 && i !== 7 ? 'n' : '' }, c)))),
      h('tbody', null, vt2.map(r => h('tr', null, h('td', null, String(r.kn)), h('td', { class: 'n' }, (r.Re / 1e5).toFixed(2) + '·10⁵' + (r.reWarn ? ' †' : '')), h('td', { class: 'n' }, fmt(r.fv, 2)), h('td', { class: 'n' }, fmt(r.K0, 2)), h('td', { class: 'n' }, fmt(r.Ur, 1)),
        h('td', { class: r.scr.includes('RİSK') ? 'over' : '' }, r.scr), h('td', { class: 'n' }, fmt(r.reach, 2)), h('td', null, r.dwell ? 'evet' : '—')))))));
    return;
  }
  const W = P.wb.wviv, w = ENG.windVivCalc(P), VS = ENG.vivSpec(P), d = ENG.derive(P);
  const alB201 = ENG.budgetAlloc(P)['B2-01'], reqDRR = 20 * Math.log10(alB201 * 1e-6 / (w.theta / Math.SQRT2)), est = w.theta / Math.SQRT2 * Math.pow(10, W.drr_dB / 20) * 1e6;
  if (!VS.on) box.append(note('Rüzgâr VIV etkisi kapalı. ', 'Hesap bilgi amaçlıdır: B2-01 sıfırdır, T2.1 bilgi olarak raporlanır, T2.2 ve T2.3 uygulanmaz, işletme benzetiminde VIV kaynağı yoktur.'));
  else if (!w.active && !w.meas) box.append(note('Kritik hız işletme zarfının dışında. ', `v_crit = ${fmt(w.vcrit, 1)} m/s > 1,25 × U_max = ${fmt(1.25 * W.Umax, 1)} m/s: EN 1991-1-4 E.1.2(2) uyarınca girdap kopması incelenmez (c_lat = 0). Direk bu zarfta kilitlenmez; B2-01 sıfırdır.`));
  else box.append(note('Kilitlenmede direk modu: ', `görünür rüzgâr ${fmt(w.lock[0], 1)}–${fmt(w.lock[1], 1)} m/s aralığındayken girdap kopması f_n = ${fmt(W.fn, 2)} Hz'e kilitlenir; titreşim yapının kendi frekansındadır. Genlik yaklaşım 1 ile tahmin edilir (aşağıda); laboratuvarda kuvvet değil, direktör tabanındaki açısal hareket ve öteleme yeniden üretilir (T2.2).`));
  const kv = [
    ['Kritik hız v_crit = b·f_n/St', `${fmt(w.vcrit, 2)} m/s (${fmt(w.vcrit / 0.514444, 1)} kn)`],
    ['İşletme zarfı U_max · koşul v_crit ≤ 1,25·U_max (E.1.2(2))', `${fmt(W.Umax, 1)} m/s → ${w.active ? 'sağlanıyor: kilitlenme zarf içinde' : 'sağlanmıyor: incelenmez'}`],
    [`Kilitlenme bandı (varsayım: ε0 = ${W.eps0}, 2/5 altta, 3/5 üstte)`, `${fmt(w.lock[0], 2)}–${fmt(w.lock[1], 2)} m/s — yalnız aşağıdaki tabloyu besler; genliğe ve bütçeye girmez`],
    ['Re(v_crit) · rejim · c_lat (Şekil E.2)', `${(w.Re / 1e5).toFixed(2)}·10⁵ · ${w.regime} · ${fmt(w.clat, 3)}`],
    ['Scruton sayısı Sc = 2·δ_s·m_e/(ρ·b²)', `${fmt(w.Sc, 1)} (δ_s = ${W.delta}, m_e = ${W.me} kg/m, ρ = ${W.rho} kg/m³)`],
    ['L_j/b (Tablo E.4) · l/b · K_W · K', `${fmt(w.Ljb, 2)} · ${fmt(w.lam, 1)} · ${fmt(w.Kw, 3)} · ${W.K}`],
    ['y_F,max = b·K·K_W·c_lat/(St²·Sc)', `${fmt(w.yF * 1e3, 2)} mm (y/b = ${fmt(w.yb, 4)})`],
    ['Direktör tabanı açısı θ = κ·y/l', `${fmt(w.thCalc * R2D, 4)}° = ${fmt(w.thCalc * 1e3, 3)} mrad` + (w.meas ? ` — kullanılan: ölçülmüş ${W.amp_deg}°` : '')],
    ['Direk tepesi öteleme ivmesi (2πf_n)²·y', `${fmt(w.acc, 2)} m/s² (${fmt(w.acc / 9.80665, 2)} g)` + (VS.lin ? '' : ' — benzetimde kapalı (yalnız açısal)')],
    [`Gerekli DRR (B2-01 tahsisi ${fmt(alB201, 2)} µrad RMS)`, isFinite(reqDRR) ? `${fmt(reqDRR, 1)} dB; bütçe varsayımı ${W.drr_dB} dB → analitik tahmin ${fmt(est, 2)} µrad` : '—'],
    ['Hexapod @ f_n: erişim / gerekli', `${fmt(d.reach(W.fn), 3)}° / ${fmt(w.theta * R2D, 3)}°; öteleme ±${fmt(w.y * 1e3, 1)} mm (strok ${fmt(P.lab.hexStroke * 1e3, 0)} mm)`],
  ];
  box.append(h('table', { class: 'kv' }, h('tbody', null, kv.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v))))));
  const vt = ENG.windVivTable(P);
  box.append(h('p', { class: 'xs muted', style: { margin: '10px 0 6px' } }, 'Görünür rüzgâr hızına göre (direk yüksekliğinde): f_s = St·U/b. Kilitlenme dışında yanıt rezonans dışıdır ve küçüktür; tasarım genliği kilitlenmeyi varsayar.'));
  box.append(h('div', { class: 'tscroll' }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['U (m/s)', 'kn', 'Re', 'f_s (Hz)', 'f_s/f_n', 'Rejim', 'Durum'].map((c, i) => h('th', { class: i && i < 5 ? 'n' : '' }, c)))),
    h('tbody', null, vt.map(r => h('tr', { class: r.isCrit ? 'tot' : '' }, h('td', null, fmt(r.U, r.isCrit ? 2 : 0) + (r.isCrit ? ' (v_crit)' : '')), h('td', { class: 'n' }, fmt(r.kn, 1)), h('td', { class: 'n' }, (r.Re / 1e5).toFixed(2) + '·10⁵'),
      h('td', { class: 'n' }, fmt(r.fs, 2)), h('td', { class: 'n' }, fmt(r.r, 2)), h('td', null, r.regime), h('td', { class: r.scr === 'KİLİTLENME' ? 'over' : '' }, r.scr + (r.env ? '' : ' · zarf dışı'))))))));
}
// ---------------------------------------------------------------- v11 panelleri
const kvTable = (rows) => h('table', { class: 'kv' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))));
const noteP = (t, b) => h('p', { class: 'small', style: { margin: '0 0 8px', color: 'var(--ink-2)' } }, b ? h('b', null, b) : null, t);
const okSpan = (ok, t) => h('span', { class: ok ? 'okc' : 'over' }, t != null ? t : (ok ? 'OK' : 'AŞIM'));
const aspectTxt = (a, b) => { const g = (x, y) => (y ? g(y, x % y) : x), k = g(a, b); return `${a / k}:${b / k}`; };
const ROT_FORMATS = [[640, 512], [1024, 768], [1280, 1024], [1920, 1080], [2048, 1536]];
// dizin formatına göre roll sınırı (kanalın p ve f'si sabit). Köşe r = ½√(Nh² + Nv²), kenar Nh/2; θ = atan(r·p/f)
function rotLimits(Nh, Nv, c, k) {
  const rc = 0.5 * Math.hypot(Nh, Nv), re = Nh / 2, IFc = c.p_um / c.f_mm * 1e-3, at = (r) => Math.atan(r * c.p_um * 1e-6 / (c.f_mm * 1e-3));
  const aC = at(rc), aE = at(re);
  return { rc, re, aC, aE, IF: IFc, limC: k * IFc / aC, limE: k * IFc / aE, pxC: k / rc, FOVh: 2 * aE * R2D, FOVv: 2 * at(Nv / 2) * R2D };
}
// Görüntü rotasyonu: LOS etrafındaki ψ görüntüyü merkez etrafında döndürür; merkezden r piksel uzaktaki nokta ψ·r piksel kayar
// (görüntü düzleminde kesin). Köşe ölçütü r = ½√(Nh² + Nv²); sınır ψ_lim = k_roll·IFOV/θ_ref ≈ k_roll/r_px.
// v13.4 (kılavuz §5): kolimatör uygunluğu — f_c/f_DUT, iğne deliği, açıklık ve testlerin hareketinden göz bebeği kayması
function renderCollPanel(P, d) {
  const box = $('#mColl'); if (!box) return; box.innerHTML = '';
  const G = ENG.collGeom(P), C = P.wb.coll, mm = (v) => fmt(v * 1e3, 1);
  const X = ENG.collExcursions(P), bad = X.filter(x => !x.ok), worst = X.reduce((a, b) => (b.eMax > a.eMax ? b : a));
  const vigX = (x) => x.ovMin < 1 - 1e-9, rule = C.vigRule !== false, fitRows = X.filter(x => x.qc != null && x.qc < 1 - 1e-9);
  const dMax = G.deltaMax(worst.eMax), parPk = G.parK * worst.eMax;
  box.append(noteP(`Kolimatör iğne deliği hedefini paralel demete çevirir: DUT için hedef sonsuzdadır, öteleme görüntüyü kaydırmaz. Demet, hareket boyunca DUT giriş göz bebeğini (D_p = ${fmt(G.Dp * 1e3, 0)} mm) taşırmalıdır: D_c ≥ k·(D_p + 2e). Stab ON'da LOS laboratuvarda sabit kalırken gimbal merkezi tabanla döner, bu yüzden göz bebeği L_pg·sin θ⊥ kadar yana kayar (L_pg = ${fmt(G.Lpg, 2)} m); hexapod ötelemesi (kaldıraç kolu, 6-DOF, VIV) göz bebeğini doğrudan taşır.` +
    (bad.length ? ` ${bad.map(x => x.id).filter((v, i, a) => a.indexOf(v) === i).join(', ')} hareketinde açıklık yetmiyor${rule && bad.some(vigX) ? ' (gerçek vinyetlemede test GEÇERSİZ)' : ''}.` : ' Bütün testlerin hareketi açıklığın içinde kalıyor.') +
    (fitRows.length ? ` Laboratuvar deniz ötelemesi sınıra sığdırıldı (${fitRows.map(x => x.id + ' ×' + fmt(x.qc, 2)).join(', ')}).` : ''), 'Ne denetleniyor? '));
  const kv = [
    ['f_c / f_DUT (alt sınır)', h('span', null, `${fmt(G.ratio, 2)} (${fmt(G.ratioMin, 1)}) → `, okSpan(G.ratioOk, G.ratioOk ? 'OK' : 'KISA ODAK'))],
    ['İğne deliği: açısal boyut · DUT odak düzlemindeki görüntüsü', h('span', null, `${fmt(G.phRad * 1e6, 1)} µrad (${fmt(G.phIFOV, 2)} IFOV) · ${fmt(G.phImg_um, 1)} µm (piksel ${G.p_um} µm) → `, okSpan(G.phOk, G.phOk ? 'alt piksel nokta hedef' : 'PİKSELDEN BÜYÜK'))],
    ['Açıklık, durağan: D_c ≥ k·D_p', h('span', null, `${fmt(G.Dc * 1e3, 0)} ≥ ${fmt(G.apStatic * 1e3, 0)} mm → `, okSpan(G.apOk))],
    ['Vinyetlemesiz yanal kayma sınırı e ≤ (D_c/k − D_p)/2', `${mm(G.eFree)} mm (k = ${fmt(G.k, 2)}; k = 1'de ${mm((G.Dc - G.Dp) / 2)} mm)`],
    ['En büyük yanal kayma (test) → gerekli D_c', h('span', null, `${worst.id} ${mm(worst.eMax)} mm → ${fmt(worst.req * 1e3, 0)} mm (en düşük örtüşme %${ENG.pctFine(worst.ovMin)}) → `, okSpan(worst.ok, worst.ok ? 'yeterli' : 'AÇIKLIK YETMİYOR'))],
    ['Pivot kaçıklığı L_off · siyah cisim ΔT', `${fmt(G.Loff, 3)} m (en kötü yönde L_off·sin θ⊥ eklenir) · ${C.dT} K (bilgi: centroid SNR'ı)`],
    ['Kolimatör zemin kuplajı', P.lab.floorCoupling > 0 ? `${P.lab.floorCoupling} µrad/(rad/s²): hedef açısı tabanın açısal ivmesiyle oynar` : '0 (kolimatör ayrı sismik blokta; değer girilirse hedef tabanın açısal ivmesiyle oynar)'],
    // v13.5 (kullanıcı kararları): paralaks, ötelemenin sığdırılması, vinyetleme kuralı
    ['Odak toleransı (paralaks ≤ ' + fmt(G.parAllow * 1e6, 1) + ' µrad): δ ≤ f_c²·pay/e', h('span', null, `${isFinite(dMax) ? fmt(dMax * 1e6, 0) + ' µm' : '—'} (e = ${mm(worst.eMax)} mm, ${worst.id}); δ = ${fmt(G.delta_um, 0)} µm` +
      (G.delta_um ? ` → R = ${fmt(Math.abs(1 / G.parK) / 1e3, 1)} km, tepe paralaks ${fmt(parPk * 1e6, 2)} µrad (benzetimde hedef yoluna girer) → ` : ' (ideal kolimatör) → '), okSpan(Math.abs(G.delta_um) * 1e-6 <= dMax, Math.abs(G.delta_um) * 1e-6 <= dMax ? 'OK' : 'ODAK TOLERANSI AŞILDI'))],
    ['Laboratuvar deniz ötelemesi', C.fitTrans === false ? 'kolimatöre sığdırılmaz (kural kapalı)' : (fitRows.length ? fitRows.map(x => `${x.id} ×${fmt(x.qc, 3)} (ölçeksiz ${mm(x.e1 || 0)} mm)`).join(' · ') + ' — e ≤ e_free için küçültüldü; ivme etkisi T2.5\'te' : 'kolimatör sınırının içinde (küçültme gerekmedi)')],
    ['Gerçek vinyetleme kuralı', rule ? `e > (D_c − D_p)/2 = ${mm(G.eVig)} mm → test GEÇERSİZ; yalnız k paylı sınır aşılırsa not` : 'kapalı (yalnız bilgi)'],
  ];
  box.append(h('table', { class: 'kv' }, h('tbody', null, kv.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v))))));
  box.append(h('div', { class: 'tscroll', style: { marginTop: '10px' } }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Test', 'Hareket', 'Yanal kayma (mm)', 'Gerekli D_c (mm)', 'En düşük örtüşme', 'Vinyetleme süresi', 'Durum'].map((c, i) => h('th', { class: i >= 2 && i <= 5 ? 'n' : '' }, c)))),
    h('tbody', null, X.map(x => h('tr', null, h('td', { style: { whiteSpace: 'nowrap' } }, x.id), h('td', { style: { minWidth: '190px' } }, x.label), h('td', { class: 'n' }, mm(x.eMax)), h('td', { class: 'n' + (x.ok ? '' : ' over') }, fmt(x.req * 1e3, 0)),
      h('td', { class: 'n' }, '%' + ENG.pctFine(x.ovMin)), h('td', { class: 'n' }, '%' + ENG.pctFine(x.fVig)), h('td', null, okSpan(x.ok, x.ok ? 'OK' : (vigX(x) && rule ? 'GEÇERSİZ' : 'YETERSİZ')))))))));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, `Komut profilinden hesaplanır (benzetim koşulmaz; testler kendi koşularında aynı hesabı yapar). Örtüşme: göz bebeği dairesinin demet dairesi içinde kalan alan oranı. Vinyetleme sinyali örtüşme oranında düşürür ve centroid gürültüsünü artırır; aberasyonlu optikte nokta görüntüsünü kaydırabilir. T1.3 ve T2.3'teki yanal öteleme kaldıraç kolundan gelir (pitch × h; LOS iskeleye bakarken boyuna yön yanaldır).`));
}
function renderRotPanel(P, d) {
  const box = $('#mRot'); if (!box) return; box.innerHTML = '';
  const r = d.rot, ch = d.ch, k = P.wb.k_roll, IF = d.IFOV, res = P.wb.H.roll_res_mrad * 1e-3, kc = P.wb.k_conf;
  const corner = r.ref === 'corner', E = res * r.ang, Q = k * IF;
  box.append(noteP(`LOS etrafındaki roll ψ görüntüyü merkez etrafında döndürür: merkezden r piksel uzaktaki nokta ψ·r piksel kayar. En dış köşe pikselinin ${k} IFOV sınırını aşmaması için ψ ≤ ${k} / r_köşe (rad), r_köşe = ½√(Nh² + Nv²). Model aynı ölçütü açı uzayında yazar: ψ_lim = k_roll·IFOV / θ, θ = atan(r·p/f) — alan kenarı ölçütüyle aynı biçim. Sınır yalnız piksel sayısına bağlıdır; IFOV'un (p/f) etkisi dar alanda binde birin altında kalır.`));
  const rows = [
    ['Referans kanal ve dizin formatı', `${ch.name} · ${d.Nh} × ${d.Nv} px (${aspectTxt(d.Nh, d.Nv)}) · p = ${ch.p_um} µm · f = ${ch.f_mm} mm · IFOV ${fmt(IF * 1e6, 2)} µrad · FOV ${fmt(d.FOVh, 3)}° × ${fmt(d.FOVv, 3)}°`],
    ['Köşe yarıçapı r_köşe = ½√(Nh² + Nv²)', `${fmt(r.rCpx, 1)} px → θ_köşe = ${fmt(r.angC * 1e3, 3)} mrad (${fmt(r.angC * R2D, 3)}°)`],
    ['Kenar yarıçapı r_kenar = Nh/2 (alan kenarı ölçütü)', `${fmt(r.rEpx, 0)} px → θ_kenar = ${fmt(r.angE * 1e3, 3)} mrad`],
    [`Roll sınırı ψ_lim = k_roll·IFOV/θ (k_roll = ${k} IFOV RMS)`, h('span', null, h('b', null, `köşe ${fmt(r.limC * 1e6, 1)} µrad`), ` · kenar ${fmt(r.limE * 1e6, 1)} µrad RMS · köşe ölçütü ${fmt(r.limE / r.limC, 3)} kat sıkı (√(1 + (Nv/Nh)²) = ${fmt(Math.hypot(1, d.Nv / d.Nh), 3)})`)],
    ['Görüntü düzleminde kesin değer k_roll / r_köşe', `${fmt(k / r.rCpx * 1e6, 1)} µrad (açı uzayı ifadesinden fark %${fmt(100 * Math.abs(r.limC / (k / r.rCpx) - 1), 2)})`],
    [`Tepe ölçütü olarak okunursa (hiçbir anda aşmama, k_conf = ${kc})`, `ψ_RMS ≤ ψ_lim / k_conf = ${fmt(r.lim / kc * 1e6, 1)} µrad (${corner ? 'köşe' : 'kenar'}). Bütçe R-01'i RMS olarak tahsis eder.`],
    ['Bütçe R-01 = artık roll × θ_ref', h('span', null, `${P.wb.H.roll_res_mrad} mrad × ${fmt(r.ang * 1e3, 3)} mrad = ${fmt(E * 1e6, 2)} µrad RMS; tahsis ${fmt(Q * 1e6, 2)} µrad → `, okSpan(E <= Q), ` (kullanım %${fmt(100 * E / Q, 0)})`)],
    ['Kullanılan ölçüt noktası', `${corner ? 'köşe pikseli (varsayılan)' : 'alan kenarı (v10 uyumu)'} — bütçe R-01, T1.5 ve işletme ayrıştırması bu noktayı kullanır. Seçim: Parametreler → Referans kanal.`],
  ];
  box.append(kvTable(rows));
  // format karşılaştırması (referans kanalın p ve f'si sabit)
  const fm = ROT_FORMATS.slice(); if (!fm.some(([a, b]) => a === d.Nh && b === d.Nv)) fm.push([d.Nh, d.Nv]);
  fm.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  box.append(h('p', { class: 'xs muted', style: { margin: '10px 0 6px' } }, `Dizin formatına göre (${ch.name} optiği: p = ${ch.p_um} µm, f = ${ch.f_mm} mm sabit; IFOV ve R-01 tahsisi ${fmt(k * IF * 1e6, 1)} µrad her formatta aynı, FOV büyür). "Köşe @ artık": bütçe varsayımı ${P.wb.H.roll_res_mrad} mrad RMS roll artığıyla köşe pikselinin yer değiştirmesi (µrad RMS).`));
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Format', 'En-boy', 'r_köşe (px)', 'ψ_lim köşe (µrad)', 'ψ_lim kenar (µrad)', 'Köşe @ artık', 'Durum'].map((c, i) => h('th', { class: i >= 2 && i <= 5 ? 'n' : '' }, c)))),
    h('tbody', null, fm.map(([a, b]) => { const L = rotLimits(a, b, ch, k), cur = a === d.Nh && b === d.Nv, dsp = res * L.aC;
      return h('tr', { class: cur ? 'tot' : '' }, h('td', { style: { whiteSpace: 'nowrap' } }, `${a}×${b}` + (cur ? ' ●' : '')), h('td', null, aspectTxt(a, b)), h('td', { class: 'n' }, fmt(L.rc, 1)),
        h('td', { class: 'n' }, fmt(L.limC * 1e6, 1)), h('td', { class: 'n' }, fmt(L.limE * 1e6, 1)),
        h('td', { class: 'n' }, fmt(dsp * 1e6, 2)), h('td', null, okSpan(res <= L.limC))); }))));
  // tanımlı kanallar: roll artığı tüm kanallarda aynıdır, bağlayıcı sınır en çok pikselli kanalınkidir
  const chs = P.wb.channels.map(c => ({ c, L: rotLimits(c.Nh, c.Nv, c, k) })), bind = chs.reduce((a, q) => (q.L.limC < a.L.limC ? q : a), chs[0]);
  box.append(h('p', { class: 'xs muted', style: { margin: '10px 0 6px' } }, 'Tanımlı kanallar (her biri kendi formatı ve optiğiyle). Roll artığı aynı LOS üzerinden bütün kanallara ortaktır; aynı ölçüt her kanala uygulanırsa bağlayıcı olan en çok pikselli (en büyük r_köşe) kanaldır.'));
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Kanal', 'Format', 'IFOV (µrad)', 'r_köşe (px)', 'ψ_lim köşe (µrad)', 'Köşe @ artık (IFOV)'].map((c, i) => h('th', { class: i >= 2 ? 'n' : '' }, c)))),
    h('tbody', null, chs.map(({ c, L }) => h('tr', { class: c.name === ch.name ? 'tot' : '' }, h('td', null, c.name + (c.name === ch.name ? ' (referans)' : '') + (c === bind.c ? ' · bağlayıcı' : '')), h('td', { style: { whiteSpace: 'nowrap' } }, `${c.Nh}×${c.Nv}`),
      h('td', { class: 'n' }, fmt(L.IF * 1e6, 2)), h('td', { class: 'n' }, fmt(L.rc, 1)), h('td', { class: 'n' + (res > L.limC ? ' over' : '') }, fmt(L.limC * 1e6, 1)), h('td', { class: 'n' + (res * L.aC > k * L.IF ? ' over' : '') }, fmt(res * L.aC / L.IF, 3)))))));
  if (bind.c.name !== ch.name && res > bind.L.limC) box.append(noteP(`${bind.c.name} kanalında (${bind.c.Nh} × ${bind.c.Nv}) aynı ölçüt ψ ≤ ${fmt(bind.L.limC * 1e6, 0)} µrad gerektirir; bütçe varsayımı ${fmt(res * 1e6, 0)} µrad bu kanalda köşeyi ${fmt(res * bind.L.aC / bind.L.IF, 2)} IFOV kaydırır. Bütçe referans kanala göre kurulur; çok kanallı gereksinimde bağlayıcı kanal ayrıca doğrulanmalıdır.`, 'Bağlayıcı kanal: '));
}
// Deniz hareketi: 6-DOF bant sınırlı profil ya da 'dar' kip; direktör ivmesi (kaldıraç kolu + ağırlık merkezi
// ötelemesi), hexapodun açısal erişimi ve öteleme strokuna göre laboratuvar ölçeği (analitik, Gauss tepe ≈ kp·σ)
function renderSea6Panel(P, d) {
  const box = $('#mSea6'); if (!box) return; box.innerHTML = '';
  const D = ENG.seaDOF(P), acc = ENG.seaAccDirector(P), hx = P.wb.hex, six = D.six, st = P.lab.hexStroke, kp = D.kp, H = P.wb.H, aT = armTxt(P);
  box.append(noteP(six
    ? `6-DOF bant sınırlı profil (proje test profili, varsayım): her serbestlik derecesi f1–f2 bandında 4. derece Butterworth biçimli Gauss süreçtir; ± değer tepe kabul edilir, σ = A/${kp} (Gauss tepe aşımı %${fmt(100 * (1 - erfApprox(kp / Math.SQRT2)), 2)}). Eşdeğer sinüs genliği A_eq = √2·σ bütçe satırlarına (B1-01…B1-03) girer. Serbestlik dereceleri bağımsız üretilir (çapraz spektrum yok).`
    : `Dar kip: roll, pitch ve yaw eşdeğer sinüs genliği ve baskın periyotla (log-Gauss dar bant, σ = A/√2) üretilir; doğrusal deniz hareketi yoktur${D.rOn ? `; kaldıraç kolu (${aT}) açısal hareketten öteleme ivmesi türetir` : ''}. SS4 / SS5 6-DOF profilleri için Parametreler → Deniz hareketi.`));
  const vr = (q) => (q.active ? q.sigma * ENG.velRatio(q.shape, q.fdom) : 0), ar = (q) => (q.active ? q.sigma * ENG.accRatio(q.shape, q.fdom) : 0);
  const name = { roll: 'Roll Φ (°)', pitch: 'Pitch Θ (°)', yaw: 'Yaw Ψ (°)', surge: 'Surge x (m)', sway: 'Sway y (m)', heave: 'Heave z (m)' };
  const num = (v, dd) => h('td', { class: 'n' }, v == null ? '—' : fmt(v, dd));
  const angRows = D.ang.map(q => { const w = vr(q) * R2D, a = ar(q) * R2D, pk = kp * q.sigma * R2D, pw = kp * w, pa = kp * a;
    const lim = pk > hx.theta_max ? 'açı' : (pw > hx.omega_max ? 'hız' : (pa > hx.alpha_max ? 'ivme' : ''));
    const act = q.active;
    return h('tr', null, h('td', null, name[q.key]), num(act ? q.A : null, 2), num(act ? q.sigma * R2D : null, 3), num(act ? q.Aeq : null, 3),
      h('td', { class: 'n', style: { whiteSpace: 'nowrap' } }, act ? `${fmt(q.f1, 3)}–${fmt(q.f2, 3)}` : '—'), num(act ? q.fdom : null, 3), num(act ? w : null, 3), num(act ? a : null, 3),
      h('td', { title: act ? `tepe ≈ ${fmt(pk, 1)}° (sınır ${hx.theta_max}°), ${fmt(pw, 1)} °/s (${hx.omega_max}), ${fmt(pa, 0)} °/s² (${hx.alpha_max})` : '' }, act ? okSpan(!lim, lim ? `aşım: ${lim}` : 'uygun') : '—')); });
  const linRows = D.lin.map(q => { const v = vr(q), a = ar(q), act = q.active;
    return h('tr', null, h('td', null, name[q.key]), num(act ? q.A : null, 2), num(act ? q.sigma : null, 3), num(act ? q.Aeq : null, 3),
      h('td', { class: 'n', style: { whiteSpace: 'nowrap' } }, act ? `${fmt(q.f1, 3)}–${fmt(q.f2, 3)}` : '—'), num(act ? q.fdom : null, 3), num(act ? v : null, 3), num(act ? a : null, 3),
      h('td', { title: act ? `strok ±${fmt(st, 2)} m, talep ±${fmt(q.A, 2)} m` : '' }, act ? okSpan(q.A <= st, q.A <= st ? 'strok içinde' : `strok ×${fmt(q.A / st, 1)}`) : (six ? 'profilde yok' : 'dar kipte yok'))); });
  box.append(h('div', { class: 'tscroll' }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Serbestlik', six ? '± tepe' : 'A (eşd. sinüs)', 'σ (RMS)', 'A_eq = √2σ', 'Bant (Hz)', 'f_dom (Hz)', 'Hız RMS (/s)', 'İvme RMS (/s²)', 'Hexapod (≈ 3σ)'].map((c, i) => h('th', { class: i >= 1 && i <= 7 ? 'n' : '' }, c)))),
    h('tbody', null, angRows, linRows))));
  // LOS referans noktasının ivmesi (kaldıraç kolu + ağırlık merkezi ötelemesi) ve laboratuvar ölçeği
  const r = D.r, LD = ENG.seaLabDemand(P), g = 9.80665, sv = D.ang.map(q => vr(q));
  const cenM = [r[0] * (sv[1] ** 2 + sv[2] ** 2), r[1] * (sv[0] ** 2 + sv[2] ** 2), r[2] * (sv[0] ** 2 + sv[1] ** 2)];   // ortalama merkezcil ivme (işaret −)
  box.append(h('p', { class: 'xs muted', style: { margin: '10px 0 6px' } }, 'LOS referans noktasının (mast başı / direktör) doğrusal ivmesi, gövde eksenleri, RMS. Kaldıraç kolu r = (r_x, r_y, h): deniz profilinin tanımlandığı hareket referans noktasından LOS referans noktasına; x pruva +, y iskele +, z yukarı +. Birinci derece terimler: a_x = θ̈·r_z − ψ̈·r_y, a_y = ψ̈·r_x − φ̈·r_z, a_z = φ̈·r_y − θ̈·r_x (yaw, boyuna kol üzerinden yanal ivme üretir). Benzetim tam rijit cisim ifadesini kullanır: a = ω̇_B × r + ω_B × (ω_B × r), gövde hızları Euler hızlarından; bütçe kestirimi birinci derecedir.'));
  const AX3 = ['x (boyuna)', 'y (enine)', 'z (düşey)'], SYM = { roll: 'φ̈', pitch: 'θ̈', yaw: 'ψ̈' };
  const termTd = (t) => { const a = t.filter(q => q.arm > 0 && q.v > 0); return h('td', { style: { whiteSpace: 'nowrap' } }, ...(a.length ? a.flatMap((q, i) => [i ? h('br') : null, `${SYM[q.src]}·${fmt(q.arm, 1)} m = ${fmt(q.v, 3)}`]) : ['—'])); };
  box.append(h('div', { class: 'tscroll' }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Eksen', 'Öteleme', 'Kol terimleri (m/s²)', 'Bağımsız', 'Tam ilişkili (bilgi)'].map((c, i) => h('th', { class: i === 1 || i >= 3 ? 'n' : '' }, c)))),
    h('tbody', null, [0, 1, 2].map(k => h('tr', null, h('td', null, AX3[k]), num(acc.lin[k] > 0 ? acc.lin[k] : null, 3), termTd(acc.terms[k]), num([acc.x, acc.y, acc.z][k], 3), num([acc.corrUp.x, acc.corrUp.y, acc.corrUp.z][k], 3))),
      h('tr', { class: 'tot' }, h('td', null, '|a|'), h('td', null, ''), h('td', null, acc.eff > 0 ? `${fmt(acc.eff / g * 1e3, 1)} mg; f_a = ${fmt(acc.fa, 3)} Hz` : '—'), h('td', { class: 'n' }, h('b', null, fmt(acc.eff, 3))), num(acc.corrUp.eff, 3))))));
  box.append(h('p', { class: 'xs muted', style: { margin: '4px 0 8px' } }, 'Öteleme: ağırlık merkezinin surge / sway / heave ivmesi (6-DOF). Bağımsız: modelin karesel toplamı. Tam ilişkili: bir eksendeki terimler aynı fazda toplansaydı (üst sınır, bilgi). f_a: ivme terimlerinin varyansla ağırlıklı RMS frekansı (B1-08 satırının frekansı).'));
  box.append(kvTable([
    ['Kaldıraç kolu r', D.rOn ? `(${r.map(v => fmt(v, 2)).join(', ')}) m` : '0 — kaldıraç kolu yok. Dar kip yalnız açısal hareket verir; gerçekte mast başı / direktör hareket referans noktasından uzaktadır — r girin'],
    ['Ortalama merkezcil ivme (ikinci derece)', `x ${fmt(-cenM[0], 4)} · y ${fmt(-cenM[1], 4)} · z ${fmt(-cenM[2], 4)} m/s² = −r_x(σ_θ̇² + σ_ψ̇²), −r_y(σ_φ̇² + σ_ψ̇²), −r_z(σ_φ̇² + σ_θ̇²); bütçede ihmal, benzetimde var`],
    [`Bütçe B1-08 = LOS ivme duyarlılığı × |a| (${H.accSens} µrad/(m/s²), varsayım)`, `${fmt(H.accSens * acc.eff, 2)} µrad RMS (tam ilişkili sınır ${fmt(H.accSens * acc.corrUp.eff, 2)}) — ek satır, tahsis proje kararı (Q = 0); duyarlılık T2.5'te ölçülür`],
    ['Laboratuvar: öteleme talebi (tepe ≈ k_p·σ + ikinci derece kayma)', `x ${fmt(LD.axes[0].peak, 3)} · y ${fmt(LD.axes[1].peak, 3)} · z ${fmt(LD.axes[2].peak, 3)} m (σ: ${LD.axes.map(a => fmt(a.sigma, 3)).join(' · ')} m). Gauss süreçte en büyük değer kayıt uzadıkça büyür (Rayleigh tepeleri: ≈ √(2 ln N) + 0,577/√(2 ln N), N ≈ çevrim sayısı): 10 dk'da ≈ 3,2σ, 100 dk'da ≈ 3,9σ (V&V S3) — koşudaki q bu tahminden %5–25 küçüktür`],
    [`Hexapod öteleme stroku ±${fmt(st, 2)} m → ölçek q`, h('span', null, LD.pk > 0 ? (LD.q < 1 ? okSpan(false, `q ≈ ${fmt(LD.q, 4)}`) : okSpan(true, 'q = 1 (tam ölçek)')) : '— (öteleme talebi yok)', LD.pk > 0 && LD.q < 1 ? ` — öteleme talebi stroku ${fmt(1 / LD.q, 1)} kat aşar; laboratuvar deniz profilinin öteleme bileşenini q oranında küçültür (koşudaki gerçek q zaman serisinden hesaplanır, Düzenek metrikleri)` : '')],
    ['Doğrulama yolu (ivme eşdeğerliği)', 'Ötelemenin LOS etkisi ivmeyle ölçeklenir (optik montaj esnemesi ≈ yarı statik; dengesizlik torku |θ/T| ∝ f). T2.5 duyarlılığı 2 ve 3 Hz\'de (v13.5; genlik ≤ 12,7 mm, göz bebeği kolimatör demetinde kalır), 2 m/s² ile ayna (mekanik LOS) ve video − ayna (optik yol) olarak ayrı ölçer ve işletme ivmesine yol yol ölçekler (B1-08). Tek frekanslı toplam duyarlılık iki yolun kısmi sönümlenmesi nedeniyle iyimser olabilir.'],
  ]));
  box.append(noteP('Model roll, pitch, yaw ve 6-DOF kipinde surge, sway, heave\'i birbirinden bağımsız Gauss süreçleri olarak üretir; aralarında çapraz spektrum (RAO faz ilişkisi) yoktur. Gerçek gemide bu hareketler aynı dalga girdisinden doğar: kiriş denizinde roll–sway–yaw, baş denizinde pitch–heave–surge güçlü ve faz ilişkilidir. Bir eksendeki ivme terimleri aynı fazda toplanırsa RMS tablodaki tam ilişkili üst sınıra kadar çıkar (eksende n terim varsa en çok √n kat); ters fazda bağımsız tahminin altına iner. B1-08 ivmeyle doğrusaldır, aynı aralık ona da uygulanır (B1-10 için yaklaşık). Laboratuvar profili de bağımsız serbestlik dereceleriyle üretilir. Korelasyonlu profil gemiye özgü RAO\'lar ve dalga spektrumu gerektirir.', 'Bilgi — serbestlik dereceleri bağımsız: '));
  // gerekli DRR, bütçe varsayımı ve örnek DUT döngüsü (B1-01…B1-03)
  const I = ENG.seaDrrInfo(P), losTxt = { el: 'el (yükseliş)', xel: 'xel (çapraz yükseliş)', rot: 'LOS ekseni etrafında (görüntü rotasyonu)' };
  box.append(h('p', { class: 'xs muted', style: { margin: '12px 0 6px' } }, `Deniz hareketinin bastırılması (B1-01…B1-03). Gerekli DRR = 20·log10(tahsis / σ). Analitik bütçe satırı σ·10^(H/20) ile tahmin eder; H = ${fmt(I[0].assume, 0)} dB bir bütçe varsayımıdır (Model → Bütçe varsayımları) ve deniz frekansından bağımsızdır. Örnek DUT'un analitik döngü modeli aynı satırı baskın frekansta ve deniz spektrumu ağırlıklı (σ·√(∫S|DRR|²df / ∫S df)) verir. Bu DUT'ta DRR deniz bandında frekansla 20–30 dB/dekad kötüleşir: periyot kısalınca ya da bant yükseldikçe artık büyür, bütçe tahmini değişmez.`));
  box.append(h('div', { class: 'tscroll' }, h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Serbestlik', 'LOS etkisi', 'f_dom (Hz)', 'Gerekli DRR (dB)', 'Bütçe H → tahmin', 'DUT DRR @ f_dom (dB)', 'DUT artığı (spektrum ağırlıklı)', 'Tahsis (µrad)', 'Durum'].map((c, i) => h('th', { class: i >= 2 && i <= 7 ? 'n' : '' }, c)))),
    h('tbody', null, I.map(q => { const st = q.active && q.los !== 'rot' && isFinite(q.wres), okD = st ? q.wres <= q.alloc : null, opt = st && q.wres > 1.2 * q.est;
      return h('tr', null, h('td', null, `${q.key} (${q.row})`), h('td', null, losTxt[q.los]), num(q.active ? q.f : null, 3), num(q.active ? q.req : null, 1),
        h('td', { class: 'n', style: { whiteSpace: 'nowrap' } }, q.active ? `${fmt(q.assume, 0)} dB → ${fmt(q.est * 1e6, 2)} µrad` : '—'), num(st ? q.dom : null, 1), h('td', { class: 'n' }, st ? fmt(q.wres * 1e6, 2) + ' µrad' : '—'), num(q.alloc * 1e6, 2),
        h('td', null, !q.active ? '—' : (st ? okSpan(okD, okD ? (opt ? 'tahsis içinde · bütçe varsayımı iyimser' : 'tahsis içinde') : (opt ? 'tahsis aşımı · bütçe varsayımı iyimser' : 'tahsis aşımı')) : 'stabilize edilmez (R-01)'))); })))));
}
// FOG: doğrudan stabilizasyonda (gyro iç gimbalde) parametrelerin kapalı biçim etkileri; benzetim T1.8 (dönüş) ve T4.2 (sıcaklık)
function renderFogPanel(P, d) {
  const box = $('#mFog'); if (!box) return; box.innerHTML = '';
  const G = P.dut.gyro, F = ENG.fogInfo(P), tau = P.wb.tau, H = P.wb.H, hx = P.wb.hex, DPH = Math.PI / 180 / 3600;
  const sfAll = Math.abs(G.sf_ppm || 0) + 1.5 * Math.abs(G.sfnl_ppm || 0), wmax = hx.omega_max * D2R;   // kazanç ölçeği (en kötü)
  box.append(noteP('Doğrudan stabilizasyonda gyro iç gimbal üzerindedir ve LOS\'un eylemsiz hızını ölçer; döngü bu hızı sıfıra sürer. Gemi hızı gyroya değil gimbal açılarına düşer. Bu yüzden ölçek faktörü hatası döngü kazancını ölçekler (bozucu bastırmaya etkisi ihmal edilebilir), ama komutlu dönüş ve izlemede pointing hatası üretir. Gecikme ve bant genişliği faz payını, bias ve sıcaklık kayması drift\'i, g-duyarlılığı ve kuantizasyon jitter\'ı etkiler.', 'Mimari: '));
  const latTxt = (G.lat_ms || 0) > 0
    ? h('span', null, `${G.lat_ms} ms → kesimde ek faz el ${fmt(F.latPhase.el, 1)}° / az ${fmt(F.latPhase.az, 1)}° (360·f_c·τ); faz payı el ${fmt(F.pm.el0, 1)}° → `, okSpan(F.pm.el >= 30, fmt(F.pm.el, 1) + '°'), `, az ${fmt(F.pm.az0, 1)}° → ${fmt(F.pm.az, 1)}°; kazanç payı el ${fmt(F.pm.gmEl0, 1)} → ${fmt(F.pm.gmEl, 1)} dB. Örnek: 1 ms, 20 Hz'de 7,2° faz.`)
    : `0 ms (ek gecikme girilmedi; döngü modelinde 1,5 kontrol periyodu hesap/ZOH gecikmesi zaten var). 1 ms, 20 Hz'de 7,2° faz kaybettirir — "FOG gecikmesi 1 ms" ön ayarıyla deneyin.`;
  box.append(kvTable([
    [`Ölçek faktörü hatası S_f = ${G.sf_ppm || 0} ppm, doğrusalsızlık S_nl = ${G.sfnl_ppm || 0} ppm·FS`, `dönüşte pointing hatası −S_etkin·Δθ; kübik doğrusalsızlık modelinde (IEEE 952 tanımı) S_etkin = S_f − 1,5·S_nl + 2,5·S_nl·⟨ω²⟩/FS²${F.slew.tcS ? ' + sıcaklık kayması ' + fmt(F.slew.tcS, 0) + ' ppm' : ''} = ${fmt(F.slew.eff, 1)} ppm (30°/s dönüş): 10° → ${fmt(Math.abs(F.slew.s10) * 1e6, 1)} µrad, 90° → ${fmt(Math.abs(F.slew.s90) * 1e6, 1)} µrad. Şartname doğrusalsızlığın yalnız zarfını verir; en kötü (|S_f| + 1,5·S_nl): 10° → ${fmt(F.slew.w10 * 1e6, 1)}, 90° → ${fmt(F.slew.w90 * 1e6, 1)} µrad. Döngü kazancını ${fmt(sfAll, 0)} ppm ölçekler: DRR değişimi ≈ ${fmt(20 * Math.log10(1 + sfAll * 1e-6) * 1e3, 2)} mdB. Dolaylı (strapdown) mimaride aynı hata gemi hızına uygulanırdı: S_f·ω_max = ${fmt((G.sf_ppm || 0) * 1e-6 * wmax * 1e6, 1)} µrad/s (ω_max = ${hx.omega_max}°/s).`],
    ['Gecikme τ (döngüye ek)', latTxt],
    [`Bant genişliği f_bw = ${G.fbw} Hz`, h('span', null, `el kesiminde (${fmt(F.pm.fcEl, 1)} Hz) birinci derece faz ≈ atan(f_c/f_bw) = ${fmt(F.bw.phaseEl, 2)}° → `, okSpan(G.fbw >= 500, G.fbw >= 500 ? 'yeterli (≥ 500 Hz)' : '500 Hz altında'))],
    [`Ölçüm menzili ±${G.range_dps} °/s`, h('span', null, `en yüksek komut hızı (hexapod ω_max) ${hx.omega_max}°/s, dönüş ${fmt(F.range.slewRate * R2D, 0)}°/s → `, okSpan(Math.max(hx.omega_max, F.range.slewRate * R2D) < G.range_dps, Math.max(hx.omega_max, F.range.slewRate * R2D) < G.range_dps ? `doyma yok (pay ×${fmt(G.range_dps / Math.max(hx.omega_max, F.range.slewRate * R2D), 1)})` : 'doyar'), '; benzetim doymayı keser (T1.8 tepe hızı raporlar)')],
    [`Kuantizasyon ${G.lsb_dph || 0} °/h/LSB`, (G.lsb_dph || 0) > 0 ? `${fmt(F.lsb.lsbR * 1e6, 4)} µrad/s; τ = ${tau} s penceresinde açı belirsizliği ≈ ${fmt(F.lsb.angleTau * 1e6, 5)} µrad (ihmal edilebilir)` : 'girilmedi (0)'],
    [`Kalibrasyon sonrası sabit artık bias b0 = ${G.bias0} °/h`, `τ = ${tau} s'de ${fmt(F.bias.b0 * 1e6, 3)} µrad; benzetimde olduğu gibi uygulanır (Allan analizi, T0.6, sabit bias'ı görmez; T0.7'nin kaymasına girer). Bütçe karşılığı B1-09 (b0 artığı varsayımı ${H.b0_res} °/h)`],
    [`Bias sıcaklık katsayısı ${G.tcBias || 0} °/h/°C (T_cal = ${G.Tcal} °C)`, (G.tcBias || 0) !== 0 ? `−20 °C'de ${fmt(F.bias.tcCold * 1e6, 3)} µrad, +55 °C'de ${fmt(F.bias.tcHot * 1e6, 3)} µrad / τ; bütçe B1-09: |${H.tc_bias}·${H.dT}| °/h; T4.2'de çalışma sıcaklığı uygulanır` : 'girilmedi (0); bütçe B1-09 varsayımı ' + H.tc_bias + ' °/h/°C × ' + H.dT + ' °C'],
    [`Ölçek sıcaklık katsayısı ${G.tcSF || 0} ppm/°C`, (G.tcSF || 0) !== 0 ? `ΔT = 35 °C'de S_f ${fmt((G.tcSF || 0) * 35, 0)} ppm kayar → 90° dönüşte ${fmt((G.tcSF || 0) * 35 * 1e-6 * Math.PI / 2 * 1e6, 1)} µrad ek pointing hatası` : 'girilmedi (0)'],
    [`g-duyarlılığı ${G.kg || 0} °/h/g`, (G.kg || 0) > 0 ? `|a| = ${fmt(F.gsens.acc, 3)} m/s² → ${fmt(F.gsens.rate * 1e6, 4)} µrad/s; döngü bandında integre açı ${fmt(F.gsens.angle * 1e6, 4)} µrad (her ivme terimi kendi baskın frekansında, karesel toplam; RMS frekansı ${fmt(F.gsens.f, 3)} Hz; bütçe B1-10)` : 'girilmedi (0)'],
  ]));
}
// erf yaklaşımı (Abramowitz–Stegun 7.1.26, |hata| < 1,5·10⁻⁷)
function erfApprox(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
// Taban düzeltmesi adım adım: masa (hexapod üst tablası) mikro-titreşimi U-03'ün ölçülen toplam jitter'dan
// karesel düşülmesi. Kip: 'tam' → masa mikro-titreşimi (2 µrad), 'zincir' → ölçüm zincirine gerçekten geçen pay (yalıtılmış koşu,
// T0.3 / T1.3 sonucundan), 'kapalı'. Tek adımlı düzeltme tüm video tabanını (u_v, U-03 tam) düşer; burada iki
// bileşen ayrı gösterilir: u_v² = U-03² + u_kalan².
// v13.7 (kullanıcı kararı K2): TUR ile birlikte karar belirsizliği ve koruma bandı — güncel koşulmuş T0.2, T1.3, T1.9 sonuçlarından
function renderGuard(P) {
  const box = $('#mTur'); if (!box) return;
  const fresh = (id) => { const r = STATE.results[id]; return r && r.key === curKey() && r.res && r.res.num && r.res.num.guard ? r.res.num.guard : null; };
  const rows = [['T0.2', fresh('T0.2')], ['T1.3', fresh('T1.3')], ['T1.9', fresh('T1.9')]];
  const u = (x) => (x == null || !isFinite(x) ? '—' : fmt(x * 1e6, 2));
  const pc = (p) => (p > 0.999 ? '> %99,9' : (p < 0.001 ? '< %0,1' : '%' + fmt(100 * p, 1)));
  box.append(h('h4', { style: { margin: '14px 0 6px', fontSize: 'var(--fs-s)' } }, 'Karar belirsizliği ve koruma bandı (TUR ile birlikte)'));
  box.append(noteP(`TUR, ölçüm tabanının gereksinime oranıdır; karar belirsizliği ise ölçülen değerin kendi standart belirsizliğidir: u_c = √(u_ist² + (x·u_rel)²) — tekrarların ya da pencerelerin saçılımı ve kalibre ölçek (T0.1 koşulduysa onun belirsizliği, yoksa ε). U = k·u_c (k = ${P.wb.k_exp}). Koruma bandlı karar: x + U ≤ R → KABUL, x − U > R → RED, arada BELİRSİZ; P(uygun) = Φ((R − x)/u_c). Düzeltilmemiş toplanır taban tek yönlü yanlılıktır, U'ya katılmaz. Testlerin OK/AŞIM durumu basit kabul kuralıyla verilir (kullanıcı kararı, v13.7).`));
  const any = rows.some(([, g]) => g);
  if (!any) { box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, 'T0.2, T1.3 ya da T1.9 bu parametrelerle koşulunca tablo dolar.')); return; }
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Test · büyüklük', 'x (µrad)', 'R', `U (k = ${P.wb.k_exp})`, 'Karar', 'P(uygun)', 'Taban yanlılığı'].map((c, i) => h('th', { class: i && i < 4 ? 'n' : '' }, c)))),
    h('tbody', null, rows.flatMap(([id, G]) => (G || []).map(g => h('tr', null, h('td', null, `${id} · ${g.label}`), h('td', { class: 'n' }, u(g.x)), h('td', { class: 'n' }, u(g.R)), h('td', { class: 'n' }, u(g.U)),
      h('td', { class: g.verdict === 'RED' ? 'over' : '' }, g.verdict), h('td', null, pc(g.pConf)),
      h('td', { class: 'small' }, g.bias == null ? '—' : (g.floorMode === 'add' ? `videoyla +${u(g.bias)}` : `+${u(g.bias)} (içinde)`))))))));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, 'T1.3: en kötü tohum, tohumlar arası saçılım; T1.9: takip sonrası havuzlanmış RMS, pencereler arası sd/√n (karar büyüklüğü gerçek optik LOS; yanlılık sütunu videoyla ölçülseydi eklenecek tabanı gösterir); T0.2: 3 tekrarın sd/√3.'));
}
function renderFloorCorr(P, ti, us) {
  const box = $('#mTur'); if (!box) return;
  const mode = P.wb.hex.mvCorr || 'kapalı', mv = P.wb.hex.microvib, uv = ti.uvAdd, uRest = Math.sqrt(Math.max(0, uv * uv - mv * mv));   // v13.6: çarpımsal U-05 düşülmez
  const fresh = (id) => { const r = STATE.results[id]; return r && r.key === curKey() && r.res && r.res.num ? r.res.num : null; };
  const n13 = fresh('T1.3'), n03 = fresh('T0.3'), sh = (n13 && n13.mvShare) || (n03 && n03.mvShare) || null;
  const sV = sh ? sh.on.vid.el * 1e6 : NaN, sAc = sh ? Math.max(sh.on.ac.el, sh.on.ac.xel) * 1e6 : NaN;   // pay rad → µrad
  const raws = [['Örnek (ham σ)', us.raw]]; if (n13 && n13.wander) raws.push(['T1.3 el', n13.wander.el * 1e6]);
  const sub = (r, ...q) => { const v = r * r - q.reduce((a, x) => a + (isFinite(x) ? x * x : 0), 0); return v > 0 ? Math.sqrt(v) : 0; };
  const rel = (r, ...q) => q.reduce((a, x) => a + (isFinite(x) ? x * x : 0), 0) <= 0.5 * r * r;
  const cell = (r, ...q) => h('td', { class: 'n' + (rel(r, ...q) ? '' : ' over') }, fmt(sub(r, ...q), 2) + (rel(r, ...q) ? '' : ' *'));
  const steps = [
    ['1 · Ham ölçüm', 'σ_ham', (r) => h('td', { class: 'n' }, fmt(r, 2))],
    [`2 · Masa payı tam (masa mikro-titreşimi ${fmt(mv, 2)} µrad)`, '√(σ_ham² − U-03²)', (r) => cell(r, mv)],
    [`3 · Masa payı zincire özgü (s_v = ${sh ? fmt(sV, 3) : '—'} µrad, stab ON video el)`, '√(σ_ham² − s_v²)', (r) => (sh ? cell(r, sV) : h('td', { class: 'n' }, '—'))],
    [`4 · 3 + kalan video tabanı (u_kalan = ${fmt(uRest, 2)} µrad)`, '√(σ_ham² − s_v² − u_kalan²)', (r) => (sh ? cell(r, sV, uRest) : h('td', { class: 'n' }, '—'))],
    [`5 · Tüm toplanır video tabanı tek adımda (u_v,top = ${fmt(uv, 2)} µrad, U-03 tam; U-05 çarpımsal, düşülmez)`, '√(σ_ham² − u_v,top²)', (r) => cell(r, uv)],
  ];
  box.append(h('h4', { style: { margin: '14px 0 6px', fontSize: 'var(--fs-s)' } }, 'Taban düzeltmesi: masa mikro-titreşiminin karesel düşülmesi'));
  box.append(noteP(`σ_DUT = √(σ_ölç² − s²). Kip: ${ENG.MV_MODE_TXT[mode]} (Parametreler → Hexapod). U-03 (${fmt(mv, 2)} µrad) video tabanı varyansının %${fmt(100 * mv * mv / (uv * uv), 0)}'ını taşır; ancak stab ON'da DUT tabla hareketini kendi DRR'ı kadar bastırır ve video entegrasyonu yüksek frekansı ortalar, bu yüzden ölçüme geçen pay zincire özgüdür.` + (sh ? ` Yalıtılmış koşu: stab ON video el/xel ${fmt(sh.on.vid.el * 1e6, 3)} / ${fmt(sh.on.vid.xel * 1e6, 3)}, yüksek hızlı ${fmt(sAc, 3)}; stab OFF video ${fmt(Math.max(sh.off.vid.el, sh.off.vid.xel) * 1e6, 3)} µrad (tabla ${fmt(sh.on.table * 1e6, 2)} µrad).` : ' Zincire özgü pay T0.3 ya da T1.3 koşulunca hesaplanır (yalıtılmış masa koşusu).')));
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, h('th', null, 'Adım'), h('th', null, 'İfade'), ...raws.map(([n]) => h('th', { class: 'n', style: { whiteSpace: 'nowrap' } }, n)))),
    h('tbody', null, steps.map(([a, f, fn]) => h('tr', { class: (mode === 'tam' && a.startsWith('2')) || (mode === 'zincir' && a.startsWith('3')) ? 'tot' : '' }, h('td', null, a), h('td', { class: 'mono small', style: { whiteSpace: 'nowrap' } }, f), ...raws.map(([, r]) => fn(r)))))));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, `Değerler µrad RMS; T1.3: en kötü tohum, el ekseni. Kalın satır: seçili kipin T1.3'e ve Bütçe sekmesine uyguladığı adım. * : düşülen varyans ham varyansın yarısını aşar, düzeltme güvenilmez (ör. ham 3 µrad, u_v = 2,66 µrad → 1,38 µrad). Geçerlilik koşulları: düşülen bileşen DUT artığından bağımsız, aynı bantta ve aynı metrikle (pencereli wander) ölçülmüş olmalı; ham ve düzeltilmiş değer birlikte raporlanır. 2 µrad'ı tam düşmek stab ON ölçümünde DUT'u olduğundan iyi gösterir.`));
}
