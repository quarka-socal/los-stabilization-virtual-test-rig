// tests_<tür>.json → değişim tablosu için kısa satırlar (kılavuz §5)
'use strict';
const fs = require('fs'), path = require('path');
const kind = process.argv[2] || 'sub';
const T = JSON.parse(fs.readFileSync(path.join(__dirname, `tests_${kind}.json`), 'utf8'));
const g = (s, re) => { const m = String(s || '').match(re); return m ? m.slice(1) : null; };
const kv = (q, re) => { const r = (q.kv || []).find(([k]) => re.test(k)); return r ? String(r[1]) : ''; };
const pu = (q) => q && q.pupil ? `${(q.pupil.eMax * 1e3).toFixed(1)} mm/%${(100 * q.pupil.ovMin).toFixed(0)}${q.pupil.ok ? '' : '✗'}` : '—';
for (const o of T) {
  const t03 = o['T0.3'], t13 = o['T1.3'], t21 = o['T2.1'], t22 = o['T2.2'], t23 = o['T2.3'], t25 = o['T2.5'], t04 = o['T0.4'];
  const w = g(t13.measured, /el ([\d.]+) \/ xel ([\d.]+) µrad RMS/), corr = g(kv(t13, /Taban düzeltmeli/), /el ([\d.]+) \/ xel ([\d.]+)/), full = g(kv(t13, /Taban düzeltmeli/), /tam düşülseydi el ([\d.]+)/);
  const share = g(kv(t13, /Masa mikro-titreşiminin video/), /el ([\d.]+) \/ xel ([\d.]+)/);
  const q = g(kv(t13, /Deniz ötelemesi/), /q = ([\d.]+)/), hx = g(kv(t13, /Hexapod tepe/), /^(.*)$/);
  const imu = g(t03.measured, /en kötüsü\) ([\d.]+) µrad/), drr = g(t21.measured, /roll→el (?:DRR ≤ )?(-?[\d.]+) dB @ ([\d.]+) Hz/), t22w = g(t22.measured, /en kötü ([\d.]+) µrad/);
  const dev = g(t23.measured, /sapma (-?[\d.]+) %/), d25 = g(t25.measured, /artık farkı ([\d.]+) µrad RMS/), dt = g(t04.measured, /f_bw'de ([\d.]+)°, kompanzasyon sonrası belirsizlik \(2σ\) ([\d.]+)°/);
  console.log(`${o.id} ${o.nm}`);
  console.log(`   T0.3 ${t03.status} IMU ${imu} µrad, ⟂ ${pu(t03)} · T0.4 ${t04.status} ${dt ? dt.join('° / ') + '°' : ''}`);
  console.log(`   T1.3 ${t13.status} wander ${w ? w.join(' / ') : '?'}; düzeltmeli ${corr ? corr.join(' / ') : '—'}${full ? ' (tam ' + full[0] + ')' : ''}; pay ${share ? share.join(' / ') : '—'}; q ${q ? q[0] : '—'}; hex ${hx ? hx[0] : ''}; ⟂ ${pu(t13)}`);
  console.log(`   T2.1 ${t21.status} ${drr ? drr[0] + ' dB @ ' + drr[1] + ' Hz' : ''} ⟂ ${pu(t21)} · T2.2 ${t22.status} ${t22w ? t22w[0] : ''} ⟂ ${pu(t22)} · T2.3 ${t23.status} ${dev ? dev[0] + ' %' : ''} ⟂ ${pu(t23)} · T2.5 ${t25.status} ${d25 ? d25[0] : ''} ⟂ ${pu(t25)}`);
  if (t13.note) console.log(`   T1.3 notu: ${String(t13.note).slice(0, 300)}`);
}
