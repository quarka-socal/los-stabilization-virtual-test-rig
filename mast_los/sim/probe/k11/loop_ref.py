#!/usr/bin/env python3
# §9 Örnek DUT — stabilizasyon döngüsü: bağımsız ikinci uygulama (numpy + scipy.signal). Motorun loopModel'ini kullanmaz;
# parametreleri loop_eng.json'dan okur, aynı büyüklükleri kendi kodunla hesaplar ve karşılaştırır → loop_ref.log / loop_ref.json.
#  Tasarım (sürekli) modeli: C/K = (1 + ω_i/s)² · ω_lp²/(s² + 2ζω_lp s + ω_lp²) · R(s), R = 1 + g_r·2ζ_r ω_r s/(s² + 2ζ_r ω_r s + ω_r²),
#    G = 1/(1 + s/ω_g) · 1/(1 + s/ω_c) · e^(−1,5 s T), P = s/(J s² + b s + k); K = 1/|C G P| (f_c'de).
#  Uygulanan (ayrık) model: integratörler T/(1 − z⁻¹) (geri Euler: I[n] = I[n−1] + T·e[n]), AG ve BP RBJ biquadları (scipy.signal.freqz),
#    bir periyot hesap gecikmesi z⁻¹ × ZOH (1 − e^(−sT))/(sT), akım ve gyro birinci derece sürekli, gyro ek gecikmesi e^(−sτ_g).
#  DRR = (k + jbω)/(J s² + b s + k + s·K·C_d·G_d); faz payı |L| = 1'de; kazanç payı açılmış fazın −180°'yi kestiği yerde.
import json, math, os, sys
import numpy as np
from scipy import signal
H = os.path.dirname(os.path.abspath(__file__))
cases = json.load(open(os.path.join(H, 'loop_eng.json')))

def rbj(kind, f0, fs, Q):
    w0 = 2 * math.pi * min(f0, 0.49 * fs) / fs; al = math.sin(w0) / (2 * Q); c = math.cos(w0)
    if kind == 'lp': b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    else: b = [al, 0.0, -al]          # BP, sabit 0 dB tepe
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]

def model(p):
    J, bb, kk, fc, fi = p['J'], p['b'], p['k'], p['fc'], p['fi']; ctl = p['ctl']; res = ctl['res']
    fs = ctl['fctl']; T = 1 / fs; wi = 2 * math.pi * fi; wlp = 2 * math.pi * ctl['flp']; zlp = ctl['zlp']
    wg = 2 * math.pi * p['gyro']['fbw']; wc = 2 * math.pi * p['cur']['fbw']; tg = p['gyro']['lat_ms'] * 1e-3
    wr = 2 * math.pi * p['resF']; gr = 10 ** (res['gain_dB'] / 20) - 1; zr = res['zeta']; ron = res['on']
    Pl = lambda s: s / (J * s * s + bb * s + kk)
    def Cc(w):
        s = 1j * w; r = 1 + (gr * 2 * zr * wr * s / (s * s + 2 * zr * wr * s + wr * wr) if ron else 0)
        return (1 + wi / s) ** 2 * wlp ** 2 / (s * s + 2 * zlp * wlp * s + wlp ** 2) * r
    Gc = lambda w: 1 / (1 + 1j * w / wg) / (1 + 1j * w / wc) * np.exp(-1j * w * 1.5 * T)
    wct = 2 * math.pi * fc; K = 1 / abs(Cc(wct) * Gc(wct) * Pl(1j * wct))
    blp, alp = rbj('lp', ctl['flp'], fs, 1 / (2 * zlp)); bbp, abp = rbj('bp', p['resF'], fs, 1 / (2 * zr))
    def Cd(w):
        w = np.atleast_1d(np.asarray(w, float)); z1 = np.exp(-1j * w * T)
        pi = 1 + wi * T / (1 - z1)
        _, hl = signal.freqz(blp, alp, worN=w / (2 * math.pi), fs=fs)
        r = 1 + (gr * signal.freqz(bbp, abp, worN=w / (2 * math.pi), fs=fs)[1] if ron else 0)
        return pi * pi * hl * r
    def Gd(w):
        w = np.atleast_1d(np.asarray(w, float)); s = 1j * w
        zoh = np.where(w == 0, 1, (1 - np.exp(-s * T)) / (s * T))
        return 1 / (1 + s / wg) / (1 + s / wc) * np.exp(-s * T) * zoh * np.exp(-s * tg)
    Lf = lambda w: K * Cd(w) * Gd(w) * Pl(1j * np.atleast_1d(np.asarray(w, float)))
    den = lambda w: (lambda s: J * s * s + bb * s + kk + s * K * Cd(w) * Gd(w))(1j * np.atleast_1d(np.asarray(w, float)))
    drr = lambda w: (kk + 1j * bb * np.atleast_1d(np.asarray(w, float))) / den(w)
    torque = lambda w: 1 / den(w)
    gyroN = lambda w: -K * Cd(w) / (1 + 1j * np.atleast_1d(np.asarray(w, float)) / wc) * (lambda ww: np.exp(-1j * ww * T) * np.where(ww == 0, 1, (1 - np.exp(-1j * ww * T)) / (1j * ww * T)) * np.exp(-1j * ww * tg))(np.atleast_1d(np.asarray(w, float))) / den(w)
    # kesim: |L| = 1 (log ızgarada ilk iniş + ikiye bölme)
    f = np.logspace(math.log10(0.3 * fc), math.log10(3 * fc), 4000); m = np.abs(Lf(2 * math.pi * f))
    i = int(np.argmax(m < 1)); lo, hi = f[i - 1], f[i]
    for _ in range(80):
        md = math.sqrt(lo * hi)
        if abs(Lf(2 * math.pi * md)[0]) > 1: lo = md
        else: hi = md
    fcx = math.sqrt(lo * hi); pm = 180 + math.degrees(np.angle(Lf(2 * math.pi * fcx)[0]))
    # kazanç payı: açılmış faz −180°'yi keser
    g = np.logspace(math.log10(fcx), math.log10(0.49 * fs), 20000); Lg = Lf(2 * math.pi * g); phs = np.degrees(np.unwrap(np.angle(Lg)))
    j = np.where(phs <= -180)[0]; gm, gmF = (float('inf'), None)
    if len(j):
        j = j[0]; a, b_ = g[j - 1], g[j]
        for _ in range(80):
            md = math.sqrt(a * b_); pp = np.degrees(np.unwrap(np.angle(Lf(2 * math.pi * np.array([g[j - 1], md])))))[1]
            if pp > -180: a = md
            else: b_ = md
        gmF = math.sqrt(a * b_); gm = -20 * math.log10(abs(Lf(2 * math.pi * gmF)[0]))
    ff = np.exp(np.arange(math.log(0.5), math.log(0.49 * fs), math.log(1.005))); Lw = Lf(2 * math.pi * ff); S = 1 / np.abs(1 + Lw); Tc = np.abs(Lw) * S
    return dict(K=K, fcx=fcx, pm=pm, gm=gm, gmF=gmF, Smax_dB=20 * math.log10(S.max()), fS=float(ff[S.argmax()]), Tmax_dB=20 * math.log10(Tc.max()),
                drr=lambda f: drr(2 * math.pi * f)[0], torque=lambda f: torque(2 * math.pi * f)[0], gyroN=lambda f: gyroN(2 * math.pi * f)[0], L=lambda f: Lf(2 * math.pi * f)[0])

