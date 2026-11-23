#!/usr/bin/env python3
# v13.18 proje paketi: v13.16 paketinin dosya listesi güncel çalışma ağacından yeniden alınır; v13.14'te eklenen dosyalar eklenir
# (v13.17–18: §14 kararları ve §15 — probe/k18 (regresyon tabanı pre_v1317_base.json hariç), seeds_adapt.js ve seeds_adapt_<k>.json, check42.js, check43.js, err43.js, pack1318.py).
# Kullanım: python3 tools/pack1318.py  → mast_los_v13_18_proje.zip (çalışma dizininde) ve doğrulama özeti
import zipfile, os, glob, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(ROOT, 'mast_los_v13_16_proje.zip')
OUT = os.path.join(ROOT, 'mast_los_v13_18_proje.zip')
zin = zipfile.ZipFile(OLD)
names = [n for n in zin.namelist() if not n.endswith('/')]
rel = lambda n: n[len('mast_los/'):]
missing, files = [], {}
for n in names:
    p = os.path.join(ROOT, rel(n))
    if os.path.isfile(p): files[rel(n)] = ('disk', p)
    else: files[rel(n)] = ('old', n); missing.append(rel(n))
extra = ['testenv/check42.js', 'testenv/check43.js', 'testenv/err43.js', 'testenv/check42_v1317.log', 'testenv/check43_v1318.log', 'testenv/check24_v1317.log', 'testenv/check24_v1318.log', 'sim/seeds_adapt.js', 'sim/vv.json', 'sim/src/07_budget.js', 'app/js/04_campaign.js', 'app/js/08_req.js', 'app/js/08_method.js', 'testenv/check39.js', 'testenv/check40.js', 'testenv/check41.js', 'testenv/req_w.js', 'testenv/check24_v1316.log', 'testenv/check40_v1315.log', 'testenv/check41_v1316.log', 'testenv/mk.sh', 'sim/run_pre1315.sh', 'sim/vv_seeds_agg.js', 'sim/seeds.json', 'sim/precompute.js', 'sim/extra.js', 'sim/src/exports.txt', 'tools/pack1318.py', 'sim/engine.js', 'sim/vv.js', 'HANDOFF.md']
# k11 (v13.10'da eklenenler dahil) ve k12: betikler, günlükler ve özet JSON'lar (bayrak dosyaları, dizinler ve büyük uyum çıktısı compat139_sub.json alınmaz)
skip = lambda p: p.endswith('.flag') or p.endswith('.bin') or os.path.isdir(p) or os.path.basename(p) in ('compat139_sub.json', 'pre_v1317_base.json')
for d in ['k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18']: extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe', d, '*')) if not skip(p)]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/probe/pre1315*.log'))]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'sim/seeds_adapt_*.json'))]
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
