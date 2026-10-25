/* ======================================================================
 * Aakar 8.17 · SOLID FACE TOOLS
 *   solDelFace   Delete face(s) of a solid:  heal  (neighbouring faces are extended until they close the gap: holes, pockets, bosses, fillets, chamfers)
 *                                            open  (leave an open surface shell)
 *   solReplFace  Replace face(s) with a plane / flat face (moves the face and lets its neighbours adapt),
 *                or with a NURBS surface / mesh surface (material is added or removed between the face and the surface)
 * Plugs into the Reference-geometry panel system (CAD.ref.specs / CAD.ref.X).
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, IK = CAD && CAD.ik, F = CAD && CAD.feat, RG = CAD && CAD.ref, nb = CAD && CAD.nb;
  if (!RG || !RG.A || !RG.specs || !RG.X || !CAD.csg || !CAD.solid || !CAD.solver || !P) return;
  const A = RG.A, V = A.V, RS = RG.resolvers, SOL = CAD.solid, S = CAD.solver, CSG = CAD.csg;
  const num = (x, d) => (x === undefined || x === null || x === '' || !isFinite(+x) ? d : +x);
  const D3 = V.dist, dot = V.dot, sub = V.sub, madd = V.madd, nrm = V.norm, len = V.len, cross = V.cross;
  const cloneSt = (b) => Object.assign({}, b, { bodies: new Map(b.bodies || []), sketches: new Map(b.sketches || []), items: new Map(b.items || []), refs: new Map(b.refs || []) });

  // ------------------------------------------------------------------ helpers
  function resolveFaceT(st2, T) { const b = st2.bodies.get(T.body); if (!b) throw new Error('A referenced body was not found — pick the face again'); const s = b.solid, fi = F.resolveFace(s, T.ref); if (fi < 0) throw new Error('A referenced face was not found — pick it again'); return { b, s, fi }; }
  function facesOf(st2, Ts) {
    if (!Ts || !Ts.length) throw new Error('Pick the face(s) first');
    let body = null, s = null; const set = new Set();
    Ts.forEach((T) => { if (!T || T.k !== 'face') throw new Error('Pick faces of a solid'); const r = resolveFaceT(st2, T); if (body && body.key !== r.b.key) throw new Error('All the faces must belong to the same body'); body = r.b; s = r.s; RS.faceRegion(s, r.fi).forEach((i) => set.add(i)); });
    return { body, s, D: [...set].sort((a, b) => a - b) };
  }
  const edgeKey = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  function neighboursOf(s, D) {
    const inD = new Set(D), dv = new Set(); D.forEach((fi) => s.F[fi].loops.forEach((lp) => lp.forEach((v) => dv.add(v))));
    const out = [];
    s.F.forEach((f, fi) => { if (inD.has(fi)) return; let shared = 0; const seen = new Set(); f.loops.forEach((lp) => lp.forEach((v) => { if (dv.has(v) && !seen.has(v)) { seen.add(v); shared++; } })); if (shared >= 2) out.push(fi); });
    return out;
  }
  const faceCentroid = (s, fi) => { const f = s.F[fi]; let c = [0, 0, 0], n = 0; f.loops.forEach((lp) => lp.forEach((v) => { c = V.add(c, s.V[v]); n++; })); return V.mul(c, 1 / Math.max(1, n)); };
  function dedupePlanes(list, tol) { const out = []; list.forEach((p) => { if (!out.some((q) => dot(q.n, p.n) > 1 - 1e-9 && Math.abs(q.d - p.d) < tol)) out.push(p); }); return out; }
  /** a big solid on the inner side of a plane (outward normal n, plane n·x = d) */
  function halfSpace(pl, c0, M, L) {
    const B = A.basisOf(pl.n), c = madd(c0, pl.n, pl.d - dot(c0, pl.n)), u = B.u, v = B.v, q = (a, b) => V.add(V.add(c, V.mul(u, a)), V.mul(v, b));
    return SOL.prismFromLoops([[q(-M, -M), q(M, -M), q(M, M), q(-M, M)]], pl.n, -L, 0, null);
  }
  const bool = (kind, a, b) => CSG.boolean(kind, a, b);
  const volOf = (arr) => arr.reduce((a, s) => a + Math.abs(s.volume()), 0);
  function chain(kind, solids) { let cur = solids[0]; for (let i = 1; i < solids.length; i++) { const r = bool(kind, cur, solids[i]); if (r.length < 1) return null; cur = r.length === 1 ? r[0] : r.sort((a, b) => Math.abs(b.volume()) - Math.abs(a.volume()))[0]; } return cur; }
  const touches = (comp, pts, tol) => { const cv = comp.V; for (const p of pts) for (const q of cv) if (D3(p, q) <= tol) return true; return false; };

  // ================================================================== DELETE AND HEAL
  function healFaces(s, D) {
    const sc = s.scale(), tol = sc * 1e-6 + 1e-9, N = neighboursOf(s, D);
    if (!N.length) throw new Error('The faces have no neighbours to heal from');
    // how much boundary each neighbour shares with the deleted faces (long shared edges decide convex / concave, short end caps do not)
    const dvSet = new Set(); D.forEach((fi) => s.F[fi].loops.forEach((lp) => lp.forEach((v) => dvSet.add(v))));
    const wOf = (fi) => { let w = 0; s.F[fi].loops.forEach((lp) => { for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; if (dvSet.has(a) && dvSet.has(b)) w += D3(s.V[a], s.V[b]); } }); return w; };
    const nb0 = N.map((fi) => ({ n: s.F[fi].n.slice(), d: s.F[fi].d, w: wOf(fi) })), planes = dedupePlanes(nb0, sc * 1e-7);
    planes.forEach((pl) => { pl.w = nb0.filter((q) => dot(q.n, pl.n) > 1 - 1e-9 && Math.abs(q.d - pl.d) < sc * 1e-7).reduce((a, q) => a + q.w, 0); });
    const Dpts = []; D.forEach((fi) => s.F[fi].loops.forEach((lp) => lp.forEach((v) => Dpts.push(s.V[v]))));
    // does the deleted region lie inside the neighbours' half-spaces (convex: holes, fillets, chamfers) or outside (concave: bosses, pockets' floors, inside-corner fillets)?
    let inside = 0, outside = 0; D.forEach((fi) => { const c = faceCentroid(s, fi); planes.forEach((pl) => { const sd = dot(pl.n, c) - pl.d; if (sd < -sc * 1e-5) inside += pl.w; else if (sd > sc * 1e-5) outside += pl.w; }); });
    const intersectMode = inside >= outside, c0 = Dpts.reduce((a, p) => V.add(a, p), [0, 0, 0]).map((x) => x / Dpts.length), M = 3 * sc, L = 3 * sc;
    // the long-edge neighbours are extended (∩ for convex, ∪ for concave); the short end-cap neighbours only bound the region (always ∩)
    const maxW = Math.max(...planes.map((q) => q.w)), mainP = planes.filter((q) => q.w >= 0.25 * maxW), boundP = planes.filter((q) => q.w < 0.25 * maxW);
    const hsMain = mainP.map((pl) => halfSpace(pl, c0, M, L)), hsBound = boundP.map((pl) => halfSpace(pl, c0, M, L));
    let C = hsMain.length ? (intersectMode ? chain('intersect', hsMain) : chain('union', hsMain)) : null;
    if (C && hsBound.length) C = chain('intersect', [C].concat(hsBound));
    if (!C) throw new Error('The neighbouring faces do not enclose a region — nothing to heal with');
    const added = bool('subtract', C, s), removed = bool('subtract', s, C), pts = Dpts, ttol = Math.max(tol * 50, sc * 1e-5);
    const addC = added.filter((c) => Math.abs(c.volume()) > sc * sc * sc * 1e-9 && touches(c, pts, ttol)), rmC = removed.filter((c) => Math.abs(c.volume()) > sc * sc * sc * 1e-9 && touches(c, pts, ttol));
    if (!addC.length && !rmC.length) throw new Error('Healing found nothing to add or remove — the neighbouring faces already meet this region');
    let res = s;
    for (const c of addC) { const r = bool('union', res, c); if (r.length !== 1) throw new Error('Healing produced a split body (union)'); res = r[0]; }
    for (const c of rmC) { const r = bool('subtract', res, c); if (r.length !== 1) throw new Error('Healing produced a split body (cut)'); res = r[0]; }
    const v = S.validate(res, null, { skipSelfIntersect: true }); if (!v.ok) throw new Error('The healed body is not valid (' + (v.reason || 'unknown') + ') — try deleting more of the surrounding faces');
    return { solid: res, added: addC.length, removed: rmC.length, mode: intersectMode ? 'extend' : 'fill' };
  }
  function openShell(s, D) {
    const inD = new Set(D), tris = []; s.F.forEach((f, fi) => { if (inD.has(fi)) return; SOL.triangulateFace(s, fi).forEach((t) => tris.push(t.map((i) => s.V[i].slice()))); });
    if (!tris.length) throw new Error('Every face was deleted'); return tris;
  }
  function runDelete(p, st2, h, f) {
    const { body, s, D } = facesOf(st2, (p.s || {}).faces);
    if (p.mode === 'open') {
      const tris = openShell(s, D); st2.bodies.delete(body.key); st2.items.set(f.id, { key: f.id, name: f.name, kind: 'msurf', tris, src: f.id, report: { openShell: true, triangles: tris.length } });
      return { polys: outline(s, D), msg: D.length + ' face' + (D.length > 1 ? 's' : '') + ' deleted · the solid became an open surface shell of ' + tris.length + ' triangles' };
    }
    const r = healFaces(s, D); h.setSolid(st2, body, r.solid);
    return { polys: outline(s, D), msg: D.length + ' face' + (D.length > 1 ? 's' : '') + ' deleted and healed (' + (r.mode === 'extend' ? 'neighbours extended' : 'gap filled') + (r.added ? ', ' + r.added + ' region added' : '') + (r.removed ? ', ' + r.removed + ' region removed' : '') + ') · volume ' + Math.abs(r.solid.volume()).toFixed(2) };
  }
  function outline(s, D) { const L = []; D.forEach((fi) => s.F[fi].loops.forEach((lp) => { const pts = lp.map((v) => s.V[v]); L.push({ pts, closed: true }); })); return L; }

  // ================================================================== REPLACE FACE
  function targetOf(st2, T, h) {
    if (!T) throw new Error('Pick the plane or surface to replace the face with');
    if (T.k === 'std' || T.k === 'ref' || T.k === 'sketch') return { kind: 'plane', plane: RS.planeOf(st2, T), name: 'plane' };
    if (T.k === 'face') { const r = resolveFaceT(st2, T); if (RS.isFlat(r.s, r.fi)) return { kind: 'plane', plane: A.plane(r.s.faceCentroid(r.fi), r.s.F[r.fi].n), name: 'face' }; return { kind: 'mesh', tris: RS.trisOfFaces(r.s, RS.faceRegion(r.s, r.fi)), name: 'curved face' }; }
    if (T.k === 'item') { const it = st2.items.get(T.key); if (!it) throw new Error('The target surface was not found'); const m = nb.meshOfItem(it, it.kind === 'surface' ? 6 : 6); if (!m) throw new Error('That item has no surface'); return { kind: 'mesh', tris: m.T.map((t) => t.map((i) => m.P[i])), name: it.name }; }
    throw new Error('Pick a plane, a flat face or a surface');
  }
  function flatFace(s, D) {
    const f0 = s.F[D[0]]; D.forEach((fi) => { const f = s.F[fi]; if (dot(f.n, f0.n) < 1 - 1e-7 || Math.abs(f.d - f0.d) > s.scale() * 1e-6) throw new Error('The faces must lie in one plane (pick one flat face, or several coplanar faces)'); });
    return { n: f0.n.slice(), d: f0.d };
  }
  function replaceByPlane(s, D, pl) {
    const F0 = flatFace(s, D); let n = pl.n.slice(); if (dot(n, F0.n) < 0) n = V.mul(n, -1);
    const pF = V.mul(F0.n, F0.d), pd = dot(n, pl.o), cos = Math.max(-1, Math.min(1, dot(F0.n, n)));
    let T, offset = false;
    if (cos > 1 - 1e-9) { const sd = pd - F0.d; T = { t: V.mul(F0.n, sd) }; offset = true; if (Math.abs(sd) < s.scale() * 1e-9) throw new Error('The face already lies on that plane'); }
    else {
      const ln = A.planeIntersect({ o: pF, n: F0.n, u: A.basisOf(F0.n).u, v: A.basisOf(F0.n).v }, { o: pl.o, n, u: A.basisOf(n).u, v: A.basisOf(n).v });
      if (!ln) throw new Error('The plane is parallel to the face'); const ax = nrm(cross(F0.n, n)), ang = Math.acos(cos);
      T = { axis: ax, angle: ang, pivot: ln.o };
    }
    const r = S.applyEdit(s, { type: 'face', faces: D, offset }, T, {}), v = S.validate(r.solid, s);
    if (!v.ok) throw new Error('The face cannot move to that plane without breaking the body (' + (v.reason || 'invalid') + ')');
    return r.solid;
  }
  /** a closed solid under a surface mesh (the surface is its top, the sides drop by depth along -dirDown) */
  function underMesh(tris, up, depth) {
    // orient the mesh so that it faces "up"
    let sum = 0; tris.forEach((t) => { sum += dot(cross(sub(t[1], t[0]), sub(t[2], t[0])), up); }); const T = sum < 0 ? tris.map((t) => [t[0], t[2], t[1]]) : tris;
    const key = (p) => p.map((x) => Math.round(x * 1e6)).join(','), E = new Map();
    T.forEach((t) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], ka = key(a), kb = key(b), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka; if (!E.has(kk)) E.set(kk, []); E.get(kk).push([a, b]); } });
    const polys = []; T.forEach((t) => polys.push({ pts: [t[0], t[1], t[2]], plane: null }));
    const down = V.mul(up, -depth), dn = (p) => V.add(p, down);
    T.forEach((t) => polys.push({ pts: [dn(t[0]), dn(t[2]), dn(t[1])], plane: null }));
    E.forEach((l) => { if (l.length === 1) { const [a, b] = l[0]; polys.push({ pts: [a, dn(a), dn(b), b], plane: null }); } });
    const sol = SOL.soupToSolids(polys); if (!sol.length) throw new Error('The target surface could not be turned into a solid slab (is it a single connected sheet?)');
    return sol.length === 1 ? sol[0] : sol.sort((a, b) => Math.abs(b.volume()) - Math.abs(a.volume()))[0];
  }
  function replaceBySurface(s, D, tris) {
    const F0 = flatFace(s, D), n = F0.n, sc = s.scale(), big = 3 * sc;
    const under = underMesh(tris, n, big);
    let res = s;
    const outs = [], ins = [];
    D.forEach((fi) => { const loops3 = s.F[fi].loops.map((lp) => lp.map((v) => s.V[v])); outs.push(SOL.prismFromLoops(loops3, n, 0, big, null)); ins.push(SOL.prismFromLoops(loops3, n, -big, 0, null)); });
    let added = 0, removed = 0;
    outs.forEach((pr) => { const r = bool('intersect', pr, under); r.forEach((c) => { if (Math.abs(c.volume()) > sc * sc * sc * 1e-9) { const u = bool('union', res, c); if (u.length === 1) { res = u[0]; added++; } } }); });
    ins.forEach((pr) => { const r = bool('subtract', pr, under); r.forEach((c) => { if (Math.abs(c.volume()) > sc * sc * sc * 1e-9) { const u = bool('subtract', res, c); if (u.length === 1) { res = u[0]; removed++; } } }); });
    if (!added && !removed) throw new Error('The surface and the face coincide, or the surface does not cover the face (nothing to add or remove)');
    const v = S.validate(res, null, { skipSelfIntersect: true, minFeature: sc * 1e-6 }); if (!v.ok) throw new Error('The result is not a valid solid (' + (v.reason || 'unknown') + ')');
    return { solid: res, added, removed };
  }
  function runReplace(p, st2, h, f) {
    const sel = p.s || {}, { body, s, D } = facesOf(st2, sel.faces), tg = targetOf(st2, sel.target, h);
    if (tg.kind === 'plane') { const out = replaceByPlane(s, D, tg.plane); h.setSolid(st2, body, out); return { polys: outline(s, D), msg: D.length + ' face' + (D.length > 1 ? 's' : '') + ' replaced by a ' + tg.name + ' · volume ' + Math.abs(out.volume()).toFixed(2) }; }
    const r = replaceBySurface(s, D, tg.tris); h.setSolid(st2, body, r.solid);
    return { polys: outline(s, D), msg: 'Face replaced by ' + tg.name + (r.added ? ' · material added' : '') + (r.removed ? ' · material removed' : '') + ' · volume ' + Math.abs(r.solid.volume()).toFixed(2) };
  }

  // ================================================================== registration
  const sl = (k, label, t, o) => Object.assign({ k, label, t }, o || {});
  const chk = (k, label, def) => ({ k, label, def: !!def, type: 'chk' });
  const SPEC = {
    solDelFace: { title: 'Delete face', modes: [
      { id: 'heal', label: 'Delete and heal', slots: [sl('faces', 'Faces to delete', 'face', { multi: true })], vals: [], help: 'The neighbouring faces are extended until they close the gap — removes holes, pockets, bosses, fillets and chamfers. Pick one facet of a round face to take the whole face.' },
      { id: 'open', label: 'Delete and leave an open shell', slots: [sl('faces', 'Faces to delete', 'face', { multi: true })], vals: [], help: 'The solid becomes an open surface shell without those faces.' }
    ] },
    solReplFace: { title: 'Replace face', modes: [{ id: 'repl', label: 'Replace a face with a plane or surface', slots: [sl('faces', 'Face(s) to replace', 'face', { multi: true }), sl('target', 'Replace with (plane, flat face or surface)', 'surf')], vals: [], help: 'Planes and flat faces move the face (its neighbours adapt). NURBS and mesh surfaces add or remove material between the face and the surface, over the face’s outline.' }] }
  };
  const RUN = { solDelFace: runDelete, solReplFace: runReplace };
  Object.keys(SPEC).forEach((type) => {
    CAD.featNames[type] = SPEC[type].title; RG.specs[type] = SPEC[type];
    CAD.featExt[type] = (f, st2, h) => { const r = RUN[type](f.params || {}, st2, h, f); f._msg = r && r.msg; return st2; };
    RG.X[type] = { compute(p, base, H) { const tmp = cloneSt(base); return RUN[type](p, tmp, H, { id: '__prev', name: SPEC[type].title }); } };
  });
  RG.solf = { healFaces, replaceByPlane, replaceBySurface, run: RUN, spec: SPEC };
})(window);
