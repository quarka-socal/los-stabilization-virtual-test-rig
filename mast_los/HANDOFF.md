# Mast LOS Sanal Test Düzeneği — devir belgesi (motor v13.18, arayüz 14.0, 10.11.2026)

Bu belge, projeyi yeni bir sohbette (ya da bağlam özetlendikten sonra aynı sohbette) kaldığı yerden sürdürmek içindir.
Paketi açıp bu dosyayı okutmak yeterlidir: "HANDOFF.md'yi oku, kaldığımız yerden devam et."

## 1. Ne bu?

Optronik mast LOS jitter test kampanyasının fiziksel sayısal ikizi: hexapod (ya da shaker) üzerinde iki eksenli
stabilize optronik kafa, kolimatöre bakarken 2–4 kHz zaman alanı benzetimi; 28 test (T0.1…T4.2 + T1.9), jitter
bütçesi, işletme ayrıştırması, proje LOS kalıntı gereksinimleri. Tek dosyalık HTML sayfası olarak yayımlanır.

- Yayımlanmış sayfa (artifact, Sürüm 36 sürüm kimliği 1794319237-10e6, arayüz 14.0): https://claude.ai/artifact/AAhMfo3AcxuBY6SreiYsne
  (yinelenen eski kopya B3GghnYxhY5PbD6bff78Bu — kullanıcı istemedikçe silinmez)
- Kullanıcı kararı (28.10.2026): simülasyon kendi içinde tanımlıdır; ilk sürümlerin dayandığı Excel çalışma kitabı ve
  test kılavuzu artık referans değildir ve pakette yoktur. Parametreler Model sekmesinde rol etiketiyle tanımlıdır
  (kanal, gereksinim, kabul kuralı, düzenek, senaryo, bütçe varsayımı, analiz; turuncu: örnek / kalibre). Literatür ve
  standart atıfları yöntem dayanağıdır, bağımlılık değildir.
- Kullanıcı kararları (28.10.2026, v13.1): denizaltı varsayılanında kaldıraç kolu h = 1 m (kullanıcı girer); kaldıraç kolu tam
  vektör r = (r_x, r_y, h) (gemi direktörünün boyuna/enine konumu); 6-DOF serbestlik derecelerinin bağımsızlığı modellenmez,
  bilgi olarak verilir (tam ilişkili üst sınır: Model deniz paneli, T2.5, Yöntem bulguları, kılavuz §3).
