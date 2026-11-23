#!/usr/bin/env python3
"""Arayüz değişikliğinin fiziğe dokunmadığının bayt düzeyi kanıtı: iki derlenmiş sayfanın motor, ön hesap (PRE) ve test tanımı (TM)
bölümlerini SHA-256 ile karşılaştırır; motorun sim/engine_browser.js ile aynı olduğunu da denetler.
Kullanım: python3 testenv/ui_ident.py [eski.html=bak_ui0/mast-los.v1318.html] [yeni.html=app/dist/mast-los.html]"""
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
old = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'bak_ui0', 'mast-los.v1318.html')
new = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'app', 'dist', 'mast-los.html')
def parts(p):
    s = open(p, encoding='utf-8').read()
    return {'motor': re.findall(r'<script>\n(.*?)\n</script>', s, flags=re.S)[0],
            'PRE': re.search(r'window\.__PRE__ = (.*?);\nwindow\.__TM__', s, flags=re.S).group(1),
            'TM': re.search(r'window\.__TM__ = (.*?);\n</script>', s, flags=re.S).group(1)}
sha = lambda t: hashlib.sha256(t.encode('utf-8')).hexdigest()
a, b, bad = parts(old), parts(new), 0
for k in a:
    same = sha(a[k]) == sha(b[k]); bad += not same
    print(f'{k:6s} {len(a[k]):>9} {len(b[k]):>9} bayt  {sha(a[k])[:16]}  {sha(b[k])[:16]}  {"ÖZDEŞ" if same else "FARKLI"}')
eng = open(os.path.join(ROOT, 'sim', 'engine_browser.js'), encoding='utf-8').read().strip()
same = sha(eng) == sha(b['motor'].strip()); bad += not same
print(f'sim/engine_browser.js ↔ sayfadaki motor: {"özdeş" if same else "FARKLI"}')
print('SONUÇ:', 'fizik bölümleri bayt bayt aynı' if not bad else f'{bad} fark')
sys.exit(1 if bad else 0)
