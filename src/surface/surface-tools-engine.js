/* ======================================================================
 * Aakar 8.17 · SURFACE TOOLS
 *   srfPlanar   planar surface from closed curves / edges / sketches (holes by nesting)
 *   srfTrimSrf  trim a surface with another surface, plane or face (one-way or mutual, optional extend-to-meet)
 *   srfMid      mid-surface between two faces / surfaces (any position 0 - 1)
 *   srfRadiate  radiate a surface outward from curves or edges (in a plane, along a direction, or from an axis; draft angle)
 *   srfKnit     knit surfaces (trimmed ones too) into a shell / solid with T-junction repair and an open-edge report
 * Part A: engine + features (they plug into the Reference-geometry panel system: CAD.ref.specs / CAD.ref.X)
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, IK = CAD && CAD.ik, F = CAD && CAD.feat, RG = CAD && CAD.ref, nb = CAD && CAD.nb;
  if (!RG || !RG.A || !RG.resolvers || !RG.specs || !nb || !CAD.x5 || !P || !IK) return;
  const A = RG.A, V = A.V, RS = RG.resolvers, X5 = CAD.x5, SOL = CAD.solid, st = P.st;
  const num = (x, d) => (x === undefined || x === null || x === '' || !isFinite(+x) ? d : +x);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const D = V.dist, dot = V.dot, sub = V.sub, madd = V.madd, nrm = V.norm, len = V.len, cross = V.cross, lerp = V.lerp;
  RG.X = RG.X || {};

  // ------------------------------------------------------------------ small helpers
  const cloneSt = (b) => Object.assign({}, b, { bodies: new Map(b.bodies || []), sketches: new Map(b.sketches || []), items: new Map(b.items || []), refs: new Map(b.refs || []) });
  const diag = (pts) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; pts.forEach((p) => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }); return pts.length ? D(mn, mx) : 1; };
  const sceneOf = (st2) => { let d = 0; (st2 && st2.bodies ? [...st2.bodies.values()] : []).forEach((b) => { try { const bb = b.solid.bbox(); d = Math.max(d, D(bb.min, bb.max)); } catch (e) { /* ignore */ } }); (st2 && st2.items ? [...st2.items.values()] : []).forEach((it) => { try { if (it.kind === 'surface') { const m = nb.meshOfItem(it, 4); if (m && m.P.length) d = Math.max(d, diag(m.P)); } } catch (e) { /* ignore */ } }); return d > 0 ? d : 100; };
  const closeless = (pts) => (pts.length > 2 && D(pts[0], pts[pts.length - 1]) < 1e-9 ? pts.slice(0, -1) : pts);
  const itemOf = (st2, T, what, kinds) => {
    if (!T || T.k !== 'item') throw new Error(what + ': pick a NURBS surface');
    const it = st2.items.get(T.key); if (!it) throw new Error(what + ' was not found (deleted, or it comes later in the history)');
    if (kinds && kinds.indexOf(it.kind) < 0) throw new Error(what + ' must be ' + (kinds[0] === 'surface' ? 'a NURBS surface' : kinds.join(' / ')));
    return it;
  };
  const trisOfItem = (it, dens) => { const m = nb.meshOfItem(it, dens || 12); if (!m) throw new Error('That item has no surface'); return m.T.map((t) => t.map((i) => m.P[i])); };
  const resolveFaceT = (st2, T) => { const b = st2.bodies.get(T.body); if (!b) throw new Error('A referenced body was not found — pick the face again'); const s = b.solid, fi = F.resolveFace(s, T.ref); if (fi < 0) throw new Error('A referenced face was not found — pick it again'); return { s, fi, f: s.F[fi] }; };
  const putSrf = (st2, key, name, srf, src) => st2.items.set(key, { key, name, kind: 'surface', srf, src });
  const pathLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += D(pts[i], pts[i - 1]); return s; };

  /** degree-1 bilinear NURBS patch, u along x, v along y of the frame */
  function bilinearPatch(o, u, v, x0, x1, y0, y1) {
    const c = (x, y) => V.add(V.add(o, V.mul(u, x)), V.mul(v, y));
    return { p: 1, q: 1, U: [0, 0, 1, 1], V: [0, 0, 1, 1], P: [[c(x0, y0), c(x0, y1)], [c(x1, y0), c(x1, y1)]], W: [[1, 1], [1, 1]] };
  }
  /** degree-1 x degree-1 surface through rows of points: rows[j] is a polyline (j = v index) */
  function rowsSurface(rows) {
    const n = rows[0].length, d = [0]; for (let i = 1; i < n; i++) d.push(d[i - 1] + D(rows[0][i], rows[0][i - 1]));
    const L = d[n - 1] || 1, nr = rows.length, Vk = nr === 2 ? [0, 0, 1, 1] : [0].concat(rows.map((_, j) => j / (nr - 1)), [1]);
    return { p: 1, q: 1, U: [0].concat(d.map((x) => x / L), [1]), V: Vk, P: rows[0].map((_, i) => rows.map((r) => r[i].slice())), W: rows[0].map(() => rows.map(() => 1)) };
  }

  // ================================================================== 1 · PLANAR SURFACE
  /** loops: [{pts, closed}] (3D). Returns {srf, outline} */
  function planarFromLoops(loops, tolIn, flip, scale) {
    const L = loops.filter((c) => c.closed && c.pts.length >= 3).map((c) => ({ pts: closeless(c.pts), closed: true }));
    if (!L.length) throw new Error('The boundary is not closed — pick a closed sketch, or every edge / curve of the outline so that they join end to end');
    const big = L.reduce((a, b) => (Math.abs(polyArea3(b.pts)) > Math.abs(polyArea3(a.pts)) ? b : a));
    let n = A.polyNormal(big.pts); if (!n) throw new Error('The boundary is a straight line — it does not enclose an area');
    const all = [].concat(...L.map((c) => c.pts)), o = all.reduce((a, p) => V.add(a, p), [0, 0, 0]).map((x) => x / all.length);
    const tol = Math.max(num(tolIn, 0.01), scale * 1e-6); let dev = 0; all.forEach((p) => { dev = Math.max(dev, Math.abs(dot(sub(p, o), n))); });
    if (dev > tol) throw new Error('The boundary is not flat (it deviates ' + dev.toFixed(3) + ' mm from a plane; tolerance ' + tol.toFixed(3) + ' mm) — use a closed curve in one plane, or raise the tolerance');
    if (flip) n = V.mul(n, -1);
    const B = A.basisOf(n), u = B.u, v = B.v, xy = (p) => [dot(sub(p, o), u), dot(sub(p, o), v)];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; all.forEach((p) => { const q = xy(p); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    const pad = 0.06 * Math.max(x1 - x0, y1 - y0, scale * 1e-3); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const srf = bilinearPatch(o, u, v, x0, x1, y0, y1), uv = L.map((c) => c.pts.map((p) => { const q = xy(p); return [(q[0] - x0) / (x1 - x0), (q[1] - y0) / (y1 - y0)]; }));
    srf.trim = { ops: [{ keep: 'inside', regions: nb.groupRegions(uv) }] };
    return { srf, outline: L.map((c) => ({ pts: c.pts, closed: true })), n };
  }
  function polyArea3(pts) { const n = A.polyNormal(pts); if (!n) return 0; let s = [0, 0, 0]; for (let i = 0; i < pts.length; i++) s = V.add(s, cross(pts[i], pts[(i + 1) % pts.length])); return dot(s, n) / 2; }
  function loopsOf(st2, h, Ts, tol, scale) {
    const lines = []; (Ts || []).forEach((T) => RS.polysOf(st2, T, h).forEach((c) => lines.push(c.closed ? c.pts.concat([c.pts[0]]) : c.pts)));
    if (!lines.length) throw new Error('Pick the closed sketch, curves or edges that form the boundary');
    const ch = A.joinPolylines(lines, Math.max(1e-9, tol, scale * 1e-6));
    return ch;
  }
  function runPlanar(p, st2, h, f) {
    const s = p.s || {}, scale = sceneOf(st2), ch = loopsOf(st2, h, s.loops, num(p.tol, 0.01), scale), r = planarFromLoops(ch, p.tol, !!p.flip, scale);
    putSrf(st2, f.id, f.name, r.srf, f.id);
    const open = ch.filter((c) => !c.closed).length;
    return { polys: r.outline, msg: 'Planar surface · ' + r.outline.length + ' loop' + (r.outline.length > 1 ? 's' : '') + (r.outline.length > 1 ? ' (inner loops become holes)' : '') + (open ? ' · ' + open + ' open chain(s) ignored' : '') };
  }

  // ================================================================== 2 · TRIM SURFACE BY SURFACE
  /** the "tool" side: a plane, a NURBS surface or a triangle mesh, with a signed distance and a projection */
  function toolOf(st2, T, h) {
    if (!T) throw new Error('Pick the trimming tool (a surface, plane or face)');
    if (T.k === 'std' || T.k === 'ref' || T.k === 'sketch') { const pl = RS.planeOf(st2, T); return { kind: 'plane', plane: pl, sd: (q) => dot(sub(q, pl.o), pl.n), proj: (q) => madd(q, pl.n, -dot(sub(q, pl.o), pl.n)), name: 'plane' }; }
    if (T.k === 'face') {
      const { s, fi, f } = resolveFaceT(st2, T);
      if (RS.isFlat(s, fi)) { const pl = A.plane(s.faceCentroid(fi), f.n); return { kind: 'plane', plane: pl, sd: (q) => dot(sub(q, pl.o), pl.n), proj: (q) => madd(q, pl.n, -dot(sub(q, pl.o), pl.n)), name: 'face' }; }
      const tris = RS.trisOfFaces(s, RS.faceRegion(s, fi)), nt = nb.buildNearest(tris);
      return { kind: 'mesh', tris, sd: (q) => nb.nearestTri(nt, q).signed, proj: (q) => nb.nearestTri(nt, q).q, name: 'face' };
    }
    if (T.k === 'item') {
      const it = st2.items.get(T.key); if (!it) throw new Error('The trimming surface was not found');
      if (it.kind === 'surface') {
        const tool = { kind: 'srf', it, tris: null, name: it.name }, near = (q, g) => nb.closestOnSurface(tool.it.srf, q, g || null);
        tool.sd = (q) => { const r = near(q); const n = nb.normalOf(tool.it.srf, r.s, r.t); return r.d * (dot(sub(q, r.p), n) < 0 ? -1 : 1); };
        tool.proj = (q, g) => near(q, g).p; return tool;
      }
      if (it.kind === 'msurf') { const tris = trisOfItem(it, 6), nt = nb.buildNearest(tris); return { kind: 'mesh', tris, sd: (q) => nb.nearestTri(nt, q).signed, proj: (q) => nb.nearestTri(nt, q).q, name: it.name }; }
      throw new Error('That item cannot be used as a trimming tool');
    }
    throw new Error('Pick a surface, a plane or a face as the trimming tool');
  }
  /** intersection chains of NURBS surface item A with tool B, polished onto both surfaces */
  function intersect(itA, tool, scale) {
    const SA = itA.srf, trisA = trisOfItem(itA, 14), eps = scale * 1e-7; let segs;
    if (tool.kind === 'plane') segs = A.trisPlaneSegs(trisA, tool.plane, eps);
    else { const trisB = tool.kind === 'srf' ? trisOfItem(tool.it, 14) : tool.tris; segs = A.meshMeshSegs(trisA, trisB, eps); }
    if (!segs.length) return [];
    let ch = A.chainSegs(segs, scale * 1e-6);
    ch = ch.map((c) => { let pts = c.closed ? c.pts.concat([c.pts[0]]) : c.pts; pts = A.simplify(pts, scale * 2e-4); if (c.closed) pts = pts.slice(0, -1); return { pts, closed: c.closed }; }).filter((c) => c.pts.length >= (c.closed ? 3 : 2) && A.polyLen(c.pts, c.closed) > scale * 1e-3);
    const out = [];
    ch.forEach((c) => {
      let gA = null, gB = null; const P3 = [], uvA = [], uvB = [];
      c.pts.forEach((p0) => {
        let p = p0.slice(), ra = null;
        for (let it = 0; it < 6; it++) {
          ra = nb.closestOnSurface(SA, p, gA); gA = [ra.s, ra.t];
          const pb = tool.proj(ra.p, gB); if (tool.kind === 'srf') { const rb = nb.closestOnSurface(tool.it.srf, ra.p, gB); gB = [rb.s, rb.t]; }
          const dd = D(ra.p, pb); p = pb; if (dd < scale * 1e-9) break;
        }
        ra = nb.closestOnSurface(SA, p, gA); gA = [ra.s, ra.t]; P3.push(ra.p); uvA.push([ra.s, ra.t]);
        if (tool.kind === 'srf') { const rb = nb.closestOnSurface(tool.it.srf, ra.p, gB); gB = [rb.s, rb.t]; uvB.push([rb.s, rb.t]); }
      });
      out.push({ P3, uvA, uvB: tool.kind === 'srf' ? uvB : null, closed: c.closed });
    });
    return out;
  }
  /** which side of the chain (in the uv domain of S) lies on the wanted side of the other surface */
  function chooseSide(S, uv, closed, sdOther, want, scale) {
    const n = uv.length, tryAt = (m) => {
      const a = uv[m], b = uv[(m + 1) % n]; let d = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(d[0], d[1]); if (l < 1e-12) return null; d = [d[0] / l, d[1] / l];
      const left = [-d[1], d[0]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const e of [0.015, 0.03, 0.06, 0.12, 0.25]) {
        const q = [mid[0] + left[0] * e, mid[1] + left[1] * e]; if (q[0] < 0.002 || q[0] > 0.998 || q[1] < 0.002 || q[1] > 0.998) continue;
        const sd = sdOther(nb.sp(S, q[0], q[1])); if (Math.abs(sd) > scale * 2e-4) return { sd, q };
      }
      return null;
    };
    let r = null; for (const m of [Math.floor(n / 2), Math.floor(n / 4), Math.floor(3 * n / 4), 0, n - 2]) { r = tryAt(Math.max(0, Math.min(n - 1, m))); if (r) break; }
    if (!r) return null;
    const keepLeft = (want === 'pos') === (r.sd > 0);
    if (!closed) return { side: keepLeft ? 'left' : 'right' };
    const leftIsInside = nb.inLoop(r.q, uv);
    return { keep: keepLeft === leftIsInside ? 'inside' : 'outside' };
  }
  function applyTrim(st2, h, f, key, uv, P3, closed, choice) {
    const sub3 = P3.length > 200 ? P3.filter((_, i) => i % 2 === 0 || i === P3.length - 1) : P3, tmp = f.id + '~trim' + st2.items.size;
    nb.putCurve(st2, tmp, 'trim curve', X5.interpCurve(sub3, 3), f.id, { uv, on: key, closed });
    try { CAD.featExt.nbTrim({ id: f.id, name: f.name, params: { target: key, src: 'c:' + tmp, mode: 'normal', keep: closed ? choice.keep : 'inside', side: closed ? 'left' : choice.side } }, st2, h); }
    finally { st2.items.delete(tmp); }
  }
  function extendAll(st2, h, f, key, dist) {
    ['u0', 'u1', 'v0', 'v1'].forEach((e) => { CAD.featExt.nbExtend({ id: f.id, name: f.name, params: { target: key, edge: e, dist, mode: 'curvature', merge: true } }, st2, h); });
  }
  function runTrimSrf(p, st2, h, f) {
    const s = p.s || {}, scale = sceneOf(st2), mutual = p.mode === 'mutual';
    const itA = itemOf(st2, s.a, 'The surface to trim', ['surface']), tool = toolOf(st2, s.b, h);
    let chains = intersect(itA, tool, scale), extended = false;
    if (!chains.length && p.extend) {
      for (const k of [0.25, 0.6, 1.2]) {
        const a = st2.items.get(itA.key), hasTrimA = a.srf.trim && a.srf.trim.ops && a.srf.trim.ops.length;
        if (hasTrimA) throw new Error('The surface is already trimmed, so it cannot be extended — Untrim it first, or turn off “extend”');
        extendAll(st2, h, f, itA.key, scale * k);
        if (tool.kind === 'srf') { const b = st2.items.get(tool.it.key); if (!(b.srf.trim && b.srf.trim.ops && b.srf.trim.ops.length)) { extendAll(st2, h, f, tool.it.key, scale * k); tool.it = st2.items.get(tool.it.key); } }
        chains = intersect(st2.items.get(itA.key), tool, scale); extended = true; if (chains.length) break;
      }
    }
    if (!chains.length) throw new Error('The two do not intersect' + (p.extend ? ' even after extending them' : ' — turn on “Extend surfaces to meet”, or move them so that they cross'));
    const curA = st2.items.get(itA.key), SA = curA.srf, polys = chains.map((c) => ({ pts: c.P3, closed: c.closed }));
    // sides are decided on the untouched geometry first, then every trim is applied
    const planA = chains.map((c) => chooseSide(SA, c.uvA, c.closed, tool.sd, p.keepA === 'neg' ? 'neg' : 'pos', scale));
    if (planA.some((x) => !x)) throw new Error('Could not decide which side to keep — the surfaces are almost touching along the whole curve');
    let planB = null, SB = null;
    if (mutual) {
      if (tool.kind !== 'srf') throw new Error('Mutual trim needs a second NURBS surface (a plane or face can only trim the first surface)');
      SB = tool.it.srf; const sdA = (q) => { const r = nb.closestOnSurface(SA, q, null), n = nb.normalOf(SA, r.s, r.t); return r.d * (dot(sub(q, r.p), n) < 0 ? -1 : 1); };
      planB = chains.map((c) => chooseSide(SB, c.uvB, c.closed, sdA, p.keepB === 'neg' ? 'neg' : 'pos', scale));
      if (planB.some((x) => !x)) throw new Error('Could not decide which side of the second surface to keep');
    }
    chains.forEach((c, i) => applyTrim(st2, h, f, itA.key, c.uvA, c.P3, c.closed, planA[i]));
    if (mutual) chains.forEach((c, i) => applyTrim(st2, h, f, tool.it.key, c.uvB, c.P3, c.closed, planB[i]));
    return { polys, msg: chains.length + ' intersection curve' + (chains.length > 1 ? 's' : '') + ' · ' + (mutual ? 'both surfaces trimmed' : 'surface trimmed') + (extended ? ' (extended to meet)' : '') };
  }

  // ================================================================== 3 · MID-SURFACE
  function faceLike(st2, T, h) {
    if (!T) throw new Error('Pick a face, a surface or a plane');
    if (T.k === 'face') { const { s, fi, f } = resolveFaceT(st2, T), flat = RS.isFlat(s, fi); return { kind: 'face', s, fi, flat, f, loops: s.F[fi].loops.map((lp) => lp.map((vi) => s.V[vi].slice())), tris: RS.trisOfFaces(s, RS.faceRegion(s, fi)), plane: flat ? A.plane(s.faceCentroid(fi), f.n) : null }; }
    if (T.k === 'item') { const it = itemOf(st2, T, 'The surface'); if (it.kind === 'surface') return { kind: 'srf', it }; if (it.kind === 'msurf') return { kind: 'msurf', it, tris: trisOfItem(it, 6) }; throw new Error('That item cannot be used'); }
    if (T.k === 'std' || T.k === 'ref' || T.k === 'sketch') return { kind: 'plane', plane: RS.planeOf(st2, T) };
    throw new Error('That selection cannot be used for a mid-surface');
  }
  const closestFn = (X) => {
    if (X.kind === 'plane' || (X.kind === 'face' && X.flat && false)) return (q) => madd(q, X.plane.n, -dot(sub(q, X.plane.o), X.plane.n));
    if (X.kind === 'srf') { let g = null; return (q) => { const r = nb.closestOnSurface(X.it.srf, q, g); g = [r.s, r.t]; return r.p; }; }
    const nt = nb.buildNearest(X.tris); return (q) => nb.nearestTri(nt, q).q;
  };
  function runMid(p, st2, h, f) {
    const s = p.s || {}, scale = sceneOf(st2); let a = faceLike(st2, s.a, h), b = faceLike(st2, s.b, h);
    const rank = { face: 0, srf: 1, msurf: 2, plane: 3 };
    if (rank[b.kind] < rank[a.kind]) { const t = a; a = b; b = t; }
    if (a.kind === 'plane') throw new Error('A bare plane has no outline — pick at least one face or surface');
    const w = Math.max(0, Math.min(1, num(p.pos, 0.5))), toB = closestFn(b), mix = (q) => lerp(q, toB(q), w);
    if (a.kind === 'srf') {
      const S = a.it.srf, N = Math.max(8, Math.min(48, Math.round(num(p.n, 24)))), Q = [];
      for (let i = 0; i < N; i++) { const row = []; for (let j = 0; j < N; j++) row.push(mix(nb.sp(S, i / (N - 1), j / (N - 1)))); Q.push(row); }
      const M = X5.interpSurface(Q, 3, 3, true); if (S.trim && S.trim.ops && S.trim.ops.length) M.trim = clone(S.trim);
      putSrf(st2, f.id, f.name, M, f.id);
      const mid = mix(nb.sp(S, 0.5, 0.5)); return { polys: [{ pts: [nb.sp(S, 0.5, 0.5), mid], closed: false }], msg: 'Mid-surface through ' + N + ' × ' + N + ' points (position ' + w.toFixed(2) + ')' };
    }
    if (a.kind === 'face') {
      const loops = a.loops.map((lp) => ({ pts: lp.map(mix), closed: true }));
      let flatOk = false; if (a.flat) { try { const r = planarFromLoops(loops, Math.max(scale * 2e-4, 1e-4), false, scale); putSrf(st2, f.id, f.name, r.srf, f.id); flatOk = true; return { polys: r.outline, msg: 'Planar mid-surface' + (w === 0.5 ? ' halfway between the two faces' : '') }; } catch (e) { flatOk = false; } }
      if (!flatOk) {
        const cache = new Map(), key = (q) => q.map((x) => Math.round(x * 1e6)).join(','), mv = (q) => { const k = key(q); let r = cache.get(k); if (!r) { r = mix(q); cache.set(k, r); } return r; };
        const tris = a.tris.map((t) => t.map(mv)); st2.items.set(f.id, { key: f.id, name: f.name, kind: 'msurf', tris, src: f.id, report: { mid: true, triangles: tris.length } });
        return { polys: loops, msg: 'Mid-surface as a mesh shell (' + tris.length + ' triangles) — the faces are curved' };
      }
    }
    throw new Error('That combination is not supported — pick a face or a NURBS surface as the first selection');
  }

  // ================================================================== 4 · RADIATE SURFACE
  function curveChains(st2, h, Ts, scale) {
    const lines = []; (Ts || []).forEach((T) => RS.polysOf(st2, T, h).forEach((c) => lines.push(c.closed ? c.pts.concat([c.pts[0]]) : c.pts)));
    if (!lines.length) throw new Error('Pick the curve, edges or sketch to radiate from');
    return A.joinPolylines(lines, Math.max(1e-9, scale * 1e-6)).map((c) => ({ pts: c.closed ? closeless(c.pts) : c.pts, closed: c.closed }));
  }
  function planeNormalOf(st2, T, chain) { if (T) return RS.planeOf(st2, T).n; const n = A.polyNormal(chain.pts); if (!n) throw new Error('The curve is straight, so it has no plane — pick the plane to radiate in'); return n; }
  function radiateRow(c, mode, o) {
    const pts = c.pts, m = pts.length, closed = c.closed, out = [];
    const tan = (i) => { const a = pts[closed ? (i - 1 + m) % m : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % m : Math.min(m - 1, i + 1)]; return nrm(sub(b, a)); };
    if (mode === 'dir') return pts.map((q) => madd(q, o.d, o.dist));
    if (mode === 'axis') {
      const th = (o.draft || 0) * Math.PI / 180, ct = Math.cos(th), sn = Math.sin(th);
      return pts.map((q) => { let r = sub(q, A.closestOnAxis(q, o.axis)); const rl = len(r); r = rl < 1e-9 ? [0, 0, 0] : V.mul(r, 1 / rl); return madd(madd(q, r, o.dist * ct), o.axis.d, o.dist * sn); });
    }
    // in a plane: constant-width offset with mitre, outward for closed curves
    const n = o.n, th = (o.draft || 0) * Math.PI / 180, ct = Math.cos(th), sn = Math.sin(th);
    let sgn = 1; if (closed) { let s = [0, 0, 0]; for (let i = 0; i < m; i++) s = V.add(s, cross(pts[i], pts[(i + 1) % m])); sgn = dot(s, n) > 0 ? -1 : 1; if (o.inward) sgn = -sgn; } else sgn = o.inward ? -1 : 1;
    for (let i = 0; i < m; i++) {
      const hasPrev = closed || i > 0, hasNext = closed || i < m - 1, ip = (i - 1 + m) % m, inx = (i + 1) % m;
      let t0 = hasPrev ? nrm(sub(pts[i], pts[ip])) : null, t1 = hasNext ? nrm(sub(pts[inx], pts[i])) : null; if (!t0) t0 = t1; if (!t1) t1 = t0;
      const l0 = nrm(cross(n, t0)), l1 = nrm(cross(n, t1)); let b = V.add(l0, l1); if (len(b) < 1e-9) b = l0; b = nrm(b); const k = Math.max(0.3, dot(b, l0));
      out.push(madd(madd(pts[i], b, sgn * o.dist * ct / k), n, o.dist * sn));
    }
    return out;
  }
  function runRadiate(p, st2, h, f) {
    const s = p.s || {}, scale = sceneOf(st2), chains = curveChains(st2, h, s.curve, scale), dist = num(p.dist, 20); if (!(Math.abs(dist) > 1e-9)) throw new Error('The distance must not be zero');
    const mode = p.mode === 'dir' ? 'dir' : p.mode === 'axis' ? 'axis' : 'plane', polys = []; let made = 0;
    let d = null, ax = null; if (mode === 'dir') d = RS.dirOf(st2, s.dir); if (mode === 'axis') ax = RS.axisOf(st2, s.axis);
    chains.forEach((c, k) => {
      if (c.pts.length < 2) return;
      const o = { dist, draft: num(p.draft, 0), inward: !!p.inward, d, axis: ax, n: mode === 'plane' ? planeNormalOf(st2, s.plane, c) : null };
      const base = c.closed ? c.pts.concat([c.pts[0]]) : c.pts, far = radiateRow(c, mode, o), farL = c.closed ? far.concat([far[0]]) : far;
      let rows = [base, farL];
      if (p.both) { const near = radiateRow(c, mode, Object.assign({}, o, { dist: -dist, draft: -num(p.draft, 0) })); rows = [c.closed ? near.concat([near[0]]) : near, base, farL]; }
      const key = chains.length > 1 ? f.id + '.' + (k + 1) : f.id; putSrf(st2, key, f.name + (chains.length > 1 ? ' ' + (k + 1) : ''), rowsSurface(rows), f.id); made++;
      polys.push({ pts: farL, closed: false }); if (p.both) polys.push({ pts: rows[0], closed: false });
    });
    if (!made) throw new Error('Nothing to radiate');
    return { polys, msg: made + ' surface' + (made > 1 ? 's' : '') + ' radiated ' + Math.abs(dist) + ' mm' + (p.both ? ' to both sides' : '') };
  }

  // ================================================================== 5 · KNIT
  function knitMesh(items, tolIn, wantSolid) {
    const tris = [], names = [];
    items.forEach((it) => { const m = nb.meshOfItem(it, 10); if (!m) return; names.push(it.name); m.T.forEach((t) => tris.push([m.P[t[0]], m.P[t[1]], m.P[t[2]]])); });
    if (!tris.length) throw new Error('There are no surfaces to knit');
    const size = diag([].concat(...tris)), tol = tolIn > 0 ? tolIn : 1e-3 * size, cs = Math.max(tol, size * 1e-7);
    // 1. weld vertices
    const W = [], grid = new Map(), key = (c) => c.join(',');
    const vid = (p) => {
      const c = p.map((x) => Math.floor(x / cs));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const l = grid.get(key([c[0] + dx, c[1] + dy, c[2] + dz])); if (l) for (const i of l) if (D(W[i], p) <= tol) return i; }
      const i = W.length; W.push(p.slice()); const k = key(c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); return i;
    };
    let T = tris.map((t) => t.map(vid)).filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
    const edgeMap = (TT) => { const E = new Map(); TT.forEach((t, ti) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], kk = a < b ? a + ',' + b : b + ',' + a; if (!E.has(kk)) E.set(kk, []); E.get(kk).push(ti); } }); return E; };
    // 2. T-junction repair: split boundary edges at boundary vertices that lie on them
    let splits = 0;
    for (let round = 0; round < 3; round++) {
      const E = edgeMap(T), bnd = []; E.forEach((l, kk) => { if (l.length === 1) bnd.push(kk.split(',').map(Number)); });
      if (!bnd.length) break;
      const bv = new Set(); bnd.forEach(([a, b]) => { bv.add(a); bv.add(b); });
      const bgrid = new Map(), bc = Math.max(tol * 4, size / 120); bv.forEach((i) => { const c = W[i].map((x) => Math.floor(x / bc)), k = key(c); if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k).push(i); });
      const repl = new Map(); let changed = 0;
      bnd.forEach(([a, b]) => {
        const pa = W[a], pb = W[b], d = sub(pb, pa), L2 = dot(d, d); if (L2 < tol * tol) return;
        const lo = [0, 1, 2].map((k) => Math.floor((Math.min(pa[k], pb[k]) - tol) / bc)), hi = [0, 1, 2].map((k) => Math.floor((Math.max(pa[k], pb[k]) + tol) / bc)), on = [];
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const l = bgrid.get(key([x, y, z])); if (!l) continue; l.forEach((i) => { if (i === a || i === b) return; const t = dot(sub(W[i], pa), d) / L2; if (t <= 1e-6 || t >= 1 - 1e-6) return; if (len(sub(W[i], madd(pa, d, t))) <= tol) on.push({ i, t }); }); }
        if (on.length) { on.sort((u, v) => u.t - v.t); repl.set(a + ',' + b, [a].concat(on.map((o) => o.i), [b])); changed += on.length; }
      });
      if (!changed) break; splits += changed;
      const NT = []; T.forEach((t, ti) => {
        let cur = [t.slice()];
        for (let k = 0; k < 3; k++) {
          const a = t[k], b = t[(k + 1) % 3], kk = a < b ? a + ',' + b : b + ',' + a, chain = repl.get(kk); if (!chain) continue;
          const seq = a < b ? chain : chain.slice().reverse(), next = [];
          cur.forEach((tt) => { const ia = tt.indexOf(seq[0]), ib = tt.indexOf(seq[seq.length - 1]); if (ia < 0 || ib < 0) { next.push(tt); return; } const c = tt[3 - ia - ib]; const fw = ((ia + 1) % 3) === ib; for (let q = 0; q + 1 < seq.length; q++) next.push(fw ? [seq[q], seq[q + 1], c] : [seq[q + 1], seq[q], c]); });
          cur = next;
        }
        cur.forEach((x) => NT.push(x));
      });
      T = NT.filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
    }
    // 3. consistent orientation (flood fill over shared edges)
    const E = edgeMap(T), seen = new Array(T.length).fill(false), flip = new Array(T.length).fill(false);
    const dirOf = (ti, a, b) => { const t = T[ti], fl = flip[ti]; for (let k = 0; k < 3; k++) { const x = t[k], y = t[(k + 1) % 3]; if (x === a && y === b) return fl ? -1 : 1; if (x === b && y === a) return fl ? 1 : -1; } return 0; };
    for (let s0 = 0; s0 < T.length; s0++) {
      if (seen[s0]) continue; seen[s0] = true; const q = [s0];
      while (q.length) { const ti = q.pop(), t = T[ti]; for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], kk = a < b ? a + ',' + b : b + ',' + a, nbr = E.get(kk); if (!nbr || nbr.length !== 2) continue; const oj = nbr[0] === ti ? nbr[1] : nbr[0]; if (seen[oj]) continue; seen[oj] = true; const my = dirOf(ti, a, b), his = dirOf(oj, a, b); flip[oj] = my === his ? !flip[oj] : flip[oj]; q.push(oj); } }
    }
    const T3 = T.map((t, i) => (flip[i] ? [t[0], t[2], t[1]] : t).map((v) => W[v]));
    let open = 0, nonMan = 0; E.forEach((l) => { if (l.length === 1) open++; else if (l.length > 2) nonMan++; });
    const report = { surfaces: items.length, triangles: T3.length, openEdges: open, nonManifold: nonMan, tol, splits };
    if (open === 0 && nonMan === 0 && wantSolid) {
      let vol = 0; T3.forEach((t) => { vol += dot(t[0], cross(t[1], t[2])) / 6; });
      const polys = T3.map((t) => ({ pts: vol < 0 ? [t[0], t[2], t[1]] : t, plane: null })), solids = SOL.soupToSolids(polys);
      if (!solids.length) throw new Error('The knitted shell could not be converted to a solid');
      report.volume = Math.abs(solids.reduce((a, s2) => a + s2.volume(), 0)); return { closed: true, solids, tris: T3, report };
    }
    return { closed: open === 0 && nonMan === 0, tris: T3, report };
  }
  function runKnit(p, st2, h, f) {
    const s = p.s || {}; let list = [];
    if (p.all !== false && !(s.items && s.items.length)) list = [...st2.items.values()].filter((i) => (i.kind === 'surface' || i.kind === 'msurf') && !String(i.key).includes('~'));
    else list = (s.items || []).map((T) => itemOf(st2, T, 'A surface to knit')).filter((i) => i.kind === 'surface' || i.kind === 'msurf');
    if (list.length < 1) throw new Error('There are no surfaces to knit — create or pick at least one');
    const r = knitMesh(list, num(p.tol, 0), p.solid !== false), rp = r.report;
    if (r.closed && r.solids) h.putBodies(st2, f.id, f.name, r.solids, f.id);
    else st2.items.set(f.id, { key: f.id, name: f.name + (r.closed ? '' : ' (open shell)'), kind: 'msurf', tris: r.tris, src: f.id, report: rp });
    if (p.consume !== false) list.forEach((it) => st2.items.delete(it.key));
    f._knit = rp;
    const msg = rp.surfaces + ' surface' + (rp.surfaces > 1 ? 's' : '') + ' knitted' + (rp.splits ? ' · ' + rp.splits + ' T-junction(s) repaired' : '') + (r.closed ? (r.solids ? ' · closed → solid, volume ' + rp.volume.toFixed(2) : ' · closed shell') : ' · ' + rp.openEdges + ' open edge segment(s) remain — raise the tolerance or check the gaps') + (rp.nonManifold ? ' · ' + rp.nonManifold + ' non-manifold edge(s)' : '');
    if (!r.closed && h && h.warn) h.warn(f, msg);
    return { polys: [], msg };
  }

  // ================================================================== registration
  const sl = (k, label, t, o) => Object.assign({ k, label, t }, o || {});
  const numF = (k, label, def, o) => Object.assign({ k, label, def }, o || {});
  const chk = (k, label, def) => ({ k, label, def: !!def, type: 'chk' });
  const sel = (k, label, def, opts, o) => Object.assign({ k, label, def, type: 'sel', opts }, o || {});
  const KEEP = [['pos', 'Normal side'], ['neg', 'Opposite side']];
  const SPEC = {
    srfPlanar: { title: 'Planar surface', modes: [{ id: 'loops', label: 'Flat surface from a closed boundary', slots: [sl('loops', 'Closed sketch, curves or edges', 'curve', { multi: true })], vals: [numF('tol', 'Planarity tolerance (mm)', 0.01), chk('flip', 'Flip normal')], help: 'Pick a closed sketch, or pick every edge / curve of the outline — they are joined end to end. Inner closed loops become holes.' }] },
    srfTrimSrf: { title: 'Trim surface by surface', modes: [
      { id: 'trim', label: 'Trim one surface with a surface, plane or face', slots: [sl('a', 'Surface to trim', 'surf'), sl('b', 'Trimming tool (surface, plane or face)', 'surf')], vals: [sel('keepA', 'Keep', 'pos', KEEP), chk('extend', 'Extend surfaces to meet if they do not intersect')], help: 'The first surface is cut along its intersection with the tool; the tool is not changed. “Normal side” is the side the tool’s normal points to (use Reverse to flip a surface).' },
      { id: 'mutual', label: 'Mutual trim of two surfaces', slots: [sl('a', 'First surface', 'surf'), sl('b', 'Second surface', 'surf')], vals: [sel('keepA', 'Keep of the first surface', 'pos', KEEP), sel('keepB', 'Keep of the second surface', 'pos', KEEP), chk('extend', 'Extend surfaces to meet if they do not intersect')], help: 'Both surfaces are cut along their common curve. For each surface, “Normal side” keeps the part on the side the other surface’s normal points to.' }
    ] },
    srfMid: { title: 'Mid-surface', modes: [{ id: 'mid', label: 'Surface between two faces or surfaces', slots: [sl('a', 'First face or surface', 'surf'), sl('b', 'Second face or surface', 'surf')], vals: [numF('pos', 'Position between them (0.5 = middle)', 0.5), numF('n', 'Detail (points per direction, NURBS surfaces)', 24)], help: 'Parallel flat faces give a flat mid-surface; curved faces give a mesh shell; NURBS surfaces give a NURBS mid-surface that keeps the first surface’s trim.' }] },
    srfRadiate: { title: 'Radiate surface', modes: [
      { id: 'plane', label: 'Outward in a plane (parting-line / flange surface)', slots: [sl('curve', 'Curve, edges or sketch', 'curve', { multi: true }), sl('plane', 'Plane to radiate in (default: the curve’s own plane)', 'plane', { opt: 1 })], vals: [numF('dist', 'Distance (mm)', 20), numF('draft', 'Draft angle (°, tilts toward the plane normal)', 0), chk('inward', 'Radiate inward / to the other side'), chk('both', 'Both sides')] },
      { id: 'dir', label: 'In a direction', slots: [sl('curve', 'Curve, edges or sketch', 'curve', { multi: true }), sl('dir', 'Direction (edge, axis or plane normal)', 'dir')], vals: [numF('dist', 'Distance (mm)', 20), chk('both', 'Both ways')] },
      { id: 'axis', label: 'Radially from an axis', slots: [sl('curve', 'Curve, edges or sketch', 'curve', { multi: true }), sl('axis', 'Axis', 'axis')], vals: [numF('dist', 'Distance (mm)', 20), numF('draft', 'Draft angle (°, tilts along the axis)', 0), chk('both', 'Both sides')] }
    ] },
    srfKnit: { title: 'Knit surfaces', modes: [{ id: 'knit', label: 'Join surfaces into a shell or solid', slots: [sl('items', 'Surfaces (leave empty to use all)', 'surf', { multi: true, opt: true })], vals: [chk('all', 'Use every surface in the model when none is picked', true), numF('tol', 'Gap tolerance (mm, 0 = automatic)', 0), chk('solid', 'Make a solid when the shell is closed', true), chk('consume', 'Remove the original surfaces', true)], help: 'Works with trimmed and planar surfaces. Edges that meet within the tolerance are welded and T-junctions are repaired; the result reports any open edges.' }] }
  };
  const RUN = { srfPlanar: runPlanar, srfTrimSrf: runTrimSrf, srfMid: runMid, srfRadiate: runRadiate, srfKnit: runKnit };
  Object.keys(SPEC).forEach((type) => {
    CAD.featNames[type] = SPEC[type].title; RG.specs[type] = SPEC[type];
    CAD.featExt[type] = (f, st2, h) => { const r = RUN[type](f.params || {}, st2, h, f); f._msg = r && r.msg; return st2; };
    RG.X[type] = { compute(p, base, H) { const tmp = cloneSt(base); return RUN[type](p, tmp, H, { id: '__prev', name: SPEC[type].title }); } };
  });
  RG.surf = { planarFromLoops, intersect, knitMesh, radiateRow, run: RUN, spec: SPEC };
})(window);
