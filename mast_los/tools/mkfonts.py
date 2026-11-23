#!/usr/bin/env python3
"""Arayüz yazı tiplerini sayfaya gömer: fontsource paketlerinden (npm) seçili ağırlık ve alt kümeler → app/fonts.css (@font-face, data URI).
Barlow Semi Condensed (ekran başlıkları, panel başlıkları, göstergeler), IBM Plex Sans (metin, tablolar, Yunan harfleri), IBM Plex Mono (formüller)."""
import base64, os, re
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
F = os.path.join(root, 'fonts')
SPEC = [
    ('fontsource-barlow-semi-condensed-5.0.13', 'barlow-semi-condensed', 'Barlow Semi Condensed', [500, 600, 700], ['latin', 'latin-ext']),
    ('fontsource-ibm-plex-sans-5.0.20', 'ibm-plex-sans', 'IBM Plex Sans', [400, 500, 600], ['latin', 'latin-ext', 'greek']),
    ('fontsource-ibm-plex-mono-5.0.13', 'ibm-plex-mono', 'IBM Plex Mono', [400, 500], ['latin', 'latin-ext']),
]
out, total = ['/* gömülü yazı tipleri (SIL OFL 1.1): Barlow Semi Condensed, IBM Plex Sans, IBM Plex Mono — fontsource paketlerinden */'], 0
for pkg, slug, fam, weights, subsets in SPEC:
    for w in weights:
        css = open(os.path.join(F, pkg, 'package', f'{w}.css'), encoding='utf-8').read()
        for sub in subsets:
            m = re.search(r'/\* ' + re.escape(f'{slug}-{sub}-{w}-normal') + r' \*/.*?unicode-range: ([^;]+);', css, re.S)
            ur = m.group(1).strip()
            path = os.path.join(F, pkg, 'package', 'files', f'{slug}-{sub}-{w}-normal.woff2')
            b = open(path, 'rb').read(); total += len(b)
            out.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;src:url(data:font/woff2;base64,{base64.b64encode(b).decode()}) format('woff2');unicode-range:{ur}}}")
dst = os.path.join(root, 'app', 'fonts.css'); open(dst, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(dst, 'woff2', round(total / 1024), 'KB → css', round(os.path.getsize(dst) / 1024), 'KB')
