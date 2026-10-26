/* Aakar 8.20.0 · Wave 2 · SHAPE
 *   Deform (bend · twist · taper · flex) on solids, NURBS surfaces, curves and SubD cages
 *   Split face (imprint a line on a face) · Split body by a tool body · Silhouette split
 *   Rule fillet / chamfer (convex · concave · all · edges of picked faces) with up to three radii in one pass
 *   Feature wizards: Boss (round / square / hex, draft, hole) · Dome / Dimple · Lip · Groove
 *   Pattern on face (grid or circular) — new copies, join, or cut
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, W1 = G.AAKAR_W1;
  if (!CAD || !P || !CAD.ik || !W1 || !W1.edit || !W1.reg) { if (G.console) console.warn('Aakar Wave 2 shape: core not found'); return; }
  if (W1.shape) return; W1.shape = true;
  const IK = CAD.ik, { st, F, R, v3, $, num, clamp, fmt, toast, status } = IK, SV = CAD.solver, SOL = CAD.solid, AD = IK.adv, M3 = CAD.math;
  const D2R = Math.PI / 180, add = v3.add, sub = v3.sub, sc = v3.scale, dot = v3.dot, cross = v3.cross, nrm = v3.norm;
  const bodyOf = (k) => P.bodyByKey(k);
  const lexLess = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]);
  const bool = (op, a, b) => { const r = CAD.csg.boolean(op, a, b); return Array.isArray(r) ? r : [r]; };
  const AX = ['x', 'y', 'z'];

  // ================================================================= generic target (solid or item)
  function targetOptions(stt) {
    const o = AD.bodyOpts(stt).filter((x) => x[0]);
    [...stt.items.values()].filter((i) => i.kind === 'surface' || i.kind === 'subd' || i.kind === 'curve').forEach((i) => o.push([i.key, i.name + ' (' + (i.kind === 'subd' ? 'SubD' : i.kind === 'curve' ? 'curve' : 'surface') + ')']));
    return o.length ? o : [['', '(nothing to deform)']];
  }
  const itemPts = (it) => (it.srf ? [].concat(...it.srf.P) : it.crv ? it.crv.P : it.cage ? it.cage.V : []);
  function mapItem(it, map) {
    const o = Object.assign({}, it);
    if (it.srf) o.srf = Object.assign({}, it.srf, { P: it.srf.P.map((r) => r.map(map)) });
    if (it.crv) o.crv = Object.assign({}, it.crv, { P: it.crv.P.map(map) });
    if (it.cage) o.cage = Object.assign({}, it.cage, { V: it.cage.V.map(map) });
    return o;
  }
  function bboxOfPts(pts) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; pts.forEach((p) => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }); return { min: mn, max: mx }; }
  function curTarget() { if (st.itemSel) return st.itemSel; if (st.sel && st.sel.bodyId) return st.sel.bodyId; const v = st.bodies.filter((b) => b.visible); return v.length === 1 ? v[0].key : null; }

  // ================================================================= 1 · DEFORM
  function makeMap(p, bb) {
    const A = Math.max(0, AX.indexOf(p.axis || 'z')); let B = AX.indexOf(p.bdir || 'x'); if (B < 0 || B === A) B = (A + 1) % 3; const C = 3 - A - B;
    const lo = bb.min[A], hi = bb.max[A], ext = hi - lo || 1, s0 = lo + ext * clamp(num(p.s0, 0), 0, 100) / 100, s1 = lo + ext * clamp(num(p.s1, 100), 0, 100) / 100, L = Math.max(1e-9, s1 - s0);
    const cb = (bb.min[B] + bb.max[B]) / 2, cc = (bb.min[C] + bb.max[C]) / 2, tw = num(p.twist, 0) * D2R, tp = num(p.taper, 0) / 100, bd = num(p.bend, 0) * D2R;
    const fn = (q) => {
      const m = q[A]; let w = q[B] - cb, c = q[C] - cc; const t = clamp((m - s0) / L, 0, 1);
      const k = 1 + tp * t; w *= k; c *= k;
      const th = tw * t, cs = Math.cos(th), sn = Math.sin(th), w2 = w * cs - c * sn, c2 = w * sn + c * cs; w = w2; c = c2;
      const mm = m - s0; let M = mm, W = w;
      if (Math.abs(bd) > 1e-9 && mm > 0) {
        const Rr = L / bd, mc = Math.min(mm, L), ang = mc / Rr, r = Rr - w; let nm = r * Math.sin(ang), nw = Rr - r * Math.cos(ang);
        if (mm > L) { const e = (mm - L) * (r / Rr); nm += e * Math.cos(bd); nw += e * Math.sin(bd); }
        M = nm; W = nw;
      }
      const o = [0, 0, 0]; o[A] = s0 + M; o[B] = cb + W; o[C] = cc + c; return o;
    };
    return { fn, A, s0, s1 };
  }
  function cutPt(a, b, A, c) { let pa = a, pb = b; if (lexLess(pb, pa)) { pa = b; pb = a; } const t = (c - pa[A]) / (pb[A] - pa[A]); const p = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t]; p[A] = c; return p; }
  function slicePoly(poly, A, planes, eps) {
    let polys = [poly];
    planes.forEach((c) => {
      const out = [];
      polys.forEach((pl) => {
        let mn = Infinity, mx = -Infinity; pl.forEach((q) => { mn = Math.min(mn, q[A]); mx = Math.max(mx, q[A]); });
        if (mx <= c + eps || mn >= c - eps) { out.push(pl); return; }
        const lo = [], hi = [];
        for (let i = 0; i < pl.length; i++) {
          const a = pl[i], b = pl[(i + 1) % pl.length], da = a[A] - c, db = b[A] - c;
          if (da <= eps) lo.push(a); if (da >= -eps) hi.push(a);
          if ((da < -eps && db > eps) || (da > eps && db < -eps)) { const x = cutPt(a, b, A, c); lo.push(x); hi.push(x); }
        }
        if (lo.length >= 3) out.push(lo); if (hi.length >= 3) out.push(hi);
      });
      polys = out;
    });
    return polys;
  }
  function deformSolid(s, mp, seg) {
    const A = mp.A, scale = s.scale(), eps = scale * 1e-9, planes = [];
    for (let k = 0; k <= seg; k++) planes.push(mp.s0 + (mp.s1 - mp.s0) * k / seg);
    const Vn = [], key = new Map(), faces = [];
    const vid = (p) => { const k = p[0].toFixed(8) + ',' + p[1].toFixed(8) + ',' + p[2].toFixed(8); let i = key.get(k); if (i == null) { i = Vn.length; Vn.push(mp.fn(p)); key.set(k, i); } return i; };
    s.F.forEach((f, fi) => {
      const grp = f.group || ('dfm' + fi);
      SOL.triangulateFace(s, fi).forEach((t) => {
        slicePoly(t.map((i) => s.V[i]), A, planes, eps).forEach((poly) => {
          const ids = poly.map(vid);
          for (let k = 1; k + 1 < ids.length; k++) {
            const a = ids[0], b = ids[k], c = ids[k + 1]; if (a === b || b === c || a === c) continue;
            const n = cross(sub(Vn[b], Vn[a]), sub(Vn[c], Vn[a])), l = v3.len(n); if (l < 1e-14 * scale * scale) continue;
            const nn = sc(n, 1 / l); faces.push({ n: nn, d: dot(nn, Vn[a]), loops: [[a, b, c]], group: grp });
          }
        });
      });
    });
    const out = new CAD.Solid(Vn, faces); if (!(out.volume() > 0)) throw new Error('The deformation turned the solid inside out — use a smaller angle or a shorter range');
    return out;
  }
  CAD.featNames = Object.assign(CAD.featNames || {}, { w2Deform: 'Deform', w2SplitFace: 'Split face', w2SplitBody: 'Split body (by tool)', w2Silhouette: 'Silhouette split', w2Wiz: 'Feature wizard', w2FPat: 'Pattern on face' });
  CAD.featExt.w2Deform = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.target);
    if (b) { const mp = makeMap(p, b.solid.bbox()); h.setSolid(s2, b, deformSolid(b.solid, mp, clamp(p.seg | 0 || 24, 4, 120))); return s2; }
    const it = s2.items.get(p.target); if (!it) throw new Error('The deformed object was not found (deleted, or it comes later in the history)');
    const pts = itemPts(it); if (!pts.length) throw new Error('This kind of item cannot be deformed');
    const mp = makeMap(p, bboxOfPts(pts)); s2.items.set(it.key, mapItem(it, mp.fn)); return s2;
  };
  P.FUI.w2Deform = (f, stt) => {
    const p = f.params;
    return {
      fields: [
        { key: 'target', label: 'Object', value: p.target, optionsFn: () => targetOptions(stt) },
        { key: 'axis', label: 'Along axis', value: p.axis || 'z', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
        { key: 'bend', label: 'Bend (°) over the range', value: p.bend == null ? 30 : p.bend },
        { key: 'bdir', label: 'Bend towards', value: p.bdir || 'x', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
        { key: 'twist', label: 'Twist (°) over the range', value: p.twist || 0 },
        { key: 'taper', label: 'Taper (%) — size change over the range', value: p.taper || 0 },
        { key: 's0', label: 'Range starts at (% of length)', value: p.s0 == null ? 0 : p.s0 },
        { key: 's1', label: 'Range ends at (% of length)', value: p.s1 == null ? 100 : p.s1 },
        { key: 'seg', label: 'Smoothness (slices along the axis)', value: p.seg || 24 }
      ],
      note: 'Flex = bend + twist + taper together. The solid is sliced along the axis and every slice is moved — beyond the range it moves rigidly, so the ends stay straight. NURBS surfaces, curves and SubD cages move their control points: add knots / subdivide first for a smoother result.',
      apply: (v) => ({ target: v.target, axis: v.axis, bdir: v.bdir, bend: isFinite(v.bend) ? v.bend : 0, twist: isFinite(v.twist) ? v.twist : 0, taper: isFinite(v.taper) ? v.taper : 0, s0: isFinite(v.s0) ? v.s0 : 0, s1: isFinite(v.s1) ? v.s1 : 100, seg: isFinite(v.seg) ? v.seg : 24 })
    };
  };
  async function cmdDeform() {
    const t = curTarget(); if (!t) return toast('Select a solid, a surface or a curve first', true);
    const f = await P.createViaFUI('w2Deform', 'Deform — bend · twist · taper · flex', { target: t, axis: 'z', bdir: 'x', bend: 30, twist: 0, taper: 0, s0: 0, s1: 100, seg: 24 });
    if (f) { const q = f.params, bits = []; if (q.bend) bits.push('bend ' + fmt(q.bend, 1) + '°'); if (q.twist) bits.push('twist ' + fmt(q.twist, 1) + '°'); if (q.taper) bits.push('taper ' + fmt(q.taper, 1) + '%'); f.name = 'Deform ' + (bits.join(' · ') || ''); P.refreshPanels(); }
  }

  // ================================================================= 2 · SPLIT FACE / BODY / SILHOUETTE
  function polyClip1(poly, A, pos, eps) {       // poly: [{i, p}] -> {hi, lo}
    const lo = [], hi = [], nv = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = a.p[A] - pos, db = b.p[A] - pos;
      if (da <= eps) lo.push(a); if (da >= -eps) hi.push(a);
      if ((da < -eps && db > eps) || (da > eps && db < -eps)) { const p = cutPt(a.p, b.p, A, pos), x = { i: -1, p }; lo.push(x); hi.push(x); nv.push(x); }
    }
    return { lo, hi };
  }
  function splitFaces(s, idx, A, pos) {
    const eps = s.scale() * 1e-9, set = new Set(idx), V = s.V.map((p) => p.slice()), n0 = V.length, cache = new Map(), faces = []; let crossed = 0;
    const addV = (p) => { const k = p.map((x) => x.toFixed(9)).join(','); let i = cache.get(k); if (i == null) { i = V.length; V.push(p); cache.set(k, i); } return i; };
    const idOf = (q) => (q.i >= 0 ? q.i : (q.i = addV(q.p)));
    s.F.forEach((f, fi) => {
      if (!set.has(fi)) return;
      const base = f.group || ('sf' + fi);
      SOL.triangulateFace(s, fi).forEach((t) => {
        const r = polyClip1(t.map((i) => ({ i, p: s.V[i] })), A, pos, eps), emit = (poly, tag) => { if (poly.length < 3) return; const ids = poly.map(idOf); for (let k = 1; k + 1 < ids.length; k++) { if (ids[0] === ids[k] || ids[k] === ids[k + 1] || ids[0] === ids[k + 1]) continue; faces.push({ n: f.n.slice(), d: f.d, loops: [[ids[0], ids[k], ids[k + 1]]], group: base + tag }); } };
        const flat = (poly) => poly.every((q) => Math.abs(q.p[A] - pos) <= eps);
        if (r.lo.length >= 3 && r.hi.length >= 3 && !flat(r.lo) && !flat(r.hi)) { crossed++; emit(r.hi, '|H'); emit(r.lo, '|L'); }
        else { const above = t.some((i) => s.V[i][A] > pos + eps); emit(t.map((i) => ({ i, p: s.V[i] })), above ? '|H' : '|L'); }
      });
    });
    if (!crossed) throw new Error('The line does not cross the face — move it through the face');
    const tol = s.scale() * 1e-6;
    const fixLoop = (loop) => {
      const out = [];
      for (let k = 0; k < loop.length; k++) {
        const a = loop[k], b = loop[(k + 1) % loop.length]; out.push(a); const pa = V[a], pb = V[b], ab = sub(pb, pa), l2 = dot(ab, ab), ins = [];
        for (let q = n0; q < V.length; q++) { if (q === a || q === b) continue; const t = dot(sub(V[q], pa), ab) / l2; if (t <= 1e-9 || t >= 1 - 1e-9) continue; if (v3.dist(V[q], v3.madd(pa, ab, t)) < tol) ins.push([t, q]); }
        ins.sort((x, y) => x[0] - y[0]); ins.forEach(([, q]) => out.push(q));
      }
      return out;
    };
    const keep = []; s.F.forEach((f, fi) => { if (!set.has(fi)) keep.push({ n: f.n.slice(), d: f.d, loops: f.loops.map(fixLoop), group: f.group }); });
    return new CAD.Solid(V, keep.concat(faces));
  }
  CAD.featExt.w2SplitFace = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found'); const s = b.solid, idx = [];
    (p.faces || []).forEach((r) => { const i = F.resolveFace(s, r); if (i >= 0 && !idx.includes(i)) idx.push(i); });
    if (!idx.length) throw new Error('The face to split was not found');
    const set = p.patch === false ? idx : W1.api.expandFaces(s, idx, 'group'), A = Math.max(0, AX.indexOf(p.axis || 'x'));
    const out = splitFaces(s, set, A, num(p.pos, 0)), v = SV.validate(out, s); if (!v.ok) throw new Error('Split not possible here: ' + v.reason);
    h.setSolid(s2, b, out); return s2;
  };
  P.FUI.w2SplitFace = (f, stt) => {
    const p = f.params;
    return {
      fields: [
        { key: 'body', label: 'Solid', value: p.body, optionsFn: () => AD.bodyOpts(stt) },
        { key: 'axis', label: 'Cut with a plane perpendicular to', value: p.axis || 'x', options: [['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']] },
        { key: 'pos', label: 'Plane position along that axis (mm)', value: p.pos == null ? 0 : p.pos },
        { key: 'patch', label: 'Split the whole curved patch (all facets of the picked face)', type: 'checkbox', value: p.patch !== false }
      ],
      note: 'The picked face is divided along the line where the plane cuts it. The two halves become separate faces with a visible edge between them — you can then select, offset, draft or colour each half. The solid itself does not change.',
      apply: (v) => Object.assign({}, p, { body: v.body, axis: v.axis, pos: isFinite(v.pos) ? v.pos : 0, patch: !!v.patch })
    };
  };
  async function cmdSplitFace() {
    const sel = st.sel; if (!sel || sel.type !== 'face') return toast('Select the face to split first (click a face)', true);
    const b = bodyOf(sel.bodyId); if (!b) return; const s = b.solid, c = s.faceCentroid(sel.faces[0]), n = s.F[sel.faces[0]].n;
    const axis = AX[[0, 1, 2].filter((k) => Math.abs(n[k]) < 0.7)[0] != null ? [0, 1, 2].filter((k) => Math.abs(n[k]) < 0.7)[0] : 0];
    const f = await P.createViaFUI('w2SplitFace', 'Split face', { body: b.key, faces: sel.faces.map((fi) => F.faceRef(s, fi)), axis, pos: +c[AX.indexOf(axis)].toFixed(4), patch: true });
    if (f) { f.name = 'Split face (' + f.params.axis.toUpperCase() + ' = ' + fmt(f.params.pos, 2) + ')'; P.refreshPanels(); }
  }
  CAD.featExt.w2SplitBody = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body), t = s2.bodies.get(p.tool); if (!b || !t) throw new Error('Body or tool body not found');
    if (b.key === t.key) throw new Error('Pick a different body as the tool');
    const ins = bool('intersect', b.solid, t.solid).filter(Boolean), outs = bool('subtract', b.solid, t.solid).filter(Boolean);
    if (!ins.length || !outs.length) throw new Error('The tool body does not split this solid — it must pass through it');
    s2.bodies.delete(b.key); h.putBodies(s2, b.key, b.name + ' · outside', outs, b.src, b.bim); h.putBodies(s2, f.id + ':in', b.name + ' · inside', ins, b.src, b.bim);
    if (!p.keepTool) s2.bodies.delete(t.key); return s2;
  };
  P.FUI.w2SplitBody = (f, stt) => ({ fields: [{ key: 'body', label: 'Solid to split', value: f.params.body, optionsFn: () => AD.bodyOpts(stt) }, { key: 'tool', label: 'Tool body (cuts through it)', value: f.params.tool, optionsFn: () => AD.bodyOpts(stt) }, { key: 'keepTool', label: 'Keep the tool body', type: 'checkbox', value: !!f.params.keepTool }], note: 'The solid is divided into the part inside the tool and the part outside it, as two bodies. Any solid works as a tool — a sheet-like thin plate gives a split “by surface”.', apply: (v) => ({ body: v.body, tool: v.tool, keepTool: !!v.keepTool }) });
  async function cmdSplitBody() {
    const vis = st.bodies.filter((x) => x.visible); if (vis.length < 2) return toast('Splitting by a tool body needs two bodies (the solid and the tool)', true);
    const sel = st.sel && st.sel.bodyId ? st.sel.bodyId : vis[0].key, tool = (vis.find((x) => x.key !== sel) || vis[1]).key;
    const f = await P.createViaFUI('w2SplitBody', 'Split body by tool', { body: sel, tool, keepTool: false }); if (f) { f.name = 'Split body by tool'; P.refreshPanels(); }
  }
  CAD.featExt.w2Silhouette = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found'); const s = b.solid, d = nrm(p.dir || [0, 0, 1]), tol = num(p.tol, 1e-3);
    const signs = new Map(); s.F.forEach((fc) => { if (!fc.group) return; const k = dot(fc.n, d) >= -tol ? 1 : -1; const e = signs.get(fc.group) || { p: 0, n: 0 }; if (k > 0) e.p++; else e.n++; signs.set(fc.group, e); });
    let split = 0; signs.forEach((e) => { if (e.p && e.n) split++; });
    if (!split) throw new Error('No curved face crosses the silhouette in this direction');
    const F2 = s.F.map((fc) => { const o = { n: fc.n.slice(), d: fc.d, loops: fc.loops.map((l) => l.slice()), group: fc.group }; const e = fc.group && signs.get(fc.group); if (e && e.p && e.n) o.group = fc.group + (dot(fc.n, d) >= -tol ? '|S+' : '|S-'); return o; });
    h.setSolid(s2, b, new CAD.Solid(s.V.map((q) => q.slice()), F2)); return s2;
  };
  P.FUI.w2Silhouette = (f, stt) => ({ fields: [{ key: 'body', label: 'Solid', value: f.params.body, optionsFn: () => AD.bodyOpts(stt) }, { key: 'dir', label: 'Look along', value: f.params.mode || 'z', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['view', 'Current view direction']] }], note: 'Curved faces that bend away from the chosen direction are split along the silhouette (the parting line). The two halves are separate faces — useful before Draft, Core & cavity or Offset face. Because curves are stored as facets, the split runs along a facet edge.', apply: (v) => { let dir = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[v.dir]; if (v.dir === 'view') { const M = R.matrices(); dir = nrm(sub(M.eye, R.cam.target)); } return { body: v.body, dir: dir.map((x) => +x.toFixed(6)), mode: v.dir, tol: 1e-3 }; } });
  async function cmdSilhouette() {
    const t = curTarget(); const b = t && bodyOf(t); if (!b) return toast('Select a solid first', true);
    const f = await P.createViaFUI('w2Silhouette', 'Silhouette split', { body: b.key, dir: [0, 0, 1], mode: 'z' }); if (f) { f.name = 'Silhouette split (' + (f.params.mode === 'view' ? 'view' : f.params.mode.toUpperCase()) + ')'; P.refreshPanels(); }
  }
  async function cmdSplit() {
    const v = await P.dialog('Split', [{ key: 'm', label: 'What to split', value: 'face', options: [['face', 'A face — divide it along a line'], ['body', 'A body — cut it with another body'], ['sil', 'Curved faces — along the silhouette (parting line)']] }], { note: 'Face: select the face first. Body: needs a second body as the tool. Silhouette: select the solid.' });
    if (!v) return; if (v.m === 'face') return cmdSplitFace(); if (v.m === 'body') return cmdSplitBody(); return cmdSilhouette();
  }

  // ================================================================= 3 · RULE FILLET
  function convexEdge(s, le) {
    const m = v3.scale(v3.add(s.V[le.segs[0][0]], s.V[le.segs[0][1]]), 0.5), fa = s.F[le.faces[0]], fb = s.F[le.faces[1]], ca = s.faceCentroid(le.faces[0]), cb = s.faceCentroid(le.faces[1]);
    return dot(fb.n, sub(ca, m)) + dot(fa.n, sub(cb, m)) < 0;
  }
  function ruleEdges(s, rule, sel) {
    const les = SV.logicalEdges(s).filter((le) => !le.smooth && le.faces.length === 2 && le.faces[0] !== le.faces[1] && dot(s.F[le.faces[0]].n, s.F[le.faces[1]].n) < 0.94);   // skip tangent edges (≥ 20° only)
    const flat = (le) => !s.F[le.faces[0]].group && !s.F[le.faces[1]].group;   // rules never pick edges next to curved patches (fillet ends, cylinders…)
    if (rule === 'convex') return les.filter((le) => flat(le) && convexEdge(s, le));
    if (rule === 'concave') return les.filter((le) => flat(le) && !convexEdge(s, le));
    if (rule === 'all') return les.filter(flat);
    if (rule === 'selfaces') { const set = new Set(sel.faces || []); return les.filter((le) => le.faces.filter((x) => set.has(x)).length === 1); }
    if (rule === 'sel') return (sel.edges || []).map((e) => les.find((x) => x.key === e.key)).filter(Boolean);
    return [];
  }
  const RULES1 = [['sel', 'The edges I selected'], ['selfaces', 'All edges around the selected faces'], ['convex', 'All convex (outside) edges'], ['concave', 'All concave (inside) edges'], ['all', 'All sharp edges']];
  const RULES2 = [['none', '— none —'], ['convex', 'All convex (outside) edges'], ['concave', 'All concave (inside) edges'], ['all', 'All remaining sharp edges']];
  async function cmdRuleFillet() {
    const t = curTarget(); const b0 = t && bodyOf(t); if (!b0) return toast('Select a solid, an edge or a face first', true);
    const sel = st.sel && st.sel.bodyId === b0.key ? st.sel : null, def = sel && sel.type === 'edge' ? 'sel' : sel && sel.type === 'face' ? 'selfaces' : 'convex';
    const v = await P.dialog('Rule fillet / chamfer — up to three radii in one pass', [
      { key: 'kind', label: 'Type', value: 'fillet', options: [['fillet', 'Fillet'], ['chamfer', 'Chamfer']] },
      { key: 'r1', label: 'Pass 1 — radius / distance (mm)', value: 3 }, { key: 'rule1', label: 'Pass 1 — edges', value: def, options: RULES1 },
      { key: 'r2', label: 'Pass 2 — radius / distance (mm)', value: 1 }, { key: 'rule2', label: 'Pass 2 — edges', value: 'none', options: RULES2 },
      { key: 'r3', label: 'Pass 3 — radius / distance (mm)', value: 0.5 }, { key: 'rule3', label: 'Pass 3 — edges', value: 'none', options: RULES2 }
    ], { note: 'Each pass picks its edges by a rule on the current shape, so a later pass only sees the edges that are still sharp. Every pass becomes an ordinary, editable Fillet / Chamfer feature.' });
    if (!v) return; let done = 0; const key = b0.key;
    for (const [rule, r] of [[v.rule1, v.r1], [v.rule2, v.r2], [v.rule3, v.r3]]) {
      if (rule === 'none' || !(r > 0)) continue; const b = bodyOf(key); if (!b) break;
      const les = ruleEdges(b.solid, rule, done === 0 && sel ? sel : {}); if (!les.length) { toast('Pass with rule “' + rule + '”: no edge matches', true); continue; }
      const f = P.commitFeature({ type: v.kind, params: { body: key, edges: les.map((le) => F.edgeRef(b.solid, le)), r } }, true); f.name = (v.kind === 'fillet' ? 'Fillet R' : 'Chamfer ') + fmt(r, 2) + ' · ' + (RULES1.find((x) => x[0] === rule) || [0, rule])[1].toLowerCase(); done++;
    }
    P.refreshPanels(); P.redraw(); status(done ? done + ' pass' + (done > 1 ? 'es' : '') + ' applied' : 'Nothing was applied');
  }

  // ================================================================= 4 · WIZARDS (boss · dome · lip · groove)
  function frameOfFace(s, fi, du, dv) {
    const n = nrm(s.F[fi].n), o = s.faceCentroid(fi), { u, v } = M3.basis(n); return { o: add(o, add(sc(u, du || 0), sc(v, dv || 0))), u, v, n };
  }
  function profile(shape, size, seg) {
    const r = size / 2; if (shape === 'square') return [[-r, -r], [r, -r], [r, r], [-r, r]];
    const n = shape === 'hex' ? 6 : seg || 48, pts = []; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n + (shape === 'hex' ? 0 : 0); pts.push([r * Math.cos(a), r * Math.sin(a)]); } return pts;
  }
  function solidFromLoops(bot, top) {       // two CCW polygons (3D, same count) -> frustum solid
    const n = bot.length, V = bot.concat(top), faces = [], mk = (ids) => { const nn = nrm(M3.newell(ids.map((i) => V[i]))); return { n: nn, d: dot(nn, V[ids[0]]), loops: [ids] }; };
    faces.push(mk(Array.from({ length: n }, (_, i) => n - 1 - i))); faces.push(mk(Array.from({ length: n }, (_, i) => n + i)));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push(mk([i, j, n + j, n + i])); }
    return new CAD.Solid(V, faces);
  }
  function poly3(fr, pts2, h) { return pts2.map(([x, y]) => add(fr.o, add(add(sc(fr.u, x), sc(fr.v, y)), sc(fr.n, h)))); }
  function insetPoly(pts, d) {            // CCW polygon, inward miter offset by d (d<0 grows)
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      const e1 = unit2([p1[0] - p0[0], p1[1] - p0[1]]), e2 = unit2([p2[0] - p1[0], p2[1] - p1[1]]), n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]], k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      const m = [n1[0] + n2[0], n1[1] + n2[1]], f = d / Math.max(0.2, k); out.push([p1[0] + m[0] * f, p1[1] + m[1] * f]);
    }
    return out;
  }
  const unit2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const area2 = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
  function prismOf(fr, pts2, h0, h1) { let P2 = pts2.slice(); if (area2(P2) < 0) P2.reverse(); return SOL.prism2D(P2, { o: fr.o, u: fr.u, v: fr.v, n: fr.n }, h0, h1); }
  function one(arr, what) { if (!arr || arr.length !== 1) throw new Error(what + ' did not produce a single solid (the tool may be tangent to an edge — change a size slightly)'); return arr[0]; }
  CAD.featExt.w2Wiz = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found'); const s = b.solid, fi = F.resolveFace(s, p.face); if (fi < 0) throw new Error('The face for this feature was not found');
    const fr = frameOfFace(s, fi, num(p.du, 0), num(p.dv, 0)), ov = Math.max(0.2, s.scale() * 0.002); let out = s;
    if (p.type === 'boss') {
      const hgt = num(p.h, 5), size = num(p.size, 10), shape = p.shape || 'round', pf = profile(shape, size, 48), dr = Math.tan(num(p.draft, 0) * D2R), k = Math.max(0.05, 1 - hgt * dr / (size / 2));
      const tool = Math.abs(dr) < 1e-9 ? prismOf(fr, pf, -ov, hgt) : solidFromLoops(poly3(fr, pf, -ov), poly3(fr, pf.map(([x, y]) => [x * k, y * k]), hgt));
      out = one(bool('union', out, tool), 'Boss');
      if (num(p.hole, 0) > 0) { const hole = prismOf(fr, profile('round', num(p.hole, 3), 40), hgt - num(p.hdepth, hgt), hgt + ov); out = one(bool('subtract', out, hole), 'Boss hole'); }
    } else if (p.type === 'dome' || p.type === 'dimple') {
      const r = num(p.size, 20) / 2, H = clamp(num(p.h, 5), 0.01, r), Rs = (r * r + H * H) / (2 * H), up = p.type === 'dome', c = up ? sub(fr.o, sc(fr.n, Rs - H)) : add(fr.o, sc(fr.n, Rs - H));
      const sph = SOL.PRIM.sphere(Rs, 24, 48, [c[0], c[1], c[2] - Rs])   /* PRIM.sphere takes its lowest point, not its centre */, big = Rs * 2.5, sq = [[-big, -big], [big, -big], [big, big], [-big, big]];
      const half = up ? prismOf(fr, sq, -ov, Rs * 2) : prismOf(fr, sq, -Rs * 2, ov), cap = one(bool('intersect', sph, half), 'Dome');
      out = one(bool(up ? 'union' : 'subtract', out, cap), up ? 'Dome' : 'Dimple');
    } else {   // lip / groove — follow the outer outline of the face
      const loop = s.F[fi].loops[0], P2 = loop.map((i) => { const d = sub(s.V[i], fr.o); return [dot(d, fr.u), dot(d, fr.v)]; }); if (area2(P2) < 0) P2.reverse();
      const inset = num(p.inset, 1), wall = num(p.wall, 1.5), hgt = num(p.h, 3), cl = Math.max(0, num(p.clear, 0.2));
      const outer = p.type === 'lip' ? insetPoly(P2, inset) : insetPoly(P2, inset - cl), inner = p.type === 'lip' ? insetPoly(P2, inset + wall) : insetPoly(P2, inset + wall + cl);
      if (area2(inner) <= 0 || area2(outer) <= area2(inner)) throw new Error('The wall does not fit inside the face outline — reduce the inset or the wall thickness');
      if (p.type === 'lip') { const ring = one(bool('subtract', prismOf(fr, outer, -ov, hgt), prismOf(fr, inner, -2 * ov, hgt + ov)), 'Lip'); out = one(bool('union', out, ring), 'Lip'); }
      else { const ring = one(bool('subtract', prismOf(fr, outer, -hgt - cl, ov), prismOf(fr, inner, -hgt - cl - ov, 2 * ov)), 'Groove'); out = one(bool('subtract', out, ring), 'Groove'); }
    }
    h.setSolid(s2, b, out); return s2;
  };
  const WIZ = [['boss', 'Boss (raised round / square / hex pad)'], ['dome', 'Dome (rounded bump)'], ['dimple', 'Dimple (rounded dent)'], ['lip', 'Lip (raised rim along the outline)'], ['groove', 'Groove (channel for a mating lip)']];
  P.FUI.w2Wiz = (f, stt) => {
    const p = f.params, is = (v, ...a) => a.includes(v.type);
    return {
      fields: [
        { key: 'type', label: 'Feature', value: p.type || 'boss', options: WIZ },
        { key: 'shape', label: 'Shape', value: p.shape || 'round', options: [['round', 'Round'], ['square', 'Square'], ['hex', 'Hexagon']], show: (v) => is(v, 'boss') },
        { key: 'size', label: 'Size — diameter / width (mm)', value: p.size == null ? 12 : p.size, show: (v) => is(v, 'boss', 'dome', 'dimple') },
        { key: 'h', label: 'Height / depth (mm)', value: p.h == null ? 5 : p.h },
        { key: 'draft', label: 'Draft angle (°)', value: p.draft || 0, show: (v) => is(v, 'boss') },
        { key: 'hole', label: 'Hole diameter (mm, 0 = none)', value: p.hole || 0, show: (v) => is(v, 'boss') },
        { key: 'hdepth', label: 'Hole depth (mm)', value: p.hdepth == null ? 8 : p.hdepth, show: (v) => is(v, 'boss') && v.hole > 0 },
        { key: 'du', label: 'Move along U (mm)', value: p.du || 0, show: (v) => is(v, 'boss', 'dome', 'dimple') }, { key: 'dv', label: 'Move along V (mm)', value: p.dv || 0, show: (v) => is(v, 'boss', 'dome', 'dimple') },
        { key: 'inset', label: 'Distance from the outline (mm)', value: p.inset == null ? 1 : p.inset, show: (v) => is(v, 'lip', 'groove') },
        { key: 'wall', label: 'Wall thickness (mm)', value: p.wall == null ? 1.5 : p.wall, show: (v) => is(v, 'lip', 'groove') },
        { key: 'clear', label: 'Clearance for the mating part (mm)', value: p.clear == null ? 0.2 : p.clear, show: (v) => is(v, 'groove') }
      ],
      note: 'Boss / dome / dimple are centred on the face (use the U / V moves to shift them). Lip raises a thin wall that follows the face outline; Groove cuts the matching channel — use the same inset and wall, and a little clearance — on the face of the mating part.',
      apply: (v) => Object.assign({}, p, { type: v.type, shape: v.shape, size: v.size, h: v.h, draft: v.draft, hole: v.hole, hdepth: v.hdepth, du: v.du, dv: v.dv, inset: v.inset, wall: v.wall, clear: v.clear })
    };
  };
  async function cmdWizard(type) {
    const sel = st.sel; if (!sel || sel.type !== 'face') return toast('Select a flat face first — the feature is placed on it', true);
    const b = bodyOf(sel.bodyId); if (!b) return; const f = await P.createViaFUI('w2Wiz', 'Feature wizard', { body: b.key, face: F.faceRef(b.solid, sel.faces[0]), type: type || 'boss', shape: 'round', size: 12, h: 5, draft: 0, hole: 0, hdepth: 8, du: 0, dv: 0, inset: 1, wall: 1.5, clear: 0.2 });
    if (f) { f.name = (WIZ.find((x) => x[0] === f.params.type) || ['', f.params.type])[1].split(' (')[0]; P.refreshPanels(); }
  }

  // ================================================================= 5 · PATTERN ON FACE
  const moveSolid = (s, d) => F.transformSolid(s, (q) => add(q, d), (q) => q);
  function rotSolid(s, c, axis, ang) { const Rm = M3.rotAxis(axis, ang); return F.transformSolid(s, (q) => add(c, M3.mul3v(Rm, sub(q, c))), (q) => M3.mul3v(Rm, q)); }
  CAD.featExt.w2FPat = (f, s2, h) => {
    const p = f.params, src = s2.bodies.get(p.src), tb = s2.bodies.get(p.face.body); if (!src || !tb) throw new Error('Source or target body not found');
    const fi = F.resolveFace(tb.solid, p.face.ref); if (fi < 0) throw new Error('The reference face was not found');
    const fr = frameOfFace(tb.solid, fi, 0, 0), inst = [];
    if (p.kind === 'circular') {
      const n = Math.max(2, p.count | 0), tot = num(p.angle, 360), step = Math.abs(tot) >= 359.999 ? tot / n : tot / (n - 1), c = add(fr.o, add(sc(fr.u, num(p.cu, 0)), sc(fr.v, num(p.cv, 0))));
      for (let k = 0; k < n; k++) inst.push(k === 0 ? src.solid : rotSolid(src.solid, c, fr.n, k * step * D2R));
    } else {
      const nu = Math.max(1, p.nu | 0), nv = Math.max(1, p.nv | 0), du = num(p.du, 10), dv = num(p.dv, 10);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) inst.push(i === 0 && j === 0 ? src.solid : moveSolid(src.solid, add(sc(fr.u, i * du), sc(fr.v, j * dv))));
    }
    if (p.mode === 'new') { inst.forEach((so, k) => { if (k) h.putBodies(s2, f.id + ':' + k, src.name + ' ' + (k + 1), [so], src.src, src.bim); }); return s2; }
    let cur = tb.solid; inst.forEach((so, k) => { cur = one(bool(p.mode === 'cut' ? 'subtract' : 'union', cur, so), 'Instance ' + (k + 1)); });
    h.setSolid(s2, tb, cur); if (src.key !== tb.key) s2.bodies.delete(src.key); return s2;
  };
  P.FUI.w2FPat = (f, stt) => {
    const p = f.params;
    return {
      fields: [
        { key: 'src', label: 'Body to repeat (a boss, a cutter, a rib…)', value: p.src, optionsFn: () => AD.bodyOpts(stt) },
        { key: 'kind', label: 'Layout', value: p.kind || 'grid', options: [['grid', 'Grid on the face'], ['circular', 'Circular around the face centre']] },
        { key: 'nu', label: 'Columns (along U)', value: p.nu || 3, show: (v) => v.kind === 'grid' }, { key: 'du', label: 'Spacing along U (mm)', value: p.du == null ? 15 : p.du, show: (v) => v.kind === 'grid' },
        { key: 'nv', label: 'Rows (along V)', value: p.nv || 2, show: (v) => v.kind === 'grid' }, { key: 'dv', label: 'Spacing along V (mm)', value: p.dv == null ? 15 : p.dv, show: (v) => v.kind === 'grid' },
        { key: 'count', label: 'Number of copies', value: p.count || 6, show: (v) => v.kind === 'circular' }, { key: 'angle', label: 'Total angle (°)', value: p.angle || 360, show: (v) => v.kind === 'circular' },
        { key: 'cu', label: 'Centre shift U (mm)', value: p.cu || 0, show: (v) => v.kind === 'circular' }, { key: 'cv', label: 'Centre shift V (mm)', value: p.cv || 0, show: (v) => v.kind === 'circular' },
        { key: 'mode', label: 'Result', value: p.mode || 'join', options: [['join', 'Join into the face’s body'], ['cut', 'Cut from the face’s body'], ['new', 'Separate new bodies']] }
      ],
      note: 'U and V are the face’s own directions (the grid / angle starts at the body you picked). Join / Cut merge every copy into the body that owns the face and remove the original tool body.',
      apply: (v) => ({ src: v.src, face: p.face, kind: v.kind, nu: v.nu, nv: v.nv, du: v.du, dv: v.dv, count: v.count, angle: v.angle, cu: v.cu, cv: v.cv, mode: v.mode })
    };
  };
  async function cmdFacePattern() {
    const sel = st.sel; if (!sel || sel.type !== 'face') return toast('Select the face the pattern lies on first', true);
    const tb = bodyOf(sel.bodyId); const others = st.bodies.filter((x) => x.visible && x.key !== tb.key); if (!others.length) return toast('Make the body to repeat first (for example a boss or a hole cutter as a separate body)', true);
    const f = await P.createViaFUI('w2FPat', 'Pattern on face', { src: others[others.length - 1].key, face: { body: tb.key, ref: F.faceRef(tb.solid, sel.faces[0]) }, kind: 'grid', nu: 3, nv: 2, du: 15, dv: 15, count: 6, angle: 360, cu: 0, cv: 0, mode: 'join' });
    if (f) { f.name = 'Pattern on face (' + (f.params.kind === 'grid' ? f.params.nu + '×' + f.params.nv : f.params.count + ' round') + ')'; P.refreshPanels(); }
  }

  // ================================================================= registration + ribbon
  const I = {
    def: '<path d="M5 20V4 M5 12h3 M5 4h3 M5 20h3"/><path d="M12 5c5 0 7 3 7 7s-2 7-7 7"/>', spl: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14" stroke-dasharray="2 2"/>', wiz: '<circle cx="12" cy="12" r="5"/><path d="M12 3v3 M12 18v3 M3 12h3 M18 12h3"/>',
    pat: '<circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="14" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="18" cy="14" r="2"/>', rf: '<path d="M4 20V8h8a8 8 0 0 1 8 8v4z"/><path d="M4 8l5-4h6"/>'
  };
  [['w2deform', 'Deform (bend · twist · taper)', cmdDeform, 'Bend, twist, taper or flex a solid, surface, curve or SubD cage', I.def], ['w2split', 'Split…', cmdSplit, 'Split a face, a body (by a tool body) or curved faces along the silhouette', I.spl],
    ['w2wiz', 'Boss · dome · lip · groove', () => cmdWizard(), 'Feature wizards placed on the selected face', I.wiz], ['w2fpat', 'Pattern on face', cmdFacePattern, 'Grid or circular pattern of a body on a face — join, cut or new bodies', I.pat], ['w2rfil', 'Rule fillet', cmdRuleFillet, 'Fillet / chamfer edges chosen by a rule, with up to three radii in one pass', I.rf]
  ].forEach(([id, label, fn, title, icon]) => W1.reg({ id, label, group: 'Shape', title, fn, icon }));
  W1.reg({ id: 'w2sface', searchOnly: true, label: 'Split face', group: 'Shape', title: 'Divide the selected face along a line', fn: cmdSplitFace, icon: I.spl });
  W1.reg({ id: 'w2sbody', searchOnly: true, label: 'Split body by tool', group: 'Shape', title: 'Cut a body with another body', fn: cmdSplitBody, icon: I.spl });
  W1.reg({ id: 'w2sil', searchOnly: true, label: 'Silhouette split', group: 'Shape', title: 'Split curved faces along the parting line', fn: cmdSilhouette, icon: I.spl });
  [['boss', 'Boss'], ['dome', 'Dome'], ['dimple', 'Dimple'], ['lip', 'Lip'], ['groove', 'Groove']].forEach(([t, l]) => W1.reg({ id: 'w2w' + t, searchOnly: true, label: l, group: 'Shape', title: l + ' on the selected face', fn: () => cmdWizard(t), icon: I.wiz }));
  // ribbon: ONE small group on the Part+ tab, right after “Shape” (first screen)
  P.addGroup('partx', 'Shape+', [['w2deform', 'Deform', cmdDeform, 'Bend, twist, taper or flex a solid, surface, curve or SubD cage', I.def], ['w2split', 'Split…', cmdSplit, 'Split a face, a body or curved faces along the silhouette', I.spl], ['w2wiz', 'Boss · dome · lip', () => cmdWizard(), 'Feature wizards on the selected face', I.wiz], ['w2fpat', 'Face pattern', cmdFacePattern, 'Grid or circular pattern on a face', I.pat], ['w2rfil', 'Rule fillet', cmdRuleFillet, 'Fillet edges by rule, up to three radii in one pass', I.rf]], 'Shape');
  W1.shapeApi = { makeMap, deformSolid, splitFaces, ruleEdges, convexEdge, insetPoly, cmdDeform, cmdSplit, cmdSplitFace, cmdSplitBody, cmdSilhouette, cmdRuleFillet, cmdWizard, cmdFacePattern, targetOptions };
  if (W1.publishSearch) W1.publishSearch();
  if (G.console) console.info('Aakar Wave 2 · shape loaded (deform, split, rule fillet, wizards, face pattern)');
})(typeof window !== 'undefined' ? window : globalThis);