rows, worst = [], {}
def upd(k, v):
    worst[k] = max(worst.get(k, 0), abs(v))
out = []
for c in cases:
    r = model(c['par'])
    upd('K (göreli)', r['K'] / c['K'] - 1); upd('f_kesim (göreli)', r['fcx'] / c['fcx'] - 1); upd('PM (°)', r['pm'] - c['pm'])
    if c['gmF'] is not None and r['gmF'] is not None: upd('GM (dB)', r['gm'] - c['gm']); upd('GM frekansı (göreli)', r['gmF'] / c['gmF'] - 1)
    upd('|S|max (dB; 0,5 % ızgara)', r['Smax_dB'] - c['Smax_dB'])
    for f, m, p in c['drr']:
        v = r['drr'](f); upd('DRR genlik (dB)', 20 * math.log10(abs(v)) - m); upd('DRR faz (°)', (math.degrees(np.angle(v)) - p + 180) % 360 - 180)
    for f, m in c['torque']: upd('tork yolu (dB)', 20 * math.log10(abs(r['torque'](f))) - m)
    for f, m in c['gyroN']: upd('gyro gürültü yolu (dB)', 20 * math.log10(abs(r['gyroN'](f))) - m)
    for f, re, im in c['Lpts']: v = r['L'](f); upd('L(jω) (göreli)', abs(v - complex(re, im)) / abs(complex(re, im)))
    rows.append(f"{c['nm']:<28} K {r['K']:9.3f} (motor {c['K']:9.3f})  f_kesim {r['fcx']:6.2f}/{c['fcx']:6.2f}  PM {r['pm']:6.2f}/{c['pm']:6.2f}°  GM {r['gm']:6.2f}/{c['gm']:6.2f} dB @ {r['gmF'] or 0:6.1f}  |S|max {r['Smax_dB']:5.2f}/{c['Smax_dB']:5.2f}")
    out.append(dict(nm=c['nm'], K=r['K'], fcx=r['fcx'], pm=r['pm'], gm=r['gm'], gmF=r['gmF'], Smax_dB=r['Smax_dB']))
print('\n'.join(rows)); print()
for k, v in worst.items(): print(f'en büyük fark — {k}: {v:.3g}')
json.dump(dict(rows=out, worst=worst), open(os.path.join(H, 'loop_ref.json'), 'w'), indent=1)
