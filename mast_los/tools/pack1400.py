#!/usr/bin/env python3
# Arayüz 14.0 proje paketi (motor v13.18): v13.18 paketinin dosya listesi güncel çalışma ağacından yeniden alınır; arayüz 14.0'da eklenenler eklenir
# (04_overview.js, fonts.css, tools/mkfonts.py, testenv/check44.js ve ui_* betikleri + günlükleri, bak_ui0 kaynakları; fonts/ npm paketleri ve
# bak_ui0/mast-los.v1318.html alınmaz — ikincisi v13.18 paketindeki app/dist/mast-los.html ile aynıdır).
# Kullanım: python3 tools/pack1400.py  → mast_los_ui14_0_proje.zip (çalışma dizininde) ve doğrulama özeti
import zipfile, os, glob, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = os.path.join(ROOT, 'mast_los_v13_18_proje.zip')
OUT = os.path.join(ROOT, 'mast_los_ui14_0_proje.zip')
zin = zipfile.ZipFile(OLD)
names = [n for n in zin.namelist() if not n.endswith('/')]
rel = lambda n: n[len('mast_los/'):]
missing, files = [], {}
for n in names:
    p = os.path.join(ROOT, rel(n))
    if os.path.isfile(p): files[rel(n)] = ('disk', p)
    else: files[rel(n)] = ('old', n); missing.append(rel(n))
extra = ['HANDOFF.md', 'app/fonts.css', 'app/js/04_overview.js', 'app/build.py', 'app/index.tpl.html', 'app/style.css', 'tools/mkfonts.py', 'tools/pack1400.py',
         'testenv/check44.js', 'testenv/check44_ui14.log', 'testenv/check24_ui14.log', 'testenv/ui_numbers2.js', 'testenv/ui_cmp.py', 'testenv/ui_ident.py',
         'testenv/ui_shots.js', 'testenv/ui_shots2.js', 'testenv/ui_scroll.js', 'testenv/ui_num_old.json', 'testenv/ui_num_new.json', 'testenv/ui_ident_ui14.log',
         'testenv/ui_cmp_ui14.log', 'testenv/mk.sh']
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'app/js/*.js'))]
extra += [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'bak_ui0/**/*'), recursive=True) if os.path.isfile(p) and not p.endswith('.html')]
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
