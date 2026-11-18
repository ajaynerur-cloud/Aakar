// ---------------------------------------------------------------- AakarKernel 1.5: direct modelling of analytic bodies
// Every edit is an exact boolean with a region built from the face's own outline (so planes stay planes and cylinders stay cylinders),
// and every result is checked: valid B-rep, no sliver faces, and a volume that equals the volume of the region that was added or removed.
// A failed check never returns a bad body: the call throws, and K.direct.attempt() gives the nearest valid distance instead.
//   K.direct.faces(h)                       faces with kind, normal / axis, radius, area, centre, neighbours
//   K.direct.features(h)                    holes, bosses, pockets, fillets, chamfers (recognised from the faces)
//   K.direct.pushPull(h, fi, d)             move a face along its normal (d > 0 adds material): planes (also with sloped neighbours), cylinders, whole spheres
//   K.direct.moveFace(h, fi, vec)           push/pull by the normal part of vec; holes and bosses slide with the sideways part
//   K.direct.offsetFaces(h, [fi...], d)     several faces by the same distance
//   K.direct.deleteFace(h, fi)              delete the face and heal: hole -> filled, boss -> removed, pocket -> filled, fillet / chamfer -> sharp corner
//   K.direct.replaceFace(h, fi, plane)      tilt / move a planar face to {n, p}
//   K.direct.setFilletRadius(h, fi, r)      change the radius of a straight fillet between two flat faces (any angle)
//   K.direct.select(h, fi, mode)            'tangent' | 'radius' | 'feature' | 'pattern' | 'coplanar' | 'coaxial'
//   K.direct.snap(h, fi, d, tol)            snap a typed / dragged distance to other faces (up to next face)
//   K.direct.check(h)                       { ok, issues, slivers }
//   K.direct.attempt(op, ...args)           { ok, body, reason, nearest } instead of an exception
//   K.direct.diagnose(h) / heal(h)          imported bodies: list defects, rebuild planar bodies cleanly
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.direct) return;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => { const l = len(a); if (!(l > 1e-14)) throw new Error('degenerate direction'); return mul(a, 1 / l); };
  const fail = (m, code) => { const e = new Error(m); e.code = code || 'DIRECT'; throw e; };
  const need = (ok, m, code) => { if (!ok) fail(m, code); };
  const TAU = 2 * Math.PI;
  function perp(n) { const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return unit(sub(a, mul(n, dot(a, n)))); }
  function frameOf(n, xh) { const z = unit(n), x = xh && len(sub(xh, mul(z, dot(xh, z)))) > 1e-9 ? unit(sub(xh, mul(z, dot(xh, z)))) : perp(z); return { x, y: cross(z, x), z }; }
  /** a model built in the local frame (origin o, axes x,y,z) placed in the world */
  const place = (h, fr, o) => K.transform(h, [fr.x[0], fr.y[0], fr.z[0], fr.x[1], fr.y[1], fr.z[1], fr.x[2], fr.y[2], fr.z[2]], o);
  const loc = (fr, o, p) => { const d = sub(p, o); return [dot(d, fr.x), dot(d, fr.y), dot(d, fr.z)]; };

  // ------------------------------------------------------------------------------------------ analysis
  const cache = new WeakMap();
  function model(h) {
    let m = cache.get(h); if (m) return m;
    const FL = K.faceLoops(h), adj = new Map();
    FL.forEach((F) => F.loops.forEach((L) => L.forEach((c) => { let a = adj.get(c.id); if (!a) adj.set(c.id, a = []); if (a.indexOf(F.i) < 0) a.push(F.i); })));
    FL.forEach((F) => { F.nb = []; F.loops.forEach((L) => L.forEach((c) => { (adj.get(c.id) || []).forEach((j) => { if (j !== F.i && F.nb.indexOf(j) < 0) F.nb.push(j); }); })); });
    const bb = K.bbox(h), diag = len(sub(bb.max, bb.min));
    m = { h, FL, adj, diag, tol: 1e-7 * diag + 1e-9, vol: K.volume(h) }; cache.set(h, m); return m;
  }
  function normalAt(F, p) {
    const s = F.kind; let n;
    if (s === 'plane') return F.n.slice();
    const d = sub(p, F.o), ax = dot(d, F.z), r = sub(d, mul(F.z, ax)), rl = len(r), e = rl > 1e-12 ? mul(r, 1 / rl) : F.x;
    if (s === 'cylinder') n = e;
    else if (s === 'sphere') n = unit(d);
    else if (s === 'cone') n = unit(sub(e, mul(F.z, F.k)));
    else if (s === 'torus') n = unit(sub(p, add(F.o, mul(e, F.R))));
    else n = e;
    return F.rev ? mul(n, -1) : n;
  }
  const edgeMid = (c) => c.kind === 'line' ? mul(add(c.p0, c.p1), 0.5) : c.kind === 'circle' ? add(c.c, add(mul(c.ex, c.r * Math.cos((c.a0 + c.a1) / 2)), mul(c.ey, c.r * Math.sin((c.a0 + c.a1) / 2)))) : (c.pts ? c.pts[c.pts.length >> 1] : c.p0);
  function faceCentre(F) { const P = []; F.loops.forEach((L) => L.forEach((c) => { P.push(c.p0); P.push(edgeMid(c)); })); let s = [0, 0, 0]; P.forEach((p) => { s = add(s, p); }); return P.length ? mul(s, 1 / P.length) : F.o; }
  function axialRange(F) { let lo = Infinity, hi = -Infinity; F.loops.forEach((L) => L.forEach((c) => { const pts = [c.p0, c.p1, edgeMid(c)]; pts.forEach((p) => { const a = dot(sub(p, F.o), F.z); if (a < lo) lo = a; if (a > hi) hi = a; }); })); return [lo, hi]; }
  const fullCircle = (c) => c.kind === 'circle' && c.closed;
  /** are the two faces tangent along their shared edges? (normals agree at the edge mid-points) */
  function tangent(m, i, j) {
    const A = m.FL[i], B = m.FL[j]; let any = false;
    for (const L of A.loops) for (const c of L) { if ((m.adj.get(c.id) || []).indexOf(j) < 0) continue; any = true; const p = edgeMid(c), na = normalAt(A, p), nb = normalAt(B, p); if (dot(na, nb) < 1 - 1e-6) return false; }
    return any;
  }
  const crossSection = (F) => { const m = null; void m; return F; };

  /** signed distance of p from the surface of face F */
  function distTo(F, p) {
    if (F.kind === 'plane') return dot(sub(p, F.o), F.n);
    const d = sub(p, F.o), ax = dot(d, F.z), r = sub(d, mul(F.z, ax)), rl = len(r);
    if (F.kind === 'cylinder') return rl - F.r;
    if (F.kind === 'sphere') return len(d) - F.r;
    if (F.kind === 'cone') return (rl - (F.r + F.k * ax)) / Math.sqrt(1 + F.k * F.k);
    if (F.kind === 'torus') { const e = rl > 1e-12 ? mul(r, 1 / rl) : F.x; return len(sub(p, add(F.o, mul(e, F.R)))) - F.r; }
    return Infinity;
  }
  /** fraction of the points that lie on the surface of face fi (within tol) */
  function onFace(h, fi, pts, tol) { const F = model(h).FL[fi]; if (!F || !pts.length) return 0; let n = 0; pts.forEach((p) => { if (Math.abs(distTo(F, p)) <= tol) n++; }); return n / pts.length; }
  /** is point p (on the plane of planar face fi) inside the face outline (holes respected)? */
  const polyCache = new WeakMap();
  function planeLoops(m, F) {
    let c = polyCache.get(F); if (c) return c;
    const fr = frameOf(F.n, F.x), L = F.loops.map((loop) => { const pts = []; loop.forEach((ce) => { const e = ce; if (e.kind === 'line') pts.push(loc(fr, F.o, e.p0)); else if (e.kind === 'circle') { const n = Math.max(8, Math.ceil(96 * Math.abs(e.a1 - e.a0) / TAU)), dirn = e.fwd ? 1 : -1; for (let i = 0; i < n; i++) { const t = e.fwd ? i / n : 1 - i / n, a = e.a0 + (e.a1 - e.a0) * t; pts.push(loc(fr, F.o, add(e.c, add(mul(e.ex, e.r * Math.cos(a)), mul(e.ey, e.r * Math.sin(a)))))); } void dirn; } else pts.push(loc(fr, F.o, e.p0)); }); return pts; });
    c = { fr, L }; polyCache.set(F, c); return c;
  }
  function faceContains(h, fi, p) {
    const m = model(h), F = m.FL[fi]; if (!F || F.kind !== 'plane') return false; const { fr, L } = planeLoops(m, F), q = loc(fr, F.o, p); let inside = false;
    L.forEach((poly) => { for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } });
    return inside;
  }
  function faces(h) {
    const m = model(h), area = faceAreas(h) || [];
    return m.FL.map((F) => ({ index: F.i, kind: F.kind, rev: F.rev, convex: F.kind === 'plane' ? null : !F.rev, normal: F.n || null, axis: F.kind === 'plane' ? null : F.z.slice(), origin: F.o.slice(), r: F.r, R: F.R, area: area[F.i], centre: faceCentre(F), neighbours: F.nb.slice(), k: F.k }));
  }
  function faceAreas(h) {
    let mi; try { mi = K.meshInfo(h, 0.002 * model(h).diag); } catch (e) { return null; }   // no triangulator (plain node): areas unknown, the sliver check is skipped
    const M = mi.mesh, A = new Array(model(h).FL.length).fill(0), P = M.positions, I = M.indices;
    for (let t = 0; t < I.length / 3; t++) { const a = [P[3 * I[3 * t]], P[3 * I[3 * t] + 1], P[3 * I[3 * t] + 2]], b = [P[3 * I[3 * t + 1]], P[3 * I[3 * t + 1] + 1], P[3 * I[3 * t + 1] + 2]], c = [P[3 * I[3 * t + 2]], P[3 * I[3 * t + 2] + 1], P[3 * I[3 * t + 2] + 2]]; const fi = M.faces ? M.faces[t] : 0; A[fi] += len(cross(sub(b, a), sub(c, a))) / 2; }
    return A;
  }

  // ------------------------------------------------------------------------------------------ recognition
  function features(h) {
    const m = model(h), out = [], used = new Set(), FL = m.FL;
    FL.forEach((F) => {
      if (F.kind !== 'cylinder') return;
      const loops = F.loops; if (!loops.every((L) => L.length === 1 && fullCircle(L[0])) || loops.length !== 2) return;
      const [lo, hi] = axialRange(F), ends = loops.map((L) => ({ c: L[0], ax: dot(sub(L[0].c, F.o), F.z), nbs: (m.adj.get(L[0].id) || []).filter((j) => j !== F.i) }));
      ends.sort((a, b) => a.ax - b.ax);
      const info = ends.map((e) => { const G = FL[e.nbs[0]]; if (!G || G.kind !== 'plane' || Math.abs(Math.abs(dot(G.n, F.z)) - 1) > 1e-9) return { plane: G ? G.i : -1, cap: false, ok: false }; const cap = G.loops.length === 1 && G.loops[0].length === 1 && G.loops[0][0].id === e.c.id; return { plane: G.i, cap, ok: true, n: G.n }; });
      if (!info[0].ok || !info[1].ok) return;
      const centre = add(F.o, mul(F.z, 0)), pt = (a) => { const q = sub(ends[0].c.c, F.o); return add(F.o, add(mul(F.z, a), sub(q, mul(F.z, dot(q, F.z))))); };
      void centre;
      if (F.rev) {   // concave: a hole
        const blind = info[0].cap || info[1].cap, floor = info[0].cap ? info[0].plane : info[1].cap ? info[1].plane : -1, open = info[0].cap ? info[1].plane : info[0].plane;
        out.push({ type: 'hole', faces: [F.i].concat(floor >= 0 ? [floor] : []), wall: F.i, floor, opening: blind ? open : -1, planes: [info[0].plane, info[1].plane], through: !blind, r: F.r, axis: F.z.slice(), c: pt(lo), a0: lo, a1: hi, depth: hi - lo, o: F.o.slice(), x: F.x.slice() });
      } else {
        const cap = info[0].cap ? info[0] : info[1].cap ? info[1] : null; if (info[0].cap && info[1].cap) return;
        out.push({ type: 'boss', faces: [F.i].concat(cap ? [cap.plane] : []), wall: F.i, cap: cap ? cap.plane : -1, base: info[0].cap ? info[1].plane : info[0].plane, r: F.r, axis: F.z.slice(), c: pt(lo), a0: lo, a1: hi, height: hi - lo, o: F.o.slice(), x: F.x.slice() });
      }
      used.add(F.i);
    });
    // pockets: a concave planar floor whose edges all meet perpendicular walls, and which sits inside a parallel opening face
    FL.forEach((F) => {
      if (F.kind !== 'plane' || F.loops.length !== 1 || out.some((f) => f.faces.indexOf(F.i) >= 0)) return;
      const walls = []; let ok = true;
      for (const c of F.loops[0]) { const nb = (m.adj.get(c.id) || []).find((j) => j !== F.i), G = FL[nb]; if (!G) { ok = false; break; }
        if (G.kind === 'plane' ? Math.abs(dot(G.n, F.n)) > 1e-9 : !(G.kind === 'cylinder' && Math.abs(Math.abs(dot(G.z, F.n)) - 1) < 1e-9 && G.rev)) { ok = false; break; }
        if (walls.indexOf(nb) < 0) walls.push(nb); }
      if (!ok || walls.length < 3) return;
      // the walls must lead to one opening face parallel to the floor, and the floor must be concave (walls rise in the floor's normal direction)
      const top = new Set(); walls.forEach((w) => FL[w].nb.forEach((j) => { if (j !== F.i && FL[j].kind === 'plane' && Math.abs(Math.abs(dot(FL[j].n, F.n)) - 1) < 1e-9 && walls.indexOf(j) < 0) top.add(j); }));
      const tops = [...top]; if (tops.length !== 1) return; const T = FL[tops[0]]; if (dot(T.n, F.n) < 1 - 1e-9) return;
      const rise = dot(sub(faceCentre(T), faceCentre(F)), F.n); if (!(rise > m.tol)) return;
      if (!T.loops.some((L) => L.some((c) => walls.some((w) => (m.adj.get(c.id) || []).indexOf(w) >= 0)))) return;
      out.push({ type: 'pocket', faces: [F.i].concat(walls), floor: F.i, walls, opening: T.i, depth: rise, n: F.n.slice() });
    });
    // fillets and chamfers: a face that is tangent to two neighbours (fillet) or a narrow plane between two sloped planes (chamfer)
    FL.forEach((F) => {
      if (out.some((f) => f.faces.indexOf(F.i) >= 0)) return;
      if ((F.kind === 'cylinder' || F.kind === 'torus') && F.nb.length >= 2) { const tn = F.nb.filter((j) => tangent(m, F.i, j)); if (tn.length >= 2) out.push({ type: 'fillet', faces: [F.i], face: F.i, tangent: tn, r: F.kind === 'cylinder' ? F.r : F.r, convex: !F.rev, kind: F.kind, axis: F.kind === 'cylinder' ? F.z.slice() : null }); }
      else if (F.kind === 'plane' && F.loops.length === 1 && F.loops[0].length === 4 && F.loops[0].every((c) => c.kind === 'line')) {
        const L = F.loops[0], nbs = L.map((c) => FL[(m.adj.get(c.id) || []).find((j) => j !== F.i)]); if (nbs.some((g) => !g || g.kind !== 'plane')) return;
        for (let k = 0; k < 2; k++) { const A = nbs[k], B = nbs[k + 2], C = nbs[(k + 1) % 4], D = nbs[(k + 3) % 4], dir = unit(sub(L[k].p1, L[k].p0));
          if (Math.abs(dot(A.n, F.n)) < 1 - 1e-6 && Math.abs(dot(A.n, F.n)) > 1e-6 && Math.abs(dot(B.n, F.n)) < 1 - 1e-6 && Math.abs(dot(B.n, F.n)) > 1e-6 && Math.abs(dot(C.n, dir)) > 1 - 1e-6 && Math.abs(dot(D.n, dir)) > 1 - 1e-6 && Math.abs(dot(A.n, dir)) < 1e-6 && Math.abs(dot(B.n, dir)) < 1e-6 && Math.abs(dot(A.n, B.n)) < 1 - 1e-6) { out.push({ type: 'chamfer', faces: [F.i], face: F.i, sides: [A.i, B.i], ends: [C.i, D.i], dir }); return; } }
      }
    });
    out.forEach((f, i) => { f.id = i; });
    return out;
  }
  const featureOf = (h, fi) => features(h).find((f) => f.faces.indexOf(fi) >= 0) || null;

  // ------------------------------------------------------------------------------------------ outline -> prism
  /** the planar face's loops as extrude() profiles in the face frame */
  function profileOf(F, fr, o) {
    const loopArea = (L) => { let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; L.forEach((c) => { const pts = [c.p0, c.p1, edgeMid(c)]; if (c.kind === 'circle') { for (let k = 0; k < 8; k++) pts.push(add(c.c, add(mul(c.ex, c.r * Math.cos(k * Math.PI / 4)), mul(c.ey, c.r * Math.sin(k * Math.PI / 4))))); } pts.forEach((p) => { const q = loc(fr, o, p); mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }); }); return (mxx - mnx) * (mxy - mny); };
    // extrude() takes the outer loop first; a face lists its loops in any order, so the loop with the biggest extent goes first
    return F.loops.slice().sort((a, b) => loopArea(b) - loopArea(a)).map((L) => ({ segs: L.map((c) => {
      const a = loc(fr, o, c.p0), b = loc(fr, o, c.p1);
      if (c.kind === 'line') return { k: 'l', a: [a[0], a[1]], b: [b[0], b[1]] };
      need(c.kind === 'circle' && Math.abs(Math.abs(dot(c.n, fr.z)) - 1) < 1e-8, 'an edge of this face is not a line or a circle in its plane', 'OUTLINE');
      const cl = loc(fr, o, c.c);
      if (c.closed) return { k: 'c', c: [cl[0], cl[1]], r: c.r };
      const nz = dot(c.n, fr.z) > 0 ? 1 : -1, sweep = (c.a1 - c.a0) * (c.fwd ? 1 : -1) * nz, th = Math.atan2(a[1] - cl[1], a[0] - cl[0]);
      return { k: 'a', c: [cl[0], cl[1]], r: c.r, a0: th, a1: th + sweep };
    }) }));
  }
  /** a prism over the face outline, from the face plane by `d` along +n (d > 0) or against it (d < 0) */
  function prismOver(F, d) {
    const fr = frameOf(F.n, F.x), o = F.o, body = K.extrude(profileOf(F, fr, o), Math.abs(d));
    const h = place(body, fr, o); return d >= 0 ? h : K.translate(h, mul(F.n, d));
  }
  const solve3 = (n1, d1, n2, d2, n3, d3) => {
    const c23 = cross(n2, n3), det = dot(n1, c23); if (Math.abs(det) < 1e-9) return null;
    const r = add(add(mul(c23, d1), mul(cross(n3, n1), d2)), mul(cross(n1, n2), d3)); return mul(r, 1 / det);
  };

  // ------------------------------------------------------------------------------------------ the checked boolean
  function slivers(h) {
    const m = model(h), A = faceAreas(h), bad = []; if (!A) return bad; const tot = A.reduce((a, b) => a + b, 0);
    A.forEach((a, i) => { if (a < 1e-9 * tot && a < m.tol * m.diag) bad.push(i); }); return bad;
  }
  function check(h) {
    const v = K.validate(h), issues = (v.issues || []).filter((x) => x.severity === 'error'), sl = slivers(h), vol = K.volume(h);
    let meshErr = null; try { K.mesh(h, 0.0005 * model(h).diag); } catch (e) { if (!/triangulator missing/.test(e.message)) meshErr = e.message; }
    if (meshErr) issues.push({ severity: 'error', code: 'MESH', message: meshErr });
    return { ok: v.ok !== false && !issues.length && !sl.length && vol > 0, issues, slivers: sl, volume: vol };
  }
  /** result of add (fuse) / remove (cut) of a region, accepted only when it is valid and the volume changed by exactly the region's volume */
  function apply(h, region, adds, what, exactVol) {
    const m = model(h), vr = exactVol !== undefined ? exactVol : K.volume(region);
    let r; try { r = adds ? K.fuse(h, region) : K.cut(h, region); K.volume(r); } catch (e) { fail(what + ': the boolean failed (' + e.message + ')', 'BOOLEAN'); }
    const v1 = K.volume(r), want = m.vol + (adds ? vr : -vr);
    if (!(Math.abs(v1 - want) <= 1e-6 * Math.max(m.vol, v1) + 1e-9)) fail(what + ': the region collides with other geometry (volume ' + v1.toFixed(4) + ' instead of ' + want.toFixed(4) + ')', 'COLLISION');
    const c = check(r); if (!c.ok) fail(what + ': the result is not a valid solid (' + (c.slivers.length ? 'sliver faces ' + c.slivers.join(',') : c.issues.map((x) => x.code).join(',')) + ')', 'INVALID');
    return r;
  }

  // ------------------------------------------------------------------------------------------ push / pull
  function pushPullPlane(m, F, d) {
    const h = m.h, FL = m.FL; let straight = true;
    for (const L of F.loops) for (const c of L) { const G = FL[(m.adj.get(c.id) || []).find((j) => j !== F.i)]; if (!G) fail('open edge next to the face', 'INVALID');
      if (G.kind === 'plane') { if (Math.abs(dot(G.n, F.n)) > 2e-3) straight = false; }
      else if (G.kind === 'cylinder' && Math.abs(Math.abs(dot(G.z, F.n)) - 1) < 1e-9) { /* axis along the move: stays straight */ }
      else fail('a neighbouring ' + G.kind + ' face is not parallel to the move: it cannot be extended exactly here', 'UNSUPPORTED'); }
    if (straight) return apply(h, prismOver(F, d), d > 0, 'push/pull');
    // sloped neighbours: the new face lies on the plane moved by d, and every corner slides along the edge between its two neighbours.
    // every loop is handled on its own (outline and holes): a loop whose neighbours are all flat becomes a frustum, a loop that stays straight (a round hole, a perpendicular wall) a prism;
    // the region is the outline's solid minus the holes' solids.
    const ext = (L) => { const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30], pt = (q) => { for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; } };
      L.forEach((c) => { pt(c.p0); pt(c.p1); pt(edgeMid(c)); if (c.kind === 'circle') { pt(add(c.c, mul(c.ex, c.r))); pt(sub(c.c, mul(c.ex, c.r))); pt(add(c.c, mul(c.ey, c.r))); pt(sub(c.c, mul(c.ey, c.r))); } }); return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); };
    const loops = F.loops.map((L) => { const nbs = L.map((c) => FL[(m.adj.get(c.id) || []).find((j) => j !== F.i)]); return { L, nbs, sloped: nbs.some((G) => G.kind === 'plane' && Math.abs(dot(G.n, F.n)) > 2e-3), ext: ext(L) }; }).sort((a, b) => b.ext - a.ext);
    loops.forEach((lp) => { if (lp.sloped) { need(lp.L.every((c) => c.kind === 'line'), 'a sloped outline must be made of straight edges (no arcs)', 'UNSUPPORTED'); need(lp.nbs.every((g) => g.kind === 'plane'), 'sloped neighbours must be planar', 'UNSUPPORTED'); } });
    const P2 = dot(F.n, F.o) + d, sg = d > 0 ? 1 : -1;
    const corners = (L, nb, shift, bottomShift) => { const top = [], bot = [], n = L.length;
      for (let i = 0; i < n; i++) { const A = nb[(i + n - 1) % n], B = nb[i];
        const q2 = solve3(F.n, P2, A.n, dot(A.n, A.o) + shift, B.n, dot(B.n, B.o) + shift), q1 = solve3(F.n, dot(F.n, F.o) + bottomShift, A.n, dot(A.n, A.o) + shift, B.n, dot(B.n, B.o) + shift);
        need(q1 && q2, 'two neighbours of a corner are parallel: the corner cannot slide', 'UNSUPPORTED'); top.push(q2); bot.push(q1); } return { top, bot }; };
    const turn = (pts) => { let a = [0, 0, 0]; for (let i = 0; i < pts.length; i++) a = add(a, cross(pts[i], pts[(i + 1) % pts.length])); return dot(a, F.n); };
    const refSign = loops[0].sloped ? Math.sign(turn(corners(loops[0].L, loops[0].nbs, 0, 0).top)) || 1 : 1;
    const frustum = (lp, shift, bottomShift) => {
      let L = lp.L, nb = lp.nbs, c = corners(L, nb, shift, bottomShift);
      if (Math.sign(turn(c.top)) * refSign < 0) { L = L.slice().reverse(); nb = nb.slice().reverse(); c = corners(L, nb, shift, bottomShift); }
      const n = L.length, verts = c.bot.concat(c.top), faces = [{ n: mul(F.n, -sg), loops: [[...Array(n).keys()]] }, { n: mul(F.n, sg), loops: [[...Array(n).keys()].map((i) => i + n)] }];   // the ring at the old plane is the lower one when pulling, the upper one when pushing
      const hole = lp !== loops[0];   // the walls of a hole face the hole: their normals point into the region of the hole's own frustum
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push({ n: hole ? mul(nb[i].n, -1) : nb[i].n, loops: [[i, j, j + n, i + n]] }); }
      try { return K.polyhedron(verts, faces); } catch (e) { fail('the swept region could not be built (' + e.message + ')', 'BOOLEAN'); }
    };
    const loopSolid = (lp, shift, bottomShift) => lp.sloped ? frustum(lp, shift, bottomShift) : prismOver(Object.assign({}, F, { loops: [lp.L] }), d);
    const region = (shift, bottomShift) => { const o = loopSolid(loops[0], shift, bottomShift); if (loops.length === 1) return o; let holes = loopSolid(loops[1], shift, bottomShift); for (let k = 2; k < loops.length; k++) holes = K.fuse(holes, loopSolid(loops[k], shift, bottomShift)); try { return K.cut(o, holes); } catch (e) { fail('the swept region could not be built (' + e.message + ')', 'BOOLEAN'); } };
    const exact = region(0, 0), vex = K.volume(exact);
    // pushing in: the region overlaps the body's own walls, which the boolean handles badly, so it is made a hair wider than the walls (outside the material, so the result is unchanged)
    if (d > 0) return apply(h, exact, true, 'push/pull');
    let last; for (const k of [1e-4, 1e-3, 1e-2, 5e-2]) { try { const eps = k * m.diag + 1e-6; return apply(h, region(eps, eps), false, 'push/pull', vex); } catch (e) { last = e; if (e.code === 'UNSUPPORTED') throw e; } }
    throw last;
  }
  function pushPullCylinder(m, F, d) {
    need(F.loops.length === 2 && F.loops.every((L) => L.length === 1 && fullCircle(L[0])), 'only a complete cylinder wall can be offset (a rounded corner is a fillet: use the fillet radius)', 'UNSUPPORTED');
    const convex = !F.rev, r1 = convex ? F.r + d : F.r - d; need(r1 > m.tol * 10, 'the hole would close completely: delete the face instead', 'DEGENERATE');
    const [a0, a1] = axialRange(F), hgt = a1 - a0, rmin = Math.min(F.r, r1), rmax = Math.max(F.r, r1), adds = d > 0;
    // `adds` : the ring is material that is added (boss grows / hole shrinks); otherwise it is removed
    const fr = frameOf(F.z, F.x), o = add(F.o, mul(F.z, a0));
    let ring = K.cylinder(rmax, hgt); ring = K.cut(ring, K.translate(K.cylinder(rmin, hgt + 2), [0, 0, -1]));
    return apply(m.h, place(ring, fr, o), adds, 'offset of the cylinder wall');
  }
  function pushPull(h, fi, d) {
    need(isFinite(d), 'distance must be a number'); const m = model(h), F = m.FL[fi]; need(F, 'no such face');
    if (Math.abs(d) < m.tol) return h;
    if (F.kind === 'plane') return pushPullPlane(m, F, d);
    if (F.kind === 'cylinder') return pushPullCylinder(m, F, d);
    if (F.kind === 'sphere' && m.FL.length === 1) { const r1 = F.r + d; need(r1 > 0, 'the sphere would vanish', 'DEGENERATE'); return K.translate(K.sphere(r1), F.o); }
    fail('push/pull of a ' + F.kind + ' face is not available in the exact kernel', 'UNSUPPORTED');
  }
  function offsetFaces(h, fis, d) {
    let cur = h; const order = fis.slice(); const sig = (hh, fi) => { const F = model(hh).FL[fi]; return { kind: F.kind, n: F.n, z: F.z, c: faceCentre(F) }; }; const S = order.map((fi) => sig(h, fi));
    for (let k = 0; k < order.length; k++) { // a face index changes after an edit: find the same face again by position
      const m = model(cur); let best = -1, bd = Infinity; m.FL.forEach((F) => { if (F.kind !== S[k].kind) return; if (F.n && S[k].n && dot(F.n, S[k].n) < 1 - 1e-6) return; if (F.z && S[k].z && Math.abs(dot(F.z, S[k].z)) < 1 - 1e-6) return; const dd = len(sub(faceCentre(F), S[k].c)); if (dd < bd) { bd = dd; best = F.i; } });
      need(best >= 0, 'a selected face disappeared during the edit', 'MISSING'); cur = pushPull(cur, best, d); }
    return cur;
  }

  // ------------------------------------------------------------------------------------------ delete + heal
  function holeFill(m, f) {   // fill a hole with a cylinder that spans its opening
    const h = m.h, FL = m.FL, fr = frameOf(f.axis, f.x), P = f.planes.map((i) => FL[i]);
    const lo = Math.min(...P.map((G) => dot(sub(G.o, f.o), f.axis))), hi = Math.max(...P.map((G) => dot(sub(G.o, f.o), f.axis)));
    const cyl = K.cylinder(f.r, hi - lo), o = add(f.o, mul(f.axis, lo)); return apply(h, place(cyl, fr, o), true, 'delete hole');
  }
  function bossRemove(m, f) {
    const base = m.FL[f.base], axBase = dot(sub(base.o, f.o), f.axis), top = f.a1; const fr = frameOf(f.axis, f.x), lo = Math.min(axBase, f.a0), hgt = (f.a1 - lo);
    return apply(m.h, place(K.cylinder(f.r, hgt), fr, add(f.o, mul(f.axis, lo))), false, 'delete boss');
  }
  function pocketFill(m, f) {
    const F = m.FL[f.floor]; const top = m.FL[f.opening]; const dist = dot(sub(top.o, F.o), F.n);
    return apply(m.h, prismOver(F, dist), true, 'delete pocket');
  }
  /** the sharp corner that a fillet or chamfer replaced: a prism whose outline is tangent point -> corner -> tangent point (-> arc back) */
  function cornerRegion(m, f) {
    const F = m.FL[f.face], sides = f.type === 'chamfer' ? f.sides.map((i) => m.FL[i]) : f.tangent.map((i) => m.FL[i]).filter((G) => G.kind === 'plane').slice(0, 2);
    need(sides.length === 2, 'only a fillet between two planes can be healed to a sharp corner', 'UNSUPPORTED');
    const A = sides[0], B = sides[1], dir = unit(cross(A.n, B.n)), fr = frameOf(dir, perp(dir));
    // profile points in the plane normal to the edge direction
    const shared = (G) => { const pts = []; F.loops.forEach((L) => L.forEach((c) => { if ((m.adj.get(c.id) || []).indexOf(G.i) >= 0) pts.push(c.p0, c.p1); })); return pts; };
    const sa = shared(A), sb = shared(B); need(sa.length && sb.length, 'the face does not touch both neighbours along an edge', 'UNSUPPORTED');
    let ax0 = Infinity, ax1 = -Infinity; F.loops.forEach((L) => L.forEach((c) => [c.p0, c.p1, edgeMid(c)].forEach((p) => { const a = dot(p, dir); ax0 = Math.min(ax0, a); ax1 = Math.max(ax1, a); })));
    const o = mul(dir, ax0), l2 = (p) => { const q = loc(fr, [0, 0, 0], p); return [q[0], q[1]]; }, t1 = l2(sa[0]), t2 = l2(sb[0]);
    const q = solve3(A.n, dot(A.n, A.o), B.n, dot(B.n, B.o), dir, 0); need(q, 'the neighbours do not meet', 'UNSUPPORTED'); const qc = l2(q);
    const segs = [{ k: 'l', a: t1, b: qc }, { k: 'l', a: qc, b: t2 }];
    if (f.type === 'fillet') { const cc = l2(F.o), th1 = Math.atan2(t2[1] - cc[1], t2[0] - cc[0]); let th2 = Math.atan2(t1[1] - cc[1], t1[0] - cc[0]); const mid = l2(edgeMid(F.loops.map((L) => L.find((c) => c.kind === 'circle')).find(Boolean) || F.loops[0][0]));
      // the arc from t2 back to t1 must pass on the side of the fillet (opposite the corner): choose the sweep whose mid-angle points away from the corner
      let sw = th2 - th1; while (sw <= -Math.PI * 2) sw += TAU; while (sw > 0) sw -= TAU; const cands = [sw, sw + TAU], away = (s) => { const am = th1 + s / 2, pm = [cc[0] + F.r * Math.cos(am), cc[1] + F.r * Math.sin(am)]; return Math.hypot(pm[0] - qc[0], pm[1] - qc[1]); };
      void mid; sw = away(cands[0]) > away(cands[1]) ? cands[0] : cands[1]; if (Math.abs(sw) > Math.PI + 1e-6) sw = sw > 0 ? sw - TAU : sw + TAU; segs.push({ k: 'a', c: cc, r: F.r, a0: th1, a1: th1 + sw }); }
    else segs.push({ k: 'l', a: t2, b: t1 });
    const prism = K.extrude([{ segs }], ax1 - ax0), world = K.translate(place(prism, fr, [0, 0, 0]), o);
    return world;
  }
  function deleteFace(h, fi) {
    const m = model(h), f = featureOf(h, fi); need(m.FL[fi], 'no such face');
    if (!f) fail('this face is not part of a hole, boss, pocket, fillet or chamfer: there is nothing to heal it with', 'UNSUPPORTED');
    if (f.type === 'hole') return holeFill(m, f);
    if (f.type === 'boss') return bossRemove(m, f);
    if (f.type === 'pocket') return pocketFill(m, f);
    const convex = f.type === 'chamfer' ? null : f.convex;
    let region = cornerRegion(m, f), adds = convex === null ? null : convex;
    if (adds === null) { // chamfer: material is removed from a corner, so the corner region is added back
      adds = true; }
    return apply(h, region, adds, 'delete ' + f.type);
  }
  /** change the radius of a 90 degree fillet: the band between the old and the new arc is removed or added (no re-rounding of a healed body, which the boolean handles badly) */
  function setFilletRadius(h, fi, r2) {
    const m = model(h), f = featureOf(h, fi); need(f && f.type === 'fillet' && f.kind === 'cylinder', 'this is not a straight fillet', 'UNSUPPORTED'); need(r2 > 0, 'radius must be positive');
    const F = m.FL[f.face], planes = f.tangent.map((i) => m.FL[i]).filter((G) => G.kind === 'plane'); need(planes.length >= 2, 'a fillet between two planes is needed', 'UNSUPPORTED');
    const A = planes[0], B = planes[1]; need(Math.abs(Math.abs(dot(A.n, B.n)) - 1) > 1e-9, 'a fillet between parallel planes cannot change radius', 'UNSUPPORTED');
    if (Math.abs(r2 - F.r) < m.tol) return h;
    const dir = unit(cross(A.n, B.n)), fr = frameOf(dir, perp(dir)), l2 = (p) => { const q = loc(fr, [0, 0, 0], p); return [q[0], q[1]]; };
    const shared = (G) => { const pts = []; F.loops.forEach((L) => L.forEach((c) => { if ((m.adj.get(c.id) || []).indexOf(G.i) >= 0) pts.push(c.p0, c.p1); })); return pts; };
    const sa = shared(A), sb = shared(B); need(sa.length && sb.length, 'the fillet does not touch both planes along an edge', 'UNSUPPORTED');
    let ax0 = Infinity, ax1 = -Infinity; F.loops.forEach((L) => L.forEach((c) => [c.p0, c.p1, edgeMid(c)].forEach((p) => { const a = dot(p, dir); ax0 = Math.min(ax0, a); ax1 = Math.max(ax1, a); })));
    const q3 = solve3(A.n, dot(A.n, A.o), B.n, dot(B.n, B.o), dir, 0); need(q3, 'the planes do not meet', 'UNSUPPORTED');
    const qc = l2(q3), t1 = l2(sa[0]), t2 = l2(sb[0]), u1 = unit([t1[0] - qc[0], t1[1] - qc[1], 0]), u2 = unit([t2[0] - qc[0], t2[1] - qc[1], 0]);
    const cg = u1[0] * u2[0] + u1[1] * u2[1], gam = Math.acos(Math.max(-1, Math.min(1, cg)));   // the angle between the two flat faces at the sharp corner (90 degrees: a quarter round)
    need(gam > 1e-3 && gam < Math.PI - 1e-3, 'the two flat faces are (almost) parallel', 'UNSUPPORTED');
    const tl = (r) => r / Math.tan(gam / 2), bis = unit([u1[0] + u2[0], u1[1] + u2[1], 0]), cd = (r) => r / Math.sin(gam / 2);   // tangent length, bisector, centre distance
    const T = (u, r) => [qc[0] + u[0] * tl(r), qc[1] + u[1] * tl(r)], C = (r) => [qc[0] + bis[0] * cd(r), qc[1] + bis[1] * cd(r)];
    const sweep = (c, p0, p1) => { const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]); let d = Math.atan2(p1[1] - c[1], p1[0] - c[0]) - a0; while (d > Math.PI) d -= TAU; while (d <= -Math.PI) d += TAU; return [a0, a0 + d]; };
    const S = (r) => { const c = C(r), t1p = T(u1, r), t2p = T(u2, r), [a0, a1] = sweep(c, t2p, t1p); return K.translate(place(K.extrude([{ segs: [{ k: 'l', a: t1p, b: qc }, { k: 'l', a: qc, b: t2p }, { k: 'a', c, r, a0, a1 }] }], ax1 - ax0), fr, [0, 0, 0]), mul(dir, ax0)); };
    // S(r) is the sliver of material between the sharp corner and a round of radius r; S(small) lies inside S(big), so growing never meets the old round surface
    const grows = r2 > F.r, Sold = S(F.r), Snew = S(r2), dv = Math.abs(K.volume(Snew) - K.volume(Sold));
    if (f.convex) { if (grows) return apply(h, Snew, false, 'fillet radius', dv); const sharp = apply(h, Sold, true, 'fillet radius'); return apply(sharp, Snew, false, 'fillet radius'); }
    if (grows) return apply(h, Snew, true, 'fillet radius', dv);
    const sharp = apply(h, Sold, false, 'fillet radius'); return apply(sharp, Snew, true, 'fillet radius');
  }

  // ------------------------------------------------------------------------------------------ move / replace
  function moveFace(h, fi, vec) {
    const m = model(h), F = m.FL[fi]; need(F, 'no such face');
    if (F.kind === 'plane') { const d = dot(vec, F.n), side = sub(vec, mul(F.n, d)); need(len(side) < m.tol * 100 || d !== 0 || true, ''); if (len(side) > m.tol * 100 && Math.abs(d) < m.tol) fail('a planar face can only be pushed along its normal; slide a hole or boss with its feature, or move the whole body', 'UNSUPPORTED'); return pushPull(h, fi, d); }
    const f = featureOf(h, fi);
    if (f && (f.type === 'hole' || f.type === 'boss')) return moveFeature(h, f, vec);
    fail('moving a ' + F.kind + ' face is only available for holes and bosses', 'UNSUPPORTED');
  }
  /** slide a hole or boss: heal it away, then make it again at the new place (the sideways part of vec; the axial part moves a blind hole's floor / a boss's cap) */
  function moveFeature(h, f, vec) {
    const ax = f.axis, axial = dot(vec, ax), side = sub(vec, mul(ax, axial)); const m = model(h);
    let cur = h;
    if (len(side) > m.tol * 10) {
      const fr = frameOf(ax, f.x);
      if (f.type === 'hole') { cur = holeFill(m, f); const lo = f.a0, o = add(add(f.o, mul(ax, lo)), side); cur = apply(cur, place(K.cylinder(f.r, f.depth), fr, o), false, 'move hole'); }
      else { cur = bossRemove(m, f); const lo = f.a0, o = add(add(f.o, mul(ax, lo)), side); cur = apply(cur, place(K.cylinder(f.r, f.height), fr, o), true, 'move boss'); }
    }
    if (Math.abs(axial) > m.tol * 10) { const m2 = model(cur), g = pickFeatureAfterMove(m2, f, side); if (!g) fail('the moved feature could not be found again', 'MISSING'); const target = f.type === 'hole' ? (g.floor >= 0 ? g.floor : null) : g.cap; need(target !== null && target >= 0, 'only a blind hole floor or a boss cap can move along the axis', 'UNSUPPORTED'); cur = pushPull(cur, target, f.type === 'hole' ? -axial * Math.sign(dot(m2.FL[target].n, ax)) * -1 : axial * Math.sign(dot(m2.FL[target].n, ax))); }
    return cur;
  }
  function pickFeatureAfterMove(m, f, side) { const want = add(f.c, side); return features(m.h).find((g) => g.type === f.type && Math.abs(g.r - f.r) < m.tol * 10 && len(sub(g.c, want)) < m.tol * 100 + 1e-6 * m.diag) || null; }
  function replaceFace(h, fi, plane) {
    const m = model(h), F = m.FL[fi]; need(F && F.kind === 'plane', 'only a planar face can be replaced by a plane'); const n2 = unit(plane.n), p2 = plane.p, big = 4 * m.diag + 10;
    need(dot(n2, F.n) > 0.05, 'the new plane must face the same way as the old one', 'UNSUPPORTED');
    const sg = F.loops.length > 0 && F.loops.every((L) => L.every((c) => c.kind === 'line' || c.kind === 'circle')); need(sg, 'this outline cannot be swept', 'OUTLINE');
    // heights of the new plane above the old one over the outline
    const hOf = (p) => (dot(n2, sub(p2, p))) / dot(n2, F.n); let hmax = -Infinity, hmin = Infinity; F.loops.forEach((L) => L.forEach((c) => [c.p0, c.p1, edgeMid(c)].forEach((p) => { const t = hOf(p); hmax = Math.max(hmax, t); hmin = Math.min(hmin, t); })));
    if (hmax - hmin < m.tol * 10 && Math.abs(hmax) < m.tol * 10) return h;
    let cur = h; const half = (o, nrm, side) => { const fr = frameOf(nrm, null), bx = K.box(2 * big, 2 * big, big); return place(K.translate(bx, [-big, -big, side > 0 ? 0 : -big]), fr, o); };   // half space: everything on the +side (or -side) of the plane
    if (hmax > m.tol * 10) { const up = prismOver(F, hmax + 1), below = half(p2, n2, -1); let region = K.common(up, below); cur = apply(cur, region, true, 'replace face (added)'); }
    if (hmin < -m.tol * 10) { const m2 = model(cur), F2 = m2.FL.findIndex((G) => G.kind === 'plane' && dot(G.n, F.n) > 1 - 1e-9 && Math.abs(dot(G.n, sub(G.o, F.o))) < m2.tol * 100); void F2; const down = prismOver(F, hmin - 1), above = half(p2, n2, +1); const region = K.common(down, above); cur = apply(cur, region, false, 'replace face (removed)'); }
    return cur;
  }

  // ------------------------------------------------------------------------------------------ selection, snapping
  function select(h, fi, mode) {
    const m = model(h), F = m.FL[fi]; need(F, 'no such face'); const out = new Set([fi]);
    if (mode === 'tangent') { const q = [fi]; while (q.length) { const i = q.pop(); m.FL[i].nb.forEach((j) => { if (!out.has(j) && tangent(m, i, j)) { out.add(j); q.push(j); } }); } }
    else if (mode === 'radius') m.FL.forEach((G) => { if (G.kind === F.kind && G.r !== undefined && Math.abs(G.r - F.r) < m.tol * 10 && G.rev === F.rev) out.add(G.i); });
    else if (mode === 'coplanar') m.FL.forEach((G) => { if (F.kind === 'plane' && G.kind === 'plane' && dot(G.n, F.n) > 1 - 1e-9 && Math.abs(dot(sub(G.o, F.o), F.n)) < m.tol * 10) out.add(G.i); });
    else if (mode === 'coaxial') m.FL.forEach((G) => { if (F.kind !== 'plane' && G.kind !== 'plane' && Math.abs(Math.abs(dot(G.z, F.z)) - 1) < 1e-9 && len(cross(sub(G.o, F.o), F.z)) < m.tol * 10) out.add(G.i); });
    else if (mode === 'feature') { const f = featureOf(h, fi); if (f) f.faces.forEach((i) => out.add(i)); }
    else if (mode === 'pattern') {
      const f = featureOf(h, fi); if (f) features(h).forEach((g) => { if (g.type !== f.type) return; const same = ['r', 'depth', 'height', 'through'].every((k) => f[k] === undefined || (typeof f[k] === 'number' ? Math.abs(f[k] - g[k]) < m.tol * 10 : f[k] === g[k])); if (same && (!f.axis || Math.abs(Math.abs(dot(f.axis, g.axis)) - 1) < 1e-9)) g.faces.forEach((i) => out.add(i)); });
    } else fail('unknown selection mode ' + mode);
    return [...out].sort((a, b) => a - b);
  }
  /** nearest parallel face plane within tol of the moved face: the distance that makes "up to the next face" */
  function snap(h, fi, d, tol) {
    const m = model(h), F = m.FL[fi]; if (!F || F.kind !== 'plane') return { d, snapped: false }; tol = tol || m.diag * 0.01; let best = null;
    m.FL.forEach((G) => { if (G.kind !== 'plane' || G.i === fi || Math.abs(Math.abs(dot(G.n, F.n)) - 1) > 1e-9) return; const t = dot(sub(G.o, F.o), F.n); if (Math.abs(t - d) < tol && (!best || Math.abs(t - d) < Math.abs(best.d - d))) best = { d: t, face: G.i }; });
    return best ? { d: best.d, snapped: true, face: best.face } : { d, snapped: false };
  }
  function nextFace(h, fi, dir) {   // distance to the next face ahead of the moved face (dir = +1 out, -1 in)
    const m = model(h), F = m.FL[fi]; need(F && F.kind === 'plane', 'only planar faces'); let best = null;
    m.FL.forEach((G) => { if (G.kind !== 'plane' || G.i === fi || Math.abs(Math.abs(dot(G.n, F.n)) - 1) > 1e-9) return; const t = dot(sub(G.o, F.o), F.n) * dir; if (t > m.tol * 10 && (!best || t < best.d)) best = { d: t * dir, face: G.i }; });
    return best;
  }
  function attempt(op, h, ...args) {
    const fn = { pushPull, moveFace, offsetFaces, deleteFace, replaceFace, setFilletRadius }[op]; if (!fn) return { ok: false, reason: 'unknown operation ' + op };
    try { return { ok: true, body: fn(h, ...args) }; } catch (e) {
      const res = { ok: false, reason: e.message, code: e.code || 'DIRECT' };
      if ((op === 'pushPull' || op === 'offsetFaces') && (e.code === 'COLLISION' || e.code === 'INVALID' || e.code === 'BOOLEAN' || e.code === 'DEGENERATE')) {   // nearest valid distance: halve until it works
        const d = args[1]; let t = d;
        if (op === 'pushPull') { try { const nx = nextFace(h, args[0], Math.sign(d)); if (nx && Math.abs(nx.d) < Math.abs(d) - 1e-9) { const b = fn(h, args[0], nx.d); res.nearest = { d: nx.d, body: b, upTo: nx.face }; return res; } } catch (e3) { /* fall through to halving */ } }
        for (let k = 0; k < 8; k++) { t *= 0.5; try { const b = fn(h, args[0], t); res.nearest = { d: t, body: b }; break; } catch (e2) { /* keep halving */ } } }
      return res; }
  }

  // ------------------------------------------------------------------------------------------ imported bodies
  function diagnose(h) {
    const issues = [], v = K.validate(h); (v.issues || []).forEach((x) => issues.push({ type: x.code, severity: x.severity, message: x.message }));
    const m = model(h), A = faceAreas(h) || [], tot = A.reduce((a, b) => a + b, 0);
    A.forEach((a, i) => { if (a < 1e-9 * tot) issues.push({ type: 'SLIVER_FACE', severity: 'warning', face: i, message: 'face ' + i + ' is a sliver' }); });
    // coplanar neighbours that should be one face
    m.FL.forEach((F) => { if (F.kind !== 'plane') return; F.nb.forEach((j) => { const G = m.FL[j]; if (j > F.i && G.kind === 'plane' && dot(G.n, F.n) > 1 - 1e-9 && Math.abs(dot(sub(G.o, F.o), F.n)) < m.tol * 10) issues.push({ type: 'SPLIT_FACE', severity: 'warning', faces: [F.i, j], message: 'faces ' + F.i + ' and ' + j + ' lie in one plane and could be merged' }); }); });
    return { ok: !issues.some((x) => x.severity === 'error'), issues, faceCount: m.FL.length };
  }
  /** rebuild an all-planar body with merged coplanar faces; curved bodies are returned unchanged with the list of what could not be fixed */
  function heal(h) {
    const m = model(h), d0 = diagnose(h); if (m.FL.some((F) => F.kind !== 'plane')) return { body: h, healed: false, remaining: d0.issues, note: 'curved faces are kept as they are; only planar bodies are rebuilt' };
    const vid = new Map(), verts = [], key = (p) => Math.round(p[0] / (m.tol * 10)) + ',' + Math.round(p[1] / (m.tol * 10)) + ',' + Math.round(p[2] / (m.tol * 10)), V = (p) => { const k = key(p); if (!vid.has(k)) { vid.set(k, verts.length); verts.push(p.slice()); } return vid.get(k); };
    const groups = []; m.FL.forEach((F) => { const g = groups.find((G) => dot(G.n, F.n) > 1 - 1e-9 && Math.abs(dot(sub(G.o, F.o), F.n)) < m.tol * 10); if (g) g.fs.push(F); else groups.push({ n: F.n, o: F.o, fs: [F] }); });
    const faces = groups.map((G) => { // loops of the group: coedges that are not shared inside the group
      const segs = []; G.fs.forEach((F) => F.loops.forEach((L) => L.forEach((c) => { const nbs = m.adj.get(c.id) || []; if (nbs.filter((j) => G.fs.some((x) => x.i === j)).length < 2) segs.push([V(c.p0), V(c.p1)]); })));
      const loops = []; const left = segs.slice(); while (left.length) { const loop = [left.shift()]; for (;;) { const last = loop[loop.length - 1][1], k = left.findIndex((s) => s[0] === last); if (k < 0) break; loop.push(left.splice(k, 1)[0]); if (loop[loop.length - 1][1] === loop[0][0]) break; } loops.push(loop.map((s) => s[0])); }
      // drop collinear vertices
      const clean = loops.map((L) => L.filter((v, i) => { const a = verts[L[(i + L.length - 1) % L.length]], b = verts[v], c = verts[L[(i + 1) % L.length]]; return len(cross(sub(b, a), sub(c, b))) > 1e-9 * m.diag * m.diag * 1e-3; }));
      // outer loop = largest area
      const area = (L) => { let s = [0, 0, 0]; for (let i = 0; i < L.length; i++) s = add(s, cross(verts[L[i]], verts[L[(i + 1) % L.length]])); return Math.abs(dot(s, G.n)) / 2; }; clean.sort((a, b) => area(b) - area(a));
      return { n: G.n, loops: clean }; });
    let b; try { b = K.polyhedron(verts, faces); } catch (e) { return { body: h, healed: false, remaining: d0.issues, note: 'rebuild failed: ' + e.message }; }
    const ok = Math.abs(K.volume(b) - m.vol) < 1e-6 * m.vol; if (!ok) return { body: h, healed: false, remaining: d0.issues, note: 'the rebuilt body had a different volume and was discarded' };
    return { body: b, healed: true, remaining: diagnose(b).issues, note: 'rebuilt with ' + faces.length + ' faces (was ' + m.FL.length + ')' };
  }

  K.direct = { faces, onFace, faceContains, features, featureOf, pushPull, moveFace, offsetFaces, deleteFace, replaceFace, setFilletRadius, select, snap, nextFace, check, attempt, diagnose, heal, version: '1.0' };
  K.features = (K.features || []).concat(['direct-edit']);
  K.version = AK.version = '1.5.0';
})(window.AakarKernel);
