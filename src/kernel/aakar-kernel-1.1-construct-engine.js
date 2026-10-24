/* ======================================================================
 * AakarKernel 1.1 · CONSTRUCTION GEOMETRY + CURVE OPERATIONS (pure maths, no DOM)
 *   planes   : offset · angle about an axis · three points · mid-plane / bisector · point+normal · parallel at point
 *              tangent to a cylinder · normal to a curve
 *   axes     : two points · plane ∩ plane · point + plane normal · closest point on an axis
 *   points   : projection on a plane · axis ∩ plane · on a polyline at a fraction
 *   frames   : coordinate systems from an origin, a Z direction and an X direction
 *   curves   : mesh ∩ mesh, mesh ∩ plane (intersection curves), segment chaining, ray projection of curves on meshes,
 *              planar / vector offsets of polylines, resampling, simplification
 * ====================================================================== */
const AKC = (function () {
  'use strict';
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]), madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  };
  V.norm = (a) => { const l = V.len(a); return l < 1e-300 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]; };
  const RAD = Math.PI / 180;

  // ---------------------------------------------------------------- frames, planes
  function basisOf(n) { const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = V.norm(V.cross(a, n)); return { u, v: V.cross(n, u) }; }
  function plane(o, n, uHint) {
    n = V.norm(n); if (V.len(n) < 0.5) throw new Error('Degenerate plane normal');
    let u = null; if (uHint) { const w = V.sub(uHint, V.mul(n, V.dot(uHint, n))); if (V.len(w) > 1e-9) u = V.norm(w); }
    if (!u) u = basisOf(n).u; return { o: o.slice(), n, u, v: V.cross(n, u) };
  }
  function stdPlane(name, off) {
    off = off || 0;
    if (name === 'XZ') return { o: [0, off, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] };
    if (name === 'YZ') return { o: [off, 0, 0], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] };
    return { o: [0, 0, off], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
  }
  const stdAxis = (nm) => ({ o: [0, 0, 0], d: nm === 'X' ? [1, 0, 0] : nm === 'Y' ? [0, 1, 0] : [0, 0, 1] });
  function rotateDir(d, k, ang) { k = V.norm(k); const c = Math.cos(ang), s = Math.sin(ang); return V.add(V.add(V.mul(d, c), V.mul(V.cross(k, d), s)), V.mul(k, V.dot(k, d) * (1 - c))); }
  function rotatePoint(p, ax, ang) { return V.add(ax.o, rotateDir(V.sub(p, ax.o), ax.d, ang)); }
  const planeOffset = (pl, d) => ({ o: V.madd(pl.o, pl.n, d), n: pl.n.slice(), u: pl.u.slice(), v: pl.v.slice() });
  function planeAngle(pl, ax, deg) { const a = deg * RAD; return plane(ax.o, rotateDir(pl.n, ax.d, a), rotateDir(pl.u, ax.d, a)); }
  function planeThrough3(a, b, c) {
    const ab = V.sub(b, a), ac = V.sub(c, a), n = V.cross(ab, ac);
    if (V.len(n) <= 1e-9 * Math.max(1, V.len(ab) * V.len(ac))) throw new Error('The three points are collinear');
    return plane(a, n, ab);
  }
  function planeIntersect(p1, p2) {
    const d = V.cross(p1.n, p2.n), dl = V.len(d); if (dl < 1e-9) return null;
    const h1 = V.dot(p1.n, p1.o), h2 = V.dot(p2.n, p2.o), c = V.dot(p1.n, p2.n), det = 1 - c * c;
    return { o: V.add(V.mul(p1.n, (h1 - h2 * c) / det), V.mul(p2.n, (h2 - h1 * c) / det)), d: V.mul(d, 1 / dl) };
  }
  function planeMid(p1, p2, flip) {
    const x = planeIntersect(p1, p2);
    if (!x) { const dd = V.dot(V.sub(p2.o, p1.o), p1.n) / 2; if (Math.abs(dd) < 1e-12) throw new Error('The two planes coincide'); return plane(V.madd(p1.o, p1.n, dd), p1.n, p1.u); }
    return plane(x.o, V.add(p1.n, flip ? V.mul(p2.n, -1) : p2.n), x.d);
  }
  const planePointNormal = (p, n, uHint) => plane(p, n, uHint);
  const planeParallelAt = (p, pl) => plane(p, pl.n, pl.u);
  function planeTangentCyl(cyl, refPl, deg, flip) {
    let r0 = refPl ? V.sub(refPl.n, V.mul(cyl.d, V.dot(refPl.n, cyl.d))) : null;
    if (!r0 || V.len(r0) < 1e-9) r0 = basisOf(cyl.d).u; r0 = V.norm(r0);
    let r = rotateDir(r0, cyl.d, deg * RAD); if (flip) r = V.mul(r, -1);
    return plane(V.madd(cyl.o, r, cyl.r), r, cyl.d);
  }
  // ---------------------------------------------------------------- axes, points
  function axis2(a, b) { const d = V.sub(b, a); if (V.len(d) < 1e-9) throw new Error('The two points coincide'); return { o: a.slice(), d: V.norm(d) }; }
  const axisPointNormal = (p, pl) => ({ o: p.slice(), d: pl.n.slice() });
  function axisFromPlanes(p1, p2) { const x = planeIntersect(p1, p2); if (!x) throw new Error('The two planes are parallel — they have no intersection line'); return x; }
  const projectPointOnPlane = (p, pl) => V.madd(p, pl.n, -V.dot(V.sub(p, pl.o), pl.n));
  function axisPlanePoint(ax, pl) { const den = V.dot(ax.d, pl.n); if (Math.abs(den) < 1e-12) throw new Error('The axis is parallel to the plane'); return V.madd(ax.o, ax.d, V.dot(V.sub(pl.o, ax.o), pl.n) / den); }
  const closestOnAxis = (p, ax) => V.madd(ax.o, ax.d, V.dot(V.sub(p, ax.o), ax.d));
  function csFrame(o, z, x, flipZ, flipX, rotDeg) {
    z = V.norm(z && V.len(z) > 1e-12 ? z : [0, 0, 1]); if (flipZ) z = V.mul(z, -1);
    let xh = x ? V.sub(x, V.mul(z, V.dot(x, z))) : null;
    if (!xh || V.len(xh) < 1e-9) { xh = V.sub([1, 0, 0], V.mul(z, z[0])); if (V.len(xh) < 1e-6) xh = V.sub([0, 1, 0], V.mul(z, z[1])); }
    let xx = V.norm(xh); if (flipX) xx = V.mul(xx, -1);
    let yy = V.cross(z, xx);
    if (rotDeg) { const a = rotDeg * RAD; xx = rotateDir(xx, z, a); yy = rotateDir(yy, z, a); }
    return { o: o.slice(), x: xx, y: yy, z };
  }
  // ---------------------------------------------------------------- polylines
  function polyLen(P, closed) { let s = 0; for (let i = 0; i + 1 < P.length; i++) s += V.dist(P[i], P[i + 1]); if (closed && P.length > 2) s += V.dist(P[P.length - 1], P[0]); return s; }
  function polyAt(P, t) { // point + unit tangent at fraction t (0..1) of the arc length
    const L = polyLen(P, false); if (!(L > 0)) return { p: P[0].slice(), t: [1, 0, 0] };
    let want = Math.max(0, Math.min(1, t)) * L, acc = 0;
    for (let i = 0; i + 1 < P.length; i++) { const l = V.dist(P[i], P[i + 1]); if (acc + l >= want - 1e-12 || i + 2 === P.length) { const u = l < 1e-12 ? 0 : Math.max(0, Math.min(1, (want - acc) / l)); return { p: V.lerp(P[i], P[i + 1], u), t: V.norm(V.sub(P[i + 1], P[i])) }; } acc += l; }
    return { p: P[P.length - 1].slice(), t: [1, 0, 0] };
  }
  function resample(P, n, closed) {
    if (P.length < 2 || n < 2) return P.map((p) => p.slice());
    const Q = closed && V.dist(P[0], P[P.length - 1]) > 1e-12 ? P.concat([P[0]]) : P, L = polyLen(Q, false); if (!(L > 0)) return P.map((p) => p.slice());
    const out = [Q[0].slice()]; let acc = 0, i = 0;
    for (let k = 1; k < n; k++) { const want = L * k / (n - 1); while (i + 1 < Q.length - 1 && acc + V.dist(Q[i], Q[i + 1]) < want) { acc += V.dist(Q[i], Q[i + 1]); i++; } const l = V.dist(Q[i], Q[i + 1]), u = l < 1e-12 ? 0 : Math.max(0, Math.min(1, (want - acc) / l)); out.push(V.lerp(Q[i], Q[i + 1], u)); }
    return out;
  }
  function denseSamples(P, closed, perSeg) { const Q = []; for (let i = 0; i + 1 < P.length; i++) { for (let k = 0; k < perSeg; k++) Q.push(V.lerp(P[i], P[i + 1], k / perSeg)); } Q.push(P[P.length - 1].slice()); return Q; }
  function simplify(P, tol, closed) { // Douglas-Peucker (open) — closed loops keep their first point
    if (P.length < 3) return P.slice();
    const keep = new Array(P.length).fill(false); keep[0] = keep[P.length - 1] = true; const st = [[0, P.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let dm = -1, im = -1; const ab = V.sub(P[b], P[a]), l2 = V.dot(ab, ab);
      for (let i = a + 1; i < b; i++) { const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, V.dot(V.sub(P[i], P[a]), ab) / l2)), d = V.dist(P[i], V.madd(P[a], ab, t)); if (d > dm) { dm = d; im = i; } }
      if (dm > tol) { keep[im] = true; st.push([a, im], [im, b]); }
    }
    return P.filter((_, i) => keep[i]);
  }
  /** best-fit plane normal of a polyline (Newell); null when the curve is straight */
  function polyNormal(P) {
    let c = [0, 0, 0]; P.forEach((p) => { c = V.add(c, p); }); c = V.mul(c, 1 / P.length);
    let n = [0, 0, 0]; for (let i = 0; i < P.length; i++) { const a = V.sub(P[i], c), b = V.sub(P[(i + 1) % P.length], c); n = V.add(n, V.cross(a, b)); }
    if (V.len(n) < 1e-9) { // open / nearly straight: use the widest triangle against the first chord
      const d0 = V.sub(P[P.length - 1], P[0]); let best = null, bl = 0;
      P.forEach((p) => { const w = V.cross(d0, V.sub(p, P[0])), l = V.len(w); if (l > bl) { bl = l; best = w; } });
      if (!best || bl < 1e-9 * Math.max(1, V.len(d0))) return null; n = best;
    }
    return V.norm(n);
  }
  function offsetPolyline(P, closed, dist, n) {
    const m = P.length; if (m < 2) throw new Error('The curve needs at least two points');
    const seg = (i, j) => V.norm(V.sub(P[j % m], P[i % m])), out = [];
    for (let i = 0; i < m; i++) {
      const hasPrev = closed || i > 0, hasNext = closed || i < m - 1;
      let t0 = hasPrev ? seg((i - 1 + m) % m, i) : null, t1 = hasNext ? seg(i, (i + 1) % m) : null; if (!t0) t0 = t1; if (!t1) t1 = t0;
      const l0 = V.norm(V.cross(n, t0)), l1 = V.norm(V.cross(n, t1)); let bis = V.add(l0, l1); if (V.len(bis) < 1e-9) bis = l0; bis = V.norm(bis);
      const k = Math.max(0.25, V.dot(bis, l0)); out.push(V.madd(P[i], bis, dist / k));
    }
    return out;
  }
  // ---------------------------------------------------------------- mesh intersection
  const bboxOfTri = (t) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) { if (t[i][k] < mn[k]) mn[k] = t[i][k]; if (t[i][k] > mx[k]) mx[k] = t[i][k]; } return { mn, mx }; };
  function triPlaneSeg(a, b, c, pl, eps) {
    const P = [a, b, c], d = P.map((p) => V.dot(V.sub(p, pl.o), pl.n)), pts = [];
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3, di = d[i], dj = d[j]; if (Math.abs(di) <= eps) pts.push(P[i]); if ((di < -eps && dj > eps) || (di > eps && dj < -eps)) pts.push(V.lerp(P[i], P[j], di / (di - dj))); }
    const u = []; pts.forEach((p) => { if (!u.some((q) => V.dist(p, q) <= eps * 4)) u.push(p); });
    return u.length === 2 ? u : null;
  }
  function trisPlaneSegs(tris, pl, eps) { const out = []; tris.forEach((t) => { const s = triPlaneSeg(t[0], t[1], t[2], pl, eps); if (s && V.dist(s[0], s[1]) > eps * 2) out.push(s); }); return out; }
  function triTriSeg(A, B, eps) {
    const nA = V.cross(V.sub(A[1], A[0]), V.sub(A[2], A[0])), lA = V.len(nA); if (lA < 1e-18) return null; const n = V.mul(nA, 1 / lA);
    const s = triPlaneSeg(B[0], B[1], B[2], { o: A[0], n }, eps); if (!s) return null;
    let t0 = 0, t1 = 1; const p = s[0], dq = V.sub(s[1], s[0]);
    for (let i = 0; i < 3; i++) {
      const a = A[i], b = A[(i + 1) % 3], m = V.norm(V.cross(n, V.sub(b, a))), f0 = V.dot(V.sub(p, a), m), f1 = V.dot(V.sub(s[1], a), m);
      if (f0 < -eps && f1 < -eps) return null;
      if (f0 < -eps) t0 = Math.max(t0, (-eps - f0) / (f1 - f0)); else if (f1 < -eps) t1 = Math.min(t1, (-eps - f0) / (f1 - f0));
    }
    if (t1 - t0 <= 1e-9) return null; return [V.madd(p, dq, t0), V.madd(p, dq, t1)];
  }
  function meshMeshSegs(trisA, trisB, eps) {
    if (!trisA.length || !trisB.length) return [];
    const bbB = trisB.map(bboxOfTri), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    bbB.forEach((b) => { for (let k = 0; k < 3; k++) { if (b.mn[k] < mn[k]) mn[k] = b.mn[k]; if (b.mx[k] > mx[k]) mx[k] = b.mx[k]; } });
    const diag = V.len(V.sub(mx, mn)) || 1; let avg = 0; bbB.forEach((b) => { avg += V.len(V.sub(b.mx, b.mn)); }); avg /= bbB.length;
    const cs = Math.max(avg * 1.5, diag / 48), cell = (x, k) => Math.floor((x - mn[k]) / cs), grid = new Map(), big = [];
    const hash = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
    bbB.forEach((b, ti) => {
      const lo = [0, 1, 2].map((k) => cell(b.mn[k], k)), hi = [0, 1, 2].map((k) => cell(b.mx[k], k)), cnt = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
      if (cnt > 600) { big.push(ti); return; }
      for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const h = hash(i, j, k); let a = grid.get(h); if (!a) grid.set(h, a = []); a.push(ti); }
    });
    const out = [], seen = new Int32Array(trisB.length).fill(-1);
    trisA.forEach((A, ai) => {
      const b = bboxOfTri(A), lo = [0, 1, 2].map((k) => Math.max(cell(b.mn[k], k), cell(mn[k], k))), hi = [0, 1, 2].map((k) => Math.min(cell(b.mx[k], k), cell(mx[k], k)));
      const test = (ti) => {
        if (seen[ti] === ai) return; seen[ti] = ai; const bb = bbB[ti];
        for (let k = 0; k < 3; k++) if (bb.mx[k] < b.mn[k] - eps || bb.mn[k] > b.mx[k] + eps) return;
        const s = triTriSeg(A, trisB[ti], eps); if (s) out.push(s);
      };
      const nA = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
      if (nA > 0 && nA <= 600) { for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const a = grid.get(hash(i, j, k)); if (a) a.forEach(test); } }
      else if (nA > 600) { for (let ti = 0; ti < trisB.length; ti++) test(ti); }
      big.forEach(test);
    });
    return out;
  }
  /** join loose segments into polylines; shared end points are merged within `tol` */
  function chainSegs(segs, tol) {
    tol = Math.max(tol || 1e-6, 1e-9); const cs = tol * 2, cells = new Map(), nodes = [];
    const ck = (i, j, k) => i + ',' + j + ',' + k;
    const node = (p) => {
      const ix = Math.floor(p[0] / cs), iy = Math.floor(p[1] / cs), iz = Math.floor(p[2] / cs);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = cells.get(ck(ix + a, iy + b, iz + c)); if (L) for (const id of L) if (V.dist(nodes[id].p, p) <= tol) return id; }
      const id = nodes.length; nodes.push({ p: p.slice(), adj: [] }); const k = ck(ix, iy, iz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(id); return id;
    };
    const edges = [], seenE = new Set();
    segs.forEach(([p, q]) => { const a = node(p), b = node(q); if (a === b) return; const k = a < b ? a + '_' + b : b + '_' + a; if (seenE.has(k)) return; seenE.add(k); const ei = edges.length; edges.push({ a, b, used: false }); nodes[a].adj.push(ei); nodes[b].adj.push(ei); });
    const out = [], walk = (start, e0) => {
      const ids = [start]; let cur = start, e = e0;
      while (e != null) { const E = edges[e]; E.used = true; const nx = E.a === cur ? E.b : E.a; ids.push(nx); cur = nx; e = nodes[cur].adj.find((k) => !edges[k].used); if (nodes[cur].adj.length !== 2 && nodes[cur].adj.length !== 0 && ids.length > 1) { /* junction / end: stop */ if (nodes[cur].adj.length !== 2) e = null; } }
      return ids;
    };
    nodes.forEach((n, id) => { if (n.adj.length === 2) return; n.adj.forEach((e) => { if (!edges[e].used) { const ids = walk(id, e); out.push({ pts: ids.map((i) => nodes[i].p), closed: false }); } }); });
    nodes.forEach((n, id) => { n.adj.forEach((e) => { if (!edges[e].used) { const ids = walk(id, e); out.push({ pts: ids.map((i) => nodes[i].p), closed: ids.length > 2 && ids[0] === ids[ids.length - 1] }); } }); });
    out.forEach((c) => { if (c.closed && c.pts.length > 1 && V.dist(c.pts[0], c.pts[c.pts.length - 1]) <= tol * 2) c.pts.pop(); });
    return out;
  }
  /** join separate polylines end to end (in either direction) when their ends meet within tol */
  function joinPolylines(lines, tol) {
    const L = lines.map((p) => p.slice()).filter((p) => p.length >= 2), out = [];
    while (L.length) {
      let cur = L.shift(), grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < L.length; i++) {
          const q = L[i], a0 = cur[0], a1 = cur[cur.length - 1], b0 = q[0], b1 = q[q.length - 1];
          if (V.dist(a1, b0) <= tol) cur = cur.concat(q.slice(1));
          else if (V.dist(a1, b1) <= tol) cur = cur.concat(q.slice(0, -1).reverse());
          else if (V.dist(a0, b1) <= tol) cur = q.concat(cur.slice(1));
          else if (V.dist(a0, b0) <= tol) cur = q.slice().reverse().concat(cur.slice(1));
          else continue;
          L.splice(i, 1); grew = true; break;
        }
      }
      const closed = cur.length > 3 && V.dist(cur[0], cur[cur.length - 1]) <= tol; if (closed) cur = cur.slice(0, -1);
      out.push({ pts: cur, closed });
    }
    return out;
  }
  // ---------------------------------------------------------------- rays and projection
  function rayTri(o, d, a, b, c) {
    const e1 = V.sub(b, a), e2 = V.sub(c, a), p = V.cross(d, e2), det = V.dot(e1, p); if (Math.abs(det) < 1e-14) return null;
    const inv = 1 / det, t0 = V.sub(o, a), u = V.dot(t0, p) * inv; if (u < -1e-9 || u > 1 + 1e-9) return null;
    const q = V.cross(t0, e1), v = V.dot(d, q) * inv; if (v < -1e-9 || u + v > 1 + 1e-9) return null;
    return V.dot(e2, q) * inv;
  }
  function rayMesh(tris, o, d, both) {
    let best = null;
    for (let i = 0; i < tris.length; i++) { const t = rayTri(o, d, tris[i][0], tris[i][1], tris[i][2]); if (t == null) continue; if (!both && t < -1e-9) continue; if (!best || Math.abs(t) < Math.abs(best.t)) best = { t, tri: i }; }
    return best ? { t: best.t, p: V.madd(o, d, best.t), tri: best.tri } : null;
  }
  /** project polyline samples along dir (or along per-point directions) onto a triangle soup; hits are grouped into polylines (a miss breaks the curve) */
  function projectOnMesh(P, tris, dir, opts) {
    opts = opts || {}; const runs = []; let cur = [];
    for (let i = 0; i < P.length; i++) {
      const d = typeof dir === 'function' ? dir(P[i], i) : dir, h = rayMesh(tris, P[i], d, opts.both !== false);
      if (h) cur.push(h.p); else { if (cur.length) runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur); return runs.filter((r) => r.length >= 2);
  }
  /** triangles of a prism made by sweeping a polyline along +-dir (long enough to act as an extruded sketch surface) */
  function extrusionTris(P, closed, dir, half) {
    const d = V.norm(dir), tris = [], n = closed ? P.length : P.length - 1;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % P.length], a0 = V.madd(a, d, -half), a1 = V.madd(a, d, half), b0 = V.madd(b, d, -half), b1 = V.madd(b, d, half); tris.push([a0, b0, b1], [a0, b1, a1]); }
    return tris;
  }
  const bboxOfPts = (pts) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; pts.forEach((p) => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }); return { mn, mx }; };

  return {
    V, basisOf, plane, stdPlane, stdAxis, rotateDir, rotatePoint, planeOffset, planeAngle, planeThrough3, planeIntersect, planeMid, planePointNormal, planeParallelAt, planeTangentCyl,
    axis2, axisPointNormal, axisFromPlanes, projectPointOnPlane, axisPlanePoint, closestOnAxis, csFrame,
    polyLen, polyAt, resample, denseSamples, simplify, polyNormal, offsetPolyline,
    triPlaneSeg, trisPlaneSegs, triTriSeg, meshMeshSegs, chainSegs, joinPolylines, rayTri, rayMesh, projectOnMesh, extrusionTris, bboxOfPts, bboxOfTri
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AKC;
