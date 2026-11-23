#!/usr/bin/env python3
# v13.5 proje paketi: v13.4 paketinin dosya listesi güncel çalışma ağacından yeniden alınır; v13.5'te eklenen dosyalar eklenir.
# Kullanım: python3 tools/pack135.py  → mast_los_v13_5_proje.zip (çalışma dizininde) ve doğrulama özeti
import zipfile, os, glob, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(ROOT, 'mast_los_v13_4_proje.zip')
OUT = os.path.join(ROOT, 'mast_los_v13_5_proje.zip')
zin = zipfile.ZipFile(OLD)
names = [n for n in zin.namelist() if not n.endswith('/')]
rel = lambda n: n[len('mast_los/'):]
missing, files = [], {}
for n in names:
    p = os.path.join(ROOT, rel(n))
    if os.path.isfile(p): files[rel(n)] = ('disk', p)
    else: files[rel(n)] = ('old', n); missing.append(rel(n))
extra = ['sim/run_pre135.sh', 'testenv/check30.js', 'testenv/check30b.js', 'tools/pack135.py', 'sim/engine.js', 'HANDOFF.md']
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/k7/*')) if not p.endswith('.flag')]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/k6/vv135_try.log'))]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/pre135_*.log'))]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/reg135_*.log'))]
for r in extra:
    p = os.path.join(ROOT, r)
    if os.path.isfile(p) and r not in files: files[r] = ('disk', p)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for r in sorted(files):
        src, p = files[r]
        if src == 'disk': z.write(p, 'mast_los/' + r)
        else: z.writestr('mast_los/' + r, zin.read(p))
# doğrulama: arşivdeki her disk kaynaklı dosyanın özeti diskteki dosyayla aynı mı
bad = 0
with zipfile.ZipFile(OUT) as z:
    assert z.testzip() is None
    for r, (src, p) in files.items():
        if src != 'disk': continue
        if hashlib.sha256(z.read('mast_los/' + r)).hexdigest() != hashlib.sha256(open(p, 'rb').read()).hexdigest(): bad += 1
print(f'{OUT}: {len(files)} dosya ({sum(1 for v in files.values() if v[0] == "disk")} güncel, {len(missing)} eski paketten: {missing[:8]}), özet uyuşmazlığı {bad}, {os.path.getsize(OUT) / 1e6:.2f} MB')
