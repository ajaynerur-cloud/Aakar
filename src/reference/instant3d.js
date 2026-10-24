/* ======================================================================
 * Aakar 8.16 · INSTANT3D — a feature's dimensions on the model, drag them or click to type
 *   • click a face / edge / body (or pick a feature in the list) → its dimensions appear as arrows + values on the part
 *   • drag an arrow: live preview, snapped to the grid snap (Shift = free), release to commit (one undo step)
 *   • click a value to type it (expressions such as 40/2+5 work)
 *   • sketch dimensions of the feature are shown through the existing 3D sketch labels
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, IK = CAD && CAD.ik, F = CAD && CAD.feat, RG = CAD && CAD.ref, K = CAD && CAD.sketch;
  if (!RG || !IK || !K || !F) return;
  const st = P.st, R = P.R, A = RG.A, V = A.V, { toast, status, esc, fmt } = IK;
  const I = RG.i3d = { on: false, f: null, hs: [], drag: null, saved: null };
  const layer = document.createElement('div'); layer.id = 'i3dLayer'; IK.vp.appendChild(layer);
  const bar = document.createElement('div'); bar.id = 'i3dBar'; IK.vp.appendChild(bar);
  const evalNum = (s) => { s = String(s).trim(); if (!/^[\d\s.+\-*/()eE]+$/.test(s)) return NaN; try { return Function('"use strict";return (' + s + ')')(); } catch (e) { return NaN; } };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LBL = { w: 'Width', d: 'Depth', h: 'Height', r: 'Radius', R: 'Major radius', rt: 'Top radius', dist: 'Distance', dist2: 'Opposite distance', thickness: 'Wall thickness', angle: 'Angle', n: 'Count', offset: 'Offset', segs: 'Facets', s: 'Facets', t: 'Thickness', scale: 'Scale', twist: 'Twist', spacing: 'Spacing', count: 'Count', depth: 'Depth', wall: 'Wall', pitch: 'Pitch', turns: 'Turns', taper: 'Taper', width: 'Width', height: 'Height', length: 'Length', dx: 'Step X', dy: 'Step Y', dz: 'Step Z' };

  // ------------------------------------------------------------------ handles per feature type
  const bbOf = (S, key) => { const b = S.bodies.get(key); return b ? b.solid.bbox() : null; };
  const ctr = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const HD = (o) => Object.assign({ kind: 'len', scale: 1, unit: 'mm', min: -1e6, max: 1e6, drag: true }, o);
  const firstBody = (S) => { const b = S.bodies.values().next().value; return b ? b.solid.bbox() : null; };
  const B = {
    primitive(f, p, S) {
      const b = bbOf(S, f.id); if (!b) return null; const c = ctr(b), L = [], hd = (key, label, a, dir, min) => L.push(HD({ key, label, a, dir, value: +p[key], min: min == null ? 0.001 : min })), k = p.kind;
      if (k === 'box' || k === 'wedge') { hd('w', 'Width', [b.min[0], b.min[1], b.min[2]], [1, 0, 0]); hd('d', 'Depth', [b.max[0], b.min[1], b.min[2]], [0, 1, 0]); hd('h', 'Height', [b.max[0], b.max[1], b.min[2]], [0, 0, 1]); }
      else if (k === 'cyl' || k === 'hex') { hd('r', 'Radius', [c[0], c[1], b.max[2]], [1, 0, 0]); hd('h', 'Height', [b.max[0], c[1], b.min[2]], [0, 0, 1]); }
      else if (k === 'sph') hd('r', 'Radius', c, [1, 0, 0]);
      else if (k === 'cone') { hd('r', 'Base radius', [c[0], c[1], b.min[2]], [1, 0, 0]); hd('rt', 'Top radius', [c[0], c[1], b.max[2]], [1, 0, 0], 0); hd('h', 'Height', [b.max[0], c[1], b.min[2]], [0, 0, 1]); }
      else if (k === 'tor') { hd('R', 'Major radius', c, [1, 0, 0]); hd('r', 'Minor radius', [c[0] + (+p.R || 0), c[1], c[2]], [0, 0, 1]); }
      return L;
    },
    extrude(f, p, S) {
      const sk = S.sketches.get(p.sketch); if (!sk) return null; const bx = K.bbox(sk.data), a = F.to3(sk.plane, [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2]), n = sk.plane.n, L = [];
      if (p.symmetric) L.push(HD({ key: 'dist', label: 'Distance (symmetric)', a, dir: n, value: +p.dist, scale: 0.5, min: 0.001 }));
      else { L.push(HD({ key: 'dist', label: 'Distance', a, dir: n, value: +p.dist })); if (+p.dist2) L.push(HD({ key: 'dist2', label: 'Opposite distance', a, dir: V.mul(n, -1), value: +p.dist2, min: 0 })); }
      return L;
    },
    revolve(f, p, S) { const sk = S.sketches.get(p.sketch); if (!sk) return null; const bx = K.bbox(sk.data); return [HD({ key: 'angle', label: 'Angle', kind: 'ang', unit: '°', drag: false, a: F.to3(sk.plane, [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2]), dir: null, value: p.angle == null ? 360 : +p.angle })]; },
    fillet(f, p, S) {
      const e = p.edges && p.edges[0]; if (!e) return null; const mid = V.lerp(e.a, e.b, 0.5), b = bbOf(S, p.body); let d = V.sub(mid, b ? ctr(b) : mid); d = V.norm(V.sub(d, V.mul(e.e, V.dot(d, e.e)))); if (V.len(d) < 0.5) d = [0, 0, 1];
      return [HD({ key: 'r', label: f.type === 'fillet' ? 'Radius' : 'Distance', a: mid, dir: V.mul(d, -1), value: +p.r, min: 0.001 })];
    },
    shell(f, p, S) {
      const fr = p.faces && p.faces[0]; let a, dir;
      if (fr) { a = fr.p; dir = V.mul(fr.n, -1); } else { const b = bbOf(S, p.body); if (!b) return null; const c = ctr(b); a = [c[0], c[1], b.max[2]]; dir = [0, 0, -1]; }
      return [HD({ key: 'thickness', label: 'Wall thickness', a, dir, value: +p.thickness, min: 0.001 })];
    },
    faceExtrude(f, p, S) { const fr = p.faces && p.faces[0]; return fr ? [HD({ key: 'dist', label: 'Distance (− cuts)', a: fr.p, dir: fr.n, value: +p.dist })] : null; },
    linearPattern(f, p, S) {
      const b = bbOf(S, p.body); if (!b) return null; const c = ctr(b), v = [+p.dx || 0, +p.dy || 0, +p.dz || 0], l = V.len(v), L = [], n = Math.max(2, p.n | 0);
      if (l > 1e-9) L.push(HD({ key: '#step', label: 'Step', a: c, dir: V.mul(v, 1 / l), value: l, min: 0.001, set: (np, val) => { const k = val / l; np.dx = v[0] * k; np.dy = v[1] * k; np.dz = v[2] * k; } }));
      L.push(HD({ key: 'n', label: 'Count', kind: 'cnt', unit: '', drag: false, a: V.madd(c, v, n - 1), dir: null, value: n, min: 2, int: true })); return L;
    },
    copy(f, p, S) { const b = bbOf(S, p.body); if (!b) return null; const c = ctr(b), v = [+p.dx || 0, +p.dy || 0, +p.dz || 0], l = V.len(v); return l > 1e-9 ? [HD({ key: '#step', label: 'Offset', a: c, dir: V.mul(v, 1 / l), value: l, min: 0.001, set: (np, val) => { const k = val / l; np.dx = v[0] * k; np.dy = v[1] * k; np.dz = v[2] * k; } })] : null; },
    circularPattern(f, p, S) { const b = bbOf(S, p.body); if (!b) return null; const c = ctr(b); return [HD({ key: 'n', label: 'Count', kind: 'cnt', unit: '', drag: false, a: c, dir: null, value: Math.max(2, p.n | 0), min: 2, int: true }), HD({ key: 'angle', label: 'Total angle', kind: 'ang', unit: '°', drag: false, a: [c[0], c[1], c[2] - 8], dir: null, value: +p.angle })]; },
    mirror(f, p, S) { const k = { YZ: 0, XZ: 1, XY: 2 }[p.plane || 'YZ']; if (k == null || p.at !== 'origin') return null; const d = [0, 0, 0]; d[k] = 1; return [HD({ key: 'offset', label: 'Plane offset', a: [0, 0, 0], dir: d, value: +p.offset || 0 })]; },
    refPlane(f, p, S) { const r = S.refs && S.refs.get(f.id); if ((p.mode === 'offset') && r) return [HD({ key: 'dist', label: 'Offset', a: V.madd(r.o, r.n, -num0(p.dist) * (p.flip ? -1 : 1)), dir: V.mul(r.n, p.flip ? -1 : 1), value: num0(p.dist) })]; if (p.mode === 'angle' && r) return [HD({ key: 'angle', label: 'Angle', kind: 'ang', unit: '°', drag: false, a: r.o, dir: null, value: num0(p.angle) })]; return null; }
  };
  const num0 = (x) => (isFinite(+x) ? +x : 0);
  B.chamfer = B.fillet;
  const SKIP = new Set(['segs', 's', 'la', 'lo', 'u', 'v', 'res', 'seg', 'hide']);
  function numbersFallback(f, p, S, have) {
    const out = [], skip = new Set(have.map((h) => h.key)), b = bbOf(S, f.id) || bbOf(S, p.body) || firstBody(S); if (!b) return out;
    const c = ctr(b); let i = 0;
    Object.keys(p).forEach((k) => { const v = p[k]; if (typeof v !== 'number' || !isFinite(v) || skip.has(k) || SKIP.has(k)) return; out.push(HD({ key: k, label: LBL[k] || k, kind: 'num', unit: '', drag: false, a: [c[0], c[1], b.max[2]], dir: null, value: v, stack: i++, int: Number.isInteger(v) && Math.abs(v) < 1000 && /^(n|count|segs|s)$/.test(k) })); });
    return out;
  }
  function handlesFor(f, p, S) {
    if (!f || f.type === 'sketch') return [];
    let L = []; try { L = (B[f.type] && B[f.type](f, p, S)) || []; } catch (e) { L = []; }
    return L.concat(numbersFallback(f, p, S, L));
  }

  // ------------------------------------------------------------------ DOM
  function chipText(h) { return '<span class="l">' + esc(h.label) + '</span>' + fmt(h.value) + (h.unit ? '<i>' + h.unit + '</i>' : ''); }
  function mount() {
    layer.innerHTML = '';
    I.hs.forEach((h, i) => {
      const c = document.createElement('div'); c.className = 'i3d-chip' + (h.drag ? '' : ' flat'); c.dataset.i = i; c.innerHTML = chipText(h); c.title = h.label + ' — click to type a value'; layer.appendChild(c); h.el = c;
      if (h.drag) { const g = document.createElement('div'); g.className = 'i3d-grip'; g.dataset.i = i; g.title = 'Drag to change ' + h.label.toLowerCase() + ' (Shift = no snap)'; g.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h12M12 6l6 6-6 6"/></svg>'; layer.appendChild(g); h.grip = g; }
    });
    updateBar();
  }
  function refresh(np, S) { // new numbers, same elements
    const fresh = handlesFor(I.f, np, S); if (fresh.length !== I.hs.length) { I.hs = fresh; mount(); return; }
    fresh.forEach((n, i) => { const o = I.hs[i]; Object.assign(o, { a: n.a, dir: n.dir, value: n.value, min: n.min, max: n.max, scale: n.scale }); if (o.el && !(I.edit && I.edit === o)) o.el.innerHTML = chipText(o); });
  }
  function updateBar() {
    bar.classList.toggle('on', I.on && !st.sketching);
    if (!I.on) return;
    const f = I.f, nm = f ? esc(f.name) : '';
    bar.innerHTML = '<b>Instant3D</b>' + (f ? '<span class="f">' + nm + '</span><button data-a="prev" title="Previous feature">◀</button><button data-a="next" title="Next feature">▶</button>' : '') + '<span class="h">' + (f ? (I.hs.length || hasSketch(f) ? 'Drag an arrow or click a value' : 'This feature has no editable values') : 'Click a face, edge or body — or pick a feature in the list') + '</span><button data-a="off" title="Turn Instant3D off">✕</button>';
  }
  const hasSketch = (f) => f && ['sketch', 'path', 'profile'].some((k) => typeof f.params[k] === 'string') || (f && Array.isArray(f.params.sections));
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'off') I.set(false); else step(b.dataset.a === 'next' ? 1 : -1); });
  function step(dir) {
    const fs = st.doc.features.slice(0, F.activeCount(st.doc)).filter((f) => f.type !== 'sketch' && !f.suppressed && (B[f.type] || Object.keys(f.params || {}).some((k) => typeof f.params[k] === 'number')));
    if (!fs.length) return; let i = fs.findIndex((f) => f.id === (I.f && I.f.id)); i = i < 0 ? (dir > 0 ? 0 : fs.length - 1) : (i + dir + fs.length) % fs.length; I.select(fs[i].id);
  }

  // ------------------------------------------------------------------ selecting the feature
  I.select = function (fid) {
    const f = st.doc.features.find((x) => x.id === fid); if (!f) return; I.f = f;
    if (st.selFeature !== fid) { st.selFeature = fid; try { P.refreshPanels(); } catch (e) { /* ignore */ } }
    I.hs = handlesFor(f, f.params, st.state); mount(); sketchLabels(true); P.redraw();
  };
  function sketchLabels(on) {
    const U = CAD.v81 && CAD.v81.UI; if (!U || !CAD.v81.labels) return;
    if (on) { if (!I.saved) I.saved = { dims: U.dims, dims3d: U.dims3d }; U.dims = true; U.dims3d = true; } else if (I.saved) { U.dims = I.saved.dims; U.dims3d = I.saved.dims3d; I.saved = null; }
    try { CAD.v81.labels(); } catch (e) { /* ignore */ }
  }
  function featureOfSel() {
    const sel = st.sel; if (!sel || !sel.bodyId) return null; const b = st.bodies.find((x) => x.key === sel.bodyId); if (!b) return null; let tid = null;
    try {
      if (sel.type === 'face' && sel.faces && sel.faces.length) tid = CAD.tn.faceTid(b.solid, sel.faces[0]);
      else if (sel.type === 'edge' && sel.edges && sel.edges.length) {
        // an edge is shared by two faces that may belong to different features: pick the MOST RECENT one (the fillet, not the extrude it rounds)
        const t = CAD.tn.edgeTid(b.solid, sel.edges[0]), cands = (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string'), order = (x) => st.doc.features.findIndex((f) => f.id === String(x).split(':')[0] && f.type !== 'sketch');
        tid = cands.sort((x, y) => order(y) - order(x))[0] || null;
      }
    } catch (e) { tid = null; }
    const fid = typeof tid === 'string' ? tid.split(':')[0] : null;
    if (fid && st.doc.features.some((x) => x.id === fid && x.type !== 'sketch')) return fid;
    return b.src && st.doc.features.some((x) => x.id === b.src) ? b.src : null;
  }
  const selSig = () => { const s = st.sel; return s ? [s.type, s.bodyId, (s.faces || s.edges || s.verts || []).map((x) => (x && x.segs ? x.segs.length : x)).join(',')].join('|') : ''; };
  let lastSig = '', lastFeat = null;
  function poll() {
    if (!I.on || st.sketching) return;
    const sig = selSig(); if (sig !== lastSig) { lastSig = sig; const fid = featureOfSel(); if (fid && (!I.f || I.f.id !== fid)) I.select(fid); }
    if (st.selFeature !== lastFeat) { lastFeat = st.selFeature; if (st.selFeature && (!I.f || I.f.id !== st.selFeature)) I.select(st.selFeature); }
  }
  P.hooks.afterRegen.push(() => {
    if (!I.on) return;
    if (I.f) { const live = st.doc.features.find((x) => x.id === I.f.id); if (!live) { I.f = null; I.hs = []; mount(); return; } I.f = live; }   // undo / redo rebuild the document: re-find the feature by id
    if (I.f && !I.drag) { I.hs = handlesFor(I.f, I.f.params, st.state); mount(); }
  });

  // ------------------------------------------------------------------ editing a value by typing
  layer.addEventListener('click', (e) => {
    const c = e.target.closest('.i3d-chip'); if (!c || I.drag || c.querySelector('input')) return; const h = I.hs[+c.dataset.i]; if (!h) return;
    I.edit = h; c.innerHTML = '<span class="l">' + esc(h.label) + '</span><input type="text" value="' + (+h.value.toFixed(6)) + '">'; const inp = c.querySelector('input'); inp.focus(); inp.select();
    const done = (ok) => { if (I.edit !== h) return; I.edit = null; if (ok) { const v = evalNum(inp.value); if (isFinite(v)) return commit(h, v); toast('Invalid value', true); } c.innerHTML = chipText(h); };
    inp.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  });
  function clampV(h, v) { v = Math.max(h.min, Math.min(h.max, v)); return h.int ? Math.round(v) : v; }
  function commit(h, v) {
    const f = I.f; if (!f) return; v = clampV(h, v); const np = clone(f.params); if (h.set) h.set(np, v); else np[h.key] = v;
    P.updateFeature(f, np); if (f._status && f._status.level === 'error') status(f.name + ': ' + f._status.msg); else status(f.name + ' · ' + h.label + ' = ' + fmt(v) + ' — every later feature regenerated');
  }

  // ------------------------------------------------------------------ dragging an arrow
  layer.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.i3d-grip'); if (!g || e.button !== 0 || !I.f) return; e.preventDefault(); e.stopPropagation();
    const h = I.hs[+g.dataset.i]; if (!h || !h.dir) return; const M = R.matrices(), s0 = R.project(V.madd(h.a, h.dir, 0), M), s1 = R.project(V.madd(h.a, h.dir, 1), M), ppm = 1 / Math.max(1e-9, R.pixelSize(h.a, M));
    let dx = s1[0] - s0[0], dy = s1[1] - s0[1], pxmm = Math.hypot(dx, dy); if (pxmm < 0.2 * ppm) { pxmm = 0.2 * ppm; dx = 0; dy = -1; } else { dx /= pxmm; dy /= pxmm; }
    I.drag = { h, v0: h.value, x0: e.clientX, y0: e.clientY, u: [dx, dy], pxmm, base: clone(I.f.params), idx: st.doc.features.indexOf(I.f), v: null, np: null, pending: null, raf: 0 };
    try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } g.classList.add('drag'); document.body.classList.add('i3d-dragging');
    g.onpointermove = (ev) => { const d = I.drag; if (!d) return; d.pending = ev; if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; if (I.drag === d && d.pending) { const ev2 = d.pending; d.pending = null; dragTo(ev2); } }); };
    g.onpointerup = () => endDrag(true); g.onpointercancel = () => endDrag(false);
  });
  function dragTo(ev) {
    const d = I.drag, h = d.h; let v = d.v0 + (((ev.clientX - d.x0) * d.u[0] + (ev.clientY - d.y0) * d.u[1]) / d.pxmm) / h.scale;
    if (!ev.shiftKey && st.snapOn && st.snapStep > 0) v = Math.round(v / st.snapStep) * st.snapStep; v = clampV(h, v);
    const np = clone(d.base); if (h.set) h.set(np, v); else np[h.key] = v;
    try { st.previewState = F.preview(st.doc, d.idx, np); d.np = np; d.v = v; d.err = null; refresh(np, st.previewState); h.grip && h.grip.classList.remove('bad'); h.el && h.el.classList.remove('bad'); }
    catch (e) { d.err = e.message || String(e); h.value = v; if (h.el) { h.el.innerHTML = chipText(h); h.el.classList.add('bad'); } status('Instant3D: ' + d.err); }
    P.redraw();
  }
  function endDrag(commitIt) {
    const d = I.drag; if (!d) return; I.drag = null; document.body.classList.remove('i3d-dragging'); if (d.raf) cancelAnimationFrame(d.raf);
    I.hs.forEach((h) => { h.grip && h.grip.classList.remove('drag'); h.el && h.el.classList.remove('bad'); }); st.previewState = null;
    if (commitIt && d.np && d.v != null && !d.err && Math.abs(d.v - d.v0) > 1e-9) { P.updateFeature(I.f, d.np); status(I.f.name + ' · ' + d.h.label + ' = ' + fmt(d.v)); }
    else { I.hs = handlesFor(I.f, I.f.params, st.state); mount(); P.redraw(); }
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && I.drag) { e.stopImmediatePropagation(); endDrag(false); } }, true);

  // ------------------------------------------------------------------ drawing: dimension lines in 3D, DOM handles on top
  P.hooks.draw.push((M, hh) => {
    poll(); const show = I.on && !st.sketching; layer.style.display = show ? '' : 'none'; bar.classList.toggle('on', show); if (!show || !I.hs.length) return;
    const L = [], cv = IK.cv, W = cv.clientWidth, H = cv.clientHeight; let stack = 0;
    I.hs.forEach((h) => {
      const col = I.drag && I.drag.h === h ? [1, 0.92, 0.4] : [1, 0.6, 0.22]; let ax = null, bx = null;
      if (h.dir) {
        const end = V.madd(h.a, h.dir, h.value * h.scale), px = R.pixelSize(h.a, M) * 6, { u, v } = A.basisOf(h.dir);
        hh.pushL(L, h.a, col, 1); hh.pushL(L, end, col, 1);
        [h.a, end].forEach((p) => { hh.pushL(L, V.madd(p, u, -px), col, 1); hh.pushL(L, V.madd(p, u, px), col, 1); });
        const sg = (h.value * h.scale) >= 0 ? 1 : -1; [u, v, V.mul(u, -1), V.mul(v, -1)].forEach((w) => { hh.pushL(L, end, col, 1); hh.pushL(L, V.add(V.madd(end, h.dir, -px * 1.6 * sg), V.mul(w, px * 0.6)), col, 1); });
        ax = R.project(h.a, M); bx = R.project(end, M);
      } else ax = bx = R.project(h.a, M);
      const vis = (q) => q && q[3] > 0 && q[0] > -30 && q[1] > -30 && q[0] < W + 30 && q[1] < H + 30;
      if (!vis(bx) || !vis(ax)) { h.el && (h.el.style.display = 'none'); h.grip && (h.grip.style.display = 'none'); return; }
      if (h.el && h.el.querySelector('input') === null) h.el.style.display = '';
      if (h.dir) {
        const mx = (ax[0] + bx[0]) / 2, my = (ax[1] + bx[1]) / 2, len = Math.hypot(bx[0] - ax[0], by0(ax, bx));
        if (h.el) h.el.style.transform = 'translate(' + (mx - 4).toFixed(1) + 'px,' + (my - 26).toFixed(1) + 'px)';
        if (h.grip) { h.grip.style.display = ''; h.grip.style.transform = 'translate(' + (bx[0] - 11).toFixed(1) + 'px,' + (bx[1] - 11).toFixed(1) + 'px)'; h.grip.firstChild.style.transform = 'rotate(' + Math.atan2(bx[1] - ax[1], bx[0] - ax[0]).toFixed(3) + 'rad)'; if (len < 6) h.grip.firstChild.style.transform = 'rotate(0rad)'; }
      } else if (h.el) { h.el.style.transform = 'translate(' + (ax[0] + 14).toFixed(1) + 'px,' + (ax[1] - 40 + 26 * (h.stack != null ? h.stack : stack++)).toFixed(1) + 'px)'; }
    });
    if (L.length) R.lines(new Float32Array(L), { overlay: true });
  });
  const by0 = (a, b) => b[1] - a[1];

  // ------------------------------------------------------------------ on / off
  I.set = function (on) {
    on = !!on; if (on === I.on) return; I.on = on; document.body.classList.toggle('i3d-on', on);
    if (on) { lastSig = selSig(); lastFeat = null; const fid = (st.selFeature && st.doc.features.some((x) => x.id === st.selFeature && x.type !== 'sketch') ? st.selFeature : null) || featureOfSel() || (() => { const fs = st.doc.features.slice(0, F.activeCount(st.doc)).filter((x) => x.type !== 'sketch' && !x.suppressed); return fs.length ? fs[fs.length - 1].id : null; })(); if (fid) I.select(fid); else { I.f = null; I.hs = []; mount(); } status('Instant3D on — drag the arrows or click a value; click a face to pick its feature'); }
    else { if (I.drag) endDrag(false); I.f = null; I.hs = []; layer.innerHTML = ''; sketchLabels(false); bar.classList.remove('on'); status('Instant3D off'); P.redraw(); }
    RG.syncTB();
  };
  I.toggle = () => I.set(!I.on);
})(typeof window !== 'undefined' ? window : globalThis);
