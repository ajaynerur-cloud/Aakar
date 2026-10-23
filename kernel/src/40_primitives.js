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
AK.prim = { box: mkBox, cone: mkCone, sphere: mkSphere, torus: mkTorus };
