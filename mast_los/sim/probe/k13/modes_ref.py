#!/usr/bin/env python3
# §11 Örnek DUT — modlar, soğutucu, gyro gürültüsü: bağımsız analitik (numpy/scipy). Motoru kullanmaz; parametreler kaynakta yazılı
# varsayılanlardan elle (dutDefaults / envDefaults / labDefaults). Döngünün gyro gürültüsü yolu için k11/loop_ref.py'nin bağımsız modeli
# (yalnız fonksiyon tanımları) kullanılır.
#  B3-02: soğutucu el A·√(1 + h2² + h3²)/√2, xel × 0,7.  T3.4: video katlanma genliği A·|sinc(π f T_int)|, küçük hareket kazancı (T0.1).
#  B3-03: optik mod g_acc·H₂(f) × özgül kuvvet (gövde ivmesi 60–400 Hz, RBJ HP·LP 2. derece, fs 4 kHz, RMS normalize).
#  B3-04: gimbal modu g_A·H₂(f) × taban açısal ivmesi ((2πf)²·θ, θ: 60–400 Hz gürültü → Osc2(1500 Hz, ζ 0,707) yumuşatma).
#  B2-05: gyro beyaz gürültüsü (tek taraflı 2N²) × |θ/n|² (k11 döngü modeli), ≥ 1 Hz.  T3.5: g·a/(2ζ) ve ayrıklaştırma (1 − 0,176 (ω dt)²).
import json, math, os
import numpy as np
from scipy import signal
H = os.path.dirname(os.path.abspath(__file__)); TAU = 2 * math.pi
fs = 4000.0
def H2(f, fn, z): w, wn = TAU * f, TAU * fn; return wn * wn / (wn * wn - w * w + 2j * z * wn * w)
def rbj(kind, f0, fs, Q=1 / math.sqrt(2)):
    w0 = TAU * f0 / fs; al = math.sin(w0) / (2 * Q); c = math.cos(w0)
    b = [(1 - c) / 2, 1 - c, (1 - c) / 2] if kind == 'lp' else [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a = [1 + al, -2 * c, 1 - al]; return np.array(b) / a[0], np.array(a) / a[0]
f = np.linspace(0.05, fs / 2 - 0.05, 400000); df = f[1] - f[0]
def shape(f1, f2):
    bh, ah = rbj('hp', f1, fs); bl, al = rbj('lp', f2, fs)
    _, hh = signal.freqz(bh, ah, worN=f, fs=fs); _, hl = signal.freqz(bl, al, worN=f, fs=fs)
    S = np.abs(hh * hl) ** 2; return S / (np.sum(S) * df)          # birim varyans
out = {}
# B3-02 / T3.4
A, h2, h3, fc, Tint = 1.982, 0.35, 0.15, 60.0, 5e-3
out['B3-02'] = dict(el=A * math.sqrt(1 + h2 ** 2 + h3 ** 2) / math.sqrt(2), xel=0.7 * A * math.sqrt(1 + h2 ** 2 + h3 ** 2) / math.sqrt(2), fund_el=A / math.sqrt(2))
W = abs(math.sin(math.pi * fc * Tint) / (math.pi * fc * Tint))
out['T3.4'] = dict(alias_el=A / math.sqrt(2) * W, W=W, corrected_el_gain1=A / math.sqrt(2), corrected_el_gain1054=A / math.sqrt(2) * 1.054, corrected_el_gain1014=A / math.sqrt(2) * 1.014)
# B3-03 (optik mod: f 120 Hz, ζ 0,02, g_acc 1,5e-6 rad/(m/s²); ivme 0,3953 m/s² RMS eksen başına, 60–400 Hz)
Sa = 0.3953 ** 2 * shape(60, 400)
def b303(fn, disc):
    Hm = np.abs(H2(f, fn, 0.02)) ** 2 * (np.maximum(0, 1 - 0.176 * (TAU * f / fs) ** 2) ** 2 if disc else 1)
    return 1.5e-6 * math.sqrt(np.sum(Hm * Sa) * df)
# B3-04 (gimbal modu: f 180 Hz, ζ 0,02, g_A 2e-7 rad/(rad/s²); açı 1,36 µrad RMS eksen başına, 60–400 Hz; Osc2 1500 Hz yumuşatma)
St = (1.36e-6) ** 2 * shape(60, 400)
def b304(fn, disc):
    Hv = np.abs(H2(f, 1500, 0.7071)) ** 2
    Hm = np.abs(H2(f, fn, 0.02)) ** 2 * (np.maximum(0, 1 - 0.176 * (TAU * f / fs) ** 2) ** 2 if disc else 1)
    return 2e-7 * math.sqrt(np.sum(Hm * (TAU * f) ** 4 * Hv * St) * df)
out['B3-03'] = {str(fn): dict(cont=b303(fn, False), disc=b303(fn, True)) for fn in [80, 120, 200]}
out['B3-04'] = {str(fn): dict(cont=b304(fn, False), disc=b304(fn, True)) for fn in [120, 180, 300]}
# T3.5
out['T3.5'] = dict(opt120=dict(cont=1.5e-6 * 1.0 / 0.04 / math.sqrt(2), disc=1.5e-6 / 0.04 / math.sqrt(2) * (1 - 0.176 * (TAU * 120 / fs) ** 2)),
                   gim180=dict(cont=2e-7 * 5 / 0.04 / math.sqrt(2), disc=2e-7 * 5 / 0.04 / math.sqrt(2) * (1 - 0.176 * (TAU * 180 / fs) ** 2)))
# B2-05: k11'in bağımsız döngü modeli
src = open(os.path.join(H, '../k11/loop_ref.py')).read().split('rows, worst = [], {}')[0]
ns = {'__file__': os.path.join(H, '../k11/loop_ref.py')}; exec(src, ns)
cases = json.load(open(os.path.join(H, '../k11/loop_eng.json')))
def b205(case, arw_dps):
    m = ns['model'](case['par']); N = arw_dps * math.pi / 180 / 60
    fq = np.exp(np.linspace(math.log(1.0), math.log(1000.0), 6000)); g = np.array([abs(m['gyroN'](x)) for x in fq])
    return math.sqrt(np.trapezoid(g ** 2 * 2 * N * N, fq)), math.sqrt(np.trapezoid(2 * N * N / (TAU * fq) ** 2, fq))
el = next(c for c in cases if c['nm'] == 'el varsayılan'); az = next(c for c in cases if c['nm'].startswith('az varsayılan'))
out['B2-05'] = dict(el=b205(el, 0.0042)[0], el_open=b205(el, 0.0042)[1], az=b205(az, 0.0042)[0], el_arw2=b205(el, 0.0084)[0])
for k, v in out.items(): print(k, json.dumps(v, ensure_ascii=False, default=lambda x: float(x)))
json.dump(out, open(os.path.join(H, 'modes_ref.json'), 'w'), indent=1)
