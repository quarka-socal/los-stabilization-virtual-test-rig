#!/usr/bin/env python3
# v13.8 ön hesabı ↔ v13.9 ön hesabı: alan alan karşılaştırma (sayılar göreli 1e-12; metinler birebir). Beklenen: T0.6 (dolgu B1-05, kv),
# işletme B1-05 cmp/cmpXel (wander penceresi), tohumların T0.6 dolgusu ve işletme B1-05 cmp'si, vv ve extra.
import json, sys, math
A = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2]))
diffs = []
def walk(a, b, p):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k in ('generated', 'elapsed'): continue
            if k not in a or k not in b: diffs.append((p + '/' + k, 'yalnız ' + ('yeni' if k in b else 'eski'))); continue
            walk(a[k], b[k], p + '/' + k)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): diffs.append((p, f'uzunluk {len(a)} → {len(b)}')); return
        for i, (x, y) in enumerate(zip(a, b)): walk(x, y, f'{p}[{i}]')
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        if a != b and not (math.isnan(a) and math.isnan(b)):
            if abs(a - b) > 1e-12 * max(abs(a), abs(b), 1e-30): diffs.append((p, f'{a!r} → {b!r}'))
    elif a != b: diffs.append((p, f'{str(a)[:90]!r} → {str(b)[:90]!r}'))
for top in ['tests', 'ctx', 'op', 'play', 'seeds', 'extra', 'sens', 't07', 'ship']:
    walk(A.get(top), B.get(top), top)
groups = {}
for p, v in diffs:
    g = '/'.join(p.split('/')[:3]); groups.setdefault(g, []).append((p, v))
print(f'FARK SAYISI {len(diffs)} ({len(groups)} grup)')
for g, items in groups.items():
    print(f'== {g}: {len(items)}')
    for p, v in items[:6]: print('   ', p, ':', v)
