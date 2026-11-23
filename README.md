# LOS Stabilizasyonu Sanal Test Düzeneği · LOS Stabilization Virtual Test Rig

Optronik mast görüş hattı (LOS) jitter test kampanyasının fiziksel sayısal ikizi: hexapod üzerinde iki eksenli stabilize
optronik kafa, ayrı sismik blok üzerindeki kolimatöre bakarken 2–4 kHz zaman alanı benzetimi. 28 test (T0.1…T4.2 + T1.9),
jitter bütçesi, işletme ayrıştırması ve proje LOS kalıntı gereksinimleri; iki platform: denizaltı mastı ve gemi direği EO
direktörü. Tek dosyalık HTML sayfası olarak çalışır; kurulum gerekmez.

> Simülasyon kendi içinde doğrulanmıştır (V&V, 74 kontrol) ancak gerçek ölçümle geçerlenmemiştir. Örnek DUT ve gemi
> profili değerleri örnek / kalibre değerlerdir, gerçek bir ürünün ölçülmüş değerleri değildir.

![Beyaz tahta](<LOS Stabilizasyonu Sanal Test Düzeneği — Beyaz Tahta.png>)

## İçerik

| Dosya | Açıklama |
|---|---|
| `LOS Stabilizasyonu Sanal Test Düzeneği.html` | Simülasyon: motor v13.18, arayüz 14.1; Türkçe / English (sağ üst ⋮ menüsü) |
| `LOS Stabilizasyonu Sanal Test Düzeneği — Teknik Kullanım ve Doğrulama Kılavuzu.docx` | Teknik kullanım ve doğrulama kılavuzu (§1–§15) |
| `LOS Stabilization Virtual Test Rig — Technical User and Verification Guide.docx` | Kılavuzun İngilizce çevirisi |
| `… — Beyaz Tahta.png`, `… — Whiteboard.png` | Tek sayfalık özet (TR / EN) |
| `mast_los/` | Kaynak: fizik motoru, ön hesap, V&V, doğrulama betikleri, arayüz 14.0 kaynağı. Ayrıntılı devir belgesi: [`mast_los/HANDOFF.md`](mast_los/HANDOFF.md) |

## Simülasyonu açmak

HTML dosyasını güncel bir tarayıcıda (Chrome, Edge, Firefox) açın. Sonuçlar önceden hesaplanmış olarak gelir; parametre
değiştirip **Kampanyayı koştur** ya da test ayrıntısındaki **Bu testi koştur** ile tarayıcıda (Web Worker) yeniden
hesaplanır. Düzenek ekranının 3B görünümü three.js r128'i cdnjs.cloudflare.com'dan yükler; bunun için internet bağlantısı
gerekir.

## Kaynaktan çalıştırma

Gerekenler: Node.js (Node 24 ile denendi), Python 3. V&V'nin N1 kontrolü ve `sim/probe/*/*_ref.py` bağımsız referans
hesapları için `numpy` ve `scipy`; `testenv/` tarayıcı denetimleri için Playwright ve Chromium (betiklerdeki sabit Chromium
yolunu kendi ortamınıza göre değiştirin, bkz. HANDOFF §3).

```bash
cd mast_los/sim
python3 build_engine.py                      # src/*.js → engine.js (Node) ve engine_browser.js (sayfa)
node vv.js                                   # V&V: 74 kontrol, ≈ 4 dk
node regress.js ../app/pre.json all sub -    # güncel motor ↔ yayımlanan ön hesap (denizaltı)
cd .. && python3 app/build.py                # → app/dist/mast-los.html (arayüz 14.0)
```

Tam ön hesap zinciri, tohum çalışmaları, regresyon kipleri ve tarayıcı denetimleri HANDOFF §2–§3'te anlatılır.

## Doğrulama durumu

Bu depo hazırlanırken (23.11.2026) yeniden koşuldu:

- `python3 build_engine.py`: üretilen `engine.js`, paketteki dosyayla bayt bayt aynı.
- Arayüz 14.1 sayfasındaki Türkçe motor, ön hesap (`app/pre.json`) ve test tanımları (`app/tm.json`), `mast_los/`
  kaynağıyla SHA-256 düzeyinde aynı: 14.1 yalnız arayüz ve çeviri katmanını değiştirir.
- `node vv.js`: 73/74 geçti. Geçmeyen tek kontrol N1 (Welch PSD ↔ `scipy.signal`), deneme ortamında numpy / scipy kurulu
  olmadığı için koşamadı; yayımlanan ön hesapta 74/74.
- `node regress.js ../app/pre.json all sub -` (Node 24.22): 28 test ve işletme ayrıştırması yayımlanan ön hesapla aynı;
  tek fark T3.2'nin MTF alanının son basamağı (0,9789570650783302 ↔ 0,97895706507833, göreli ≈ 2·10⁻¹⁶). Bu fark
  JavaScript motorunun matematik kütüphanesinden kaynaklanan kayan nokta yuvarlamasıdır; gösterilen hiçbir sayıyı
  değiştirmez.
- Tarayıcı: yedi ekran Türkçe ve İngilizce arayüzde sayfa hatası olmadan açıldı; T1.3 tarayıcıda yeniden koşuldu ve ön
  hesapla aynı sonucu verdi (wander el 6,96 / xel 6,57 µrad RMS, P99 17,40 µrad, OK).

## Bilinen eksikler

- Arayüz 14.1'in kaynağı (çeviri araçları `i18n/`, dil menüsü, Hakkında kutusu) bu depoda yok; `mast_los/` arayüz 14.0'ı
  derler. Fizik motoru, ön hesap ve test tanımları iki sürümde aynıdır.
- Kılavuzlardaki formüller LaTeX kaynak metni olarak (eş aralıklı bloklarda) durur, dizilmiş denklem değildir.
- Modelin sınırları ve açık konular: kılavuz §15 ve HANDOFF §6.

## Lisans

Proje kodu: MIT ([`LICENSE`](LICENSE)), © 2026 S.ÖCAL. Üçüncü taraf bileşenler (three.js r128 — MIT; gömülü Barlow Semi
Condensed, IBM Plex Sans, IBM Plex Mono yazı tipleri — SIL OFL 1.1): [`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt).

---

## English

A physics-based digital twin of an optronic mast line-of-sight (LOS) jitter test campaign: a two-axis stabilized
optronic head on a hexapod, looking into a collimator on a separate seismic block, simulated in the time domain at
2–4 kHz. It covers 28 tests (T0.1…T4.2 + T1.9), a jitter budget, an operational decomposition and project LOS residual
requirements for two platforms (submarine mast, ship-mast EO director).

- **Run it:** open `LOS Stabilizasyonu Sanal Test Düzeneği.html` in a browser; switch to English from the ⋮ menu (top
  right). The 3D rig view loads three.js r128 from cdnjs and needs an internet connection.
- **Read the guide:** `LOS Stabilization Virtual Test Rig — Technical User and Verification Guide.docx`.
- **Source:** `mast_los/` (engine v13.18, UI 14.0). The UI 14.1 source (translation tooling, language menu) is not
  included; the engine, precomputed results and test definitions are byte-identical between 14.0 and 14.1.
- The simulation is verified (74-check V&V suite) but not validated against real measurements; example DUT values are
  not measured values of a real product.

License: MIT for the project code; third-party notices in `THIRD_PARTY_NOTICES.txt`.
