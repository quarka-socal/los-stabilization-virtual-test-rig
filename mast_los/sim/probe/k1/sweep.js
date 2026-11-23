// Teknik kılavuz §2 — "Referans kanal ve gereksinimler" parametre taraması: türetilmiş değerler ve analitik denetimler
const L = require('../../engine.js');
const D2R = Math.PI / 180, R2D = 180 / Math.PI, sq = (x) => x * x;
const ch0 = (P) => P.wb.channels.find(c => c.name === P.wb.refChannel);
const cases = [
  ['varsayılan', () => {}],
  ['ref MWIR-WFOV', (P) => { P.wb.refChannel = 'MWIR-WFOV'; }],
  ['ref HDTV-NFOV', (P) => { P.wb.refChannel = 'HDTV-NFOV'; }],
  ['ref SWIR-NFOV', (P) => { P.wb.refChannel = 'SWIR-NFOV'; }],
  ['format 640×512', (P) => { Object.assign(ch0(P), { Nh: 640, Nv: 512 }); }],
  ['format 1920×1080', (P) => { Object.assign(ch0(P), { Nh: 1920, Nv: 1080 }); }],
  ['p 15 µm', (P) => { ch0(P).p_um = 15; }],
  ['f 600 mm', (P) => { ch0(P).f_mm = 600; }],
  ['fps 100', (P) => { ch0(P).fps = 100; }],
  ['fps 25', (P) => { ch0(P).fps = 25; }],
  ['Tint 10 ms', (P) => { ch0(P).Tint_ms = 10; }],
  ['Tint 1 ms', (P) => { ch0(P).Tint_ms = 1; }],
  ['k_wander 0,3', (P) => { P.wb.k_wander = 0.3; }],
  ['k_smear 0,5', (P) => { P.wb.k_smear = 0.5; }],
  ['τ 10 s', (P) => { P.wb.tau = 10; }],
  ['drift 2 IFOV', (P) => { P.wb.drift_ifov = 2; }],
  ['k_conf 3', (P) => { P.wb.k_conf = 3; }],
  ['TUR hedef 2', (P) => { P.wb.TUR_target = 2; }],
  ['TUR Z540.3', (P) => { P.wb.TUR_def = 'Z540.3'; }],
  ['k_roll 1', (P) => { P.wb.k_roll = 1; }],
  ['rotRef kenar', (P) => { P.wb.rotRef = 'edge'; }],
  ['extRows kapalı', (P) => { P.wb.extRows = false; }],
];
const out = [];
for (const [name, f] of cases) {
  const P = L.defaultParams(); f(P);
  const d = L.derive(P), c = d.ch, wb = P.wb, B = L.computeBudget(P, null), ti = L.turInfo(P), es = L.earthSheet(P);
  const IF = c.p_um / c.f_mm * 1e-3, FOVh = 2 * Math.atan(c.Nh * c.p_um * 1e-6 / (2 * c.f_mm * 1e-3)) * R2D, FOVv = 2 * Math.atan(c.Nv * c.p_um * 1e-6 / (2 * c.f_mm * 1e-3)) * R2D;
  const rC = 0.5 * Math.hypot(c.Nh, c.Nv), angC = Math.atan(rC * c.p_um / c.f_mm * 1e-3);
  const chk = [];
  const ok = (lab, a, b, tol) => { const e = Math.abs(a - b) / Math.max(Math.abs(b), 1e-30); chk.push([lab, e <= (tol || 1e-12), e]); };
  ok('IFOV = p/f', d.IFOV, IF); ok('FOVh', d.FOVh, FOVh); ok('FOVv', d.FOVv, FOVv);
  ok('wander = k_w·IFOV', d.req.wander, wb.k_wander * IF); ok('smear = k_s·IFOV', d.req.smear, wb.k_smear * IF);
  ok('drift = k_d·IFOV', d.req.drift, wb.drift_ifov * IF); ok('P99 = k_conf·k_w·IFOV', d.req.p99, wb.k_conf * wb.k_wander * IF);
  ok('ψ_lim·θ_köşe = k_roll·IFOV', d.rot.limC * angC, wb.k_roll * IF);
  ok('ψ_lim ≈ k_roll / r_px (küçük açı)', d.rot.limC, wb.k_roll / rC, 1e-4);
  ok('MTF_ger = exp(−π²k_s²/2)', B.mtfReq, Math.exp(-sq(Math.PI) * sq(wb.k_smear) / 2));
  const mult = String(wb.TUR_def).startsWith('Z540') ? wb.k_exp : 1;
  ok('TUR_w = R/(k·u_v)', ti.turW, d.req.wander * 1e6 / (mult * ti.uv));
  const r01 = B.rows.find(r => r.id === 'R-01'); ok('R-01 tahsisi = k_roll·IFOV', r01.Q, wb.k_roll * IF * 1e6);
  const b11 = B.rows.find(r => r.id === 'B1-01'); ok('W_w(B1-01) = sinc²(πfT_int)', b11.N, sq(Math.sin(Math.PI * b11.G * d.Tint) / (Math.PI * b11.G * d.Tint)));
  ok('stab-OFF sınırı = oran·min FOV', d.stabOffMax, wb.hex.stabOff_ratio * Math.min(FOVh, FOVv));
  const allocAbs = Math.sqrt(B.rows.filter(r => r.L === 'E' && r.id !== 'R-01').reduce((s, r) => s + sq(r.Q), 0));
  out.push({ name, IF: d.IFOV * 1e6, FOV: `${d.FOVh.toFixed(3)}×${d.FOVv.toFixed(3)}`, N: `${d.Nh}×${d.Nv}`, fps: d.fps, Tint: d.Tint * 1e3,
    reqW: d.req.wander * 1e6, reqS: d.req.smear * 1e6, reqD: d.req.drift * 1e6, p99: d.req.p99 * 1e6, rotC: d.rot.limC * 1e6, rotE: d.rot.limE * 1e6, rot: d.rot.ref,
    stabOff: d.stabOffMax, uv: ti.uv, uh: ti.uh, turW: ti.turW, turS: ti.turS, mult, exitOff: es.off.exit, exitOn: es.on.exit,
    budW: B.wander, budS: B.smear, allocRSS: B.tot.alloc, allocAbs, useW: B.wanderUse, useS: B.smearUse, peak: B.peak, drift: B.drift, driftReq: B.driftReq, mtfNyq: B.mtfNyq, mtfReq: B.mtfReq,
    r01Q: r01.Q, r01I: r01.I, nRows: B.rows.length, bad: chk.filter(q => !q[1]).map(q => q[0] + ' (' + q[2].toExponential(1) + ')') });
}
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : (+x).toFixed(d);
console.log('durum | IFOV µrad | FOV ° | N | fps | Tint ms | wander/smear/drift/P99 µrad | ψ_lim köşe/kenar µrad | stabOFF ° | u_v/u_h µrad | TUR w/s | alan terk s (kapalı/açık) | bütçe w/s µrad | tahsis RSS (mutlak) | kullanım w/s | tepe | drift/ger | MTF Nyq/ger | R-01 Q/I | satır | analitik denetim');
for (const o of out) console.log([o.name, f(o.IF), o.FOV, o.N, o.fps, f(o.Tint, 1), `${f(o.reqW)}/${f(o.reqS)}/${f(o.reqD)}/${f(o.p99)}`, `${f(o.rotC, 0)}/${f(o.rotE, 0)} (${o.rot})`, f(o.stabOff, 3), `${f(o.uv)}/${f(o.uh)}`, `${f(o.turW)}/${f(o.turS)}${o.mult > 1 ? ' (k=' + o.mult + ')' : ''}`, `${f(o.exitOff, 0)}/${f(o.exitOn, 0)}`, `${f(o.budW)}/${f(o.budS)}`, `${f(o.allocRSS)} (${f(o.allocAbs)})`, `${f(o.useW)}/${f(o.useS)}`, f(o.peak), `${f(o.drift)}/${f(o.driftReq)}`, `${f(o.mtfNyq, 3)}/${f(o.mtfReq, 3)}`, `${f(o.r01Q)}/${f(o.r01I)}`, o.nRows, o.bad.length ? 'HATA: ' + o.bad.join('; ') : 'OK'].join(' | '));
require('fs').writeFileSync(__dirname + '/sweep.json', JSON.stringify(out, null, 1));
