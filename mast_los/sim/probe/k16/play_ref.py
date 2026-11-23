# v13.14 §13 Düzenek: oynatma metriklerinin bağımsız yeniden hesabı (motorun kodu kullanılmaz; tanımlardan).
# Girdi: play_dump.json + <durum>.bin (play_dump.js). Çıktı: play_ref.json + günlük.
# Denetimler: LOS RMS / P99 (doğrusal trend, ilk 10 s atılır), hexapod tepe θ/ω/α (komuttan merkezi fark), geçerli kare oranı,
# wander (gerçek pozlama ortalaması, pencere başına doğrusal trend, kare ortalaması), jitter MTF (karelerin ortalaması) ve
# tayftan beklenen pozlama içi yayılım, dedektör eşlemesi (centroid ↔ gerçek LOS: işaret, küçük hareket kazancı), dünya
# dönüşü (Ω × LOS), alanı terk süresi, göz bebeği örtüşmesi (daire kesişimi), VIV (f_v'de sinüs uydurma ↔ DRR), darbe
# genlikleri (hexapod sınırları), sinüs (stab KAPALI'da LOS = taban açısı izdüşümü), kayma ayrışımı.
import json, math, os, sys
import numpy as np

D = os.path.dirname(os.path.abspath(__file__))
H = json.load(open(os.path.join(D, 'play_dump.json')))
OUT = {}

def load(nm):
    h = H[nm]; raw = np.fromfile(os.path.join(D, nm + '.bin'), dtype='<f8'); a = {}
    for name, off, n in h['layout']: a[name] = raw[off:off + n]
    return h, a

def detrend_lin(y, t=None):
    t = np.arange(len(y), dtype=float) if t is None else t
    A = np.vstack([t, np.ones_like(t)]).T
    c, *_ = np.linalg.lstsq(A, y, rcond=None)
    return y - A @ c, c[0]

def pct_abs(x, p):
    # en yakın sıra (üst): sıralanmış |x|'in ⌈p/100·n⌉. elemanı
    s = np.sort(np.abs(x)); k = min(len(s) - 1, max(0, int(math.ceil(p / 100 * len(s))) - 1)); return s[k]

def wander(x, per):
    n = len(x); res = []
    st = 0
    while st < n:
        en = min(n, st + per)
        if st > 0 and en - st < max(10, per / 2): break
        seg = x[st:en]
        if len(seg) >= 5:
            r, _ = detrend_lin(seg); res.append(r)
        st += per
    r = np.concatenate(res) if res else np.array([0.0])
    return math.sqrt(np.mean(r * r)), len(r)

def overlap(Dp, Dc, e):
    r, R, d = Dp / 2, Dc / 2, e
    if d <= R - r: return 1.0
    if d >= R + r: return 0.0
    a1 = r * r * math.acos((d * d + r * r - R * R) / (2 * d * r)); a2 = R * R * math.acos((d * d + R * R - r * r) / (2 * d * R))
    a3 = 0.5 * math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R))
    return (a1 + a2 - a3) / (math.pi * r * r)

def sinefit(t, y, f):
    A = np.vstack([np.sin(2 * math.pi * f * t), np.cos(2 * math.pi * f * t), t - t.mean(), np.ones_like(t)]).T
    c, *_ = np.linalg.lstsq(A, y, rcond=None)
    return math.hypot(c[0], c[1])

def welch(x, fs, nseg):
    nseg = min(nseg, len(x)); step = nseg // 2; w = np.hanning(nseg); U = (w * w).sum()
    P = None; k = 0
    for st in range(0, len(x) - nseg + 1, step):
        s = x[st:st + nseg]; s = s - s.mean(); X = np.fft.rfft(w * s); p = (np.abs(X) ** 2) / (fs * U); p[1:-1] *= 2
        P = p if P is None else P + p; k += 1
    return np.fft.rfftfreq(nseg, 1 / fs), P / k

log = []
def say(*a):
    s = ' '.join(str(x) for x in a); log.append(s); print(s)

