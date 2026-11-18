// ---------------------------------------------------------------- primitives: exact B-rep + conforming tessellation
// Periodic faces (cylinder / cone / sphere / torus) are stored without seam edges: their loops are the true boundary curves only.
function polyBody(verts, faces) {
  const vs = verts.map(p => new Vertex(p.slice())), edges = new Map(), out = [];
  const E = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; let e = edges.get(k); if (!e) { e = new Edge('line', vs[Math.min(a, b)], vs[Math.max(a, b)]); edges.set(k, e); } return e; };
  faces.forEach(f => {
    const pts = f.map(i => verts[i]), n = V.norm(newell(pts)), fr = frame(pts[0], n, V.sub(pts[1], pts[0]));
    const loop = f.map((a, i) => { const b = f[(i + 1) % f.length], e = E(a, b); return { edge: e, fwd: e.v0 === vs[a] }; });
    out.push(new Face(new Plane(fr), false, [loop]));
  });
  return new Body(out);
}
/** deflection allowed for a circle of radius r under the resolution request */
const resTol = (res, r) => Math.min(res.tol == null ? Infinity : res.tol, res.rel * r);
const fan = (pts, tag) => { const o = []; for (let i = 1; i + 1 < pts.length; i++) o.push({ pts: [pts[0], pts[i], pts[i + 1]], tag }); return o; };
const ring = (c, r, z, n, ph) => { const o = []; for (let k = 0; k < n; k++) { const a = TAU * k / n + (ph || 0); o.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z]); } return o; };

