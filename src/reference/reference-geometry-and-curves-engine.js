/* ======================================================================
 * Aakar 8.16 · REFERENCE GEOMETRY + CURVES   (part A: resolvers · features · painters)
 *   Features : refPlane · refAxis · refPoint · refCS            (kept in state.refs — usable as sketch planes, mirror planes, pattern axes)
 *              crvComposite · crvIntersect · crvThrough · crvProject · crvSplit · crvOffset   (NURBS curve items — usable by Sweep, Pipe, Loft…)
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, IK = CAD && CAD.ik, F = CAD && CAD.feat, nb = CAD && CAD.nb;
  if (!CAD || !P || !IK || !F || !nb || !P.hooks || typeof AKC === 'undefined') { try { console.warn('Aakar reference geometry: core not ready'); } catch (e) { /* ignore */ } return; }
  const st = P.st, R = P.R, A = AKC, V = A.V, SOL = CAD.solid, S = CAD.solver, FR = CAD.fr, { num, fmt, toast, status } = IK;
  const RG = CAD.ref = { A, specs: {}, cur: null, prev: null, show: true, names: true };
  const REFTYPES = ['refPlane', 'refAxis', 'refPoint', 'refCS'], CRVTYPES = ['crvComposite', 'crvIntersect', 'crvThrough', 'crvProject', 'crvSplit', 'crvOffset'];
  RG.REFTYPES = REFTYPES; RG.CRVTYPES = CRVTYPES;
  CAD.featNames = Object.assign(CAD.featNames || {}, { refPlane: 'Plane', refAxis: 'Axis', refPoint: 'Point', refCS: 'Coord. system', crvComposite: 'Composite curve', crvIntersect: 'Intersection curve', crvThrough: 'Curve through points', crvProject: 'Projected curve', crvSplit: 'Split line', crvOffset: 'Offset curve' });

  // ------------------------------------------------------------------ small helpers
  const bodyOf = (st2, key) => { const b = st2.bodies.get(key); if (!b) throw new Error('A referenced body was not found (deleted, or it comes later in the history)'); return b; };
  function sceneScale(st2) { let d = 0; (st2 && st2.bodies ? [...st2.bodies.values()] : []).forEach((b) => { try { const bb = b.solid.bbox(); d = Math.max(d, V.len(V.sub(bb.max, bb.min))); } catch (e) { /* ignore */ } }); return d > 0 ? d : 100; }
  function adjacency(s) { const adj = s.F.map(() => []); s.edges().forEach((e) => { if (e.faces.length === 2 && e.faces[0] !== e.faces[1]) { adj[e.faces[0]].push({ to: e.faces[1], e }); adj[e.faces[1]].push({ to: e.faces[0], e }); } }); return adj; }
  function faceRegion(s, fi) {
    const g = s.F[fi].group; if (!g) return [fi];
    const adj = adjacency(s), seen = new Set([fi]), q = [fi];
    while (q.length) { const f = q.pop(); adj[f].forEach((a) => { if (!seen.has(a.to) && s.F[a.to].group === g) { seen.add(a.to); q.push(a.to); } }); }
    return [...seen];
  }
  const isFlat = (s, fi) => { const n0 = s.F[fi].n; return faceRegion(s, fi).every((i) => V.dot(s.F[i].n, n0) > 0.9999); };
  const trisOfFaces = (s, fis) => { const out = []; fis.forEach((fi) => SOL.triangulateFace(s, fi).forEach((t) => out.push(t.map((i) => s.V[i])))); return out; };
  function cylOf(s, fi) {
    if (!FR || !FR._groups || !FR._fit) throw new Error('Cylinder detection is not available in this build');
    const g = FR._groups(s, adjacency(s)).find((q) => q.faces.includes(fi)); if (!g) throw new Error('Pick a cylindrical face');
    const r = FR._fit(s, g); if (!r || (r.kind !== 'cylinder' && r.kind !== 'cone')) throw new Error('The picked face is not cylindrical');
    return { o: V.madd(r.base, r.axis, (r.hmin + r.hmax) / 2), d: r.axis.slice(), r: r.r, len: r.hmax - r.hmin, kind: r.kind };
  }
  const closedOf = (pts) => pts.length > 3 && V.dist(pts[0], pts[pts.length - 1]) <= 1e-7 * Math.max(1, A.polyLen(pts, false));
  function nurbsPoly(crv, closed) {
    const pts = crv.p === 1 ? crv.P.map((q) => q.slice()) : nb.sampleC(crv, Math.max(24, Math.min(400, crv.P.length * 12)));
    const cl = closed != null ? !!closed : closedOf(pts); if (cl && V.dist(pts[0], pts[pts.length - 1]) <= 1e-9 * Math.max(1, A.polyLen(pts, false))) pts.pop();
    return { pts, closed: cl };
  }
  function edgePoly(s, le) {
    const ch = A.chainSegs(le.segs.map(([a, c]) => [s.V[a], s.V[c]]), 1e-7 * (s.scale() || 1) + 1e-9).sort((a, b) => b.pts.length - a.pts.length);
    if (!ch.length) throw new Error('The edge has no geometry'); return { pts: ch[0].pts, closed: ch[0].closed };
  }

  // ------------------------------------------------------------------ descriptors  (T): what a feature stores to remember a pick
  //   {k:'std',n:'XY'|'XZ'|'YZ'|'X'|'Y'|'Z'}  {k:'ref',key}  {k:'face',body,ref}  {k:'edge',body,ref,t?}  {k:'vert',body,ref}  {k:'body',body}
  //   {k:'sketch',id}  {k:'curve',key}  {k:'item',key}  {k:'xyz',p}
  function resolveFaceT(st2, T) { const s = bodyOf(st2, T.body).solid, fi = F.resolveFace(s, T.ref); if (fi < 0) throw new Error('A referenced face was not found — pick it again'); return { s, fi, f: s.F[fi] }; }
  function resolveEdgeT(st2, T) { const s = bodyOf(st2, T.body).solid, le = F.resolveEdge(s, T.ref); if (!le) throw new Error('A referenced edge was not found — pick it again'); return { s, le }; }
  const refOf = (st2, key) => { const r = st2.refs && st2.refs.get(key); if (!r) throw new Error('Reference geometry not found (deleted, renamed or after this feature)'); return r; };
  function planeOf(st2, T) {
    if (!T) throw new Error('Choose a plane or a flat face');
    switch (T.k) {
      case 'std': if (T.n.length !== 2) throw new Error(T.n + ' is an axis, not a plane'); return A.stdPlane(T.n, T.off || 0);
      case 'ref': { const r = refOf(st2, T.key); if (r.kind === 'plane') return { o: r.o, n: r.n, u: r.u, v: r.v }; if (r.kind === 'cs') return A.plane(r.o, r.z, r.x); throw new Error(r.name + ' is not a plane'); }
      case 'sketch': { const sk = st2.sketches.get(T.id); if (!sk) throw new Error('A referenced sketch was not found'); return { o: sk.plane.o.slice(), u: sk.plane.u.slice(), v: sk.plane.v.slice(), n: sk.plane.n.slice() }; }
      case 'face': { const { s, fi, f } = resolveFaceT(st2, T); if (!isFlat(s, fi)) throw new Error('The picked face is curved — pick a flat face or a plane'); return A.plane(s.faceCentroid(fi), f.n); }
      default: throw new Error('That selection cannot be used as a plane');
    }
  }
  function axisOf(st2, T) {
    if (!T) throw new Error('Choose an edge or an axis');
    switch (T.k) {
      case 'std': if (T.n.length !== 1) throw new Error(T.n + ' is a plane, not an axis'); return A.stdAxis(T.n);
      case 'ref': { const r = refOf(st2, T.key); if (r.kind === 'axis') return { o: r.o, d: r.d }; if (r.kind === 'plane') return { o: r.o, d: r.n }; if (r.kind === 'cs') return { o: r.o, d: r.z }; throw new Error(r.name + ' is not an axis'); }
      case 'edge': {
        const { s, le } = resolveEdgeT(st2, T), fr = S.edgeFrame(s, le), L = V.len(V.sub(fr.p1, fr.p0)) || 1, d = V.norm(V.sub(fr.p1, fr.p0));
        if (le.segs.some(([a, c]) => [a, c].some((vi) => V.len(V.cross(d, V.sub(s.V[vi], fr.p0))) > 1e-5 * L + 1e-9))) throw new Error('The picked edge is curved — pick a straight edge');
        return { o: fr.p0.slice(), d };
      }
      case 'face': { const { s, fi, f } = resolveFaceT(st2, T); if (isFlat(s, fi)) return { o: s.faceCentroid(fi), d: f.n.slice() }; const c = cylOf(s, fi); return { o: c.o, d: c.d }; }
      default: throw new Error('That selection cannot be used as an axis');
    }
  }
  function pointOf(st2, T) {
    if (!T) throw new Error('Choose a point');
    switch (T.k) {
      case 'xyz': return T.p.map(Number);
      case 'std': return [0, 0, 0];
      case 'ref': { const r = refOf(st2, T.key); return (r.kind === 'point' ? r.p : r.o).slice(); }
      case 'vert': { const s = bodyOf(st2, T.body).solid, vi = F.resolveVertex(s, T.ref); if (vi < 0) throw new Error('A referenced vertex was not found — pick it again'); return s.V[vi].slice(); }
      case 'edge': { const { s, le } = resolveEdgeT(st2, T), fr = S.edgeFrame(s, le); return V.lerp(fr.p0, fr.p1, T.t == null ? 0.5 : T.t); }
      case 'face': { const { s, fi } = resolveFaceT(st2, T); return s.faceCentroid(fi); }
      default: throw new Error('That selection cannot be used as a point');
    }
  }
  /** a direction: a plane normal, an axis, or an edge */
  function dirOf(st2, T) {
    if (!T) throw new Error('Choose a direction');
    if (T.k === 'std') return T.n.length === 2 ? A.stdPlane(T.n).n : A.stdAxis(T.n).d;
    if (T.k === 'ref') { const r = refOf(st2, T.key); return r.kind === 'axis' ? r.d.slice() : r.kind === 'plane' ? r.n.slice() : r.kind === 'cs' ? r.z.slice() : (() => { throw new Error(r.name + ' has no direction'); })(); }
    if (T.k === 'face') { const { s, fi, f } = resolveFaceT(st2, T); return isFlat(s, fi) ? f.n.slice() : cylOf(s, fi).d; }
    if (T.k === 'edge') return axisOf(st2, T).d;
    throw new Error('That selection has no direction');
  }
  function polysOf(st2, T, h) {
    if (!T) throw new Error('Choose a curve, an edge or a sketch');
    if (T.k === 'edge') { const { s, le } = resolveEdgeT(st2, T); return [edgePoly(s, le)]; }
    if (T.k === 'curve') { const it = st2.items.get(T.key); if (!it || it.kind !== 'curve') throw new Error('A referenced curve was not found (deleted, or it comes later in the history)'); return [nurbsPoly(it.crv, it.closed)]; }
    if (T.k === 'sketch') { if (!st2.sketches.get(T.id)) throw new Error('A referenced sketch was not found'); return nb.curvesOf(h, st2, 's:' + T.id, false).map((c) => nurbsPoly(c)); }
    throw new Error('That selection is not a curve');
  }
  /** a surface for intersections / projections: {plane} (infinite) or {tris} (finite) */
  function surfOf(st2, T, h) {
    if (!T) throw new Error('Choose a face, a body, a surface or a plane');
    switch (T.k) {
      case 'std': case 'ref': case 'sketch': return { plane: planeOf(st2, T) };
      case 'face': { const { s, fi } = resolveFaceT(st2, T); return { tris: trisOfFaces(s, faceRegion(s, fi)) }; }
      case 'body': { const s = bodyOf(st2, T.body).solid; return { tris: trisOfFaces(s, s.F.map((_, i) => i)) }; }
      case 'item': { const it = st2.items.get(T.key); if (!it) throw new Error('A referenced surface was not found'); const m = nb.meshOfItem(it, 10); if (!m) throw new Error('That item has no surface'); return { tris: m.T.map((t) => t.map((i) => m.P[i])) }; }
      default: throw new Error('That selection cannot be used as a surface');
    }
  }
  const unit = (v, what) => { const d = V.norm(v); if (V.len(d) < 0.5) throw new Error((what || 'The direction') + ' is zero'); return d; };
  const asVec = (p) => [num(p.vx, 0), num(p.vy, 0), num(p.vz, 1)];
  RG.resolvers = { planeOf, axisOf, pointOf, dirOf, polysOf, surfOf, cylOf, faceRegion, isFlat, trisOfFaces, edgePoly };

  // ------------------------------------------------------------------ reference geometry maths
  function computeRef(type, p, st2, h) {
    const s = p.s || {}, m = p.mode;
    if (type === 'refPlane') {
      let pl;
      if (m === 'offset') pl = A.planeOffset(planeOf(st2, s.base), num(p.dist, 0) * (p.flip ? -1 : 1));
      else if (m === 'angle') pl = A.planeAngle(planeOf(st2, s.base), axisOf(st2, s.axis), num(p.angle, 0));
      else if (m === 'three') pl = A.planeThrough3(pointOf(st2, s.p1), pointOf(st2, s.p2), pointOf(st2, s.p3));
      else if (m === 'mid') pl = A.planeMid(planeOf(st2, s.a), planeOf(st2, s.b), !!p.flip);
      else if (m === 'pointNormal') pl = A.planePointNormal(pointOf(st2, s.pt), dirOf(st2, s.dir));
      else if (m === 'parallelAt') pl = A.planeParallelAt(pointOf(st2, s.pt), planeOf(st2, s.base));
      else if (m === 'tangent') {
        const T = s.cyl; if (!T || T.k !== 'face') throw new Error('Pick a cylindrical face'); const { s: sol, fi } = resolveFaceT(st2, T), c = cylOf(sol, fi);
        if (c.kind !== 'cylinder') throw new Error('A tangent plane needs a cylindrical (not conical) face'); pl = A.planeTangentCyl(c, s.ref ? planeOf(st2, s.ref) : null, num(p.angle, 0), !!p.flip);
      } else if (m === 'curveNormal') { const poly = polysOf(st2, s.curve, h)[0], at = A.polyAt(poly.pts, num(p.t, 0.5)); pl = A.plane(at.p, at.t); }
      else throw new Error('Unknown plane mode');
      return Object.assign({ kind: 'plane', size: p.size > 0 ? +p.size : 0 }, pl);
    }
    if (type === 'refAxis') {
      let ax;
      if (m === 'twoPoints') ax = A.axis2(pointOf(st2, s.p1), pointOf(st2, s.p2));
      else if (m === 'edge') ax = axisOf(st2, s.edge);
      else if (m === 'cylinder') { const T = s.face; if (!T || T.k !== 'face') throw new Error('Pick a cylindrical face'); const { s: sol, fi } = resolveFaceT(st2, T), c = cylOf(sol, fi); ax = { o: c.o, d: c.d }; }
      else if (m === 'planes') ax = A.axisFromPlanes(planeOf(st2, s.a), planeOf(st2, s.b));
      else if (m === 'pointNormal') ax = A.axisPointNormal(pointOf(st2, s.pt), planeOf(st2, s.base));
      else throw new Error('Unknown axis mode');
      return { kind: 'axis', o: ax.o, d: V.norm(ax.d), size: p.size > 0 ? +p.size : 0 };
    }
    if (type === 'refPoint') {
      let pt;
      if (m === 'xyz') pt = [num(p.x, 0), num(p.y, 0), num(p.z, 0)];
      else if (m === 'vertex') pt = pointOf(st2, s.pt);
      else if (m === 'onEdge') { const { s: sol, le } = resolveEdgeT(st2, s.edge), fr = S.edgeFrame(sol, le); pt = V.lerp(fr.p0, fr.p1, Math.max(0, Math.min(1, num(p.t, 0.5)))); }
      else if (m === 'faceCenter') pt = pointOf(st2, s.face);
      else if (m === 'cylCenter') { const T = s.face; if (!T || T.k !== 'face') throw new Error('Pick a cylindrical face'); const { s: sol, fi } = resolveFaceT(st2, T), c = cylOf(sol, fi); pt = V.madd(c.o, c.d, (Math.max(0, Math.min(1, num(p.t, 0.5))) - 0.5) * c.len); }
      else if (m === 'project') pt = A.projectPointOnPlane(pointOf(st2, s.pt), planeOf(st2, s.base));
      else if (m === 'axisPlane') pt = A.axisPlanePoint(axisOf(st2, s.axis), planeOf(st2, s.base));
      else if (m === 'onCurve') pt = A.polyAt(polysOf(st2, s.curve, h)[0].pts, num(p.t, 0.5)).p;
      else if (m === 'midpoint') pt = V.lerp(pointOf(st2, s.p1), pointOf(st2, s.p2), 0.5);
      else throw new Error('Unknown point mode');
      return { kind: 'point', p: pt };
    }
    if (type === 'refCS') {
      let o, z = null, x = null;
      if (m === 'threePoints') { o = pointOf(st2, s.o); const px = pointOf(st2, s.px), py = pointOf(st2, s.py); x = V.sub(px, o); z = V.cross(x, V.sub(py, o)); if (V.len(z) < 1e-9 * Math.max(1, V.len(x))) throw new Error('The three points are collinear'); }
      else { o = pointOf(st2, s.o); if (s.z) z = dirOf(st2, s.z); if (s.x) x = dirOf(st2, s.x); }
      o = V.add(o, [num(p.dx, 0), num(p.dy, 0), num(p.dz, 0)]);
      const fr = A.csFrame(o, z, x, !!p.flipZ, !!p.flipX, num(p.rot, 0)); return Object.assign({ kind: 'cs', size: p.size > 0 ? +p.size : 0 }, fr);
    }
    throw new Error('Unknown reference type');
  }
  RG.computeRef = computeRef;

  // ------------------------------------------------------------------ curve maths  (returns [{pts, closed}])
  /** subdivide every segment so no piece is longer than length/n — the original vertices (corners) are kept */
  function densify(polys, n) {
    return polys.map((c) => {
      const Q = c.closed ? c.pts.concat([c.pts[0]]) : c.pts, L = A.polyLen(Q, false), seg = L / n, out = [];
      for (let i = 0; i + 1 < Q.length; i++) { const l = V.dist(Q[i], Q[i + 1]), k = Math.max(1, Math.ceil(l / seg)); for (let j = 0; j < k; j++) out.push(V.lerp(Q[i], Q[i + 1], j / k)); }
      if (!c.closed) out.push(Q[Q.length - 1].slice()); return { pts: out, closed: c.closed };
    });
  }
  function groupRuns(runs, closed, total) { return runs.map((r) => ({ pts: r, closed: !!closed && runs.length === 1 && r.length === total })); }
  function projectPolys(polys, target, dirFn, both) {
    const out = [];
    polys.forEach((c) => {
      let runs;
      if (target.plane) {
        runs = []; let cur = [];
        c.pts.forEach((q, i) => { const d = dirFn(q, i), den = V.dot(d, target.plane.n); if (Math.abs(den) < 1e-9) { if (cur.length) runs.push(cur); cur = []; return; } const t = V.dot(V.sub(target.plane.o, q), target.plane.n) / den; if (!both && t < -1e-9) { if (cur.length) runs.push(cur); cur = []; return; } cur.push(V.madd(q, d, t)); });
        if (cur.length) runs.push(cur); runs = runs.filter((r) => r.length >= 2);
      } else runs = A.projectOnMesh(c.pts, target.tris, dirFn, { both });
      out.push(...groupRuns(runs, c.closed, c.pts.length));
    });
    return out;
  }
  function sketchNormal(st2, T) { if (T && T.k === 'sketch') { const sk = st2.sketches.get(T.id); if (sk) return sk.plane.n.slice(); } return null; }
  function computeCurves(type, p, st2, h) {
    const s = p.s || {}, sc = sceneScale(st2); let out = [];
    if (type === 'crvComposite') {
      const lines = []; (s.srcs || []).forEach((T) => polysOf(st2, T, h).forEach((c) => lines.push(c.closed ? c.pts.concat([c.pts[0]]) : c.pts)));
      if (!lines.length) throw new Error('Pick the curves, edges or sketches to join');
      out = A.joinPolylines(lines, Math.max(1e-9, num(p.tol, 0.02)));
    } else if (type === 'crvIntersect') {
      const a = surfOf(st2, s.a, h), b = surfOf(st2, s.b, h), eps = sc * 1e-7; let segs;
      if (a.plane && b.plane) throw new Error('Two planes intersect in a line — use Axis ▸ Intersection of two planes, or pick a face, body or surface for one side');
      else if (a.plane) segs = A.trisPlaneSegs(b.tris, a.plane, eps); else if (b.plane) segs = A.trisPlaneSegs(a.tris, b.plane, eps); else segs = A.meshMeshSegs(a.tris, b.tris, eps);
      if (!segs.length) throw new Error('The two selections do not intersect');
      out = A.chainSegs(segs, sc * 1e-6); if (p.simplify !== false) out = out.map((c) => ({ pts: A.simplify(c.closed ? c.pts.concat([c.pts[0]]) : c.pts, sc * 2e-4).slice(0, c.closed ? -1 : undefined), closed: c.closed })).filter((c) => c.pts.length >= 2);
    } else if (type === 'crvThrough') {
      const pts = (s.pts || []).map((T) => pointOf(st2, T)); if (pts.length < 2) throw new Error('Pick at least two points');
      out = [{ pts, closed: !!p.closed && pts.length >= 3 }];
    } else if (type === 'crvProject' || type === 'crvSplit') {
      const src = densify(polysOf(st2, s.src, h), Math.max(20, Math.min(600, num(p.res, 240)))), both = p.both !== false; let target, dirFn;
      if (type === 'crvSplit') { const faces = (s.faces || []); if (!faces.length) throw new Error('Pick the face(s) the curve is projected onto'); let tris = []; faces.forEach((T) => { const f = resolveFaceT(st2, T); tris = tris.concat(trisOfFaces(f.s, faceRegion(f.s, f.fi))); }); target = { tris }; }
      else if (p.mode === 'crossing') {
        const tg = polysOf(st2, s.target, h), nB = sketchNormal(st2, s.target); if (!nB) throw new Error('"Sketch on sketch" needs the target to be a sketch');
        let tris = []; tg.forEach((c) => { tris = tris.concat(A.extrusionTris(c.pts, c.closed, nB, sc * 10 + 1e3)); }); target = { tris };
      } else target = surfOf(st2, s.target, h);
      const mode = p.dir || 'sketch'; let d;
      if (mode === 'vec') d = unit(asVec(p), 'The projection direction');
      else if (mode === 'normal') {
        const T0 = type === 'crvSplit' ? (s.faces || [])[0] : s.target;
        if (target.plane) d = target.plane.n.slice();
        else if (T0 && T0.k === 'face') { const fr = resolveFaceT(st2, T0); if (!isFlat(fr.s, fr.fi)) throw new Error('"Normal to the target" needs a flat face — choose another direction'); d = fr.f.n.slice(); }
        else throw new Error('"Normal to the target" needs a flat face or a plane');
      }
      else { d = sketchNormal(st2, s.src); if (!d) { const nn = A.polyNormal(src[0].pts); d = nn || [0, 0, -1]; } }
      out = projectPolys(src, target, () => d, both);
      if (!out.length) throw new Error('Nothing was projected — the curve does not reach the target along that direction (try “both ways” or another direction)');
    } else if (type === 'crvOffset') {
      const src = polysOf(st2, s.src, h); const dist = num(p.dist, 1) * (p.flip ? -1 : 1);
      if (p.mode === 'vector') { const d = unit(asVec(p), 'The offset direction'); out = src.map((c) => ({ pts: c.pts.map((q) => V.madd(q, d, dist)), closed: c.closed })); }
      else out = src.map((c) => { const n = s.plane ? planeOf(st2, s.plane).n : A.polyNormal(c.pts.length >= 3 ? c.pts : A.resample(c.pts, 8)); if (!n) throw new Error('The curve is straight — pick a plane to offset it in'); return { pts: A.offsetPolyline(c.pts, c.closed, dist, n), closed: c.closed }; });
    } else throw new Error('Unknown curve type');
    out = out.filter((c) => c.pts.length >= 2);
    if (!out.length) throw new Error('The operation produced no curve');
    return out;
  }
  RG.computeCurves = computeCurves;
  function putPolys(st2, f, polys, smooth) {
    const S3 = CAD.sk3; if (!S3 || !S3.curveOf || !S3.polylineCurve) throw new Error('The curve engine is not available in this build');
    polys.forEach((c, i) => {
      const key = polys.length > 1 ? f.id + '.' + (i + 1) : f.id; let crv, poly = null;
      if (smooth && c.pts.length >= 3) crv = S3.curveOf({ pts: A.resample(c.pts, Math.min(c.pts.length, 160), c.closed), closed: c.closed, mode: 'spline' });
      else { crv = S3.polylineCurve(c.pts, c.closed); poly = c.pts.map((q) => q.slice()); }
      nb.putCurve(st2, key, f.name + (polys.length > 1 ? ' ' + (i + 1) : ''), crv, f.id, { closed: !!c.closed, poly, rgType: f.type });
    });
  }

  // ------------------------------------------------------------------ feature handlers
  REFTYPES.forEach((type) => {
    CAD.featExt[type] = function (f, st2, h) {
      st2.refs = st2.refs || new Map(); const g = computeRef(type, f.params, st2, h);
      st2.refs.set(f.id, Object.assign({ key: f.id, name: f.name, src: f.id, hide: !!f.params.hide }, g)); return st2;
    };
  });
  CRVTYPES.forEach((type) => { CAD.featExt[type] = function (f, st2, h) { putPolys(st2, f, computeCurves(type, f.params, st2, h), !!f.params.smooth); return st2; }; });

  // ------------------------------------------------------------------ viewport painters
  let scaleNow = 100; const lblLayer = document.createElement('div'); lblLayer.id = 'rgLbl'; IK.vp.appendChild(lblLayer);
  P.hooks.afterRegen.push(() => { try { scaleNow = sceneScale(st.state); } catch (e) { scaleNow = 100; } relabel(); });
  const COL = { plane: [0.36, 0.66, 1], axis: [1, 0.72, 0.25], point: [0.95, 0.5, 1], cs: [0.5, 0.95, 0.6], sel: [1, 0.55, 0.15], prev: [1, 0.9, 0.3] };
  const halfOf = (r) => (r.size > 0 ? r.size / 2 : Math.max(25, scaleNow * 0.7));
  function planeQuad(r) { const hs = halfOf(r), c = r.o, u = V.mul(r.u, hs), v = V.mul(r.v, hs); return [V.sub(V.sub(c, u), v), V.sub(V.add(c, u), v), V.add(V.add(c, u), v), V.add(V.sub(c, u), v)]; }
  function paintRef(r, col, fillA, L, T, Pt, h) {
    if (r.kind === 'plane') {
      const q = planeQuad(r), hs = halfOf(r);
      [[0, 1, 2], [0, 2, 3]].forEach((t) => t.forEach((i) => h.pushL(T, q[i], col, fillA)));
      for (let i = 0; i < 4; i++) { h.pushL(L, q[i], col, 0.95); h.pushL(L, q[(i + 1) % 4], col, 0.95); }
      for (let k = 1; k < 4; k++) { const t = k / 4; h.pushL(L, V.lerp(q[0], q[1], t), col, 0.28); h.pushL(L, V.lerp(q[3], q[2], t), col, 0.28); h.pushL(L, V.lerp(q[0], q[3], t), col, 0.28); h.pushL(L, V.lerp(q[1], q[2], t), col, 0.28); }
      const tip = V.madd(r.o, r.n, hs * 0.22); h.pushL(L, r.o, col, 1); h.pushL(L, tip, col, 1); h.pushL(Pt, r.o, col, 1);
    } else if (r.kind === 'axis') {
      const hs = halfOf(r) * 1.15, a = V.madd(r.o, r.d, -hs), b = V.madd(r.o, r.d, hs), { u, v } = A.basisOf(r.d), ah = hs * 0.06;
      h.pushL(L, a, col, 1); h.pushL(L, b, col, 1);
      [u, v, V.mul(u, -1), V.mul(v, -1)].forEach((w) => { h.pushL(L, b, col, 1); h.pushL(L, V.add(V.madd(b, r.d, -ah * 2.2), V.mul(w, ah)), col, 1); });
      h.pushL(Pt, r.o, col, 1);
    } else if (r.kind === 'point') {
      const k = Math.max(2, scaleNow * 0.012), p = r.p;
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((d) => { h.pushL(L, V.madd(p, d, -k), col, 1); h.pushL(L, V.madd(p, d, k), col, 1); }); h.pushL(Pt, p, col, 1);
    } else if (r.kind === 'cs') {
      const len = halfOf(r) * 0.55, axes = [[r.x, [1, 0.33, 0.36]], [r.y, [0.4, 0.86, 0.45]], [r.z, [0.3, 0.6, 1]]];
      axes.forEach(([d, c]) => { const b = V.madd(r.o, d, len), { u, v } = A.basisOf(d); h.pushL(L, r.o, c, 1); h.pushL(L, b, c, 1); [u, v, V.mul(u, -1), V.mul(v, -1)].forEach((w) => { h.pushL(L, b, c, 1); h.pushL(L, V.add(V.madd(b, d, -len * 0.14), V.mul(w, len * 0.05)), c, 1); }); });
      h.pushL(Pt, r.o, col, 1);
    }
  }
  const refList = () => (st.state && st.state.refs ? [...st.state.refs.values()] : []);
  function hiddenByTimeline(r) { const f = st.doc && st.doc.features.find((x) => x.id === r.key); return !f || f.suppressed; }
  P.hooks.draw.push((M, h) => {
    if (st.sketching) return;
    const L = [], T = [], Pt = [], LO = [];
    if (RG.show) refList().forEach((r) => { if (r.hide || hiddenByTimeline(r)) return; const sel = st.refSel === r.key || st.selFeature === r.key; paintRef(r, sel ? COL.sel : COL[r.kind] || COL.plane, sel ? 0.22 : 0.10, L, T, Pt, h); });
    const pv = RG.prev;
    if (pv) {
      if (pv.ref) paintRef(pv.ref, COL.prev, 0.18, L, T, Pt, h);
      if (pv.polys) pv.polys.forEach((c) => { const pts = c.closed ? c.pts.concat([c.pts[0]]) : c.pts; for (let i = 0; i + 1 < pts.length; i++) { h.pushL(LO, pts[i], COL.prev, 1); h.pushL(LO, pts[i + 1], COL.prev, 1); } c.pts.forEach((q) => { if (c.pts.length < 60) h.pushL(Pt, q, COL.prev, 1); }); });
      if (pv.marks) pv.marks.forEach((q) => h.pushL(Pt, q, COL.prev, 1));
    }
    const hv = RG.hov;
    if (hv) {
      (hv.lines || []).forEach((pts) => { for (let i = 0; i + 1 < pts.length; i++) { h.pushL(L, pts[i], COL.sel, 1); h.pushL(L, pts[i + 1], COL.sel, 1); } });
      (hv.pts || []).forEach((q) => h.pushL(Pt, q, COL.sel, 1));
      if (hv.refKey) { const r = refList().find((q) => q.key === hv.refKey); if (r) paintRef(r, COL.sel, 0.26, L, T, Pt, h); }
    }
    if (T.length) R.overlayTris(new Float32Array(T), { depth: true });
    if (L.length) R.lines(new Float32Array(L), { overlay: false });
    if (LO.length) R.lines(new Float32Array(LO), { overlay: true });
    if (Pt.length) R.points(new Float32Array(Pt), 6, { overlay: true });
    placeLabels(M);
  });
  // names next to the planes / axes / points
  let lbls = [];
  function relabel() {
    lblLayer.innerHTML = ''; lbls = [];
    refList().forEach((r) => { if (r.hide) return; const d = document.createElement('div'); d.textContent = r.name; d.dataset.k = r.key; lblLayer.appendChild(d); lbls.push({ el: d, r }); });
  }
  function labelAnchor(r) {
    if (r.kind === 'plane') return planeQuad(r)[2]; if (r.kind === 'axis') return V.madd(r.o, r.d, halfOf(r) * 1.15);
    if (r.kind === 'point') return r.p; return V.madd(r.o, r.z, halfOf(r) * 0.55);
  }
  function placeLabels(M) {
    const show = RG.show && RG.names && !st.sketching; lblLayer.style.display = show ? '' : 'none'; if (!show) return;
    const cv = IK.cv, w = cv.clientWidth, hh = cv.clientHeight;
    lbls.forEach(({ el, r }) => { const q = R.project(labelAnchor(r), M); if (!q || q[3] <= 0 || q[0] < -40 || q[1] < -40 || q[0] > w + 40 || q[1] > hh + 40 || r.hide || hiddenByTimeline(r)) { el.style.display = 'none'; return; } el.style.display = ''; el.style.transform = 'translate(' + (q[0] + 6).toFixed(1) + 'px,' + (q[1] - 18).toFixed(1) + 'px)'; el.classList.toggle('sel', st.refSel === r.key); });
  }
  RG.relabel = relabel;
  RG.list = () => refList();
  RG.sceneScale = () => scaleNow;
  RG.sketchOn = (key) => { key = key || st.refSel || st.selFeature; const r = st.state && st.state.refs.get(key); if (!r || r.kind !== 'plane') return toast('Pick a reference plane first', true); P.openSketcher(null, { kind: 'ref', ref: key, offset: 0 }); };
  RG.planeOptions = (stt) => { const L = []; if (stt && stt.refs) stt.refs.forEach((r) => { if (r.kind === 'plane') L.push(['ref:' + r.key, '▱ ' + r.name]); }); return L; };
  RG.axisOptions = (stt) => { const L = []; if (stt && stt.refs) stt.refs.forEach((r) => { if (r.kind === 'axis') L.push([r.key, '⟋ ' + r.name]); }); return L; };

  // ------------------------------------------------------------------ AakarKernel 1.1: expose the construction maths on the kernel
  try {
    const AK = G.AakarKernel;
    if (AK) {
      AK.construct = A; if (AK.kernel) AK.kernel.construct = A;
      AK.version = '1.1.0'; if (AK.kernel) AK.kernel.version = '1.1.0';
      A.selfTest = function () {
        const T = [], t = (n, c) => T.push({ name: n, ok: !!c }), near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9), nv = (a, b) => V.dist(a, b) <= 1e-9;
        t('plane offset', nv(A.planeOffset(A.stdPlane('XY'), 7).o, [0, 0, 7]));
        t('plane through 3 points', nv(A.planeThrough3([0, 0, 0], [1, 0, 0], [0, 1, 0]).n, [0, 0, 1]));
        t('plane ∩ plane = Z axis', near(Math.abs(A.planeIntersect(A.stdPlane('XZ'), A.stdPlane('YZ')).d[2]), 1));
        t('mid-plane of two parallel planes', near(A.planeMid(A.plane([0, 0, 0], [0, 0, 1]), A.plane([0, 0, 10], [0, 0, -1])).o[2], 5));
        t('tangent plane to a cylinder', nv(A.planeTangentCyl({ o: [0, 0, 0], d: [0, 0, 1], r: 5 }, A.stdPlane('YZ'), 0, false).o, [5, 0, 0]));
        t('axis ∩ plane', nv(A.axisPlanePoint({ o: [0, 0, 0], d: [0, 0, 1] }, A.plane([0, 0, 7], [0, 0, 1])), [0, 0, 7]));
        const cs = A.csFrame([0, 0, 0], [0, 0, 1], null, false, false, 0); t('coordinate system is orthonormal', near(V.dot(cs.x, cs.y), 0) && near(V.len(cs.z), 1));
        const box = (a, b) => { const P8 = [[a, a, a], [b, a, a], [b, b, a], [a, b, a], [a, a, b], [b, a, b], [b, b, b], [a, b, b]], Q = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; return Q.map((q) => q.map((i) => P8[i])); };
        const sec = A.chainSegs(A.trisPlaneSegs(box(0, 10), A.plane([0, 0, 5], [0, 0, 1]), 1e-7), 1e-6); t('plane section of a box is one closed loop', sec.length === 1 && sec[0].closed);
        t('mesh ∩ mesh finds the curve', A.meshMeshSegs(box(0, 10), box(5, 15), 1e-7).length >= 8);
        return T;
      };
    }
  } catch (e) { /* kernel not present */ }

  // style for the labels
  const css = document.createElement('style'); css.id = 'rg-css';
  css.textContent = '#rgLbl{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:11}#rgLbl div{position:absolute;left:0;top:0;font:600 10.5px "Segoe UI",system-ui,sans-serif;color:#cfe3ff;background:rgba(18,26,40,.78);border:1px solid rgba(110,160,230,.45);border-radius:4px;padding:1px 6px;white-space:nowrap;will-change:transform}#rgLbl div.sel{color:#1a1208;background:#ffb26b;border-color:#ff8a3d}';
  document.head.appendChild(css);
  RG.toast = toast; RG.fmt = fmt; RG.sceneOf = sceneScale;
})(typeof window !== 'undefined' ? window : globalThis);
