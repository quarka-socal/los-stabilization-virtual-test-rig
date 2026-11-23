#!/usr/bin/env python3
# §11 Örnek DUT — gyro: T0.6'nın bağımsız ikinci uygulaması (numpy). Motoru kullanmaz.
#  Model (motorun tanımı, kaynak yorumundan): hız = b0 + b(t) + beyaz; beyaz ARW N (rad/√s), örnek başına N·√fs.
#  b(t): 10 birinci derece Gauss–Markov (T_c = 1, 3, 10, …, 30000 s; durağan σ = 0,60·B) toplamı + hız rastgele yürüyüşü
#  (adım başına 0,0081·B·√Δu), Δu = 0,05 s'de güncellenir, aradaki örneklerde tutulur. B: bias kararsızlığı (rad/s).
#  Kestirici (T0.6 tanımı): örtüşen Allan sapması, τ ızgarası 0,02–3600 s log 46 nokta; ARW = σ(τ≈1 s)·√τ; BI = min σ / 0,664.
#  1) analitik Allan sapması (sürekli zaman formülleri) → beklenen kestirim; 2) Monte Carlo (kendi RNG'si) → kestirimlerin dağılımı.
import json, math, os, sys
import numpy as np
from scipy.signal import lfilter
H = os.path.dirname(os.path.abspath(__file__))
D2R = math.pi / 180; DEGPH = D2R / 3600; DEGPSQH = D2R / 60
fs, hours, du = 100.0, 4, 0.05
n = int(round(hours * 3600 * fs))
taus = 10 ** np.linspace(math.log10(0.02), math.log10(3600), 46)
TCS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000]

def avar_model(tau, N, B):
    c2 = (0.60 * B) ** 2; v = N * N / tau
    for Tc in TCS:
        x = tau / Tc; v += (2 * c2 * Tc / tau) * (1 - (3 - 4 * math.exp(-x) + math.exp(-2 * x)) / (2 * x))
    K2 = (0.0081 * B) ** 2           # krw² / Δu
    return v + K2 * tau / 3

def grid():
    out = []
    for t in taus:
        m = int(round(t * fs))
        if m < 1 or 2 * m >= n: continue
        out.append((m, m / fs))
    return out
G = grid()

def estimates_from_adev(ad):
    i1 = int(np.argmin([abs(math.log(T)) for _, T in G]))
    arw = ad[i1] * math.sqrt(G[i1][1]) / DEGPSQH
    im = int(np.argmin(ad)); bi = ad[im] / 0.664 / DEGPH
    return arw, bi, G[im][1]

def analytic(arw_dps, bi_dph):
    N, B = arw_dps * DEGPSQH, bi_dph * DEGPH
    ad = np.array([math.sqrt(avar_model(T, N, B)) for _, T in G])
    return ad, estimates_from_adev(ad)

def simulate(arw_dps, bi_dph, rng):
    N, B = arw_dps * DEGPSQH, bi_dph * DEGPH
    nu = n // 5 + 1                          # Δu adımları (her 5 örnekte bir)
    c = 0.60 * B; b = np.zeros(nu)
    for Tc in TCS:
        phi = math.exp(-du / Tc); q = c * math.sqrt(1 - phi * phi)
        x0 = c * rng.standard_normal(); w = q * rng.standard_normal(nu)
        y, _ = lfilter([1.0], [1.0, -phi], w, zi=[phi * x0]); b += y
    b += np.cumsum(0.0081 * B * math.sqrt(du) * rng.standard_normal(nu))
    bias = np.repeat(b, 5)[:n]
    rate = bias + N * math.sqrt(fs) * rng.standard_normal(n)
    th = np.concatenate([[0.0], np.cumsum(rate) / fs])
    ad = []
    for m, T in G:
        v = th[2 * m:] - 2 * th[m:-m] + th[:-2 * m]
        ad.append(math.sqrt(np.mean(v * v) / (2 * T * T)))
    return np.array(ad)

if __name__ == '__main__':
    NMC = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    res = {}
    for nm, arw, bi, nmc in [('varsayılan (ARW 0,0042, BI 0,042)', 0.0042, 0.042, NMC), ('BI 0,035', 0.0042, 0.035, min(NMC, 100)), ('ARW 0,0021', 0.0021, 0.042, min(NMC, 100))]:
        ad0, (ea, eb, et) = analytic(arw, bi)
        rng = np.random.default_rng(20261104)
        A, Bv, TB, ADS = [], [], [], []
        for k in range(nmc):
            ad = simulate(arw, bi, rng); a, b_, t = estimates_from_adev(ad); A.append(a); Bv.append(b_); TB.append(t); ADS.append(ad)
        A, Bv = np.array(A), np.array(Bv); ADm = np.sqrt(np.mean(np.array(ADS) ** 2, axis=0))
        rel = float(np.max(np.abs(ADm / ad0 - 1)[:35]))      # ortalama Allan varyansı ↔ analitik (τ ≤ ≈ 300 s, MC belirsizliği küçük)
        res[nm] = dict(analytic=dict(arw=ea, bi=eb, tauB=et, adev=list(ad0 / DEGPH), floor_over_B=float(np.min(ad0) / (bi * DEGPH))),
                       mc=dict(n=nmc, arw_mean=float(A.mean()), arw_sd=float(A.std(ddof=1)), bi_mean=float(Bv.mean()), bi_sd=float(Bv.std(ddof=1)),
                               bi_p05=float(np.percentile(Bv, 5)), bi_p50=float(np.percentile(Bv, 50)), bi_p95=float(np.percentile(Bv, 95)),
                               p_bi_gt_005=float(np.mean(Bv > 0.05)), p_arw_gt_0005=float(np.mean(A > 0.005)), tauB_med=float(np.median(TB)), adev_mc_vs_analytic=rel),
                       raw=dict(arw=list(A), bi=list(Bv)))
        print(f"{nm}: analitik ARW_kestirim {ea:.5f}, BI_kestirim {eb:.4f} (taban {np.min(ad0)/(bi*DEGPH):.3f}·B @ {et:.0f} s) | MC n {nmc}: ARW {A.mean():.5f} ± {A.std(ddof=1):.5f}, "
              f"BI {Bv.mean():.4f} ± {Bv.std(ddof=1):.4f} (%5–%95 {np.percentile(Bv,5):.4f}–{np.percentile(Bv,95):.4f}), P(BI > 0,05) {100*np.mean(Bv>0.05):.1f} %, "
              f"P(ARW > 0,005) {100*np.mean(A>0.005):.1f} %, taban τ ortanca {np.median(TB):.0f} s; MC ortalama Allan ↔ analitik en büyük göreli fark {rel:.3f}")
    json.dump(res, open(os.path.join(H, 'gyro_ref.json'), 'w'))
