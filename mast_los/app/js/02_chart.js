// ---------------------------------------------------------------- tuval grafikleri
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n) => String(n).split('').map(c => SUP[c] || c).join('');
function niceStep(range, n) { const raw = range / Math.max(1, n); const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
function linTicks(a, b, n) {
  if (!(b > a)) b = a + 1;
  const st = niceStep(b - a, n), t0 = Math.ceil(a / st - 1e-9) * st, out = [];
  for (let k = 0, v = t0; v <= b + st * 1e-9 && k < 50; k++, v = t0 + k * st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return { major: out, minor: [], step: st };
}
function logTicks(a, b) {
  const e0 = Math.floor(Math.log10(a) + 1e-9), e1 = Math.ceil(Math.log10(b) - 1e-9), nd = e1 - e0;
  const every = nd > 9 ? 3 : nd > 6 ? 2 : 1, major = [], minor = [];
  for (let e = e0; e <= e1; e++) {
    const v = Math.pow(10, e);
    if (v >= a * 0.999 && v <= b * 1.001 && (e - e0) % every === 0) major.push(v);
    if (nd <= 6) for (let m = 2; m <= 9; m++) { const w = m * v; if (w > a && w < b) minor.push(w); }
  }
  if (major.length < 3 && nd <= 2) { for (let e = e0 - 1; e <= e1; e++) for (const m of [2, 5]) { const w = m * Math.pow(10, e); if (w > a * 1.001 && w < b * 0.999) major.push(w); } major.sort((x, y) => x - y); }
  return { major, minor, step: null };
}
function tickFmt(v, log, step) {
  if (v === 0) return '0';
  const a = Math.abs(v), sg = v < 0 ? '−' : '';
  if (log) {
    const e = Math.log10(a);
    if (Math.abs(e - Math.round(e)) < 1e-9) { const ei = Math.round(e); return (ei >= -2 && ei <= 3) ? sg + String(+a.toPrecision(3)) : sg + '10' + sup(ei); }
    return sg + String(+a.toPrecision(2));
  }
  if (a >= 1e5 || a < 1e-3) { const e = Math.floor(Math.log10(a)); return sg + (+(a / Math.pow(10, e)).toPrecision(2)) + '·10' + sup(e); }
  const d = step ? clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 4) : 2;
  return sg + a.toFixed(d);
}
function sig(v, n = 4) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2).replace('-', '−');
  return String(+v.toPrecision(n)).replace('-', '−');
}
function isSorted(x) { for (let i = 1; i < x.length; i++) if (!(x[i] >= x[i - 1])) return false; return true; }
function nearestIdx(x, v, sorted) {
  const n = x.length; if (!n) return -1;
  if (sorted) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] < v) lo = m; else hi = m; } return Math.abs(x[lo] - v) <= Math.abs(x[hi] - v) ? lo : hi; }
  let bi = 0, bd = Infinity; for (let i = 0; i < n; i++) { const dd = Math.abs(x[i] - v); if (dd < bd) { bd = dd; bi = i; } } return bi;
}

