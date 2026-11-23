#!/usr/bin/env python3
"""pre.json metinlerine motorun v13 metin değişikliklerini uygular: patch_pre.py <girdi.json> <çıktı.json>"""
import json, re, sys
R = [
 ("Girdiler!B47 tam değeri", "masa mikro-titreşiminin tam değeri"),
 ('Kabul (σ_taban ≤ 5 µrad, kılavuz §7: "video tabanı en fazla 20/4 = 5 µrad") ölçüm zincirinin tabanına uygulanır', 'Kabul (σ_taban ≤ W/(m·TUR_hedef); varsayılanla 20/4 = 5 µrad) ölçüm zincirinin tabanına uygulanır'),
 ("°, Girdiler!B46)", "°)"),
 ("çalışma kitabı U-03'ü iki zincire", "belirsizlik bütçesi U-03'ü iki zincire"),
 ("hexapod mikro-titreşimi Girdiler!B47 düzeyinde", "hexapod mikro-titreşimi Model → Hexapod düzeyinde"),
 (" µrad (Girdiler!B47, her zincir)", " µrad (masa mikro-titreşimi, her zincir)"),
 ("Taban düzeltmesi (kılavuz §7.2) σ_DUT", "Taban düzeltmesi σ_DUT"),
 ("Hesaplanan (Dunya_Donusu)", "Hesaplanan (Model → Dünya dönüşü)"),
 ("Test_Matrisi ölçütü harfiyen (her eksen ve frekans)", "Her eksen ve frekansta DRR ≤ gerekli DRR (bilgi)"),
 ("; Test_Matrisi ölçütü harfiyen: ", "; her frekansta DRR ≤ gerekli: "),
 ('Kabul: gerekli DRR (H6) girdi genliğinin tanımlandığı baskın deniz frekansında uygulanır; diğer frekanslar bilgi amaçlıdır. Test_Matrisi ölçütü ("her eksen ve frekans için") harfiyen ayrıca sayılır: test genliği her frekansta deniz genliğine eşit tutulduğu, integratörlü bir döngünün DRR\'ı ise frekansla ~40 dB/dekad arttığı için bu ölçüt, çalışma kitabının kendi B1-01 varsayımını (−80 dB @ 0,125 Hz) taşıyan bir döngüyü bile 0,5–1 Hz\'de reddeder.',
  'Kabul: gerekli DRR, girdi genliğinin tanımlandığı baskın deniz frekansında uygulanır; diğer frekanslar bilgi amaçlıdır. Her eksen ve frekansta DRR ≤ gerekli DRR sayımı ayrıca raporlanır: test genliği her frekansta deniz genliğine eşit tutulduğu, integratörlü bir döngünün DRR\'ı ise frekansla 20–30 dB/dekad arttığı için bu sayım, bütçenin B1-01 varsayımını (−80 dB, baskın roll frekansında) taşıyan bir döngüyü bile 0,5–1 Hz\'de aşıyor gösterir.'),
 (" yalnız üst sınır raporlanır (kılavuz 7.6).", " yalnız üst sınır raporlanır."),
 ("(drift ayrı raporlanır, kılavuz 6.7)", "(drift ayrı raporlanır)"),
 ("(kılavuz: ikisi birlikte raporlanır)", "(ikisi birlikte raporlanır)"),
 ("; çalışma kitabı kenar ölçütüyle ", "; alan kenarı ölçütüyle "),
 ('Test_Matrisi "roll ekseni sinüs" der: burada LOS ekseni etrafındaki dönme kastedilir; LOS iskele', '"Roll ekseni sinüs" burada LOS ekseni etrafındaki dönmedir; LOS iskele'),
 ('Test_Matrisi "yaw/pitch sinüs" der (ileri bakan LOS için). LOS iskele', 'Test tanımındaki "yaw/pitch sinüs" ileri bakan LOS içindir. LOS iskele'),
 ('Hata eşiği çalışma kitabında "girin" olarak bırakılmıştır.', 'Hata eşiği proje gereksinimidir (Model → Proje gereksinimleri); girilmezse sonuç BİLGİ olarak raporlanır.'),
 ("düşük koheranslı nokta); kılavuz 7.6 üst sınırı: roll→el DRR ≤ ", "düşük koheranslı nokta); koherans üst sınırı: roll→el DRR ≤ "),
 (" Hz (kılavuz 7.6) — bu kısım T2.2 dwell'iyle doğrulanır", " Hz (koherans üst sınırı) — bu kısım T2.2 dwell'iyle doğrulanır"),
 ("stab ON genliği Hexapod_Erisim, stab OFF", "stab ON genliği hexapod erişimi, stab OFF"),
 ("Kılavuz 7.6 uyarınca yalnız üst sınır raporlanır:", "Bu durumda yalnız üst sınır raporlanır:"),
 ("Süpürme genliği Hexapod_Erisim kadar büyüktür", "Süpürme genliği hexapod erişimi kadar büyüktür"),
 ("Dwell frekansları VIV_Hesap tarama adaylarıdır.", "Dwell frekansları VIV taramasının adaylarıdır (Model → VIV)."),
 (" dB. Çalışma kitabının kendi tahmini (−40 dB varsayımıyla 6,17 µrad) B2-01 tahsisini (6 µrad) bilerek aşar (kılavuz 5.4); örnek DUT'ta bu açığı dar bant kontrol kapatır.",
  " dB. Analitik bütçe tahmini (−40 dB varsayımıyla 6,17 µrad) B2-01 tahsisini (6 µrad) aşar; örnek DUT'ta bu açığı dar bant kontrol kapatır."),
 ('tepe ve oturma eşikleri çalışma kitabında "girin" olarak bırakılmıştır.', 'tepe ve oturma eşikleri proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).'),
 ("→ H5 smear ", "→ MTF'ten smear "),
 ("(f artan; PSD_Agirlik B sütunu)", "(f artan; PSD ağırlıklandırma girdisi)"),
 (" doğrudan ölçülür (Girdiler §F).", " doğrudan ölçülür."),
 ('Boresight gereksinimi çalışma kitabında "girin" olarak bırakılmıştır.', 'Boresight gereksinimi proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).'),
 (" Dünya dönüşü kompanzasyonu kapalı (Girdiler!B101): ", " Dünya dönüşü kompanzasyonu kapalı (Model → Dünya dönüşü): "),
 ("s'de alanı terk eder (Dunya_Donusu). Kılavuz: uzun kayıtlarda kompanzasyon açık olmalı;", "s'de alanı terk eder. Uzun kayıtlarda kompanzasyon açık olmalı;"),
 ("Çalışma kitabı uyum kipinde bu test koşulmaz.", "Değerlendirme kapalıyken (ör. v10 uyum kipinde) bu test koşulmaz."),
 ("Gereksinim çalışma kitabının wander/smear tanımlarından farklıdır ve 6–8 kat sıkıdır; bütçe tahsisleri (Q) bu sete göre yeniden dağıtılmalıdır (Gereksinimler sekmesi).",
  "Gereksinim bütçenin wander/smear tanımlarından farklıdır ve 6–8 kat sıkıdır; bütçe tahsisleri bu sete göre yeniden dağıtılmalıdır (Gereksinimler sekmesi)."),
]
RX = [(re.compile(r", Girdiler!B47 = ([0-9.]+)\)"), r", masa parametresi \1 µrad)")]
SKIP = {'vv', 'seeds', 'extra', 'sens', 't07'}   # yeniden üretilen ya da yalnız sayısal bölümler
cnt = {}
def fix(s):
    for a, b in R:
        if a in s: cnt[a[:50]] = cnt.get(a[:50], 0) + s.count(a); s = s.replace(a, b)
    for rx, b in RX:
        s2, n = rx.subn(b, s)
        if n: cnt[rx.pattern] = cnt.get(rx.pattern, 0) + n; s = s2
    return s
def walk(o, top=False):
    if isinstance(o, str): return fix(o)
    if isinstance(o, list): return [walk(x) for x in o]
    if isinstance(o, dict): return {k: (v if (top and k in SKIP) else walk(v)) for k, v in o.items()}
    return o
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
d = walk(d, True)
d.pop('vv', None)   # V&V regresyon tabanına girmez (regress.js yalnız tests ve op okur; vv.js yeniden üretir)
if 'ship' in d and isinstance(d['ship'], dict): pass
json.dump(d, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for k, v in sorted(cnt.items()): print(f'{v:3d}  {k}')
left = re.findall(r'.{0,60}(?:Girdiler!|Jitter_Butcesi|Test_Matrisi|çalışma kitab|Çalışma kitab|kılavuz|Kılavuz|VIV_Hesap|Hexapod_Erisim|PSD_Agirlik|Olcum_Belirsizligi|Dunya_Donusu).{0,60}', json.dumps({k: v for k, v in d.items() if k not in SKIP}, ensure_ascii=False))
print('kalan:', len(left)); [print('  ', x) for x in left[:20]]
