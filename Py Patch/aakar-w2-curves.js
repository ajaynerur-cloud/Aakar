/* Aakar 8.20.0 · Wave 2 · CURVES
 *   Bridge curve  — joins the ends of two curves with G0 / G1 / G2 / G3 continuity (tension per end)
 *   Isocurves     — exact u / v isoparametric curves taken from a NURBS surface
 *   Edge → curve  — duplicate selected solid edges as NURBS curves (smooth or exact polyline)
 *   Pen           — draw a curve straight onto a face, a plane or the model without opening a sketch
 * All results are ordinary NURBS curve items (usable by Sweep, Pipe, Loft, Project, Offset…).
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, W1 = G.AAKAR_W1;
  if (!CAD || !P || !CAD.ik || !W1 || !W1.reg || !CAD.nb || !CAD.x5) { if (G.console) console.warn('Aakar Wave 2 curves: core not found'); return; }
  if (W1.curves) return; W1.curves = true;
  const IK = CAD.ik, { st, F, R, v3, $, esc, num, clamp, fmt, toast, status } = IK, SV = CAD.solver, NB = CAD.nurbs, nb = CAD.nb, X5 = CAD.x5;
  const add = v3.add, sub = v3.sub, sc = v3.scale, dot = v3.dot, cross = v3.cross, nrm = v3.norm, dist = v3.dist;
  const cdom = (c) => [c.U[c.p], c.U[c.U.length - c.p - 1]];
  CAD.featNames = Object.assign(CAD.featNames || {}, { w2Bridge: 'Bridge curve', w2Iso: 'Isocurves', w2EdgeCrv: 'Edge curve' });

  // ================================================================= end derivatives (leaving the junction INTO the source curve)
  function endDerivs(c, atEnd) {
    const [a, b] = cdom(c), N = 480, pts = [];
    for (let k = 0; k < N; k++) { const t = k / (N - 1), u = atEnd ? b - (b - a) * t : a + (b - a) * t; pts.push(NB.curvePoint(c, u)); }
    const s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1] + dist(pts[i], pts[i - 1]));
    const L = s[N - 1] || 1; let m = s.findIndex((x) => x > 0.05 * L); if (m < 0) m = N - 1; m = Math.max(m, 10);
    const P0 = pts[0], rows = [];
    for (let k = 1; k <= m && k < N; k++) rows.push([s[k], s[k] ** 2, s[k] ** 3, sub(pts[k], P0)]);
    // least squares  P - P0 = c1 s + c2 s^2 + c3 s^3   (per coordinate; normal equations 3x3)
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rhs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    rows.forEach(([x1, x2, x3, d]) => { const f = [x1, x2, x3], w = 1 / (1 + 6 * x1 / (0.05 * L)); for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += w * f[i] * f[j]; for (let k = 0; k < 3; k++) rhs[i][k] += w * f[i] * d[k]; } });
    const inv = inv3(A); if (!inv) throw new Error('The curve end is degenerate — cannot read its tangent and curvature');
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) C[i][k] += inv[i][j] * rhs[j][k];
    const T = nrm(C[0]), D2 = sc(C[1], 2), D3 = sc(C[2], 6), kv = sub(D2, sc(T, dot(D2, T))), kap2 = dot(kv, kv);
    const D3p = sub(D3, sc(T, dot(D3, T)));
    return { P0, T, kv, D3: add(D3p, sc(T, -kap2)), L };
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2], A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (Math.abs(det) < 1e-30) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  /** first g+1 Bezier control points of a degree-n curve leaving P0 with continuity data (bridge parameter runs AWAY from the source) */
  function bezierEnd(fr, a, n, g) {
    const d1 = sc(fr.T, -a), d2 = sc(fr.kv, a * a), d3 = sc(fr.D3, -a * a * a), Pt = [fr.P0];
    if (g >= 1) Pt.push(add(Pt[0], sc(d1, 1 / n)));
    if (g >= 2) Pt.push(add(sub(sc(Pt[1], 2), Pt[0]), sc(d2, 1 / (n * (n - 1)))));
    if (g >= 3) Pt.push(add(add(sub(sc(Pt[2], 3), sc(Pt[1], 3)), Pt[0]), sc(d3, 1 / (n * (n - 1) * (n - 2)))));
    return Pt;
  }
  function bridge(cA, endA, cB, endB, g, ta, tb) {
    g = clamp(g | 0, 0, 3); const fa = endDerivs(cA, endA === 'end'), fb = endDerivs(cB, endB === 'end'), chord = dist(fa.P0, fb.P0);
    if (chord < 1e-9) throw new Error('The two curve ends touch already — nothing to bridge');
    if (g === 0) return { p: 1, U: [0, 0, 1, 1], P: [fa.P0, fb.P0], W: [1, 1] };
    const n = 2 * g + 1, A = bezierEnd(fa, chord * num(ta, 1) / 1.5, n, g), B = bezierEnd(fb, chord * num(tb, 1) / 1.5, n, g), Pt = []; for (let i = 0; i <= g; i++) Pt[i] = A[i]; for (let i = 0; i <= g; i++) Pt[n - i] = B[i];
    return { p: n, U: new Array(n + 1).fill(0).concat(new Array(n + 1).fill(1)), P: Pt, W: Pt.map(() => 1) };
  }
  CAD.featExt.w2Bridge = (f, s2, h) => {
    const p = f.params, get = (o) => { const cs = nb.curvesOf(h, s2, o.src, true); const c = cs[Math.min(cs.length - 1, Math.max(0, o.idx | 0))]; if (!c) throw new Error('Curve not found'); return c; };
    const crv = bridge(get(p.a), p.a.end, get(p.b), p.b.end, p.g, p.ta, p.tb); nb.putCurve(s2, f.id, f.name, crv, f.id, { note: 'G' + p.g + ' bridge' }); return s2;
  };
  P.FUI.w2Bridge = (f, stt) => {
    const p = f.params, opts = () => nb.curveSrcOpts(stt), E = [['end', 'its END'], ['start', 'its START']];
    return {
      fields: [
        { key: 'sa', label: 'Curve A', value: p.a.src, optionsFn: opts }, { key: 'ia', label: 'Chain number in A (0 = first)', value: p.a.idx || 0 }, { key: 'ea', label: 'Join at', value: p.a.end, options: E },
        { key: 'sb', label: 'Curve B', value: p.b.src, optionsFn: opts }, { key: 'ib', label: 'Chain number in B (0 = first)', value: p.b.idx || 0 }, { key: 'eb', label: 'Join at', value: p.b.end, options: [['start', 'its START'], ['end', 'its END']] },
        { key: 'g', label: 'Continuity', value: p.g == null ? 2 : p.g, options: [[0, 'G0 — touch only (straight line)'], [1, 'G1 — same tangent'], [2, 'G2 — same tangent and curvature'], [3, 'G3 — also same curvature change']] },
        { key: 'ta', label: 'Tension at A (1 = natural)', value: p.ta == null ? 1 : p.ta }, { key: 'tb', label: 'Tension at B (1 = natural)', value: p.tb == null ? 1 : p.tb }
      ],
      note: 'Builds one Bézier curve of degree 2G+1 from the end of A to the end of B. Larger tension makes the bridge leave the curve straighter for longer; smaller lets it turn sooner. Curves can be sketch chains or earlier curve items.',
      apply: (v) => ({ a: { src: v.sa, idx: v.ia | 0, end: v.ea }, b: { src: v.sb, idx: v.ib | 0, end: v.eb }, g: +v.g, ta: isFinite(v.ta) ? v.ta : 1, tb: isFinite(v.tb) ? v.tb : 1 })
    };
  };
  async function cmdBridge() {
    const o = nb.curveSrcOpts(st.state || F.regen(st.doc)); if (!o.length || !o[0][0]) return toast('Draw or create at least two curves first (a sketch, or Curve through points)', true);
    if (o.length < 2) return toast('A bridge needs two curves (or two chains in one sketch)', true);
    const f = await P.createViaFUI('w2Bridge', 'Bridge curve', { a: { src: o[0][0], idx: 0, end: 'end' }, b: { src: o[1][0], idx: 0, end: 'start' }, g: 2, ta: 1, tb: 1 });
    if (f) { f.name = 'Bridge curve G' + f.params.g; P.refreshPanels(); }
  }

  // ================================================================= isocurves
  function isoCurve(S, dir, t) {
    const n = S.P.length - 1, m = S.P[0].length - 1, U = S.U, V = S.V, W = S.W || S.P.map((r) => r.map(() => 1));
    if (dir === 'u') {
      const a = U[S.p], b = U[U.length - S.p - 1], u = a + (b - a) * t, sp = NB.findSpan(n, S.p, u, U), Nb = NB.basisFuns(sp, u, S.p, U), Q = [], Wq = [];
      for (let j = 0; j <= m; j++) { let x = 0, y = 0, z = 0, w = 0; for (let k = 0; k <= S.p; k++) { const i = sp - S.p + k, wi = W[i][j] * Nb[k], q = S.P[i][j]; x += q[0] * wi; y += q[1] * wi; z += q[2] * wi; w += wi; } Q.push([x / w, y / w, z / w]); Wq.push(w); }
      return { p: S.q, U: V.slice(), P: Q, W: Wq };
    }
    const a = V[S.q], b = V[V.length - S.q - 1], v = a + (b - a) * t, sp = NB.findSpan(m, S.q, v, V), Nb = NB.basisFuns(sp, v, S.q, V), Q = [], Wq = [];
    for (let i = 0; i <= n; i++) { let x = 0, y = 0, z = 0, w = 0; for (let k = 0; k <= S.q; k++) { const j = sp - S.q + k, wi = W[i][j] * Nb[k], q = S.P[i][j]; x += q[0] * wi; y += q[1] * wi; z += q[2] * wi; w += wi; } Q.push([x / w, y / w, z / w]); Wq.push(w); }
    return { p: S.p, U: U.slice(), P: Q, W: Wq };
  }
  CAD.featExt.w2Iso = (f, s2) => {
    const p = f.params, it = nb.itemOf(s2, p.target, 'surface'), S = it.srf, vals = p.mode === 'one' ? [clamp(num(p.t, 0.5), 0, 1)] : Array.from({ length: Math.max(1, p.count | 0) }, (_, k) => (k + 1) / (Math.max(1, p.count | 0) + 1)), dirs = p.dir === 'both' ? ['u', 'v'] : [p.dir || 'u'];
    let k = 0; dirs.forEach((d) => vals.forEach((t) => { nb.putCurve(s2, f.id + '.' + (k++), (f.name || 'Isocurve') + ' ' + d + '=' + fmt(t, 3), isoCurve(S, d, t), f.id, { note: 'isocurve' }); }));
    return s2;
  };
  P.FUI.w2Iso = (f, stt) => {
    const p = f.params;
    return {
      fields: [
        { key: 'target', label: 'NURBS surface', value: p.target, optionsFn: () => nb.surfOpts(stt) }, { key: 'dir', label: 'Direction', value: p.dir || 'u', options: [['u', 'u = constant (curve runs along v)'], ['v', 'v = constant (curve runs along u)'], ['both', 'Both directions']] },
        { key: 'mode', label: 'How many', value: p.mode || 'count', options: [['count', 'Evenly spaced curves'], ['one', 'One curve at a parameter']] },
        { key: 'count', label: 'Number of curves', value: p.count || 5, show: (v) => v.mode === 'count' }, { key: 't', label: 'Parameter 0 … 1', value: p.t == null ? 0.5 : p.t, show: (v) => v.mode === 'one' }
      ],
      note: 'Exact isoparametric curves (no sampling): each has the surface’s own degree and knots. Trims are ignored.', apply: (v) => ({ target: v.target, dir: v.dir, mode: v.mode, count: v.count | 0 || 5, t: isFinite(v.t) ? v.t : 0.5 })
    };
  };
  async function cmdIso() {
    const o = nb.surfOpts(st.state || F.regen(st.doc)); if (!o.length || !o[0][0]) return toast('Create a NURBS surface first (NURBS tab)', true);
    const cur = st.itemSel && (st.state || F.regen(st.doc)).items.get(st.itemSel); const key = cur && cur.kind === 'surface' ? cur.key : o[0][0];
    const f = await P.createViaFUI('w2Iso', 'Isocurves', { target: key, dir: 'u', mode: 'count', count: 5, t: 0.5 }); if (f) { f.name = 'Isocurves'; P.refreshPanels(); }
  }

  // ================================================================= edge → curve
  function polylinesOf(s, les) {
    const adj = new Map(), segs = []; les.forEach((le) => le.segs.forEach(([a, b]) => { segs.push([a, b]); }));
    segs.forEach(([a, b], i) => { (adj.get(a) || adj.set(a, []).get(a)).push(i); (adj.get(b) || adj.set(b, []).get(b)).push(i); });
    const used = new Set(), out = [];
    const walk = (start) => { const line = [start]; let cur = start; for (;;) { const e = (adj.get(cur) || []).find((i) => !used.has(i)); if (e == null) break; used.add(e); const [a, b] = segs[e], nx = a === cur ? b : a; line.push(nx); cur = nx; } return line; };
    adj.forEach((l, v) => { if (l.length === 1) { const e = l[0]; if (!used.has(e)) out.push(walk(v)); } });
    segs.forEach(([a], i) => { if (!used.has(i)) out.push(walk(a)); });
    return out.map((idx) => idx.map((i) => s.V[i].slice()));
  }
  CAD.featExt.w2EdgeCrv = (f, s2) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found'); const s = b.solid, les = (p.edges || []).map((r) => F.resolveEdge(s, r)).filter(Boolean);
    if (!les.length) throw new Error('The edges were not found'); const lines = polylinesOf(s, les);
    lines.forEach((pts, k) => {
      let crv; if (p.smooth && pts.length > 3) { const stp = Math.max(1, Math.floor(pts.length / 120)), q = pts.filter((_, i) => i % stp === 0 || i === pts.length - 1); crv = X5.interpCurve(q, 3); } else crv = X5.polylineCurve(pts);
      nb.putCurve(s2, f.id + '.' + k, 'Edge curve ' + (k + 1), crv, f.id, { note: 'from edge' });
    });
    return s2;
  };
  P.FUI.w2EdgeCrv = (f) => ({ fields: [{ key: 'smooth', label: 'Smooth NURBS through the edge points (off = exact polyline)', type: 'checkbox', value: f.params.smooth !== false }], note: 'Connected edges become one curve. Smooth is best for rounded edges (circles, fillets); exact polyline keeps every corner.', apply: (v) => Object.assign({}, f.params, { smooth: !!v.smooth }) });
  async function cmdEdgeCurve() {
    const sel = st.sel; if (!sel || sel.type !== 'edge') return toast('Select one or more edges first (try Select+ ▸ Tangent chain to grab a whole outline)', true);
    const b = P.bodyByKey(sel.bodyId); if (!b) return; const f = await P.createViaFUI('w2EdgeCrv', 'Edge → curve', { body: b.key, edges: sel.edges.map((le) => F.edgeRef(b.solid, le)), smooth: true });
    if (f) { f.name = 'Edge → curve'; P.refreshPanels(); }
  }

  // ================================================================= pen
  const PEN = { on: false, pts: [], hover: null, plane: 'face', smooth: true, last: 0 };
  const pp = IK.panel('w2-pen', '✎ <i>Pen</i>', { top: '96px', left: '72px' });
  function renderPen() {
    pp.body.innerHTML = '<p class="note" style="margin:0 0 6px"><b>Click</b> to add points on the model / plane · <b>double-click</b> or <b>Enter</b> to finish · <b>Backspace</b> undoes a point · <b>Esc</b> cancels.</p>' +
      '<div class="row"><label>Draw on</label><select data-p><option value="face">Model faces (falls back to the ground plane)</option><option value="xy">Plane XY (Z = 0)</option><option value="xz">Plane XZ (Y = 0)</option><option value="yz">Plane YZ (X = 0)</option></select></div>' +
      '<div class="row"><label><input type="checkbox" data-s ' + (PEN.smooth ? 'checked' : '') + '> smooth curve through the points</label></div><div class="row"><button class="btn" data-a="fin">Finish</button> <button class="btn" data-a="cancel">Cancel</button> <span class="note" data-n>' + PEN.pts.length + ' point(s)</span></div>';
    pp.body.querySelector('[data-p]').value = PEN.plane; pp.body.querySelector('[data-p]').onchange = (e) => { PEN.plane = e.target.value; };
    pp.body.querySelector('[data-s]').onchange = (e) => { PEN.smooth = e.target.checked; P.redraw(); };
    pp.body.querySelector('[data-a=fin]').onclick = penFinish; pp.body.querySelector('[data-a=cancel]').onclick = penCancel;
  }
  const PL = { xy: [[0, 0, 0], [0, 0, 1]], xz: [[0, 0, 0], [0, 1, 0]], yz: [[0, 0, 0], [1, 0, 0]] };
  function penPoint(x, y) {
    const M = R.matrices(), ray = R.ray(x, y, M); let hit = null;
    if (PEN.plane === 'face') { const h = P.pickAt(x, y); if (h && h.body) { if (h.p) hit = h.p.slice(); else if (h.kind === 'vertex') hit = h.body.solid.V[h.vi].slice(); } }
    if (!hit) { const [o, n] = PL[PEN.plane === 'face' ? 'xy' : PEN.plane], den = dot(ray.d, n); if (Math.abs(den) > 1e-9) { const t = dot(sub(o, ray.o), n) / den; if (t > 0) hit = v3.madd(ray.o, ray.d, t); } }
    if (hit) {   // snap to a model vertex or a previous point within 10 px
      let best = null, bd = 10; const test = (q) => { const sp = R.project(q, M); if (sp[3] > 0) { const d = Math.hypot(sp[0] - x, sp[1] - y); if (d < bd) { bd = d; best = q; } } };
      st.bodies.forEach((b) => { if (b.visible) b.solid.V.forEach(test); }); PEN.pts.forEach(test); if (best) hit = best.slice();
    }
    return hit;
  }
  function penStart() { if (PEN.on) return; PEN.on = true; PEN.pts = []; PEN.hover = null; pp.show(); renderPen(); status('Pen: click to place points on the model or a plane — double-click or Enter finishes'); P.redraw(); }
  function penCancel() { PEN.on = false; PEN.pts = []; PEN.hover = null; pp.classList.remove('on'); P.redraw(); }
  function penFinish() {
    if (PEN.pts.length < 2) { toast('A curve needs at least two points', true); return; }
    let crv; try { crv = PEN.smooth && PEN.pts.length > 2 ? X5.interpCurve(PEN.pts, 3) : X5.polylineCurve(PEN.pts); } catch (e) { return toast(e.message, true); }
    const f = P.commitFeature({ type: 'nbLiteralCurve', name: 'Pen curve', params: { crv } }); if (f) f.name = 'Pen curve'; penCancel(); P.refreshPanels(); status('Pen curve created');
  }
  const prevDown = P.hooks.pointerDown, prevMove = P.hooks.pointerMove, prevKey = P.hooks.keydown;
  P.hooks.pointerDown = (x, y, e) => {
    if (PEN.on && e.button === 0 && !st.sketching) {
      const now = performance.now(), dbl = now - PEN.last < 320; PEN.last = now; if (dbl && PEN.pts.length >= 2) { penFinish(); return true; }
      const q = penPoint(x, y); if (q) { if (!PEN.pts.length || dist(q, PEN.pts[PEN.pts.length - 1]) > 1e-6) PEN.pts.push(q); const n = pp.body.querySelector('[data-n]'); if (n) n.textContent = PEN.pts.length + ' point(s)'; P.redraw(); }
      return true;
    }
    return prevDown ? prevDown(x, y, e) : false;
  };
  P.hooks.pointerMove = (x, y, e) => { if (PEN.on && !st.sketching) { PEN.hover = penPoint(x, y); P.redraw(); } return prevMove ? prevMove(x, y, e) : false; };
  P.hooks.keydown = (e) => {
    if (PEN.on) { if (e.key === 'Enter') { penFinish(); return true; } if (e.key === 'Escape') { penCancel(); return true; } if (e.key === 'Backspace') { PEN.pts.pop(); const n = pp.body.querySelector('[data-n]'); if (n) n.textContent = PEN.pts.length + ' point(s)'; P.redraw(); return true; } }
    return prevKey ? prevKey(e) : false;
  };
  pp.onclose = () => { if (PEN.on) penCancel(); };
  P.hooks.draw.push(() => {
    if (!PEN.on) return; const L = [], pts = PEN.pts.slice(); if (PEN.hover) pts.push(PEN.hover);
    let line = pts; if (PEN.smooth && pts.length > 2) { try { const c = X5.interpCurve(pts, 3); line = nb.sampleC(c, 80); } catch (e) { line = pts; } }
    for (let i = 0; i + 1 < line.length; i++) { L.push(line[i][0], line[i][1], line[i][2], 1, 0.75, 0.25, 1, line[i + 1][0], line[i + 1][1], line[i + 1][2], 1, 0.75, 0.25, 1); }
    if (L.length) R.lines(new Float32Array(L), { overlay: true });
    const Pp = []; PEN.pts.forEach((q) => Pp.push(q[0], q[1], q[2], 1, 0.9, 0.4, 1)); if (PEN.hover) Pp.push(PEN.hover[0], PEN.hover[1], PEN.hover[2], 0.6, 0.9, 1, 1); if (Pp.length) R.points(new Float32Array(Pp), 8, { overlay: true });
  });

  // ================================================================= registration + ribbon
  const I = { br: '<path d="M3 17c3 0 4-8 9-8s6 8 9 8"/><circle cx="3" cy="17" r="1.5"/><circle cx="21" cy="17" r="1.5"/>', iso: '<path d="M4 6c6 3 10 3 16 0 M4 12c6 3 10 3 16 0 M4 18c6 3 10 3 16 0"/>', edge: '<rect x="5" y="6" width="14" height="12" rx="1" stroke-dasharray="3 2"/><path d="M5 18h14" stroke-width="2.6"/>', pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>' };
  [['w2bridge', 'Bridge curve (G0–G3)', cmdBridge, 'Join two curve ends with G0 / G1 / G2 / G3 continuity', I.br], ['w2iso', 'Isocurves', cmdIso, 'Exact u / v curves from a NURBS surface', I.iso], ['w2edge', 'Edge → curve', cmdEdgeCurve, 'Duplicate selected solid edges as NURBS curves', I.edge], ['w2pen', 'Pen (draw on face)', penStart, 'Draw a curve directly on a face or plane — no sketch needed', I.pen]]
    .forEach(([id, label, fn, title, icon]) => W1.reg({ id, label, group: 'Curves', title, fn, icon }));
  P.addGroup('nurbsx', 'Curves & curvature', [['w2bridge', 'Bridge', cmdBridge, 'Bridge curve: join two curve ends with G0–G3 continuity', I.br], ['w2iso', 'Isocurves', cmdIso, 'Exact isoparametric curves of a NURBS surface', I.iso], ['w2edge', 'Edge → curve', cmdEdgeCurve, 'Duplicate selected edges as NURBS curves', I.edge], ['w2pen', 'Pen', penStart, 'Draw a curve directly on a face or plane', I.pen]], 'Analyse+');
  W1.curvesApi = { endDerivs, bridge, isoCurve, polylinesOf, cmdBridge, cmdIso, cmdEdgeCurve, penStart, penFinish, penCancel, PEN, penPoint };
  if (W1.publishSearch) W1.publishSearch();
  if (G.console) console.info('Aakar Wave 2 · curves loaded (bridge, isocurves, edge→curve, pen)');
})(typeof window !== 'undefined' ? window : globalThis);
