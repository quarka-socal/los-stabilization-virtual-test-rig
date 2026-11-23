#!/usr/bin/env python3
# §10 mekanik: bağımsız ikinci uygulama (k11/loop_ref.py'nin modeliyle). (1) b ve k'nın çözümü: dar bant kapalı el döngüsünde
# DRR(1/8 Hz) = −80 dB ve DRR(3 Hz) = −40 dB (az: DRR(1/12 Hz) = −80 dB ve DRR(3 Hz) = −40 dB) — K her adımda yeniden tasarlanır.
# (2) b ve k'nın DRR'a duyarlılığı (d dB / d ln). (3) J'nin etkisi: K, kesim, PM ve tork yolu |θ/T_d| (motorla karşılaştırma mech_eng.json).
import json, math, os, sys, copy
import numpy as np
from scipy.optimize import fsolve
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(H, '..', 'k11'))
import importlib.util
spec = importlib.util.spec_from_file_location('lr', os.path.join(H, '..', 'k11', 'loop_ref.py'))
src = open(os.path.join(H, '..', 'k11', 'loop_ref.py'), encoding='utf-8').read().split('rows, worst = [], {}')[0]
ns = {'__file__': os.path.join(H, '..', 'k11', 'loop_ref.py'), '__name__': 'lr'}; exec(compile(src.replace("cases = json.load(open(os.path.join(H, 'loop_eng.json')))", "cases = []"), 'loop_ref', 'exec'), ns)
model = ns['model']
E = json.load(open(os.path.join(H, 'mech_eng.json')))
out = {}
def drr_db(par, f): return 20 * math.log10(abs(model(par)['drr'](f)))
for ax, fl in [('el', 0.125), ('az', 1 / 12)]:
    par = copy.deepcopy(E['par'][ax]); par['ctl']['res']['on'] = False
    def F(x):
        p = copy.deepcopy(par); p['b'], p['k'] = math.exp(x[0]), math.exp(x[1])
        return [drr_db(p, fl) + 80, drr_db(p, 3.0) + 40]
    sol = fsolve(F, [math.log(1.0), math.log(5.0)], xtol=1e-13)
    b, k = math.exp(sol[0]), math.exp(sol[1])
    out[ax] = dict(b=b, k=k, b_eng=par['b'], k_eng=par['k'], rb=b / par['b'] - 1, rk=k / par['k'] - 1)
    # duyarlılık (dar bant açık/kapalı fark etmez: 1/8 Hz ve 3 Hz'de dar bant kapalı)
    sens = {}
    for nm in ['b', 'k']:
        for fq in [fl, 3.0]:
            p1 = copy.deepcopy(par); p1[nm] *= 1.01; p2 = copy.deepcopy(par); p2[nm] /= 1.01
            sens[f'{nm}@{fq:.4g}'] = (drr_db(p1, fq) - drr_db(p2, fq)) / (2 * math.log(1.01))
    out[ax]['sens'] = sens
    print(f"{ax}: çözüm b = {b:.6f} (motor {par['b']}), k = {k:.6f} (motor {par['k']}); göreli fark {out[ax]['rb']:.2e} / {out[ax]['rk']:.2e}")
    print('   duyarlılık d(DRR dB)/d ln: ' + ', '.join(f'{k_}: {v:.2f}' for k_, v in sens.items()))
# J ölçeklemesi: motorun değerleriyle karşılaştırma
worst = 0
for c in E['J']:
    r = model(c['par'])
    d = [abs(r['K'] / c['K'] - 1), abs(r['pm'] - c['pm']), abs(r['fcx'] / c['fcx'] - 1)] + [abs(20 * math.log10(abs(r['torque'](fq))) - v) for fq, v in c['torque']]
    worst = max(worst, max(d))
    print(f"J × {c['s']}: K {r['K']:.3f} (motor {c['K']:.3f}), kesim {r['fcx']:.3f}, PM {r['pm']:.2f}°; |θ/T_d| " + ', '.join(f"{fq} Hz {20*math.log10(abs(r['torque'](fq))):.2f} dB" for fq, _ in c['torque']))
print(f'J taraması en büyük fark (göreli / ° / dB): {worst:.2e}')
out['Jworst'] = worst
json.dump(out, open(os.path.join(H, 'mech_ref.json'), 'w'), indent=1)