function mkBox(w, d, h) {
  const v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]];
  const body = polyBody(v, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [3, 0, 4, 7], [1, 2, 6, 5]]);
  const idx = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [3, 0, 4, 7], [1, 2, 6, 5]];
  return { body, inside: (p) => p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= d && p[2] >= 0 && p[2] <= h, tess: () => { const o = []; idx.forEach((f, i) => o.push(...fan(f.map(j => v[j]), body.faces[i]))); return o; } };
}
/** planar polyhedron: verts [[x,y,z]], faces [{n:[x,y,z] outward, loops:[[i,...],...]}] (first loop outer). True planes, true straight edges. */
function mkPolyh(verts, faces) {
  const vs = verts.map(p => new Vertex(p.slice())), edges = new Map(), out = [], pl = [];
  const E = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; let e = edges.get(k); if (!e) { e = new Edge('line', vs[Math.min(a, b)], vs[Math.max(a, b)]); edges.set(k, e); } return e; };
  faces.forEach(f => {
    if (!f.loops || !f.loops.length) throw new Error('a face without a loop');
    const n = V.norm(f.n); if (!(V.len(n) > 0.5)) throw new Error('a face without a normal');
    const loops = f.loops.map((l, li) => {
      if (l.length < 3) throw new Error('a loop with fewer than 3 vertices');
      const d = V.dot(newell(l.map(i => verts[i])), n); let L = l.slice();
      if ((li === 0 && d < 0) || (li > 0 && d > 0)) L = L.reverse(); return L;
    });
    const p0 = verts[loops[0][0]], p1 = verts[loops[0][1]], fr = frame(p0, n, V.sub(p1, p0));
    const cl = loops.map(L => L.map((a, i) => { const b = L[(i + 1) % L.length], e = E(a, b); return { edge: e, fwd: e.v0 === vs[a] }; }));
    const face = new Face(new Plane(fr), false, cl); out.push(face); pl.push({ face, fr, loops });
  });
  const body = new Body(out);
  return { body, inside: () => false, tess: () => {
    const o = [], EC = G.CAD && G.CAD.solid && G.CAD.solid.earcut;
    pl.forEach(({ face, fr, loops }) => {
      if (loops.length === 1 && loops[0].length === 3) { const q = loops[0].map(i => verts[i]); o.push({ pts: q, tag: face }); return; }
      if (!EC) { const q = loops[0].map(i => verts[i]); o.push(...fan(q, face)); return; }
      const all = [], idx = [], P3 = [];
      loops.forEach(L => { const ids = []; L.forEach(i => { ids.push(all.length); const p = verts[i]; P3.push(p); all.push([V.dot(V.sub(p, fr.o), fr.x), V.dot(V.sub(p, fr.o), fr.y)]); }); idx.push(ids); });
      EC(idx, (i) => all[i]).forEach(t => { let a = t[0], b = t[1], c = t[2]; const ar = (all[b][0] - all[a][0]) * (all[c][1] - all[a][1]) - (all[b][1] - all[a][1]) * (all[c][0] - all[a][0]); if (ar < 0) { const x = b; b = c; c = x; } o.push({ pts: [P3[a], P3[b], P3[c]], tag: face }); });
    });
    return o;
  } };
}
/** cylinder (rt === r) or frustum / cone (rt < r, rt may be 0), axis +z, base on z = 0 */
function mkCone(r, rt, h) {
  const apex = rt < 1e-12 * Math.max(r, 1);
  const k = ((apex ? 0 : rt) - r) / h;
  const bot = new Plane(frame([0, 0, 0], [0, 0, -1], [1, 0, 0]));
  const side = Math.abs(k) < 1e-12 ? new Cylinder(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), r) : new Cone(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), r, k);
  const eb = makeCircleEdge([0, 0, 0], [0, 0, 1], [1, 0, 0], r, 0, TAU);
  const botF = new Face(bot, false, [[{ edge: eb, fwd: false }]]);
  let topF = null, sideF, et = null;
  if (!apex) {
    et = makeCircleEdge([0, 0, h], [0, 0, 1], [1, 0, 0], rt, 0, TAU);
    topF = new Face(new Plane(frame([0, 0, h], [0, 0, 1], [1, 0, 0])), false, [[{ edge: et, fwd: true }]]);
    sideF = new Face(side, false, [[{ edge: eb, fwd: true }], [{ edge: et, fwd: false }]]);
  } else sideF = new Face(side, false, [[{ edge: eb, fwd: true }]]);
  const body = new Body(topF ? [botF, topF, sideF] : [botF, sideF]);
  return { body, inside: (p) => p[2] >= 0 && p[2] <= h && Math.hypot(p[0], p[1]) <= r + k * p[2], tess: (res) => {
    const n = circleSegs(Math.max(r, rt), resTol(res, Math.max(r, rt)), res.minN), B = ring([0, 0], r, 0, n), o = [];
    for (let i = 0; i < n; i++) o.push({ pts: [[0, 0, 0], B[(i + 1) % n], B[i]], tag: botF });
    if (apex) { const A = [0, 0, h]; for (let i = 0; i < n; i++) o.push({ pts: [B[i], B[(i + 1) % n], A], tag: sideF }); }
    else {
      const T = ring([0, 0], rt, h, n);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; o.push({ pts: [B[i], B[j], T[j]], tag: sideF }, { pts: [B[i], T[j], T[i]], tag: sideF }, { pts: [[0, 0, h], T[i], T[j]], tag: topF }); }
    }
    return o;
  } };
}
function mkSphere(r) {
  const face = new Face(new Sphere(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), r), false, []), body = new Body([face]);
  return { body, inside: (p) => V.len(p) <= r, tess: (res) => {
    const n = circleSegs(r, resTol(res, r), Math.max(res.minN, 24)), m = Math.max(6, n / 2), o = [], rings = [];
    for (let j = 1; j < m; j++) { const ph = -PI / 2 + PI * j / m; rings.push(ring([0, 0], r * Math.cos(ph), r * Math.sin(ph), n)); }
    const S = [0, 0, -r], N = [0, 0, r];
    for (let k = 0; k < n; k++) { const q = (k + 1) % n; o.push({ pts: [S, rings[0][q], rings[0][k]], tag: face }); o.push({ pts: [N, rings[m - 2][k], rings[m - 2][q]], tag: face }); }
    for (let j = 0; j + 1 < rings.length; j++) for (let k = 0; k < n; k++) { const q = (k + 1) % n, A = rings[j], B = rings[j + 1]; o.push({ pts: [A[k], A[q], B[q]], tag: face }, { pts: [A[k], B[q], B[k]], tag: face }); }
    return o;
  } };
}
function mkTorus(R, r) {
  const face = new Face(new Torus(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), R, r), false, []), body = new Body([face]);
  return { body, inside: (p) => Math.hypot(Math.hypot(p[0], p[1]) - R, p[2]) <= r, tess: (res) => {
    const nu = circleSegs(R + r, resTol(res, R + r), Math.max(res.minN, 24)), nv = circleSegs(r, resTol(res, r), Math.max(res.minN, 16)), o = [], P = [];
    for (let i = 0; i < nu; i++) { P.push([]); const u = TAU * i / nu; for (let j = 0; j < nv; j++) { const v = TAU * j / nv; P[i].push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]); } }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const i2 = (i + 1) % nu, j2 = (j + 1) % nv; o.push({ pts: [P[i][j], P[i2][j], P[i2][j2]], tag: face }, { pts: [P[i][j], P[i2][j2], P[i][j2]], tag: face }); }
    return o;
  } };
}