- Kullanıcı kararları (28.10.2026, v13.3, §4 VIV — "bütün önerilerini onaylıyorum"): (1) denizaltı mast başı ötelemesi
  y = θ·L/κ (L = 4 m, κ = 1,5; akışa dik y, roll ile aynı fazda; Model'den kapatılabilir); (2) kütle oranı m* parametre
  (varsayılan 1,2): K0 üst sınırı K0_üst·f*_alt, f*_alt = √((m* + 1)/(m* − 0,54)); alt dal f*·f_n ek dwell adayı; m* ≤ 0,54 →
  üst sınır yok; boş → sabit kural; (3) genlik senaryo/ölçüm değeri kalır (korelasyon tahmini yok); (4) denizaltı işletme hız
  zarfı U_min–U_max (2–12 kn, mast açıkken): zarfta riskli hız yoksa VIV yok, B2-01 = 0; (5) akış yönü VIV'i (2·f_v) bilgi.
  Uygulamada eklenen kural (kullanıcıya bildirildi): alt dal adayı yalnız zarfta erişilirse, f_v,maks·(1 + pay) ≥ f_n,vak =
  f_n·√((m* + 1)/m*) (Govardhan & Williamson 2000: üst → alt dal geçişinde f ≈ f_n,vak).
- v13.4 (02.11.2026, kılavuz §5 "Hexapod ve kolimatör, taban düzeltmesi"): kullanıcı §4'ün iki sorusunu yanıtlamadı; önerildiği
  gibi kaldı (alt dala erişimde pay korunur; DUT dar bant kontrolünün 1,2–6 Hz bandı DUT bulgusu). §5 için altı karar soruldu
  (bölüm 6): vinyetleme kuralı, ötelemeli testlerin kolimatörü, paralaks, taban düzeltmesi varsayılanı + M7, öteleme dinamiği,
  L_off = 0 onayı.
- Kullanıcı kararları (02.11.2026, v13.5, §5 — "Önerdiğin düzeltmeleri onaylıyorum"): (1) gerçek vinyetleme (e > (D_c − D_p)/2,
  örtüşme < 1) testi GEÇERSİZ yapar, yalnız k paylı sınır aşılırsa not; (2) T2.5 öteleme segmentleri 2 ve 3 Hz (2 m/s², ±12,7 /
  5,6 mm); deniz profilli laboratuvar testlerinde deniz ötelemesi e ≤ e_free olacak biçimde ×q_c (fitTransToColl); gemi D_c 200 mm
  (≥ 165 mm gerekli); (3) paralaks: kolimatör odak hatası δ hedef yolunda (zemin kuplajıyla aynı yol), varsayılan 0, panelde δ_max;
  (4) taban düzeltmesi varsayılanı kapalı, M7 üç kipi 2 ve 10 µrad masada ayırt eder; (5) öteleme dinamiği varsayılanı fbw (§4
  güncellendi); (6) L_off = 0 onaylandı.
- v13.6 (03.11.2026, kılavuz §6 "Ölçüm zinciri ve belirsizlik (TUR)"): kullanıcı §5'in vinyetleme eşiği sorusunu yanıtlamadı;
  kural keskin kaldı (açık). §6 için dört karar soruldu (bölüm 6): K1 piksel fazı yönetimi, K2 TUR kavramı, K3 ROI kanalı, K4 IMU ve
  otokolimatör gürültüsünün tanımı.
- Kullanıcı kararları (03.11.2026, v13.7, §6): K1 (a) piksel fazı yalnız raporlanır (S-eğrisi düzeltmesi / dither yok); K2 (c) TUR ile
  karar belirsizliği ve koruma bandı birlikte raporlanır; K3 ROI kanalı T3.3'e eklenmez; K4 (b) IMU ve otokolimatör gürültüsü yoğunluk
  (µrad/√Hz) olarak tanımlanır ve IMU gürültüsü IMU süzgecinden geçer. "Bunları uygula, ardından sıradaki bölüme aynı şekilde geç" →
  §7 Dünya dönüşü aynı sürümde (v13.7); §7 için üç karar soruldu (bölüm 6). §5'in vinyetleme eşiği sorusu hâlâ yanıtsız.
- v13.8 (04.11.2026, kılavuz §8 "Bütçe varsayımları (gyro, görüntü rotasyonu, EIS)"): kullanıcı §7'nin K1–K3'ünü ve §5'in vinyetleme
  eşiğini yanıtlamadı; şimdiki davranış korundu. Kullanıcı Düzenek dedektöründe dünya dönüşü gösterimini sordu (deniz profili, α 90° /
  45°, φ 40° / 20°, kompanzasyon kapalıyken "hep aynı yön"): değerler analitik beklentiyle aynı; kapalıyken büyüklük Ω (1,82 px/s), yatayla
  açı 90° − φ, φ değişince yeniden Koştur gerekir (check32b.js, probe/k9/playlat.js). §8 için üç karar soruldu (bölüm 6).
- Kullanıcı kararları (04.11.2026, v13.9): §7'nin K1–K3'ü ve §5'in vinyetleme eşiği için "bunlara bir işlem yapma" → şimdiki davranış kalıcı
  (T0.7 AÇIK ölçütü bütçe bileşimiyle, δ 1°, kompanzasyon hatası en kötü yönde; vinyetleme kuralı tam örtüşmeyle). §8: K1 (a) G1 doğrusal
  korundu; K2 (b) rastgele yürüyüş satırları wander penceresinde (B1-05 = ARW·√(T_w/15), B1-06 / B1-09 yalnız drift) uygulandı; K3 (a) R-01
  mutlak 0,5 mrad korundu. "Ardından sıradaki bölüm Örnek DUT — stabilizasyon döngüsü ile aynı şekilde devam et" → kılavuz §9 (Model'deki
  "Örnek DUT — stabilizasyon döngüsü" grubu); örnek DUT'un mekanik/sürtünme ve gyro/modlar/optik grupları ayrı bekleyen bölümler oldu.
  §9 için üç karar soruldu (bölüm 6).
- Kullanıcı kararları (04.11.2026, v13.10, §9): K1 (b) dar bandın frekans kestirim hatası parametresi (dut.ctl.res.estErr, varsayılan 0 = ideal);
  K2 (b) sürtünme gözlemcisine ayrı model oranları (dut.ctl.ff.obs.Fc / Fs / vs / s0, varsayılan 1 = tam bilgi); K3 (a) sıcaklık programlı sürtünme
  modeli varsayılanda kapalı (T4.2 AŞIM riski gösterir). "Bunları tamamla ve benzer şekilde bir sonraki bölüm §10 Örnek DUT — mekanik ve
  sürtünme'ye geç" → kılavuz §10 aynı sürümde (v13.10); §10 için beş karar soruldu (bölüm 6).
- Kullanıcı kararları (04.11.2026, §10): "Şimdiki kalsın. Bir değişiklik yapma." → K1–K5 (a); kod değişmedi. "§11 Örnek DUT — gyro, modlar,
  optik bölümüne benzer şekilde geç" → kılavuz §11 (v13.11); §11 için dört karar soruldu (bölüm 6).
- Kullanıcı kararları (05.11.2026, §11): "a. Şimdiki değerler aynı kalsın" → K1–K4 (a); kod değişmedi. "Sıradaki bölüme İşletme ortamı ve proje
  gereksinimleri benzer şekilde geç" → kılavuz §12 (v13.12); §12 için üç karar soruldu (bölüm 6).
- Kullanıcı kararları (05.11.2026, §12): "Karar bekleyenler için senin tavsiyen nedir? Kayda değer önemli bir değişiklik oluyorsa uygula" → tavsiye
  edilip uygulandı (v13.13): K1 (b) dalga çarpması genlik ölçeği Campbell beklentisine (2100 µrad), K2 (a) PPV 6,5·σ kaldı (gereksinim sahibine öneri
  kılavuzda), K3 (b) T1.7 gereksinimsiz BİLGİ. 10.11.2026 "En son kaldığın yerden devam et" → kesilen ön hesap zinciri sürdürüldü, v13.13 yayımlandı.
- 10.11.2026: "Sıradaki bölüm Düzenek sekmesi'ne aynı şekilde geçelim" → kılavuz §13 (v13.14, Sürüm 30 ve 31); §13 için iki karar soruldu (bölüm 6).
- Kullanıcı kararları (10.11.2026, §13): K1 (a) laboratuvar darbesi şimdiki gibi (100 ve 200 ms darbeler gerçek hexapod'da üretilemez), K2 (a) Düzenek
  LOS satırları bilgi amaçlı; kod değişmedi (wb.hex.pulseRule gizli ve kullanılmıyor). "Sıradaki bölüm Kampanya, Bütçe, Gereksinimler ve Yöntem
  sekmeleri" → kılavuz §14 (v13.15 Sürüm 32, v13.16 Sürüm 33); §14 için iki karar soruldu (bölüm 6).
- 10.11.2026 (§14): "Önerilerini uygula ve sıradaki bölüme Sınırlar, bilinen sorunlar ve doğrulama günlüğü geç" → K1 (c) uyarlamalı tohum (T1.9 20),
  K2 (c) işletme çarpma hariç bilgi satırları + V&V G6 (v13.17, Sürüm 34); kılavuz §15 (v13.18, Sürüm 35), rehberin son bölümü; §15 için üç karar
  soruldu (bölüm 6). 14:11 "En son kaldığın yerden devam et" → §15 belgesi, devir, paket tamamlandı.
- 10.11.2026 16:21: "Mast LOS Sanal Test Düzeneği excel gibi gözüküyor. Simülasyonun fizik motorunu doğruluğunu koruyarak, endüstriyel
  uygulamalarda olduğu gibi profesyonel görünümlü ve kullanışlı bir arayüz oluştur." Seçimler: tema "Açık iş istasyonu" (açık varsayılan,
  düğmeyle koyu), kapsam "Yeni kabuk + ekran düzenleri" (sol gezinme, üst durum çubuğu, özet panosu, süzülebilir listeler, ayrıntı panelleri);
  her seçenekte motor, ön hesap ve gösterilen bütün sayılar korunur → arayüz 14.0 (Sürüm 36; bölüm 4). §15 kararları (K1–K3) hâlâ yanıtsız.
- Kullanıcı tercihi: Türkçe; kanıta dayalı, eleştirel, akademik/mühendislik güvenilirliği; "bana sorarak ilerle".
- İç adlandırma: parametre ad alanı `P.wb` tarihseldir ("temel girdiler"); bütçe sütun harfleri (E, G, H, I, K, N, O,
  Pp, Q, AA…AH) motor içi alan adlarıdır.

## 2. Dizin yapısı

```
sim/src/          motor kaynakları (sırayla birleştirilir)
  01_core.js        RNG, FFT, biquad (RBJ), osilatörler, spektral biçimler (shapeBand, shapeLogGauss), accRatio/velRatio
  02_model.js       varsayılan parametreler (baseDefaults, dutDefaults, envDefaults, labDefaults, anaDefaults,
                    losReqDefaults), derive(), loopModel() (analitik döngü), seaDOF/seaArm/seaAccDirector/seaLabDemand
                    (v13.1 kaldıraç kolu vektörü), compatV10()
  03_sim.js         runSim(): zaman alanı benzetimi (gimbal, LuGre, gyro/FOG, modlar, video, izleyici, dönüş)
  04_analysis.js    istatistik, Welch/CSD/H1, sineFit, PSD ağırlığı, wander, PDE, Allan, EIS
  05_scen.js        senaryolar (deniz seaSeries/seaMotion — v13.1: kol ivmesi tam gövde hızlarıyla, laboratuvar ötelemesi
                    (R − I)·r —, işletme opScenario, OP_ROWS)
  06_tests_a/b/c.js T0.x…T4.2 testleri; TEST_ORDER (06_tests_c.js); BUDGET_ALLOC + budgetAlloc() (06_tests_b.js)
  06_tests_d.js     v12: proje LOS kalıntı metrikleri ve T1.9
  07_budget.js      bütçe satırları, computeBudget, seaDrrAssume/seaDrrInfo (v13), opDecomposition
  08_play.js        Düzenek oynatması
  exports.txt       motorun dışa açtığı ek adlar
sim/build_engine.py    → sim/engine.js (Node) ve sim/engine_browser.js (sayfa)
sim/precompute.js      varsayılan parametrelerle ön hesap → app/pre.json   (tests [id,…] | op | play | all | vv) [ship]
sim/run_pre12.sh       tam ön hesap zinciri (denizaltı + gemi + tohumlar); run_pre13.sh: testler + V&V;
                       run_pre131.sh (v13.1): bütün sonuçlar + tohumlar 1–4 (vv_seeds.js) + ek koşu + V&V, iki kulvar;
                       run_pre132.sh (v13.2), run_pre133.sh (v13.3), run_pre134.sh (v13.4), run_pre135.sh (v13.5),
                       run_pre136.sh (v13.6), run_pre137.sh (v13.7): aynı zincir (v13.7: T0.7 tohum çalışması da);
                       run_pre139.sh (v13.9): testler, işletme, oynatma, gemi, ek koşu, tohumlar 1–4, V&V (T0.7 tohum çalışması yok);
                       run_pre1310.sh (v13.10), run_pre1311.sh (v13.11): aynı zincir;
                       run_pre1312.sh (v13.12): yalnız T1.7 ve T1.9 (iki platform) + ek koşu + V&V; run_pre1312b.sh: T0.1, T0.2, T1.7, T1.9
                       (kısmi koşunun T0.1 bağlamını kullanması için; bkz. v13.12); run_pre1313.sh (v13.13): tam zincir; run_pre1313r.sh: ilk
                       koşu işletme adımında kesildiği için denizaltı testlerinden sonrasını sürdürür; run_pre1314.sh (v13.14): yalnız iki
                       platformun oynatması + V&V + birleştirme; run_pre1315.sh (v13.15): T0.1, T1.9 ve işletme ayrıştırması, iki platform
                       (losSummary.gauss); v13.16: node vv_seeds_agg.js && node precompute.js vv (tohum özetine T1.9 satır alanları);
                       v13.17: node seeds_adapt.js 5 19 T1.9 (iki kulvar) && node vv_seeds_agg.js && node precompute.js op && node vv.js G6
                       (vv_partial.json → vv.json'a G5'ten sonra birleştirildi) && node precompute.js vv; v13.18: yalnız sayfa (app/js/08_method.js)
sim/seeds_adapt.js     v13.17 (§14 K1 c): uyarlamalı tohum — temel 5 tohumda değer / sınır 0,98–1,02 olan karar satırı bulunan testler (seeds.json
                       adaptive.ids; şimdi T1.9) N = 20'ye tamamlanır → seeds_adapt_<k>.json (k 5–19); ön koşul T1.9 ← T0.1; --check kipi k 1–4'te
                       tam kampanya koşusuyla birebirliği sınar (18 satır, fark 0). vv_seeds_agg.js bu dosyaları teste özgü n ile birleştirir
                       (tests[id].n, adaptive {nTarget, near, ids, nDone, offsets})
sim/vv.js              V&V paketi → sim/vv.json (74 kontrol; v13.17: G6 çarpmasız ek koşu (Az çapraz kuplaj ≤ %0,1, Gauss ±%15, çarpmalı > 2× Rice); v13.14: düzenek darbe tepeleri ↔ RK4, v13.15'ten beri K8 (önce yanlışlıkla ikinci K7); v13.15: yinelenen kimlikte çıkış kodu 1; grup filtresi: node vv.js W ya da node vv.js W7,W12,W13,W14,M10)
sim/extra.js           bulgular için ek koşular → extra.json (dar bant kapalı T2.3 + işletme RSS; v13.9: ileri besleme η taraması, T4.2 programlı;
                       v13.10: est (T2.2, kestirim hatası %5 / %10), obs (gözlemci oranları: T1.6 + işletme B1-07), s0 (σ0 × 0,1 / 10 / 100),
                       mount (κ 1e-5 / 1e-4: B2-06 satırı ve bütün kaynaklar wander); video ölçen ek koşular ön hesabın kalibre IFOV'unu kullanır;
                       v13.11: t06 (T0.6 dağılımı: varsayılan 100 tohum, BI 0,06 °/h 60 tohum, kabul oranı), modes (işletme B3-03 optik modu
                       80 / 200 Hz, B3-04 gimbal modu 120 / 300 Hz), gsens (k_g 1 °/h/g: bütçe B1-10 ↔ benzetim, deniz açılarıyla / açısız; iki
                       platform), t01 (T0.1 12 tohum: IFOV hatası, belirtilen u, k1));
                       v13.12: slap (B2-02 dağılımı, dar bant kapalı / yapılandırılmış, 24'er tohum + tohum 11), calibOff (B2-03 / B2-06 dar bant
                       kapalı, tohum 11), t24nofric (T2.4 sürtünmesiz: F_c 1e-6, F_s 1,1e-6, σ0 1e-3 → B2-02 kestirimi));
                       v13.13: twOp (işletme bütün kaynaklar wander el / xel, 60 / 120 / 240 s, iki platform, tohum 11)
sim/regress.js         regresyon (uyum kipi v10 ile sayılar bit düzeyinde aynı olmalı)
sim/probe/k1, k2       teknik kılavuz §2 ve §3 doğrulama betikleri (sweep.js analitik tarama, tests.js test yanıtları, play.js)
sim/probe/k4           §4 VIV (v13.2): sweep.js (S0–S9, W0–W12 analitik ↔ bağımsız ikinci uygulama), tests.js (v13.1 motoru),
                       tests2.js / tests3.js (v13.2: bütün değişim durumları, T2.1–T2.3 + işletme B2-01), w1paths.js (β = 90°
                       yol ablasyonu), play.js (Düzenek VIV oynatmaları), subtrans.js (PROTOTİP: denizaltı mast başı ötelemesi),
                       reg_compat_*.log (uyum regresyonu)
sim/probe/k5           §4 VIV v13.3 (kullanıcı kararları): tests.js (S0–S22 denizaltı, W0–W13 gemi; önce T0.1; T2.1–T2.3 +
                       işletme B2-01 600 s → tests_sub/ship.log/.json), play.js (Düzenek VIV oynatmaları: öteleme kapalı, alt dal
                       f*·f_n, deniz + VIV strok paylaşımı → play.log), quick_*.log, reg_compat_sub.log (uyum: yalnız metin farkı),
                       reg_v132_ship.log (gemi ↔ v13.2: yalnız T2.3 notu)
sim/probe/k6           §5 hexapod ve kolimatör (v13.4): sweep.js (12 durum × 2 platform: erişim, Osc2 iletimi, stab-OFF, kolimatör
                       geometrisi, örtüşme ↔ kutupsal integral, pupilShift ↔ temel dönüş matrisleri, test kaymaları 1 kHz bağımsız,
                       paralaks duyarlılığı → sweep_*.log/.json), tests.js (K0–K11 denizaltı, 7 gemi durumu; T0.1, T0.3, T0.4, T1.3,
                       T2.1–T2.3, T2.5 → tests_*.log/.json; T2.5 sayıları düzeltmeden önce), summ.js (özet), transdyn.js (öteleme
                       dinamiği ideal ↔ fbw; T2.5 düzeltmesinden sonra), mvsitu.js + dither.js (taban düzeltmesi: masa titreşiminin
                       yerinde payı, toplanırlık), coll.js (paralaks prototipi), explore.js, reg134_*.log (v13.3 ↔ v13.4 regresyonu)
sim/probe/k7           §5 v13.5 kararları: tests.js (K0–K15 denizaltı, 11 gemi durumu: sığdırma, kural, δ, öteleme dinamiği, gemi
                       D_c 150 mm → tests_*.log/.json), summ.js (özet), vivtests.js (§4 S0–S22 / W0–W13, fbw ile → viv_*.log/.json),
                       cmp4.js (§4 tabloları: k5 ↔ k7 karşılaştırması), play.js (Düzenek VIV oynatmaları → play_viv.log/.json),
                       s3.js (§3: T2.5 kestirimi 2–3 Hz, T1.3 sığdırmayla → s3.log/.json), regcmp.js (kaydedilmiş regresyon çıktısı ↔
                       başka taban); ../reg135_*.log (v13.4 ↔ v13.5 ve güncel motor ↔ ön hesap)
sim/probe/k8           §6 ölçüm zinciri ve belirsizlik (v13.6): chain.js (piksel fazı kazancı/sapması 8 fazda, IMU/otokolimatör gürültü
                       spektrumu, T0.2 tabanının ayrışımı, bütçe → chain.json), pixphase.js (T1.3/T1.9 ↔ hedef fazı → pixphase.log/.json),
                       sweep.js (17 durum, bağımsız ikinci uygulama ↔ motor, 612 sayı → sweep.log/.json), tests.js (11 durum: T0.1, T0.2,
                       T0.4, T3.3; pixlock 0,05'te T1.9 → tests.log/.json), reg136_*_vs135.log (v13.5 ↔ v13.6 ön hesabı)
sim/probe/k9           §6 kararları ve §7 dünya dönüşü (v13.7): sweep.js (21 durum, ENU vektör izdüşümü ↔ motor kapalı biçimleri, 2016
                       sayı; Rodrigues sonlu farkı → sweep.log/.json), earth.js (T0.7 yanıtları, v13.7 düzeltmelerinden ÖNCE; komp. kapalı
                       uzun testler), earth2.js (T0.7 yanıtları v13.7 motoruyla → earth2.log/.json), biasdist.js (AÇIK kaydının bias payı, 12
                       tohum, 900 / 300 s), campoff.js (kompanzasyon kapalı bütün kampanya), compat136_sub.log / compat137f_sub.log (uyum kipi:
                       v13.6 ↔ son v13.7 motoru; v136/ motor kopyası ve büyük compat*.json çıktıları pakette yok), reg137_vs136_*.log (v13.6 ön
                       hesabı ↔ v13.7), t07_*_v136.log/json (v13.6 T0.7 tohum çalışması)
sim/probe/k10          §8 bütçe varsayımları (v13.8): explore.js (iki platformun bütçe satırları: E, G, H, I, O, Q, EIS sütunları),
                       sweep.js (22 durum; motor ↔ bağımsız ikinci uygulama 3892 sayı, 3,18·10⁻¹⁶; karar alternatifleri: roll tabanı,
                       G1 karesel, wander penceresi, ikisi; Monte Carlo σ√(T/15), σ√(T/6) → sweep.log/.json; v13.7 motoruyla
                       sweep_v137.*), tests.js (T0.6, T1.1, T1.5 durumları, işletme B1-04 a0 0°, işletme B1-05 4 tohum → tests.log/.json)
sim/probe/k11          §9 stabilizasyon döngüsü (v13.9): loop_eng.js (17 durum, motorun loopModel değerleri → loop_eng.json/.log),
                       loop_ref.py (numpy/scipy bağımsız ikinci uygulama: K, kesim, PM, GM, |S|, DRR, tork ve gyro gürültü yolları →
                       loop_ref.log/.json), tests.js (T1.1, T2.1, T2.2, T1.6, T1.8, T1.4, T4.2, T1.5 durumları; zaman alanı DRR'ı dar bant ayar
                       hatasıyla; işletme B1-07 → tests.log/.json), ffmis.js (η taraması: T1.6 + işletme B1-07 → ffmis.log/.json),
                       compat139_sub.json/.log + compat139_vs137f.log (uyum kipi), prediff139.log (v13.8 ↔ v13.9 ön hesabı: 29 beklenen fark);
                       v13.10: decide.js/.log/.json (§9 karar seçenekleri: kestirim hatası T2.2/T2.3, gözlemci oranları T1.6/B1-07)
sim/probe/k12          §10 mekanik ve sürtünme (v13.10): mech_eng.js/.json (motor: b/k duyarlılığı, J ölçeklemesi) ↔ mech_ref.py/.log/.json
                       (bağımsız: b ve k'nın scipy fsolve çözümü, J × 0,5 / 1 / 2 tork yolu; fark 1,5·10⁻¹¹), tests.js/.log/.json (kalibrasyon tabanı,
                       J, b, k, F_c, σ0, vuruntu, dengesizlik, κ: T1.1 / T1.6 / T2.5 / T2.4 + işletme), mount.js/.log/.json (κ taraması),
                       fcui.js/.log/.json (arayüzde F_c değişince σ0 sabit ↔ birlikte), recal.js/.log/.json (K1 b: yeniden kalibrasyonun etkisi),
                       budc.js/.log (K1 c: bütçe tahminleri işletme değerine), estfix.js/.log (ek koşu T2.2'nin kalibre IFOV'la yenilenmesi),
                       extra_pre_ctxfix.json (IFOV düzeltmesinden önceki ek koşu), prediff1310.log (v13.9 ↔ v13.10 ön hesabı: 6 beklenen fark)
sim/probe/k13          §11 gyro, modlar, optik (v13.11): gyro_eng.js/.log/.json (T0.6 200 tohum + iki durum) ↔ gyro_ref.py/.log/.json (numpy
                       bağımsız: aynı gürültü modeli ve kestirici, 200 Monte Carlo, kapalı biçim Allan; KS p 0,33); gyro_ref2.py/.log
                       (+ gyro_ref2_24h06.*: kayıt 4 / 12 / 24 sa × B 0,042 / 0,05 / 0,06, yöntem A taban/0,664 ↔ B model uydurması);
                       modes_eng.js/.log/.json (mod rezonansı fs 4 / 16 kHz), modes_ref.py/.log/.json (bağımsız: B3-02, B3-03, B3-04, T3.5, B2-05,
                       T3.4 katlanma), loop_fbw.js + loop_fbw_ref.py (gyro f_bw 150–3000 Hz, k11 modeli; fark 2·10⁻¹³°), optics_eng.js/.log/.json
                       (T0.1 30 + 3×12 tohum), tests.js + tests_A/B.log/.json (gyro, modlar, soğutucu değişimleri)
sim/probe/k14          §12 işletme ortamı ve proje gereksinimleri (v13.12): calib.js/.log/.json (ortam kalibrasyonu, dar bant kapalı / açık),
                       slap_eng.js/.log/.json (B2-02 24 tohum) ↔ slap_ref.py/.log/.json (bağımsız Campbell: 2,340 / 1,621; topluluk −%3,3 / −%3,6),
                       los.js/.log/.json (T1.9 değişimleri, PPV Monte Carlo), req.js/.log/.json (gereksinim testleri, T2.4 oturma 1000 / 3000 ms),
                       limits_ref.py/.log/.json (v12 sınırları, Rice, P99,73 kuadratür), t24.log, fixcheck.log, prediff1312.log (v13.11 ↔ v13.12),
                       regress1312_sub.log (güncel motorun tam koşusu ↔ ön hesap: FARK SAYISI 0)
sim/probe/k18          §14 kararları ve §15 (v13.17–18): noslap_check.js/.log/.json (opDecomposition req.noSlap ↔ k17 probu birebir, gemide
                       yok), adapt_check.log (T1.9 yalnız T0.1 ile ↔ tam kampanya k 1–4: fark 0), adapt_a/b.log (k 5–19), seeds_agg1317.log,
                       seeds_pre1317.json, vv_g6.log, vv_full1317.log (V&V baştan 74/74, 289 s; birleştirilmiş sonuçla 74 maddede aynı),
                       vv_pre_full1317.json, pre1317_sub_op.log, pre1317_vv.log, prediff1317.log (v13.16 ↔ v13.17: yalnız op.req.noSlap,
                       seeds T1.9 / n / adaptive, vv G6), regress1317_sub/ship.log/.json (tam regresyon ↔ yayımlanan ön hesap: FARK SAYISI 0,
                       iki platform), pre_v1317_base.json (regresyon tabanı; pakette yok, app/pre.json ile aynı), limits_audit.js (sınırlar
                       listesindeki varsayılanlar), calib_check.js/.log/.json (kalibre düzeyler dar bant kapalı taban döngüde: dalga çarpması
                       dışında en büyük B3-01 +%1,11; B2-02 tek gerçekleşme −%14,5)
sim/probe/k17          §14 Kampanya / Bütçe / Gereksinimler / Yöntem (v13.15–16): rules_dump.js/.json (motorun t95, normCdf, decisionGuard,
                       winStats çıktıları), rules_ref.py/.log/.json (bağımsız scipy / numpy: t tablosu 0,0005, Φ 1,1e-16, koruma bandı 6/6, u95 kapsaması
                       0,948, tohumların ham dosyalardan yeniden toplanması fark 0), op_noslap.js/.log/.json (işletme PPV / P99,73 dalga çarpması açık ↔
                       kapalı, takip öncesi / sonrası), prediff1315.log (v13.14 ↔ v13.15: yalnız gauss alanları ve T1.9 notu), seeds_agg1316.log,
                       pre1316_vv.log (v13.16: yalnız seeds.tests.T1.9.req.rows / basis / nRows yeni)
sim/probe/k16          §13 Düzenek (v13.14): play_dump.js/.json/.log (12 oynatma koşusunun ham kaydı 1 kHz + video → <durum>.bin; .bin pakette
                       yok, yeniden üretilir; varsayılanların ön hesapla birebir aynılığı), play_ref.py/.log/.json (bağımsız yeniden hesap: RMS, P99,
                       eğim, wander, MTF ve tayftan pozlama içi yayılım, dedektör eşlemesi, kayma ayrışımı, VIV, göz bebeği daire kesişimi, dünya
                       dönüşü Ω × LOS sağ elli ENU, alanı terk), pulse_ref.py/.log/.json (yarım sinüs darbenin 20 Hz hexapod sonrası ivmesi, RK4:
                       349 / 644 / 1306 °/s²), viv_paths.js/.log/.json (VIV oranı: tam / ötelemesiz / mekanik LOS ↔ döngü DRR), t24_rule.js/.log/.json
                       (T2.4 ve düzenek darbesi: pulseRule 'ic' ↔ 'gercek'), prediff1314.log (v13.13 ↔ v13.14: yalnız play)
sim/probe/k15          §12 kararları (v13.13): campbell.js/.log/.json (motorun döngü modeliyle Campbell: sayfanın 11 noktalı kuralı 2,3321 / 1,6343,
                       orta nokta 2,3419 / 1,6181, ince ızgara 2,3412 / 1,6184 µrad @ 2458 → yeni A 2099,8), slap_ens.js/.log/.json (72 ayrık tohum
                       124–195 @ 2100: trend çıkarılmış RMS karesel ort 1,959 ± 0,024 ↔ Campbell 2,000; ham RMS 2,171 — yavaş bileşenleri taşır),
                       prediff1313.log (v13.12 ↔ v13.13: yalnız dalga çarpması ve T1.7'ye bağlı farklar)
sim/probe/k3           v13.1 kaldıraç kolu: ident.js (eski ↔ yeni motor, düşey kolda özdeşlik), exactacc.js (küçük açı ↔ tam
                       gövde hızları ↔ bağımsız kinematik), sweep.js (10 durum: analitik ↔ zaman serisi, B1-08, T2.5, q),
                       tests.js (T1.3/T2.5), play.js (Düzenek), redo_k2.js (§3 tablosunun h = 1 m değerleri), prediff.py (v13 ↔ v13.1)
app/js/01…09_*.js      arayüz (01 util, 02 grafik, 03 Web Worker havuzu, 04 kampanya, 04_overview Özet ekranı (arayüz 14.0), 05 düzenek,
                       06 bütçe, 07 model, 08 yöntem, 08_req gereksinimler, 09 ana: kabuk — gezinme, sekans şeridi, sayaçlar, rozetler,
                       durum satırı, tema, panel içi sekmeler tabset(), ekran başlığı scrHead())
app/fonts.css          gömülü yazı tipleri (SIL OFL 1.1; Barlow Semi Condensed 500/600/700, IBM Plex Sans 400/500/600 + Yunan, IBM Plex Mono
                       400/500; woff2 data URI, ≈ 390 kB); tools/mkfonts.py üretir (fonts/ altındaki fontsource npm paketlerinden — pakette yok:
                       npm pack @fontsource/barlow-semi-condensed@5.0.13 @fontsource/ibm-plex-sans@5.0.20 @fontsource/ibm-plex-mono@5.0.13,
                       her biri fonts/fontsource-<ad>-<sürüm>/package altına açılır). build.py /*@FONTS@*/ yerine koyar
app/index.tpl.html, app/style.css, app/tm.json (test tanımları: simülasyonun kendi test planı), app/pre.json (ön hesap)
app/build.py           → app/dist/mast-los.html (tek dosya; three.js r128 cdnjs'den)
testenv/mk.sh          sayfayı derler + yerel test sayfası (app/dist/test.html, yerel three.min.js, window.__T kancası)
testenv/check*.js      Playwright tarayıcı kontrolleri (check24.js dış referans izi + v13, check25.js Düzenek, check26.js v13.1 kol,
                       check27.js v13.2 VIV, check28.js + check28b.js v13.3 VIV kararları, check29.js v13.4 kolimatör: Model paneli,
                       Düzenek demeti/göz bebeği diski, Kampanya göz bebeği satırları, koyu tema, mobil; check30.js v13.5 kararları:
                       Model satırları ve kolimatör paneli (L_off 0,15 m, δ 225 µm, gemi), Düzenek sığdırma ve paralaks koşusu, Kampanya,
                       Yöntem/V&V, Bütçe notu, koyu tema, mobil; check30b.js T2.5 tanımı ve gemi Düzenek; check31.js v13.6: Model ölçüm
                       zinciri etiketleri, Kayıt istatistiği grubu, TUR tablosu ve parametre değişimi, Kampanya T0.1/T0.2/T3.3/T1.9,
                       Düzenek dedektör Piksel kipi, Yöntem/V&V, koyu tema, mobil; check32.js v13.7: Model yoğunluk satırları, TUR
                       U-04/U-07, koruma bandı tablosu, Dünya dönüşü paneli (AÇIK/KAPALI), Kampanya T0.2/T1.3/T1.9/T0.7/T3.3, Düzenek
                       kompanzasyon kapalı koşu, Yöntem/V&V, koyu tema, mobil; check32b.js kompanzasyon kapalıyken enlem
                       bağımlılığı; check33.js v13.8: parçalar model / budget / yontem / rig / theme — Model bütçe varsayımları
                       (B1-04 tabanı), rotasyon ve FOG panelleri, Bütçe B1-04/B1-05/R-01 satırları ve notları (roll tabanı, gemi),
                       Yöntem v13.8 bulguları ve W13, Düzenek EIS görünümü, koyu tema, mobil; check34.js v13.9: parçalar model / budget /
                       yontem / theme — döngü kutucukları (dar bant bandında en düşük PM), DRR grafiği (çalışma frekansında; gemi 4,1 Hz),
                       rwMetric seçimi, Bütçe B1-05 / B1-06 / B1-09 satırları ve notları (τ metriğine dönüş, gemi), Yöntem v13.9 bulguları ve
                       W1 / W14, koyu tema, mobil; check35.js v13.10: parçalar model / budget / yontem / theme — kestirim hatası ve gözlemci
                       oranları satırları, b / k / F_c / σ0 / vuruntu / κ etiketleri, kestirim hatasıyla DRR etiketi, Bütçe kalibrasyon notu, Yöntem
                       v13.10 bulguları ve D6 / W14, koyu tema, mobil; check36.js v13.11: parçalar model / yontem / theme — gyro grubu
                       (xel eksen kaçıklığı), Kampanya T3.4 ve T1.1 sonuçları, Yöntem v13.11 bulguları (mod frekansı değişince canlı), V&V M4 / C3,
                       koyu tema, mobil; check37.js v13.12: parçalar model / run / yontem / theme — ortam ve gereksinim satırları, T1.9 / T1.7 / T2.4
                       sonuçları, tarayıcıda tek test koşusu (T1.9, T3.3; parametre değişince T0.1 önce) ↔ ön hesap, Yöntem v13.12 bulguları (dalga
                       çarpması genliği değişince canlı), V&V G5, koyu tema, mobil; test.html kancası __T.runTests'i de verir);
                       check38.js v13.13: aynı parçalar, genlik 2458'e alınınca eski değerler, T1.7 bulgusu yok); check39.js v13.14: parçalar
                       kin / ui / theme — 3B mekanik zincir (Rig3D.setPose, los = null) bakış doğrultusu ↔ kaydedilen optik LOS (stab KAPALI / AÇIK),
                       Düzenek metrik tablosu (deniz, darbe ×2, VIV, durağan), dedektör notu, koyu tema, mobil; check40.js v13.15: parçalar kampanya / butce /
                       req / yontem / theme — kutucuk ↔ sonuç durumları (iki platform), rozetler, T1.9 tohum satırı, bütçe satırları ve toplamları,
                       Gereksinimler satırları, V&V tekil kimlik, tohum tablosu, bulgu sayısı, koyu tema, mobil; check41.js v13.16: T1.9 satır düzeyi
                       tohum duyarlılığı (Kampanya, Gereksinimler, Yöntem), σ_vek 3.9998 ve koruma bandı, mobil; req_w.js: uygunluk özeti genişliği;
                       check42.js v13.17: T1.9 20 tohum (Kampanya, Gereksinimler, Yöntem, V&V kutucuğu "(T1.9: 20)"), işletme "çarpma hariç"
                       satırları (denizaltı var, gemi yok), tanım maddesi, Yöntem bulgusu, G6; check43.js v13.18: Yöntem "Varsayımlar ve sınırlar"
                       (13 madde, yinelenen hexapod cümlesi yok, geçerleme maddesi), "Bilinen açık konular" (10), kalibre düzey satırı, V&V
                       tanıtımı, "kılavuz" sözcüğü yok; err43.js: Yöntem panel yapısı ve sözdizimi hatası yakalayıcı;
                       err_probe.js: yükleme hatası yakalayıcı); arayüz 14.0: check44.js kabuk denetimi (7 ekran, 28 hücreli şerit ↔ sayaçlar ↔
                       rozet, tema düğmesi ve saklama, şeritten / Özet matrisinden teste gitme, gezgin süzgeçleri, klavye ve #adres gezinmesi, panel
                       sekmeleri, parametre araması, değişiklik rozeti ve bayatlık, Varsayılana dön, tarayıcıda T0.1 koşusu; 1440 / 1920 / 1024 / 390 px,
                       açık / koyu: yatay taşma, "kılavuz" sözcüğü, sayfa hatası; 54 denetim); ui_numbers2.js (bütün ekranların, alt sekmelerin ve
                       katlanmış bölümlerin metnindeki sayılar, 28 testin ayrıntısı, Model girişleri; iki platform) + ui_cmp.py (eski ↔ yeni çoklu
                       küme; taban ui_num_old.json = v13.18 arayüzü, app/dist/old_test.html'den); ui_ident.py (motor, PRE, TM bölümlerinin SHA-256
                       karşılaştırması); ui_shots.js, ui_shots2.js <dizin> <genişlik> <tema> <ekranlar>, ui_scroll.js <ekran> <seçici> <çıktı>
                       (ekran görüntüleri, shots/ui0…ui5)
tools/rep.py           kesin metin değiştirme (sayı denetimli); tools/patch_pre.py: v13 metin eşlemesi (pre.json)
bak_ui0/               arayüz 13.x yedeği (js, style.css, index.tpl.html, build.py, HANDOFF.v1318.md). ui_ident.py tabanı bak_ui0/mast-los.v1318.html
                       pakette yok: v13.18 paketinin app/dist/mast-los.html'iyle bayt bayt aynıdır (SHA-256 5ba6ab0a474fff5d…), oradan kopyalanır
bak_v10/pre_v13text.json  uyum tabanı: v10 ön hesabının sayıları, v13 metinleriyle (tools/patch_pre.py; V&V bölümü
                       tabana alınmaz). Ham v10 ön hesabı eski metinleri taşıdığı için pakette yok.
```

## 3. Çalıştırma

```
cd sim && python3 build_engine.py                      # motoru birleştir (kaynak değişince her zaman)
node vv.js [grup]                                      # V&V; beklenen 73/73
node regress.js ../bak_v10/pre_v13text.json all sub - compat   # uyum kipi: sayılar v10 ile aynı (ship için 'ship')
node regress.js ../app/pre.json all sub -              # güncel motor ↔ ön hesap: FARK SAYISI 0
sh run_pre137.sh                                       # bütün ön hesap + T0.7 tohum çalışması (≈ 60 dk; iki çekirdek)
sh run_pre1311.sh                                      # T0.7 tohum çalışması olmadan bütün ön hesap (≈ 35 dk; v13.9–v13.11 böyle)
node vv.js && node precompute.js vv                    # yalnız V&V: vv.json → pre.json'a katar (v13.8 böyle yapıldı; testler aynı)
cd .. && sh testenv/mk.sh                              # sayfayı derle
cd app/dist && python3 -m http.server 8765 &           # yerel sunucu
node testenv/check24.js; node testenv/check39.js all   # dış referans izi 'yok', sayfa hatası 'yok', mobilde taşma yok
node testenv/check44.js                                # arayüz 14.0 kabuğu: 54 denetim
cd testenv && node ui_numbers2.js test.html ui_num_new.json && python3 ui_cmp.py ui_num_old.json ui_num_new.json   # 'her sayı yenisinde de var'
python3 testenv/ui_ident.py                            # motor / PRE / TM bayt bayt aynı
python3 tools/mkfonts.py                               # yalnız yazı tipi seçimi değişirse (fonts/ paketleri gerekir)
```
Notlar: testenv betikleri `playwright-core` ve sabit bir Chromium yolu kullanır; yeni ortamda
`require('playwright')` + `chromium.launch()` ile değiştirin (ortamda önyüklü). Yayımlama: Artifact aracıyla
`app/dist/mast-los.html`, `url` = yukarıdaki adres (aynı bağlantı korunur). Uyum regresyonunda v13'ün iki bilinçli
metin değişikliği beklenen farktır: T1.1'in kabul notu (iki platform) ve gemide T1.1 sonucunun başındaki "deniz
spektrumu ağırlıklı artık tahsisi aşıyor" ibaresi; sayısal alanlar (num, fill, grafikler, durumlar, işletme) aynıdır.

Yeni test eklemek: `TESTS['Tx.y']` (06_tests_*.js) + `TEST_ORDER` (06_tests_c.js) + `app/tm.json` satırı;
gerekirse `exports.txt`; Yöntem sekmesinde TM_MAP satırı (Kampanya'daki test tanımı panelinde de gösterilir).
Arayüz 14.0 kuralları: renk yalnız durum taşır (OK / aşım / bilgi / geçersiz / koşuyor; her durum simge + metinle de verilir); yeni renk
style.css :root belirteçlerine (açık) ve iki koyu bloğa birlikte eklenir; ekran yeni bir sayı gösterecekse aynı işlevden okur (Özet hesap yapmaz);
panel içi sekme tabset(id, [[anahtar, ad, düğüm]…]) ile; gizli bölmeler .tabpane.off (sayı kaydı .ui-expand ile hepsini açar).

## 4. Sürüm geçmişi (son sürümler ayrıntılı)

- ≤ v10: 27 test, analitik bütçe, işletme ayrıştırması, iki platform (denizaltı mastı; gemi direği EO direktör,
  EN 1991-1-4 rüzgâr VIV), V&V, tohum tekrarı.
- v11 (kullanıcı onaylı kararlar: "zincire özgü pay", "tepe değer, σ = A/3", "ivme eşdeğeri", "doğrudan + eksikler"):
  köşe pikseli görüntü rotasyonu ölçütü; masa mikro-titreşimi taban düzeltmesi; SS4/SS5 6-DOF deniz profili +
  kaldıraç kolu + T2.5 öteleme duyarlılığı (B1-08); FOG parametreleri (B1-09, B1-10). compatV10 v10 sayılarını korur.
- v12: proje LOS kalıntı gereksinimleri (T1.9, Gereksinimler sekmesi, dış kamera takip döngüsü, V&V G1–G4).
- v12.1 (Sürüm 13): Düzenek 3B halka ↔ dedektör tutarlılığı (öteleme halkayı kaydırmaz; dedektör dik ekran görüntüsü).
- v12.2 (Sürüm 14): kılavuz §2 — kanal satırları referans kanala bağlandı; Z540.3 katsayısı; dış takip kararlılığı
  (bw30; kararsızsa T1.9 GEÇERSİZ).
- v13 (28.10.2026, Sürüm 15):
  - Dış referans kaldırıldı (kullanıcı kararı): Model'de hücre etiketleri yerine rol etiketleri; bütün sekme metinleri,
    test notları, bulgular, test tanımları (tm.json) ve V&V metinleri dış dosyaya atıf yapmadan yeniden yazıldı.
    check24.js bütün sekmelerde ve 28 testin ayrıntısında iz bulmuyor.
  - V&V W grubu: Excel önbellek değerleri yerine motordan bağımsız ikinci uygulama (bütçe, türetilmiş girdiler,
    dünya dönüşü vektör izdüşümü, hexapod erişimi, VIV taraması, belirsizlik/TUR, PSD ağırlığı; 4–5 durum) ve W9
    tahsis ölçeklemesi. 57/57.
  - Bütçe tahsisleri IFOV cinsinden (kullanıcı kararı): Q = tablo × IFOV/IFOV_ref (IFOV_ref = 12/300·1e-3, varsayılanda
    oran tam 1). budgetAlloc(P) testlerin ve bütçenin tek kaynağı; Bütçe tablosunda IFOV oranı gösterilir.
  - TUR tanımı (Z540.3) Gereksinimler sekmesindeki TUR tablosuna ve bulgulara da uygulanır.
  - Kılavuz §3 Deniz hareketi: (1) deniz frekansında DRR varsayımı parametre oldu (wb.H.drrSea_dB = −80); Model deniz
    panelinde gerekli DRR / bütçe tahmini / örnek DUT'un baskın frekans DRR'ı ve spektrum ağırlıklı artığı tablosu
    (seaDrrInfo); DUT artığı tahminin 1,2 katını aşarsa Bütçe uyarısı. (2) T1.1 kabulüne ikinci koşul: deniz spektrumu
    ağırlıklı artık ≤ tahsis (6-DOF SS4'te AŞIM; varsayılan kararlar değişmedi). (3) T1.3 ve T1.9: hexapod θ/ω/α sınırı
    aşılırsa GEÇERSİZ. (4) T1.3 öteleme ölçeği q'yu raporlar. (5) "~40 dB/dekad" → 20–30 dB/dekad. (6) env.seaWidth
    (σ_ln) Model'de görünür. (7) Düzenek öteleme satırı kaynağını yazar.
  - Doğrulama: probe/k2/sweep.js (17 durum, analitik fark ≤ 1,2e-4 sayısal integrasyonda, ≤ 1e-11 diğerleri),
    probe/k2/tests.js (T1.1, T1.3 yanıtları), probe/k2/play.js (Düzenek), testenv/check24.js, check25.js;
    regresyon: güncel motor ↔ pre.json 0 fark (de-referans sonrası, iki platform); uyum kipi: denizaltı 1, gemi 2
    fark, hepsi bölüm 3 notundaki beklenen T1.1 metin farkı (sayılar, durumlar, işletme aynı).
- v13.1 (28.10.2026, Sürüm 16) — kaldıraç kolu vektörü (kullanıcı kararları, bölüm 1):
  - Model: wb.sea.rx, wb.sea.ry (gövde: x pruva +, y iskele +), h = r_z; denizaltı h = 0 → 1 m. r: hareket referans
    noktasından LOS referans noktasına. Deniz panelinde eksen başına ivme terimleri, tam ilişkili üst sınır ve bilgi notu;
    hazır ayar "Direktör boyuna kolu r_x = 20 m (ne olur)" (gemi).
  - Bulgu ve düzeltme: işletme kol ivmesinin küçük açı ifadesi (Euler hızları) boyuna kolda yanlıştı (r = (30, 0, 0) m'de y
    ivmesi SS4 %19, SS5 %36); artık a = ω̇_B × r + ω_B × (ω_B × r), tam gövde hızlarıyla (S2: ≤ %0,3). Laboratuvar ötelemesi
    (R − I)·r, R = Rz·Ry·Rx (yaw dahil). B1-08 frekansı ivme terimlerinin RMS frekansı; B1-10 terim terim integre.
    accRatio/velRatio ızgarası ±30 → ±200 kat (6-DOF bant biçiminde %0,005–0,012 kesme hatası giderildi).
  - V&V: W10 (kol bütçesi bağımsız uygulama), S2 üç kol, S3 vektör kol + bağımsız (R − I)·r, S4 iki kol. 58/58.
  - Etki: durum değişikliği yok (iki platform); denizaltı T1.3 wander el 6,960 → 6,963 µrad, işletme B1-08 0 → 0,005 / 0,012
    µrad; gemi işletme B1-08 xel 0,512 → 0,511 µrad (tam kinematik). Düşey kolda (r_x = r_y = 0) işletme ivme dizileri eski
    küçük açı ifadesiyle bit düzeyinde aynıydı (ident.js), tam kinematiğe geçişle %0,1–1 değişti.
- v13.2 (28.10.2026, Sürüm 17) — kılavuz §4 VIV (iki platform), varsayılan sayılar değişmedi:
  - Düzeltmeler: (1) T2.3 denizaltı ton koşusu artık resF = f_n (önceden dar bant kontrol 3 Hz'de kalıyordu; f_n = 2 Hz'de
    sahte AŞIM −29,9 % → −4,1 %). (2) T2.1 VIV bandı = aday f_v ∪ f_n (vivBand; tek aday → f_n ± 0,125 Hz): f_n = 8 Hz'de
    T2.1 OK ↔ T2.2 AŞIM çelişkisi giderildi. (3) GEÇERSİZ kuralı: T2.2 (iki platform) VIV adayında hexapod erişimi ya da
    strok uyarımı küçültürse; T2.3 hexLimitCheck (deniz + ton) aşılırsa ya da gemide ton küçültülürse. (4) wb.viv.drr_dB = −40
    (B2-01 tahmini; 07_budget H = VS.H). (5) Sabit metinler dinamik (tahsis, f_n, erişim, genlik, f_n'de doğrusal DRR; "açığı
    dar bant kontrol kapatır" koşullu); Yöntem bulgusu ve Bütçe VIV-kapalı notu güncel değerlerle. (6) T2.2'ye "Dar bant kontrol
    çalışma bandı" (iki platform) ve "Doğrusal model DRR @ f_n" (denizaltı) satırları. (7) Gemi T2.2 yol ayrımı (ayna ↔
    video − ayna, T2.5 yöntemi) + ON > OFF açıklama notu (β = 90°: OFF 4,64 → ON 8,65 µrad fizikseldir). (8) ε0 rolü
    "varsayım; yalnız tablo" (ε0: EN 1991-1-4 E.1.5.2.6 bant çarpanı; 2/5–3/5: Clobes ve ark. 2012, Rakočević & Popović 2018
    aktarır). (9) Denizaltı VIV paneli: gerekli DRR, tahmin, doğrusal DRR (taban / dar bant), erişim, aday kapsamı (dar bant,
    video Nyquist, hexapod güvenilir bandı), Re, U_r; tabloya U_r ve Re > Re_crit (†); Model'de tarama payı ve drr_dB satırı,
    f_n "durgun suda, eklenmiş kütleyle". (10) Düzenek: denizaltı tonunun erişim işareti, "kilitlenmede f_n" etiketi, hexapod
    tepe satırı sınıra en yakın eksen.
  - V&V: W6 genişletildi (5 durum: T2.1 bandı, B2-01 tahmini, DRR parametresi), V6 yeni (yol ayrımı ↔ mekanizma ablasyonu,
    %0,7–1,4) → 59/59.
  - Regresyon: uyum kipi denizaltı 6, gemi 4 fark — hepsi metin (T1.1 v13 notları + VIV metinleri/kv satırları); sayılar,
    durumlar, işletme aynı. Güncel motor ↔ yeni ön hesap 0 fark.
  - Prototip: probe/k4/subtrans.js — denizaltı mast başı ötelemesi (L = 4 m, κ = 1,5, akışa dik y): 0,05°'de y ±2,33 mm,
    0,83 m/s²; T2.2 f_n ON 2,08 → 2,19 µrad, işletme B2-01 0,61 → 0,65 (v13.3'te motora alındı).
- v13.3 (28.10.2026, Sürüm 18, sürüm kimliği 1793219406-3da1) — §4 VIV kullanıcı kararları (bölüm 1):
  - Motor: 02_model vivMass (m*, f*_alt, K0 üst etkin, f_kilit; m* ≤ 0,54 → sınırsız), vivRisk (zarfın K0 aralığı ∩ paylı bant;
    fvMax, f_n,vak, lock = alt dala erişim), vivSpec hydro: present = on ∧ risk, roll −1, y = θ·L/κ, ty +1, lin. Varsayılanlara
    wb.viv.{lin, L, kth, mstar, Umin_kn, Umax_kn}; compatV10: lin false, mstar null. 06_tests_c: vivSpeeds (zarf ızgarası),
    vivTable (üst sınır ×f*), vivBand (aday f_v ∪ f_n ∪ erişilen f_kilit; flockAll, rk), vivNoRiskTxt; T2.2 t22Tone iki
    platform (etiketler "(f_n)", "(alt dal f*·f_n)"; denizaltı kv: doğrusal model, uyarımın kaynağı, eksenler); T2.3 windTone
    + transPeak (strok) + GEÇERSİZ'in bütün nedenleri; T4.2 etiketi f_n'den, öteleme açıkken açısal + öteleme tonu.
    05_scen: reserveStroke (deniz ötelemesi tona strok bırakır), opScenario windVivComps (denizaltı öteleme açıkken), B2-01
    satırında dengesizlik + optik montaj. 03_sim transPeak. 06_tests_b seaLabScenario ve 08_play: strok paylaşımı. 07_budget:
    VIV yoksa B2-01 = 0.
  - Doğrulamada bulunan ve düzeltilen: (1) alt dal adayı koşulsuzken erişilemeyen frekanslar banda giriyordu (f_n = 8 Hz: T2.2
    14,61 Hz'de GEÇERSİZ; f_n = 5 Hz: T2.1/T2.2 AŞIM) → erişim kuralı; (2) gemi T2.3/Düzenek deniz + VIV ötelemesi stroku aşıyordu
    (114 mm > 100) → reserveStroke + transPeak; (3) T4.2 denizaltı etiketi sabit "3 Hz"; (4) T2.3 GEÇERSİZ yalnız ilk nedeni
    yazıyordu.
  - Arayüz: Model VIV paneli (öteleme, m* · f*_alt · K0 üst · alt dal ve zarfta erişim, hız zarfı · K0 · VIV var/yok, adaylar),
    hazır ayarlar "Mast başı ötelemesi kapalı (yalnız açısal)", "Ağır mast (m* = 10)"; Bütçe notları; Düzenek öteleme satırı;
    Yöntem bulgusu "Denizaltı VIV'i: hafif mast ve mast başı ötelemesi" ve kaynaklar; tm.json T2.2/T2.3.
  - V&V: W6 8 durum (zarf, m*, alt dala erişim, öteleme; 487 sayı, 2,3·10⁻¹⁶), V7 yeni (işletmede açı ↔ öteleme eşlemesi) → 60/60.
  - Regresyon: uyum kipi denizaltı yalnız metin farkı; gemi ↔ v13.2 yalnız T2.3 notu (strok paylaşımı; sayılar görüntü
    hassasiyetinde aynı).

- v13.4 (02.11.2026, Sürüm 19, sürüm kimliği 1793632704-55ee) — kılavuz §5 hexapod ve kolimatör, taban düzeltmesi:
  - Motor: 02_model collGeom (f_c/f, iğne deliği açısı ve görüntüsü, D_c ≥ k·D_p, e_free = (D_c/k − D_p)/2, LOS tabanı), pupilOverlap
    (iki daire kesişimi), pupilShift (stab ON (R − I)(−L_pg·l) + t, stab OFF t; β dönüşü, yr/zr izdüşümü), pupilExcursion (komut
    profilinden 200 Hz; 50 Hz tam sayı frekanslı sinüslerde eşzamanlı örnekleme yüzünden eksik veriyordu), pupilTxt; L_off 0,15 → 0;
    hex.transDyn ('ideal' varsayılan | 'fbw': öteleme de f_bw'de; 03_sim trF, shaker koşuları her zaman ideal). 06_tests_c
    collExcursions (11 test hareketi, önbellekli); T0.1, T0.3, T1.3, T2.1, T2.2, T2.3, T2.5'e göz bebeği kv satırı + yetmiyorsa not +
    num.pupil. T2.5: hexapod iletimi τ (IMU) ile duyarlılık gerçekleşen ivmeye bölünür, işletme farkı 1/τ ile komut düzeyine (1,62 →
    1,64 µrad; f_bw = 10 Hz'de 1,38 → 1,64). T2.2: dwell'lerde en düşük τ satırı, τ < 0,98 ise not (sonuç ölçeklenmez). 08_play:
    göz bebeği dizileri (h, v, ov, 50 Hz) + metrics.pupil; precompute.js 'pupil' base64.
  - Arayüz: Model'de kolimatör satırları (f_c, D_c, iğne, ΔT, oran alt sınırı, açıklık payı), θ_test, L_off, öteleme dinamiği, zemin
    kuplajı, kanal D_p; "Kolimatör uygunluğu ve göz bebeği kayması" paneli (denetimler + 11 satırlık test tablosu). Düzenek: kolimatör
    D_c ölçeğinde, saydam demet silindiri, göz bebeği diski (örtüşmeye göre yeşil/sarı/kırmızı), HUD satırı, metrik satırı; hexapod
    döner merkezi her (a0, e0) için nominal göz bebeğinde (önceden yalnız 90°/0°). tm.json: T0.4 kabul metni (kompanzasyon sonrası
    belirsizlik), T0.3/T1.3/T2.3/T2.5 kolimatör notları.
  - V&V: W11 (kolimatör geometrisi, örtüşme, kayma; 6 durum, 1920 sayı), D5 (Osc2 iletimi ↔ analitik, T2.5 duyarlılığının f_bw'den
    bağımsızlığı) → 62/62.
  - Regresyon (v13.3 ön hesabı ↔ v13.4 motoru, T2.5 düzeltmesinden önce): iki platformda 17 fark, hepsi eklenen göz bebeği kv satırı,
    num.pupil ve kolimatör notu; diğer bütün test alanları ve işletme bit düzeyinde aynı. T2.5 düzeltmesi yalnız T2.5'i (ve bütçede
    B2-03'ü) değiştirir.
  - Uyum regresyonu (v10 tabanı, denizaltı): 23 fark; v13.3'ün 8 farkına göre yeniler yalnız göz bebeği kv/num satırları (T0.1, T0.3,
    T1.3, T2.1–T2.3) ve T2.5 düzeltmesi. Güncel motor ↔ yeni ön hesap: iki platformda 0 fark. Tarayıcı: check29 + check24 (dış
    referans izi yok, sayfa hatası yok, mobilde taşma yok).
  - Bulgular (kullanıcıya soruldu): göz bebeği T1.3'te 57,7 mm kayar (sınır 18,2; gerekli D_c 237 mm), T2.3 56,4, T2.5 x/z 50,7;
    paralaks: 1 µrad için kolimatör odak hatası δ ≤ 39 µm; taban düzeltmesi toplanır değil (sürtünme ditheri; M7 ayırt edici değil);
    öteleme dinamiği 'fbw' gemi T2.2'yi 7,16 → 6,55 µrad, B2-01'i 6,15 → 5,75 yapar.

- v13.5 (02.11.2026, Sürüm 20, sürüm kimliği 1793651158-e3e3) — §5 kullanıcı kararları:
  - Motor: 02_model collGeom'a δ (parK = δ/f_c²), parAllow, deltaMax(e), eVig = (D_c − D_p)/2; pupilRule (gerçek vinyetlemede GEÇERSİZ:
    T0.1, T0.3, T1.3, T2.1, T2.2, T2.3, T2.5); fitTransToColl (doğrusal ayrışım a + q·b, 100 Hz, 26 adım ikiye bölme, e ≤ e_free(1 − 10⁻³),
    stab ON geometrisi); pctFine (örtüşme ve vinyetleme süresi 0 ya da 1'e yuvarlanmaz: gemi D_c 150 mm'de %99,99 '%100.0' yazıyordu);
    varsayılanlar mvCorr 'kapalı', transDyn 'fbw', coll {delta_um 0, par_allow_urad 1, fitTrans, vigRule}; applyPlatform gemi D_c 200;
    compatV10 transDyn ideal, fitTrans/vigRule kapalı, δ 0. 03_sim: paralaks hedef yolunda (par_el/par_xel kayıtları), öteleme süzgeci
    f_bw'de (fbw). 06_tests_b seaLabScenario: sığdırma (T1.3, T1.4, T1.5, T1.7–T1.9, T2.3, T2.4); 06_tests_c T25_FQ = 2 ve 3 Hz;
    08_play sığdırma + paralaks metrikleri.
  - Arayüz: Model satırları (δ, paralaks payı, sığdırma, vinyetleme kuralı), kolimatör paneli (odak toleransı, laboratuvar deniz ötelemesi,
    kural, GEÇERSİZ durumları), Düzenek metrik satırı (sığdırma ölçeği, paralaks), Yöntem bulguları ve T2.5 metinleri (2 ve 3 Hz), Bütçe
    notu (kapalı), tm.json (T1.3, T2.3, T2.5).
  - V&V 63/63: W11 (sığdırmanın en büyük ölçek olduğu, q_c = 0 durumu, δ_max), M7 (üç kip, 2 ve 10 µrad: kapalı 0,021 / 0,017,
    zincir 0,033 / 0,283, tam 0,308 / 7,135 µrad), K7 yeni (paralaks ↔ bağımsız kinematik 8,9·10⁻⁸), S4 (T2.5 2–3 Hz: kestirim
    3,25 / 4,29 ≥ işletme 1,84 / 2,53 µrad; açıklama metni düzeltildi).
  - Regresyon: güncel motor ↔ yeni ön hesap iki platformda 0 fark. v13.4 ön hesabı ↔ v13.5: denizaltı 50, gemi 52 alan farkı, hepsi
    beklenen: T0.3 (kapalı kipte masa payı satırları yok), T0.1/T2.1 gemi (D_c 200), T1.3 (sığdırma: wander el 6,9626 → 6,9610 µrad),
    T1.4/T1.5/T1.8/T1.9/T2.4 (sığdırma; ≤ %0,2), T2.2/T2.3/T4.2 (fbw), T2.5 (2–3 Hz). İşletme benzetimi değişmedi.
  - Bulgular: denizaltı T1.3 q_c 0,299, T2.3 0,307, Düzenek 60 s 0,334; gemi q_c 1 (40,2 ≤ 40,9 mm). Kural keskin: gemi D_c 150 mm
    T1.3 örtüşme %99,99 → GEÇERSİZ. Denizaltı roll 6°'de ötelemesiz kayma 27,0 mm → T1.3 GEÇERSİZ (D_c ≥ 170 mm). Gemi St = 0,20
    T2.2 AŞIM → OK (6,26 → 5,77). §3 SS4 h = 0 wander 8,66 → 9,04 (±100 → ±16 mm öteleme).
- v13.6 (03.11.2026, Sürüm 21, sürüm kimliği 1793683533-9568) — kılavuz §6 ölçüm zinciri ve belirsizlik (TUR):
  - Motor: 06_tests_a piksel fazı yardımcıları (frac01, pixGain, pixPhaseInfo: T0.1 kestirimi ya da model a = √2·pixlock); turInfo
    U-05 zincire özgü (v = ε·W, vh = ε·S, mult) + uvAdd/uhAdd (toplanır kısım); T0.1 sub-piksel taraması AYRI koşuda (16 adım × 1/16 px,
    bit-ters sıra, gidiş + dönüş, tohum 111; ızgara koşusu ve IFOV_eff v13.5 ile aynı), uydurma [sin, cos, c_x, c_y, t_x, t_y], genlik
    belirsizliği LSQ kovaryansından, beklenen etkin genlik a·exp(−2π²σ_j²) (σ_j tarama beklemelerinde V.mEl/V.mXel gerçeğinden), ızgara
    artığı S-eğrisi düzeltmeli (bilgi), tarama grafiği; ctx.T01.pix. T0.2: beklenen zincir tabanı √(U01² + (g·U02)²), DUT payı, otokolimatör
    tabanı (ctx.floor.ac). T3.3: "TUR (bütçeden)", ölçüme dayalı denetim (T0.2 otokolimatör ⊕ U-03 ⊕ U-04 ⊕ U-05), num. 06_tests_d T1.9:
    piksel fazı satırı ve notu. 07_budget uncertaintySheet: gd, phaseTot, diffErrTot; epsR Hann %50 örtüşme düzeltmeli (epsR0 = 1/√n_d);
    corrected yalnız toplanır tabanla. 02_model: ac_rate kaldırıldı; chain yorumu (örnek başına RMS, imu_bw yalnız hareketi süzer).
  - Arayüz: Model "Ölçüm zinciri" etiketleri (örnek başına RMS, grup gecikmesi, çarpımsal ε, S-eğrisi √2), yeni "Kayıt istatistiği" grubu
    (f_min, N, n, T_rec, γ², ham σ örneği), TUR tablosu (U-05 v / vh "çarpımsal", toplam gecikme satırı, U-06 kazanç satırı, ε_r örtüşmeli),
    taban düzeltmesi 4–5. adımlar toplanır tabanla; Yöntem v136Findings (piksel fazı, IMU grup gecikmesi, TUR kavramı); tm.json (T0.1,
    T0.2, T0.4, T1.9, T3.3).
  - V&V 65/65: W7 (U-05 v/vh, toplanır kısımlar, τ_g, toplam faz ve fark hatası, ε_r örtüşmeli, ρ sayısal Hann penceresinden; 136 sayı,
    3,5·10⁻¹⁶), M8 yeni (T0.1 taraması: varsayılan 0,0266 ± 0,0016 ↔ 0,0268; pixlock 0,05: 0,0680 ± 0,0024 ↔ 0,0669; pixlock 0: 0,0027 ±
    0,0016; kazançlar ≤ 3u), M9 yeni (zaman alanı ↔ Bessel 2J1(2πA)/(2πA), J0: 9 durum, kazanç farkı ≤ 0,0010, sapma ≤ 0,0003 px).
  - Regresyon: v13.5 ön hesabı ↔ v13.6 iki platformda 13'er alan farkı, hepsi beklenen: T0.1 (kv, notlar, num.pix), T0.2 (yeni satırlar,
    not, num), T1.9 (kv: TUR satırı u_v 2,6613 → 2,6627 ve piksel fazı satırı; not; num.tur.uv), T3.3 (ölçülen "bütçeden", kv, not, num).
    Diğer testler, işletme ve oynatma değişmedi. Güncel motor ↔ yeni ön hesap: iki platformda 0 fark (probe/reg136_now_sub.log, reg136_now_ship.log).
  - Bulgular: piksel fazı hedef sabitken çarpımsal — T1.9 σ_vek hedef fazıyla 3,99–4,17 (sınır 4,00), video takip sonrası σ_Az −%14…+%19;
    T1.3 duyarsız (6,94–7,02). Senkron fazı 3,60° → IMU grup gecikmesiyle 6,84° (T0.4 −0,928 ± 0,032 ms). T0.2 beklenen zincir 1,60 / 1,48,
    DUT payı 1,27 / 0,76 (≈ g·soğutucu). ε_r 0,218 → 0,224. Izgara S-eğrisini 0,0246 verir (beklenen 0,0268); düz sıralı tarama
    sürüklenmeyi sahte S-eğrisine çeviriyordu (pixlock 0'da 0,0064 ± 0,0020); tarama ızgara koşusuna eklenince IFOV_eff 40,15870 →
    40,15895 değişiyordu (hava gerçekleşmesi S.T'ye bağlı) → ayrı koşu.

- v13.7 (03.11.2026, Sürüm 22, sürüm kimliği 1793703237-1934) — §6 kullanıcı kararları (K1–K4) ve kılavuz §7 dünya dönüşü:
  - Motor (K4): 02_model chain {imu_asd 0,0224, ac_asd 0,0224 µrad/√Hz, noiseModel 'asd'}; compatV10 noiseModel 'sample' (imu_noise /
    ac_noise 0,5 örnek başına). 03_sim: IMU gürültüsü benzetim adımında σ = imu_asd·√(fs/2), ayrı akış rngf('imuN'), hareketle birlikte
    bqLP(imu_bw)'den geçer (rM akışının tüketimi korunur: video ve otokolimatör gerçekleşmeleri aynı); otokolimatör σ = ac_asd·√(f_kayıt/2).
    06_tests_a chainNoise: U-04 = imu_asd·√(f_IMU·(π/4)/sin(π/4)) = 0,528, U-07 = ac_asd·√500 = 0,501 µrad.
  - Motor (K2): normCdf (Hart–West), decisionGuard (u_c = √(u_ist² + (x·u_rel)²), U = k·u_c, KABUL / BELİRSİZ / RED, P(uygun) = Φ((R − x)/u_c),
    taban yanlılığı 'in' x − √(x² − f²) / 'add' √(x² + f²) − x), scaleRelOf (T0.1 relU, yoksa ε); T0.2 (3 tekrar sd/√3; değişken adı repV),
    T1.3 (tohumlar arası sd; f = u_v,top), T1.9 (σ_El, σ_Az, σ_vek; pencereler sd/√n; video tabanı, σ_vek'te √2·u_v,top) kv satırları ve
    num.guard. Test durumları basit kabul kuralıyla kalır. K1 / K3: T0.1, T1.9 ve T3.3 notları.
  - Motor (§7): earthLimits(P) (B = H.bias + b0_res + |tc_bias·dT| ek satırlar açıkken; on = Ω·δ + B; offTol = 0,1·hesap + B); T0.7 KAPALI
    mutlak tolerans, AÇIK eşik bütçe bileşimiyle (1,515 → 1,709 µrad/s), AÇIK koşusunda dr_e/dr_b kayıtları → ayrıştırma satırı (num.dec),
    eşik / tolerans / çıkış satırları; earthSheet exitT kenar paylı (367 → 365 s); runTest recT (izleyicisiz en uzun stab AÇIK kayıt) →
    pre.json (precompute serRes, 03_pool); t07_agg limParts (compRes, B, Bdeg, BinstDeg, b0Deg, tcDeg). exports +5 (190).
  - Arayüz: Model yoğunluk satırları (µrad/√Hz), TUR U-04/U-07 adları, renderGuard tablosu (TUR altında); Dünya dönüşü paneli (LOS etrafı
    hız, kenar payı, eşik bileşimi; uzun testler recT'den: T1.1, T1.3, T1.4, T1.9, T2.1, T2.3); Yöntem: 'Ölçüm zinciri kararları uygulandı'
    bulgusu, T0.7 bulgusu yeni bileşim + δ 0,1° (oran metinleri yüzde eki olmadan), tohum paneli 0 AŞIM durumunu da yazar, TM_MAP T0.7 /
    T3.3; tm.json T0.7 (süre 365 s, kabul 1,71 ve mutlak tolerans, riskler), T1.9, T3.3, T0.2/T1.3 metrikleri.
  - V&V 67/67: W12 yeni (Φ ↔ erf Taylor (|z| ≤ 2) / erfc sürekli kesir (|z| > 2), 15 nokta: 1,1·10⁻¹⁶; decisionGuard 6 durum: 8,8·10⁻¹⁰;
    35 sayı, 0 karar uyuşmazlığı), M10 yeni (yoğunluk; fs 2 kHz IMU 0,5007 ↔ 0,5009 (ayrık ENBW 500 Hz), 4 kHz 0,5139 ↔ 0,5150 (528,6 Hz),
    f_IMU 100 Hz 0,2340 ↔ 0,2347 (109,7 Hz); otokolimatör 0,5018 ↔ 0,5009), W7 (U-04/U-07 yoğunluktan), W4 (kenar paylı çıkış; 245 sayı).
  - Regresyon: v13.6 ön hesabı ↔ v13.7 denizaltı 84, gemi 83 alan farkı (probe/reg137_vs136_*.log): hiçbir durum değişmedi, işletme aynı;
    beklenenler: metin ve yeni satırlar (T0.1/T1.9/T3.3 notları, T0.2/T1.3/T1.9 koruma satırı, T0.7 eşik ve satırları, T3.3 TUR 4,26 → 4,25);
    IMU kaydının gürültü gerçekleşmesi değiştiği için IMU'yu kullanan testlerde son basamak: T0.1 S-eğrisi 0,0266 ± 0,0016 → 0,0264 ± 0,0017,
    kazanç 0,874 / 1,057 → 0,877 / 1,054, IFOV_eff +7,8·10⁻⁷ (40,15874) → sonraki testlerin dolguları 10⁻⁶ düzeyinde; T0.2 beklenen zincir
    1,60 / 1,49; T0.3, T0.4 (−0,927 ± 0,032 ms), T1.2. Uyum kipi ↔ v13.6 uyum çıktısı (probe/k9/compat137f_sub.log): 9 alan, hepsi metin / yeni
    alan (T0.1, T3.3 notları; T0.2, T1.3 koruma satırı; T0.7 kv/not ve num.offTol/dec; limOn 1,515 aynı); sayılar aynı. Güncel motor ↔ yeni ön
    hesap: iki platformda 0 fark (probe/reg137_now_sub.log, reg137_now_ship.log). Beş tohumda 28 testin kararı aynı.
  - Bulgular: koruma bandı denizaltı T1.9 σ_vek 3,95 ± 0,06 BELİRSİZ (P(uygun) %96,7), σ_El 3,05 ± 0,07 RED, σ_Az 2,51 ± 0,02 KABUL; T1.3 el
    6,96 ± 0,25, xel 6,57 ± 1,69 KABUL (taban yanlılığı +0,53 / +0,56); T0.2 2,04 ± 0,01 KABUL; gemi T1.9 σ_vek 4,07 ± 0,10 BELİRSİZ (%7,8).
    §7: T0.7 eşiği 1,709 → 100 tohumda 1 AŞIM (%0,03–5,4; v13.6 eşiğiyle 6/100), taze kalibrasyonda 0/100; KAPALI ölçütü enlem 0°'da düzeldi
    (AŞIM → OK); α 0° (1,786), φ 80° (1,763) ve δ 0,1° (0,601 > 0,564) AŞIM — varsayılan tohumun el bias payı 0,556 µrad/s = 0,115 °/h >
    0,09; 12 tohumda bias payı el 0,130 ± 0,209, xel −0,116 ± 0,316 µrad/s. Kompanzasyon kapalı: T1.1, T1.3, T1.4, T1.9, T2.1, T2.3
    GEÇERSİZ (365–369 s), T1.7 OK. Analitik tarama 21 durum / 2016 sayı 7,5·10⁻¹⁵; Rodrigues sonlu farkı 1,3·10⁻³ µrad/s.

- v13.8 (04.11.2026, Sürüm 23; Sürüm 24 = türetme artığı tam ifadesi, sürüm kimliği 1793780386-ed62) — kılavuz §8 bütçe varsayımları:
  - Motor: 02_model H.epsBasis 'los' (yeni; compatV10 'roll'); kullanılmayan H.mtf_r kaldırıldı. 07_budget epsRotInfo(P): σ_rot² =
    (axisMap(P,0).rotW·σ_roll)² + (axisMap(P,1).rotW·σ_pitch)², f = baskın terimin f_dom'u ('roll' tabanı: Aeq_roll/√2). B1-04 E = ε·√2·σ_rot
    (µrad genlik), G = ER.f, ad "(pitch | roll)" ekli, test listesi yalnız T1.1 (T0.6 çıkarıldı); R-01 G = ER.f. exports +1 (epsRotInfo, 191).
  - Arayüz: 07_model SCHEMA wb.H.epsBasis seçimi (los / roll); rotasyon paneli etiketinden "B37" kaldırıldı; taban düzeltmesi "Örnek (ham σ)";
    FOG paneli "Kalibrasyon sonrası sabit artık bias b0" (T0.6 Allan sabit bias'ı görmez; T0.7'ye girer). 06_budget renderBudgetTotals: B1-04
    tabanı notu ve τ metriği notu (ARW·√(T_w/15)). 08_method v138Findings: B1-04 LOS tabanı (iki taban, T1.1, işletme), wander toplamı τ'ya
    bağlı, R-01 mutlak ↔ türetme artığı (Sürüm 24: tam ifade σ_rot·|1 − (1 + s_f)e^(−j2πf·t_d)|; T1.5 sinüsüyle 0,02 µrad içinde; birinci
    mertebe √(s_f² + (2πf·t_d)²) %0,5–0,6 düşük), geniş alanda EIS registrasyonu (yalnız eisWander > wander iken). tm.json T1.5 metrik ve
    kabul "ölçüt noktası (varsayılan köşe pikseli)", riskler. check24.js RX: elektronik tablo hücre başvurusu kalıbı.
  - V&V 68/68: W_budget B1-04 tabana duyarlı; W13 yeni (15 durum: iki platform × a0 0/30/60/90/135/180°, 6-DOF, roll tabanı; σ_rot, f, B1-04
    E/G, R-01 G: 75 sayı birebir, 0 baskın eksen uyuşmazlığı).
  - Regresyon: güncel motor ↔ ön hesap iki platformda 0 fark (probe/reg138_now_sub.log, reg138_now_ship.log): testler ve işletme değişmedi;
    yalnız V&V yeniden hesaplanıp katıldı (probe/pre138_vv.log, pre138_vvmerge.log). Yedekler: bak_src_v137/, bak_appjs_v137/ (pakette yok).
  - Bulgular: B1-04 denizaltı 3,70 → 1,85, gemi 6,99 → 2,62 µrad (gemide AŞIM kalktı); wander 11,55 → 10,46 / 24,76 → 22,58; EIS 9,57 → 8,32 /
    15,80 → 12,23. T1.1 B1-04 2,04 / 2,72 µrad (çapraz eksen katsayısı 0,110 / 0,104 mrad/rad; yerçekimi sarkması dahil), a0 0°: 3,48 (bütçe
    3,70); işletme a0 0° 3,75 / 3,76. Wander toplamı τ'ya bağlı (τ 10 s: 10,46 → 11,75); 120 s wander penceresinde ARW payı σ√(T_w/15) = 4,11
    (tahsis 2; Monte Carlo 2,8205 ↔ 2,8284), işletme 4 tohum 3,12 / 3,20 ↔ 3,46 (DUT ARW). R-01 0,5 mrad mutlak; türetme artığı denizaltı
    0,498 mrad → 16,31, gemi 0,868 → 28,44 µrad (gemi T1.5 AŞIM 28,44 / 28,71; t_d 10 ms → 18,05). ψ_lim ≈ k_roll/r_px: HDTV-NFOV R-01 6,33 >
    5,75. MWIR-WFOV'da EIS 25,08 > ham 10,46 µrad (registrasyon 0,1 px = 24 µrad). Analitik tarama 22 durum / 3892 sayı, 3,18·10⁻¹⁶.

- v13.9 (04.11.2026, Sürüm 25, sürüm kimliği 1793792987-221f) — §8 kullanıcı kararları ve kılavuz §9 örnek DUT stabilizasyon döngüsü:
  - Motor (§8 K2 b): 02_model H.rwMetric 'window' (compatV10 'tau'); 07_budget rwWindow(P); B1-05 E = ARW·√(T_w/15), G = 1/T_w, adı "(120 s
    wander penceresinde, doğrusal trend çıkarılmış)"; B1-06 ve B1-09 L = 'D' (yalnız drift: wander, smear, EIS ve tahsis toplamlarına girmez;
    drift satırı değişmez); computeBudget rwWin, E96w; opDecomposition B1-05 cmp/cmpXel = wEl/wXel; 06_tests_a T0.6 dolgusu B1-05 = ARW·√(T_w/15),
    kv satırları. exports +1 (rwWindow, 192).
  - Motor (§9): loopModel kazanç payı kesişmesi ikiye bölmeyle (önce %1 ızgara noktası: el 12,25 → 12,16 dB, 158,1 → 156,7 Hz); 7. argüman Kfix
    (benzetimde K res.f'teki tasarımda sabit; uyarlanır dar bant kayınca çalışma noktası loopModel(..., f_r, d.loopEl.K)); yorum "geri Euler".
  - Arayüz: 07_model rwMetric seçimi; döngü kutucukları dar bant f_min–f_max'ta en düşük PM (K sabit; < 45° uyarısı); DRR grafiğinde dar bant
    çalışma frekansında (uyarlanır kipte VIV f, gemide 4,1 Hz) ve sabit K ile. 06_budget: 'D' satırları "Yalnız drift" alt yazısı, B1-05 notu
    (ARW ≤ 0,0024 °/√h tahsis şartı), G1 notu (kullanıcı kararı), işletme B1-05 notu. 08_method v139Findings (döngü modeli W14; dar bant
    bandında PM; dar bant frekansı ideal; B1-07 / T1.6 %5 kompanzasyon doğruluğu (PRE.extra.ff); T4.2 sabit sürtünme (PRE.extra.t42sched));
    v138 bulgularına kararlar (G1 korundu + karesel karşılığı, rastgele yürüyüş bulgusu, R-01 mutlak), "PII (geri Euler integratör)".
    tm.json T0.6 metrikleri (aktarım), T1.6 ve T2.2 riskleri. extra.js: η taraması (0 / 0,855 / 0,9 / 1,0 / 1,045 / 1,14) ve T4.2 programlı.
  - V&V 69/69: W1 B1-05 G ve toplama sınıfı (wander / yalnız drift / rotasyon) bağımsız; W14 yeni (dokuz durum, döngünün JS ikinci uygulaması:
    K, kesim, PM, GM 1,3·10⁻¹⁵; DRR ve tork 6,8·10⁻¹⁵ dB).
  - Regresyon: v13.8 ↔ v13.9 ön hesabı 29 alan (probe/k11/prediff139.log), hepsi beklenen: T0.6 dolgusu B1-05 1,232 → 3,485 µrad ve kv, işletme
    B1-05 cmp 1,21 → 2,68 / 3,30, tohumların T0.6 dolgusu ve işletme B1-05 cmp'si, gemide aynısı, extra.ff ve extra.t42sched; başka test, işletme,
    oynatma alanı ve tohum durumu değişmedi. Uyum kipi: v13.7 ↔ v13.9 uyum çıktısı FARK 0 (probe/k11/compat139_vs137f.log).
  - Bulgular (§9): el kesimi 40,45 Hz, PM 52,35°, GM 12,16 dB @ 156,7 Hz, |S| 3,33 dB; az 30,34 Hz, 52,05°, 14,77 dB. Deniz bandı DRR ≈ (k + jωb)·ω/(K·ω_i²)
    (0,125 Hz'de −79,9 ↔ −80,0 dB); f_c 20 Hz → −73,5 dB (T1.1 AŞIM), f_i 2 Hz → −68,0 (AŞIM), f_i 8 Hz → −91,7 ama PM 41,5°. Dar bant 1,2–6 Hz'de
    PM el 56,1 → 46,2°, az 56,9 → 44,3°; 30 dB'de PM 38,5°. Dar bant kestirim hatası %5 / %10 / %20: 3 Hz'de −60,20 → −58,84 / −56,41 / −52,45 dB
    (zaman alanı ±0,03), gemi 4,1 Hz −57,17 → −55,82 / −53,40 / −49,44. İleri besleme: işletme B1-07 η 0 / 0,855 / 0,9 / 0,95 / 1,0 → 53,64 / 7,81 /
    5,39 / 2,71 / 0,33 µrad; T1.6 tepe 135,4 / 18,8 / 12,6 / 5,8 / 3,2 (η 1,045: 8,8; 1,14: 21,7; f_est 100 Hz: 14,6). T4.2 sabit FF AŞIM (−20 °C 82,1 µrad),
    programlı OK (8,7). T2.2: dar bant kapalı 30,90, 10 dB 9,60, 30 dB 1,00, f_max 2,5 Hz 31,07 µrad. T1.8 BİLGİ 379 ms (az f_c 15 Hz 2120 ms).

- v13.10 (04.11.2026, Sürüm 26, sürüm kimliği 1793797037-69cd) — §9 kullanıcı kararları ve kılavuz §10 örnek DUT mekanik ve sürtünme:
  - Motor (§9 K1 b): ctl.res.estErr (varsayılan 0); 03_sim uyarlanır kipte dar bant f·(1 + e)'ye ayarlanır (resF ve resTrack), çalışma bandı denetimi
    kestirimle. (§9 K2 b): ctl.ff.obs { Fc, Fs, vs, s0 } (varsayılan 1); LuGre gözlemcisi ve ileri besleme torku obsE / obsA ile. 06_tests_c runTest
    notları (estErr ≠ 0: T2.1, T2.2, T2.3, T4.2; gözlem oranı ≠ 1: T1.6, T2.4, T4.2, T2.2, T2.3). Varsayılanlar v13.9 davranışını verir.
  - Arayüz: 07_model kestirim hatası ve dört gözlemci oranı satırı; b ve k etiketleri düzeltildi (b 3 Hz'i, k deniz bandını belirler; önce tersti); F_c ve
    vuruntu etiketleri "taban döngüde"; σ0 etiketleri "F_c değişince sabit kalır"; DRR grafiği uyarlanır kipte VIV·(1 + e)'de, etikette kestirim hatası.
    06_budget kalibrasyon notu (B1-07 / B2-03 / B2-04 taban döngüye kalibre; işletme 2,71 / 1,64 / 0,85; K ∝ J). 08_method v1310Findings (kuplajın rolleri
    canlı duyarlılıkla; tork yolu ve atalet; σ0 belirsizliği (PRE.extra.s0) ve şu anki ön-kayma ölçeği; direk tepesi modu (PRE.extra.mount)); v139
    bulgularına kestirim hatası (PRE.extra.est, bant ucu) ve gözlemci oranları (PRE.extra.obs). tm.json T1.6 riskleri (gözlemci oranları, σ0 × 10).
  - Ek koşular (extra.js): video ölçen ek koşular (T2.2, T2.3, T4.2) artık ön hesabın kalibre IFOV'uyla (önce nominal; fark ≈ %0,4: T2.2 %10 hatayla
    30,95 → 31,07, T2.3 dar bant kapalı 13,15 → 13,20, T4.2 programlı 3 Hz 2,48 → 2,49 µrad).
  - V&V 70/70: D6 yeni (kestirim hatasında zaman alanı ↔ analitik, beş durum, en büyük fark 0,021 dB); W14 ve W1 değişmedi.
  - Regresyon: v13.9 ↔ v13.10 ön hesabı 6 alan (probe/k12/prediff1310.log), hepsi extra'da (yeni est / obs / s0 / mount; resOff.t23 ve t42sched IFOV
    düzeltmesi); testler, işletme, oynatma, tohumlar, gemi, duyarlılık ve T0.7 aynı.
  - Bulgular (§10): b/k bağımsız çözüm el 1,6706 (motor 1,6626, +%0,48), az 2,9069 (2,9694, −%2,1), k'lar %0,03 içinde; duyarlılık (dB/ln) el k@1/8 8,10,
    b@1/8 0,58, b@3 8,50, k@3 0,19; köşe 0,46 Hz. J × 0,5 / 1 / 2: K 30,94 / 61,83 / 123,65, PM 53,85 / 52,35 / 51,60°, θ/T_d @ 2 Hz −72,33 / −78,33 /
    −84,35 dB. Kalibrasyon: yapılandırılmış 2,71 / 1,64 / 0,85; dar bant kapalı 3,01 / 2,00 / 1,50; + η 1 0,50 / 2,00 / 1,50. J × 0,5: T1.1 −72,3 (AŞIM), T1.6 11,5
    (AŞIM), T2.5 3,23 (AŞIM); σ0 × 0,1 / 10 / 100: T1.6 3,5 / 12,0 / 15,1, B1-07 1,67 / 3,45 / 4,05; κ 1e-5 / 1e-4: B2-06 2,22 / 11,05, wander 7,48 / 17,98.
    Arayüzde el F_c × 2 (σ0 sabit): T1.6 7,1, B1-07 4,81 ↔ σ0 birlikte 9,3 / 5,41. K1 (b) yeniden kalibrasyon (F_c × 1,107, dengesizlik × 1,22, vuruntu
    × 1,76): işletme 3,00 / 2,01 / 1,51, T1.6 6,6, T2.5 2,00, T4.2 −20 °C 91,0; K1 (c): wander 10,94 / 22,81.

- v13.11 (04.11.2026, Sürüm 27, sürüm kimliği 1793824171-5d4f) — §10 kullanıcı kararları (beşi de şimdiki; değişiklik yok) ve kılavuz §11 örnek DUT gyro, modlar, optik:
  - Motor: 06_tests_c T3.4 — katlanan frekans 0'a ya da Nyquist'e 2/T_kayıt'tan yakınsa sinüs uydurulmaz, durum GEÇERSİZ (önce 50 / 75 / 100 Hz'de
    33 / 29 / 49 µrad AŞIM); "gerçek soğutucu LOS" satırı optik kanalda 1.–3. harmonik sinüs uydurmasıyla (önce kaydın toplam RMS'i 5,51; şimdi 1,50);
    küçük hareket kazancı satırı (pixPhaseInfo). 06_tests_b T1.8 doyum metni ("DUT sınırı; ölçüm zinciri hatası değil"); T1.1 çapraz katsayıyı el ve xel
    ayrı da yazar (kabul ve dolgu aynı). Varsayılan test durumları ve sayıları değişmedi.
  - Arayüz: 07_model "Gyro eksen kaçıklığı (xel)" satırı (dut.gyro.epsXel). 08_method v1311Findings (T0.6 kestiricisinin dağılımı (PRE.extra.t06), modların
    statik esnekliği (PRE.extra.modes; 1/f² karşılığı), soğutucu harmonikleri ve katlanma kenarları (canlı T3.4), B1-10 yerçekimi izdüşümü (PRE.extra.gsens),
    gyro bant genişliği ve B2-05 (canlı loopModel), benzetim adımı (V&V C3), T0.1 belirsizliği (PRE.extra.t01)). tm.json T0.1, T0.6, T3.4, T3.5 riskleri.
  - V&V 71/71: M4 artık 40 tohumun dağılımını bağımsız Monte Carlo referansıyla (k13/gyro_ref.py: BI ort 0,03388, sd 0,00905; ARW 0,004215) 3σ'da
    karşılaştırır (önce tek tohum BI ±%15: şansa bağlı); C3 yeni (yapısal mod rezonansı 4 / 16 kHz: 120 Hz −%0,62 / −%0,05, 180 Hz −%1,41 / −%0,11).
  - Bulgular (§11): T0.6 taban/0,664, 4 sa: BI kestirimi ort 0,0344 (−%18), sd 0,0097, %5–95 0,0174–0,0473; bağımsız MC 0,0339 ± 0,0091 (KS p 0,33);
    analitik beklenen eğri tabanı 0,696·B @ 1228 s; B 0,06'da kabul %48 (motor) / %58 (MC); model uydurması (IEEE 952 Ek C tarzı) 4 sa −%6…9, sd %6, kabul
    %5; 12 sa %2; 24 sa yöntem A −%12, kabul %25. Gyro f_bw 150 / 300 / 3000 Hz: el PM 39,6 / 47,0 / 53,9°, GM 9,6 / 10,8 / 12,7 dB (k11 modeliyle
    2·10⁻¹³°). B2-05 analitik 0,284 / 0,286 ↔ işletme 0,286 / 0,289 (bütçe 0,5). Modlar: B3-03 optik 80 / 120 / 200 Hz 1,50 / 2,00 / 2,69, B3-04 gimbal
    120 / 180 / 300 Hz 0,552 / 1,50 / 4,55 µrad (bağımsız analitik %3 içinde; 1/f² ölçeklemeyle 3,37 / 0,97 ve 1,24 / 1,64); 4 kHz ayrıklaştırma kaybı
    ≈ 0,18·(ω·dt)². T3.4 analitik: katlanma 1,203, ×1,054 küçük hareket kazancı = 1,477 ↔ 1,47. g-duyarlılığı 1 °/h/g: denizaltı bütçe 0,016 ↔ benzetim
    0,154 / 0,126 (açısız 0,010 / 0,013), gemi 0,391 ↔ 0,322 / 0,480. T0.1 30 tohum: IFOV hatası −%0,0023 ± 0,0006, u %0,0015 (|z| > 2: %27), k1
    −0,00206. ε_el 0,5: T1.1 0,4977, B1-04 el 9,28 (xel 1,86). S_f 1000 ppm: −174,7 ↔ −174,5 µrad; S_nl 300: +61,1 ↔ +61,0.

- v13.12 (05.11.2026, Sürüm 28, sürüm kimliği 1793858534-53dd) — §11 kullanıcı kararları (dördü de şimdiki; değişiklik yok) ve kılavuz §12 işletme ortamı ve
  proje gereksinimleri:
  - Motor: 06_tests_d T1.9 PPV/σ satırı aynı tayfta Gauss sürecin beklentisini yazar (Rice: 2√(2 ln(ν0·n_W·T_w)), ν0 = √(m2/m0) Welch tayfından f ≥ f_HP;
    takip sonrası 9,3 / 9,4, öncesi 9,1 / 9,4; önce sabit "Gauss 60 s: ≈ 6–8,5"). 06_tests_b T1.7 notu davranışa uyduruldu (gereksinim yoksa yalnız kilit
    kaybı; sonuç OK). 06_tests_c T2.4: oturma penceresi ve darbe aralığı gereksinime göre (W = max(2,5, t_oturma + T_p,maks + 0,6), aralık W + 0,5;
    varsayılanda 2,5 / 3 s aynı; 3000 ms → AŞIM 3350 ms ölçülür, önce pencere dışı). Varsayılan test durumları ve sayıları değişmedi.
  - Bağlam hatası (bulundu, düzeltildi): T0.1'in ctx.T01'i (ölçek belirsizliği relU, piksel fazı pix) ve T0.2'nin ctx.floor'u yalnız aynı iş parçacığında
    art arda koşan testlere geçiyordu. Tarayıcı havuzunda testler paralel koştuğu için T0.2, T1.3, T1.9, T3.4 model değerlerine (scale_eps %0,5; kazanç
    ×0,878 / ×1,044 ↔ T0.1 ×0,877 / ×1,054) ve T3.3'ün ölçüme dayalı denetimi "T0.2 koşulmadı"ya düşüyordu; kısmi ön hesapta da (run_pre1312.sh'in T1.9'u).
    Tam ön hesap doğruydu. Düzeltme: 03_pool ctxOut, 04_campaign ctxBase / runLocal ve precompute tgt.ctx T01 ve floor'u taşır; T0.2, T3.1–T3.3 zincirine
    alındı. run_pre1312b.sh T0.1, T0.2, T1.7, T1.9'u yeniden koştu; prediff1312.log: yalnız beklenen 13 fark (T1.7 notu, T1.9 PPV/σ satırları, ctx T01 /
    floor, ek koşular). Tarayıcıda tek başına T1.9 ve T3.3 ön hesapla aynı (check37 run).
  - Arayüz: 08_method v1312Findings (ortam kalibrasyonu: B2-03 / B2-06 PRE.extra.calibOff, B2-02 canlı Campbell (ENG.loopModel drr, yarım sinüs
    spektrumu) ↔ PRE.extra.slap (genlik ölçeği değişince doğrusal ölçeklenir), tek tohumun beklenenden farkı; T2.4 × sürtünme (PRE.extra.t24nofric);
    PPV ↔ Gauss beklentisi (T1.9 satırından; σ'yı fiilen 0,70·sınıra indirir; video PPV/σ canlı); P99,73 ve σ_vek (canlı eliptik kuadratür); iki pencere
    (canlı bütçe kopyaları); T1.7 gereksinimsiz OK). tm.json T1.7, T1.9, T2.4 riskleri.
  - V&V 72/72: G5 yeni (PPV/σ Rice ↔ Gauss süreç, 645 s, 2 kHz, dört gerçekleşme; dar 0,2–2,5 Hz 7,72 / 7,67, geniş 0,5–400 Hz 9,52 / 9,79; ±%6).
  - Bulgular (§12): ortam düzeyleri dar bant kapalı taban döngüde bütçe tahminine kalibre (B2-03 2,003, B2-06 2,011; yapılandırılmış 1,64 / 1,78; B3-01
    3,04, B3-03 2,00, B3-04 1,50 dar banttan bağımsız). B2-02 tek gerçekleşmeye (tohum 11, dar bant kapalı 2,002): Campbell 2,340 / yapılandırılmış 1,621
    (bağımsız Python; sayfa 2,33 / 1,63), 24 tohum 2,255 ± 0,186 / 1,554 ± 0,169; tohum 11 yapılandırılmış 1,274 (−%22). T2.4 B2-02 kestirimi 3,01 / 2,77,
    sürtünmesiz 1,86 / 1,63, dar bant kapalı 3,87 / 3,78. v12 sınırları: σ 4,0 / 2,5 / 3,1, PPV 16,25 / 20,15, P99,73 12; Gauss P99,73 sınırda 9,89, T1.9
    9,77 ↔ 9,76; PPV/σ Gauss beklentisi ≈ 9,3 → PPV σ'yı 0,70·sınıra indirir. Wander penceresi 60 / 120 / 240 s: bütçe 10,76 / 11,14 / 11,88 (gemi 22,72 /
    22,90 / 23,27); işletme el 7,08 / 7,37 / 8,52 (gemi 10,22 / 10,45 / 11,35).

- v13.13 (10.11.2026, Sürüm 29, sürüm kimliği 1794292804-afe2) — §12 kullanıcı kararları (tavsiye edilen, uygulandı):
  - K1 (b): 02_model env.slap.A 2458 → 2100 µrad (Campbell beklentisi dar bant kapalı taban döngüde 2,000 µrad; motor ince ızgara 2,3412 @ 2458, bağımsız
    Python 2,340). Yalnız denizaltı (gemide çarpma yok). İşletme B2-02 satırı doğrusal × 0,8543 (1,2739 → 1,0883 yapılandırılmış; dar bant kapalı tohum 11
    2,002 → 1,711), T2.4 B2-02 kestirimi 3,01 / 2,77 → 2,57 / 2,37 (sürtünmesiz 1,59 / 1,40 ↔ Campbell yapılandırılmış 1,383), bütün kaynaklar σ_El 24,66 →
    24,63, wander el 7,33 → 7,24 (satırların RSS'i 7,30 öngörür; düşüşün üçte ikisi darbe × sürtünme), P99 el 18,77 → 18,46; ek koşu slap 24 tohum 1,926 ±
    0,159 / 1,328 ± 0,145; tohum tekrarları op B2-02 1,275 ± 0,235, T2.4 2,338 ± 0,111. 08_method Campbell'i orta nokta kuralına geçti (11 nokta; ince
    ızgarayla %0,03; önce uçlar dahil eşit ağırlık −%0,4 / +%1).
  - K2 (a): v12 PPV 6,5·σ kaldı. Kılavuzda gereksinim sahibine öneri: 6,5·σ Gauss süreçte ≈ 200 bağımsız tepeye karşılık gelir (bu tayfta N ≈ 5·10⁴);
    PPV Gauss beklentisine bağlanmalı ya da ölçüm bandı / örnekleme / pencere sayısı tanımlanmalı.
  - K3 (b): 06_tests_b T1.7 gereksinim yoksa BİLGİ, kilit kaybı varsa AŞIM (iki platformda OK → BİLGİ); tm.json risk metni; 08_method'un "T1.7
    gereksinim girilmeden OK verir" bulgusu kalktı. extra twOp ile iki pencere bulgusunun işletme wander'ı ön hesaptan (6,99 / 7,28 / 8,44).
  - V&V 72/72. prediff1313.log: 93 grup, hepsi dalga çarpması (op, extra slap / mount / resOff / gsens / t24nofric / twOp, tohumlar, T2.4) veya T1.7.

- v13.14 (10.11.2026, Sürüm 30 sürüm kimliği 1794304053-60d7; Sürüm 31 1794304471-454e) — kılavuz §13 Düzenek sekmesi:
  - Motor (08_play): hexapod tepe θ / ω / α artık komutun hexapod dinamiğinden (Osc2 f_bw, ζ 0,7071, 1 kHz, mikrotitreşimsiz) geçirilmiş
    halinden; komutun sayısal türevi base[k].cmd'de. Önce darbede 22 917 °/s² (Δω·f_s, örnekleme hızına bağlı), deniz profilinde Float32
    nicemlemesiyle 4,27 (gerçek 3,7) gösteriyordu. metrics.p99R (radyal P99), metrics.Tw (oynatmanın wander penceresi), out.scaleEff; keepRec
    seçeneği (yalnız doğrulama). 02_model pulseAmpDeg(P, T_p) (T2.4 ve düzenek darbesi; gizli wb.hex.pulseRule: tanımsız = 'ic' şimdiki
    kural, 'gercek' hız sıçramasının hexapod sonrası ivmesini de sınırlar — K1 (b) için hazır; varsayılana alan eklenmedi, pKey değişmesin).
  - Arayüz (05_rig): RMS satırı wander gereksinimiyle işaretleniyordu → RMS ve wander bilgi satırı, wander penceresi yazılır, dipnot kabulün
    T1.3 / T1.9'da olduğunu söyler; P99 satırı radyal P99'u da yazar, dedektör çemberi radyal P99; hexapod satırı "gerçekleşen, hexapod
    dinamiği 20 Hz" ve hız sıçraması notu; darbede ×1'in üstünün uygulanmadığı etiketi; deniz ötelemesi satırı kolimatöre sığdırmayı yazar.
  - V&V 73/73: K7 (düzenek darbe tepeleri ↔ sürekli zaman RK4, ±%1; 1305,7 ↔ 1306,4 °/s²). Ön hesap: yalnız play değişti (prediff1314.log).
  - Bulgular (§13): 12 oynatma durumunda metrikler bağımsız Python yeniden hesabıyla basamağına kadar aynı; 3B mekanik zincir ↔ optik LOS
    stab KAPALI deniz 6,44 µrad (hata 93 113), sinüs 0,60 (34 908), stab AÇIK 1,15 µrad. Yarım sinüs açı darbesi (düzenek ve T2.4) başta ve
    sonda πA/T_p hız sıçraması içerir: hexapod sonrası α 349 / 644 / 1306 °/s² (sınır 400; κ = e^(−π/4) = 0,456, α ≈ κ·ω_b·πA/T_p). 'gercek'
    kuralla genlik 0,091 / 0,200 / 0,400°, T2.4 tepe 141,1 → 74,5 µrad, oturmayan 1/60 → 3/60, B2-02 2,57 / 2,37 → 2,76 / 2,57 µrad.
    VIV oranı (Düzenek ve T2.2) döngü modeli DRR'ından farklı (3 Hz −49,6 ↔ −60,2 dB; gemi 4,1 Hz −50,5 ↔ −45,5); mekanik LOS aynı oranı verir.
    Deniz ×2'de göz bebeği 22,3 mm > 18,2 (öteleme ×0'a insede gimbal karşı dönmesinden; gerekli D_c 159 mm). Dünya dönüşü: Ω × LOS +55,86 /
    −46,87 µrad/s, alanı terk 365 s; pozlama 5 ms, 10 örnek: tayftan sürekli yayılım 1,668 ↔ benzetim 1,675 µrad.

- v13.15 (10.11.2026, Sürüm 32 sürüm kimliği 1794305499-fcca) — kılavuz §14 (Kampanya, Bütçe, Gereksinimler, Yöntem), ilk düzeltmeler:
  - Gauss PPV/σ için sabit "≈ 6–8,5" dört yerde kalmıştı (Gereksinimler bilgi satırı ve tanımlar, Yöntem bulgusu, T1.9 notu). 06_tests_d losSummary
    her kayıt için Rice beklentisini taşır (gauss: el, xel, ν0); 08_req bilgi satırı "PPV/σ El / Az (parantezde aynı tayfta Gauss beklentisi, Rice)";
    08_method bulgusu n19.sonra.gauss; T1.9 notu Rice ifadesini yazar. Değerler: lab 9,1 / 9,4 ve 9,3 / 9,4, işletme 9,1 / 9,2 ve 9,1 / 9,3.
  - vv.js: ikinci K7 (düzenek darbe tepeleri) → K8, yinelenen kimlik denetimi (process.exitCode = 1); kılavuzdaki dört atıf K8.
  - 06_budget lejantı ▲ (tahsis aşımı) ve ◀ (işletme değeri 0,1 µrad'ın altında) açıklar.
  - Ön hesap run_pre1315.sh; prediff1315.log yalnız gauss alanları ve T1.9 notes[2]. V&V 73/73. Test durumları ve sayıları değişmedi.
- v13.16 (10.11.2026, Sürüm 33 sürüm kimliği 1794306285-a00a) — §14 devam:
  - Gereksinimler'de σ_vek "4.00 ≤ 4.00 OK" görünüyordu (gerçek u95 3,9998, pay 0,2 nrad; koruma bandı BELİRSİZ, P 0,97). 08_req: sınırla aynı
    basamağa yuvarlanan değer iki basamak fazla yazılır; σ satırlarının Karar sütununa koruma bandı kararı ve P (title: x ± U, sınır); tohum notunda
    σ_vek dört basamak.
  - Tohum tekrarı yalnız test kararını sayıyordu. vv_seeds_agg.js: T1.9 req.rows (her karar satırının AŞIM sayısı, değer / sınır özeti), req.basis,
    req.nRows; 04_campaign seedRowsTxt (Kampanya T1.9 tohum satırı, Gereksinimler tohum notu, Yöntem tohum bölümü "T1.9: …" + %95 üst sınır);
    08_method yeni bulgu "T1.9: test kararı tohumdan bağımsız, sınıra yakın satırlar değil" (69 bulgu). Bulgu: Bant 2,5–20 Hz El 4/5 AŞIM, aşan
    satır 8–9, σ_vek 3,9556–3,9998 (normal yaklaşımla tek koşuda AŞIM ≈ %10).
  - Ön hesap: node vv_seeds_agg.js && node precompute.js vv (yalnız seeds alanları). check24 v13.15 ile aynı; check41 hatasız.
  - §14 bulguları (bilgi): işletme PPV El Gauss değil — dalga çarpması geçişleri (PPV El 184,9 / 192,5 → çarpma kapalı 55,9 / 64,7 µrad, PPV/σ
    26,8 → 8,5 / 9,8, P99,73 24,0 / 31,5 → 21,3 / 21,8); işletme bütün kaynaklar RMS El tohumlar arası 8,9–24,6 (CV %44, gösterilmez; wander CV %2,6);
    u95 pencereleri bağımsız sayar; u95 (tek taraflı %95) ile k = 2 koruma bandı (≈ %97,7) farklı güven ister; Gereksinimler Karar sütunu lab tabanlı.

- v13.17 (10.11.2026, Sürüm 34 sürüm kimliği 1794307899-e273) — §14 kararları K1 (c), K2 (c):
  - K1 (c) uyarlamalı tohum: sim/seeds_adapt.js (yukarıda); T1.9 20 tohum: 20 AŞIM, aşan satır 17 kez 9, 3 kez 8; σ_vek u95 3,9330–3,9998
    (3,969 ± 0,019), 0/20 AŞIM (Clopper–Pearson %0–17, tek taraflı üst %14; normal yaklaşımla ≈ %5); Bant 2,5–20 Hz El 17/20 (%62–97); Bant
    0,1–2,5 Hz El 1,0106–1,0786 (20/20). 04_campaign: seedLine teste özgü n, seedRowsTxt Clopper–Pearson (cpInt), adaptTxt; 08_req tohum notu;
    08_method tohum paragrafı ve bulgu (n19, k19).
  - K2 (c): 07_budget opDecomposition req.noSlap {pre, post} (sourceActive slap, A > 0; opScenario src {slap: false}, aynı tohum; özet alanlar).
    08_req üç bilgi satırı (PPV El / Az, PPV/σ + Rice, P99,73; denizaltı işletme sütunları) ve tanım maddesi (pencere dışlama uygulanamaz: λ·T_w = 6,
    e^−6 ≈ %0,25); 08_method bulgu "İşletmede PPV ve P99,73'ü dalga çarpması geçişleri belirler". Değerler: PPV El 184,9 / 192,5 → 55,9 / 64,7; PPV/σ
    26,8 → 8,5 / 9,8 (Rice 9,1); P99,73 24,0 / 31,5 → 21,3 / 21,8 µrad. Çarpma hariç de PPV El ve P99,73 sınırın üstünde.
  - V&V G6 (74/74). Ön hesap: op (denizaltı) + vv; gemi op değişmez (kaynak yok). check24 yalnız V&V sayısı farklı.
- v13.18 (10.11.2026, Sürüm 35 sürüm kimliği 1794308483-3075) — kılavuz §15 Sınırlar, bilinen sorunlar ve doğrulama günlüğü:
  - 08_method "Varsayımlar ve sınırlar": jiroskopik kuplaj oranı düzeltildi (10⁻⁴ N·m dar kip, 10⁻³ N·m 6-DOF tepe; F_c 1,58 / 3,56 N·m; önce
    "sürtünmenin binde biri"); hexapod maddesi açısal sınırların yalnız komut denetiminde kullanıldığını, öteleme sınırı olmadığını ve darbe
    sorununu (×1,6 / ×3,3, V&V K8) yazar, iki maddedeki yinelenen öteleme cümlesi kalktı; tohum maddesi uyarlamalı; yeni madde "Geçerleme yoktur".
    "Hangi sayı nereden geliyor" kalibre düzey satırı dalga çarpmasının beklenen değere kalibrasyonunu (24 tohum 1,93, tohum 11 1,71 ↔ 2,00) yazar.
    Yeni panel "Bilinen açık konular" (10 madde). V&V tanıtımı: doğrulama / geçerleme ayrımı ve tam regresyon notu. P0m = varsayılan DUT.
  - Denetimler: tam regresyon iki platform FARK 0; V&V baştan 74/74 ve birleştirilmiş sonuçla aynı; kalibrasyon ±%1,1 (B3-01 +%1,11), B2-02 −%14,5.
  - Test durumları ve sayıları değişmedi.
- Arayüz 14.0 (10.11.2026, Sürüm 36 sürüm kimliği 1794319237-10e6; motor v13.18 değişmedi) — "excel gibi" görünümün yerine endüstriyel iş istasyonu:
  - Kabuk: üst çubuk (marka, platform seçici, 28 hücreli kampanya sekans şeridi B0–B4, OK / aşım / bilgi sayaçları, Kampanyayı koştur, tema düğmesi,
    2 px ilerleme çizgisi), sol gezinme (simgeli 7 ekran; Kampanya rozeti aşım sayısı, Model rozeti varsayılandan farklı parametre sayısı; ↑↓ tuşları),
    alt durum satırı (sonuç kaynağı, parametre durumu, V&V, tohum tekrarı, koşu süresi tahmini). Ekran adları ve #adresleri korundu; açılış Özet.
  - Yeni Özet ekranı: kampanya göstergeleri, frekans bloklarına göre 28 testlik matris (tıklanınca Kampanya'da açılır), T1.9 karar satırları (Gereksinimler
    ile aynı değer ve basamak), bütçe wander / smear / tepe çubukları (analitik, ölçümlerle, işletme; sınır çizgisi), V&V grupları ve tohum özeti.
  - Kampanya: süzülebilir test gezgini (metin + Tümü / Aşım / Bilgi / Geçersiz; boş blok başlıkları gizlenir) ve ayrıntı paneli. Düzenek: senaryo araç
    çubuğu, solda 3B görünüm + grafikler, sağda dedektör ve metrikler (1200 px altında tek sütun: görünüm, dedektör, metrikler, grafikler), Ölçüler
    düğmesi (HUD). Bütçe / Gereksinimler / Model: göstergeler + panel içi sekmeler (seçim tarayıcıda hatırlanır); Model'de bölüm içindekiler, parametre
    araması, hazır ayar menüsü; Yöntem'de içindekiler ve kaydırma izleyici. Metinlerde "X sekmesi" → "X ekranı".
  - Görsel dil: açık iş istasyonu (zemin #e5e9ec, yüzey beyaz, vurgu #0b6a8e, koyu gezinme #16222a), koyu tema düğmeyle (tercih mlos2.theme); ISA-101
    yaklaşımı: renk yalnız durum için, durum simge + metinle de verilir; seri renkleri değişmedi; 3B sahne zemini --scene. Yazı tipleri gömülü (Barlow
    Semi Condensed başlık ve göstergeler, IBM Plex Sans metin / tablo / grafik, IBM Plex Mono formül). Duyarlı kırılımlar 1500 / 1360 / 1200 (simge
    gezinme) / 860 (belge akışı, yatay gezinme) / 560 px.
  - Doğruluk kanıtı: (1) ui_ident.py — motor 446 060, PRE 3 229 187, TM 30 706 bayt, SHA-256 eski sayfayla aynı; motor sim/engine_browser.js ile aynı.
    (2) ui_cmp.py — eski arayüzün gösterdiği her sayı yenisinde var (iki platform; eksik 0): Bütçe, Gereksinimler, Model, Yöntem çoklu kümeleri birebir
    aynı; Model'in 201 giriş değeri aynı; 28 testin ayrıntısında eksik yok (+1–2: "N grafik" ipucu); Kampanya'nın gösterge sayıları Özet'e taşındı
    (birleşik kümede 153 fazla belirteç, hepsi Özet'teki yinelemeler). (3) check44.js 54/54; check24 dış referans izi yok, değerler v13.18 ile aynı
    (yalnız gizli alt sekmedeki tabloların metin ayırıcıları ve V&V kutucuk etiketlerinin büyük harfi farklı); tarayıcıda T0.1 koşusu OK.

## 5. Varsayılan sonuçların özeti (denizaltı, µrad)

- T1.1: roll doğrusal DRR −80,6 dB (gerekli −77,4); deniz spektrumu ağırlıklı artık roll 4,58 (tahsis 5), yaw 1,82
  (3). Gemi: −82,5 > −82,9 dB ve 6,20 > 5 → AŞIM.
- T1.3 wander el / xel 6,96 / 6,57 (gereksinim 20; 5 tohum ortalaması el 7,36 ± 0,24), laboratuvar ötelemesi q = 0,885
  (h = 1 m); gemi 8,24 / 6,71, q = 0,032 (h = 15 m).
- T1.9 laboratuvar, takip sonrası: σ_El 3,11 (✗), σ_Az 2,53, σ_vek 4,00 (5 tohum 3,96–4,00, sınırda),
  PPV El 27,2 (✗), P99,73 9,8, pozlama 1,96 / 1,71; karar AŞIM (5/5 tohum). T1.6 geçiş PPV 9,4 / 11,0 (OK).
- İşletme (600 s, tüm kaynaklar), takip öncesi → sonrası: σ_El 7,37 → 7,72, σ_vek 9,43 → 9,08, pozlama 3,85 (v13.3; VIV
  ötelemesiyle σ'lar ≤ %0,5 değişti);
  baskın kaynaklar B1-01 roll (%26), B3-01 50 Hz yardımcı makine (%19), B1-07 sürtünme (%15).
- Takip döngüsü: |S| < 1 yalnız 1,69 Hz altında, tepe +9,3 dB @ 3,46 Hz (PM 27,7°); 1 kare gecikmeyle 4,7 dB.
- Deniz (analitik, seaDrrInfo): roll DUT DRR −80,0 dB @ 0,125 Hz, artık 3,79; roll periyodu 4 s → 8,28 (bütçe 3,70);
  6-DOF SS4 → 5,12 (bütçe 2,91).
- VIV (v13.5, öteleme dinamiği fbw): denizaltı bant 1,65–5,48 Hz (7 f_v + f_n + alt dal 5,48 Hz), T2.1 OK (−58,5 dB @ 3,05 Hz;
  gerekli −40,2), T2.2 OK (f_n OFF 20,78 → ON 2,08, yalnız açısal 2,07; en kötü 3,05 µrad @ 5,48 Hz), T2.3 OK (−5,5 %); işletme
  B2-01 el 0,65 / xel 0,07 µrad (öteleme kapalıyken 0,61 / 0); analitik tahmin 6,17 µrad (> 6; ölçüm bütçeye geçer). Gemi: T2.1 OK
  (koherans üst sınırı −52,2 ≤ −50,2 dB), T2.2 AŞIM (f_n 5,75; f_n + %15 6,55 µrad; yalnız açısal 5,56), T2.3 OK (+6,5 %);
  işletme B2-01 el 3,47 / xel 0,87 µrad; yaklaşım 1: v_crit 9,11 m/s, y_F 14,65 mm, θ 0,157°, 9,72 m/s².
- Hexapod ve kolimatör (v13.5): erişim köşeleri 0,424 / 1,59 Hz (1 Hz'de 6,37°); |H| ≥ 0,99 7,55 Hz'e kadar, 8 Hz'de 0,987; stab-OFF
  sınırı 0,9386°; kolimatör f_c/f 5, iğne 33,3 µrad (0,83 IFOV), e_free 18,2 mm (gemi D_c 200: 40,9), e_vig 25 mm; göz bebeği kayması
  T0.3 14,1 / 15,4, T2.1 13,0, T1.3 18,2 (q_c 0,299; ölçeksiz 57,7), T2.3 18,2 (q_c 0,307), T2.5 17,0 (1 m aşağı pivot; öteleme x/z
  12,7) mm; gemi T1.3 40,2 mm (q_c 1). δ_max 124 µm. T2.5 1,64 µrad (τ = 0,987). Düzenek denizaltı deniz oynatması: ×0,334 ile 18,2 mm,
  örtüşme %100; δ = 225 µm'de paralaks tepe 1,82, RMS 0,62 / 0,48 µrad; gemi ×0,961 ile 40,9 mm.
- Kaldıraç kolu (v13.1): denizaltı h = 1 m → |a| 0,025 m/s², B1-08 0,05 µrad, laboratuvar q 0,885 (T1.3 tohum 1); gemi
  h = 15 m → |a| 0,552 m/s², B1-08 1,10 µrad, q 0,032; gemi r = (20, −4, 15) m → |a| 0,723 (tam ilişkili 0,836) m/s²;
  6-DOF SS4 aynı kolla 1,870 (2,651) m/s², T2.5 kestirimi (v13.5, 2–3 Hz) el 2,92 / işletme 1,87 µrad (v13.4: 3,37).
- Ölçüm zinciri (v13.7): U-01…U-07 = 1,20 / 1,00 / 2,00 / 0,53 / 0,10 (yüksek hızlı 0,05) / 0,80 / 0,50 (U-04 ve U-07 yoğunluktan,
  0,0224 µrad/√Hz); u_v 2,66, u_h 2,35 (2,352); TUR_W 7,51, TUR_S 4,25 (Z540.3 k = 2: 3,76 / 2,13); taban sınırı 5,00; şişme %0,88 / %2,73;
  senkron 3,60°, IMU grup gecikmesiyle 6,84° (τ_g 0,450 ms); ε_r 0,224 (n_d 21). T0.1 IFOV 40,15874 µrad/px, S-eğrisi 0,0264 ± 0,0017 px
  (beklenen etkin 0,0268), kazanç xel / el 0,877 / 1,054 ± 0,010 (model 0,878 / 1,044; faza göre 0,822–1,178). T0.2 stab OFF 2,04 / 1,67
  (beklenen zincir 1,60 / 1,49, DUT payı 1,27 / 0,76), otokolimatör 1,11 / 1,12. T0.4 −0,927 ± 0,032 ms (model −0,950). T3.3 TUR 4,25
  (ölçüme dayalı u_h 2,35). Koruma bandı (k = 2): T0.2 KABUL; T1.3 KABUL; T1.9 σ_El RED, σ_Az KABUL, σ_vek BELİRSİZ (3,95 ± 0,06; %96,7).
- Dünya dönüşü (v13.7): φ 40°, α 90°, ε 0° → yatay 46,87, düşey 55,86, LOS etrafı 0 µrad/s; çıkış 365 s (kenar payı 2 px; 120 s'de 167,6 px);
  Ω·δ 1,273 (δ 1°), B 0,436 (0,09 °/h) → T0.7 AÇIK eşiği 1,709; KAPALI toleransı 5,12 / 6,02. T0.7 KAPALI 47,10 / 55,67, AÇIK 0,691 / 1,339
  (OK; ayrıştırma el 0,818 artık + 0,556 bias, xel 0,975 − 0,272). drift(τ = 1 s) 2,24 µrad (E96 1,454, E99 0,242, Eb0 0,194, E120 1,273;
  gereksinim 40). Tohum çalışması 1/100 AŞIM (taze kalibrasyon 0/100). MWIR-WFOV çıkış 2191 s, HDTV-NFOV 111 s.
- Bütçe (v13.9; v13.8'de wander 10,46, EIS 8,32): wander 11,14 (gereksinim 20; B1-05 4,11 wander penceresinde, tahsis 2 aşılır), EIS 9,22 / kilit 5,29,
  gemi wander 22,90, EIS 12,86 / 6,63; ölçümlerle / işletme wander 9,72 / 7,33. Aşağıdaki v13.8 satırı karşılaştırma için:
- Bütçe (v13.8): wander 10,46 (gereksinim 20), smear 2,76 (10), EIS sonrası 8,32 / kilit 5,23, drift 2,24 (40); B1-04 1,85 (LOS tabanı, pitch
  18,51 mrad @ 0,100 Hz), B1-05 1,45, B1-06 0,24, B1-08 0,05, B1-09 0,19, R-01 16,39 / 20 (köşe). Bütçe sekmesi ölçümlerle / işletme: wander
  9,16 / 7,33, EIS 8,67 / 7,12, drift 2,24 / 5,22. Gemi: wander 22,58 (AŞIM; B2-01 19,42, B1-01 6,99), EIS 12,23 / 6,59, B1-04 2,62, B1-08 1,10;
  R-01 analitik 16,39 OK, işletme 29,03 ve T1.5 28,71 → AŞIM.

## 6. Açık konular / sınırlar

- Denizaltı h = 1 m bir örnektir (kullanıcı kararı): deniz profili gövdenin hareket merkezinde tanımlıysa gerçek değer mast
  başının o noktaya yüksekliğidir (h = 10 m → B1-08 0,51 µrad, laboratuvar q ≈ 0,09).
- Serbestlik dereceleri bağımsız (RAO çapraz spektrumu yok) — bilgi olarak bırakıldı (kullanıcı kararı); tam ilişkili sınır
  gösterilir (6-DOF'ta ×1,23–1,53). Kol bütçesi birinci derecedir (benzetime göre en çok −%4; S2).
- Takip sonrası karar izleyici modeline çok duyarlı: gerçek izleyici (gecikme, öngörü/Kalman, alt-kare) bekleniyor.
- Bütçe tahsisleri proje LOS setine göre yeniden dağıtılmadı (IFOV ile ölçekleniyor ama wander/smear tanımına göre).
- İşletme gereksinim koşusu (op.req) için tohum tekrarı yok (yalnız T1.9 tohumlandı).
- Gemi profili ve örnek DUT değerleri örnek/kalibre; 6-DOF profil bir standart değil.
- Kaynak künyelerinden "Kopeika ve ark." yalnız dizi ve Part 2 bağlantısıyla verildi.
- §5 (v13.5 sonrası açık): (a) kısmi örtüşmenin ölçüme etkisi (sinyal kaybı, centroid gürültüsü) modellenmedi, kural yalnız
  GEÇERSİZ der; (b) kural keskin: %99,99 örtüşme de GEÇERSİZ (gemi D_c 150 mm) — örtüşme eşiği istenirse kullanıcı kararı;
  (c) sığdırma 6-DOF profillerde T1.3'ün öteleme payını küçültür (SS4 ±100 → ±16 mm), ivme etkisi T2.5'te; (d) denizaltı roll 6°'de
  T1.3 GEÇERSİZ (27,0 mm; D_c ≥ 170 mm); (e) kolimatör odak hatası ölçülüp girilmeli. Kısıt: hexapod hızı ve ivmesi benzetimde
  sınırlanmaz (yalnız komut denetimi, GEÇERSİZ).
- §4 VIV (v13.3 sonrası açık): (a) alt dala erişim kuralı tarama payını da kullanıyor (tutucu): f_n = 4 Hz'de alt dala yalnız
  payla ulaşılır (4,94 < f_n,vak 5,42 ≤ 5,93 Hz) ve 7,30 Hz dar bant kontrol bandının (1,2–6 Hz) dışında → T2.2 AŞIM 35,3 µrad
  — kullanıcıya soruldu; (b) akış yönü VIV'i (2·f_v) bilgi olarak bırakıldı (kullanıcı kararı); (c) Re 2–13·10⁵
  kritik/süperkritik: St = 0,2 belirsiz (transkritikte 0,25 → 6,17 Hz, AŞIM); (d) genlik senaryo değeri (ölçüm girilmeli).
- Teknik kılavuz (Claude Docs, adım adım dolduruluyor): https://claude.ai/artifact/Cv3hrbaBh3v9eoHXzruqZ5
  (belge kimliği 607c9c99-5391-4dee-9535-077b45339a54, gövde düğümü 19447ce4-eced; son okunan/yazılan rev 260).
  Doldurulan: §1 amaç, §2 Referans kanal ve gereksinimler, §3 Deniz hareketi (v13.1 kaldıraç kolu güncellemesi dahil),
  §4 VIV (v13.3 kararlarıyla; T2.2/T2.3 sayıları v13.5; başlık m755abdxm42.35358; denizaltı tablosu .61420, gemi .43779,
  "Açık kalanlar" listesi .64488), §5 Hexapod ve kolimatör, taban düzeltmesi (v13.5; başlık m755abdxm42.72041; hexapod tablosu
  .91603, kolimatör .93062; denizaltı değişim tablosu .96864, gemi .99463, maddeler .100637; Düzenek .109720; bulunan sorunlar .102476;
  "Kullanıcı kararları" .88545 + .106451; "Açık kalanlar" .107205 + .107233; kullanım notları .107907), §6 Ölçüm zinciri ve belirsizlik
  (v13.6 + v13.7 kararları; başlık m755abdxm42.114744; v13.7 giriş paragrafı .140769; ölçüm zinciri tablosu .115455, kayıt istatistiği
  .116865; koruma bandı paragrafı .141173 + latex .141765 + tablo .142637 + gemi .165793; analitik değişim tablosu .124910, test yanıtları .126444,
  piksel fazı ↔ T1.3/T1.9 .128020, maddeler .128591, v13.7 test yanıtları .143529; Düzenek .129776; bulunan sorunlar .131593;
  "Kullanıcı kararları (v13.7'de uygulandı)" .134852 + .137864; kullanım notları .136071), §7 Dünya dönüşü (v13.7; başlık
  m755abdxm42.145999; parametre tablosu .147180; türetme latex blokları .149166, .149656, .150369, .151198, .152206, .152866; analitik
  değişim tablosu .155344, T0.7 test yanıtları .163697, tohum çalışması .165029, kompanzasyon kapalı kampanya .157835; Düzenek .158422;
  bulunan sorunlar .160199; "Kullanıcı kararı bekleyenler" .161886 + .161916; kullanım notları .162853), §8 Bütçe varsayımları (v13.8;
  başlık m755abdxm42.166434; giriş .166492, .166808; parametre tablosu .167127 + not .169155; türetme latex blokları .169661 (satır zinciri),
  .169927 (W), .170170 (gyro satırları), .170573 (drift), .171194 (B1-04), .171877 (R-01), .172538 (türetme artığı), .173146 (EIS çarpanı),
  .173531 (W_EIS), .174022 (pencere RMS); analitik değişim tablosu .175300, karar alternatifleri .177234, test yanıtları .177765, maddeler
  .178978; Düzenek .179908; bulunan sorunlar .182310; "Kullanıcı kararı bekleyenler" .185163 + .185238 + §5/§7 notu .186735; kullanım
  notları .186912). Giriş paragrafı .1049'a §8 sürüm notu eklendi; §6 kayıt istatistiği tablosundaki "Örnek E31" → "Örnek (ham σ)".
  v13.9: §8'e karar paragrafı .190407, "Kullanıcı kararları (v13.9'da uygulandı)" .185163 + liste .188687 + §5/§7 notu .186735; §7'nin karar
  başlığı .161886 ve notu .162751, §5'in .107371 ve .101375 maddeleri "kullanıcı kararı (v13.9)" ile kapatıldı; giriş .1049'a §9 notu.
  §9 Örnek DUT — stabilizasyon döngüsü (v13.9; başlık m755abdxm42.190831; giriş .190873, .191325; parametre tablosu .191658 + not .193028;
  türetme latex .193598 (tesis/kontrolcü), .194165 (L), .194548 (DRR), .195609 (LuGre FF); analitik tablo .196477, dar bant PM .197703, kestirim
  hatası .197943, test yanıtları .198292, maddeler .199839; Düzenek .204610; bulunan sorunlar .200572; "Kullanıcı kararı bekleyenler" .202763 +
  .202838; kullanım notları .203759).
  v13.10: §9 bulunan sorunlar maddeleri .201789 / .202055 / .202405 karar notlarıyla; "Kullanıcı kararları (v13.10'da uygulandı)" .202763 + .206400;
  giriş .1049'a §10 notu (.224771). §10 Örnek DUT — mekanik ve sürtünme (v13.10; başlık m755abdxm42.208020; giriş .208060, .208579; parametre tablosu
  .208905 + not .210296; türetme başlığı .210511, latex .210780 (hareket denklemi), .211105 (LuGre), .211770 (tork yolu); değişim testleri .213137:
  b/k tablosu .213558, J .213896, kalibrasyon .214168, test yanıtları .214416, direk modu .215545, maddeler .215708; Düzenek .222337 + .222876;
  bulunan sorunlar .216313 + .216330; "Kullanıcı kararı bekleyenler" .219242 + .219329; kullanım notları .221347 + .221364).
  v13.11: §10 karar paragrafı .219242 ("Kullanıcı kararları (v13.10 sonrası): beşinde de şimdiki davranış"). §11 Örnek DUT — gyro, modlar, optik
  (başlık m755abdxm42.225114; giriş .225154, .225732; parametre tablosu .226320 + not .227846; türetme başlığı .228170, latex .228546 (gyro ölçümü),
  .229078 (Allan), .230052 (B2-05), .230528 (modlar), .231066 (soğutucu), .231701 (g-duyarlılığı); değişim testleri .231970: T0.6 dağılımı .232400,
  kestirici × kayıt .233356, f_bw .233984, gyro hata terimleri .234468, modlar .235352, soğutucu .236251, T0.1 .236829, maddeler .237205; Düzenek
  .244786 + .244805; bulunan sorunlar .237831 + .237848; "Kullanıcı kararı bekleyenler" .241232 + .241372; kullanım notları .243023 + .243040).
  v13.12: §11 karar notu (v13.11 sonrası: dördünde de şimdiki); giriş .1049'a §12 notu (.267126). §12 İşletme ortamı ve proje gereksinimleri (başlık
  m755abdxm42.246861; giriş .246908, .247487; parametre tabloları .248069 / .248907 / .249462 + not .250460; türetme .250657; değişim testleri .253338:
  ortam .253726, T2.4 .254274, gereksinim testleri .254669, wander penceresi .255200, T1.9 .255579, PPV / P99,73 .256565, maddeler .257210, tarayıcıda
  tek test koşusu .263101 + .263214; Düzenek .263928 + .263947; bulunan sorunlar .257799 + .257816; "Kullanıcı kararı bekleyenler" .260700 + .260802;
  kullanım notları .261993 + .262010). v13.13: karar notu .260700 ve K1–K3 maddelerine "Seçilen" cümleleri; değişim testlerine v13.12 → v13.13
  tablosu .267381 + .267476 + .268377; Düzenek'e v13.13 maddeleri .270513 + .270563; giriş .1049'a §12 kararları notu (.271896).
  v13.14: §13 Düzenek sekmesi (başlık m755abdxm42.272161; giriş .272177, ana bulgular .272661; Parametreler .273257 + .273270, tablo .273525,
  not .274777; Türetme .275061 (latex .275373 / .275754 / .276358 / .276872 / .277468 / .277739); Değişim testleri .278408 + .278425, 12 durum
  tablosu .278772, ek denetimler .280421 + .280436; Düzenek görselleri .282008 + .282027; Bulunan sorunlar .283639 + .283656; "Kullanıcı kararı
  bekleyenler" .285975 + .286079; Kullanım notları .287459 + .287476); giriş .1049'a §13 notu (.288740). Son rev 294.
  v13.15–16: §13 karar notu (.285975, "Kullanıcı kararları (v13.14 sonrası)"); K7 → K8 atıfları (.288854, .273226, .280654, .284175).
  §14 Kampanya, Bütçe, Gereksinimler ve Yöntem sekmeleri (başlık m755abdxm42.289147; giriş .289198, ana bulgular .289740; Parametreler .290431 +
  .290444, tablo .290614; Türetme .291912 (+ .291920, latex .292094 / .292482 / .292757, .292932); Değişim testleri .293718 + .293735, tablolar
  karar yardımcıları .293825, gösterilen ↔ veri .294876, işletme PPV .296002, T1.9 tohum .296679; Düzenek görselleri .297246; Bulunan sorunlar
  .299185; "Kullanıcı kararı bekleyenler" .301887 + liste .302075, öneri .303136; Kullanım notları .303492 + .303509); giriş .1049'a §14 notu
  (.304759). Son rev 306.
  v13.17: §14 ana bulgulara karar cümlesi (.289740), parametre tablosunda V&V 74 / G 6 ve tohum hücresi, Gereksinimler hücresine v13.17;
  değişim testlerine "Kararların uygulanması" .305225 + tablo .305272; karar notu .301887 ("Kullanıcı kararları (v13.16 sonrası)"), gerekçe .303136;
  kullanım notları iki madde; giriş .1049'a §14 kararları notu (.307326).
  v13.18: §15 Sınırlar, bilinen sorunlar ve doğrulama günlüğü (başlık m755abdxm42.307492; giriş .307540, ana bulgular .307988; Parametreler
  .308898 + .308911, V&V sınıfları tablosu .309110, not .310345; Türetme .310468 (+ .310476, latex .310664 / .311068, .311304); Değişim testleri
  .311580 + .311597: sınırlar denetimi tablosu .311747, doğrulama günlüğü .313232 + tablo .313346, bütünsel denetimler .315352 + tablo .315387;
  Düzenek görselleri .315953 + liste .316012 + .317229; Bulunan sorunlar .317349 (maddeler .317366 … .319070); "Kullanıcı kararı bekleyenler"
  .319307 + liste .319409, öneri .320589; Kullanım notları .321015 + .321032); giriş .1049'a §15 notu (.321949).
  Arayüz 14.0: girişte .1049'un ardına yeni paragraf m755abdxm42.322096 (ekran düzeni; "X sekmesi" = aynı adlı ekran; motor / ön hesap / test
  tanımları bayt bayt aynı, sayısal örnekler geçerli). Son rev 319.
  Bekleyen bölüm yok: rehberin bütün bölümleri yazıldı (§1–§15).
  Her bölüm: parametre tablosu → türetme zinciri (latex) → değişim testleri tablosu → Düzenek görselleri → bulunan
  sorunlar → kullanım notları. Not: markdown tablo hücresinde "|" karakteri tabloyu böler (|ΔT| gibi ifadeleri hücrede yazmayın).
- §6 (v13.7'de kapandı): K1 (a), K2 (c), K3 hayır, K4 (b) uygulandı. Açık kalanlar: T3.3 durumu bütçeden (ölçüme dayalı satır bilgi);
  T0.1 S-eğrisi etkin genlik (titreşimle söner); hedef noktası (x0, y0) Model'de yok; IFOV_eff S-eğrisinden ~2σ etkilenebilir (bilgi);
  U-04 sürekli zaman ENBW'siyle (555 Hz), benzetim kaydı ayrık ENBW'yle (500 Hz @ 2 kHz) — bütçe %5 temkinli.
- §7 (v13.9'da kapandı: kullanıcı "işlem yapma" dedi; şimdiki davranış kalıcı). Sorulan seçenekler kayıt için: K1 T0.7 AÇIK ölçütü ((a) bütçe bileşimiyle sabit pay — şimdiki, (b) istatistiksel pay /
  koruma bandı (T0.6 Allan + 900 s ortalamasının dağılımı), (c) bias'ı ayırarak (testten hemen önce iki konumlu ölçüm; artık yalnız Ω·δ ile));
  K2 δ varsayılanı (1° şimdiki ↔ 0,1° ölçülmüş kolimatör yönü: eşik 0,564, %77'si bias payı, varsayılan tohum AŞIM); K3 kompanzasyon
  hatasının yönü (en kötü yön — şimdiki ↔ kaynak bazında enlem / kuzey / eğim). Ayrıca: işaretler kamera eksen kuralına bağlı (sayfa
  büyüklük verir); T0.7 ayrıştırma satırı yalnız benzetimde.
- §8 (v13.9'da kapandı: K1 (a), K2 (b), K3 (a)). Sorulan seçenekler kayıt için: K1 G1 grubu (B1-01 + B1-04) toplaması (doğrusal — şimdiki: 10,46 / 22,58 ↔ karesel 9,78 /
  21,76; işletme korelasyonu 0,11 / 0,06; benzetim serbestlik derecelerini bağımsız üretir); K2 rastgele yürüyüş satırlarının (B1-05, B1-06,
  B1-09) wander metriği ((a) τ metriği — şimdiki, (b) wander penceresi: B1-05 = ARW·√(T_w/15) = 4,11, B1-06 / B1-09 yalnız drift'te →
  11,14 / 22,90, τ'dan bağımsız, (c) ayrı satırlar); K3 R-01 ((a) mutlak 0,5 mrad — şimdiki, (b) türetme modeli s_f, t_d bütçe varsayımı:
  16,31 / 28,44 (gemi AŞIM, T1.5 ile tutarlı), (c) platforma göre mutlak). Ayrıca: ψ_lim yalnız piksel sayısına bağlı (1920 × 1080'de 454
  µrad < 0,5 mrad); EIS registrasyon artığı px cinsinden sabit (geniş alanda jitter'dan büyük).
- §5 vinyetleme örtüşme eşiği (v13.9'da kapandı: eşik eklenmez, kural keskin).
- §9 (v13.10'da kapandı: K1 (b), K2 (b), K3 (a)). Sorulan seçenekler kayıt için: K1 uyarlanır dar bandın frekans kestirimi ((a) ideal — şimdiki, (b) kestirim hatası parametresi,
  varsayılan 0, (c) varsayılan hata (ör. %5) + yakınsama süresi; %5 → −1,4 dB, T2.2 ≈ 2,08 → 2,43 µrad); K2 sürtünme ileri beslemesinin model
  bilgisi ((a) gözlemci biçimi tam bilir, doğruluk yalnız η — şimdiki, (b) gözlemciye ayrı F_c, F_s, v_s, σ0 oranları (varsayılan 1), (c) T1.6 / B1-07
  η ± δ ile koruma bandında); K3 sıcaklık programlı sürtünme modeli varsayılanı ((a) kapalı — şimdiki, T4.2 AŞIM; (b) açık, T4.2 OK). Ayrıca: az PM
  dar bandın 6 Hz ucunda 44,3° (bilgi); T1.8 kabulü girilmemiş (BİLGİ).
- §10 (v13.11'de kapandı: kullanıcı "şimdiki kalsın, değişiklik yapma"; K1–K5 (a)). Sorulan seçenekler kayıt için: K1 tork yolundaki üç satırın kalibrasyon tabanı ((a) dar bant kapalı taban döngü — şimdiki,
  (b) yapılandırılmış DUT'a yeniden kalibrasyon: F_c × 1,107, dengesizlik × 1,22, vuruntu × 1,76; T1.6 6,6, T2.5 2,00, T4.2 −20 °C 91,0, (c) bütçe
  tahminleri işletme değerine: wander 10,94 / 22,81); K2 σ0 belirsizliği ((a) bilgi — şimdiki, (b) T1.6'ya ön-kayma tanılama bölümü (tork–açı
  histerezisinden σ0, F_c; BİLGİ), (c) B1-07 satırına σ0 × 0,1–× 10 duyarlılık bandı); K3 direk tepesi modu ((a) bütçe dışı bilgi — şimdiki, (b) B2-07
  satırı, tahsis 0, κ 0 kalır); K4 b ve k ((a) kalsın — şimdiki, (b) bugünkü döngü modeliyle yeniden çöz: el b 1,6706, az b 2,9069); K5 F_c değişince
  σ0 ((a) sabit — şimdiki, (b) ön-kayma ölçeği x_ps ayrı parametre, σ0 = F_c/x_ps). Ayrıca: LuGre'de σ1 yok (bilgi); atalet tasarım verisiyle doğrulanmalı.
- §11 (v13.12'de kapandı: kullanıcı "şimdiki değerler aynı kalsın"; K1–K4 (a)). Sorulan seçenekler kayıt için: K1 T0.6 bias kararsızlığı kestirimi ((a) taban/0,664, 4 sa — şimdiki, (b) gürültü modeli uydurması
  (ARW + bias kararsızlığı + hız rastgele yürüyüşü, ağırlıklı en küçük kareler), (c) (b) + 12 sa kayıt); K2 mod frekansı değişince LOS'a geçiş katsayısı
  ((a) sabit — şimdiki, (b) (f₀/f)² ile ölçekle, (c) g_acc ve g_A Model'de ayrı satır); K3 T3.4 kabulü ((a) videodaki temel bileşen — şimdiki, (b) optik
  yüksek hızlı kanalın 1.–3. harmonik toplamı); K4 B1-10 ((a) yalnız öteleme — şimdiki, (b) LOS ekseni etrafındaki dönmenin yerçekimi terimi
  k_g·σ_ψ/(2π f_ψ)). Ayrıca: gyro beyaz gürültüsü f_bw süzgecinden geçmez; T0.6 kuantizasyon / sıcaklık / g'yi içermez; ζ, g_acc, g_A, h2, h3, xel 0,7
  Model'de yok; T0.1 belirsizliği sistematik payı içermez.
- §12 (v13.13'te kapandı: K1 (b), K2 (a), K3 (b) uygulandı; kılavuz karar notu). Sorulan seçenekler kayıt için: K1 dalga çarpması kalibrasyonu ((a) genlik ölçeği 2458 µrad — şimdiki: tohum 11 taban döngü 2,00,
  beklenen 2,34; (b) Campbell beklentisine yeniden kalibre: 2101 µrad, beklenen 2,00, yapılandırılmış 1,39, tohum 11 1,09; işletme B2-02 ve bütün kaynaklar
  %15 küçülür, T2.4 kestirimi aynı oranda; (c) ortam kalsın, B2-02 bütçe tahmini Campbell'den: 2,34, tahsis 3); K2 v12 PPV ölçütü ((a) 6,5·σ — şimdiki,
  PPV σ'yı ≈ 0,70·sınıra indirir; (b) katsayı ≈ 9,5: T1.9'da PPV Az geçer, PPV El 27,2 > 23,8 yine aşar; (c) her koşuda Rice beklentisine göre, ör.
  1,1 × beklenti × σ sınırı); K3 T1.7 gereksinimsiz ((a) OK, kilit kaybı yoksa — şimdiki; (b) BİLGİ, varsayılan T1.7 OK → BİLGİ). Ayrıca: ortamın gizli
  parametreleri (çarpma süresi aralığı, yanal ivme frekansı ve bandı, platform bandı, yardımcı makine frekansı, yüksek frekans bandı) Model'de yok; T2.4
  kestirimi doğrusal ölçekleme varsayar (sürtünme payı belirsiz); iki ayrı pencere (wander 120 s, v12 60 s).
- §13 (v13.15'te kapandı: K1 (a), K2 (a); kod değişmedi, pulseRule gizli kalır). Sorulan seçenekler kayıt için: K1 laboratuvar darbesi (düzenek ve T2.4) — (a) yarım sinüs + şimdiki kural (100 / 200 ms
  darbeler hexapod'da gerçekleşmez: 644 / 1306 °/s²); (b) kurala hız sıçraması (wb.hex.pulseRule 'gercek' hazır; genlik 0,091 / 0,200 /
  0,400°, T2.4 tepe 74,5 µrad, oturmayan 3/60, B2-02 2,76 / 2,57 µrad); (c) hız sürekli profil (sin², genlik 0,046 / 0,18 / 0,73°; T2.4'ün
  Campbell kestirimi tayf oranıyla düzeltilmeli). K2 Düzenek LOS satırlarının işaretlenmesi — (a) RMS ve wander bilgi (v13.14); (b) wander
  oynatma penceresinde işaretli + uyarı; (c) RMS v12 σ sınırlarıyla (deniz AÇIK el 6,26 > 2,5 kırmızı).
- §14 (v13.17'de kapandı: K1 (c), K2 (c) uygulandı). Sorulan seçenekler kayıt için (test durumları her seçenekte aynı): K1 tohum tekrar sayısı — (a) 5 (şimdiki; ek ön hesap 4 × ≈ 8 dk,
  sıfır başarısızlıkta %95 üst sınır %45); (b) 10, bütün kampanya (≈ 75 dk, %26); (c) uyarlamalı: kampanya 5, sınıra %2'den yakın satırı olan testler
  (şimdi yalnız T1.9, 9 s) 20 tohum (≈ 3 dk, %14; aşma oranı ± ≈ %7). K2 işletme PPV / P99,73 ve dalga çarpması — (a) tüm kayıt (şimdiki); (b) çarpma
  pencereleri hariç (55,9 / 64,7; v12 "en kötü 60 s" tanımını daraltır); (c) ikisi: ana değer tüm kayıt + bilgi satırı çarpma hariç (op koşusu platform
  başına +43 s). Öneri: K1 (c), K2 (c).
- §15 (v13.18 sonrası, kullanıcı kararı bekliyor; test durumları her seçenekte aynı): K1 geçerleme için ölçüm girişi — (a) yalnız doğrulama
  (şimdiki, açıkça yazılı); (b) ölçüm içe aktarma: CSV (t, El, Az) kalıntı serisi ve DRR noktaları, aynı metrik motoruyla, benzetimle yan yana,
  V&V'ye geçerleme grubu; (c) yayımlanmış platform verisiyle kısmi geçerleme. K2 işletme gereksinim özeti tohum sayısı — (a) 1 (şimdiki); (b) 5
  (yalnız tüm kaynaklar koşuları, tohum başına ≈ 1 dk, ortalama ± sd); (c) 20 (≈ 20 dk). K3 ölçeğin sistematik belirsizliği — (a) yalnız T0.1
  istatistiği 1,4·10⁻⁵ (şimdiki); (b) Model parametresi "açı standardı ve kolimatör odak uzaklığının göreli belirsizliği", varsayılan 0; (c) aynı,
  örnek 10⁻³ (σ_vek P(uygun) 0,967 → 0,966). Öneri: K1 (b), K2 (b), K3 (b).
- Arayüz 14.0 (bilgi): tema, son ekran, seçili test, panel içi sekmeler ve HUD tarayıcıya özgüdür (localStorage, mlos2.*; paylaşılan bir durum
  değildir); gezgin süzgeci ve Model araması sayfa yenilenince sıfırlanır. 1200 px altında sekans şeridi, 860 px altında durum satırı gizlenir; sayaçlar ve rozetler üst çubukta / gezinmede kalır. Grafik ve 3B sahne renkleri tema
  değişince yeniden çizilir (MutationObserver data-theme). Ekran okuyucu için gezinme role=tablist, şerit hücreleri aria-label taşır; ayrıntılı
  erişilebilirlik denetimi (kontrast ölçümü, ekran okuyucu oturumu) yapılmadı.
- Sıradaki iş: §15 kararları (K1–K3). Rehberin bölümleri ve arayüz 14.0 tamamlandı; yeni iş kullanıcının seçimine göre (öneri: K1 (b) ölçüm içe
  aktarma — arayüzde Özet'e "ölçüm ↔ benzetim" paneli olarak da oturur).
