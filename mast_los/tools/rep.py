#!/usr/bin/env python3
"""Kesin metin değiştirme: rep.py <dosya> <çiftler.json>; her çift [eski, yeni, (beklenen sayı=1)]."""
import json, sys
fn, pairs = sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8'))
s = open(fn, encoding='utf-8').read()
bad = []
for p in pairs:
    old, new = p[0], p[1]; n = p[2] if len(p) > 2 else 1
    c = s.count(old)
    if c != n: bad.append((c, n, old[:120])); continue
    s = s.replace(old, new)
if bad:
    for b in bad: print('SAYI UYMADI', b)
    sys.exit(1)
open(fn, 'w', encoding='utf-8').write(s)
print(fn, len(pairs), 'değişiklik')