/** prism of a planar profile along +z from 0 to h.  loops[0] is the outer outline, the others are holes; each loop is a list of
 *  { k:'l', a:[x,y], b:[x,y] } | { k:'a', c:[x,y], r, a0, a1 } (signed sweep a0 -> a1 in travel direction) | { k:'c', c:[x,y], r } (a whole circle).
 *  Faces are true planes and true cylinders, edges are true lines and circles; nothing is faceted except the picture (tess). */
function mkExtrude(loopsIn, h) {
  const TAUx = 2 * Math.PI, cs = (a) => [Math.cos(a), Math.sin(a)];
  const segStart = (s) => s.k === 'l' ? s.a : s.k === 'a' ? [s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)] : [s.c[0] + s.r, s.c[1]];
  const sampleSeg = (s, n) => { if (s.k === 'l') return [s.a.slice()]; const o = []; if (s.k === 'a') { for (let i = 0; i < n; i++) { const t = s.a0 + (s.a1 - s.a0) * i / n; o.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); } } else for (let i = 0; i < n; i++) { const t = TAUx * i / n; o.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); } return o; };
  const area = (segs, fine) => { const P = []; segs.forEach(s => sampleSeg(s, s.k === 'l' ? 1 : (s.k === 'c' ? 256 : Math.max(8, Math.ceil(256 * Math.abs(s.a1 - s.a0) / TAUx)))).forEach(p => P.push(p))); if (segs.length === 1 && segs[0].k === 'c') { const A = Math.PI * segs[0].r * segs[0].r; return segs[0].cw ? -A : A; } let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const flip = (segs) => segs.slice().reverse().map(s => s.k === 'l' ? { k: 'l', a: s.b, b: s.a } : s.k === 'a' ? { k: 'a', c: s.c, r: s.r, a0: s.a1, a1: s.a0 } : { k: 'c', c: s.c, r: s.r, cw: !s.cw });
  const loops = loopsIn.map((L, li) => {
    let segs = L.segs.map(s => s.k === 'l' ? { k: 'l', a: s.a.slice(), b: s.b.slice() } : s.k === 'a' ? { k: 'a', c: s.c.slice(), r: s.r, a0: s.a0, a1: s.a1 } : { k: 'c', c: s.c.slice(), r: s.r, cw: !!s.cw });
    if (segs.length === 1 && segs[0].k === 'c') { segs[0].cw = li > 0; return segs; }
    const a = area(segs); if ((li === 0 && a < 0) || (li > 0 && a > 0)) segs = flip(segs); return segs;
  });
  if (!loops.length || loops.some(L => !L.length)) throw new Error('extrude needs at least one closed loop');
  const fB = new Plane(frame([0, 0, 0], [0, 0, -1], [1, 0, 0])), fT = new Plane(frame([0, 0, h], [0, 0, 1], [1, 0, 0]));
  const botLoops = [], topLoops = [], sideFaces = [], faceOfSeg = [];
  loops.forEach((segs) => {
    const m = segs.length, Vb = segs.map(s => { const p = segStart(s); return new Vertex([p[0], p[1], 0]); }), Vt = segs.map(s => { const p = segStart(s); return new Vertex([p[0], p[1], h]); });
    const Eb = [], Et = [], VE = [];
    segs.forEach((s, k) => {
      const k2 = (k + 1) % m;
      if (s.k === 'l') { Eb.push(new Edge('line', Vb[k], Vb[k2])); Et.push(new Edge('line', Vt[k], Vt[k2])); }
      else if (s.k === 'a') { Eb.push(makeCircleEdge([s.c[0], s.c[1], 0], [0, 0, 1], [1, 0, 0], s.r, s.a0, s.a1, Vb[k], Vb[k2])); Et.push(makeCircleEdge([s.c[0], s.c[1], h], [0, 0, 1], [1, 0, 0], s.r, s.a0, s.a1, Vt[k], Vt[k2])); }
      else { Eb.push(makeCircleEdge([s.c[0], s.c[1], 0], [0, 0, 1], [1, 0, 0], s.r, 0, TAUx, Vb[k])); Et.push(makeCircleEdge([s.c[0], s.c[1], h], [0, 0, 1], [1, 0, 0], s.r, 0, TAUx, Vt[k])); }
      VE.push(s.k === 'c' ? null : new Edge('line', Vb[k], Vt[k]));
    });
    const faces = [];
    segs.forEach((s, k) => {
      const k2 = (k + 1) % m; let f;
      if (s.k === 'l') { const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy); if (!(L > 0)) throw new Error('zero-length profile edge'); f = new Face(new Plane(frame([s.a[0], s.a[1], 0], [dy / L, -dx / L, 0], [dx, dy, 0])), false, [[{ edge: Eb[k], fwd: true }, { edge: VE[k2], fwd: true }, { edge: Et[k], fwd: false }, { edge: VE[k], fwd: false }]]); }
      else if (s.k === 'a') f = new Face(new Cylinder(frame([s.c[0], s.c[1], 0], [0, 0, 1], [1, 0, 0]), s.r), s.a1 < s.a0, [[{ edge: Eb[k], fwd: true }, { edge: VE[k2], fwd: true }, { edge: Et[k], fwd: false }, { edge: VE[k], fwd: false }]]);
      else f = new Face(new Cylinder(frame([s.c[0], s.c[1], 0], [0, 0, 1], [1, 0, 0]), s.r), !!s.cw, [[{ edge: Eb[k], fwd: !s.cw }], [{ edge: Et[k], fwd: !!s.cw }]]);
      sideFaces.push(f); faces.push(f);
    });
    faceOfSeg.push(faces);
    botLoops.push(segs.map((s, k) => ({ edge: Eb[segs.length - 1 - k], fwd: segs[segs.length - 1 - k].k === 'c' ? !!segs[segs.length - 1 - k].cw : false })));
    topLoops.push(segs.map((s, k) => ({ edge: Et[k], fwd: s.k === 'c' ? !s.cw : true })));
  });
  const botF = new Face(fB, false, botLoops), topF = new Face(fT, false, topLoops), body = new Body([botF, topF].concat(sideFaces));
  const insideXY = (p, res) => { let c = 0; loops.forEach(segs => { const P = []; segs.forEach(s => sampleSeg(s, s.k === 'l' ? 1 : 256).forEach(q => P.push(q))); for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c ^= 1; } }); return !!c; };
  return { body, inside: (p) => p[2] >= 0 && p[2] <= h && insideXY(p), tess: (res) => {
    const rings = [], o = [];
    loops.forEach((segs, li) => {
      const P = [], own = [];
      segs.forEach((s, k) => {
        let n = 1; if (s.k !== 'l') { const nFull = circleSegs(s.r, resTol(res, s.r), res.minN); n = s.k === 'c' ? nFull : Math.max(1, Math.ceil(nFull * Math.abs(s.a1 - s.a0) / TAUx - 1e-9)); }
        let q = sampleSeg(s, n); if (s.k === 'c' && s.cw) q = q.map((_, i) => { const t = -TAUx * i / n; return [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]; });
        q.forEach(p => { P.push(p); own.push(sideFaces[faceOfSeg.slice(0, li).reduce((a, b) => a + b.length, 0) + k] ); });
      });
      rings.push({ P, own });
    });
    rings.forEach(({ P, own }) => { const n = P.length; for (let i = 0; i < n; i++) { const j = (i + 1) % n, b0 = [P[i][0], P[i][1], 0], b1 = [P[j][0], P[j][1], 0], t0 = [P[i][0], P[i][1], h], t1 = [P[j][0], P[j][1], h]; o.push({ pts: [b0, b1, t1], tag: own[i] }, { pts: [b0, t1, t0], tag: own[i] }); } });
    const all = [], idx = []; rings.forEach(({ P }) => { const s0 = all.length, ids = []; P.forEach(p => { ids.push(all.length); all.push(p); }); idx.push(ids); });
    const EC = (G.CAD && G.CAD.solid && G.CAD.solid.earcut) || fallbackEC;
    const tris = EC(idx, (i) => all[i]);
    tris.forEach(t => { let A = all[t[0]], B = all[t[1]], C = all[t[2]]; const ar = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); if (ar < 0) { const x = B; B = C; C = x; } o.push({ pts: [[A[0], A[1], h], [B[0], B[1], h], [C[0], C[1], h]], tag: topF }, { pts: [[A[0], A[1], 0], [C[0], C[1], 0], [B[0], B[1], 0]], tag: botF }); });
    return o;
  } };
}

