#!/usr/bin/env python3
# §12 Proje LOS kalıntı gereksinimleri (v12): bağımsız analitik / Monte Carlo (numpy, scipy). Motoru kullanmaz.
#  (1) Limitlerin iç tutarlılığı: √(σ_El² + σ_Az²) ↔ σ_vek, bant paylarının karesel toplamı, Gauss varsayımında P99,73 radyal (eliptik; sayısal).
#  (2) PPV/σ dağılımı: T1.9 takip sonrası artığının bant yapısıyla (bant içinde düz PSD + ayrık tonlar) Gauss süreç, 645 s @ 2 kHz, 0,1 Hz
#      sıfır fazlı 2. derece Butterworth yüksek geçiren (ileri + geri), baştan 20 s / sondan 21 s atılır, Tw pencerelerinde doğrusal trend;
#      PPV = pencerelerin en büyük tepe-tepe değeri, oran = PPV / havuzlanmış σ. Ölçülen T1.9 oranı ve σ = sınır iken PPV'nin geçme olasılığı.
import json, math, os, sys
import numpy as np
from scipy import signal, integrate
H = os.path.dirname(os.path.abspath(__file__))
IF = 40.0
L = dict(kVec=0.10, kEl=0.0625, kAz=0.0775, kPPV=6.5, k9973=0.30, share=[0.6, 0.6, 0.48, 0.2])
out = {}
el, az, vec = L['kEl'] * IF, L['kAz'] * IF, L['kVec'] * IF
out['limits'] = dict(el=el, az=az, vec=vec, vecAxes=math.hypot(el, az), shareRss=math.sqrt(sum(s * s for s in L['share'])), ppvEl=L['kPPV'] * el, ppvAz=L['kPPV'] * az, p9973=L['k9973'] * IF)
def p_rad_le(r, s1, s2):     # P(√(x² + y²) ≤ r), x ~ N(0, s1²), y ~ N(0, s2²)
    f = lambda th: (1 - math.exp(-r * r / 2 / ((math.cos(th) / s1) ** -2 if False else 1) * ((math.cos(th) / s1) ** 2 + (math.sin(th) / s2) ** 2)))
    # yoğunluk kutupsal: ∫0^2π dθ/(2π s1 s2) · [1 − exp(−r² q/2)]/q , q = cos²/s1² + sin²/s2²
    g = lambda th: (1 - math.exp(-r * r * ((math.cos(th) / s1) ** 2 + (math.sin(th) / s2) ** 2) / 2)) / ((math.cos(th) / s1) ** 2 + (math.sin(th) / s2) ** 2)
    return integrate.quad(g, 0, 2 * math.pi, limit=200)[0] / (2 * math.pi * s1 * s2)
def q_rad(p, s1, s2):
    lo, hi = 0.0, 20 * max(s1, s2)
    for _ in range(80):
        m = 0.5 * (lo + hi)
        if p_rad_le(m, s1, s2) < p: lo = m
        else: hi = m
    return 0.5 * (lo + hi)
out['p9973'] = dict(at_limits=q_rad(0.9973, el, az), at_vec_circ=q_rad(0.9973, vec / math.sqrt(2), vec / math.sqrt(2)), measured_sigmas=q_rad(0.9973, 3.05, 2.51))
print('limitler:', json.dumps({k: round(v, 4) for k, v in out['limits'].items()}), '| P99,73 radyal (Gauss): σ = sınırlarda', round(out['p9973']['at_limits'], 2),
      'µrad; σ_vek eşit bölünmüş', round(out['p9973']['at_vec_circ'], 2), '; ölçülen σ (3,05 / 2,51)', round(out['p9973']['measured_sigmas'], 2), '(T1.9: 9,76)')
fs, T, skip, tail = 2000.0, 645.0, 20.0, 21.0
n = int(T * fs); fr = np.fft.rfftfreq(n, 1 / fs)
bands = [0.1, 2.5, 20, 100, 500]
def synth(rng, bandRms, tones):
    S = np.zeros_like(fr)
    for i, r in enumerate(bandRms):
        m = (fr >= bands[i]) & (fr < bands[i + 1]); S[m] = r * r / (bands[i + 1] - bands[i])
    A = np.sqrt(S * fs * n / 2) * (rng.standard_normal(len(fr)) + 1j * rng.standard_normal(len(fr))) / math.sqrt(2)
    x = np.fft.irfft(A, n)
    t = np.arange(n) / fs
    for f0, r in tones: x += r * math.sqrt(2) * np.sin(2 * math.pi * f0 * t + rng.uniform(0, 2 * math.pi))
    return x
bhp, ahp = signal.butter(2, 0.1 / (fs / 2), 'high')
def metrics(x, Tw):
    y = signal.filtfilt(bhp, ahp, x, padtype=None)[int(skip * fs): n - int(tail * fs)]
    W = int(Tw * fs); nW = len(y) // W; pp, rr = [], []
    for k in range(nW):
        e = signal.detrend(y[k * W:(k + 1) * W], type='linear'); pp.append(e.max() - e.min()); rr.append(np.sqrt(np.mean(e * e)))
    pooled = math.sqrt(np.mean(np.square(rr))); return max(pp), pooled
cases = {'El takip sonrası (T1.9 bantları + 60/120/10 Hz tonları)': ([1.60, 1.53, 1.41, 1.54], [(60, 1.40), (120, 0.51), (10.01, 0.34)], 8.92),
         'Az takip sonrası': ([1.32, 1.16, 0.99, 1.49], [(60, 0.98), (120, 0.36)], 8.84),
         'El, tonsuz Gauss': ([1.60, 1.53, 1.41, 1.54], [], None),
         'El, yalnız 0,1–2,5 Hz': ([3.0, 0, 0, 0], [], None)}
NMC = int(sys.argv[1]) if len(sys.argv) > 1 else 100
rng = np.random.default_rng(20261105); out['ppv'] = {}
for nm, (b, tn, meas) in cases.items():
    for Tw in ([60, 30, 120] if nm.startswith('El takip') else [60]):
        R = []; 
        for k in range(NMC):
            pp, s = metrics(synth(rng, b, tn), Tw); R.append(pp / s)
        R = np.array(R); pPass = float(np.mean(R <= L['kPPV']))
        out['ppv'][f'{nm} · Tw {Tw}'] = dict(mean=float(R.mean()), sd=float(R.std(ddof=1)), p05=float(np.percentile(R, 5)), p95=float(np.percentile(R, 95)), pPassAtLimit=pPass, measured=meas if Tw == 60 else None)
        print(f"{nm} · T_w {Tw} s: PPV/σ ort {R.mean():.2f} ± {R.std(ddof=1):.2f} (%5–%95 {np.percentile(R,5):.2f}–{np.percentile(R,95):.2f}); σ = sınır iken PPV ≤ 6,5·σ olasılığı %{100*pPass:.0f}" + (f"; T1.9 ölçülen {meas}" if meas and Tw == 60 else ''), flush=True)
json.dump(out, open(os.path.join(H, 'limits_ref.json'), 'w'), indent=1)
