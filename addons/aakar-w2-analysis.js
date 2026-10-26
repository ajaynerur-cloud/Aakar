/* Aakar 8.20.0 · Wave 2 · ANALYSIS
 *   Curvature map     — colours solids and NURBS surfaces by curvature (signed or magnitude), with a legend and min-radius read-out
 *   Isocurve display  — u / v lines drawn on NURBS surfaces
 *   Section comb      — a live cut-plane through the model with a curvature comb on every section outline
 * Display only: nothing is added to the model.
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, W1 = G.AAKAR_W1;
  if (!CAD || !P || !CAD.ik || !W1 || !W1.reg || !CAD.x5 || !CAD.nb) { if (G.console) console.warn('Aakar Wave 2 analysis: core not found'); return; }
  if (W1.analysis) return; W1.analysis = true;
  const IK = CAD.ik, { st, R, v3, $, $$, esc, num, clamp, fmt, toast, status } = IK, SV = CAD.solver, SOL = CAD.solid, NB = CAD.nurbs, X5 = CAD.x5, nb = CAD.nb;
  const add = v3.add, sub = v3.sub, sc = v3.scale, dot = v3.dot, cross = v3.cross, nrm = v3.norm, dist = v3.dist;
  const AN = W1.an = { map: { on: false, mode: 'signed', scale: 1, target: 'all' }, iso: { on: false, nu: 8, nv: 8 }, sec: { on: false, axis: 'z', pos: 50, scale: 1, n: 160 }, info: {} };

  // ================================================================= curvature of faceted solids (per face, from the smooth edges)
  const faceCache = new WeakMap();
  function convexEdge(s, le) { const m = sc(add(s.V[le.segs[0][0]], s.V[le.segs[0][1]]), 0.5), fa = s.F[le.faces[0]], fb = s.F[le.faces[1]]; return dot(fb.n, sub(s.faceCentroid(le.faces[0]), m)) + dot(fa.n, sub(s.faceCentroid(le.faces[1]), m)) < 0; }
  function solidCurv(s) {
    let c = faceCache.get(s); if (c) return c;
    const sum = s.F.map(() => 0), cnt = s.F.map(() => 0), mx = s.F.map(() => 0);
    SV.logicalEdges(s).forEach((le) => {
      if (!le.smooth) return; const a = le.faces[0], b = le.faces[1], na = s.F[a].n, nb2 = s.F[b].n, th = Math.acos(clamp(dot(na, nb2), -1, 1)); if (th < 1e-6) return;
      const e = nrm(sub(s.V[le.segs[0][1]], s.V[le.segs[0][0]])); let d = sub(s.faceCentroid(a), s.faceCentroid(b)); d = sub(d, sc(e, dot(d, e))); const dd = v3.len(d); if (dd < 1e-9) return;
      const k = (th / dd) * (convexEdge(s, le) ? 1 : -1); [a, b].forEach((f) => { sum[f] += k; cnt[f]++; if (Math.abs(k) > Math.abs(mx[f])) mx[f] = k; });
    });
    const val = s.F.map((_, i) => (cnt[i] ? mx[i] : 0));
    const vs = new Map(), vc = new Map(); s.F.forEach((f, fi) => { const g = f.group || ('f' + fi); f.loops.forEach((l) => l.forEach((vi) => { const k = g + ':' + vi; vs.set(k, (vs.get(k) || 0) + val[fi]); vc.set(k, (vc.get(k) || 0) + 1); })); });
    c = { val, vert: (fi, vi) => { const k = (s.F[fi].group || ('f' + fi)) + ':' + vi; return vs.get(k) / vc.get(k); } }; faceCache.set(s, c); return c;
  }
  // ================================================================= colour ramp
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const NEUT = [0.74, 0.77, 0.80];
  function rampSigned(t) { t = clamp(t, -1, 1); const stops = [[-1, [0.1, 0.25, 1]], [-0.5, [0.1, 0.8, 0.95]], [0, NEUT], [0.5, [1, 0.88, 0.2]], [1, [1, 0.2, 0.1]]]; for (let i = 0; i + 1 < stops.length; i++) if (t <= stops[i + 1][0]) return lerp3(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])); return stops[4][1]; }
  function rampMag(t) { t = clamp(t, 0, 1); const stops = [[0, NEUT], [0.25, [0.2, 0.85, 0.9]], [0.5, [0.3, 0.9, 0.3]], [0.75, [1, 0.88, 0.2]], [1, [1, 0.2, 0.1]]]; for (let i = 0; i + 1 < stops.length; i++) if (t <= stops[i + 1][0]) return lerp3(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])); return stops[4][1]; }
  const pushV = (a, p, n, c) => a.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], 1);
  const pct = (arr, q) => { const a = arr.filter((x) => isFinite(x)).map(Math.abs).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };

  // ================================================================= item curvature (exact NURBS)
  const itemCache = new WeakMap();
  function surfGrid(S, N) {
    const key = N; let c = itemCache.get(S); if (c && c.N === key) return c; const [u0, u1] = [S.U[S.p], S.U[S.U.length - S.p - 1]], [v0, v1] = [S.V[S.q], S.V[S.V.length - S.q - 1]], pts = [], K = [], H = [], Nn = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const u = u0 + (u1 - u0) * i / N, v = v0 + (v1 - v0) * j / N; pts.push(NB.surfPoint(S, u, v)); let r = { K: 0, H: 0, n: [0, 0, 1] }; try { r = X5.curvature(S, clamp(u, u0 + 1e-6, u1 - 1e-6), clamp(v, v0 + 1e-6, v1 - 1e-6)); } catch (e) { /* keep zero */ } K.push(r.K || 0); H.push(r.H || 0); Nn.push(r.n || [0, 0, 1]); }
    c = { N, pts, K, H, n: Nn, k1: H.map((h, i) => h + Math.sqrt(Math.max(0, h * h - K[i]))), k2: H.map((h, i) => h - Math.sqrt(Math.max(0, h * h - K[i]))) }; itemCache.set(S, c); return c;
  }
  function valuesOf(g, mode) { return mode === 'gauss' ? g.K : mode === 'kmax' ? g.k1.map((a, i) => (Math.abs(a) >= Math.abs(g.k2[i]) ? a : g.k2[i])) : mode === 'kmin' ? g.k2 : g.H; }

  // ================================================================= draw: curvature map + iso lines + section comb
  const targets = () => { const sel = AN.map.target === 'sel'; const bodies = st.bodies.filter((b) => b.visible && (!sel || (st.sel && st.sel.bodyId === b.key))); const items = (st.items || []).filter((i) => i.kind === 'surface' && i.srf && (!sel || st.itemSel === i.key)); return { bodies, items }; };
  function drawMap(M) {
    const { bodies, items } = targets(), signed = AN.map.mode === 'signed' || AN.map.mode === 'mean' || AN.map.mode === 'kmax' || AN.map.mode === 'kmin' || AN.map.mode === 'gauss', all = [], arrs = [];
    const solidMode = (m) => (m === 'signed' || m === 'magnitude' ? m : 'signed');
    bodies.forEach((b) => { const c = solidCurv(b.solid); b.solid.F.forEach((_, fi) => { if (b.solid.F[fi].group) all.push(c.val[fi]); }); });
    const itemVals = items.map((it) => { const g = surfGrid(it.srf, 28), v = valuesOf(g, ['signed', 'magnitude'].includes(AN.map.mode) ? 'mean' : AN.map.mode); v.forEach((x) => all.push(x)); return { it, g, v }; });
    let vmax = pct(all, 0.97) / Math.max(0.05, AN.map.scale); if (!(vmax > 1e-9)) vmax = 1; AN.info = { vmax, rmin: 1 / vmax, n: all.length };
    const mag = AN.map.mode === 'magnitude', col = (v) => (mag ? rampMag(Math.abs(v) / vmax) : rampSigned(v / vmax));
    const px = (p) => R.pixelSize(p, M) * 1.6;
    bodies.forEach((b) => {
      const s = b.solid, c = solidCurv(s), arr = [], off = px(s.center()); void solidMode;
      s.F.forEach((f, fi) => { const n = f.n; SOL.triangulateFace(s, fi).forEach((t) => t.forEach((vi) => pushV(arr, add(s.V[vi], sc(n, off)), n, col(f.group ? c.vert(fi, vi) : 0)))); });
      arrs.push(new Float32Array(arr));
    });
    itemVals.forEach(({ it, g, v }) => {
      const N = g.N, arr = [], off = px(g.pts[Math.floor(g.pts.length / 2)]), idx = (i, j) => i * (N + 1) + j;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]].forEach(([a, b2]) => { const k = idx(a, b2); pushV(arr, add(g.pts[k], sc(g.n[k], off)), g.n[k], col(v[k])); }); }
      arrs.push(new Float32Array(arr));
    });
    arrs.forEach((a) => { if (a.length) R.mesh(a, { noDepthWrite: false }); });
    updateLegend();
  }
  function drawIso(M) {
    const L = [], { nu, nv } = AN.iso; (st.items || []).filter((i) => i.kind === 'surface' && i.srf && (st.itemSel ? true : true)).forEach((it) => {
      const S = it.srf, [u0, u1] = [S.U[S.p], S.U[S.U.length - S.p - 1]], [v0, v1] = [S.V[S.q], S.V[S.V.length - S.q - 1]], sel = st.itemSel === it.key, c = sel ? [1, 0.85, 0.3] : [0.15, 0.2, 0.3];
      const line = (fn, n) => { let prev = null; for (let k = 0; k <= n; k++) { const q = fn(k / n), nn = NB.surfNormal ? (() => { try { return NB.surfNormal(S, 0, 0); } catch (e) { return [0, 0, 1]; } })() : [0, 0, 1]; void nn; if (prev) L.push(prev[0], prev[1], prev[2], c[0], c[1], c[2], 1, q[0], q[1], q[2], c[0], c[1], c[2], 1); prev = q; } };
      for (let i = 0; i <= Math.max(1, nu); i++) { const u = u0 + (u1 - u0) * i / Math.max(1, nu); line((t) => { const w = v0 + (v1 - v0) * t, p = NB.surfPoint(S, u, w); let n = [0, 0, 1]; try { n = NB.surfNormal(S, u, w); } catch (e) { /* ignore */ } return add(p, sc(n, R.pixelSize(p, M) * 1.2)); }, 56); }
      for (let j = 0; j <= Math.max(1, nv); j++) { const v = v0 + (v1 - v0) * j / Math.max(1, nv); line((t) => { const w = u0 + (u1 - u0) * t, p = NB.surfPoint(S, w, v); let n = [0, 0, 1]; try { n = NB.surfNormal(S, w, v); } catch (e) { /* ignore */ } return add(p, sc(n, R.pixelSize(p, M) * 1.2)); }, 56); }
    });
    if (L.length) R.lines(new Float32Array(L));
  }
  // ----- section comb
  function allTris() {
    const out = []; st.bodies.forEach((b) => { if (b.visible) b.solid.F.forEach((_, fi) => SOL.triangulateFace(b.solid, fi).forEach((t) => out.push(t.map((i) => b.solid.V[i])))); });
    (st.items || []).filter((i) => i.kind === 'surface' && i.srf).forEach((it) => { const m = NB.mesh(it.srf, 10); m.T.forEach((t) => out.push([m.P[t[0]], m.P[t[1]], m.P[t[2]]])); });
    return out;
  }
  function chain(segs, tol) {
    const key = (p) => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol) + ',' + Math.round(p[2] / tol), nodes = new Map(), pts = [];
    const nid = (p) => { const k = key(p); let i = nodes.get(k); if (i == null) { i = pts.length; pts.push(p); nodes.set(k, i); } return i; };
    const adj = pts.map(() => []); const E = segs.map(([a, b]) => [nid(a), nid(b)]).filter(([a, b]) => a !== b); const A = pts.map(() => []); E.forEach(([a, b], i) => { A[a].push(i); A[b].push(i); });
    const used = new Set(), out = [];
    const walk = (start) => { const line = [start]; let cur = start; for (;;) { const e = A[cur].find((i) => !used.has(i)); if (e == null) break; used.add(e); const [a, b] = E[e], nx = a === cur ? b : a; line.push(nx); cur = nx; } return line; };
    A.forEach((l, v) => { if (l.length === 1) { const e = l[0]; if (!used.has(e)) out.push(walk(v)); } }); E.forEach(([a], i) => { if (!used.has(i)) out.push(walk(a)); });
    void adj; return out.map((l) => l.map((i) => pts[i]));
  }
  function resampleLine(Pt, n, closed) { const Q = closed ? Pt.concat([Pt[0]]) : Pt, d = [0]; for (let i = 1; i < Q.length; i++) d.push(d[i - 1] + dist(Q[i], Q[i - 1])); const L = d[d.length - 1]; if (!(L > 0)) return Pt; const out = []; let k = 0; const m = closed ? n : n; for (let i = 0; i < m; i++) { const t = L * i / (closed ? m : m - 1); while (k + 2 < d.length && d[k + 1] < t) k++; const a = Q[k], b = Q[k + 1], l = d[k + 1] - d[k] || 1; out.push(v3.lerp(a, b, (t - d[k]) / l)); } return out; }
  function sectionCombs(M) {
    const tris = allTris(); if (!tris.length) return null; let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    tris.forEach((t) => t.forEach((p) => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }));
    const A = ['x', 'y', 'z'].indexOf(AN.sec.axis), n = [0, 0, 0]; n[A] = 1; const o = [0, 0, 0]; o[A] = mn[A] + (mx[A] - mn[A]) * AN.sec.pos / 100; const diag = dist(mn, mx), eps = diag * 1e-9, pl = { o, n };
    const segs = []; tris.forEach((t) => { const s = AKC.triPlaneSeg(t[0], t[1], t[2], pl, eps); if (s) segs.push(s); });
    const u = nrm(cross(n, [n[1] ? 1 : 0, n[1] ? 0 : 1, 0])), w = nrm(cross(n, u)), lines = chain(segs, diag * 1e-6).filter((l) => l.length >= 3), res = [];
    lines.forEach((l) => {
      const closed = dist(l[0], l[l.length - 1]) < diag * 1e-5; let pts = resampleLine(closed ? l.slice(0, -1) : l, Math.max(40, AN.sec.n | 0), closed);
      for (let it = 0; it < 3; it++) pts = pts.map((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; if (!closed && (i === 0 || i === pts.length - 1)) return p; return add(sc(p, 0.5), sc(add(a, b), 0.25)); });
      const k = pts.map((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; if (!closed && (i === 0 || i === pts.length - 1)) return 0; const A2 = [dot(sub(a, p), u), dot(sub(a, p), w)], B2 = [dot(sub(b, p), u), dot(sub(b, p), w)], la = Math.hypot(...A2), lb = Math.hypot(...B2), cr = A2[0] * B2[1] - A2[1] * B2[0]; return la * lb > 1e-18 ? -2 * cr / (la * lb * Math.hypot(B2[0] - A2[0], B2[1] - A2[1]) || 1) : 0; });
      res.push({ pts, k, closed });
    });
    return { pl, lines: res, mn, mx, u, w, diag };
  }
  function drawSection(M) {
    const S = sectionCombs(M); if (!S) return; const L = [], pt = [], kmax = Math.max(1e-12, ...S.lines.flatMap((l) => l.k.map(Math.abs))), tooth = S.diag * 0.10 * AN.sec.scale / kmax; AN.info.sec = { n: S.lines.length, kmax, rmin: 1 / kmax };
    // plane outline
    const o = S.pl.o, c = [[S.mn, S.mx]].length, ext = S.diag * 0.62, ctr = [(S.mn[0] + S.mx[0]) / 2, (S.mn[1] + S.mx[1]) / 2, (S.mn[2] + S.mx[2]) / 2]; void c;
    const cc = o.map((v, i) => (S.pl.n[i] ? v : ctr[i])), q = [add(cc, add(sc(S.u, -ext), sc(S.w, -ext))), add(cc, add(sc(S.u, ext), sc(S.w, -ext))), add(cc, add(sc(S.u, ext), sc(S.w, ext))), add(cc, add(sc(S.u, -ext), sc(S.w, ext)))];
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; L.push(a[0], a[1], a[2], 0.5, 0.6, 0.75, 0.6, b[0], b[1], b[2], 0.5, 0.6, 0.75, 0.6); }
    S.lines.forEach((ln) => {
      const m = ln.pts.length, env = [];
      for (let i = 0; i + 1 < m + (ln.closed ? 1 : 0); i++) { const a = ln.pts[i], b = ln.pts[(i + 1) % m]; L.push(a[0], a[1], a[2], 1, 1, 1, 1, b[0], b[1], b[2], 1, 1, 1, 1); }
      ln.pts.forEach((p, i) => { const a = ln.pts[(i - 1 + m) % m], b = ln.pts[(i + 1) % m], T = nrm(sub(b, a)), Nl = cross(S.pl.n, T), tip = add(p, sc(Nl, -ln.k[i] * tooth)); env.push(tip); if (i % 2 === 0) L.push(p[0], p[1], p[2], 1, 0.62, 0.2, 0.9, tip[0], tip[1], tip[2], 1, 0.62, 0.2, 0.9); });
      for (let i = 0; i + 1 < env.length + (ln.closed ? 1 : 0); i++) { const a = env[i], b = env[(i + 1) % env.length]; L.push(a[0], a[1], a[2], 1, 0.42, 0.1, 1, b[0], b[1], b[2], 1, 0.42, 0.1, 1); }
    });
    void pt; if (L.length) R.lines(new Float32Array(L), { overlay: true }); updateSecInfo();
  }
  P.hooks.draw.push((M) => { if (st.sketching) return; try { if (AN.map.on) drawMap(M); if (AN.iso.on) drawIso(M); if (AN.sec.on) drawSection(M); } catch (e) { if (G.console) console.warn('analysis draw', e); } });

  // ================================================================= panel
  const ap = IK.panel('w2-analyse', '◐ <i>Curvature</i> &amp; section', { top: '96px', left: '72px' });
  function renderAP() {
    const m = AN.map, i = AN.iso, s = AN.sec;
    ap.body.innerHTML = '<h5>Curvature map</h5><div class="row"><label><input type="checkbox" data-k="map.on" ' + (m.on ? 'checked' : '') + '> colour the model by curvature</label></div>' +
      '<div class="row"><label>Show</label><select data-k="map.mode"><optgroup label="Solids and surfaces"><option value="signed">Signed (red = convex, blue = concave)</option><option value="magnitude">Magnitude (how tight)</option></optgroup><optgroup label="NURBS surfaces only"><option value="mean">Mean curvature</option><option value="gauss">Gaussian curvature</option><option value="kmax">Largest principal</option><option value="kmin">Smallest principal</option></optgroup></select></div>' +
      '<div class="row"><label>Sensitivity</label><input type="range" min="0.2" max="5" step="0.05" value="' + m.scale + '" data-k="map.scale"></div>' +
      '<div class="row"><label>Apply to</label><select data-k="map.target"><option value="all">Everything visible</option><option value="sel">Selection only</option></select></div>' +
      '<div class="note" data-leg></div>' +
      '<h5>Isocurves on surfaces</h5><div class="row"><label><input type="checkbox" data-k="iso.on" ' + (i.on ? 'checked' : '') + '> show u / v lines</label></div><div class="row"><label>u lines</label><input type="number" min="1" max="60" value="' + i.nu + '" data-k="iso.nu" style="width:60px"> <label>v lines</label><input type="number" min="1" max="60" value="' + i.nv + '" data-k="iso.nv" style="width:60px"></div>' +
      '<h5>Section curvature comb</h5><div class="row"><label><input type="checkbox" data-k="sec.on" ' + (s.on ? 'checked' : '') + '> live cut plane with comb</label></div>' +
      '<div class="row"><label>Plane ⟂</label><select data-k="sec.axis"><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></div>' +
      '<div class="row"><label>Position</label><input type="range" min="0" max="100" step="0.5" value="' + s.pos + '" data-k="sec.pos"></div><div class="row"><label>Comb size</label><input type="range" min="0.2" max="4" step="0.05" value="' + s.scale + '" data-k="sec.scale"></div><div class="note" data-sec></div>';
    ap.body.querySelector('[data-k="map.mode"]').value = m.mode; ap.body.querySelector('[data-k="map.target"]').value = m.target; ap.body.querySelector('[data-k="sec.axis"]').value = s.axis;
    ap.body.querySelectorAll('[data-k]').forEach((el) => { const set = () => { const [g, k] = el.dataset.k.split('.'), v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value); AN[g][k] = v; P.redraw(); }; el.onchange = set; el.oninput = el.type === 'range' ? set : null; });
    updateLegend(); updateSecInfo();
  }
  function updateLegend() { const el = ap.body && ap.body.querySelector('[data-leg]'); if (!el) return; if (!AN.map.on) { el.textContent = ''; return; } const v = AN.info.vmax || 0, mag = AN.map.mode === 'magnitude'; el.innerHTML = '<div style="height:10px;border-radius:5px;margin:4px 0;background:linear-gradient(90deg,' + (mag ? '#bdc4cc,#33d9e6,#4de64d,#ffe033,#ff331a' : '#1a40ff,#1acce6,#bdc4cc,#ffe033,#ff331a') + ')"></div><div style="display:flex;justify-content:space-between"><span>' + (mag ? '0' : '−' + fmt(v, 3)) + '</span><span>' + (mag ? '' : '0') + '</span><span>' + (mag ? fmt(v, 3) : '+' + fmt(v, 3)) + ' mm⁻¹</span></div>Smallest radius shown: <b>' + fmt(1 / (v || 1), 2) + ' mm</b>'; }
  function updateSecInfo() { const el = ap.body && ap.body.querySelector('[data-sec]'); if (!el) return; const s = AN.info.sec; el.innerHTML = AN.sec.on && s ? s.n + ' outline' + (s.n === 1 ? '' : 's') + ' · tightest curve radius <b>' + fmt(s.rmin, 2) + ' mm</b>' : ''; }
  const openAP = (what) => { if (what) AN[what].on = true; ap.show(); renderAP(); P.redraw(); };
  ap.onclose = () => { /* keep the display settings; the panel can be reopened */ };

  // ================================================================= registration + ribbon
  const I = { map: '<circle cx="12" cy="12" r="8"/><path d="M4 12a8 8 0 0 1 8-8v8z" fill="currentColor" opacity=".35"/>', iso: '<path d="M4 6c6 3 10 3 16 0 M4 12c6 3 10 3 16 0 M4 18c6 3 10 3 16 0 M8 4v16 M16 4v16"/>', sec: '<path d="M3 20c4-12 14-12 18 0"/><path d="M6 14l-2-3 M10 11l-1-4 M14 11l1-4 M18 14l2-3"/>' };
  [['w2cmap', 'Curvature map', () => { AN.map.on = !AN.map.on; openAP(); }, 'Colour solids and NURBS surfaces by curvature', I.map], ['w2iso', 'Isocurve display', () => { AN.iso.on = !AN.iso.on; openAP(); }, 'Show u / v lines on NURBS surfaces', I.iso], ['w2sec', 'Section curvature comb', () => { AN.sec.on = !AN.sec.on; openAP(); }, 'Live cut plane with a curvature comb on every outline', I.sec]]
    .forEach(([id, label, fn, title, icon]) => W1.reg({ id: id === 'w2iso' ? 'w2isodisp' : id, label, group: 'Analyse', title, fn, icon }));
  const ITEMS = [['w2cmap', 'Curv. map', () => { AN.map.on = !AN.map.on; openAP(); }, 'Curvature map: colour the model by curvature', I.map], ['w2isodisp', 'Iso lines', () => { AN.iso.on = !AN.iso.on; openAP(); }, 'Show u / v isocurves on surfaces', I.iso], ['w2sec', 'Section comb', () => { AN.sec.on = !AN.sec.on; openAP(); }, 'Live section plane with a curvature comb', I.sec]];
  const grp = (P.groups || []).find((g) => g.tab === 'nurbsx' && g.title === 'Curves & curvature');
  if (grp) { ITEMS.forEach((i) => grp.items.push(i)); try { P.setTab(st.tab); } catch (e) { /* ignore */ } } else P.addGroup('nurbsx', 'Curves & curvature', ITEMS, 'Analyse+');
  W1.analysisApi = { AN, solidCurv, surfGrid, sectionCombs, chain, openAP, rampSigned, rampMag };
  if (W1.publishSearch) W1.publishSearch();
  if (G.console) console.info('Aakar Wave 2 · analysis loaded (curvature map, isocurve display, section comb)');
})(typeof window !== 'undefined' ? window : globalThis);