U = 1e6
for nm in [k for k in H if k not in ('overlap',)]:
    h, a = load(nm); m = h['metrics']; me = h['meta']; o = {}
    fr = me['fRec']; T = h['opt']['T']; skip = min(10, T / 4); i0 = int(round(skip * fr)); n = me['nRec']
    t = np.arange(n) / fr
    # 1) RMS / P99
    pe, sE = detrend_lin(a['rec.opt_el'][i0:], t[i0:]); px, sX = detrend_lin(a['rec.opt_xel'][i0:], t[i0:])
    o['rms'] = [np.sqrt(np.mean(pe ** 2)), np.sqrt(np.mean(px ** 2))]; o['p99'] = [pct_abs(pe, 99), pct_abs(px, 99)]
    o['slope'] = [sE, sX]
    # 2) hexapod tepe (komut, merkezi fark)
    base = []
    for c in ('cmd_r', 'cmd_p', 'cmd_y'):
        th = a['rec.' + c]; w = (th[2:] - th[:-2]) * fr / 2; al = (th[2:] - 2 * th[1:-1] + th[:-2]) * fr * fr
        base.append([np.max(np.abs(th[1:-1])) * 180 / math.pi, np.max(np.abs(w)) * 180 / math.pi, np.max(np.abs(al)) * 180 / math.pi])
    o['base'] = base
    # 3) geçerli kare
    vv = a['vid.valid']; o['valid'] = float(np.mean(vv))
    # 4) wander (gerçek pozlama ortalaması, kesilmiş video: t ≥ skip)
    vt = a['vid.t']; sel = vt >= skip - 1e-9; Tw = min(h['P']['Tw'], (T - skip) / 2); per = max(5, int(round(Tw * me['vfps'])))
    o['wander'] = [wander(a['vid.mEl'][sel], per)[0], wander(a['vid.mXel'][sel], per)[0]]; o['Tw'] = Tw
    # 5) MTF: kare başına |E exp(iπθ/IFOV)| ortalaması (motorun oEl'i) ve tayftan pozlama içi yayılım
    o['mtf_frames'] = [float(np.mean(a['vid.oEl'][sel])), float(np.mean(a['vid.oXel'][sel]))]
    smear_sim = [math.sqrt(np.mean(a['vid.vEl'][sel])), math.sqrt(np.mean(a['vid.vXel'][sel]))]
    f, PE = welch(pe, fr, 16384); _, PX = welch(px, fr, 16384); df = f[1] - f[0]; tau = me['Tint']; dts = 1 / me['fs']
    nS = max(1, int(round(tau * me['fs'])))
    def intra(P):
        cont = np.sum(P * (1 - np.sinc(f * tau) ** 2)) * df          # sürekli pozlama
        # nS örnekli ayrık pozlama: örneklerin ortalaması etrafındaki varyans; tek örnekte 0
        if nS == 1: disc = 0.0
        else:
            k = np.arange(nS); hsum = np.zeros_like(f)
            for i in range(nS):
                for j in range(nS): hsum = hsum + np.cos(2 * math.pi * f * (i - j) * dts)
            disc = np.sum(P * (1 - hsum / nS ** 2)) * df
        return math.sqrt(max(cont, 0)), math.sqrt(max(disc, 0))
    o['smear'] = {'sim': smear_sim, 'psd_cont': [intra(PE)[0], intra(PX)[0]], 'psd_disc': [intra(PE)[1], intra(PX)[1]], 'nS': nS, 'tau': tau}
    IF = me['IFOV']; g = lambda s: math.exp(-math.pi ** 2 * s * s / (2 * IF * IF))
    o['mtf_gauss'] = {'sim': [g(s) for s in smear_sim], 'cont': [g(s) for s in o['smear']['psd_cont']]}
    # 6) dedektör eşlemesi: (y − y0)·IFOV_t ↔ gerçek el (kare ortalaması), x ↔ xel; yalnız geçerli kareler
    ok = vv > 0.5
    if ok.sum() > 20:
        IFt = me['IFOVt']; ye = (a['vid.y'][ok] - me['vy0']) * IFt; xe = (a['vid.x'][ok] - me['vx0']) * IFt
        ge = np.polyfit(a['vid.mEl'][ok], ye, 1); gx = np.polyfit(a['vid.mXel'][ok], xe, 1)
        o['map'] = {'gainEl': ge[0], 'gainXel': gx[0], 'corrEl': float(np.corrcoef(a['vid.mEl'][ok], ye)[0, 1]), 'corrXel': float(np.corrcoef(a['vid.mXel'][ok], xe)[0, 1]),
                    'residEl': float(np.std(ye - np.polyval(ge, a['vid.mEl'][ok]))), 'residXel': float(np.std(xe - np.polyval(gx, a['vid.mXel'][ok])))}
    # 7) kayma ayrışımı (aynı pencerede eğim)
    if 'rec.dr_e_el' in a:
        sl = lambda c: detrend_lin(a['rec.' + c][i0:], t[i0:])[1]
        o['drift'] = {'earth': [sl('dr_e_el'), sl('dr_e_xel')], 'bias': [sl('dr_b_el'), sl('dr_b_xel')]}
        o['drift']['rest'] = [o['slope'][0] - o['drift']['earth'][0] - o['drift']['bias'][0], o['slope'][1] - o['drift']['earth'][1] - o['drift']['bias'][1]]
    # 8) VIV
    if 'drr' in h:
        f_v = m['viv']['f']; j0 = int(round(max(skip, 5 if h['opt']['kind'] == 'viv' else 9) * fr))
        A_el = sinefit(t[j0:], a['rec.opt_el'][j0:], f_v) / math.sqrt(2); A_x = sinefit(t[j0:], a['rec.opt_xel'][j0:], f_v) / math.sqrt(2)
        bR = sinefit(t[j0:], a['rec.cmd_r'][j0:], f_v) / math.sqrt(2); bP = sinefit(t[j0:], a['rec.cmd_p'][j0:], f_v) / math.sqrt(2)
        o['viv'] = {'losEl': A_el, 'losXel': A_x, 'cmdR': bR, 'cmdP': bP, 'drr': h['drr'], 'drrDb': 20 * math.log10(h['drr']), 'ratioDb': 20 * math.log10(max(A_el, A_x) / m['viv']['base']) if m['viv']['base'] > 0 else None}
    # 9) sinüs: stab KAPALI'da LOS ≈ taban açısının LOS'a izdüşümü (a0 = 90°, e0 = 0: roll → el, yaw → xel)
    if h['opt']['kind'] == 'sine':
        j0 = int(round(5 * fr)); f0 = 0.125
        o['sine'] = {'cmdR': sinefit(t[j0:], a['rec.cmd_r'][j0:], f0), 'baseR': sinefit(t[j0:], a['rec.base_r'][j0:], f0), 'losEl': sinefit(t[j0:], a['rec.opt_el'][j0:], f0),
                     'sign': float(np.sign(np.dot(a['rec.opt_el'][j0:] - a['rec.opt_el'][j0:].mean(), a['rec.base_r'][j0:] - a['rec.base_r'][j0:].mean())))}
    # 10) darbe: komut tepesi ↔ 0,9·sınır
    if h['opt']['kind'] == 'slap':
        hx = h['P']['hex']; lim = []
        for Tp in (0.05, 0.1, 0.2):
            A = min(hx['theta_max'], hx['omega_max'] * Tp / math.pi, hx['alpha_max'] * (Tp / math.pi) ** 2) * 0.9
            lim.append([Tp, A, A * math.pi / Tp, A * (math.pi / Tp) ** 2])
        o['slapLim'] = lim
    # 11) göz bebeği: 50 Hz dizisinden en büyük kayma ve örtüşme yeniden (ölçü: eMax ↔ eFree)
    G = h['P']['coll']; j0p = int(round(min(10, T / 4) * 50)); ph = a['p50.pup_h'][j0p:]; pv = a['p50.pup_v'][j0p:]
    o['pupil'] = {'hMax': float(np.max(np.abs(ph))), 'vMax': float(np.max(np.abs(pv))), 'eFree_ref': (G['Dc'] / G['k'] - G['Dp']) / 2, 'ovMinRef': min(overlap(G['Dp'], G['Dc'], math.hypot(x, y)) for x, y in zip(ph, pv))}
    OUT[nm] = o
    # günlük
    say(f"== {nm} ({h['plat']}, {h['opt']})")
    say(f"  RMS el/xel  ref {o['rms'][0]*U:.4f} / {o['rms'][1]*U:.4f}  motor {m['rmsEl']*U:.4f} / {m['rmsXel']*U:.4f} µrad;  P99 ref {o['p99'][0]*U:.3f} / {o['p99'][1]*U:.3f}  motor {m['p99El']*U:.3f} / {m['p99Xel']*U:.3f}")
    say(f"  eğim ref {o['slope'][0]*U:.4f} / {o['slope'][1]*U:.4f}  motor {m['slopeEl']*U:.4f} / {m['slopeXel']*U:.4f} µrad/s;  geçerli kare ref {o['valid']:.4f} motor {m['validFrac']:.4f}")
    say(f"  hexapod tepe (roll/pitch/yaw θ ω α) ref {[[round(v,3) for v in b] for b in base]}  motor {[[round(b['th'],3), round(b['om'],3), round(b['al'],2)] for b in m['base']]}")
    if m['wanderEl'] is not None: say(f"  wander ({Tw:.0f} s) ref {o['wander'][0]*U:.4f} / {o['wander'][1]*U:.4f}  motor {m['wanderEl']*U:.4f} / {m['wanderXel']*U:.4f} µrad")
    say(f"  MTF@Nyq kareler ref {o['mtf_frames'][0]:.5f} / {o['mtf_frames'][1]:.5f}  motor {m['mtfEl']:.5f} / {m['mtfXel']:.5f};  pozlama içi σ (τ {tau*1e3:.2f} ms, {nS} örnek): benzetim {smear_sim[0]*U:.3f} / {smear_sim[1]*U:.3f}, tayf ayrık {o['smear']['psd_disc'][0]*U:.3f} / {o['smear']['psd_disc'][1]*U:.3f}, tayf sürekli {o['smear']['psd_cont'][0]*U:.3f} / {o['smear']['psd_cont'][1]*U:.3f} µrad")
    say(f"  MTF Gauss: benzetim yayılımından {o['mtf_gauss']['sim'][0]:.5f} / {o['mtf_gauss']['sim'][1]:.5f}, sürekli pozlamadan {o['mtf_gauss']['cont'][0]:.5f} / {o['mtf_gauss']['cont'][1]:.5f}")
    if 'map' in o: say(f"  dedektör eşlemesi: kazanç el {o['map']['gainEl']:.4f} xel {o['map']['gainXel']:.4f}, korelasyon {o['map']['corrEl']:.5f} / {o['map']['corrXel']:.5f}, artık {o['map']['residEl']*U:.3f} / {o['map']['residXel']*U:.3f} µrad")
    if 'drift' in o and 'drift' in m: say(f"  kayma ayrışımı ref dünya {o['drift']['earth'][0]*U:.4f}/{o['drift']['earth'][1]*U:.4f} bias {o['drift']['bias'][0]*U:.4f}/{o['drift']['bias'][1]*U:.4f} kalan {o['drift']['rest'][0]*U:.4f}/{o['drift']['rest'][1]*U:.4f};  motor {m['drift']['earthEl']*U:.4f}/{m['drift']['earthXel']*U:.4f} {m['drift']['biasEl']*U:.4f}/{m['drift']['biasXel']*U:.4f} {m['drift']['restEl']*U:.4f}/{m['drift']['restXel']*U:.4f}")
    if 'viv' in o: say(f"  VIV f {m['viv']['f']} Hz: LOS el/xel ref {o['viv']['losEl']*U:.4f}/{o['viv']['losXel']*U:.4f} motor {m['viv']['los']*U:.4f}/{m['viv']['losXel']*U:.4f}; taban motor {m['viv']['base']*U:.1f} (komut roll/pitch ref {o['viv']['cmdR']*U:.1f}/{o['viv']['cmdP']*U:.1f}); oran {o['viv']['ratioDb']} dB ↔ döngü DRR {o['viv']['drrDb']:.2f} dB")
    if 'sine' in o: say(f"  sinüs 0,125 Hz: komut roll {o['sine']['cmdR']*180/math.pi:.4f}°, taban {o['sine']['baseR']*180/math.pi:.4f}°, LOS el {o['sine']['losEl']*U:.3f} µrad (oran {o['sine']['losEl']/o['sine']['baseR']:.4e}), işaret {o['sine']['sign']}")
    if 'slapLim' in o: say(f"  darbe sınırları (T_p, A°, ω°/s, α°/s²): {[[round(v,3) for v in r] for r in o['slapLim']]}")
    say(f"  göz bebeği ref yatay/düşey tepe {o['pupil']['hMax']*1e3:.3f}/{o['pupil']['vMax']*1e3:.3f} mm, en düşük örtüşme {o['pupil']['ovMinRef']:.5f}; motor {m['pupil']['hMax']*1e3:.3f}/{m['pupil']['vMax']*1e3:.3f} mm, eMax {m['pupil']['eMax']*1e3:.3f} (sınır {m['pupil']['eFree']*1e3:.3f} ↔ ref {o['pupil']['eFree_ref']*1e3:.3f}), örtüşme {m['pupil']['ovMin']:.5f}")

