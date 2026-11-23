#!/usr/bin/env python3
# §12: dalga çarpması (B2-02) — Campbell teoremiyle bağımsız beklenen RMS. Olaylar Poisson (λ), genlik Rayleigh (E[A²] = A_s²), süre
# T_p ~ U[T_min, T_max], biçim yarım sinüs; LOS = DRR(f)·taban roll'u (yanal bakışta roll → el). Döngü k11/loop_ref.py'nin bağımsız
# modelinden (dar bant kapalı ve res.f'de açık). σ² = λ·A_s²·E_Tp[∫|DRR(f)|²·|X(f;T_p)|² df] (iki taraflı).
import json, math, os
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(H, '../k11/loop_ref.py')).read().split('rows, worst = [], {}')[0]
ns = {'__file__': os.path.join(H, '../k11/loop_ref.py')}; exec(src, ns)
E = json.load(open(os.path.join(H, 'slap_eng.json'))); sl = E['env']
lam, As, T1, T2 = sl['rate'], sl['A'] * 1e-6, sl['Tmin'], sl['Tmax']
f = np.concatenate([np.linspace(1e-4, 50, 50000), np.linspace(50.001, 1000, 20000)])
def X2(f, Tp):   # |X(f)|² yarım sinüs sin(πt/T_p), 0 ≤ t ≤ T_p
    num = (2 * Tp / math.pi) * np.cos(math.pi * f * Tp); den = 1 - 4 * (f * Tp) ** 2
    out = np.where(np.abs(den) < 1e-9, (Tp / 2) ** 2, (num / np.where(np.abs(den) < 1e-9, 1, den)) ** 2); return out
res = {}
for p in E['par']:
    m = ns['model'](p['par']); D2 = np.array([abs(m['drr'](x)) ** 2 for x in f])
    Tps = np.linspace(T1, T2, 61); en = [2 * np.trapezoid(D2 * X2(f, Tp), f) for Tp in Tps]     # iki taraflı = 2 × tek taraflı
    sig = math.sqrt(lam * As * As * np.mean(en)) * 1e6
    key = 'cfg' if p['on'] else 'off'; ens = E['ens'][key]
    res[key] = dict(analytic=sig, ens_rms=ens['rmsOfRms'], ens_mean=ens['mean'], ens_sd=ens['sd'])
    print(f"{'dar bant açık (res.f)' if p['on'] else 'dar bant kapalı'}: Campbell beklenen RMS {sig:.3f} µrad ↔ 24 tohum karesel ortalama {ens['rmsOfRms']:.3f} (ortalama {ens['mean']:.3f} ± {ens['sd']:.3f}); fark {100*(ens['rmsOfRms']/sig-1):.1f} %")
json.dump(res, open(os.path.join(H, 'slap_ref.json'), 'w'), indent=1)
