#!/usr/bin/env python3
"""Sayfayı tek dosyada birleştirir: şablon + CSS + motor + önceden hesaplanmış veri + uygulama."""
import glob, json, os
here = os.path.dirname(os.path.abspath(__file__))
sim = os.path.join(here, '..', 'sim')
tpl = open(os.path.join(here, 'index.tpl.html'), encoding='utf-8').read()
css = open(os.path.join(here, 'style.css'), encoding='utf-8').read()
app = '\n'.join(open(p, encoding='utf-8').read() for p in sorted(glob.glob(os.path.join(here, 'js', '[0-9][0-9]_*.js'))))
eng = open(os.path.join(sim, 'engine_browser.js'), encoding='utf-8').read()
pre_path = os.path.join(here, 'pre.json')
pre = open(pre_path, encoding='utf-8').read() if os.path.exists(pre_path) else '{}'
tm = json.dumps(json.load(open(os.path.join(here, 'tm.json'), encoding='utf-8')), ensure_ascii=False)
def safe(js):
    return js.replace('</script', '<\\/script').replace('</', '<\\/') if '</' in js else js
out = (tpl.replace('/*@CSS@*/', css)
          .replace('/*@ENGINE@*/', safe(eng))
          .replace('/*@PRE@*/', safe(pre))
          .replace('/*@TM@*/', safe(tm))
          .replace('/*@APP@*/', safe(app)))
os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
dst = os.path.join(here, 'dist', 'mast-los.html')
open(dst, 'w', encoding='utf-8').write(out)
print(dst, round(len(out.encode('utf-8')) / 1024), 'KB')
