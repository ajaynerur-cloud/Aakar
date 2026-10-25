/* ======================================================================
 * Aakar Tutorial Watch  (adds to the Tutorial Studio)
 *   Before a tutorial step is built, Watch shows it:
 *     1. the ribbon tab and the exact toolbar button, with a cursor and a pulsing ring
 *     2. for sketches: the plane, then the points appearing one by one (numbered, with coordinates) and the curve growing
 *     3. for features / edits / SubD operations / parameters: a dialog card whose fields fill in one at a time
 *   Then the Studio builds the real step exactly as before, so the model is identical with Watch on or off.
 *   Everything is derived from each step's own `build` recipe: no tutorial needs rewriting.
 *   Controls (under the player): Watch on/off, speed, cursor.  Skip = button or Esc.  Pause / close stop it.
 * ====================================================================== */
(function () {
  'use strict';
  var KEY = 'aakar.tutWatch', cfg = { on: true, speed: 1, cursor: true };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) cfg = Object.assign(cfg, saved); } catch (e0) { /* ignore */ }
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ on: cfg.on, speed: cfg.speed, cursor: cfg.cursor })); } catch (e) { /* ignore */ } };
  var $ = function (id) { return document.getElementById(id); };
  var T = function () { return window.AAKAR_TUTORIALS; }, P = function () { return window.PRISM; };
  var W = window.AAKAR_WATCH = { cfg: cfg, skip: false, playing: false, log: [], test: false };
  var OR = '#ff8a3d', TEAL = '#2fc4b8';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------------------------------------------------------------- style + overlay
  var css = document.createElement('style');
  css.textContent = '#aakWatch{position:fixed;inset:0;z-index:100100;pointer-events:none;display:none;font:13px/1.4 "Segoe UI",Arial,sans-serif;color:#dfe6f2}#aakWatch.on{display:block}' +
    '#aakWcur{position:fixed;left:0;top:0;width:26px;height:30px;transform:translate(-100px,-100px);transition:transform .7s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px #000b);z-index:5}#aakWcur.press svg{transform:scale(.82)}#aakWcur svg{transition:transform .12s}' +
    '#aakWring{position:fixed;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid ' + OR + ';opacity:0;z-index:4}#aakWring.on{animation:aakWr .9s ease-out infinite}#aakWring.on::after{content:"";position:absolute;inset:-12px;border-radius:50%;border:2px dashed ' + OR + ';opacity:.6}' +
    '@keyframes aakWr{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.25);opacity:.15}}' +
    '#aakWcap{position:fixed;left:0;top:0;max-width:430px;background:' + OR + ';color:#1a1208;font-weight:700;font-size:16px;padding:9px 14px;border-radius:10px;box-shadow:0 8px 24px #0009;z-index:6;display:none}' +
    '#aakWcap small{display:block;font-weight:500;font-size:13px;opacity:.85;margin-top:2px}' +
    '#aakWcard{position:fixed;background:#141b27;border:1px solid #3a4660;border-radius:14px;box-shadow:0 22px 60px #000d;z-index:3;display:none;overflow:hidden}' +
    '#aakWcard .wh{display:flex;align-items:center;gap:8px;padding:9px 13px;background:#1b2434;border-bottom:1px solid #2f3a52;font-weight:800;font-size:15px}#aakWcard .wh .sp{flex:1}' +
    '#aakWcard .pl{display:inline-block;padding:2px 9px;border-radius:12px;background:#10161f;border:1px solid #2f3a52;color:#8b98ae;font-size:12px;font-weight:700}#aakWcard .pl.on{background:#2c2015;border-color:' + OR + ';color:' + OR + '}' +
    '#aakWcard .wr{display:flex;align-items:center;gap:10px;padding:7px 13px;border-bottom:1px solid #1f2837;opacity:.45;transition:opacity .25s,background .25s}#aakWcard .wr.on{opacity:1;background:#2c2015}#aakWcard .wr.done{opacity:1}' +
    '#aakWcard .wb{width:22px;height:22px;border-radius:50%;background:' + OR + ';color:#1a1208;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none;visibility:hidden}#aakWcard .wr.on .wb,#aakWcard .wr.done .wb{visibility:visible}' +
    '#aakWcard .wl{flex:1;color:#c7d0e0}#aakWcard .wv{min-width:120px;max-width:190px;padding:4px 9px;border-radius:7px;background:#0d121a;border:1px solid #2b3548;font-family:Consolas,monospace;font-size:13px;color:#dfe6f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#aakWcard .wr.on .wv{border-color:' + OR + ';border-width:2px;color:' + OR + '}' +
    '#aakWcard .wv s{color:#7b879c;margin-right:6px}#aakWcard .wf{display:flex;justify-content:flex-end;gap:8px;padding:9px 13px}#aakWcard .ok{padding:6px 22px;border-radius:8px;background:#1d2534;border:1px solid #2b3548;color:#c7d0e0;font-weight:800}#aakWcard .ok.on{background:' + OR + ';border-color:' + OR + ';color:#1a1208}' +
    '#aakWskip{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);pointer-events:auto;cursor:pointer;background:#10161f;border:1px solid #3a4660;color:#dfe6f2;border-radius:20px;padding:6px 16px;font-weight:700;font-size:13px;z-index:7;box-shadow:0 6px 20px #000a}#aakWskip:hover{border-color:' + OR + ';color:' + OR + '}' +
    '#aakWctl{display:flex;align-items:center;gap:12px;padding:7px 12px;border-top:1px solid #2f3a52;background:#101620;font-size:12.5px;color:#aeb9cc;flex:none}#aakWctl label{display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}#aakWctl select{background:#0d121a;color:#dfe6f2;border:1px solid #2b3548;border-radius:5px;padding:1px 4px;font:inherit}#aakWctl b{color:' + OR + '}';
  document.head.appendChild(css);
  function root() {
    var r = $('aakWatch'); if (r) return r;
    r = document.createElement('div'); r.id = 'aakWatch';
    r.innerHTML = '<div id="aakWcard"></div><div id="aakWring"></div><div id="aakWcap"></div><div id="aakWcur"><svg viewBox="0 0 26 30" width="26" height="30"><path d="M2 1L2 22L7.6 17.2L11.6 26.6L15.2 25.1L11.2 16L18.6 15.8Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div><button id="aakWskip" type="button">Skip animation  (Esc)</button>';
    document.body.appendChild(r); $('aakWskip').onclick = function () { W.skip = true; }; return r;
  }

  // ---------------------------------------------------------------- timing
  var PL = function () { var t = T(); return t && t.state ? t.state().PL : null; };
  function aborted(p0) { var pl = PL(); if (!pl) return false; if (!p0 && pl.paused) return true; var tp = $('aakTP'); return !!(tp && !tp.classList.contains('open')); }
  function wait(ms, p0) {
    ms = Math.max(0, ms * cfg.speed);
    return new Promise(function (res) { var t0 = performance.now(); (function tick() { if (W.skip || aborted(p0) || performance.now() - t0 >= ms) return res(); setTimeout(tick, Math.min(40, Math.max(1, ms))); })(); });
  }
  var rectOf = function (el) { if (!el || !el.getBoundingClientRect) return null; var r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && el.offsetParent !== null ? r : null; };

  // ---------------------------------------------------------------- cursor / ring / caption
  var CT = { x: -100, y: -100 };
  function cursorTo(x, y, ms) {
    var c = $('aakWcur'); if (!c) return Promise.resolve(); if (!cfg.cursor) { c.style.display = 'none'; return Promise.resolve(); } c.style.display = '';
    c.style.transitionDuration = Math.max(1, ms * cfg.speed) + 'ms'; c.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; CT.x = x; CT.y = y; return wait(ms + 60);
  }
  async function press() { var c = $('aakWcur'); if (!c || !cfg.cursor) return; c.classList.add('press'); await wait(130); c.classList.remove('press'); }
  function ring(x, y, size) { var r = $('aakWring'); if (!r) return; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.width = r.style.height = size + 'px'; r.style.margin = (-size / 2) + 'px 0 0 ' + (-size / 2) + 'px'; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }
  function ringOff() { var r = $('aakWring'); if (r) r.classList.remove('on'); }
  function caption(text, sub, x, y, below) {
    var c = $('aakWcap'); if (!c) return; if (!text) { c.style.display = 'none'; return; }
    c.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : ''); c.style.display = 'block'; c.style.left = '0px'; c.style.top = '0px';
    var w = c.offsetWidth, h = c.offsetHeight, vw = window.innerWidth, vh = window.innerHeight; if (x == null) { x = vw / 2; y = 96; }
    var left = x - w / 2, top = below === false ? y - h - 14 : y + 14; if (top + h > vh - 8) top = y - h - 14; if (top < 6) top = 6;
    c.style.left = Math.max(8, Math.min(left, vw - w - 8)) + 'px'; c.style.top = top + 'px';
  }
  function clear() { var r = $('aakWatch'); if (r) r.classList.remove('on'); caption(null); ringOff(); var cd = $('aakWcard'); if (cd) { cd.style.display = 'none'; cd.innerHTML = ''; } var cu = $('aakWcur'); if (cu) cu.style.transform = 'translate(-100px,-100px)'; W.playing = false; }

  // ---------------------------------------------------------------- 1. the tool
  var TABNAME = { model: 'Model', part: 'Part', partx: 'Part+', assembly: 'Assembly', sheet: 'Sheet metal', surface: 'NURBS', nurbsx: 'NURBS+', subd: 'SubD', subdx: 'SubD+', bim: 'BIM', analysis: 'Analysis', drawing: 'Drawing', render: 'Render', cam: 'CAM', learn: 'Tutorials' };
  async function toolPhase(s, p0) {
    var tab = s.tab, tool = s.tool; if (!tool) return false; var out = { tab: false, button: false };
    var tb = tab && document.querySelector('#ribbon button[data-tab="' + tab + '"]'), tr = rectOf(tb);
    if (tr && !tb.classList.contains('on')) {
      await cursorTo(tr.left + tr.width / 2, tr.top + tr.height / 2, 650); caption('Open the ' + (TABNAME[tab] || tab) + ' tab', null, tr.left + tr.width / 2, tr.bottom + 4); ring(tr.left + tr.width / 2, tr.top + tr.height / 2, Math.max(tr.width, 40) + 16);
      await wait(550, p0); await press(); try { P().setTab(tab); } catch (e) { /* ignore */ } out.tab = true; await wait(260, p0); ringOff();
    } else if (tab) { try { P().setTab(tab); } catch (e1) { /* ignore */ } await wait(120, p0); }
    var b = $('tb-' + tool);
    if (!b || !rectOf(b)) { for (var q of Object.keys(TABNAME)) { if (rectOf($('tb-' + tool))) break; try { P().setTab(q); } catch (e2) { /* ignore */ } await wait(30, p0); } b = $('tb-' + tool); if (b && tab) { try { P().setTab(tab); } catch (e3) { /* ignore */ } } }
    var r = rectOf(b);
    if (r) {
      try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e4) { /* ignore */ } r = rectOf(b) || r;
      var lab = (b.querySelector('span') ? b.querySelector('span').textContent : b.title) || tool, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      await cursorTo(cx, cy, 750); ring(cx, cy, Math.max(r.width, r.height) + 14); caption('Click “' + lab.trim() + '”', s.toolPath || null, cx, r.bottom + 4); await wait(1000, p0); await press(); await wait(250, p0); out.button = true;
    } else { caption('Use: ' + (s.toolPath || tool), 'This toolbar group is in a menu in your UI style: use Tools or Search.', null, null); await wait(1500, p0); }
    ringOff(); W.log.push({ phase: 'tool', tool: tool, tab: out.tab, button: out.button }); return out.button;
  }

  // ---------------------------------------------------------------- geometry helpers (sketch card)
  var AX = { XY: ['X', 'Y'], XZ: ['X', 'Z'], YZ: ['Y', 'Z'] };
  function crPath(pts) {
    var n = pts.length; if (n < 2) return ''; var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < n - 1; i++) { var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)]; d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1); }
    return d;
  }
  function niceStep(span) { var raw = span / 6, m = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / m; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * m; }
  function sketchPoints(ents) { var all = []; (ents || []).forEach(function (e) { if (e.t === 'circle') { all.push([e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]); } else if (e.t === 'rect') { all.push([e.c[0] - e.w / 2, e.c[1] - e.h / 2], [e.c[0] + e.w / 2, e.c[1] + e.h / 2]); } else (e.pts || []).forEach(function (q) { all.push([q[0], q[1]]); }); }); return all; }
  function availRect() {
    var vp = $('viewport'), r = vp && vp.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    var L = r ? Math.max(0, r.left) : 0, Tp = r ? Math.max(40, r.top) : 60, R = r ? Math.min(vw, r.right) : vw, B = r ? Math.min(vh, r.bottom) : vh - 40;
    var tp = $('aakTP'); if (tp && tp.classList.contains('open')) { var q = tp.getBoundingClientRect(); if (q.width > 0) R = Math.min(R, q.left - 10); }
    return { l: L, t: Tp, r: R, b: B };
  }
  async function sketchPhase(v, p0) {
    var a = availRect(), cw = Math.max(320, Math.min(580, a.r - a.l - 36)), ch = Math.max(300, Math.min(430, a.b - a.t - 110)), cd = $('aakWcard'), plane = (v.plane || 'XY'), ax = AX[plane] || ['X', 'Y'];
    cd.style.cssText = 'display:block;left:' + (a.l + 18) + 'px;top:' + (a.t + 52) + 'px;width:' + cw + 'px;height:' + ch + 'px';
    var dw = cw - 2, dh = ch - 46 - 38, pts = sketchPoints(v.ents); if (!pts.length) { return; }
    var mn = [Math.min.apply(0, pts.map(function (p) { return p[0]; })), Math.min.apply(0, pts.map(function (p) { return p[1]; }))], mx = [Math.max.apply(0, pts.map(function (p) { return p[0]; })), Math.max.apply(0, pts.map(function (p) { return p[1]; }))];
    var padL = 44, padB = 30, padT = 14, padR = 14, sx = (dw - padL - padR) / Math.max(1e-6, mx[0] - mn[0] || 1), sy = (dh - padB - padT) / Math.max(1e-6, mx[1] - mn[1] || 1), sc = Math.min(sx, sy) * 0.86;
    var ox = padL + ((dw - padL - padR) - (mx[0] - mn[0]) * sc) / 2 - mn[0] * sc, oy = dh - padB - ((dh - padB - padT) - (mx[1] - mn[1]) * sc) / 2 + mn[1] * sc;
    var X = function (x) { return ox + x * sc; }, Y = function (y) { return oy - y * sc; };
    var st = { n: 0, ents: [], list: [], cur: null };
    function grid() {
      var vx0 = (padL - ox) / sc, vx1 = (dw - padR - ox) / sc, vy0 = (oy - (dh - padB)) / sc, vy1 = (oy - padT) / sc, g = niceStep(Math.max(vx1 - vx0, vy1 - vy0) * 0.8), s = '';
      var lx = function (v, ver) { var zero = Math.abs(v) < 1e-9; return 'stroke="' + (zero ? '#4b6a8f' : '#1a2332') + '" stroke-width="' + (zero ? 1.6 : 1) + '"' + (zero ? ' stroke-dasharray="7 5"' : ''); };
      for (var gxv = Math.ceil(vx0 / g) * g; gxv <= vx1 + 1e-9; gxv += g) { var px = X(gxv); s += '<line x1="' + px + '" y1="' + padT + '" x2="' + px + '" y2="' + (dh - padB) + '" ' + lx(gxv) + '/><text x="' + px + '" y="' + (dh - padB + 15) + '" fill="#6f8db3" font-size="11" text-anchor="middle">' + (+gxv.toFixed(2)) + '</text>'; }
      for (var gyv = Math.ceil(vy0 / g) * g; gyv <= vy1 + 1e-9; gyv += g) { var py = Y(gyv); s += '<line x1="' + padL + '" y1="' + py + '" x2="' + (dw - padR) + '" y2="' + py + '" ' + lx(gyv) + '/><text x="' + (padL - 6) + '" y="' + (py + 4) + '" fill="#6f8db3" font-size="11" text-anchor="end">' + (+gyv.toFixed(2)) + '</text>'; }
      return s + '<text x="' + (dw - padR) + '" y="' + (dh - 4) + '" fill="#8fb0d8" font-size="12" text-anchor="end" font-weight="700">' + ax[0] + ' →</text><text x="4" y="' + (padT + 4) + '" fill="#8fb0d8" font-size="12" font-weight="700">' + ax[1] + ' ↑</text>';
    }
    function render(finish) {
      var s = '<svg width="' + dw + '" height="' + dh + '" style="display:block;background:#0d121a">' + grid(), g = '';
      st.ents.forEach(function (e) {
        var P2 = e.px.map(function (q) { return [X(q[0]), Y(q[1])]; });
        if (e.t === 'spline' && P2.length > 1) g += '<path d="' + crPath(e.closed && e.done ? P2.concat([P2[0], P2[1]]) : P2) + '" fill="none" stroke="' + TEAL + '" stroke-width="3.4" stroke-linecap="round"/>';
        else if (e.t === 'poly' && P2.length > 1) g += '<polyline points="' + (e.closed && e.done ? P2.concat([P2[0]]) : P2).map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '" fill="' + (e.closed && e.done ? 'rgba(47,196,184,.10)' : 'none') + '" stroke="' + TEAL + '" stroke-width="3.2" stroke-linejoin="round"/>';
        else if (e.t === 'rect' && P2.length > 1) g += '<rect x="' + Math.min(P2[0][0], P2[1][0]) + '" y="' + Math.min(P2[0][1], P2[1][1]) + '" width="' + Math.abs(P2[1][0] - P2[0][0]) + '" height="' + Math.abs(P2[1][1] - P2[0][1]) + '" fill="rgba(47,196,184,.10)" stroke="' + TEAL + '" stroke-width="3"/>';
        else if (e.t === 'circle' && P2.length) g += '<circle cx="' + P2[0][0] + '" cy="' + P2[0][1] + '" r="' + (e.r * sc * (e.k || 0)) + '" fill="rgba(47,196,184,.10)" stroke="' + TEAL + '" stroke-width="3"/>';
        P2.forEach(function (q, k) { var cur = e === st.cur && k === P2.length - 1 && !finish; g += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (cur ? 7 : 5) + '" fill="' + (cur ? '#fff' : TEAL) + '" stroke="#0d121a" stroke-width="2"/>'; if (e.nums && e.nums[k] && st.n <= 60) g += '<circle cx="' + (q[0] + 13).toFixed(1) + '" cy="' + (q[1] - 13).toFixed(1) + '" r="10" fill="' + OR + '"/><text x="' + (q[0] + 13).toFixed(1) + '" y="' + (q[1] - 8.5).toFixed(1) + '" fill="#1a1208" font-size="12.5" font-weight="800" text-anchor="middle">' + e.nums[k] + '</text>'; });
      });
      s += g;
      var rows = st.list.slice(-7), bx = dw - padR - 168; s += '<rect x="' + bx + '" y="' + padT + '" width="164" height="' + (rows.length * 18 + 26) + '" rx="8" fill="#141b27" fill-opacity=".92" stroke="#2f3a52"/><text x="' + (bx + 10) + '" y="' + (padT + 17) + '" fill="#fff" font-size="12" font-weight="800">Points  (' + ax[0] + ', ' + ax[1] + ')</text>';
      rows.forEach(function (r, i) { s += '<text x="' + (bx + 10) + '" y="' + (padT + 36 + i * 18) + '" fill="' + (i === rows.length - 1 && !finish ? OR : '#c7d0e0') + '" font-size="12.5" font-family="Consolas,monospace">' + esc(r) + '</text>'; });
      cd.querySelector('.wd').innerHTML = s + '</svg>';
    }
    cd.innerHTML = '<div class="wh"><span>✏ Sketch “' + esc(v.name || 'Sketch') + '”</span><span class="sp"></span>' + ['XY', 'XZ', 'YZ'].map(function (n) { return '<span class="pl' + (n === plane ? ' on' : '') + '">' + n + '</span>'; }).join('') + (v.offset ? '<span class="pl on">+' + v.offset + ' mm</span>' : '') + '</div><div class="wd"></div><div class="wf" style="justify-content:space-between;align-items:center"><span style="color:#8b98ae;font-size:12.5px">' + ({ XY: 'top view', XZ: 'front view (X = radius, Z = height)', YZ: 'side view' }[plane] || '') + '</span><span class="ok" id="aakWfin">✓ Finish sketch</span></div>';
    var cardR = cd.getBoundingClientRect(), dr = cd.querySelector('.wd').getBoundingClientRect(), total = pts.length, per = Math.max(60, Math.min(520, 3600 / Math.max(1, total)));
    var screen = function (x, y) { return [dr.left + X(x), dr.top + Y(y)]; };
    caption('Draw the sketch', plane + ' plane' + (v.offset ? ', offset ' + v.offset + ' mm' : ''), cardR.left + cardR.width / 2, cardR.top - 6, false);
    render(); await wait(500, p0);
    for (var ei = 0; ei < (v.ents || []).length && !W.skip && !aborted(p0); ei++) {
      var e = v.ents[ei], ent = { t: e.t, px: [], nums: [], closed: !!e.closed, r: e.r || 0, k: 0 }; st.ents.push(ent); st.cur = ent;
      var seq = e.t === 'circle' ? [e.c] : e.t === 'rect' ? [[e.c[0] - e.w / 2, e.c[1] - e.h / 2], [e.c[0] + e.w / 2, e.c[1] + e.h / 2]] : (e.pts || []);
      for (var k = 0; k < seq.length && !W.skip && !aborted(p0); k++) {
        var q = seq[k]; ent.px.push([q[0], q[1]]); st.n++; ent.nums.push(st.n); st.list.push(st.n + '   (' + (+q[0].toFixed(2)) + ', ' + (+q[1].toFixed(2)) + ')'); if (e.t === 'circle') ent.k = 0.05;
        var sp = screen(q[0], q[1]); await cursorTo(sp[0], sp[1], per * 0.8); render(); ring(sp[0], sp[1], 30); await press(); await wait(per * 0.25, p0);
      }
      if (e.t === 'circle') for (var kk = 0.35; kk <= 1.01 && !W.skip && !aborted(p0); kk += 0.33) { ent.k = Math.min(1, kk); render(); await wait(130, p0); }
      ent.done = true; render();
    }
    ringOff(); render(true); var fin = $('aakWfin'), fr = rectOf(fin);
    if (fr && !W.skip && !aborted(p0)) { await cursorTo(fr.left + fr.width / 2, fr.top + fr.height / 2, 600); fin.classList.add('on'); ring(fr.left + fr.width / 2, fr.top + fr.height / 2, fr.width + 16); caption('Finish the sketch', 'Enter, or the Finish button', fr.left + fr.width / 2, fr.top - 6, false); await wait(650, p0); await press(); await wait(300, p0); ringOff(); }
    W.log.push({ phase: 'sketch', name: v.name, points: st.n, plane: plane });
    cd.style.display = 'none'; caption(null);
  }

  // ---------------------------------------------------------------- dialog card (features, edits, SubD, parameters)
  function nameOf(k) {
    try { var ids = T().state().ids || {}, id = ids[k]; if (!id) return k; var f = P().st.doc.features.filter(function (x) { return x.id === id; })[0]; return f ? f.name : k; } catch (e) { return k; }
  }
  function fmt(v, opts) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? '☑ on' : '☐ off';
    if (typeof v === 'number') return String(+v.toFixed(4));
    if (typeof v === 'string') { var s = v.replace(/\$([A-Za-z_][\w-]*)/g, function (m, k) { return '“' + nameOf(k) + '”'; }); if (opts) { var o = opts.filter(function (q) { return String(Array.isArray(q) ? q[0] : q) === v; })[0]; if (o && Array.isArray(o)) s = o[1]; } return s; }
    if (Array.isArray(v)) { if (v.every(function (x) { return typeof x === 'number'; })) return v.map(function (x) { return +x.toFixed(3); }).join(', '); if (v.every(function (x) { return typeof x === 'string'; })) return v.map(function (x) { return fmt(x); }).join(', '); return v.length + ' items'; }
    if (typeof v === 'object') { var j = JSON.stringify(v); return j.length < 38 ? j.replace(/"/g, '') : '(a selection)'; }
    return String(v);
  }
  var pretty = function (k) { return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) { return c.toUpperCase(); }); };
  function selDesc(v) {
    if (v.mode === 'all' || v.faces === 'all') return 'all faces'; if (v.mode) return String(v.mode);
    if (v.faces && typeof v.faces === 'object') { var f = v.faces; if (f.near) return 'the face near (' + f.near.slice(0, 3).map(function (x) { return +x; }).join(', ') + ')'; if (f.box) return 'faces inside a box' + (f.n ? ' facing ' + f.n : ''); if (f.n) return 'faces facing ' + f.n; } return v.faces ? 'a face selection' : '';
  }
  function rowsFor(op) {
    var k = Object.keys(op)[0], v = op[k], rows = [], title = '', tool = '';
    try {
      if (k === 'feature' || k === 'sdx' || k === 'update') {
        var type = v.type, feat = null, cur = {};
        if (k === 'update') { var ids = T().state().ids || {}; feat = P().st.doc.features.filter(function (x) { return x.id === ids[v.ref]; })[0]; if (feat) { type = feat.type; cur = feat.params || {}; } }
        var spec = {}; try { var ui = P().FUI[type] && P().FUI[type]({ params: Object.assign({}, cur, v.params || {}) }, P().st.state || CAD.feat.regen(P().st.doc)); if (ui) ui.fields.forEach(function (f) { spec[f.key] = f; }); } catch (e1) { /* ignore */ }
        title = k === 'update' ? 'Edit  “' + (feat ? feat.name : nameOf(v.ref)) + '”' : ((CAD.featNames && CAD.featNames[type]) || type) + '  —  “' + v.name + '”';
        Object.keys(v.params || {}).forEach(function (pk) {
          var nv = v.params[pk]; if (nv === '' || nv == null) return; if (k === 'update' && cur && JSON.stringify(cur[pk]) === JSON.stringify(nv)) return;
          if (pk === 'data' && k === 'update') { rows.push({ l: 'Sketch geometry', v: '(edited points)', old: null }); return; }
          var fld = spec[pk] || spec[pk + '0'], lab = fld ? (fld.label || pretty(pk)) : pretty(pk);
          rows.push({ l: lab.replace(/\s*\(.*\)$/, ''), v: fmt(nv, fld && fld.options), old: k === 'update' && cur[pk] !== undefined ? fmt(cur[pk], fld && fld.options) : null });
        });
      } else if (k === 'sdop') {
        title = 'SubD  ' + v.op + '  —  “' + v.name + '”'; var sd = selDesc(v); if (sd) rows.push({ l: 'Applies to', v: sd });
        Object.keys(v.params || {}).forEach(function (pk) { rows.push({ l: pretty(pk), v: fmt(v.params[pk]) }); });
      } else if (k === 'param') { title = 'Global parameter'; rows.push({ l: v.name, v: String(v.expr) }); }
      else if (k === 'link') { title = 'Link a value to a parameter'; rows.push({ l: nameOf(v.ref) + ' · ' + pretty(v.key), v: '= ' + v.expr }); }
      else if (k === 'fillet' || k === 'chamfer') { title = (k === 'fillet' ? 'Fillet' : 'Chamfer') + (v.name ? '  —  “' + v.name + '”' : ''); rows.push({ l: k === 'fillet' ? 'Radius' : 'Distance', v: fmt(v.r) + ' mm' }); rows.push({ l: 'Edges', v: fmt(v.edges) }); }
      else if (k === 'hole') { title = 'Hole  —  “' + (v.name || 'Hole') + '”'; rows.push({ l: 'Diameter', v: (v.d || 6) + ' mm' }); rows.push({ l: 'Depth', v: v.depth ? v.depth + ' mm' : 'through all' }); rows.push({ l: 'Offset', v: (v.du || 0) + ', ' + (v.dv || 0) }); }
      else if (k === 'shell') { title = 'Shell  —  “' + (v.name || 'Shell') + '”'; rows.push({ l: 'Wall thickness', v: v.thickness + ' mm' }); }
      else if (k === 'project') { title = 'Project edges  —  “' + v.name + '”'; rows.push({ l: 'Onto plane', v: (v.plane || 'XY') + ' + ' + (v.offset || 0) + ' mm' }); }
    } catch (e) { /* fall through with what we have */ }
    return { title: title, rows: rows.slice(0, 11), more: Math.max(0, rows.length - 11) };
  }
  async function dialogPhase(op, p0) {
    var d = rowsFor(op); if (!d.title || !d.rows.length) return false;
    var a = availRect(), cw = Math.max(340, Math.min(470, a.r - a.l - 36)), cd = $('aakWcard'), n = d.rows.length;
    cd.style.cssText = 'display:block;left:' + (a.l + 18) + 'px;top:' + (a.t + 56) + 'px;width:' + cw + 'px';
    cd.innerHTML = '<div class="wh"><span>' + esc(d.title) + '</span></div>' + d.rows.map(function (r, i) { return '<div class="wr" id="aakWr' + i + '"><span class="wb">' + (i + 1) + '</span><span class="wl">' + esc(r.l) + '</span><span class="wv">' + (r.old != null ? '<s>' + esc(r.old) + '</s>' : '') + '<span class="vv"></span></span></div>'; }).join('') + (d.more ? '<div class="wr" style="opacity:.7"><span class="wl">… and ' + d.more + ' more value' + (d.more > 1 ? 's' : '') + '</span></div>' : '') + '<div class="wf"><span class="ok" id="aakWok">OK</span></div>';
    var cr = cd.getBoundingClientRect(); caption('Fill in the values', 'Each field lights up in turn', cr.left + cr.width / 2, cr.top - 6, false);
    var per = Math.max(260, Math.min(600, 4200 / n));
    for (var i = 0; i < n && !W.skip && !aborted(p0); i++) {
      var row = $('aakWr' + i), vv = row.querySelector('.vv'), vb = row.querySelector('.wv'), br = rectOf(vb);
      row.classList.add('on'); if (br) { await cursorTo(br.left + br.width * 0.7, br.top + br.height / 2, per * 0.55); ring(br.left + br.width * 0.7, br.top + br.height / 2, 46); }
      var txt = d.rows[i].v, steps = Math.min(txt.length, 8); for (var c = 1; c <= steps && !W.skip; c++) { vv.textContent = txt.slice(0, Math.ceil(txt.length * c / steps)); await wait(per * 0.3 / steps, p0); }
      vv.textContent = txt; await wait(per * 0.25, p0); row.classList.remove('on'); row.classList.add('done'); ringOff();
    }
    var ok = $('aakWok'), orr = rectOf(ok);
    if (orr && !W.skip && !aborted(p0)) { await cursorTo(orr.left + orr.width / 2, orr.top + orr.height / 2, 500); ok.classList.add('on'); ring(orr.left + orr.width / 2, orr.top + orr.height / 2, 54); await wait(450, p0); await press(); await wait(200, p0); ringOff(); }
    W.log.push({ phase: 'dialog', title: d.title, rows: n }); cd.style.display = 'none'; caption(null); return true;
  }

  // ---------------------------------------------------------------- one step
  async function play(c, i, opt) {
    opt = opt || {}; if (W.playing) return; var s = c.steps[i]; if (!s || !(s.build || []).length) return;
    var pl = PL(), p0 = pl ? !!pl.paused : false; W.skip = false; W.playing = true; var savedSpeed = cfg.speed; if (opt.speed != null) cfg.speed = opt.speed;
    root().classList.add('on'); $('aakWskip').style.display = opt.noSkip ? 'none' : '';
    try {
      caption('Step ' + (i + 1) + ' of ' + c.steps.length, s.title, null, null); await wait(1100, p0);
      var ops = s.build, first = true, budget = ops.length > 3 ? 2 : ops.length;
      if (s.tool) await toolPhase(s, p0);
      for (var k = 0; k < ops.length && !W.skip && !aborted(p0); k++) {
        var op = ops[k], key = Object.keys(op)[0];
        if (k >= budget) { caption('+ ' + (ops.length - k) + ' more in this step', 'built together', null, null); await wait(900, p0); break; }
        if (key === 'sketch') await sketchPhase(op.sketch, p0);
        else if (key === 'view' || key === 'tab' || key === 'note' || key === 'new') { /* nothing to show */ }
        else if (key === 'analysis') { var on = Object.keys(op.analysis).filter(function (q) { return op.analysis[q]; }); caption('Turn on the overlay: ' + on.join(' + '), (s.checkpoint && s.checkpoint.expected) || null, null, null); await wait(1700, p0); }
        else { var shown = await dialogPhase(op, p0); if (!shown) { var ds = T().describe(op); caption(ds.h, ds.s, null, null); await wait(1500, p0); } }
        first = false;
      }
    } catch (e) { W.log.push({ phase: 'error', message: String(e && e.message || e) }); }
    cfg.speed = savedSpeed; clear();
  }
  W.play = play; W.enabled = function () { return !!cfg.on; }; W.stop = function () { W.skip = true; clear(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && W.playing) { W.skip = true; e.stopPropagation(); } }, true);

  // ---------------------------------------------------------------- controls under the player
  function ctl() {
    var tp = $('aakTP'); if (!tp || $('aakWctl')) return;
    var d = document.createElement('div'); d.id = 'aakWctl';
    d.innerHTML = '<label title="Show the tool, the sketch and the dialog before each step is built"><input type="checkbox" id="aakWon"' + (cfg.on ? ' checked' : '') + '> <b>▶ Watch</b> each step</label><label>Watch pace <select id="aakWsp"><option value="1.7">Slow</option><option value="1">Normal</option><option value="0.5">Fast</option></select></label><label><input type="checkbox" id="aakWcu"' + (cfg.cursor ? ' checked' : '') + '> cursor</label>';
    tp.appendChild(d); $('aakWsp').value = String(cfg.speed);
    $('aakWon').onchange = function (e) { cfg.on = e.target.checked; save(); }; $('aakWsp').onchange = function (e) { cfg.speed = +e.target.value; save(); }; $('aakWcu').onchange = function (e) { cfg.cursor = e.target.checked; save(); };
  }
  function boot() { var tp = $('aakTP'); if (!tp) return setTimeout(boot, 400); ctl(); new MutationObserver(function () { if (!$('aakWctl')) ctl(); }).observe(tp, { childList: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
