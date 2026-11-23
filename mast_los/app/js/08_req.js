// ---------------------------------------------------------------- proje LOS kalıntı gereksinimleri (v12)
// Laboratuvar kabulü: T1.9 (deniz profili, dış kamera takip döngüsü öncesi / sonrası, aynı tohum). İşletme: ayrıştırmanın
// tüm kaynaklar koşusu (takip öncesi) ve takip döngüsüyle ek koşusu. Geçiş (stick-slip) PPV'si: T1.6. Tanımlar Model'de.
const REQV = { charts: {} };
const u6 = (x, d) => (x == null || !isFinite(x) ? '—' : fmt(x * 1e6, d == null ? 2 : d));
function reqData() {
  const P = STATE.P, L = P.ana.los, lim = ENG.losLimits(P), k = curKey();
  const r19 = STATE.results['T1.9'], lab = r19 && r19.res && r19.res.num && r19.res.num.once ? r19.res.num : null, labFresh = !!(r19 && r19.key === k);
  const op = STATE.op && STATE.op.req ? STATE.op.req : null, opFresh = !!(STATE.op && STATE.opKey === k);
  const r16 = STATE.results['T1.6'], rev = r16 && r16.res && r16.res.num && r16.res.num.ppvRev != null ? r16.res.num : null, revFresh = !!(r16 && r16.key === k);
  return { P, L, lim, lab, labFresh, labStatus: r19 ? r19.res.status : null, op, opFresh, rev, revFresh };
}
function buildReq(root) {
  root.append(
    scrHead('Proje LOS kalıntı gereksinimleri', 'Laboratuvar kabulü T1.9, işletme ayrıştırması ve geçiş PPV T1.6. Gereksinim tablosu ve kabul tabanı Model ekranındadır.', [
      h('button', { class: 'btn primary', id: 'rqRun', type: 'button', onclick: () => runTests(['T1.6', 'T1.9'], { op: true }), html: ICON.play + '<span>T1.6, T1.9 ve işletme ayrıştırmasını koştur</span>' }),
      h('button', { class: 'btn', type: 'button', onclick: () => { showTab('model'); setTimeout(() => { const g = document.getElementById('p-ana.los.kVec'); if (g) { const d = g.closest('details'); if (d) d.open = true; g.scrollIntoView({ block: 'center' }); g.focus({ preventScroll: true }); } }, 60); } }, 'Gereksinimleri düzenle (Model)'),
      h('button', { class: 'btn', type: 'button', onclick: () => { STATE.sel = 'T1.9'; showTab('kampanya'); renderSeq(); renderDetail(); } }, 'T1.9 ayrıntısı')]),
    h('p', { class: 'lead' }, 'LOS kalıntısı, stabilizasyon döngüsü (ve varsa dış kamera takip döngüsü) işini yaptıktan sonra görüş hattının hedeften açısal sapmasıdır; görüntü çerçevesinde El ve Az (çapraz yükseliş). Her metrik aynı kalıntı serisinden, açık bir ön işlemle hesaplanır: 0,1 Hz sıfır fazlı yüksek geçiren, 60 s pencerelerde doğrusal trend. Laboratuvar ve işletme, takip döngüsü öncesi ve sonrası ayrı sütunlarda; karar sütunu seçili kabul tabanına (Model) göredir.'),
    h('div', { id: 'rqStale' }),
    h('div', { class: 'tiles', id: 'rqTiles' }),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Uygunluk özeti (µrad)'), h('span', { class: 'hint', id: 'rqBasis' })), h('div', { class: 'body tscroll', id: 'rqSum' })),
    h('div', { class: 'cols2' }, h('div', { class: 'chartbox', id: 'rqCum' }), h('div', { class: 'chartbox', id: 'rqAsd' })),
    h('div', { class: 'panel' }, tabset('rqTabs', [
      ['bant', 'PSD bantları ve tonlar', h('div', { class: 'tscroll', id: 'rqBands' })],
      ['kaynak', 'Kaynak katkıları', h('div', null, h('p', { class: 'xs muted', style: { margin: '0 0 8px' } }, 'Kaynak katkıları — işletme, takip öncesi (izole koşular)'), h('div', { class: 'tscroll', id: 'rqSrc' }))],
      ['takip', 'Dış kamera takip döngüsü', h('div', null, h('div', { class: 'chartbox', id: 'rqTrk', style: { border: 'none', padding: 0, boxShadow: 'none' } }), h('div', { id: 'rqTrkKv', style: { marginTop: '8px' } }))],
      ['tur', 'TUR ve ölçüm tabanı', h('div', null, h('p', { class: 'xs muted', style: { margin: '0 0 8px' } }, 'Doğrulanabilirlik: TUR ve gereken ölçüm tabanı'), h('div', { class: 'tscroll', id: 'rqTur' }))],
      ['tanim', 'Tanımlar ve sınırlar', h('div', null, h('p', { class: 'xs muted', style: { margin: '0 0 8px' } }, 'Gereksinim seti, tanımlar ve sınırlar'), h('div', { class: 'tscroll', id: 'rqDef' }))]])));
  renderReq();
}
const renderReqDeb = debounce(() => renderReq(), 250);
function renderReq() {
  if (!$('#rqSum')) return;
  const D = reqData(), { P, L, lim, lab, op, rev } = D;
  const dsel = (w) => (w ? ENG.decideStat(w, L.decide) : NaN);
  // bayatlık
  const st = $('#rqStale'); st.innerHTML = '';
  const staleTxt = [!lab ? 'T1.9 koşulmadı' : (!D.labFresh ? 'T1.9 önceki parametrelerle' : null), !op ? 'işletme ayrıştırması (gereksinim koşusu) yok' : (!D.opFresh ? 'işletme ayrıştırması önceki parametrelerle' : null), !rev ? 'T1.6 koşulmadı' : (!D.revFresh ? 'T1.6 önceki parametrelerle' : null)].filter(Boolean);
  if (L.on === false) st.append(noteP('Proje LOS kalıntı değerlendirmesi kapalı (Model → Proje LOS kalıntı gereksinimleri). Limitler aşağıda yine gösterilir.', 'Kapalı: '));
  else if (staleTxt.length) st.append(h('p', { class: 'small', style: { margin: '0 0 10px', padding: '8px 10px', borderRadius: '6px', background: 'var(--warn-soft)' } }, h('b', null, 'Sonuçlar güncel değil: '), staleTxt.join(' · ') + '. Sütunlar eldeki son sonuçları gösterir; limitler güncel parametrelerle.'));
  // kutucuklar
  const t = $('#rqTiles'); t.innerHTML = '';
  const basisKey = L.basis === 'once' ? 'once' : 'sonra', B = lab ? lab[basisKey] : null;
  if (lab) { const ch = lab.checks || [], nb = ch.filter(c => !c.ok).length; t.append(tileEl('Laboratuvar kabulü (T1.9)', D.labStatus || '—', '', `${ch.length - nb}/${ch.length} ölçüt sağlandı · temel: ${lab.basis === 'once' ? 'takip öncesi' : 'takip sonrası'}`)); }
  t.append(tileEl('Bütünsel RMS, laboratuvar', B ? u6(dsel(B.sVec)) : '—', 'µrad', `sınır ${u6(lim.vec)} · ${ENG.DEC_TXT[L.decide]}`, B ? dsel(B.sVec) / lim.vec : null));
  const Qop = op ? op[basisKey === 'once' ? 'pre' : 'post'] : null;
  if (Qop) { const Q = Qop; t.append(tileEl('Bütünsel RMS, işletme', u6(dsel(Q.sVec)), 'µrad', `tüm kaynaklar · ${basisKey === 'once' ? 'takip öncesi' : 'takip sonrası'}`, dsel(Q.sVec) / lim.vec)); }
  const tk = ENG.trkModel(P);
  t.append(tk.stable ? tileEl('Takip döngüsü', fmt(tk.pm, 1), '° PM', `kesim ${fmt(tk.fc, 2)} Hz · |S| tepe ${fmt(20 * Math.log10(tk.sPk), 1)} dB @ ${fmt(tk.fPk, 2)} Hz · ${fmt(tk.f0, 2)} Hz üstünde büyütür · 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz`)
    : tileEl('Takip döngüsü', 'KARARSIZ', '', `faz payı ${fmt(tk.pm, 1)}° (${ENG.derive(P).fps} fps, ${L.trk.lat_frames} kare gecikme, bant ${L.trk.bw} Hz) · 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz · takip sonrası koşulmaz`));
  t.append(tileEl('Geçiş PPV (T1.6)', rev ? u6(rev.ppvRev, 1) : '—', 'µrad', `sınır ${u6(lim.rev, 1)} (stick-slip, senkron ortalama)`, rev ? rev.ppvRev / lim.rev : null));
  const ti = ENG.turInfo(P);
  t.append(tileEl('TUR, El RMS (video)', fmt(lim.el * 1e6 / (ti.uv * ti.mult), 2), '', `σ_El için; taban ${fmt(ti.uv, 2)} µrad${ti.mult !== 1 ? ` · Z540.3 (k = ${ti.mult})` : ''} · TUR ≥ ${P.wb.TUR_target} için ≤ ${fmt(lim.el * 1e6 / (P.wb.TUR_target * ti.mult), 2)}`));
  // özet tablo
  $('#rqBasis').textContent = `karar: ${L.basis === 'once' ? 'takip öncesi' : 'takip sonrası'} (laboratuvar), σ için ${ENG.DEC_TXT[L.decide]}`;
  const cols = [['Lab, takip öncesi', lab && lab.once], ['Lab, takip sonrası', lab && lab.sonra], ['İşletme, takip öncesi', op && op.pre], ['İşletme, takip sonrası', op && op.post]];
  // v13.16: değer sınırla aynı basamağa yuvarlanıyorsa iki basamak fazla yazılır (ör. 3.9998 ≤ 4.00)
  const cell = (v, l, dd) => { const d0 = dd == null ? 2 : dd, near = l != null && isFinite(v) && v !== l && u6(v, d0) === u6(l, d0);
    return h('td', { class: 'n' + (l != null && isFinite(v) && v > l * (1 + 1e-12) ? ' over' : '') }, u6(v, near ? d0 + 2 : d0)); };
  const pairCell = (a, b, la, lb, dd) => h('td', { class: 'n' }, h('span', { class: la != null && a > la ? 'over' : '' }, u6(a, dd)), ' / ', h('span', { class: lb != null && b > lb ? 'over' : '' }, u6(b, dd)));
  const tw = (T) => (T || []).filter(q => q.band >= 0).reduce((a, q) => (!a || q.rms / q.lim > a.rms / a.lim ? q : a), null);
  // v13.16: σ satırlarında koruma bandlı karar (T1.9, karar tabanında; havuzlanmış değer ± U) — durum basit kuralla verilir
  const G = lab && lab.guard ? lab.guard : null;
  const gTxt = (lb) => { const g = lb && G ? G.find(z => z.label === lb) : null; return g ? h('span', { class: 'sub', style: { whiteSpace: 'nowrap' }, title: `koruma bandı (k = ${g.k}): ${fmt(g.x * 1e6, 3)} ± ${fmt(g.U * 1e6, 3)} µrad, sınır ${fmt(g.R * 1e6, 2)}` }, `koruma bandı ${g.verdict} · P ${fmt(g.pConf, 2)}`) : null; };
  const decideRow = (fn) => { const Bq = lab && lab[basisKey]; return Bq ? fn(Bq) : null; };
  const rows = [];
  const add = (name, lim0, fn, opt) => rows.push({ name, lim0, fn, opt: opt || {} });
  add('σ_El', lim.el, (q) => dsel(q.sEl), { g: 'σ_El' }); add('σ_Az (çapraz yükseliş)', lim.az, (q) => dsel(q.sXel), { g: 'σ_Az' }); add('σ_vek', lim.vec, (q) => dsel(q.sVec), { g: 'σ_vek' });
  add('PPV El (en kötü 60 s)', lim.ppvEl, (q) => q.ppEl, { d: 1 }); add('PPV Az', lim.ppvAz, (q) => q.ppXel, { d: 1 });
  add('P99,73 radyal (ampirik)', lim.p9973, (q) => q.p9973.rad, { d: 1 });
  add('Pozlama içi El', lim.exp, (q) => q.exp.el); add('Pozlama içi Az', lim.exp, (q) => q.exp.xel);
  const tbody = h('tbody');
  for (const r of rows) {
    const dv = decideRow(r.fn), ok = dv == null ? null : dv <= r.lim0 * (1 + 1e-12);
    tbody.append(h('tr', null, h('td', null, r.name), h('td', { class: 'n' }, '≤ ' + u6(r.lim0, r.opt.d)), ...cols.map(([, q]) => (q ? cell(r.fn(q), r.lim0, r.opt.d) : h('td', { class: 'n' }, '—'))),
      h('td', null, ok == null ? '—' : pill(ok ? 'OK' : 'AŞIM'), gTxt(r.opt.g))));
  }
  // bilgi satırları
  const infoRow = (name, fn, dd) => tbody.append(h('tr', null, h('td', { class: 'small muted' }, name), h('td', { class: 'n small muted' }, 'bilgi'), ...cols.map(([, q]) => h('td', { class: 'n small muted' }, q ? fn(q) : '—')), h('td', null, '')));
  infoRow('PPV/σ El / Az (parantezde aynı tayfta Gauss beklentisi, Rice)', (q) => `${fmt(q.rEl, 2)} / ${fmt(q.rXel, 2)}` + (q.gauss && isFinite(q.gauss.el) ? ` (${fmt(q.gauss.el, 1)} / ${fmt(q.gauss.xel, 1)})` : ''));      // v13.15: önce sabit "≈ 6–8,5"
  // v13.17 (§14 K2 c): işletmede PPV ve P99,73'ü dalga çarpmasının seyrek geçişleri belirler; aynı tohumla çarpmasız koşunun değerleri bilgi
  // olarak (laboratuvar profilinde çarpma yok; gemi direğinde kaynak yok). Pencere dışlama uygulanamaz: 60 s'de beklenen 6 olay.
  const NS = op && op.noSlap ? op.noSlap : null, nsOf = (q) => (NS && q ? (q === op.pre ? NS.pre : (q === op.post ? NS.post : null)) : null);
  if (NS) {
    const nsRow = (name, limTxt, fn) => tbody.append(h('tr', null, h('td', { class: 'small' }, name), h('td', { class: 'n small' }, limTxt),
      ...cols.map(([, q]) => { const z = nsOf(q); return z ? fn(z) : h('td', { class: 'n small muted' }, '—'); }), h('td', null, h('span', { class: 'small muted' }, 'bilgi'))));
    nsRow('PPV El / Az, dalga çarpması hariç (aynı tohum, çarpmasız koşu)', `≤ ${u6(lim.ppvEl, 1)} / ${u6(lim.ppvAz, 1)}`, (z) => pairCell(z.ppEl, z.ppXel, lim.ppvEl, lim.ppvAz, 1));
    nsRow('PPV/σ El / Az, çarpma hariç (parantezde Rice)', 'bilgi', (z) => h('td', { class: 'n small muted' }, `${fmt(z.rEl, 2)} / ${fmt(z.rXel, 2)}${z.gauss ? ` (${fmt(z.gauss.el, 1)} / ${fmt(z.gauss.xel, 1)})` : ''}`));
    nsRow('P99,73 radyal, çarpma hariç', `≤ ${u6(lim.p9973, 1)}`, (z) => cell(z.p9973.rad, lim.p9973, 1));
  }
  infoRow(`MTF_jitter @ Nyquist (gereksinim ≥ ${fmt(lim.mtfExp, 3)})`, (q) => fmt(Math.exp(-sq(Math.PI) * sq(Math.max(q.exp.el, q.exp.xel) / lim.IF) / 2), 3));
  infoRow(`${L.fHP} Hz altı El / Az (gyro yürüyüşü; ölçütte yok)`, (q) => `${u6(q.el.below)} / ${u6(q.xel.below)}`);
  // bant ve ton satırları (çiftler El / Az)
  const bn = lim.bands;
  for (let i = 0; i < bn.length - 1; i++) {
    const dv = decideRow((q) => [q.el.bands[i], q.xel.bands[i]]), ok = dv ? dv[0] <= lim.allocEl[i] * (1 + 1e-12) && dv[1] <= lim.allocAz[i] * (1 + 1e-12) : null;
    tbody.append(h('tr', null, h('td', null, `Bant ${bn[i]}–${bn[i + 1]} Hz, El / Az`), h('td', { class: 'n' }, `≤ ${u6(lim.allocEl[i])} / ${u6(lim.allocAz[i])}`),
      ...cols.map(([, q]) => (q ? pairCell(q.el.bands[i], q.xel.bands[i], lim.allocEl[i], lim.allocAz[i]) : h('td', { class: 'n' }, '—'))), h('td', null, ok == null ? '—' : pill(ok ? 'OK' : 'AŞIM'))));
  }
  {
    const tcell = (q) => { const e = tw(q.el.tones), x = tw(q.xel.tones); return h('td', { class: 'n small' }, [e, x].map((z, j) => z ? h('span', { class: z.rms > z.lim ? 'over' : '' }, `${j ? 'Az' : 'El'} ${fmt(z.f, 1)} Hz ${u6(z.rms)}`) : (j ? 'Az —' : 'El —')).reduce((a, b2) => (a.length ? a.concat([' · ', b2]) : [b2]), [])); };
    const dv = decideRow((q) => [tw(q.el.tones), tw(q.xel.tones)]), ok = dv ? dv.every(z => !z || z.rms <= z.lim * (1 + 1e-12)) : null;
    tbody.append(h('tr', null, h('td', null, `Ayrık ton (en kötü oran), El / Az`), h('td', { class: 'n small' }, `≤ √${L.toneFrac} × bant tahsisi`), ...cols.map(([, q]) => (q ? tcell(q) : h('td', { class: 'n' }, '—'))), h('td', null, ok == null ? '—' : pill(ok ? 'OK' : 'AŞIM'))));
  }
  tbody.append(h('tr', null, h('td', null, 'Geçiş (stick-slip) PPV, T1.6'), h('td', { class: 'n' }, '≤ ' + u6(lim.rev, 1)), h('td', { class: 'n', colspan: 4 }, rev ? `${rev.los ? rev.los.map((a, i) => `${a} ${u6(rev.ppvRevAx[i], 1)}`).join(' / ') : u6(rev.ppvRev, 1)} µrad (senkron ortalama, otokolimatör; laboratuvar)` : 'T1.6 koşulmadı'),
    h('td', null, rev ? pill(rev.ppvRev <= lim.rev ? 'OK' : 'AŞIM') : '—')));
  $('#rqSum').innerHTML = ''; $('#rqSum').append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, h('th', { style: { minWidth: '11rem' } }, 'Metrik'), h('th', { class: 'n' }, 'Limit'), ...cols.map(([n]) => h('th', { class: 'n' }, n)), h('th', null, 'Karar'))), tbody));
  // tohum tekrarı (önceden hesaplanmış; yalnız denizaltı varsayılanında)
  const SR = PRE.seeds && PRE.seeds.tests && PRE.seeds.tests['T1.9'];
  if (SR && SR.req && SR.req[basisKey] && curKey() === DEF_KEY) {
    const q = SR.req[basisKey], z = (sv, dd) => (sv ? `${u6(sv.mean, dd)} ± ${u6(sv.sd, dd)} (${u6(sv.min, dd)}–${u6(sv.max, dd)})` : '—');
    $('#rqSum').append(h('p', { class: 'xs muted', style: { margin: '6px 0 0', maxWidth: '120ch' } }, `Tohum tekrarı (${SR.n || PRE.seeds.n} gerçekleşme${(SR.n || 0) > PRE.seeds.n ? ` — uyarlamalı: kampanya ${PRE.seeds.n}, T1.9 sınıra yakın satır olduğu için ${SR.n}` : ''}, denizaltı varsayılanı, laboratuvar ${basisKey === 'once' ? 'takip öncesi' : 'takip sonrası'}; ortalama ± std (en küçük–en büyük), µrad): karar ${statTxt(SR.status)}; σ_vek ${z(q.sVec, 4)}, σ_El ${z(q.sEl)}, σ_Az ${z(q.sXel)}, PPV El ${z(q.ppEl, 1)}, P99,73 radyal ${z(q.p9973, 1)}, pozlama içi El ${z(q.expEl)}` + (SR.req.basis === basisKey && seedRowsTxt('T1.9') ? `. ${seedRowsTxt('T1.9')}.` : '.')));
  }
  // grafikler
  renderReqCharts(D);
  renderReqBands(D);
  renderReqSources(D);
  renderReqTracker(D, tk);
  renderReqTur(D, ti);
  renderReqDefs(D);
}
// kümülatif RMS + bant tahsisi merdiveni; ASD + düz eşdeğer maske
function renderReqCharts(D) {
  const { lim, lab, op } = D, A = (a) => Float32Array.from(a || [], v => v * 1e6);
  const stairX = [], sE = [], sA = [], mE = [], mA = []; let cE = 0, cA = 0;
  for (let i = 0; i < lim.bands.length - 1; i++) { cE += sq(lim.allocEl[i]); cA += sq(lim.allocAz[i]); stairX.push(lim.bands[i], lim.bands[i + 1]); sE.push(Math.sqrt(cE) * 1e6, Math.sqrt(cE) * 1e6); sA.push(Math.sqrt(cA) * 1e6, Math.sqrt(cA) * 1e6); mE.push(lim.maskEl[i] * 1e6, lim.maskEl[i] * 1e6); mA.push(lim.maskAz[i] * 1e6, lim.maskAz[i] * 1e6); }
  const ser = [], ser2 = [];
  if (lab && lab.sonra) {
    ser.push({ name: 'El, lab sonrası', x: Float32Array.from(lab.sonra.cum.f), y: A(lab.sonra.cum.el), slot: 0 }, { name: 'Az, lab sonrası', x: Float32Array.from(lab.sonra.cum.f), y: A(lab.sonra.cum.xel), slot: 1 });
    ser2.push({ name: 'El, lab sonrası', x: Float32Array.from(lab.sonra.asd.f), y: A(lab.sonra.asd.el), slot: 0 }, { name: 'Az, lab sonrası', x: Float32Array.from(lab.sonra.asd.f), y: A(lab.sonra.asd.xel), slot: 1 });
  }
  if (lab) ser.push({ name: 'El, lab öncesi', x: Float32Array.from(lab.once.cum.f), y: A(lab.once.cum.el), slot: 0, dash: [5, 3], width: 1.3 });
  if (lab && !lab.sonra) ser2.push({ name: 'El, lab öncesi', x: Float32Array.from(lab.once.asd.f), y: A(lab.once.asd.el), slot: 0 }, { name: 'Az, lab öncesi', x: Float32Array.from(lab.once.asd.f), y: A(lab.once.asd.xel), slot: 1 });
  if (op && op.post) {
    ser.push({ name: 'El, işletme sonrası', x: Float32Array.from(op.post.cum.f), y: A(op.post.cum.el), slot: 3, width: 1.5 });
    ser2.push({ name: 'El, işletme sonrası', x: Float32Array.from(op.post.asd.f), y: A(op.post.asd.el), slot: 3, width: 1.3 });
  }
  ser.push({ name: 'Tahsis El (kümülatif)', x: Float32Array.from(stairX), y: Float32Array.from(sE), color: '--crit', dash: [3, 3], width: 1.3 }, { name: 'Tahsis Az', x: Float32Array.from(stairX), y: Float32Array.from(sA), color: '--warn', dash: [3, 3], width: 1.3 });
  ser2.push({ name: 'Maske El', x: Float32Array.from(stairX), y: Float32Array.from(mE), color: '--crit', dash: [3, 3], width: 1.3 }, { name: 'Maske Az', x: Float32Array.from(stairX), y: Float32Array.from(mA), color: '--warn', dash: [3, 3], width: 1.3 });
  const s1 = { title: `Kümülatif RMS (${D.L.fHP} Hz'den) ve bant tahsisi merdiveni`, xLabel: 'Hz', yLabel: 'µrad RMS', yUnit: 'µrad', xLog: true, yLog: true, series: ser, height: 270, yMin: 0.05,
    refLines: [{ y: lim.el * 1e6, label: 'σ_El sınırı', kind: 'limit', noRange: true }] };
  const s2 = { title: 'ASD ve tahsisten türetilmiş düz eşdeğer maske (tonlar ayrıca sınırlı)', xLabel: 'Hz', yLabel: 'µrad/√Hz', yUnit: 'µrad/√Hz', xLog: true, yLog: true, series: ser2, height: 270, xMin: lim.bands[0] / 2, xMax: lim.bands[lim.bands.length - 1], yMin: 1e-4 };
  if (!REQV.charts.cum) REQV.charts.cum = new Chart($('#rqCum'), s1); else REQV.charts.cum.set(s1);
  if (!REQV.charts.asd) REQV.charts.asd = new Chart($('#rqAsd'), s2); else REQV.charts.asd.set(s2);
}
// ton kaynağı tahmini: soğutucu harmonikleri, yardımcı makine, VIV / direk modu, 50 fps videoda katlanma (takip döngüsü yazar)
function toneSource(P, fq) {
  const fps = ENG.derive(P).fps, cf = P.dut.cooler && P.dut.cooler.f, out = [];
  if (cf) for (let k = 1; k <= 3; k++) { if (Math.abs(fq - k * cf) < 0.25) out.push(`kriyo-soğutucu${k > 1 ? ' (' + k + '. harmonik)' : ''}`); const al = Math.abs(k * cf - Math.round(k * cf / fps) * fps); if (al > 0.3 && Math.abs(fq - al) < 0.25) out.push(`soğutucu ${k * cf} Hz'in videoda katlanması (takip döngüsü LOS'a yazar)`); }
  if (P.env.aux && Math.abs(fq - P.env.aux.f) < 0.25) out.push('yardımcı makine (yapı yolu)');
  try { const VS = ENG.vivSpec(P); if (VS.present && Math.abs(fq - VS.f) < 0.3) out.push(isShipP(P) ? 'rüzgâr VIV / direk modu' : 'hidrodinamik VIV'); } catch (e) { /* yok */ }
  return out.join(' · ') || '—';
}
function renderReqBands(D) {
  const { lim, lab, op, P } = D, box = $('#rqBands'); box.innerHTML = '';
  const bn = lim.bands, src = [['Lab öncesi', lab && lab.once], ['Lab sonrası', lab && lab.sonra], ['İşletme öncesi', op && op.pre], ['İşletme sonrası', op && op.post]];
  const tb = h('tbody');
  for (let i = 0; i < bn.length - 1; i++) {
    tb.append(h('tr', null, h('td', null, `${bn[i]}–${bn[i + 1]} Hz`), h('td', { class: 'n' }, `${u6(lim.allocEl[i])} / ${u6(lim.allocAz[i])}`), h('td', { class: 'n' }, `${fmt(lim.maskEl[i] * 1e6, 3)} / ${fmt(lim.maskAz[i] * 1e6, 3)}`),
      ...src.map(([, q]) => (q ? h('td', { class: 'n' }, h('span', { class: q.el.bands[i] > lim.allocEl[i] ? 'over' : '' }, u6(q.el.bands[i])), ' / ', h('span', { class: q.xel.bands[i] > lim.allocAz[i] ? 'over' : '' }, u6(q.xel.bands[i])),
        h('span', { class: 'sub' }, `maske ×${fmt(q.el.mask[i].r, 1)} @ ${fmt(q.el.mask[i].f, 1)} Hz`)) : h('td', { class: 'n' }, '—')))));
  }
  tb.append(h('tr', { class: 'tot' }, h('td', null, 'RSS (tahsis) · toplam'), h('td', { class: 'n' }, `${u6(lim.rssEl)} / ${u6(lim.rssAz)}`), h('td', null, ''), ...src.map(([, q]) => h('td', { class: 'n' }, q ? `${u6(Math.hypot(...q.el.bands))} / ${u6(Math.hypot(...q.xel.bands))}` : '—'))));
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Bant', 'Tahsis El / Az (µrad)', 'Düz maske (µrad/√Hz)', ...src.map(([n]) => n + ' El / Az')].map((c, i) => h('th', { class: i ? 'n' : '' }, c)))), tb));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 12px' } }, `Bant RMS'leri PSD integralidir (tonlar dahil). Maske oranı, tonlar çıkarılmış geniş bant ASD'nin düz eşdeğer maskeye en büyük oranıdır (şekil göstergesi; karar bant RMS'ine göre). Tahsisler eksen sınırının payları: ${D.L.share.join(' / ')}.`));
  // tonlar
  const tones = [];
  for (const [nm, q] of src) if (q) for (const [ax, T] of [['El', q.el.tones], ['Az', q.xel.tones]]) for (const z of T || []) tones.push({ nm, ax, z });
  if (!tones.length) { box.append(h('p', { class: 'small muted' }, 'Ayrık ton bulunmadı (ya da sonuç yok).')); return; }
  const key = (z) => Math.round(z.f * 4) / 4, groups = new Map();
  for (const tn of tones) { const k = tn.ax + '|' + key(tn.z); if (!groups.has(k)) groups.set(k, { ax: tn.ax, f: tn.z.f, band: tn.z.band, lim: tn.z.lim, v: {} }); groups.get(k).v[tn.nm] = tn.z.rms; }
  const gl = Array.from(groups.values()).sort((a, b) => Math.max(...Object.values(b.v)) - Math.max(...Object.values(a.v))).slice(0, 14);
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Ton (Hz)', 'Eksen', 'Sınır', ...src.map(([n]) => n), 'Olası kaynak'].map((c, i) => h('th', { class: i === 0 || (i >= 2 && i <= 6) ? 'n' : '' }, c)))),
    h('tbody', null, gl.map(g => h('tr', null, h('td', { class: 'n' }, fmt(g.f, 2)), h('td', null, g.ax), h('td', { class: 'n' }, g.band >= 0 ? u6(g.lim) : 'bant dışı'), ...src.map(([n]) => h('td', { class: 'n' + (g.v[n] != null && g.band >= 0 && g.v[n] > g.lim ? ' over' : '') }, g.v[n] != null ? u6(g.v[n]) : '—')), h('td', { class: 'small' }, toneSource(P, g.f)))))));
}
function renderReqSources(D) {
  const box = $('#rqSrc'); box.innerHTML = '';
  const op = STATE.op; if (!op || !op.rows) { box.append(h('p', { class: 'small muted' }, 'İşletme ayrıştırması yok.')); return; }
  const names = Object.fromEntries(ENG.budgetRows(D.P).map(r => [r.id, r.name]));
  const skip = new Set(['R-01', 'H7', 'B2-05']);
  const rs = Object.entries(op.rows).filter(([id, r]) => !skip.has(id) && r.qHpEl != null).map(([id, r]) => ({ id, r }));
  if (!rs.length) { box.append(h('p', { class: 'small muted' }, 'Bu işletme ayrıştırması gereksinim alanlarını içermiyor (önceki sürüm ya da değerlendirme kapalı) — yeniden koşturun.')); return; }
  rs.sort((a, b) => b.r.qHpEl - a.r.qHpEl);
  const vE = rs.reduce((s, q) => s + sq(q.r.qHpEl), 0), vA = rs.reduce((s, q) => s + sq(q.r.qHpXel), 0), lim = D.lim, bn = lim.bands;
  const tb = h('tbody', null, rs.map(({ id, r }, i) => h('tr', { class: i < 3 ? 'tot' : '' }, h('td', null, h('span', { class: 'mono', style: { color: 'var(--ink-2)' } }, id + ' '), names[id] || id),
    h('td', { class: 'n' }, u6(r.qHpEl), h('span', { class: 'sub' }, `%${fmt(100 * sq(r.qHpEl) / vE, 0)} varyans`)), h('td', { class: 'n' }, u6(r.qHpXel), h('span', { class: 'sub' }, `%${fmt(100 * sq(r.qHpXel) / vA, 0)}`)),
    h('td', { class: 'n' + (r.qExpEl > lim.exp ? ' over' : '') }, u6(r.qExpEl)), h('td', { class: 'n' + (r.qExpXel > lim.exp ? ' over' : '') }, u6(r.qExpXel)),
    ...bn.slice(0, -1).map((b0, j) => h('td', { class: 'n' + (r['qB' + j + 'El'] > lim.allocEl[j] ? ' over' : '') }, u6(r['qB' + j + 'El']))))));
  tb.append(h('tr', { class: 'tot' }, h('td', null, 'Satırların RSS\'i (bağımsız varsayımı)'), h('td', { class: 'n' }, u6(Math.sqrt(vE))), h('td', { class: 'n' }, u6(Math.sqrt(vA))), h('td', { class: 'n' }, u6(Math.sqrt(rs.reduce((s, q) => s + sq(q.r.qExpEl), 0)))), h('td', { class: 'n' }, u6(Math.sqrt(rs.reduce((s, q) => s + sq(q.r.qExpXel), 0)))), ...bn.slice(0, -1).map((b0, j) => h('td', { class: 'n' }, u6(Math.sqrt(rs.reduce((s, q) => s + sq(q.r['qB' + j + 'El']), 0)))))));
  if (op.req && op.req.pre) tb.append(h('tr', null, h('td', null, 'Tüm kaynaklar birlikte (takip öncesi)'), h('td', { class: 'n' }, u6(op.req.pre.sEl.pooled)), h('td', { class: 'n' }, u6(op.req.pre.sXel.pooled)), h('td', { class: 'n' }, u6(op.req.pre.exp.el)), h('td', { class: 'n' }, u6(op.req.pre.exp.xel)), ...bn.slice(0, -1).map((b0, j) => h('td', { class: 'n' }, u6(op.req.pre.el.bands[j])))));
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Kaynak (bütçe satırı)', `σ_El (≥ ${D.L.fHP} Hz)`, 'σ_Az', 'Pozlama El', 'Pozlama Az', ...bn.slice(0, -1).map((b0, j) => `El ${b0}–${bn[j + 1]} Hz`)].map((c, i) => h('th', { class: i ? 'n' : '' }, c)))), tb));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, `Her satır yalnız o kaynak ve mekanizmayla koşulmuş 600 s'lik işletme benzetiminin PSD'sinden (bant RMS ve ∫S·(1 − sinc²) pozlama içi); kırmızı: tek başına sınırı/tahsisi aşar. İlk üç satır en büyük katkılardır — iyileştirme önceliği. R-01 (aynı koşunun görüntü rotasyonu), H7 ve B2-05 (B1-05 ile aynı) tekrar saymamak için dışarıda.${D.opFresh ? '' : ' Ayrıştırma önceki parametrelerle.'}`));
}
function renderReqTracker(D, tk) {
  const { P, L } = D, fq = ENG.logspace(0.02, ENG.derive(P).fps / 2, 260), dB = (c) => 20 * Math.log10(ENG.cabs(c));
  const vl = [{ x: L.trk.bw, label: 'takip bandı ' + L.trk.bw + ' Hz' }];
  if (Math.abs(D.lim.bands[1] - L.trk.bw) > 1e-9) vl.push({ x: D.lim.bands[1], label: 'PSD bandı ' + D.lim.bands[1] + ' Hz' });
  try { const VS = ENG.vivSpec(P); if (VS.present) vl.push({ x: VS.f, label: (isShipP(P) ? 'direk modu ' : 'VIV ') + fmt(VS.f, 2) + ' Hz', kind: 'limit' }); } catch (e) { /* yok */ }
  const spec = { title: `Takip döngüsü duyarlılığı |S| (LOS bozucusu → kalıntı) ve |T| (video ölçüm gürültüsü → LOS); bant ${L.trk.bw} Hz, ${L.trk.lat_frames} kare gecikme`, xLabel: 'Hz', yLabel: 'dB', yUnit: 'dB', xLog: true, height: 240,
    series: [{ name: '|S| — kalıntı / bozucu', x: fq, y: Float32Array.from(fq, f => dB(tk.S(f))), slot: 0 }, { name: '|T| — ölçüm gürültüsünün LOS\'a geçişi', x: fq, y: Float32Array.from(fq, f => dB(tk.Tc(f))), slot: 2, dash: [5, 3] }],
    refLines: [{ y: 0, label: '' }], vLines: vl, yMin: -40, yMax: 12 };
  if (!REQV.charts.trk) REQV.charts.trk = new Chart($('#rqTrk'), spec); else REQV.charts.trk.set(spec);
  const kb = $('#rqTrkKv'); kb.innerHTML = '';
  const tk1 = (() => { const P2 = JSON.parse(JSON.stringify(P)); P2.ana.los.trk.lat_frames = 1; return ENG.trkModel(P2); })();
  kb.append(kvTable([
    ['Model', `hız komutu PI: L(s) = K(1 + W_i/s)/s · e^(−sτ), K = 2π·${L.trk.bw}, W_i = K/4; τ = T_int/2 + ${L.trk.lat_frames}·T_kare + T_kare/2 = ${fmt(tk.tau * 1e3, 1)} ms (benzetimdeki takipçiyle aynı yapı; V&V G3)`],
    ['Kesim · faz payı', `${fmt(tk.fc, 2)} Hz · ${fmt(tk.pm, 1)}° (1 kare gecikmeyle ${fmt(tk1.pm, 1)}°)`],
    ['Kararlılık', tk.stable ? `kararlı; 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz (${ENG.derive(P).fps} fps, ${L.trk.lat_frames} kare gecikme)` : `KARARSIZ (faz payı ${fmt(tk.pm, 1)}°): kare hızı, gecikme ve bant uyumsuz; 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz. Takip sonrası koşular yapılmaz (T1.9 GEÇERSİZ), aşağıdaki |S| eğrisi kararlı bir döngüyü temsil etmez.`],
    ['Bastırma bandı · büyütme', `|S| < 1 yalnız ${fmt(tk.f0, 2)} Hz altında; tepe ${fmt(20 * Math.log10(tk.sPk), 1)} dB @ ${fmt(tk.fPk, 2)} Hz (1 kare gecikmeyle ${fmt(20 * Math.log10(tk1.sPk), 1)} dB @ ${fmt(tk1.fPk, 2)} Hz). Bode duyarlılık integrali: alçak frekansta kazanılan bastırma, kesim civarında büyütme olarak geri ödenir.`],
    ['Sonuç', `Tablodaki "0,1–2,5 Hz takip döngüsüyle düzeltilir" varsayımı bu gecikmeyle ancak ${fmt(tk.f0, 2)} Hz'e kadar geçerli; ${fmt(tk.f0, 2)}–${fmt(Math.min(25, tk.fPk * 2.5), 1)} Hz arası (kritik bandın başı) büyütülür ve video ölçüm gürültüsü LOS'a |T| ile taşınır. Takip sonrası kritik bant ve VIV satırlarına bakın.`]]));
}
function renderReqTur(D, ti) {
  const { P, lim } = D, tgt = P.wb.TUR_target, mT = ti.mult || 1, box = $('#rqTur'); box.innerHTML = '';
  // zincire özgü masa payı (T1.3 ya da T0.3 yalıtılmış koşusu)
  const fresh = (id) => { const r = STATE.results[id]; return r && r.key === curKey() && r.res && r.res.num ? r.res.num : null; };
  const n13 = fresh('T1.3'), n03 = fresh('T0.3');
  const sh = (n13 && n13.mvShare) || (n03 && n03.mvShare) || null, U03 = P.wb.hex.microvib;
  const uvC = sh ? Math.sqrt(Math.max(0, sq(ti.uv) - sq(U03) + sq(sh.on.vid.el * 1e6))) : NaN;
  const rows = [['σ_El', lim.el, 'video (50 fps)', ti.uv, 1], ['σ_Az', lim.az, 'video', ti.uv, 1], ['σ_vek', lim.vec, 'video (√2·u, iki eksen)', ti.uv, Math.SQRT2],
    ['Pozlama içi (10 ms)', lim.exp, 'yüksek hızlı (≥ 2 kHz)', ti.uh, 1], [`Bant ${lim.bands[2]}–${lim.bands[3]} Hz El`, lim.allocEl[2], 'yüksek hızlı', ti.uh, 1]];
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Metrik', 'Limit (µrad)', 'Ölçüm zinciri', 'Taban u (µrad/eksen)', 'TUR', `TUR ≥ ${tgt} için taban`, 'Zincire özgü masa payıyla TUR'].map((c, i) => h('th', { class: i && i !== 2 ? 'n' : '' }, c)))),
    h('tbody', null, rows.map(([n, l, ch, uu, k]) => { const tur = l * 1e6 / (k * uu * mT); return h('tr', null, h('td', null, n), h('td', { class: 'n' }, u6(l)), h('td', null, ch), h('td', { class: 'n' }, fmt(uu, 2)),
      h('td', { class: 'n' + (tur < tgt ? ' over' : '') }, fmt(tur, 2)), h('td', { class: 'n' }, fmt(l * 1e6 / (k * tgt * mT), 2)), h('td', { class: 'n' }, ch.startsWith('video') && isFinite(uvC) ? fmt(l * 1e6 / (k * uvC * mT), 2) : '—')); }))));
  box.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, `TUR = limit / (m·u); m = ${mT === 1 ? '1 (k = 1 tanımı)' : mT + ' (Z540.3, genişletme katsayısı)'} — TUR tanımı Model → Referans kanal ve gereksinimler'den; σ_vek satırında taban √2·u. Video tabanı U-01…U-07'nin karesel toplamı (${fmt(ti.uv, 2)}); U-03 masa mikro-titreşimi ${fmt(U03, 2)} µrad tam sayılır${sh ? `; stab ON'da video zincirine geçen pay ${fmt(sh.on.vid.el * 1e6, 2)} µrad ile taban ${fmt(uvC, 2)} µrad` : ''}. Baskın kalemler centroid gürültüsü (U-01) ve hava türbülansı (U-02): bu gereksinimler, varsayılan düzeneğin ölçebileceği sınırın altında ya da yakınındadır. 50 fps video 25 Hz üstünü göremez ve katlar; pozlama içi ve 20 Hz üstü bantlar için yüksek hızlı (optik yolu gören) bir kanal gerekir — otokolimatör yalnız aynayı (mekanik LOS) görür.`));
}
function renderReqDefs(D) {
  const { L, lim, P } = D, box = $('#rqDef'); box.innerHTML = '';
  const IFu = lim.IF * 1e6;
  box.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Metrik', 'Formül', 'Limit (µrad)', 'Hesap tanımı'].map((c, i) => h('th', { class: i === 2 ? 'n' : '' }, c)))),
    h('tbody', null, [
      ['Piksel çözünürlüğü', 'IFOV = p / f', u6(lim.IF), `${fmt(IFu * 0.206265, 2)}″ (referans kanal)`],
      ['Bütünsel RMS', `σ_vek ≤ ${L.kVec}·IFOV`, u6(lim.vec), `${L.Tw} s pencerelerde √(σ_El² + σ_Az²); ${ENG.DEC_TXT[L.decide]}`],
      ['Yükseliş RMS', `σ_El ≤ ${L.kEl}·IFOV`, u6(lim.el), 'görüntü çerçevesinde El'],
      ['Azimut RMS', `σ_Az ≤ ${L.kAz}·IFOV`, u6(lim.az), `çapraz yükseliş (Δaz·cos El); √(El² + Az²) = ${u6(lim.vecAxes)}`],
      ['Kayıt PPV', `PPV ≤ ${L.kPPV}·σ_eksen`, `${u6(lim.ppvEl, 1)} / ${u6(lim.ppvAz, 1)}`, `en kötü ${L.Tw} s penceresinde maks − min; Gauss kalıntıda beklenen PPV/σ = 2·√(2 ln(ν0·n_W·T_w)) (Rice; ν0 sıfır geçiş sıklığı)` + (D.lab && D.lab.sonra && D.lab.sonra.gauss ? `, T1.9 takip sonrası ${fmt(D.lab.sonra.gauss.el, 1)} / ${fmt(D.lab.sonra.gauss.xel, 1)}` : '')],
      ['Geçiş PPV (stick-slip)', `PPV_geçiş ≤ ${L.kRev}·IFOV`, u6(lim.rev, 1), 'T1.6: hız yön değişimine kilitli senkron ortalama dalga biçiminin tepe-tepe değeri'],
      ['İstatistiki sapma', `P99,73 ≤ ${L.k9973}·IFOV`, u6(lim.p9973, 1), 'ampirik radyal yüzdelik (Gauss dışı kuyrukları yakalar); 2B dairesel Gauss\'ta %99,73 yarıçapı 2,43·σ_vek'],
      ['Pozlama içi jitter', `σ_kısa ≤ ${L.kExp}·IFOV, T_e = ${L.Texp_ms} ms`, u6(lim.exp), `her kare için pencere ortalamasına göre RMS; karar: karelerin karesel ortalaması = √∫S·(1 − sinc²(πfT_e))df; P99 bilgi. MTF_jitter(Nyquist) ≥ ${fmt(lim.mtfExp, 3)}`],
      ['PSD bantları', 'bant RMS ≤ pay × eksen sınırı', `El ${lim.allocEl.map(v => u6(v)).join(' / ')}`, `bantlar ${lim.bands.join(' – ')} Hz; düz eşdeğer maske = tahsis/√Δf; 100–500 Hz bandı RMS ve pozlama içine katkı yaptığı için eklendi`],
      ['Ayrık tonlar', `ton RMS ≤ √${L.toneFrac} × bant tahsisi`, `El ${lim.toneEl.map(v => u6(v)).join(' / ')}`, `±1 Hz yerel ortancanın ≥ 10 katı tepeler (f ≥ ${L.toneMin} Hz); ASD maskesi tonlarda çözünürlüğe bağlı olduğu için ayrı sınır`],
    ].map(r => h('tr', null, h('td', null, r[0]), h('td', { class: 'mono small' }, r[1]), h('td', { class: 'n' }, r[2]), h('td', { class: 'small' }, r[3]))))));
  box.append(h('ul', { class: 'notes', style: { marginTop: '10px' } },
    h('li', null, `Ön işlem: ${L.fHP} Hz sıfır fazlı yüksek geçiren (iki geçişli 2. derece Butterworth, f_HP'de −6 dB) + ${L.Tw} s pencerelerde doğrusal trend. ${L.fHP} Hz altı (gyro ARW yürüyüşü, bias) ölçütte değil, ayrıca raporlanır.`),
    h('li', null, `Kabul tabanı: ${L.basis === 'once' ? 'takip öncesi (stabilizasyon çıkışı)' : 'dış kamera takip döngüsü sonrası'}; diğeri bilgi olarak raporlanır. Laboratuvar (T1.9) karar verir, işletme benzetimi öngörüdür.`),
    isShipP(P) ? null : h('li', null, `Dalga çarpması (denizaltı mastı) seyrek ve kısa geçişlerdir; işletmede PPV ve P99,73'ü bunlar belirler. "Çarpma hariç" satırları aynı tohumla, yalnız çarpma kaynağı kapalı ek koşulardan gelir (diğer kaynakların gerçekleşmesi aynı). 60 s'lik pencerelerden çarpma içerenleri atmak uygulanamaz: λ = ${P.env.slap.rate}/s ile pencere başına beklenen ${fmt(P.env.slap.rate * L.Tw, 0)} olay, olaysız pencere olasılığı e^−${fmt(P.env.slap.rate * L.Tw, 0)} ≈ %${fmt(100 * Math.exp(-P.env.slap.rate * L.Tw), 2)}. Ana satırlar tüm kaydı değerlendirir (v12'nin "en kötü ${L.Tw} s" tanımı).`),
    h('li', null, `σ kararı ${ENG.DEC_TXT[L.decide]}: pencere RMS'leri r_k için √(ort r_k²) + t₀,₉₅(n − 1)·s/√n. Deniz hareketi pencereden pencereye %10–20 oynatır; tek pencereyle karar şansa bağlıdır.`),
    h('li', null, 'Kalıntının tanımı: gerçek görüş hattı − olması gereken yön (laboratuvarda kolimatör). Enkoder bunu ölçemez; gimbal aynası (otokolimatör) optik iç modları görmez; 50 fps video 25 Hz üstünü göremez ve katlar.'),
    h('li', null, 'Gereksinim seti bütçenin wander/smear tanımlarından farklıdır ve 6–8 kat sıkıdır; Bütçe ekranındaki tahsisler bu sete göre yeniden dağıtılmadıkça karşılaştırma yalnız bilgi amaçlıdır.')));
}
