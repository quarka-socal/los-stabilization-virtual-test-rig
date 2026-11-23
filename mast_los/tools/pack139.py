#!/usr/bin/env python3
# v13.9 proje paketi: v13.8 paketinin dosya listesi güncel çalışma ağacından yeniden alınır; v13.9'da eklenen dosyalar eklenir
# (§8 kararları ve §9 stabilizasyon döngüsü: probe/k11, check34.js, run_pre139.sh, prediff139.py, pre139 günlükleri).
# Kullanım: python3 tools/pack139.py  → mast_los_v13_9_proje.zip (çalışma dizininde) ve doğrulama özeti
import zipfile, os, glob, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(ROOT, 'mast_los_v13_8_proje.zip')
OUT = os.path.join(ROOT, 'mast_los_v13_9_proje.zip')
zin = zipfile.ZipFile(OLD)
names = [n for n in zin.namelist() if not n.endswith('/')]
rel = lambda n: n[len('mast_los/'):]
missing, files = [], {}
for n in names:
    p = os.path.join(ROOT, rel(n))
    if os.path.isfile(p): files[rel(n)] = ('disk', p)
    else: files[rel(n)] = ('old', n); missing.append(rel(n))
extra = ['testenv/check34.js', 'sim/run_pre139.sh', 'sim/extra.js', 'tools/prediff139.py', 'tools/pack139.py', 'sim/engine.js', 'sim/vv.js', 'HANDOFF.md']
# k11: betikler, günlükler ve özet JSON'lar (bayrak dosyaları, dizinler ve büyük uyum çıktısı compat139_sub.json alınmaz)
skip = lambda p: p.endswith('.flag') or os.path.isdir(p) or os.path.basename(p) == 'compat139_sub.json'
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/k11/*')) if not skip(p)]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/pre139_*.log'))]
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
new = [r for r in files if r not in {rel(n) for n in names}]
print(f'{OUT}: {len(files)} dosya ({sum(1 for v in files.values() if v[0] == "disk")} güncel, {len(missing)} eski paketten: {missing[:8]}), '
      f'yeni {len(new)}: {sorted(new)[:14]}, özet uyuşmazlığı {bad}, {os.path.getsize(OUT) / 1e6:.2f} MB')
