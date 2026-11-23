# v13.15 §14: karar kuralları ve tohum tekrarının bağımsız denetimi
#  (1) t95 ↔ scipy.stats.t.ppf(0,95, df), (2) normCdf ↔ 0,5·erfc(−z/√2), (3) koruma bandı kararı (ILAC G8: x + U ≤ R KABUL,
#  x − U > R RED, arası BELİRSİZ; U = k·√(u_stat² + (x·u_rel)²), P(uygun) = Φ((R − x)/u_c)), (4) winStats (havuzlanmış RMS, örnek sd,
#  u95 = havuzlanmış + t95(n−1)·sd/√n) ve u95'in kapsama olasılığı (Monte Carlo: 0,2–2,5 Hz bantlı Gauss süreç, 60 s pencere,
#  n = 9 pencere, 2000 deneme), (5) tohum tekrarının özetleri ham seeds_<k>.json + ön hesaptan yeniden.
import json, math, os, sys
import numpy as np
from scipy import stats
D = os.path.dirname(os.path.abspath(__file__)); SIM = os.path.join(D, '..', '..')
R = json.load(open(os.path.join(D, 'rules_dump.json'))); log = []
def say(*a): s = ' '.join(str(x) for x in a); log.append(s); print(s)
# (1)
e = [(df, v, stats.t.ppf(0.95, df)) for df, v in R['t95']]
w = max(e, key=lambda q: abs(q[1] / q[2] - 1)); w30 = max([q for q in e if q[0] <= 30], key=lambda q: abs(q[1] - q[2]))
say(f"t95: 1–30 tablo en büyük fark {abs(w30[1]-w30[2]):.4f} (df {w30[0]}); 1–200 en büyük göreli fark {100*abs(w[1]/w[2]-1):.3f} % (df {w[0]}: {w[1]:.4f} ↔ {w[2]:.4f})")
# (2)
m = max(abs(v - 0.5 * math.erfc(-z / math.sqrt(2))) for z, v in R['ncdf']); mr = max(abs(v / (0.5 * math.erfc(-z / math.sqrt(2))) - 1) for z, v in R['ncdf'] if z < 0)
say(f"normCdf: −9…9 en büyük mutlak fark {m:.2e}, kuyrukta (z < 0) en büyük göreli fark {mr:.2e}")
# (3)
for q in R['guard']:
    x, Rr, us, rel = q['x'], q['R'], q['uStat'], q['rel']; k = 2; ur = math.sqrt(sum(r * r for r in rel)); uc = math.sqrt(us * us + (x * ur) ** 2); U = k * uc
    v = 'KABUL' if x + U <= Rr else ('RED' if x - U > Rr else 'BELİRSİZ'); p = stats.norm.cdf((Rr - x) / uc) if uc > 0 else (1.0 if x <= Rr else 0.0)
    g = q['g']; say(f"koruma bandı x {x} R {Rr} u {us} rel {rel}: ref {v} U {U:.4f} P {p:.4f} ↔ motor {g['verdict']} U {g['U']:.4f} P {g['pConf']:.4f}")
# (4)
for q in R['win']:
    v = np.array(q['v']); n = len(v); pooled = math.sqrt(np.mean(v * v)); sd = v.std(ddof=1) if n > 1 else 0.0
    u95 = pooled + stats.t.ppf(0.95, n - 1) * sd / math.sqrt(n) if n > 1 else pooled; s = q['s']
    say(f"winStats n {n}: havuzlanmış {pooled:.5f} ↔ {s['pooled']:.5f}, sd {sd:.5f} ↔ {s['sd']:.5f}, u95 {u95:.5f} ↔ {s['u95']:.5f}, en kötü {v.max()} ↔ {s['worst']}")