class Chart {
  constructor(host, spec) {
    this.host = host; host.classList.add('chart'); host.innerHTML = '';
    this.titleEl = h('div', { class: 'ttl' });
    this.cv = h('canvas');
    this.tip = h('div', { class: 'tip' }); this.tip.hidden = true;
    this.leg = h('div', { class: 'legend' });
    host.append(this.titleEl, this.cv, this.tip, this.leg);
    this.cursorX = null; this.hoverPx = null; this.lastW = 0;
    this.set(spec);
    this.ro = new ResizeObserver(() => { if (this.host.clientWidth !== this.lastW) this.draw(); });
    this.ro.observe(host);
    this.cv.addEventListener('pointermove', (e) => { const r = this.cv.getBoundingClientRect(); this.hoverPx = [e.clientX - r.left, e.clientY - r.top]; this.draw(); });
    this.cv.addEventListener('pointerleave', () => { this.hoverPx = null; this.tip.hidden = true; this.draw(); });
    Chart.all.add(this);
  }
  set(spec) {
    this.spec = spec;
    this.titleEl.textContent = spec.title || ''; this.titleEl.hidden = !spec.title;
    this.H = spec.height || 230;
    this.cv.setAttribute('role', 'img');
    this.cv.setAttribute('aria-label', (spec.title || 'grafik') + (spec.yLabel ? ' — ' + spec.yLabel : ''));
    this.ser = (spec.series || []).map((se, i) => {
      const x = F32(se.x), y = F32(se.y);
      return { name: se.name, x, y, dots: !!se.dots, dash: se.dash || null, colorVar: se.color || ('--s' + (((se.slot != null ? se.slot : i) % 8) + 1)), width: se.width || 1.8, sorted: !se.dots && isSorted(x), area: !!se.area };
    });
    this.computeRanges();
    this.leg.innerHTML = '';
    const named = this.ser.filter(q => q.name);
    const refs = (spec.refLines || []).filter(r => r.label);
    if (named.length >= 2 || refs.length) {
      for (const q of named) this.leg.append(h('span', null, h('i', { class: q.dots ? 'dot' : (q.dash ? 'dash' : ''), 'data-c': q.colorVar }), q.name));
      for (const r of refs) this.leg.append(h('span', null, h('i', { class: 'dash', 'data-c': r.kind === 'limit' ? '--crit' : '--muted' }), r.label));
    }
    this.leg.hidden = !this.leg.childElementCount;
    this.draw();
  }
  computeRanges() {
    const sp = this.spec, xl = !!sp.xLog, yl = !!sp.yLog;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of this.ser) for (let i = 0; i < q.y.length; i++) {
      const x = q.x[i], y = q.y[i];
      if (!isFinite(x) || !isFinite(y) || (xl && x <= 0) || (yl && y <= 0)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (const r of (sp.refLines || [])) if (isFinite(r.y) && (!yl || r.y > 0) && !r.noRange) { y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); }
    if (!isFinite(x0)) { x0 = xl ? 1 : 0; x1 = xl ? 10 : 1; }
    if (!isFinite(y0)) { y0 = yl ? 1 : 0; y1 = yl ? 10 : 1; }
    if (yl) { y0 = Math.max(y0, y1 * 1e-9); y0 = Math.pow(10, Math.floor(Math.log10(y0))); y1 = Math.pow(10, Math.ceil(Math.log10(y1))); if (y1 / y0 < 10) y0 = y1 / 10; }
    else { if (y1 === y0) { y0 -= 1; y1 += 1; } const pd = (y1 - y0) * 0.07; y0 -= pd; y1 += pd; if (sp.yZero && y0 > 0) y0 = 0; }
    if (xl) { x0 = x0 / 1.04; x1 = x1 * 1.04; } else if (this.ser.some(q => q.dots)) { const pd = (x1 - x0) * 0.04 || 0.5; x0 -= pd; x1 += pd; }
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    if (sp.xMin != null) x0 = sp.xMin; if (sp.xMax != null) x1 = sp.xMax; if (sp.yMin != null) y0 = sp.yMin; if (sp.yMax != null) y1 = sp.yMax;
    Object.assign(this, { x0, x1, y0, y1 });
  }
  setCursor(x) { this.cursorX = x; this.draw(true); }
  drawCursor(g) {
    if (this.cursorX == null || !isFinite(this.cursorX) || !this.X) return;
    const x = this.X(this.cursorX); if (x < this.padL - 1 || x > this.padL + this.pw + 1) return;
    g.strokeStyle = cssVar('--accent'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, this.padT); g.lineTo(x, this.padT + this.ph); g.stroke();
  }
  draw(fast) {
    const cv = this.cv, W = this.host.clientWidth; this.lastW = W;
    if (!W) return;
    const H = this.H, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; this.snap = null; }
    const g = cv.getContext('2d');
    if (fast && this.snap && !this.hoverPx) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this.snap, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); this.drawCursor(g); return;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const C = { ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'), grid: cssVar('--grid'), axis: cssVar('--axis'), surface: cssVar('--surface'), crit: cssVar('--crit'), accent: cssVar('--accent') };
    for (const i of this.leg.querySelectorAll('i[data-c]')) { const c = cssVar(i.getAttribute('data-c')); i.style.background = c; i.style.borderColor = c; }
    const sp = this.spec, xl = !!sp.xLog, yl = !!sp.yLog;
    g.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    const yT = yl ? logTicks(this.y0, this.y1) : linTicks(this.y0, this.y1, H < 200 ? 4 : 5);
    const yLab = yT.major.map(v => tickFmt(v, yl, yT.step));
    const padL = Math.ceil(Math.max(26, ...yLab.map(t => g.measureText(t).width)) + 10), padR = 14, padT = sp.yLabel ? 20 : 10, padB = 26;
    const pw = Math.max(20, W - padL - padR), ph = Math.max(20, H - padT - padB);
    const lx0 = xl ? Math.log10(this.x0) : this.x0, lx1 = xl ? Math.log10(this.x1) : this.x1, ly0 = yl ? Math.log10(this.y0) : this.y0, ly1 = yl ? Math.log10(this.y1) : this.y1;
    const X = (v) => padL + ((xl ? Math.log10(v) : v) - lx0) / (lx1 - lx0) * pw;
    const Y = (v) => padT + ph - ((yl ? Math.log10(v) : v) - ly0) / (ly1 - ly0) * ph;
    const invX = (px) => { const u = lx0 + (px - padL) / pw * (lx1 - lx0); return xl ? Math.pow(10, u) : u; };
    Object.assign(this, { X, Y, invX, padL, padT, pw, ph });
    // ızgara
    const xT = xl ? logTicks(this.x0, this.x1) : linTicks(this.x0, this.x1, Math.max(2, Math.min(8, Math.floor(pw / 80))));
    g.lineWidth = 1;
    g.strokeStyle = C.grid; g.globalAlpha = 0.55; g.beginPath();
    for (const v of yT.minor) { const y = Math.round(Y(v)) + .5; g.moveTo(padL, y); g.lineTo(padL + pw, y); }
    for (const v of xT.minor) { const x = Math.round(X(v)) + .5; g.moveTo(x, padT); g.lineTo(x, padT + ph); }
    g.stroke(); g.globalAlpha = 1;
    g.beginPath();
    for (const v of yT.major) { const y = Math.round(Y(v)) + .5; if (y < padT - 1 || y > padT + ph + 1) continue; g.moveTo(padL, y); g.lineTo(padL + pw, y); }
    for (const v of xT.major) { const x = Math.round(X(v)) + .5; if (x < padL - 1 || x > padL + pw + 1) continue; g.moveTo(x, padT); g.lineTo(x, padT + ph); }
    g.stroke();
    g.strokeStyle = C.axis; g.beginPath(); g.moveTo(padL, Math.round(padT + ph) + .5); g.lineTo(padL + pw, Math.round(padT + ph) + .5); g.stroke();
    if (!yl && this.y0 < 0 && this.y1 > 0) { g.strokeStyle = C.axis; g.beginPath(); const y0 = Math.round(Y(0)) + .5; g.moveTo(padL, y0); g.lineTo(padL + pw, y0); g.stroke(); }
    // etiketler
    g.fillStyle = C.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    yT.major.forEach((v, i) => { const y = Y(v); if (y >= padT - 2 && y <= padT + ph + 2) g.fillText(yLab[i], padL - 6, y); });
    g.textBaseline = 'top';
    const xs = xT.major.filter(v => { const x = X(v); return x >= padL - 1 && x <= padL + pw + 1; });
    let lastR = -Infinity;
    xs.forEach((v, i) => {
      let t = tickFmt(v, xl, xT.step); if (i === xs.length - 1 && sp.xLabel) t += ' ' + sp.xLabel;
      const w = g.measureText(t).width; let x = X(v), al = 'center';
      if (x + w / 2 > W - 2) { al = 'right'; x = Math.min(x, W - 2); }
      const left = al === 'center' ? x - w / 2 : x - w;
      if (left < lastR + 6) return;
      g.textAlign = al; g.fillText(t, x, padT + ph + 6); lastR = al === 'center' ? x + w / 2 : x;
    });
    if (sp.yLabel) { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(sp.yLabel, 2, 2); }
    // çizim alanı
    g.save(); g.beginPath(); g.rect(padL, padT - 3, pw, ph + 6); g.clip();
    (sp.vLines || []).forEach((r, vi) => { if (!isFinite(r.x) || (xl && r.x <= 0)) return; const x = X(r.x); g.strokeStyle = r.kind === 'limit' ? C.crit : C.muted; g.setLineDash([3, 4]); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT + ph); g.stroke(); g.setLineDash([]); if (r.label) { g.fillStyle = C.muted; const tw = g.measureText(r.label).width, right = x + 4 + tw > padL + pw; g.textAlign = right ? 'right' : 'left'; g.textBaseline = 'top'; g.fillText(r.label, right ? x - 4 : x + 4, padT + 2 + 13 * vi); } });
    for (const r of (sp.refLines || [])) {
      if (!isFinite(r.y) || (yl && r.y <= 0)) continue;
      const y = Y(r.y); g.strokeStyle = r.kind === 'limit' ? C.crit : C.muted; g.lineWidth = 1.3; g.setLineDash([6, 4]);
      g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + pw, y); g.stroke(); g.setLineDash([]);
    }
    for (const q of this.ser) {
      const col = cssVar(q.colorVar) || C.ink;
      if (q.dots) {
        for (let i = 0; i < q.y.length; i++) {
          const xv = q.x[i], yv = q.y[i]; if (!isFinite(xv) || !isFinite(yv) || (xl && xv <= 0) || (yl && yv <= 0)) continue;
          g.beginPath(); g.arc(X(xv), Y(yv), 4, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = C.surface; g.stroke();
        }
        continue;
      }
      g.strokeStyle = col; g.lineWidth = q.width; g.lineJoin = 'round'; g.lineCap = 'round';
      if (q.dash) g.setLineDash(q.dash);
      g.beginPath(); let pen = false, lastPx = -1e9;
      const n = q.y.length, dense = n > pw * 3;
      for (let i = 0; i < n; i++) {
        const xv = q.x[i], yv = q.y[i];
        if (!isFinite(xv) || !isFinite(yv) || (xl && xv <= 0) || (yl && yv <= 0)) { pen = false; continue; }
        const px = X(xv), py = Y(yv);
        if (dense && pen && Math.abs(px - lastPx) < 0.25 && i < n - 1) { g.lineTo(px, py); continue; }
        if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
        lastPx = px;
      }
      g.stroke(); g.setLineDash([]);
    }
    // durağan katmanın anlık görüntüsü (oynatma imleci için hızlı yol), sonra imleç
    try { if (!this.snap) this.snap = document.createElement('canvas'); this.snap.width = cv.width; this.snap.height = cv.height; this.snap.getContext('2d').drawImage(cv, 0, 0); } catch (e) { this.snap = null; }
    this.drawCursor(g);
    // fareyle okuma
    if (this.hoverPx && this.hoverPx[0] >= padL && this.hoverPx[0] <= padL + pw && this.hoverPx[1] >= padT - 4 && this.hoverPx[1] <= padT + ph + 4 && this.ser.length) {
      const xv = invX(this.hoverPx[0]);
      const rows = []; let xRef = null;
      const allDots = this.ser.every(q => q.dots);
      if (allDots) {
        let best = null, bd = 18 * 18;
        for (const q of this.ser) for (let i = 0; i < q.y.length; i++) { if (!isFinite(q.y[i]) || (yl && q.y[i] <= 0) || (xl && q.x[i] <= 0)) continue; const d2 = sq(X(q.x[i]) - this.hoverPx[0]) + sq(Y(q.y[i]) - this.hoverPx[1]); if (d2 < bd) { bd = d2; best = { q, i }; } }
        if (best) { xRef = best.q.x[best.i]; rows.push({ q: best.q, y: best.q.y[best.i] }); }
      } else {
        for (const q of this.ser) { const i = nearestIdx(q.x, xv, q.sorted); if (i < 0) continue; const xx = q.x[i]; if (Math.abs(X(xx) - this.hoverPx[0]) > 30) continue; if (xRef == null && !q.dots) xRef = xx; rows.push({ q, y: q.y[i], x: xx }); }
      }
      if (xRef != null && rows.length) {
        const x = X(xRef); g.strokeStyle = C.ink2; g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(x) + .5, padT); g.lineTo(Math.round(x) + .5, padT + ph); g.stroke(); g.globalAlpha = 1;
        for (const r of rows) { if (!isFinite(r.y) || (yl && r.y <= 0)) continue; const xx = r.x != null ? r.x : xRef; g.beginPath(); g.arc(X(xx), Y(r.y), 3.5, 0, Math.PI * 2); g.fillStyle = cssVar(r.q.colorVar); g.fill(); g.strokeStyle = C.surface; g.lineWidth = 1.5; g.stroke(); }
        this.tip.innerHTML = '<div class="h">' + esc(sig(xRef, 4)) + (sp.xLabel ? ' ' + esc(sp.xLabel) : '') + '</div>' +
          rows.map(r => '<div><i style="background:' + cssVar(r.q.colorVar) + '"></i>' + esc(r.q.name || '') + ' <b>' + esc(sig(r.y, 4)) + '</b>' + (sp.yUnit ? ' ' + esc(sp.yUnit) : '') + '</div>').join('');
        this.tip.hidden = false;
        const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
        let tx = x + 12; if (tx + tw > W) tx = x - tw - 12; tx = Math.max(0, tx);
        const ty = clamp(this.hoverPx[1] - th / 2 + this.cv.offsetTop, this.cv.offsetTop, this.cv.offsetTop + H - th);
        this.tip.style.left = tx + 'px'; this.tip.style.top = ty + 'px';
      } else this.tip.hidden = true;
    } else this.tip.hidden = true;
    g.restore();
  }
  destroy() { this.ro.disconnect(); Chart.all.delete(this); }
}
Chart.all = new Set();
Chart.redrawAll = () => { for (const c of Chart.all) if (c.host.isConnected) c.draw(); else c.destroy(); };
