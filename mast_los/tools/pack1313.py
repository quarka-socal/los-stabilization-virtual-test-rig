#!/usr/bin/env python3
# v13.13 proje paketi: v13.12 paketinin dosya listesi güncel çalışma ağacından yeniden alınır; v13.13'te eklenen dosyalar eklenir
# (§12 kararları: probe/k15, check38.js, run_pre1313.sh, run_pre1313r.sh, pack1313.py, pre1313 günlükleri).
# Kullanım: python3 tools/pack1313.py  → mast_los_v13_13_proje.zip (çalışma dizininde) ve doğrulama özeti
import zipfile, os, glob, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(ROOT, 'mast_los_v13_12_proje.zip')
OUT = os.path.join(ROOT, 'mast_los_v13_13_proje.zip')
zin = zipfile.ZipFile(OLD)
names = [n for n in zin.namelist() if not n.endswith('/')]
rel = lambda n: n[len('mast_los/'):]
missing, files = [], {}
for n in names:
    p = os.path.join(ROOT, rel(n))
    if os.path.isfile(p): files[rel(n)] = ('disk', p)
    else: files[rel(n)] = ('old', n); missing.append(rel(n))
extra = ['testenv/check38.js', 'testenv/mk.sh', 'sim/run_pre1313.sh', 'sim/run_pre1313r.sh', 'sim/precompute.js', 'sim/extra.js', 'tools/pack1313.py', 'sim/engine.js', 'sim/vv.js', 'HANDOFF.md']
# k11 (v13.10'da eklenenler dahil) ve k12: betikler, günlükler ve özet JSON'lar (bayrak dosyaları, dizinler ve büyük uyum çıktısı compat139_sub.json alınmaz)
skip = lambda p: p.endswith('.flag') or os.path.isdir(p) or os.path.basename(p) == 'compat139_sub.json'
for d in ['k11', 'k12', 'k13', 'k14', 'k15']: extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe', d, '*')) if not skip(p)]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/pre1313*.log'))]
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
