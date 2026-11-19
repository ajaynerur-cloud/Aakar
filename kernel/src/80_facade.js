// ---------------------------------------------------------------- public kernel interface (the contract Aakar's exact-kernel panel expects, plus analysis extras)
AK.version = '1.5.0';
const mkNode = (kind, d) => new Node(kind, d);
const prim = (p) => mkNode('prim', { prim: p });
const num = (x, name) => { if (!(typeof x === 'number' && isFinite(x))) throw new Error(name + ' must be a finite number'); return x; };
const pos = (x, name) => { if (!(num(x, name) > 0)) throw new Error(name + ' must be positive'); return x; };
function evalExact(h) { const ev = evaluate(h, RES_EXACT); if (!ev.mp) ev.mp = massProps(ev.body); return ev; }
const rng = (a, b) => (b - a);
/** round the circular rim where a plane (outward normal n) meets a coaxial cylinder: the plane face shrinks (boss) or grows (hole), the wall is cut back by f and a
 *  true torus patch joins them. The faces are copied (the source body is never changed) and the tessellation is edited in place, so the result keeps booleans, STEP and mass properties. */
function roundRimSurgery(h, spec, f) {
  const ev = evalExact(h); if (!ev.soup) throw new Error('this body has no tessellation to edit');
  const body = ev.body, n = V.norm(spec.n), c = spec.c, R = spec.R, boss = !!spec.boss, sc = Math.max(1e-9, V.len(V.sub(soupBBox(ev.soup).max, soupBBox(ev.soup).min))), tol = 1e-7 * sc + 1e-9;
  if (!(f > 0)) throw new Error('size must be positive'); if (!(R > f * 1.0001) || (boss && !(R > 2 * f * 1.0001))) throw new Error('the round needs the circle to be wider');
  const rho = (p) => { const d = V.sub(p, c), a = V.dot(d, n); return V.len(V.sub(d, V.mul(n, a))); }, ax = (p) => V.dot(V.sub(p, c), n);
  let rim = null; body.edges().forEach((e) => { if (e.kind === 'circle' && e.closed && Math.abs(e.r - R) < tol * 10 && V.dist(e.c, c) < tol * 10 && Math.abs(Math.abs(V.dot(V.cross(e.x, e.y), n)) - 1) < 1e-9) rim = e; });
  if (!rim) throw new Error('rim edge not found');
  const fs = body.faces.filter((fc) => fc.loops.some((l) => l.some((ce) => ce.edge === rim)));
  if (fs.length !== 2) throw new Error('the rim does not border exactly two faces');
  const Fp = fs.find((x) => x.surf.kind === 'plane'), Fc = fs.find((x) => x.surf.kind === 'cylinder'); if (!Fp || !Fc) throw new Error('the rim is not between a plane and a cylinder');
  const P0 = rim.pt(0.3), Np = Fp.normalAt(P0), Nc = Fc.normalAt(P0), rad = V.norm(V.sub(V.sub(P0, c), V.mul(n, ax(P0))));
  if (V.dot(Np, n) < 1 - 1e-6) throw new Error('the plane does not face the given direction');
  if (Math.abs(V.dot(Nc, n)) > 1e-6) throw new Error('the cylinder is not coaxial'); if ((V.dot(Nc, rad) > 0) !== boss) throw new Error('boss / hole mismatch');
  const nrm = V.cross(rim.x, rim.y), Rt = boss ? R - f : R + f, R1 = Rt;
  const e1 = makeCircleEdge(c, nrm, rim.x, R1, 0, TAU), e2 = makeCircleEdge(V.sub(c, V.mul(n, f)), nrm, rim.x, R, 0, TAU);
  const swap = (face, ne) => { const nf = new Face(face.surf, face.rev, face.loops.map((l) => l.map((ce) => ce.edge === rim ? { edge: ne, fwd: ce.fwd } : ce))); ['vrange', 'urange', 'tris'].forEach((k) => { if (face[k] !== undefined) nf[k] = face[k]; }); return nf; };
  const Fp2 = swap(Fp, e1), Fc2 = swap(Fc, e2), cep = Fp.loops.flat().find((ce) => ce.edge === rim), cec = Fc.loops.flat().find((ce) => ce.edge === rim);
  const tor = new Torus(frame(V.sub(c, V.mul(n, f)), n, rim.x), Rt, f), Fn = new Face(tor, false, [[{ edge: e1, fwd: !cep.fwd }], [{ edge: e2, fwd: !cec.fwd }]]); Fn.vrange = boss ? [0, PI / 2] : [PI / 2, PI];
  // ---- the tessellation of a boolean result may carry chord mid-points just inside the circle: put them exactly on it (in both faces, so nothing opens)
  const qk0 = (p) => Math.round(p[0] / (sc * 1e-8)) + ',' + Math.round(p[1] / (sc * 1e-8)) + ',' + Math.round(p[2] / (sc * 1e-8)), snapMap = new Map();
  ev.soup.forEach((t) => { if (t.tag === Fc) t.pts.forEach((p) => { const r0 = rho(p); if (Math.abs(ax(p)) < tol * 50 && r0 > R * 0.97 && Math.abs(r0 - R) > tol * 50 && r0 < R) snapMap.set(qk0(p), V.add(c, V.add(V.mul(n, ax(p)), V.mul(V.norm(V.sub(V.sub(p, c), V.mul(n, ax(p)))), R)))); }); });
  const S0 = ev.soup.map((t) => (t.tag === Fp || t.tag === Fc) ? { pts: t.pts.map((p) => snapMap.get(qk0(p)) || p), tag: t.tag } : t);
  // ---- tessellation: collect the rim rings of both faces, they must agree
  const ang = (p) => { const d = V.sub(p, c), u = V.sub(d, V.mul(n, V.dot(d, n))); return Math.atan2(V.dot(u, rim.y), V.dot(u, rim.x)); };
  const ringOf = (face, hgt, rr) => { const A = []; S0.forEach((t) => { if (t.tag !== face) return; t.pts.forEach((p) => { if (Math.abs(ax(p) - hgt) < tol * 50 && Math.abs(rho(p) - rr) < tol * 50) A.push(ang(p)); }); }); A.sort((a, b) => a - b); const o = []; A.forEach((a) => { if (!o.length || a - o[o.length - 1] > 1e-7) o.push(a); }); if (o.length > 1 && o[0] + TAU - o[o.length - 1] < 1e-7) o.pop(); return o; };
  const A1 = ringOf(Fp, 0, R), A2 = ringOf(Fc, 0, R); if (A1.length < 6 || A1.length !== A2.length || A1.some((a, i) => Math.abs(a - A2[i]) > 1e-6)) throw new Error('the rim rings of the two faces do not match');
  const EC = (G.CAD && G.CAD.solid && G.CAD.solid.earcut) || fallbackEC;
  const bad = S0.some((t) => t.tag === Fc && t.pts.some((p) => ax(p) < -tol * 50 && ax(p) > -f - tol * 50));
  if (bad) throw new Error('other geometry lies inside the round');
  const dR = R1 - R, soup = [];
  // the plane face is triangulated again from its loops (the rim ring keeps the angles of the wall and the torus)
  const retessPlane = () => {
    const qk = (p) => Math.round(p[0] / (sc * 1e-8)) + ',' + Math.round(p[1] / (sc * 1e-8)) + ',' + Math.round(p[2] / (sc * 1e-8)), pos = new Map(), de = new Map();
    S0.forEach((t) => { if (t.tag !== Fp) return; for (let i = 0; i < 3; i++) { const p = t.pts[i], q = t.pts[(i + 1) % 3], a = qk(p), b = qk(q); if (a === b) continue; pos.set(a, p); pos.set(b, q); const k = a + '>' + b; de.set(k, (de.get(k) || 0) + 1); } });
    const next = new Map(); de.forEach((cnt, k) => { const [a, b] = k.split('>'); const rev = b + '>' + a; const net = cnt - (de.get(rev) || 0); if (net > 0) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); } });
    const used = new Set(), loops = [];
    next.forEach((outs, a0) => { outs.forEach((b0) => { const k0 = a0 + '>' + b0; if (used.has(k0)) return; const L = [a0]; let a = a0, b = b0, guard = 0; while (guard++ < 1e6) { used.add(a + '>' + b); if (b === a0) break; L.push(b); const nx = (next.get(b) || []).find((c) => !used.has(b + '>' + c)); if (!nx) break; a = b; b = nx; } if (L.length >= 3) loops.push(L.map((k) => pos.get(k))); }); });
    if (!loops.length) throw new Error('plane boundary not found');
    const bu = V.norm(V.cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), bv = V.cross(n, bu), to2 = (p) => [V.dot(V.sub(p, c), bu), V.dot(V.sub(p, c), bv)];
    const rings = loops.map((L) => {
      const onRim = L.every((p) => Math.abs(ax(p)) < tol * 50 && Math.abs(rho(p) - R) < tol * 50);
      if (!onRim) return L;
      let sgn = 0; for (let i = 0; i < L.length; i++) { const da = Math.atan2(V.dot(V.sub(L[(i + 1) % L.length], c), bv), V.dot(V.sub(L[(i + 1) % L.length], c), bu)) - Math.atan2(V.dot(V.sub(L[i], c), bv), V.dot(V.sub(L[i], c), bu)); sgn += Math.atan2(Math.sin(da), Math.cos(da)); }
      return L.map((p) => V.add(p, V.mul(V.norm(V.sub(V.sub(p, c), V.mul(n, ax(p)))), dR)));   // same angles, new radius, same direction
    });
    const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = to2(P[i]), q = to2(P[(i + 1) % P.length]); a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const ar = rings.map(area2); let oi = 0; ar.forEach((x, i) => { if (Math.abs(x) > Math.abs(ar[oi])) oi = i; });
    const ordered = [rings[oi]].concat(rings.filter((_, i) => i !== oi)).map((P, k) => { const a = area2(P); return (k === 0 && a < 0) || (k > 0 && a > 0) ? P.slice().reverse() : P; });
    const all = [], idx = []; ordered.forEach((P) => { const ids = []; P.forEach((p) => { ids.push(all.length); all.push(p); }); idx.push(ids); });
    const tris = EC(idx, (i) => to2(all[i])); if (!tris.length) throw new Error('plane face could not be triangulated');
    tris.forEach((t) => { let a = all[t[0]], b = all[t[1]], cc = all[t[2]]; const g = V.cross(V.sub(b, a), V.sub(cc, a)); if (V.dot(g, n) < 0) { const x = b; b = cc; cc = x; } soup.push({ pts: [a, b, cc], tag: Fp2 }); });
  };
  if (!EC) throw new Error('triangulator missing');
  retessPlane();
  S0.forEach((t) => {
    if (t.tag === Fp) return;
    if (t.tag === Fc) soup.push({ pts: t.pts.map((p) => (Math.abs(ax(p)) < tol * 50 && Math.abs(rho(p) - R) < tol * 50) ? V.sub(p, V.mul(n, f)) : p), tag: Fc2 });
    else soup.push(t);
  });
  const m = Math.max(4, Math.ceil(circleSegs(f, resTol(RES_EXACT, f), 16) / 4)), tc = V.sub(c, V.mul(n, f)), ptAt = (th, v) => { const u = V.add(V.mul(rim.x, Math.cos(th)), V.mul(rim.y, Math.sin(th))); return V.add(tc, V.add(V.mul(u, Rt + f * Math.cos(v)), V.mul(n, f * Math.sin(v)))); };
  const v0 = boss ? 0 : PI / 2, v1 = boss ? PI / 2 : PI;
  for (let i = 0; i < A1.length; i++) { const t0 = A1[i], t1 = i + 1 < A1.length ? A1[i + 1] : A1[0] + TAU; for (let j = 0; j < m; j++) {
    const va = v0 + (v1 - v0) * j / m, vb = v0 + (v1 - v0) * (j + 1) / m, a0 = ptAt(t0, va), a1 = ptAt(t1, va), b0 = ptAt(t0, vb), b1 = ptAt(t1, vb);
    [[a0, a1, b1], [a0, b1, b0]].forEach((q) => { const g = V.cross(V.sub(q[1], q[0]), V.sub(q[2], q[0])), cen = V.mul(V.add(V.add(q[0], q[1]), q[2]), 1 / 3), th = Math.atan2(V.dot(V.sub(cen, c), rim.y), V.dot(V.sub(cen, c), rim.x)), out = V.sub(cen, ptAt(th, PI * 0 + (v0 + v1) / 2 > 0 ? 0 : 0)) ; void out; const cc = V.sub(cen, V.add(tc, V.mul(V.norm(V.sub(V.sub(cen, tc), V.mul(n, V.dot(V.sub(cen, tc), n)))), Rt))); soup.push({ pts: V.dot(g, cc) >= 0 ? q : [q[0], q[2], q[1]], tag: Fn }); });
  } }
  const nb = new Body(body.faces.map((x) => x === Fp ? Fp2 : x === Fc ? Fc2 : x).concat([Fn]));
  const mp = massProps(nb), v0s = Math.abs(soupVolume(S0)), vs = soupVolume(soup);
  if (!(mp.volume > 0) || !(mp.volume < (ev.mp ? ev.mp.volume : massProps(body).volume) - 1e-12) || Math.abs(mp.volume - vs) > 0.03 * mp.volume) throw new Error('the rounded body failed its volume check (' + mp.volume + ' vs ' + vs + ')');
  void v0s; const node = mkNode('brep', { body: nb }); node.soupFixed = soup; return node;
}
const kernel = {
  name: 'AakarKernel', version: AK.version, isAakarKernel: true,
  // --- primitives (the placement convention matches the Aakar replay: box corner and cylinder / cone base on the origin, sphere centred on it)
  box: (w, d, h) => prim(mkBox(pos(w, 'width'), pos(d, 'depth'), pos(h, 'height'))),
  cylinder: (r, h) => prim(mkCone(pos(r, 'radius'), r, pos(h, 'height'))),
  cone: (r, rt, h) => prim(mkCone(pos(r, 'radius'), Math.max(0, num(rt || 0, 'top radius')), pos(h, 'height'))),
  sphere: (r) => prim(mkSphere(pos(r, 'radius'))),
  faces: (h) => evalExact(h).body.faces.map((f) => ({ kind: f.surf.kind, o: f.surf.o.slice(), x: f.surf.x.slice(), z: f.surf.z.slice(), r: f.surf.r, R: f.surf.R, k: f.surf.k, rev: !!f.rev })),
  /** full boundary of every face (for direct editing): loops of coedges in traversal order, each { id, fwd, kind:'line'|'circle'|'poly', p0, p1 (in traversal order), c,n,r,a0,a1 (circle) }, plus the outward normal of planar faces */
  faceLoops: (h) => evalExact(h).body.faces.map((f, i) => {
    const s = f.surf, o = { i, kind: s.kind, rev: !!f.rev, o: s.o.slice(), x: s.x.slice(), z: s.z.slice(), r: s.r, R: s.R, k: s.k, vrange: f.vrange ? f.vrange.slice() : null };
    if (s.kind === 'plane') o.n = (f.rev ? V.neg(s.z) : s.z).slice();
    o.loops = f.loops.map((L) => L.map((ce) => { const e = ce.edge, a = ce.fwd ? e.v0.p : e.v1.p, b = ce.fwd ? e.v1.p : e.v0.p, d = { id: e.id, fwd: !!ce.fwd, kind: e.kind, p0: a.slice(), p1: b.slice(), closed: e.v0 === e.v1 };
      if (e.kind === 'circle') { d.c = e.c.slice(); d.n = V.norm(V.cross(e.x, e.y)); d.r = e.r; d.a0 = e.a0; d.a1 = e.a1; d.ex = e.x.slice(); d.ey = e.y.slice(); } if (e.kind === 'poly') d.pts = e.pts.map((q) => q.slice()); return d; }));
    return o; }),
  revolve: (loops, ang) => prim(mkRevolve(loops, ang)),
  extrude: (loops, h) => prim(mkExtrude(loops, pos(h, 'height'))),
  polyhedron: (verts, faces) => prim(mkPolyh(verts, faces)),
  roundRim: (h, spec, f) => roundRimSurgery(h, spec, f),
  transform: (hnd, Rm, t) => mkNode('xf', { child: hnd, T: new Xf(Rm.slice(), t.slice()) }),
  torus: (R, r) => { if (!(r > 0 && R > r)) throw new Error('torus needs 0 < minor radius < major radius'); return prim(mkTorus(R, r)); },
  // --- transforms
  translate: (h, v) => mkNode('xf', { child: h, T: Xf.translate(v) }),
  rotate: (h, axis, angle, center) => mkNode('xf', { child: h, T: Xf.rotate(axis, angle, center) }),
  scale: (h, s, center) => mkNode('xf', { child: h, T: Xf.scale(pos(s, 'scale'), center) }),
  // --- booleans (evaluated lazily; any failure throws so that the caller can fall back)
  fuse: (a, b) => mkNode('bool', { op: 'union', a, b }),
  cut: (a, b) => mkNode('bool', { op: 'subtract', a, b }),
  common: (a, b) => mkNode('bool', { op: 'intersect', a, b }),
  // --- measurement (exact: Green's theorem on the true surfaces)
  volume: (h) => evalExact(h).mp.volume,
  area: (h) => evalExact(h).mp.area,
  massProps: (h) => evalExact(h).mp,
  validate: (h) => validate(evalExact(h).body),
  bbox: (h) => { const ev = evalExact(h); if (ev.soup && ev.soup.length) return soupBBox(ev.soup); return ev.body.bbox(); },   // tight (tessellation) bounds; the analytic bound is only a fallback for imported bodies
  contains: (h, p) => containsPoint(h, p),
  /** structure of the exact B-rep: faces by surface type, edges by curve type */
  info: (h) => { const ev = evalExact(h), faces = {}, edges = {}; ev.body.faces.forEach(f => { faces[f.surf.kind] = (faces[f.surf.kind] || 0) + 1; }); ev.body.edges().forEach(e => { edges[e.kind] = (edges[e.kind] || 0) + 1; }); return { faces, edges, faceCount: ev.body.faces.length, edgeCount: ev.body.edges().length, vertexCount: ev.body.vertices().length, approximateFaces: ev.mp.approximateFaces || 0 }; },
  /** triangle mesh whose vertices lie on the exact surfaces; `faces[i]` is the B-rep face of triangle i */
  mesh: (h, tol) => toMesh(evaluate(h, meshRes(tol))),
  meshInfo: (h, tol) => { const ev = evaluate(h, meshRes(tol)); return { mesh: toMesh(ev), faces: ev.body.faces.map((f) => ({ kind: f.surf.kind, o: f.surf.o.slice(), x: f.surf.x.slice(), z: f.surf.z.slice(), r: f.surf.r, R: f.surf.R, k: f.surf.k, rev: !!f.rev })) }; },
  // --- exchange
  stepExport: (h, opts) => stepWrite([evalExact(h).body], opts),
  /** several bodies in one STEP file (one shape each) */
  stepExportAll: (hs, opts) => stepWrite(hs.map((h) => evalExact(h).body), opts),
  stepImport: (text) => { const L = stepRead(typeof text === 'string' ? text : new TextDecoder().decode(text)); return mkNode('brep', { body: L[0].body, name: L[0].name }); },
  stepImportAll: (text) => stepRead(typeof text === 'string' ? text : new TextDecoder().decode(text), AK.__stepTol ? { tolerant: true } : undefined).map(x => mkNode('brep', { body: x.body, name: x.name }))
};
AK.kernel = kernel;
AK.init = () => Promise.resolve(kernel);
AK.Node = Node;
