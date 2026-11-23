#!/usr/bin/env python3
"""Eski ↔ yeni arayüz sayı karşılaştırması: test ayrıntıları birebir (çoklu küme), görünümler platform başına birleşik çoklu küme;
Model giriş değerleri. Kullanım: python3 ui_cmp.py ui_num_old.json ui_num_new.json"""
import json, sys
from collections import Counter
A = json.load(open(sys.argv[1]))['R']; B = json.load(open(sys.argv[2]))['R']
def show(c, n=30): return ', '.join(f'{k}×{v}' if v > 1 else k for k, v in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:n])
bad = 0
print('== Test ayrıntıları (iki platform × 28):')
nd = 0
for k in sorted(x for x in A if '/test/' in x):
    a, b = Counter(A[k]['nums']), Counter(B.get(k, {'nums': []})['nums'])
    miss, extra = a - b, b - a
    if miss or extra:
        nd += 1; print(f'  {k}: eksik [{show(miss)}] fazla [{show(extra)}]')
        if miss: bad += 1
print(f'  farklı ayrıntı {nd}/56')
for plat in ['sub', 'ship']:
    va = Counter(); vb = Counter()
    for k in A:
        if k.startswith(plat + '/') and '/test/' not in k: va += Counter(A[k]['nums'])
    for k in B:
        if k.startswith(plat + '/') and '/test/' not in k: vb += Counter(B[k]['nums'])
    miss, extra = va - vb, vb - va
    print(f'== {plat}: görünümler birleşik: eski {sum(va.values())}, yeni {sum(vb.values())} belirteç')
    print(f'  eksik ({sum(miss.values())}): {show(miss, 60)}')
    print(f'  fazla ({sum(extra.values())}): {show(extra, 60)}')
    if miss: bad += 1
    ia, ib = Counter(A[f'{plat}/model']['inputs']), Counter(B[f'{plat}/model']['inputs'])
    print(f'  Model girişleri: eski {sum(ia.values())}, yeni {sum(ib.values())}; eksik [{show(ia - ib)}] fazla [{show(ib - ia)}]')
    for t in ['kampanya', 'duzenek', 'butce', 'gereksinim', 'model', 'yontem']:
        a, b = Counter(A[f'{plat}/{t}']['nums']), Counter(B[f'{plat}/{t}']['nums'])
        m, e = a - b, b - a
        print(f'    {t:10s}: eski {sum(a.values()):5d} yeni {sum(b.values()):5d}  eksik {sum(m.values()):4d}  fazla {sum(e.values()):4d}')
print('SONUÇ:', 'eksik sayı var' if bad else 'eski arayüzün gösterdiği her sayı yenisinde de var')
