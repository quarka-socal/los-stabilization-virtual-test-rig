#!/usr/bin/env python3
# §11 K seçenekleri için: T0.6 bias kararsızlığı kestiriminin kayıt süresine ve yönteme göre dağılımı (bağımsız numpy Monte Carlo;
# model gyro_ref.py ile aynı). Yöntem A: T0.6 tanımı, min σ(τ) / 0,664. Yöntem B: IEEE Std 952 Ek C tarzı ağırlıklı en küçük kareler,
# σ²(τ) = N²/τ + (2 ln2/π)·B² + K²·τ/3 (ağırlık: Allan varyansının göreli belirsizliği 1/√(2(K_c − 1)) ile), negatif olmayan katsayılar.
# Kabul: BI ≤ 0,05 °/h. Çıktı: gyro_ref2.json / .log
import json, math, os, sys
import numpy as np
from scipy.signal import lfilter
from scipy.optimize import nnls
H = os.path.dirname(os.path.abspath(__file__))
D2R = math.pi / 180; DEGPH = D2R / 3600; DEGPSQH = D2R / 60
fs, du = 100.0, 0.05
TCS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000]
def grid(n, tmax):
    out = []
    for t in 10 ** np.linspace(math.log10(0.02), math.log10(tmax), 46):
        m = int(round(t * fs))
        if m < 1 or 2 * m >= n: continue
        if out and out[-1][0] == m: continue
        out.append((m, m / fs))
    return out
def simulate(arw, bi, rng, n, G):
    N, B = arw * DEGPSQH, bi * DEGPH
    nu = n // 5 + 1; c = 0.60 * B; b = np.zeros(nu)
    for Tc in TCS:
        phi = math.exp(-du / Tc); q = c * math.sqrt(1 - phi * phi)
        x0 = c * rng.standard_normal(); w = q * rng.standard_normal(nu)
        y, _ = lfilter([1.0], [1.0, -phi], w, zi=[phi * x0]); b += y
    b += np.cumsum(0.0081 * B * math.sqrt(du) * rng.standard_normal(nu))
    rate = np.repeat(b, 5)[:n] + N * math.sqrt(fs) * rng.standard_normal(n)
    th = np.concatenate([[0.0], np.cumsum(rate) / fs])
    return np.array([math.sqrt(np.mean((th[2*m:] - 2*th[m:-m] + th[:-2*m]) ** 2) / (2 * T * T)) for m, T in G])
def est_min(ad, G): return ad.min() / 0.664 / DEGPH
def est_fit(ad, G, n):
    tau = np.array([T for _, T in G]); Kc = np.array([max(2, n // m) for m, _ in G])
    w = 1 / (ad ** 2 / np.sqrt(2 * (Kc - 1)))                     # 1/σ(σ²) yaklaşık
    A = np.vstack([1 / tau, np.full_like(tau, 2 * math.log(2) / math.pi), tau / 3]).T * w[:, None]
    x, _ = nnls(A, ad ** 2 * w)
    return math.sqrt(x[1]) / DEGPH
if __name__ == '__main__':
    NMC = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    HRS = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else [4, 12, 24]
    BIS = [float(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0.042, 0.05, 0.06]
    OUTF = sys.argv[4] if len(sys.argv) > 4 else 'gyro_ref2.json'
    res = []
    for hours in HRS:
        n = int(round(hours * 3600 * fs)); G = grid(n, min(3600 * hours / 4, 3600 * 6))
        for bi in BIS:
            rng = np.random.default_rng(int(1000 * hours + 1e4 * bi))
            Am, Af = [], []
            for k in range(NMC):
                ad = simulate(0.0042, bi, rng, n, G); Am.append(est_min(ad, G)); Af.append(est_fit(ad, G, n))
            Am, Af = np.array(Am), np.array(Af)
            r = dict(hours=hours, bi=bi, n=NMC, tauMax=G[-1][1], minMean=float(Am.mean()), minSd=float(Am.std(ddof=1)), minPacc=float(np.mean(Am <= 0.05)),
                     fitMean=float(Af.mean()), fitSd=float(Af.std(ddof=1)), fitPacc=float(np.mean(Af <= 0.05)))
            res.append(r)
            print(f"{hours} sa, BI {bi}: τ_max {r['tauMax']:.0f} s · min/0,664 {r['minMean']:.4f} ± {r['minSd']:.4f} (kabul %{100*r['minPacc']:.0f}) · "
                  f"model uydurma {r['fitMean']:.4f} ± {r['fitSd']:.4f} (kabul %{100*r['fitPacc']:.0f})", flush=True)
    json.dump(res, open(os.path.join(H, OUTF), 'w'), indent=1)