# göz bebeği örtüşmesi: daire kesişimi
say('== örtüşme (D_p, D_c, e → motor ↔ ref)')
OUT['overlap'] = []
for Dp, Dc, e, v in H['overlap']:
    r = overlap(Dp, Dc, e); OUT['overlap'].append([Dp, Dc, e, v, r]); say(f"  {Dp} {Dc} {e}: {v:.6f} ↔ {r:.6f}")

# dünya dönüşü: Ω × LOS (yerel düzlem K, D, Y), kompanzasyonsuz kayma ve alanı terk süresi
for nm in ('still_nocomp', 'still_on'):
    h = H[nm]; E = h['P']['earth']; es = h['es']; Om = E['Omega']; lat = math.radians(E['lat']); az = math.radians(E['az']); el = math.radians(E['el'])
    # sağ elli ENU (D, K, Y); az kuzeyden saat yönünde. (K, D, Y) sol ellidir — çapraz çarpımda işaret ters çıkar.
    Wv = Om * np.array([0, math.cos(lat), math.sin(lat)])
    l = np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])
    dl = -np.cross(Wv, l)                                                    # eylemsiz sabit LOS'un laboratuvara göre hızı
    # +el: yukarı; +xel: yukarıdan bakınca saat yönünün tersi (azimut azalır; motorun "iskele +" yönü)
    u_el = np.array([-math.sin(el) * math.sin(az), -math.sin(el) * math.cos(az), math.cos(el)]); u_h = np.array([-math.cos(az), math.sin(az), 0])
    v_el, v_h = float(dl @ u_el), float(dl @ u_h)
    d = H[nm]['P']; me = h['meta']; IFt = me['IFOVt']; Nh, Nv = d['Nh'], d['Nv']; x0, y0 = d['video']['x0'], d['video']['y0']
    say(f"== dünya dönüşü ({nm}, enlem {E['lat']}°, az {E['az']}°, el {E['el']}°, komp {E['comp']}): Ω×LOS düşey {v_el*U:.3f}, yatay {v_h*U:.3f} µrad/s (|·| {math.hypot(v_el, v_h)*U:.3f}); Ω·δ = {Om*math.radians(E['delta_deg'])*U:.4f}")
    say(f"   motor earthSheet: {json.dumps({k: es[k] for k in es if not isinstance(es[k], dict)})[:400]}; off {json.dumps(es.get('off'))[:300]}; on {json.dumps(es.get('on'))[:300]}")
    m = h['metrics']; o = OUT[nm]
    say(f"   oynatma eğimi el/xel {m['slopeEl']*U:.3f}/{m['slopeXel']*U:.3f} µrad/s; dünya payı (dr_e) {o['drift']['earth'][0]*U:.3f}/{o['drift']['earth'][1]*U:.3f}")
    # alanı terk: hedef dedektörde LOS kaymasının tersine değil, kendisiyle aynı yönde (y ↔ +el, x ↔ +xel); kenar payı yok sayılır
    def tex(v, N, c0):
        if abs(v) < 1e-15: return float('inf')
        return ((N / 2 - c0 * np.sign(v)) * IFt) / abs(v)
    say(f"   alanı terk (ref, kenar payısız): düşey {tex(m['slopeEl'], Nv, y0):.0f} s, yatay {tex(m['slopeXel'], Nh, x0):.0f} s; motor çıkış {h['earth']['exit']:.0f} s")
    OUT['earth_' + nm] = {'v_el': v_el, 'v_h': v_h}

json.dump(OUT, open(os.path.join(D, 'play_ref.json'), 'w'), default=float)
open(os.path.join(D, 'play_ref.log'), 'w').write('\n'.join(log) + '\n')