rng = np.random.default_rng(14); fs = 50.0; Tw = 60; nW = 9; N = int(Tw * fs * nW); hits = {'u95': 0, 'pooled': 0, 'worst': 0}; trials = 2000
f = np.fft.rfftfreq(N, 1 / fs); H = ((f >= 0.2) & (f <= 2.5)).astype(float)
sig_true = None
for i in range(trials):
    X = (rng.standard_normal(len(f)) + 1j * rng.standard_normal(len(f))) * H; x = np.fft.irfft(X, N)
    if sig_true is None: sig_true = 1.0
    x = x / math.sqrt(np.sum(H) / len(f) * 2 / N * 0 + 1)        # ölçek sonradan
    wins = []
    for k in range(nW):
        seg = x[k * Tw * int(fs):(k + 1) * Tw * int(fs)]; t = np.arange(len(seg)); c = np.polyfit(t, seg, 1); r = seg - np.polyval(c, t); wins.append(math.sqrt(np.mean(r * r)))
    if i == 0: allw = []
    allw.append(wins)
allw = np.array(allw)
true_sigma = math.sqrt(np.mean(allw ** 2))          # topluluk RMS'i (gerçek σ'nın kestirimi, trend çıkarılmış ölçüt)
for row in allw:
    n = len(row); pooled = math.sqrt(np.mean(row * row)); sd = row.std(ddof=1); u95 = pooled + stats.t.ppf(0.95, n - 1) * sd / math.sqrt(n)
    hits['u95'] += u95 >= true_sigma; hits['pooled'] += pooled >= true_sigma; hits['worst'] += row.max() >= true_sigma
say(f"u95 kapsama (0,2–2,5 Hz, {nW} × {Tw} s, {trials} deneme): P(u95 ≥ σ) {hits['u95']/trials:.3f}, P(havuzlanmış ≥ σ) {hits['pooled']/trials:.3f}, P(en kötü ≥ σ) {hits['worst']/trials:.3f}; pencere RMS'lerinin topluluk CV'si {np.std(allw)/np.mean(allw):.3f}")
# (5) tohum tekrarı
pre = json.load(open(os.path.join(SIM, '..', 'app', 'pre.json'))); S = pre['seeds']
runs = [{'tests': {i: {'status': r['status'], 'fill': r.get('fill') or {}} for i, r in pre['tests'].items()}, 'op': {'rows': pre['op']['rows'], 'all': pre['op']['all']}}]
for k in sorted(int(f[6:-5]) for f in os.listdir(SIM) if f.startswith('seeds_') and f.endswith('.json')):
    runs.append(json.load(open(os.path.join(SIM, f'seeds_{k}.json'))))
def st(v):
    a = [x for x in v if x is not None and math.isfinite(x)]
    if not a: return None
    a = np.array(a); return {'n': len(a), 'mean': a.mean(), 'sd': a.std(ddof=1) if len(a) > 1 else 0.0, 'min': a.min(), 'max': a.max()}
bad = 0; nchk = 0; flips = []
for tid, t in S['tests'].items():
    sts = {}
    for r in runs: s_ = r['tests'][tid]['status']; sts[s_] = sts.get(s_, 0) + 1
    if sts != t['status']: bad += 1; say('  durum farkı', tid, sts, t['status'])
    if len(sts) > 1: flips.append(f"{tid} {sts}")
    for k, z in (t.get('fill') or {}).items():
        if not z: continue
        q = st([r['tests'][tid]['fill'].get(k) for r in runs]); nchk += 1
        if abs(q['mean'] - z['mean']) > 1e-12 * max(1, abs(z['mean'])) + 1e-15 or abs(q['sd'] - z['sd']) > 1e-9 * max(abs(z['sd']), 1e-12) + 1e-15: bad += 1; say('  dolgu farkı', tid, k, q, z)
for k, z in S['all'].items():
    q = st([r['op']['all'].get(k) for r in runs]); nchk += 1
    if abs(q['mean'] - z['mean']) > 1e-15 + 1e-12 * abs(z['mean']): bad += 1; say('  op.all farkı', k)
say(f"tohum tekrarı ({len(runs)} gerçekleşme): {len(S['tests'])} test durumu + {nchk} özet yeniden hesaplandı, fark {bad}; kararı değişen testler: {flips}")
json.dump({'log': log}, open(os.path.join(D, 'rules_ref.json'), 'w'))
open(os.path.join(D, 'rules_ref.log'), 'w').write('\n'.join(log) + '\n')
