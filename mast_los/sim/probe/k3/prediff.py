#!/usr/bin/env python3
"""v13 (bak_v13/pre.json) ↔ v13.1 (app/pre.json): durum değişiklikleri ve fill/num alanlarındaki göreli farklar (iki platform),
işletme satırları. Çıktı: özet metin."""
import json, sys, math
old = json.load(open(sys.argv[1], encoding='utf8')); new = json.load(open(sys.argv[2], encoding='utf8'))
def flat(o, p=''):
    out = {}
    if isinstance(o, dict):
        for k, v in o.items(): out.update(flat(v, f'{p}.{k}' if p else k))
    elif isinstance(o, list) and len(o) <= 12 and all(isinstance(x, (int, float)) for x in o):
        for i, v in enumerate(o): out[f'{p}[{i}]'] = v
    elif isinstance(o, (int, float)) and not isinstance(o, bool):
        out[p] = o
    return out
for plat, O, N in [('denizaltı', old, new), ('gemi', old.get('ship', {}), new.get('ship', {}))]:
    print(f'===== {plat}')
    st = []
    for tid in sorted(set(O.get('tests', {})) | set(N.get('tests', {}))):
        a, b = O['tests'].get(tid, {}), N['tests'].get(tid, {})
        if a.get('status') != b.get('status'): st.append(f'{tid}: {a.get("status")} → {b.get("status")}')
    print('durum değişikliği:', st or 'yok')
    for tid in sorted(N.get('tests', {})):
        a, b = O['tests'].get(tid, {}), N['tests'][tid]
        fa, fb = flat(a.get('fill', {})), flat(b.get('fill', {}))
        d = []
        for k in sorted(set(fa) | set(fb)):
            x, y = fa.get(k), fb.get(k)
            if x is None or y is None: d.append(f'{k}: {x} → {y}'); continue
            if x != y:
                r = abs(y - x) / max(abs(x), 1e-30)
                if r > 1e-9: d.append(f'{k}: {x:.6g} → {y:.6g} ({r*100:+.2f}%)' if abs(x) > 1e-30 else f'{k}: {x} → {y}')
        same_meas = a.get('measured') == b.get('measured')
        if d or not same_meas:
            print(f'  {tid} [{b.get("status")}]', '; '.join(d[:6]) if d else '(fill aynı)', '' if same_meas else '| ölçüm metni değişti')
    oa, ob = O.get('op', {}), N.get('op', {})
    if oa and ob:
        rows = []
        for rid in sorted(ob.get('rows', {})):
            x, y = oa['rows'].get(rid, {}), ob['rows'][rid]
            ex, ey = x.get('el'), y.get('el')
            if ex is None or ey is None: rows.append(f'{rid}: yeni'); continue
            if ex != ey or x.get('xel') != y.get('xel'):
                rows.append(f'{rid}: el {ex*1e6:.4f} → {ey*1e6:.4f}, xel {x.get("xel",0)*1e6:.4f} → {y.get("xel",0)*1e6:.4f} µrad')
        print('  işletme satırları:', rows or 'aynı')
        for k in ['wanderEl', 'wanderXel', 'rmsEl', 'p99El', 'eis']:
            x, y = oa.get('all', {}).get(k), ob.get('all', {}).get(k)
            if x != y: print(f'  işletme tümü {k}: {x*1e6 if x else x:.4f} → {y*1e6 if y else y:.4f} µrad')