/** solid of revolution of a profile about +z through the origin.  Profile coordinates are [r, z] with r >= 0.
 *  loops[0] is the outer outline, the others are holes; segments { k:'l', a, b } | { k:'a', c, r, a0, a1 } | { k:'c', c, r }.
 *  Every segment becomes one true surface (line: plane / cylinder / cone, arc: sphere / torus); every vertex a true circle edge. */

function mkRevolvePartial(loopsIn, ang) {
  const TAUr = 2 * Math.PI, EPS = 1e-9;
  const pt = (s, t) => s.k === 'l' ? [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t] : [s.c[0] + s.r * Math.cos(s.a0 + (s.a1 - s.a0) * t), s.c[1] + s.r * Math.sin(s.a0 + (s.a1 - s.a0) * t)];
  const A_ = (s) => pt(s, 0), B_ = (s) => pt(s, 1);
  const sample = (s, n) => { const o = []; for (let i = 0; i < n; i++) o.push(pt(s, i / n)); return o; };
  const areaOf = (segs) => { const P = []; segs.forEach(s => sample(s, s.k === 'l' ? 1 : 256).forEach(p => P.push(p))); let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  const flip = (segs) => segs.slice().reverse().map(s => s.k === 'l' ? { k: 'l', a: s.b, b: s.a } : { k: 'a', c: s.c, r: s.r, a0: s.a1, a1: s.a0 });
  if (loopsIn.some(L => L.segs.some(s => s.k === 'c'))) throw new Error('a circle profile needs a full turn');
  const loops = loopsIn.map((L, li) => { let segs = L.segs.map(s => s.k === 'l' ? { k: 'l', a: s.a.slice(), b: s.b.slice() } : { k: 'a', c: s.c.slice(), r: s.r, a0: s.a0, a1: s.a1 }); const a = areaOf(segs); if ((li === 0 && a < 0) || (li > 0 && a > 0)) segs = flip(segs); return segs; });
  loops.forEach(L => L.forEach(s => { [A_(s), B_(s)].forEach(p => { if (p[0] < -1e-7) throw new Error('profile crosses the axis'); }); }));
  const onAxis = (p) => p[0] < 1e-9, R3 = (p, th) => [p[0] * Math.cos(th), p[0] * Math.sin(th), p[1]];
  const verts = new Map(), vtx = (p, w) => { const key = onAxis(p) ? 'a|' + p[1].toPrecision(12) : w + '|' + p[0].toPrecision(12) + '|' + p[1].toPrecision(12); let v = verts.get(key); if (!v) { v = new Vertex(R3(p, w ? ang : 0)); verts.set(key, v); } return v; };
  const arcs = new Map(), arcAt = (p) => { if (onAxis(p)) return null; const key = p[0].toPrecision(12) + '|' + p[1].toPrecision(12); let e = arcs.get(key); if (!e) { e = makeCircleEdge([0, 0, p[1]], [0, 0, 1], [1, 0, 0], p[0], 0, ang, vtx(p, 0), vtx(p, 1)); arcs.set(key, e); } return e; };
  const seams = new Map(), seamAt = (s, w) => {
    const a = A_(s), b = B_(s), axisSeg = onAxis(a) && onAxis(b), key = (s.__id || (s.__id = ++mkRevolvePartial.n)) + '|' + (axisSeg ? 0 : w);
    let e = seams.get(key); if (e) return e; const th = w ? ang : 0, va = vtx(a, w), vb = vtx(b, w);
    if (s.k === 'l') e = new Edge('line', va, vb);
    else { const c = [s.c[0] * Math.cos(th), s.c[0] * Math.sin(th), s.c[1]], nrm = [Math.sin(th), -Math.cos(th), 0]; e = makeCircleEdge(c, nrm, [Math.cos(th), Math.sin(th), 0], s.r, s.a0, s.a1, va, vb); }
    seams.set(key, e); return e;
  };
  const faces = [], tags = [], c0 = [], c1 = [];
  loops.forEach(segs => segs.forEach(s => {
    const a = A_(s), b = B_(s); let surf, rev, ccw = s.k === 'a' && s.a1 > s.a0;
    if (s.k === 'l') {
      const dr = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dr, dz); if (!(L > EPS)) throw new Error('zero-length profile edge');
      if (Math.abs(dr) < 1e-9 * Math.max(1, L)) { if (a[0] < 1e-9) { c0.push({ e: seamAt(s, 0), fwd: true }); c1.push({ e: seamAt(s, 1), fwd: true }); return; } surf = new Cylinder(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), a[0]); rev = dz < 0; }
      else if (Math.abs(dz) < 1e-9 * Math.max(1, L)) { surf = new Plane(frame([0, 0, a[1]], [0, 0, dr > 0 ? -1 : 1], [1, 0, 0])); rev = false; }
      else { const k = dr / dz, ref = a[0] > 1e-9 ? a : b; surf = new Cone(frame([0, 0, ref[1]], [0, 0, 1], [1, 0, 0]), ref[0], k); rev = dz < 0; }
    } else if (Math.abs(s.c[0]) < 1e-9 * Math.max(1, s.r)) { surf = new Sphere(frame([0, 0, s.c[1]], [0, 0, 1], [1, 0, 0]), s.r); rev = !ccw; }
    else { if (!(s.c[0] > s.r + 1e-9)) throw new Error('a toroidal arc must stay off the axis'); surf = new Torus(frame([0, 0, s.c[1]], [0, 0, 1], [1, 0, 0]), s.c[0], s.r); rev = !ccw; }
    const ea = arcAt(a), eb = arcAt(b), lp = [];
    if (ea) lp.push({ edge: ea, fwd: true }); lp.push({ edge: seamAt(s, 1), fwd: true }); if (eb) lp.push({ edge: eb, fwd: false }); lp.push({ edge: seamAt(s, 0), fwd: false });
    const f = new Face(surf, rev, [lp]); if (surf.kind === 'torus') { f.vrange = [Math.min(s.a0, s.a1), Math.max(s.a0, s.a1)]; f.urange = [0, ang]; }
    faces.push(f); tags.push({ f, s }); c0.push({ e: seamAt(s, 0), fwd: true }); c1.push({ e: seamAt(s, 1), fwd: true });
  }));
  // end caps: one planar face per end holding every profile loop
  const loopsOf = (list, rv) => { const out = []; let at = 0; loops.forEach(segs => { const part = list.slice(at, at + segs.length); at += segs.length; out.push(rv ? part.slice().reverse().map(c => ({ edge: c.e, fwd: !c.fwd })) : part.map(c => ({ edge: c.e, fwd: c.fwd }))); }); return out; };
  const capLoops0 = [], capLoops1 = [];
  { // c0/c1 only hold entries for segments that were not skipped; rebuild per loop in order
    let at = 0; loops.forEach(segs => { const n = segs.length; capLoops0.push(c0.slice(at, at + n)); capLoops1.push(c1.slice(at, at + n)); at += n; });
  }
  const cap0 = new Face(new Plane(frame([0, 0, 0], [0, -1, 0], [1, 0, 0])), false, capLoops0.map(L => L.map(c => ({ edge: c.e, fwd: c.fwd }))));
  const cap1 = new Face(new Plane(frame([0, 0, 0], [-Math.sin(ang), Math.cos(ang), 0], [Math.cos(ang), Math.sin(ang), 0])), false, capLoops1.map(L => L.slice().reverse().map(c => ({ edge: c.e, fwd: !c.fwd }))));
  const body = new Body(faces.concat([cap0, cap1]));
  const poly = loops.map(segs => { const P = []; segs.forEach(s => sample(s, s.k === 'l' ? 1 : 256).forEach(p => P.push(p))); return P; });
  const inside = (p) => { let th = Math.atan2(p[1], p[0]); if (th < -1e-12) th += TAUr; if (th > ang + 1e-12) return false; const r = Math.hypot(p[0], p[1]), z = p[2]; let c = 0; poly.forEach(P => { for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && r < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c ^= 1; } }); return !!c; };
  return { body, inside, tess: (res) => {
    let rmax = 0; poly.forEach(P => P.forEach(p => { rmax = Math.max(rmax, p[0]); })); const nu = Math.max(2, Math.ceil(circleSegs(Math.max(rmax, 1e-6), resTol(res, Math.max(rmax, 1e-6)), Math.max(res.minN, 8)) * ang / TAUr - 1e-9)), o = [];
    const ring = (p, i) => R3(p, ang * i / nu), profOf = (s) => { if (s.k === 'l') return [A_(s), B_(s)]; const sw = Math.abs(s.a1 - s.a0), m = Math.max(2, Math.ceil(circleSegs(s.r, resTol(res, s.r), res.minN) * sw / TAUr - 1e-9)), q = []; for (let j = 0; j <= m; j++) q.push(pt(s, j / m)); return q; };
    tags.forEach(({ f, s }) => { const prof = profOf(s);
      for (let j = 0; j + 1 < prof.length; j++) for (let i = 0; i < nu; i++) {
        const a0 = ring(prof[j], i), a1 = ring(prof[j], i + 1), b0 = ring(prof[j + 1], i), b1 = ring(prof[j + 1], i + 1), ra = prof[j][0] < 1e-9, rb = prof[j + 1][0] < 1e-9;
        if (ra && rb) continue; if (ra) o.push({ pts: [a0, b1, b0], tag: f }); else if (rb) o.push({ pts: [a0, a1, b0], tag: f }); else o.push({ pts: [a0, a1, b1], tag: f }, { pts: [a0, b1, b0], tag: f });
      } });
    const all = [], idx = []; loops.forEach(segs => { const ids = []; segs.forEach(s => { const q = profOf(s); q.slice(0, q.length - 1).forEach(p => { ids.push(all.length); all.push(p); }); }); idx.push(ids); });
    const EC = (G.CAD && G.CAD.solid && G.CAD.solid.earcut) || fallbackEC;
    EC(idx, (i) => all[i]).forEach(t => { let A = all[t[0]], B = all[t[1]], C = all[t[2]]; if ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) < 0) { const x = B; B = C; C = x; } o.push({ pts: [R3(A, 0), R3(B, 0), R3(C, 0)], tag: cap0 }, { pts: [R3(A, ang), R3(C, ang), R3(B, ang)], tag: cap1 }); });
    return o;
  } };
}
mkRevolvePartial.n = 0;
function mkRevolve(loopsIn, angIn) {
  if (angIn && angIn < 2 * Math.PI - 1e-9) return mkRevolvePartial(loopsIn, angIn);
  const TAUr = 2 * Math.PI, EPS = 1e-9;
  const pt = (s, t) => s.k === 'l' ? [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t] : (() => { const a = s.k === 'a' ? s.a0 + (s.a1 - s.a0) * t : TAUr * t; return [s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]; })();
  const A_ = (s) => pt(s, 0), B_ = (s) => s.k === 'a' ? pt(s, 1) : s.k === 'l' ? s.b.slice() : pt(s, 0);
  const sample = (s, n) => { const o = []; for (let i = 0; i < n; i++) o.push(pt(s, i / n)); return o; };
  const areaOf = (segs) => { const P = []; segs.forEach(s => sample(s, s.k === 'l' ? 1 : 256).forEach(p => P.push(p))); if (segs.length === 1 && segs[0].k === 'c') return segs[0].cw ? -1 : 1; let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  const flip = (segs) => segs.slice().reverse().map(s => s.k === 'l' ? { k: 'l', a: s.b, b: s.a } : s.k === 'a' ? { k: 'a', c: s.c, r: s.r, a0: s.a1, a1: s.a0 } : { k: 'c', c: s.c, r: s.r, cw: !s.cw });
  const loops = loopsIn.map((L, li) => {
    let segs = L.segs.map(s => s.k === 'l' ? { k: 'l', a: s.a.slice(), b: s.b.slice() } : s.k === 'a' ? { k: 'a', c: s.c.slice(), r: s.r, a0: s.a0, a1: s.a1 } : { k: 'c', c: s.c.slice(), r: s.r, cw: !!s.cw });
    if (segs.length === 1 && segs[0].k === 'c') { segs[0].cw = li > 0; return segs; }
    const a = areaOf(segs); if ((li === 0 && a < 0) || (li > 0 && a > 0)) segs = flip(segs); return segs;
  });
  if (!loops.length) throw new Error('revolve needs a closed profile');
  loops.forEach(L => L.forEach(s => { [A_(s), B_(s)].forEach(p => { if (p[0] < -1e-7) throw new Error('profile crosses the axis'); }); if (s.k !== 'l' && s.c[0] - s.r < -1e-7 && s.c[0] + s.r > 1e-7 && Math.abs(s.c[0]) > 1e-9 * Math.max(1, s.r)) { /* an arc may bulge past the axis only when it is not used there */ } }));
  const circles = new Map(), onAxis = (p) => p[0] < 1e-9;
  const circAt = (p) => { if (onAxis(p)) return null; const key = p[0].toPrecision(12) + '|' + p[1].toPrecision(12); let e = circles.get(key); if (!e) { e = makeCircleEdge([0, 0, p[1]], [0, 0, 1], [1, 0, 0], p[0], 0, TAUr); circles.set(key, e); } return e; };
  const faces = [], tags = [];
  const mk = (surf, rev, a, b, single) => {
    const ea = circAt(a), eb = circAt(b), lp = [];
    if (ea) lp.push([{ edge: ea, fwd: true }]); if (eb) lp.push([{ edge: eb, fwd: false }]);
    return new Face(surf, rev, single ? [] : lp);
  };
  loops.forEach(segs => segs.forEach(s => {
    let f;
    if (s.k === 'c') {
      if (!(s.c[0] > s.r + 1e-9)) throw new Error('a circle profile must stay off the axis');
      f = new Face(new Torus(frame([0, 0, s.c[1]], [0, 0, 1], [1, 0, 0]), s.c[0], s.r), !!s.cw, []);
    } else if (s.k === 'l') {
      const a = s.a, b = s.b, dr = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dr, dz); if (!(L > EPS)) throw new Error('zero-length profile edge');
      if (Math.abs(dr) < 1e-9 * Math.max(1, L)) { if (a[0] < 1e-9) return; f = mk(new Cylinder(frame([0, 0, 0], [0, 0, 1], [1, 0, 0]), a[0]), dz < 0, a, b); }
      else if (Math.abs(dz) < 1e-9 * Math.max(1, L)) f = mk(new Plane(frame([0, 0, a[1]], [0, 0, dr > 0 ? -1 : 1], [1, 0, 0])), false, a, b);
      else { const k = dr / dz, ref = a[0] > 1e-9 ? a : b; f = mk(new Cone(frame([0, 0, ref[1]], [0, 0, 1], [1, 0, 0]), ref[0], k), dz < 0, a, b); }
    } else {
      const ccw = s.a1 > s.a0, a = A_(s), b = B_(s), full = Math.abs(Math.abs(s.a1 - s.a0) - TAUr) < 1e-9;
      if (full) throw new Error('full-circle arc in a loop');
      if (Math.abs(s.c[0]) < 1e-9 * Math.max(1, s.r)) { const both = onAxis(a) && onAxis(b); f = mk(new Sphere(frame([0, 0, s.c[1]], [0, 0, 1], [1, 0, 0]), s.r), !ccw, a, b, both); }
      else { if (!(s.c[0] > s.r + 1e-9)) throw new Error('a toroidal arc must stay off the axis'); f = mk(new Torus(frame([0, 0, s.c[1]], [0, 0, 1], [1, 0, 0]), s.c[0], s.r), !ccw, a, b); f.vrange = [Math.min(s.a0, s.a1), Math.max(s.a0, s.a1)]; }
    }
    faces.push(f); tags.push({ f, s });
  }));
  const body = new Body(faces);
  const poly = loops.map(segs => { const P = []; segs.forEach(s => sample(s, s.k === 'l' ? 1 : 256).forEach(p => P.push(p))); return P; });
  const inside = (p) => { const r = Math.hypot(p[0], p[1]), z = p[2]; let c = 0; poly.forEach(P => { for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && r < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c ^= 1; } }); return !!c; };
  return { body, inside, tess: (res) => {
    let rmax = 0; poly.forEach(P => P.forEach(p => { rmax = Math.max(rmax, p[0]); })); const nu = circleSegs(Math.max(rmax, 1e-6), resTol(res, Math.max(rmax, 1e-6)), Math.max(res.minN, 8)), o = [];
    const ring = (p, i) => { const t = TAUr * i / nu; return [p[0] * Math.cos(t), p[0] * Math.sin(t), p[1]]; };
    tags.forEach(({ f, s }) => {
      let prof;
      if (s.k === 'l') prof = [A_(s), B_(s)];
      else { const R = s.r, sweep = s.k === 'c' ? TAUr : Math.abs(s.a1 - s.a0), m = Math.max(2, Math.ceil(circleSegs(R, resTol(res, R), res.minN) * sweep / TAUr - 1e-9)); prof = []; for (let j = 0; j <= m; j++) prof.push(pt(s, j / m)); }
      for (let j = 0; j + 1 < prof.length; j++) for (let i = 0; i < nu; i++) {
        const a0 = ring(prof[j], i), a1 = ring(prof[j], i + 1), b0 = ring(prof[j + 1], i), b1 = ring(prof[j + 1], i + 1), ra = prof[j][0] < 1e-9, rb = prof[j + 1][0] < 1e-9;
        if (ra && rb) continue; if (ra) o.push({ pts: [a0, b1, b0], tag: f }); else if (rb) o.push({ pts: [a0, a1, b0], tag: f }); else o.push({ pts: [a0, a1, b1], tag: f }, { pts: [a0, b1, b0], tag: f });
      }
    });
    return o;
  } };
}
AK.prim = { box: mkBox, cone: mkCone, sphere: mkSphere, torus: mkTorus, extrude: mkExtrude, revolve: mkRevolve };
