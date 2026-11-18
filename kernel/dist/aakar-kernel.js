/* ===========================================================================
 * AakarKernel 1.0 — exact-surface boundary-representation kernel (pure JS, no dependencies)
 *   geometry : Plane · Cylinder · Cone · Sphere · Torus (analytic)  +  Line · Circle · Poly edge curves
 *   topology : Body → Face (trimmed surface, loops) → Coedge → Edge → Vertex, with validation
 *   modelling: primitives · rigid/uniform-scale transforms · boolean union / subtract / intersect
 *   analysis : exact mass properties by Green's theorem on the true surfaces (volume, area, centroid, inertia)
 *   exchange : STEP AP214 (ISO 10303-21) writer and reader for analytic B-reps
 * ========================================================================= */
(function (G) {
'use strict';
const AK = {};
const TAU = 2 * Math.PI, PI = Math.PI;
// ---------------------------------------------------------------- vectors
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return l > 1e-300 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
  neg: (a) => [-a[0], -a[1], -a[2]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
};
/** any unit vector perpendicular to n */
function perp(n) { const a = Math.abs(n[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0]; return V.norm(V.cross(n, a)); }
/** right-handed frame from z (and optional x hint) */
function frame(o, z, xh) {
  z = V.norm(z); let x;
  if (xh) { x = V.sub(xh, V.mul(z, V.dot(xh, z))); if (V.len(x) < 1e-9) x = perp(z); else x = V.norm(x); } else x = perp(z);
  const y = V.cross(z, x); return { o: o.slice(), x, y, z };
}
const newell = (pts) => { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); } return n; };
// ---------------------------------------------------------------- Gauss-Legendre
const GL = {};
function gauss(n) {
  if (GL[n]) return GL[n];
  const x = [], w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos(PI * (i + 0.75) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); }
      pp = n * (z * p1 - p2) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
  }
  return (GL[n] = { x, w });
}
// ---------------------------------------------------------------- rigid + uniform-scale transform
class Xf {
  /** r: 9 numbers row-major (rotation × scale), t: translation */
  constructor(r, t) { this.r = r || [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.t = t || [0, 0, 0]; }
  get s() { const r = this.r; return Math.cbrt(Math.abs(r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]))); }
  p(a) { const r = this.r, t = this.t; return [r[0] * a[0] + r[1] * a[1] + r[2] * a[2] + t[0], r[3] * a[0] + r[4] * a[1] + r[5] * a[2] + t[1], r[6] * a[0] + r[7] * a[1] + r[8] * a[2] + t[2]]; }
  d(a) { const r = this.r; return [r[0] * a[0] + r[1] * a[1] + r[2] * a[2], r[3] * a[0] + r[4] * a[1] + r[5] * a[2], r[6] * a[0] + r[7] * a[1] + r[8] * a[2]]; }
  det() { const r = this.r; return r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]); }
  compose(o) { /* this ∘ o */ const a = this.r, b = o.r, r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]; return new Xf(r, this.p(o.t)); }
  static translate(v) { return new Xf(null, v.slice()); }
  static rotate(axis, ang, center) {
    const k = V.norm(axis), c = Math.cos(ang), s = Math.sin(ang), C = 1 - c, [x, y, z] = k;
    const r = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
    const m = new Xf(r, [0, 0, 0]); if (center) { const t = V.sub(center, m.d(center)); m.t = t; } return m;
  }
  static scale(s, center) { const m = new Xf([s, 0, 0, 0, s, 0, 0, 0, s], [0, 0, 0]); if (center) m.t = V.sub(center, m.d(center)); return m; }
}
AK.V = V; AK.Xf = Xf; AK.gauss = gauss; AK.TAU = TAU;

// ---------------------------------------------------------------- surfaces (analytic, each with its own right-handed frame)
let SID = 0;
class Surface {
  constructor(kind, fr) { this.kind = kind; this.o = fr.o; this.x = fr.x; this.y = fr.y; this.z = fr.z; this.id = ++SID; }
  loc(p) { const d = V.sub(p, this.o); return [V.dot(d, this.x), V.dot(d, this.y), V.dot(d, this.z)]; }
  locd(d) { return [V.dot(d, this.x), V.dot(d, this.y), V.dot(d, this.z)]; }
  glob(l) { return [this.o[0] + l[0] * this.x[0] + l[1] * this.y[0] + l[2] * this.z[0], this.o[1] + l[0] * this.x[1] + l[1] * this.y[1] + l[2] * this.z[1], this.o[2] + l[0] * this.x[2] + l[1] * this.y[2] + l[2] * this.z[2]]; }
  gdir(l) { return [l[0] * this.x[0] + l[1] * this.y[0] + l[2] * this.z[0], l[0] * this.x[1] + l[1] * this.y[1] + l[2] * this.z[1], l[0] * this.x[2] + l[1] * this.y[2] + l[2] * this.z[2]]; }
  frameXf(T) { const o = T.p(this.o), s = T.s, x = V.norm(T.d(this.x)), z = V.norm(T.d(this.z)); return { o, x, y: V.cross(z, x), z, s }; }
  /** Newton projection onto the surface (f is a true or near-true signed distance) */
  project(p, it) { let q = p; for (let i = 0; i < (it || 10); i++) { const f = this.f(q); if (Math.abs(f) < 1e-14 * (1 + V.len(q))) break; q = V.madd(q, this.grad(q), -f); } return q; }
  normalAt(p) { return this.grad(p); }
}
class Plane extends Surface {
  constructor(fr) { super('plane', fr); }
  D(u, v) { return { p: V.add(this.o, V.add(V.mul(this.x, u), V.mul(this.y, v))), n: this.z.slice() }; }
  f(p) { return V.dot(V.sub(p, this.o), this.z); }
  grad() { return this.z; }
  uv(p) { const l = this.loc(p); return [l[0], l[1]]; }
  duv(p, dp) { const l = this.loc(p), d = this.locd(dp); return [l[0], l[1], d[0], d[1]]; }
  xf(T) { return new Plane(this.frameXf(T)); }
  same(o) { return o.kind === 'plane' && Math.abs(V.dot(this.z, o.z)) > 1 - 1e-9; }
  get periodicU() { return false; }
}
class Cylinder extends Surface {
  constructor(fr, r) { super('cylinder', fr); this.r = r; }
  D(u, v) { const c = Math.cos(u), s = Math.sin(u), r = this.r; return { p: V.add(this.o, V.add(V.add(V.mul(this.x, r * c), V.mul(this.y, r * s)), V.mul(this.z, v))), n: V.add(V.mul(this.x, r * c), V.mul(this.y, r * s)) }; }
  f(p) { const l = this.loc(p); return Math.hypot(l[0], l[1]) - this.r; }
  grad(p) { const l = this.loc(p), h = Math.hypot(l[0], l[1]); if (h < 1e-14) return this.x.slice(); return this.gdir([l[0] / h, l[1] / h, 0]); }
  uv(p) { const l = this.loc(p); return [Math.atan2(l[1], l[0]), l[2]]; }
  duv(p, dp) { const l = this.loc(p), d = this.locd(dp), h2 = l[0] * l[0] + l[1] * l[1]; return [Math.atan2(l[1], l[0]), l[2], (l[0] * d[1] - l[1] * d[0]) / h2, d[2]]; }
  xf(T) { const fr = this.frameXf(T); return new Cylinder(fr, this.r * fr.s); }
  same(o, tol) { return o.kind === 'cylinder' && Math.abs(this.r - o.r) < tol && Math.abs(V.dot(this.z, o.z)) > 1 - 1e-9 && V.len(V.cross(V.sub(o.o, this.o), this.z)) < tol; }
  get periodicU() { return true; }
}
/** radius at axial height v is r + k·v (k = tan of the half angle); apex at v = -r/k */
class Cone extends Surface {
  constructor(fr, r, k) { super('cone', fr); this.r = r; this.k = k; this.q = Math.sqrt(1 + k * k); }
  get apexV() { return Math.abs(this.k) > 1e-12 ? -this.r / this.k : Infinity; }
  D(u, v) { const c = Math.cos(u), s = Math.sin(u), rho = this.r + this.k * v, e = V.add(V.mul(this.x, c), V.mul(this.y, s)); return { p: V.add(this.o, V.add(V.mul(e, rho), V.mul(this.z, v))), n: V.mul(V.madd(e, this.z, -this.k), rho) }; }
  f(p) { const l = this.loc(p); return (Math.hypot(l[0], l[1]) - this.r - this.k * l[2]) / this.q; }
  grad(p) { const l = this.loc(p), h = Math.hypot(l[0], l[1]); const e = h < 1e-14 ? [1, 0, 0] : [l[0] / h, l[1] / h, 0]; return this.gdir([e[0] / this.q, e[1] / this.q, -this.k / this.q]); }
  uv(p) { const l = this.loc(p); return [Math.atan2(l[1], l[0]), l[2]]; }
  duv(p, dp) { const l = this.loc(p), d = this.locd(dp), h2 = l[0] * l[0] + l[1] * l[1]; return [Math.atan2(l[1], l[0]), l[2], (l[0] * d[1] - l[1] * d[0]) / h2, d[2]]; }
  xf(T) { const fr = this.frameXf(T); return new Cone(fr, this.r * fr.s, this.k); }
  same(o, tol) { return o.kind === 'cone' && Math.abs(Math.abs(this.k) - Math.abs(o.k)) < 1e-9 && Math.abs(V.dot(this.z, o.z)) > 1 - 1e-9 && V.dist(this.apexPt(), o.apexPt()) < tol * 10; }
  apexPt() { return V.madd(this.o, this.z, this.apexV); }
  get periodicU() { return true; }
}
class Sphere extends Surface {
  constructor(fr, r) { super('sphere', fr); this.r = r; }
  D(u, v) { const c = Math.cos(u), s = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), r = this.r, q = V.add(V.mul(V.add(V.mul(this.x, c), V.mul(this.y, s)), cv), V.mul(this.z, sv)); return { p: V.madd(this.o, q, r), n: V.mul(q, r * r * cv) }; }
  f(p) { return V.len(V.sub(p, this.o)) - this.r; }
  grad(p) { const d = V.sub(p, this.o), l = V.len(d); return l < 1e-14 ? this.z.slice() : V.mul(d, 1 / l); }
  uv(p) { const l = this.loc(p); return [Math.atan2(l[1], l[0]), Math.atan2(l[2], Math.hypot(l[0], l[1]))]; }
  duv(p, dp) {
    const l = this.loc(p), d = this.locd(dp), h2 = l[0] * l[0] + l[1] * l[1], h = Math.sqrt(h2), hp = h > 1e-300 ? (l[0] * d[0] + l[1] * d[1]) / h : 0, den = h2 + l[2] * l[2];
    return [Math.atan2(l[1], l[0]), Math.atan2(l[2], h), h2 > 1e-300 ? (l[0] * d[1] - l[1] * d[0]) / h2 : 0, (d[2] * h - l[2] * hp) / den];
  }
  xf(T) { const fr = this.frameXf(T); return new Sphere(fr, this.r * fr.s); }
  same(o, tol) { return o.kind === 'sphere' && Math.abs(this.r - o.r) < tol && V.dist(this.o, o.o) < tol; }
  get periodicU() { return true; }
}
class Torus extends Surface {
  constructor(fr, R, r) { super('torus', fr); this.R = R; this.r = r; }
  D(u, v) { const c = Math.cos(u), s = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v), e = V.add(V.mul(this.x, c), V.mul(this.y, s)), q = V.add(V.mul(e, cv), V.mul(this.z, sv)); return { p: V.add(this.o, V.add(V.mul(e, this.R + this.r * cv), V.mul(this.z, this.r * sv))), n: V.mul(q, this.r * (this.R + this.r * cv)) }; }
  f(p) { const l = this.loc(p); return Math.hypot(Math.hypot(l[0], l[1]) - this.R, l[2]) - this.r; }
  grad(p) { const l = this.loc(p), h = Math.hypot(l[0], l[1]), e = h < 1e-14 ? [1, 0] : [l[0] / h, l[1] / h], a = h - this.R, d = Math.hypot(a, l[2]); if (d < 1e-14) return this.gdir([e[0], e[1], 0]); return this.gdir([e[0] * a / d, e[1] * a / d, l[2] / d]); }
  uv(p) { const l = this.loc(p); return [Math.atan2(l[1], l[0]), Math.atan2(l[2], Math.hypot(l[0], l[1]) - this.R)]; }
  duv(p, dp) { const l = this.loc(p), d = this.locd(dp), h2 = l[0] * l[0] + l[1] * l[1], h = Math.sqrt(h2), hp = h > 1e-300 ? (l[0] * d[0] + l[1] * d[1]) / h : 0, a = h - this.R, den = a * a + l[2] * l[2]; return [Math.atan2(l[1], l[0]), Math.atan2(l[2], a), (l[0] * d[1] - l[1] * d[0]) / h2, (d[2] * a - l[2] * hp) / den]; }
  xf(T) { const fr = this.frameXf(T); return new Torus(fr, this.R * fr.s, this.r * fr.s); }
  same(o, tol) { return o.kind === 'torus' && Math.abs(this.r - o.r) < tol && Math.abs(this.R - o.R) < tol && V.dist(this.o, o.o) < tol && Math.abs(V.dot(this.z, o.z)) > 1 - 1e-9; }
  get periodicU() { return true; }
}
AK.Plane = Plane; AK.Cylinder = Cylinder; AK.Cone = Cone; AK.Sphere = Sphere; AK.Torus = Torus;

/** least-squares projection of p onto the intersection of several surfaces (Gauss-Newton on the signed distances) */
function projectMulti(p, surfs, it, info) {
  const m = surfs.length; if (!m) { if (info) info.err = 0; return p; }
  let q = p.slice();
  for (let k = 0; k < (it || 12); k++) {
    const f = surfs.map(s => s.f(q)), g = surfs.map(s => s.grad(q));
    if (Math.max(...f.map(Math.abs)) < 1e-13 * (1 + V.len(q))) break;
    // minimum-norm step  Δ = -Jᵀ (J Jᵀ + λI)⁻¹ f
    const A = []; for (let i = 0; i < m; i++) { A.push([]); for (let j = 0; j < m; j++) A[i].push(V.dot(g[i], g[j]) + (i === j ? 1e-12 : 0)); }
    const lam = solveSym(A, f); if (!lam) break;
    let d = [0, 0, 0]; for (let i = 0; i < m; i++) d = V.madd(d, g[i], -lam[i]);
    q = V.add(q, d); if (V.len(d) < 1e-15 * (1 + V.len(q))) break;
  }
  if (info) { let e = 0; for (const s of surfs) e = Math.max(e, Math.abs(s.f(q))); info.err = e; }
  return q;
}
function solveSym(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let i = 0; i < n; i++) {
    let piv = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (Math.abs(M[piv][i]) < 1e-9) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / M[i][i]; }
  return x;
}
AK.projectMulti = projectMulti;

// ---------------------------------------------------------------- topology
let VID = 0, EID = 0, FID = 0;
class Vertex { constructor(p) { this.p = p; this.id = ++VID; } }
/** Edge: kind 'line' | 'circle' | 'poly'. Parameter t in [0,1] runs from v0 to v1. */
class Edge {
  constructor(kind, v0, v1, d) { this.kind = kind; this.v0 = v0; this.v1 = v1; this.id = ++EID; Object.assign(this, d || {}); }
  get closed() { return this.v0 === this.v1; }
  pt(t) {
    if (this.kind === 'line') return V.lerp(this.v0.p, this.v1.p, t);
    if (this.kind === 'circle') { const a = this.a0 + (this.a1 - this.a0) * t, c = Math.cos(a) * this.r, s = Math.sin(a) * this.r; return [this.c[0] + this.x[0] * c + this.y[0] * s, this.c[1] + this.x[1] * c + this.y[1] * s, this.c[2] + this.x[2] * c + this.y[2] * s]; }
    const P = this.pts, n = P.length - 1, u = Math.min(Math.max(t, 0), 1) * n, i = Math.min(Math.floor(u), n - 1); return V.lerp(P[i], P[i + 1], u - i);
  }
  dpt(t) {
    if (this.kind === 'line') return V.sub(this.v1.p, this.v0.p);
    if (this.kind === 'circle') { const a = this.a0 + (this.a1 - this.a0) * t, w = (this.a1 - this.a0) * this.r, c = -Math.sin(a) * w, s = Math.cos(a) * w; return [this.x[0] * c + this.y[0] * s, this.x[1] * c + this.y[1] * s, this.x[2] * c + this.y[2] * s]; }
    const P = this.pts, n = P.length - 1, u = Math.min(Math.max(t, 0), 1) * n, i = Math.min(Math.floor(u), n - 1); return V.mul(V.sub(P[i + 1], P[i]), n);
  }
  /** parameter intervals used for numerical integration */
  pieces() {
    if (this.kind === 'line') return [[0, 1]];
    if (this.kind === 'circle') { const n = Math.max(1, Math.ceil(Math.abs(this.a1 - this.a0) / (PI / 8))), o = []; for (let i = 0; i < n; i++) o.push([i / n, (i + 1) / n]); return o; }
    const n = this.pts.length - 1, o = []; for (let i = 0; i < n; i++) o.push([i / n, (i + 1) / n]); return o;
  }
  length() { let L = 0; const g = gauss(8); for (const [a, b] of this.pieces()) for (let i = 0; i < 8; i++) L += g.w[i] * (b - a) / 2 * V.len(this.dpt((a + b) / 2 + (b - a) / 2 * g.x[i])); return L; }
  /** points along the edge: chord/arc deviation at most tol, never fewer than minSeg per full circle */
  sample(tol, minCircle) {
    if (this.kind === 'line') return [this.v0.p.slice(), this.v1.p.slice()];
    if (this.kind === 'circle') { const sweep = Math.abs(this.a1 - this.a0), nFull = circleSegs(this.r, tol, minCircle), n = Math.max(1, Math.ceil(nFull * sweep / TAU - 1e-9)), o = []; for (let i = 0; i <= n; i++) o.push(i === 0 ? this.v0.p.slice() : i === n ? this.v1.p.slice() : this.pt(i / n)); return o; }
    return this.pts.map(p => p.slice());
  }
  xf(T, vmap) {
    const mv = (v) => { let w = vmap.get(v); if (!w) { w = new Vertex(T.p(v.p)); vmap.set(v, w); } return w; };
    const v0 = mv(this.v0), v1 = mv(this.v1);
    if (this.kind === 'line') return new Edge('line', v0, v1);
    if (this.kind === 'circle') { const x = V.norm(T.d(this.x)), y = V.norm(T.d(this.y)); return new Edge('circle', v0, v1, { c: T.p(this.c), x, y, r: this.r * T.s, a0: this.a0, a1: this.a1 }); }
    return new Edge('poly', v0, v1, { pts: this.pts.map(p => T.p(p)) });
  }
}
function circleSegs(r, tol, minN) {
  tol = Math.max(tol || 0, 1e-9 * r); const c = Math.max(0, 1 - tol / r), n = c <= 0 ? 8 : Math.ceil(PI / Math.acos(c));
  return Math.min(256, Math.max(minN || 16, n % 2 ? n + 1 : n));
}
/** a circle through the three frame vectors */
function makeCircleEdge(c, n, xh, r, a0, a1, v0, v1) {
  const fr = frame(c, n, xh);
  const P = (a) => V.add(c, V.add(V.mul(fr.x, r * Math.cos(a)), V.mul(fr.y, r * Math.sin(a))));
  v0 = v0 || new Vertex(P(a0)); v1 = v1 || (Math.abs(a1 - a0 - TAU) < 1e-12 || Math.abs(a1 - a0 + TAU) < 1e-12 ? v0 : new Vertex(P(a1)));
  return new Edge('circle', v0, v1, { c: c.slice(), x: fr.x, y: fr.y, r, a0, a1 });
}
class Face {
  /** loops: arrays of {edge, fwd}; the face normal is the surface normal, reversed when rev is true */
  constructor(surf, rev, loops) { this.surf = surf; this.rev = !!rev; this.loops = loops || []; this.id = ++FID; }
  coedgePts(ce, tol, minC) { const P = ce.edge.sample(tol, minC); return ce.fwd ? P : P.slice().reverse(); }
  loopPts(loop, tol, minC) { const out = []; loop.forEach((ce, i) => { const P = this.coedgePts(ce, tol, minC); for (let k = 0; k < P.length - 1; k++) out.push(P[k]); }); return out; }
  /** unit outward normal at p */
  normalAt(p) { const n = this.surf.grad(p); return this.rev ? V.neg(n) : n; }
}
class Body {
  constructor(faces) { this.faces = faces; }
  edges() { const s = new Set(); this.faces.forEach(f => f.loops.forEach(l => l.forEach(c => s.add(c.edge)))); return [...s]; }
  vertices() { const s = new Set(); this.edges().forEach(e => { s.add(e.v0); s.add(e.v1); }); return [...s]; }
  /** axis-aligned box (a safe superset): sampled edges plus the true extent of every full circle / sphere / torus involved */
  bbox() {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], add = (p) => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } };
    const ext = (c, h) => { for (let k = 0; k < 3; k++) { if (c[k] - h[k] < mn[k]) mn[k] = c[k] - h[k]; if (c[k] + h[k] > mx[k]) mx[k] = c[k] + h[k]; } };
    this.faces.forEach(f => {
      f.loops.forEach(l => l.forEach(c => { const e = c.edge; if (e.kind === 'circle') { const n = V.cross(e.x, e.y); ext(e.c, [0, 1, 2].map(k => e.r * Math.sqrt(Math.max(0, 1 - n[k] * n[k])))); } else e.sample(1e9, 64).forEach(add); }));
      const s = f.surf;
      if (s.kind === 'cylinder' || s.kind === 'cone') {   // end circles of the axial range occupied by the face (safe superset of the patch)
        let v0 = Infinity, v1 = -Infinity; f.loops.forEach(l => l.forEach(c => c.edge.sample(1e9, 16).forEach(p => { const v = s.uv(p)[1]; if (v < v0) v0 = v; if (v > v1) v1 = v; })));
        if (f.loops.length === 1 && s.kind === 'cone' && Number.isFinite(s.apexV) && Math.abs(loopWinding(f.loops[0], s)) > 0.5) { add(s.apexPt()); v0 = Math.min(v0, s.apexV); v1 = Math.max(v1, s.apexV); }   // a wrapping single boundary leaves the cone open towards its apex
        if (v0 <= v1) for (const v of [v0, v1]) { const rr = Math.max(0, s.r + (s.k || 0) * v), c = V.madd(s.o, s.z, v); ext(c, [0, 1, 2].map(k => rr * Math.sqrt(Math.max(0, 1 - s.z[k] * s.z[k])))); }
      }
      if (s.kind === 'sphere') ext(s.o, [s.r, s.r, s.r]);
      else if (s.kind === 'torus') ext(s.o, [0, 1, 2].map(k => (s.R + s.r) * Math.sqrt(Math.max(0, 1 - s.z[k] * s.z[k])) + s.r * Math.abs(s.z[k])));
    });
    return { min: mn, max: mx };
  }
  xf(T) {
    if (!(Math.abs(T.det()) > 1e-300)) throw new Error('a singular (flattening) transform is not allowed'); const mir = T.det() < 0;
    const vmap = new Map(), emap = new Map();
    const faces = this.faces.map(f => { const nf = new Face(f.surf.xf(T), f.rev, f.loops.map(l => l.map(c => { let e = emap.get(c.edge); if (!e) { e = c.edge.xf(T, vmap); emap.set(c.edge, e); } return { edge: e, fwd: c.fwd }; }))); if (f.vrange) { nf.vrange = f.vrange; nf.urange = f.urange; } return nf; });
    this.faces.forEach((f, i) => { if (f.tris) { faces[i].tris = f.tris.map(t => { const q = t.map(p => T.p(p)); return mir ? q.reverse() : q; }); } });
    if (mir) faces.forEach((nf) => {      // a reflection reverses handedness: walk every loop the other way so the outward normal stays outward, and mirror the angle range (the frame's y axis is re-derived as z x x)
      nf.loops = nf.loops.map(l => l.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd })));
      if (nf.urange && Array.isArray(nf.urange) && nf.urange.length === 2) nf.urange = [-nf.urange[1], -nf.urange[0]];
    });
    return new Body(faces);
  }
}
/** number of times a loop winds around a periodic surface's axis (rounded) */
function loopWinding(loop, S) {
  let prev = null, tot = 0;
  const pts = []; loop.forEach(ce => { const P = ce.edge.kind === 'poly' ? ce.edge.pts : ce.edge.sample(1e9, 64); (ce.fwd ? P : P.slice().reverse()).forEach((p, i, a) => { if (i < a.length - 1) pts.push(p); }); });
  pts.push(pts[0]);
  for (const p of pts) { const u = S.uv(p)[0]; if (prev !== null) { let d = u - prev; while (d > PI) d -= TAU; while (d < -PI) d += TAU; tot += d; } prev = u; }
  return Math.round(tot / TAU);
}
AK.Vertex = Vertex; AK.Edge = Edge; AK.Face = Face; AK.Body = Body;

// ---------------------------------------------------------------- validation
/** Checks that the shell is closed and consistently oriented: every edge is used exactly twice, once in each direction. */
function validate(body, tol) {
  const issues = [], uses = new Map();
  body.faces.forEach((f, fi) => {
    f.loops.forEach((l, li) => {
      if (!l.length) { issues.push({ severity: 'error', code: 'EMPTY_LOOP', message: 'face ' + fi + ' has an empty loop' }); return; }
      for (let i = 0; i < l.length; i++) {
        const a = l[i], b = l[(i + 1) % l.length], ea = a.fwd ? a.edge.v1 : a.edge.v0, sb = b.fwd ? b.edge.v0 : b.edge.v1;
        if (ea !== sb) issues.push({ severity: 'error', code: 'OPEN_LOOP', message: 'face ' + fi + ' loop ' + li + ' is not closed at coedge ' + i });
        let u = uses.get(a.edge); if (!u) uses.set(a.edge, u = { f: 0, r: 0, faces: [] }); a.fwd ? u.f++ : u.r++; u.faces.push(fi);
      }
    });
  });
  uses.forEach((u, e) => { if (u.f !== 1 || u.r !== 1) issues.push({ severity: 'error', code: 'EDGE_USE', message: 'edge ' + e.id + ' (' + e.kind + ') is used ' + u.f + ' time(s) forward and ' + u.r + ' backward (faces ' + u.faces.join(',') + ')' }); });
  body.faces.forEach((f, fi) => { if (!f.surf) issues.push({ severity: 'error', code: 'NO_SURFACE', message: 'face ' + fi + ' has no surface' }); });
  let mp = null; try { mp = massProps(body); if (!(mp.volume > 0)) issues.push({ severity: 'error', code: 'VOLUME', message: 'the body encloses a non-positive volume (' + mp.volume + ')' }); } catch (e) { issues.push({ severity: 'warning', code: 'MASS', message: 'mass properties unavailable: ' + e.message }); }
  const V_ = body.vertices().length, E_ = uses.size, F_ = body.faces.length;
  return { ok: !issues.some(i => i.severity === 'error'), issues, counts: { faces: F_, edges: E_, vertices: V_ }, euler: V_ - E_ + F_, volume: mp ? mp.volume : null };
}
AK.validate = validate;

// ---------------------------------------------------------------- exact mass properties (Green's theorem on the true surfaces)
// Every closed-surface integral ∬ F(p)·n dA is evaluated in the face's own (u,v) space as  -∮ H du,  H(u,v) = ∫ g dv,
// with the boundary taken along the real edge curves and the inner integral by Gauss-Legendre.  g = F(P(u,v))·(Pu×Pv).
const FIELDS = [
  (p, n) => (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / 3,   // 0 volume
  (p, n) => p[0] * p[0] * n[0] / 2,                          // 1 ∫x
  (p, n) => p[1] * p[1] * n[1] / 2,                          // 2 ∫y
  (p, n) => p[2] * p[2] * n[2] / 2,                          // 3 ∫z
  (p, n) => p[0] * p[0] * p[0] * n[0] / 3,                   // 4 ∫x²
  (p, n) => p[1] * p[1] * p[1] * n[1] / 3,                   // 5 ∫y²
  (p, n) => p[2] * p[2] * p[2] * n[2] / 3,                   // 6 ∫z²
  (p, n) => p[0] * p[0] * p[1] * n[0] / 2,                   // 7 ∫xy
  (p, n) => p[1] * p[1] * p[2] * n[1] / 2,                   // 8 ∫yz
  (p, n) => p[2] * p[2] * p[0] * n[2] / 2                    // 9 ∫zx
];
const NC = 11; // [area, 10 fields]
function integrand(S, u, v, out) {
  const d = S.D(u, v), p = d.p, n = d.n; out[0] = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  for (let k = 0; k < 10; k++) out[k + 1] = FIELDS[k](p, n);
}
const innerN = (S) => (S.kind === 'sphere' || S.kind === 'torus') ? 20 : (S.kind === 'cone' ? 8 : 6);
/** H(u,v) = ∫_{vref}^{v} g(u,v') dv'  (all 11 components) */
function Hint(S, u, v, vref, out) {
  out.fill(0); if (v === vref) return;
  const n = innerN(S), g = gauss(n), h = (v - vref) / 2, m = (v + vref) / 2, t = new Array(NC);
  for (let i = 0; i < n; i++) { integrand(S, u, m + h * g.x[i], t); const w = g.w[i] * h; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
}
/** orient a loop so that its region lies to the left in (u,v) space */
function uvLoop(face, loop) { return face.rev ? loop.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd })) : loop; }
function frameCandidates() { return [[0.31, 0.47, 0.83], [-0.52, 0.21, 0.79], [0.66, -0.58, 0.47], [0.12, 0.91, -0.4], [-0.77, -0.3, 0.56], [0.4, -0.2, -0.89]].map(V.norm); }
function subPieces(pcs, n) { if (n <= 1) return pcs; const o = []; for (const [a, b] of pcs) for (let i = 0; i < n; i++) o.push([a + (b - a) * i / n, a + (b - a) * (i + 1) / n]); return o; }
function fibonacci(n) { const o = [], g = PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z); o.push([r * Math.cos(g * i), r * Math.sin(g * i), z]); } return o; }
/** points sampled densely along every loop of a face, in traversal order (loops oriented as stored) */
function loopSamples(face, per) { return face.loops.map(l => { const pts = []; l.forEach(ce => { const P = ce.edge.kind === 'poly' ? ce.edge.pts : ce.edge.sample(1e9, per || 64); const Q = ce.fwd ? P : P.slice().reverse(); for (let i = 0; i < Q.length - 1; i++) pts.push(Q[i]); }); return pts; }); }
/** a point of the sphere that certainly belongs to the face: just left of the middle of a boundary segment */
function sphereInner(face, S, loops) {
  const L = loops[0], i = Math.floor(L.length / 2), a = L[i], b = L[(i + 1) % L.length], m = V.mid(a, b), t = V.norm(V.sub(b, a)), n = face.normalAt(m), d = V.norm(V.cross(n, t));
  return S.project(V.madd(m, d, S.r * 2e-3));
}
/** is the direction q (a unit vector from the sphere centre) inside the face?  Stereographic projection from a known inner point turns this into a winding number. */
function sphereContains(face, S, loops, x0, q) {
  const d0 = V.norm(V.sub(x0, S.o)), fr = frame([0, 0, 0], d0, null), proj = (p) => { const w = V.norm(V.sub(p, S.o)), a = V.dot(w, fr.x), b = V.dot(w, fr.y), c = V.dot(w, d0), den = 1 - c; return [a / den, b / den]; };
  const t = proj(V.madd(S.o, q, S.r)); let tot = 0;
  for (const L of loops) { let prev = null, first = null, acc = 0; for (const p of L.concat([L[0]])) { const pp = proj(p), ang = Math.atan2(pp[1] - t[1], pp[0] - t[0]); if (prev !== null) { let d = ang - prev; while (d > PI) d -= TAU; while (d < -PI) d += TAU; acc += d; } prev = ang; } tot += acc / TAU; }
  return Math.abs(Math.round(tot)) === 0;   // winding 0 ↔ q lies in the face (the face contains the projection centre), ±1 ↔ outside
}
function pickSpherePole(face, S) {
  const loops = loopSamples(face, 64), pts = []; loops.forEach(L => { const step = Math.max(1, Math.floor(L.length / 400)); for (let i = 0; i < L.length; i += step) pts.push(V.norm(V.sub(L[i], S.o))); });
  let best = null; for (const c0 of fibonacci(160)) { const c = S.gdir(c0); let mx = 0; for (const p of pts) { const d = Math.abs(V.dot(p, c)); if (d > mx) mx = d; } const ang = Math.acos(Math.min(1, mx)); if (!best || ang > best.angle) best = { z: c, c, angle: ang }; }
  const x0 = sphereInner(face, S, loops);
  best.inside = sphereContains(face, S, loops, x0, best.c);
  return best;
}
/** U(u,v) = ∫_{uref}^{u} g(u',v) du'  (all 11 components) */
function Uint(S, u, v, uref, out) {
  out.fill(0); if (u === uref) return;
  const n = 32, g = gauss(n), h = (u - uref) / 2, m = (u + uref) / 2, t = new Array(NC);
  for (let i = 0; i < n; i++) { integrand(S, m + h * g.x[i], v, t); const w = g.w[i] * h; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
}
/** exact integrals over a trimmed torus face. The boundary is walked with continuous (unwrapped) angles. A loop that closes in v uses the v-antiderivative
 *  (∮ H du, H periodic in u), a loop that closes in u uses the u-antiderivative (∮ U dv, U periodic in v); a face with loops of both kinds, or a loop
 *  that winds both ways, is refused (the caller then falls back to the faceted estimate). If the face is the complement of its loops (negative signed area
 *  in the unwrapped angle plane) the whole torus is added. */
function torusTrimmed(face, S, sign) {
  const g = gauss(6), H = new Array(NC), loopsInfo = [];
  let areaSum = 0;
  for (const loop of face.loops) {
    const smp = []; let uprev = null, vprev = null, uoff = 0, voff = 0;
    for (const ce of uvLoop(face, loop)) {
      const e = ce.edge, pcs = subPieces(e.pieces(), 8), seq = ce.fwd ? pcs : pcs.slice().reverse();
      for (const [a, b] of seq) for (let ii = 0; ii < 6; ii++) {
        const i = ce.fwd ? ii : 5 - ii, t = (a + b) / 2 + (b - a) / 2 * g.x[i], w = g.w[i] * (b - a) / 2, p = e.pt(t); let dp = e.dpt(t); if (!ce.fwd) dp = V.neg(dp);
        const r = S.duv(p, dp); let u = r[0] + uoff, v = r[1] + voff;
        if (uprev !== null) { while (u - uprev > PI) { u -= TAU; uoff -= TAU; } while (u - uprev < -PI) { u += TAU; uoff += TAU; } while (v - vprev > PI) { v -= TAU; voff -= TAU; } while (v - vprev < -PI) { v += TAU; voff += TAU; } }
        uprev = u; vprev = v; smp.push({ u, v, du: r[2] * w, dv: r[3] * w });
      }
    }
    const n = smp.length, wu = Math.round((smp[n - 1].u - smp[0].u) / TAU), wv = Math.round((smp[n - 1].v - smp[0].v) / TAU);
    let ar = 0, mu = 0, mv = 0; for (let i = 0; i < n; i++) { const a = smp[i], b = smp[(i + 1) % n]; ar += (a.u * b.v - b.u * a.v) / 2; mu += a.u; mv += a.v; }
    loopsInfo.push({ smp, wu, wv, mu: mu / n, mv: mv / n }); areaSum += ar;
  }
  const pure = loopsInfo.every(L => L.wu === 0 && L.wv === 0), bandV = loopsInfo.every(L => L.wu === 0 && Math.abs(L.wv) === 1), bandU = loopsInfo.every(L => L.wv === 0 && Math.abs(L.wu) === 1);
  if (!pure && !bandV && !bandU) throw new Error('this torus face cannot be integrated exactly (mixed or multiple windings)');
  const norm = (x) => { x = x % TAU; return x < 0 ? x + TAU : x; };
  // a band that wraps the tube (bandV) is integrated with the u-antiderivative, one that wraps the axis (bandU) with the v-antiderivative; every loop pair (left edge, right edge) must be lifted to the same period
  if (bandV || bandU) {
    const key = bandV ? 'mu' : 'mv', wk = bandV ? 'wv' : 'wu', sh = bandV ? 'u' : 'v';
    const items = loopsInfo.map(L => ({ L, m: norm(L[key]) })).sort((p, q) => p.m - q.m), n = items.length;
    if (n % 2) throw new Error('unbalanced torus band');
    items.forEach(it => { it.shift = TAU * Math.round((it.m - it.L[key]) / TAU); });
    // bandV: region lies between a wv = -1 loop (lower u) and the next wv = +1 loop (higher u); bandU: between a wu = +1 loop (lower v) and the next wu = -1 loop
    const first = bandV ? -1 : 1;
    for (let k = 0; k < n; k++) if (items[k].L[wk] === first) {
      const nx = items[(k + 1) % n]; if (nx.L[wk] !== -first) throw new Error('torus band loops do not alternate');
      if ((k + 1) >= n) nx.shift += TAU;
    }
    items.forEach(it => it.L.smp.forEach(s => { s[sh] += it.shift; }));
  }
  const acc = new Array(NC).fill(0);
  for (const L of loopsInfo) for (const s of L.smp) {
    if (!bandV) { Hint(S, s.u, s.v, 0, H); for (let k = 0; k < NC; k++) acc[k] -= H[k] * s.du; }
    else { Uint(S, s.u, s.v, 0, H); for (let k = 0; k < NC; k++) acc[k] += H[k] * s.dv; }
  }
  if (pure && areaSum < 0) { const full = faceIntegrals(new Face(S, false, [])); for (let k = 0; k < NC; k++) acc[k] += full[k]; }   // the face is everything except the loops' interior
  const out = new Array(NC); out[0] = acc[0]; for (let k = 1; k < NC; k++) out[k] = acc[k] * sign; return out;
}
function faceIntegrals(face) {
  let S = face.surf; const out = new Array(NC).fill(0);
  const sign = face.rev ? -1 : 1;
  if (!face.loops.length) {
    // full closed periodic surface
    if (S.kind === 'sphere' || S.kind === 'torus') {
      const nu = 64, nv = 24, g = gauss(nv), t = new Array(NC), du = TAU / nu;
      for (let i = 0; i < nu; i++) {
        const u = i * du;
        if (S.kind === 'sphere') { for (let j = 0; j < nv; j++) { integrand(S, u, g.x[j] * PI / 2, t); const w = g.w[j] * PI / 2 * du; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } }
        else for (let j = 0; j < 64; j++) { integrand(S, u, j * TAU / 64, t); const w = du * TAU / 64; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
      }
      for (let k = 1; k < NC; k++) out[k] *= sign; return out;
    }
    throw new Error('face without a boundary on a ' + S.kind);
  }
  if (S.kind === 'torus') {
    if (!face.vrange) return torusTrimmed(face, S, sign);
    // a full turn about the axis between two tube angles: periodic trapezoid in u (exact for trig polynomials), Gauss-Legendre in v
    const [v0, v1] = face.vrange, [u0, u1] = face.urange || [0, TAU], nu = Math.max(8, Math.ceil(96 * (u1 - u0) / TAU)), du = (u1 - u0) / nu, np = Math.max(1, Math.ceil((v1 - v0) / (PI / 3))), g = gauss(10), t = new Array(NC);
    for (let i = 0; i < nu; i++) for (let q = 0; q < np; q++) { const a = v0 + (v1 - v0) * q / np, b = v0 + (v1 - v0) * (q + 1) / np; for (let j = 0; j < g.x.length; j++) { const v = (a + b) / 2 + g.x[j] * (b - a) / 2; if (face.urange) { for (let m = 0; m < g.x.length; m++) { const u = u0 + (i + 0.5 + g.x[m] / 2) * du; integrand(S, u, v, t); const w = g.w[j] * (b - a) / 2 * g.w[m] * du / 2; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } } else { integrand(S, i * du, v, t); const w = g.w[j] * (b - a) / 2 * du; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } } }
    for (let k = 1; k < NC; k++) out[k] *= sign; return out;
  }
  let northInside = false, pieceSub = 1;
  if (S.kind === 'sphere') {
    const pol = pickSpherePole(face, S); S = new Sphere(frame(S.o, pol.z, S.x), S.r); northInside = pol.inside; if (pol.angle < 0.15) pieceSub = 4;
  }
  const vref = S.kind === 'sphere' ? -PI / 2 : S.kind === 'cone' ? S.apexV : 0;
  const g = gauss(6), H = new Array(NC), acc = new Array(NC).fill(0);
  let du_total = 0;
  for (const loop of face.loops) {
    for (const ce of uvLoop(face, loop)) {
      const e = ce.edge;
      for (const [a, b] of subPieces(e.pieces(), pieceSub)) for (let i = 0; i < 6; i++) {
        const t = (a + b) / 2 + (b - a) / 2 * g.x[i], w = g.w[i] * (b - a) / 2, p = e.pt(t); let dp = e.dpt(t); if (!ce.fwd) dp = V.neg(dp);
        const r = S.duv(p, dp); Hint(S, r[0], r[1], vref, H); const dw = ce.fwd ? w : w; // weight is positive; the sign of dp already carries the direction
        for (let k = 0; k < NC; k++) acc[k] -= H[k] * r[2] * dw; du_total += r[2] * dw;
      }
    }
  }
  if (S.kind === 'sphere' && northInside) {
    const nu = 64, du = TAU / nu;
    for (let i = 0; i < nu; i++) { Hint(S, i * du, PI / 2, vref, H); for (let k = 0; k < NC; k++) acc[k] += H[k] * du; }
  } else if (S.kind === 'cylinder' && Math.abs(Math.round(du_total / TAU)) > 0) throw new Error('a cylinder face with an unbalanced wrapping boundary is not closed');
  out[0] = acc[0];
  for (let k = 1; k < NC; k++) out[k] = acc[k] * sign;
  return out;
}
/** exact volume, area, centroid and inertia tensor of a closed body */
/** fallback for faces the exact integrator cannot handle (trimmed torus): flux through the face's own triangles (second-order accurate) */
function faceIntegralsTris(face) {
  const out = new Array(NC).fill(0); if (!face.tris || !face.tris.length) throw new Error('no triangles stored for the face');
  for (const [a, b, c] of face.tris) {
    const n = V.mul(V.cross(V.sub(b, a), V.sub(c, a)), 0.5); out[0] += V.len(n);
    for (const m of [V.mid(a, b), V.mid(b, c), V.mid(c, a)]) for (let k = 0; k < 10; k++) out[k + 1] += FIELDS[k](m, n) / 3;
  }
  return out;
}
function massProps(body) {
  const tot = new Array(NC).fill(0); let approx = 0;
  body.faces.forEach(f => { let r; try { r = faceIntegrals(f); } catch (e) { if (!f.tris) throw e; r = faceIntegralsTris(f); approx++; } for (let k = 0; k < NC; k++) tot[k] += r[k]; });
  const A = tot[0], Vv = tot[1], c = Math.abs(Vv) > 1e-300 ? [tot[2] / Vv, tot[3] / Vv, tot[4] / Vv] : [0, 0, 0];
  const [sx2, sy2, sz2, sxy, syz, szx] = [tot[5], tot[6], tot[7], tot[8], tot[9], tot[10]];
  const Io = [[sy2 + sz2, -sxy, -szx], [-sxy, sx2 + sz2, -syz], [-szx, -syz, sx2 + sy2]];
  const c2 = V.dot(c, c), I = Io.map((row, i) => row.map((x, j) => x - Vv * ((i === j ? c2 : 0) - c[i] * c[j])));
  return { volume: Vv, area: A, approximateFaces: approx, centroid: c, inertiaOrigin: Io, inertia: I, faceAreas: body.faces.map(f => { try { return faceIntegrals(f)[0]; } catch (e) { try { return faceIntegralsTris(f)[0]; } catch (e2) { return null; } } }) };
}
AK.massProps = massProps;

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

// ---------------------------------------------------------------- polygon BSP (boolean on tagged convex polygons)
class BPoly {
  constructor(v, n, w, tag) { this.v = v; this.n = n; this.w = w; this.tag = tag; }
  flip() { this.v.reverse(); this.n = V.neg(this.n); this.w = -this.w; }
}
function mkBPoly(pts, tag) {
  let n = pts.length === 3 ? V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])) : newell(pts); const l = V.len(n); if (!(l > 0)) return null; n = V.mul(n, 1 / l);
  return new BPoly(pts.map(p => p.slice()), n, V.dot(n, pts[0]), tag);
}
let EPSB = 1e-9;
function splitPoly(pl, poly, cf, cb, f, b) {
  let kind = 0; const ty = poly.v.map(p => { const t = V.dot(pl.n, p) - pl.w; const k = t < -EPSB ? 2 : t > EPSB ? 1 : 0; kind |= k; return k; });
  if (kind === 0) { (V.dot(pl.n, poly.n) > 0 ? cf : cb).push(poly); return; }
  if (kind === 1) { f.push(poly); return; }
  if (kind === 2) { b.push(poly); return; }
  const fp = [], bp = [], n = poly.v.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ti = ty[i], tj = ty[j], vi = poly.v[i], vj = poly.v[j];
    if (ti !== 2) fp.push(vi); if (ti !== 1) bp.push(vi);
    if ((ti | tj) === 3) { const t = (pl.w - V.dot(pl.n, vi)) / V.dot(pl.n, V.sub(vj, vi)), x = V.lerp(vi, vj, t); fp.push(x); bp.push(x); }
  }
  if (fp.length >= 3) f.push(new BPoly(fp, poly.n, poly.w, poly.tag));
  if (bp.length >= 3) b.push(new BPoly(bp, poly.n, poly.w, poly.tag));
}
class BNode {
  constructor(polys) { this.pl = null; this.front = null; this.back = null; this.polys = []; if (polys && polys.length) this.build(polys); }
  nodes() { const o = [], st = [this]; while (st.length) { const n = st.pop(); o.push(n); if (n.front) st.push(n.front); if (n.back) st.push(n.back); } return o; }
  invert() { for (const n of this.nodes()) { n.polys.forEach(p => p.flip()); if (n.pl) n.pl = { n: V.neg(n.pl.n), w: -n.pl.w }; const t = n.front; n.front = n.back; n.back = t; } }
  clip(polys) {
    const out = [], st = [[this, polys]];
    while (st.length) {
      const [n, ps] = st.pop(); if (!ps.length) continue;
      if (!n.pl) { out.push(...ps); continue; }
      const f = [], b = []; for (const p of ps) splitPoly(n.pl, p, f, b, f, b);
      if (n.front) st.push([n.front, f]); else out.push(...f);
      if (n.back) st.push([n.back, b]);
    }
    return out;
  }
  clipTo(o) { for (const n of this.nodes()) n.polys = o.clip(n.polys); }
  all() { const o = []; for (const n of this.nodes()) for (const p of n.polys) o.push(p); return o; }
  build(polys) {
    const st = [[this, polys]];
    while (st.length) {
      const [n, ps0] = st.pop(); if (!ps0.length) continue;
      let ps = ps0;
      if (!n.pl) { n.pl = { n: ps[0].n.slice(), w: ps[0].w }; n.polys.push(ps[0]); ps = ps.slice(1); }
      const f = [], b = []; for (const p of ps) splitPoly(n.pl, p, n.polys, n.polys, f, b);
      if (f.length) { if (!n.front) n.front = new BNode(); st.push([n.front, f]); }
      if (b.length) { if (!n.back) n.back = new BNode(); st.push([n.back, b]); }
    }
  }
}
function shuffled(a, seed) { const r = a.slice(); let s = seed || 12345; for (let i = r.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
/** boolean of two tagged triangle soups; returns tagged polygons oriented outward for the result */
function bspBoolean(kind, A, B, scale) {
  EPSB = Math.max(1e-12, scale * 1e-9);
  const pa = A.map(p => mkBPoly(p.pts, p.tag)).filter(Boolean), pb = B.map(p => mkBPoly(p.pts, p.tag)).filter(Boolean);
  const a = new BNode(shuffled(pa, 7)), b = new BNode(shuffled(pb, 13));
  if (kind === 'union') { a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); }
  else if (kind === 'subtract') { a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert(); }
  else if (kind === 'intersect') { a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.all()); a.invert(); }
  else throw new Error('unknown boolean ' + kind);
  return a.all().map(p => ({ pts: p.v, tag: p.tag }));
}
AK.bspBoolean = bspBoolean;

// ---------------------------------------------------------------- rebuild an exact B-rep from boolean output
// The BSP result is a set of tagged polygons; every tag is a face of an operand and therefore names an exact surface.
// We weld, heal T-junctions, regroup polygons by surface, project every vertex onto the true surfaces that meet there,
// and turn the group boundaries into edges (line / circle / refined poly) that are shared between exactly two faces.
function reconstruct(polys, scale, light) {
  const tol = scale * 1e-9, cs = tol * 4;
  const P = [], grid = new Map(), gk = (x, y, z) => x + ',' + y + ',' + z;
  function vid(p) {
    const cx = Math.floor(p[0] / cs), cy = Math.floor(p[1] / cs), cz = Math.floor(p[2] / cs);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const b = grid.get(gk(cx + dx, cy + dy, cz + dz)); if (b) for (const i of b) if (V.dist(P[i], p) <= tol) return i; }
    const i = P.length; P.push(p.slice()); const k = gk(cx, cy, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); return i;
  }
  let PL = [];
  for (const p of polys) {
    let vs = p.pts.map(vid); vs = vs.filter((v, i) => v !== vs[(i + 1) % vs.length]); if (vs.length < 3) continue;
    PL.push({ vs, tag: p.tag });
  }
  // ---- T-junction healing
  const gc = scale / 40 + tol, g2 = new Map(), key3 = (x, y, z) => x + ',' + y + ',' + z;
  P.forEach((p, i) => { const k = key3(Math.floor(p[0] / gc), Math.floor(p[1] / gc), Math.floor(p[2] / gc)); if (!g2.has(k)) g2.set(k, []); g2.get(k).push(i); });
  const ecache = new Map();
  function between(a, b) {
    const k = a < b ? a + ',' + b : b + ',' + a; let r = ecache.get(k);
    if (!r) {
      const lo = Math.min(a, b), hi = Math.max(a, b), A = P[lo], B = P[hi], AB = V.sub(B, A), L2 = V.dot(AB, AB), res = [], seen = new Set();
      if (L2 > tol * tol) {
        const check = (i) => { if (i === lo || i === hi || seen.has(i)) return; seen.add(i); const t = V.dot(V.sub(P[i], A), AB) / L2; if (t <= 1e-9 || t >= 1 - 1e-9) return; if (V.dist(V.madd(A, AB, t), P[i]) <= tol * 3) res.push([t, i]); };
        const lo3 = [0, 1, 2].map(i => Math.floor((Math.min(A[i], B[i]) - tol * 3) / gc)), hi3 = [0, 1, 2].map(i => Math.floor((Math.max(A[i], B[i]) + tol * 3) / gc));
        const cells = (hi3[0] - lo3[0] + 1) * (hi3[1] - lo3[1] + 1) * (hi3[2] - lo3[2] + 1);
        if (cells <= 600) { for (let x = lo3[0]; x <= hi3[0]; x++) for (let y = lo3[1]; y <= hi3[1]; y++) for (let z = lo3[2]; z <= hi3[2]; z++) { const bk = g2.get(key3(x, y, z)); if (bk) bk.forEach(check); } }
        else { const L = Math.sqrt(L2), steps = Math.ceil(L / (gc * 0.5)); for (let s = 0; s <= steps; s++) { const q = V.madd(A, AB, s / steps), cx = Math.floor(q[0] / gc), cy = Math.floor(q[1] / gc), cz = Math.floor(q[2] / gc); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const bk = g2.get(key3(cx + dx, cy + dy, cz + dz)); if (bk) bk.forEach(check); } } }
        res.sort((p, q) => p[0] - q[0]);
      }
      r = res.map(x => x[1]); ecache.set(k, r);
    }
    return a < b ? r : r.slice().reverse();
  }
  PL.forEach(p => { const o = []; for (let i = 0; i < p.vs.length; i++) { const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length]; o.push(a); between(a, b).forEach(x => o.push(x)); } p.vs = o.filter((v, i) => v !== o[(i + 1) % o.length]); });
  PL = PL.filter(p => {   // polygons that are flat lines after healing carry no area: drop them (their neighbours were split to match)
    if (p.vs.length < 3) return false;
    const pts = p.vs.map(i => P[i]), A2 = V.len(newell(pts)); let L = 0; for (let i = 0; i < pts.length; i++) L = Math.max(L, V.dist(pts[i], pts[(i + 1) % pts.length]));
    return A2 / (L || 1) > tol * 0.5;
  });
  // ---- half-edge table
  const NV = P.length + 1, hk = (a, b) => a * NV + b, he = new Map();
  PL.forEach((p, pi) => { for (let i = 0; i < p.vs.length; i++) { const k = hk(p.vs[i], p.vs[(i + 1) % p.vs.length]); if (he.has(k)) { const q = he.get(k), a = p.vs[i], b = p.vs[(i + 1) % p.vs.length]; throw new Error('non-manifold boolean result (duplicate half-edge) at ' + P[a].map(x => x.toFixed(4)) + ' -> ' + P[b].map(x => x.toFixed(4)) + ' polys ' + PL[q].vs.length + '/' + p.vs.length + ' tags ' + (PL[q].tag.surf.kind) + '/' + (p.tag.surf.kind)); } he.set(k, pi); } });
  for (const [k, pi] of he) { const a = Math.floor(k / NV), b = k % NV; if (!he.has(hk(b, a))) throw new Error('boolean result is not closed (open edge ' + P[a].map(x => x.toFixed(5)) + ' -> ' + P[b].map(x => x.toFixed(5)) + ', len ' + V.dist(P[a], P[b]).toExponential(2) + ', face ' + (PL[pi].tag.surf.kind) + ', ' + PL[pi].vs.length + ' verts)'); }
  // ---- groups by tag, then merge faces that share a surface
  const tags = new Map(); const gid = (t) => { let g = tags.get(t); if (g === undefined) { g = tags.size; tags.set(t, g); } return g; };
  PL.forEach(p => { p.g = gid(p.tag); });
  const G0 = tags.size, parent = Array.from({ length: G0 }, (_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const gTag = []; tags.forEach((g, t) => { gTag[g] = t; });
  // orientation of each tag's polygons against the surface normal
  const sgn = new Array(G0).fill(0);
  PL.forEach(p => { const pts = p.vs.map(i => P[i]), n = newell(pts), a = V.len(n); if (a <= 0) return; const c = pts.reduce((s, q) => V.add(s, q), [0, 0, 0]).map(x => x / pts.length); sgn[p.g] += V.dot(V.mul(n, 1 / a), gTag[p.g].surf.grad(c)) * a; });
  const rev0 = sgn.map(s => s < 0);
  const effN = (g, pt) => { const n = gTag[g].surf.grad(pt); return rev0[g] ? V.neg(n) : n; };
  for (const [k, pi] of he) {
    const a = Math.floor(k / NV), b = k % NV, qi = he.get(hk(b, a)), g1 = PL[pi].g, g2_ = PL[qi].g; if (g1 === g2_ || find(g1) === find(g2_)) continue;
    const s1 = gTag[g1].surf, s2 = gTag[g2_].surf; if (!s1.same(s2, tol * 20)) continue;
    const m = V.mid(P[a], P[b]); if (V.dot(effN(g1, m), effN(g2_, m)) < 0.9999) continue;
    parent[find(g1)] = find(g2_);
  }
  const roots = []; const rid = new Map();
  for (let g = 0; g < G0; g++) { const r = find(g); if (!rid.has(r)) { rid.set(r, roots.length); roots.push(r); } }
  PL.forEach(p => { p.f = rid.get(find(p.g)); });
  const NF = roots.length, fSurf = roots.map(r => gTag[r].surf), fRev = roots.map(r => rev0[r]);
  const Pf = P.map(p => p.slice());   // positions on the facets (kept for chained booleans: orientation-safe)
  // ---- project every vertex onto the true surfaces that meet there
  const vSurf = P.map(() => []);
  PL.forEach(p => p.vs.forEach(v => { if (!vSurf[v].includes(p.f)) vSurf[v].push(p.f); }));
  for (let v = 0; v < P.length; v++) {
    const ss = []; vSurf[v].forEach(f => { const s = fSurf[f]; if (!ss.some(t => t === s || t.same(s, tol * 20))) ss.push(s); });
    if (ss.length) { const inf = {}, q = projectMulti(P[v], ss, 16, inf); if (inf.err < 1e-9 * scale && V.dist(q, P[v]) < scale * 0.05) P[v] = q; }
  }
  // ---- boundary half-edges per face
  const out = new Map(); // face -> Map(vertex -> [{b, nb}])
  for (const [k, pi] of he) {
    const a = Math.floor(k / NV), b = k % NV, qi = he.get(hk(b, a)), f1 = PL[pi].f, f2 = PL[qi].f; if (f1 === f2) continue;
    let m = out.get(f1); if (!m) out.set(f1, m = new Map()); let l = m.get(a); if (!l) m.set(a, l = []); l.push({ b, nb: f2 });
  }
  const faceLoops = new Array(NF).fill(null).map(() => []);
  for (let f = 0; f < NF; f++) {
    const m = out.get(f); if (!m) continue;
    const S = fSurf[f];
    for (const [start] of m) {
      while (m.get(start) && m.get(start).length) {
        const L = { vs: [start], nb: [] }; let cur = start, guard = 0;
        for (;;) {
          const cand = m.get(cur); if (!cand || !cand.length) throw new Error('boundary loop broke at a vertex');
          let pick = 0;
          if (cand.length > 1) {   // pinch vertex: continue with the sharpest left turn so loops stay simple
            const prev = L.vs.length > 1 ? L.vs[L.vs.length - 2] : null, nrm = fRev[f] ? V.neg(S.grad(P[cur])) : S.grad(P[cur]);
            if (prev !== null) { const din = V.norm(V.sub(P[cur], P[prev])); let best = -Infinity; cand.forEach((c, i) => { const d = V.norm(V.sub(P[c.b], P[cur])), ang = Math.atan2(V.dot(V.cross(din, d), nrm), V.dot(din, d)); if (ang > best) { best = ang; pick = i; } }); }
          }
          const e = cand.splice(pick, 1)[0]; L.nb.push(e.nb);
          if (e.b === start) break; L.vs.push(e.b); cur = e.b; if (guard++ > 1e6) throw new Error('boundary loop did not close');
        }
        faceLoops[f].push(L);
      }
    }
  }
  // ---- break vertices: where the neighbour face changes or the boundary turns sharply
  const brk = new Set(), corner = 0.6;
  const turn = (a, b, c) => { const d1 = V.norm(V.sub(P[b], P[a])), d2 = V.norm(V.sub(P[c], P[b])); return Math.acos(Math.max(-1, Math.min(1, V.dot(d1, d2)))); };
  faceLoops.forEach(loops => loops.forEach(L => { const n = L.vs.length; for (let i = 0; i < n; i++) { const pn = L.nb[(i + n - 1) % n], nn = L.nb[i]; if (pn !== nn || (n > 2 && turn(L.vs[(i + n - 1) % n], L.vs[i], L.vs[(i + 1) % n]) > corner)) brk.add(L.vs[i]); } }));
  faceLoops.forEach(loops => loops.forEach(L => { if (!L.vs.some(v => brk.has(v))) brk.add(Math.min(...L.vs)); }));
  // ---- edges
  const verts = new Map(), getV = (i) => { let v = verts.get(i); if (!v) { v = new Vertex(P[i].slice()); verts.set(i, v); } return v; };
  const edges = new Map(), faces = [];
  const sameS = (a, b) => a === b || a.same(b, tol * 20);
  const ctxFit = { scale, tol, light };
  for (let f = 0; f < NF; f++) {
    const loops = [];
    for (const L of faceLoops[f]) {
      const n = L.vs.length; let s0 = 0; while (!brk.has(L.vs[s0])) s0++;
      const ces = []; let i = 0;
      while (i < n) {
        const run = [L.vs[(s0 + i) % n]]; let k = 0; const nb = L.nb[(s0 + i) % n];
        do { k++; run.push(L.vs[(s0 + i + k) % n]); } while (i + k < n && !brk.has(L.vs[(s0 + i + k) % n]));
        i += k;
        const kf = run.join(','), kr = run.slice().reverse().join(',');
        let rec = edges.get(kf), fwd = true; if (!rec) { rec = edges.get(kr); fwd = false; }
        if (!rec) { rec = { ids: run, e: null, s1: fSurf[f], s2: fSurf[nb] }; edges.set(kf, rec); fwd = true; }
        ces.push({ rec, fwd });
      }
      loops.push(ces);
    }
    faces.push(new Face(fSurf[f], fRev[f], loops));
  }
  if (AK.debug) console.log('   topology built', faces.length, 'faces', edges.size, 'edge records');
  // fit and create the edge geometry once per record
  const done = new Set();
  faces.forEach(face => face.loops.forEach(ces => ces.forEach(ce => {
    const rec = ce.rec; if (!rec.e) { const t0 = AK.debug ? Date.now() : 0; rec.e = fitEdge(rec.ids.map(i => P[i]), rec.ids.map(i => getV(i)), rec.s1, rec.s2, ctxFit); if (AK.debug) console.log('   edge', rec.e.kind, rec.ids.length, 'ids ->', rec.e.pts ? rec.e.pts.length : '-', 'pts', Date.now() - t0, 'ms', rec.s1.kind, rec.s2.kind); }
    ce.edge = rec.e; delete ce.rec;
  })));
  const body = new Body(faces);
  faces.forEach((f, i) => { if (f.surf.kind === 'torus') f.tris = []; });
  PL.forEach(p => { const f = faces[p.f]; if (f.tris) { const vs = p.vs; for (let i = 1; i + 1 < vs.length; i++) f.tris.push([P[vs[0]].slice(), P[vs[i]].slice(), P[vs[i + 1]].slice()]); } });
  // display mesh
  const tris = [];
  PL.forEach(p => {
    const vs = p.vs, n = vs.length; let s = 0, best = -1;
    for (let i = 0; i < n; i++) { const a = P[vs[(i + n - 1) % n]], b = P[vs[i]], c = P[vs[(i + 1) % n]], ar = V.len(V.cross(V.sub(b, a), V.sub(c, b))); if (ar > best) { best = ar; s = i; } }
    for (let i = 1; i + 1 < n; i++) { const a = vs[s], b = vs[(s + i) % n], c = vs[(s + i + 1) % n]; if (V.len(V.cross(V.sub(P[b], P[a]), V.sub(P[c], P[a]))) > 1e-12 * scale * scale) tris.push({ v: [a, b, c], f: p.f }); }
  });
  // display positions: projected onto the exact surfaces unless that would flip a triangle
  const keep = new Uint8Array(P.length), Pd = P.map(p => p.slice());
  for (let pass = 0; pass < 4; pass++) {
    let bad = 0;
    for (const t of tris) {
      const nf = V.cross(V.sub(Pf[t.v[1]], Pf[t.v[0]]), V.sub(Pf[t.v[2]], Pf[t.v[0]])), nd = V.cross(V.sub(Pd[t.v[1]], Pd[t.v[0]]), V.sub(Pd[t.v[2]], Pd[t.v[0]]));
      if (V.dot(nf, nd) <= 0.25 * V.dot(nf, nf) ** 0.5 * V.len(nd) * 0.0 + 0 && (V.len(nf) > 0)) { t.v.forEach(i => { if (!keep[i]) { keep[i] = 1; Pd[i] = Pf[i].slice(); bad++; } }); }
    }
    if (!bad) break;
  }
  return { body, P: Pf, Pd, tris };
}

// ---------------------------------------------------------------- edge-curve recognition and refinement
function refineChord(a, b, surfs, tolSag, depth, out, lim) {
  const mid = V.mid(a, b), inf = {}, q = projectMulti(mid, surfs, 14, inf), dev = V.dist(q, mid), L = V.dist(a, b);
  // stop when the chord is straight enough, when the projection did not converge or jumped (near-tangent / singular surfaces), or when over budget
  if (depth <= 0 || dev <= tolSag || !(inf.err < lim.conv) || dev > 0.3 * L || out.length > lim.max) { out.push(b); return; }
  refineChord(a, q, surfs, tolSag, depth - 1, out, lim); refineChord(q, b, surfs, tolSag, depth - 1, out, lim);
}
function refinePolyline(pts, surfs, tolSag, depth, scale) { const o = [pts[0]], lim = { conv: 1e-9 * (scale || 1), max: 30000 }; for (let i = 0; i + 1 < pts.length; i++) refineChord(pts[i], pts[i + 1], surfs, tolSag, depth, o, lim); return o; }
function circleFrom3(a, b, c) {
  const ab = V.sub(b, a), ac = V.sub(c, a), n = V.cross(ab, ac), nn = V.dot(n, n); if (nn < 1e-24) return null;
  const t1 = V.mul(V.cross(V.cross(ab, ac), ab), V.dot(ac, ac)), t2 = V.mul(V.cross(ac, V.cross(ab, ac)), V.dot(ab, ab));
  const ctr = V.add(a, V.mul(V.add(t1, t2), 1 / (2 * nn)));
  return { c: ctr, r: V.dist(ctr, a), n: V.norm(n) };
}
function fitEdge(pts, verts, s1, s2, ctx) {
  if (ctx.light) return new Edge('poly', verts[0], verts[pts.length - 1], { pts: pts.map(p => p.slice()) });   // display-only evaluation: raw facet-intersection points
  const tol = ctx.scale * 5e-9, n = pts.length, closed = verts[0] === verts[n - 1], v0 = verts[0], v1 = verts[n - 1];
  const surfs = [s1]; if (!(s2 === s1 || s2.same(s1, ctx.tol * 20))) surfs.push(s2);
  // 1. straight?
  if (!closed) {
    const A = pts[0], B = pts[n - 1], AB = V.sub(B, A), L = V.len(AB); let straight = L > 0;
    if (straight) { const d = V.mul(AB, 1 / L); for (const p of pts) { if (V.len(V.cross(V.sub(p, A), d)) > tol) { straight = false; break; } } }
    if (straight && surfs.length === 2) for (let i = 0; i + 1 < n && straight; i++) { const m = V.mid(pts[i], pts[i + 1]), q = projectMulti(m, surfs, 12); if (V.dist(q, m) > tol) straight = false; }
    if (straight) return new Edge('line', v0, v1);
  }
  // 2. circle?  (refine a little first so that a coarse chord still carries curvature information)
  let rp = pts; if (surfs.length === 2) rp = refinePolyline(pts, surfs, ctx.scale * 1e-4, 3, ctx.scale);
  const m = rp.length, i1 = Math.floor((m - 1) / 3), i2 = Math.floor(2 * (m - 1) / 3), c3 = closed ? [rp[0], rp[i1], rp[i2]] : [rp[0], rp[Math.floor((m - 1) / 2)], rp[m - 1]];
  const ci = m >= 3 ? circleFrom3(c3[0], c3[1], c3[2]) : null;
  if (ci && ci.r < ctx.scale * 1e3) {
    let ok = true; for (const p of rp) { if (Math.abs(V.dist(p, ci.c) - ci.r) > tol || Math.abs(V.dot(V.sub(p, ci.c), ci.n)) > tol) { ok = false; break; } }
    if (ok) {
      const x = V.norm(V.sub(rp[0], ci.c)); let nrm = ci.n, y = V.cross(nrm, x), ang = [0], tot = 0;
      for (let i = 1; i < m; i++) { const d = V.sub(rp[i], ci.c); let a = Math.atan2(V.dot(d, y), V.dot(d, x)); const prev = ang[i - 1]; let da = a - (((prev % TAU) + TAU) % TAU); while (da > PI) da -= TAU; while (da < -PI) da += TAU; ang.push(prev + da); }
      tot = ang[m - 1]; if (closed) tot = tot >= 0 ? TAU : -TAU;
      if (tot < 0) { nrm = V.neg(nrm); y = V.neg(y); tot = -tot; ang.forEach((a, i) => { ang[i] = -a; }); }
      let mono = true; for (let i = 1; i < m; i++) if (ang[i] < ang[i - 1] - 1e-9) { mono = false; break; }
      if (mono && tot > 1e-9) return new Edge('circle', v0, v1, { c: ci.c, x, y, r: ci.r, a0: 0, a1: closed ? TAU : tot });
    }
  }
  // 3. general curve: dense polyline lying exactly on both surfaces
  const dense = surfs.length === 2 ? refinePolyline(pts, surfs, ctx.scale * 2e-7, 14, ctx.scale) : pts;
  dense[0] = pts[0]; dense[dense.length - 1] = pts[n - 1];
  return new Edge('poly', v0, v1, { pts: dense });
}
AK.reconstruct = reconstruct;

// ---------------------------------------------------------------- general tessellation of a B-rep (any trimmed analytic face)
// Used for bodies that have no generator of their own (imported STEP bodies, results read back from OpenCascade) so they can be drawn, measured on a mesh,
// transformed and used in booleans like any other body.  Per face: the loops are walked in the surface's (u, v) parameters (periodic angles unwrapped, a seam
// cut, a loop around a pole closed through the pole), the polygon (with holes) is triangulated by ear clipping, and interior points are added on an angular
// grid with Lawson flips that never cross the boundary.  The boundary vertices are exactly the sampled edge points, identical for the two faces that share an edge,
// so the mesh is watertight.
function tessFace(face, tol, minN) {
  const S = face.surf, kind = S.kind, TWO = 2 * Math.PI;
  // a seam walked out and back (OpenCascade's sphere faces) is dropped: it only cuts the periodic surface open
  const dropSeam = (l) => { let c = l.slice(); for (let g = 0; g < 8; g++) { const n = c.length; let hit = -1; for (let i = 0; i < n && n > 2; i++) { const a = c[i], b = c[(i + 1) % n]; if (a.edge === b.edge && a.fwd !== b.fwd) { hit = i; break; } } if (hit < 0) break; const j = (hit + 1) % c.length; c = c.filter((_, k) => k !== hit && k !== j); } return c; };
  if (!face.loops.length && kind === 'sphere') return tessSphere(face, tol, minN);
  const rings3 = face.loops.map((l) => face.loopPts(kind === 'sphere' ? dropSeam(l) : l, tol, minN)).filter((r) => r.length >= 3); if (!rings3.length) return [];
  const back0 = kind === 'plane' ? (u, v) => S.glob([u, v, 0]) : (u, v) => S.D(u, v).p;
  let uvr;                                  // rings of [u, v, exact 3D point or undefined]
  if (kind === 'plane') uvr = rings3.map((r) => r.map((p) => { const l = S.loc(p); return [l[0], l[1], p]; }));
  else {
    const perV = kind === 'torus';
    const unwrap = (ring) => { const out = []; let pu = null, pv = null; ring.forEach((p) => { let [u, v] = S.uv(p); if (pu !== null) { while (u - pu > Math.PI) u -= TWO; while (u - pu < -Math.PI) u += TWO; if (perV) { while (v - pv > Math.PI) v -= TWO; while (v - pv < -Math.PI) v += TWO; } } out.push([u, v, p]); pu = u; pv = v; }); const f = out[0], l = out[out.length - 1]; return { pts: out, wu: -Math.round((f[0] - l[0]) / TWO), wv: perV ? -Math.round((f[1] - l[1]) / TWO) : 0 }; };
    const info = rings3.map(unwrap);
    let swapped = false;
    if (info.some((q) => q.wv)) {                                                       // rings round the tube of a torus: work with u and v exchanged, then the band logic below applies unchanged
      if (info.some((q) => q.wv && q.wu)) throw new Error('a face that winds around both directions of a torus cannot be meshed');
      info.forEach((q) => { q.pts = q.pts.map((p) => [p[1], p[0], p[2]]); q.wu = q.wv; q.wv = 0; }); swapped = true;
    }
    const wrap = info.filter((q) => q.wu !== 0);
    if (wrap.length === 0) {
      const ref = info[0].pts.reduce((a, p) => a + p[0], 0) / info[0].pts.length;
      uvr = info.map((q) => { const m = q.pts.reduce((a, p) => a + p[0], 0) / q.pts.length, sh = Math.round((ref - m) / TWO) * TWO; return q.pts.map((p) => [p[0] + sh, p[1], p[2]]); });
    } else if (wrap.length === 2 && wrap[0].wu === -wrap[1].wu && Math.abs(wrap[0].wu) === 1 && info.length === 2) {
      // a band round an axis (cylinder wall, cone frustum, sphere zone): cut along a generator to get one strip polygon
      const A = wrap[0], B = wrap[1], au = A.pts[0][0], uEnd = au + A.wu * TWO; let bi = 0, bd = Infinity;
      B.pts.forEach((p, i) => { const d = (((p[0] - au) % TWO) + TWO) % TWO, dd = Math.min(d, TWO - d); if (dd < bd) { bd = dd; bi = i; } });
      const Bp = B.pts.slice(bi).concat(B.pts.slice(0, bi)), sh = Math.round((uEnd - Bp[0][0]) / TWO) * TWO, Bs = Bp.map((p) => [p[0] + sh, p[1], p[2]]);
      const cut = (u, va, vb) => { const nc = kind === 'sphere' ? Math.max(1, Math.ceil(Math.abs(vb - va) / (TWO / Math.min(160, circleSegs(S.r, tol, minN))))) : 1, o = []; for (let k = 1; k < nc; k++) o.push([u, va + (vb - va) * k / nc]); return o; };
      const upc = cut(uEnd, A.pts[0][1], Bs[0][1]), dnc = cut(uEnd - A.wu * TWO, Bs[0][1], A.pts[0][1]);
      uvr = [A.pts.concat([[uEnd, A.pts[0][1], A.pts[0][2]]], upc, Bs, [[uEnd - A.wu * TWO, Bs[0][1], Bs[0][2]]], dnc)];
    } else if (wrap.length === 1 && info.length === 1 && Math.abs(wrap[0].wu) === 1 && (kind === 'sphere' || kind === 'cone')) {
      // a cap round a pole / apex: close the loop through the pole
      const A = wrap[0], vb = A.pts.reduce((a, p) => a + p[1], 0) / A.pts.length, au = A.pts[0][0], uEnd = au + A.wu * TWO, side = (A.wu > 0 ? 1 : -1) * (face.rev ? -1 : 1);
      const vPole = kind === 'sphere' ? side * Math.PI / 2 : S.apexV;
      if (kind === 'cone' && !Number.isFinite(vPole)) throw new Error('cone face without an apex'); if (kind === 'cone' && (vPole - vb) * side < 0) throw new Error('cone cap on the wrong side of its loop');
      const v0 = A.pts[0][1], nc = kind === 'sphere' ? Math.max(1, Math.ceil(Math.abs(vPole - v0) / (TWO / Math.min(160, circleSegs(S.r, tol, minN))))) : 1, up = [], down = [];
      for (let k = 1; k < nc; k++) { const v = v0 + (vPole - v0) * k / nc; up.push([uEnd, v]); down.unshift([au, v]); }
      uvr = [A.pts.concat([[uEnd, v0, A.pts[0][2]]], up, [[uEnd, vPole], [au, vPole]], down)];
    } else throw new Error('this face wraps around its surface in a way the mesher does not handle (' + kind + ')');
    if (swapped) uvr = uvr.map((r) => r.map((p) => [p[1], p[0], p[2]]));
  }
  // metric so that triangles are roughly isotropic in (u, v)
  let su = 1, sv = 1;
  if (kind === 'cylinder') su = S.r; else if (kind === 'cone') su = Math.max(S.r, 1e-9) + Math.abs(S.k) * 0.5; else if (kind === 'sphere') { su = S.r; sv = S.r; } else if (kind === 'torus') { su = S.R + S.r; sv = S.r; }
  const back = back0, P2 = [], P3 = [], rings = [];
  uvr.forEach((r) => { const idx = []; r.forEach((p) => { idx.push(P2.length); P2.push([p[0] * su, p[1] * sv]); P3.push(p[2] || back(p[0], p[1])); }); rings.push(idx); });
  const tris = triangulatePolygon(P2, rings); if (!tris.length) return [];
  const mesh = { P2, P3, tris };
  // interior points on an angular grid (not needed on planes, cylinders and cones: their triangles are exact between the boundary samples)
  if (kind === 'cylinder' || kind === 'cone') insertSteiner(mesh, rings, [], 1, () => null);
  if (kind === 'sphere' || kind === 'torus') {
    const rU = kind === 'sphere' ? S.r : S.R + S.r, rV = kind === 'sphere' ? S.r : S.r, nU = Math.min(160, circleSegs(rU, tol, minN)), nV = Math.min(160, circleSegs(rV, tol, minN)), du = TWO / nU * su, dv = TWO / nV * sv;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; P2.forEach((p) => { if (p[0] < u0) u0 = p[0]; if (p[0] > u1) u1 = p[0]; if (p[1] < v0) v0 = p[1]; if (p[1] > v1) v1 = p[1]; });
    const pts = []; for (let u = Math.ceil(u0 / du) * du; u < u1; u += du) for (let v = Math.ceil(v0 / dv) * dv; v < v1; v += dv) { if (pts.length > 40000) break; pts.push([u, v]); }
    insertSteiner(mesh, rings, pts, Math.min(du, dv) * 0.35, (p) => back(p[0] / su, p[1] / sv));
  }
  // every triangle is counter-clockwise in (u, v); one orientation for the whole face is decided by a vote of the well-shaped triangles against the surface normal
  let vote = 0; const tl = [];
  mesh.tris.forEach((t) => { if (!t) return; const a = mesh.P3[t[0]], b = mesh.P3[t[1]], c = mesh.P3[t[2]]; const n = V.cross(V.sub(b, a), V.sub(c, a)), L = V.len(n); if (L < 1e-18) return; tl.push([a, b, c]); const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; vote += V.dot(n, face.normalAt(cen)) / L; });
  const out = vote >= 0 ? tl : tl.map(([a, b, c]) => [a, c, b]);
  return out;
}
/** a whole sphere (a face with no boundary but its seam): latitude-longitude mesh */
function tessSphere(face, tol, minN) {
  const S = face.surf, n = Math.min(160, circleSegs(S.r, tol, minN)), m = Math.max(4, Math.ceil(n / 2)), out = [], P = [];
  for (let j = 0; j <= m; j++) { const v = -Math.PI / 2 + Math.PI * j / m, row = []; for (let i = 0; i < n; i++) row.push(j === 0 || j === m ? S.D(0, v).p : S.D(TWO_PI * i / n, v).p); P.push(row); }
  const push = (a, b, c) => { const nn = V.cross(V.sub(b, a), V.sub(c, a)); if (V.len(nn) < 1e-18) return; const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; out.push(V.dot(nn, face.normalAt(cen)) >= 0 ? [a, b, c] : [a, c, b]); };
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, a = P[j][i], b = P[j][i2], c = P[j + 1][i2], d = P[j + 1][i]; if (j === 0) push(a, c, d); else if (j === m - 1) push(a, b, d); else { push(a, b, c); push(a, c, d); } }
  return out;
}
const TWO_PI = 2 * Math.PI;
const area2 = (P, idx) => { let a = 0; for (let i = 0; i < idx.length; i++) { const p = P[idx[i]], q = P[idx[(i + 1) % idx.length]]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
/** ear clipping of an outer ring and holes (indices into P): the largest ring is the outer one; returns [[i,j,k]] counter-clockwise */
function triangulatePolygon(P, rings) {
  const R = rings.map((r) => r.slice()), ar = R.map((r) => area2(P, r)); let oi = 0; ar.forEach((a, i) => { if (Math.abs(a) > Math.abs(ar[oi])) oi = i; });
  const outer = ar[oi] >= 0 ? R[oi].slice() : R[oi].slice().reverse(), holes = R.filter((_, i) => i !== oi).map((r, i) => { const a = area2(P, r); return a <= 0 ? r.slice() : r.slice().reverse(); });
  // bridge each hole into the outer ring at its rightmost vertex (nearest visible outer vertex to the right)
  const poly = outer.slice(), cr = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
  holes.sort((a, b) => Math.max(...b.map((i) => P[i][0])) - Math.max(...a.map((i) => P[i][0])));
  const segX = (a, b, c, d) => { const o1 = cr(a, b, c), o2 = cr(a, b, d), o3 = cr(c, d, a), o4 = cr(c, d, b); return o1 * o2 < 0 && o3 * o4 < 0; };
  holes.forEach((h) => {
    let hi = 0; h.forEach((i, k) => { if (P[i][0] > P[h[hi]][0]) hi = k; }); const hv = h[hi]; let best = -1, bd = Infinity;
    poly.forEach((v, k) => { const d = Math.hypot(P[v][0] - P[hv][0], P[v][1] - P[hv][1]); if (d >= bd) return; let ok = true; for (let q = 0; q < poly.length && ok; q++) { const a = poly[q], b = poly[(q + 1) % poly.length]; if (a !== v && b !== v && segX(hv, v, a, b)) ok = false; } holes.forEach((h2) => { if (!ok) return; for (let q = 0; q < h2.length && ok; q++) { const a = h2[q], b = h2[(q + 1) % h2.length]; if (a !== hv && b !== hv && segX(hv, v, a, b)) ok = false; } }); if (ok) { bd = d; best = k; } });
    if (best < 0) best = 0; const ring = h.slice(hi).concat(h.slice(0, hi)); poly.splice(best + 1, 0, ...ring, hv, poly[best]);
  });
  const idx = poly.map((_, i) => i), tris = [], seg = (p, a, b) => { const l = Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]); return Math.abs(cr(a, b, p)) <= 1e-12 * (1 + l) * (1 + l) && (P[p][0] - P[a][0]) * (P[p][0] - P[b][0]) + (P[p][1] - P[a][1]) * (P[p][1] - P[b][1]) < 0; };
  // a vertex blocks an ear when it lies strictly inside the triangle or on its closing side; points on the two polygon sides are collinear neighbours and do not block
  const blocks = (p, a, b, c) => (cr(a, b, p) > 1e-14 && cr(b, c, p) > 1e-14 && cr(c, a, p) > 1e-14) || seg(p, c, a);
  const same = (a, b) => P[a][0] === P[b][0] && P[a][1] === P[b][1]; let guard = 0;
  while (idx.length > 3 && guard++ < 20 * poly.length) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const a = poly[idx[(i + idx.length - 1) % idx.length]], b = poly[idx[i]], c = poly[idx[(i + 1) % idx.length]]; if (cr(a, b, c) <= 1e-14) continue;
      let ok = true; for (let k = 0; k < idx.length && ok; k++) { const q = poly[idx[k]]; if (q !== a && q !== b && q !== c && !same(q, a) && !same(q, b) && !same(q, c) && blocks(q, a, b, c)) ok = false; }
      if (ok) { tris.push([a, b, c]); idx.splice(i, 1); cut = true; }
    }
    if (!cut) {   // numerically stuck: take the convex vertex with the smallest triangle
      let bi = -1, bv = Infinity; for (let i = 0; i < idx.length; i++) { const a = poly[idx[(i + idx.length - 1) % idx.length]], b = poly[idx[i]], c = poly[idx[(i + 1) % idx.length]], v = cr(a, b, c); if (v > 1e-14 && v < bv) { bv = v; bi = i; } }
      if (bi < 0) break; const a = poly[idx[(bi + idx.length - 1) % idx.length]], b = poly[idx[bi]], c = poly[idx[(bi + 1) % idx.length]]; tris.push([a, b, c]); idx.splice(bi, 1);
    }
  }
  if (idx.length === 3) tris.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]]); return tris.filter((t) => cr(t[0], t[1], t[2]) > 1e-16);
}
/** inserts the points that lie inside the polygon (not near its boundary) into the triangulation; Lawson flips never touch boundary edges */
/** the host's triangulator (rings of ids, id -> [x, y]) when there is one; otherwise the kernel's own ear clipping, so the kernel also runs on its own (AakarKernel.exe, node) */
function fallbackEC(rings, get) { const P = []; rings.forEach((r) => r.forEach((i) => { P[i] = get(i); })); return triangulatePolygon(P, rings); }
function insertSteiner(mesh, rings, pts, minDist, to3) {
  const { P2, P3 } = mesh, T = mesh.tris, bnd = new Set(); rings.forEach((r) => r.forEach((v, i) => { const w = r[(i + 1) % r.length]; bnd.add(v + ',' + w); bnd.add(w + ',' + v); }));
  const em = new Map(), key = (a, b) => a + ',' + b, addT = (t, i) => { em.set(key(t[0], t[1]), i); em.set(key(t[1], t[2]), i); em.set(key(t[2], t[0]), i); }, delT = (t) => { em.delete(key(t[0], t[1])); em.delete(key(t[1], t[2])); em.delete(key(t[2], t[0])); };
  T.forEach((t, i) => addT(t, i));
  const cr = (a, b, c) => (P2[b][0] - P2[a][0]) * (P2[c][1] - P2[a][1]) - (P2[b][1] - P2[a][1]) * (P2[c][0] - P2[a][0]);
  const inCircle = (a, b, c, d) => { const A = P2[a], B = P2[b], C = P2[c], D = P2[d], ax = A[0] - D[0], ay = A[1] - D[1], bx = B[0] - D[0], by = B[1] - D[1], cx = C[0] - D[0], cy = C[1] - D[1]; return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 1e-12; };
  const legalize = (a, b, p) => {   // triangle (a,b,p) lies on edge (a,b); check the neighbour across (b,a)
    if (bnd.has(a + ',' + b)) return; const ni = em.get(key(b, a)); if (ni === undefined) return; const n = T[ni]; if (!n) return; let d = -1; for (const v of n) if (v !== a && v !== b) d = v; if (d < 0) return;
    if (!inCircle(a, b, p, d)) return; const ti = em.get(key(a, b)); if (ti === undefined) return; const t = T[ti]; delT(t); delT(n); const t1 = [p, a, d], t2 = [p, d, b]; if (cr(...t1) <= 1e-16 || cr(...t2) <= 1e-16) { addT(t, ti); addT(n, ni); return; } T[ti] = t1; T[ni] = t2; addT(t1, ti); addT(t2, ni); legalize(a, d, p); legalize(d, b, p);
  };
  // 1. make the boundary triangulation Delaunay (ear clipping leaves long thin triangles that would chord across a curved surface)
  for (let pass = 0; pass < 400; pass++) { let flips = 0; for (let i = 0; i < T.length; i++) { const t = T[i]; if (!t) continue; for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3]; if (bnd.has(a + ',' + b)) continue; const ni = em.get(key(b, a)); if (ni === undefined) continue; const n = T[ni]; let d = -1; for (const v of n) if (v !== a && v !== b) d = v; if (d < 0 || !inCircle(a, b, c, d)) continue; const t1 = [c, a, d], t2 = [c, d, b]; if (cr(...t1) <= 1e-16 || cr(...t2) <= 1e-16) continue; delT(t); delT(n); T[i] = t1; T[ni] = t2; addT(t1, i); addT(t2, ni); flips++; break; } } if (!flips) break; }
  // 2. interior points, located by walking from the previous one
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = P2[r[i]], b = P2[r[j]]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const ar = rings.map((r) => Math.abs(area2(P2, r))); let oi = 0; ar.forEach((a, i) => { if (a > ar[oi]) oi = i; });
  const inPoly = (p) => { if (!inRing(p, rings[oi])) return false; for (let i = 0; i < rings.length; i++) if (i !== oi && inRing(p, rings[i])) return false; return true; };
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  // boundary distance through a coarse bucket grid
  const segs = []; rings.forEach((r) => r.forEach((v, i) => segs.push([P2[v], P2[r[(i + 1) % r.length]]])));
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; P2.forEach((p) => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); });
  const cell = Math.max(minDist * 2, 1e-9), gx = Math.max(1, Math.min(256, Math.ceil((bx1 - bx0) / cell))), gy = Math.max(1, Math.min(256, Math.ceil((by1 - by0) / cell))), cw = (bx1 - bx0) / gx || 1, ch = (by1 - by0) / gy || 1, bucket = new Map();
  const cidx = (x, y) => Math.min(gx - 1, Math.max(0, Math.floor((x - bx0) / cw))) * 100003 + Math.min(gy - 1, Math.max(0, Math.floor((y - by0) / ch)));
  segs.forEach((sg) => { const x0 = Math.min(sg[0][0], sg[1][0]) - minDist, x1 = Math.max(sg[0][0], sg[1][0]) + minDist, y0 = Math.min(sg[0][1], sg[1][1]) - minDist, y1 = Math.max(sg[0][1], sg[1][1]) + minDist; for (let i = Math.max(0, Math.floor((x0 - bx0) / cw)); i <= Math.min(gx - 1, Math.floor((x1 - bx0) / cw)); i++) for (let j = Math.max(0, Math.floor((y0 - by0) / ch)); j <= Math.min(gy - 1, Math.floor((y1 - by0) / ch)); j++) { const k = i * 100003 + j; let l = bucket.get(k); if (!l) bucket.set(k, l = []); l.push(sg); } });
  const nearB = (p) => { const l = bucket.get(cidx(p[0], p[1])); if (!l) return false; for (const sg of l) if (segDist(p, sg[0], sg[1]) < minDist) return true; return false; };
  let last = T.findIndex((t) => t); const eps = 1e-14;
  const locate = (id) => {
    let ti = last; for (let step = 0; step < 100000; step++) { const t = T[ti]; if (!t) break; let moved = false;
      for (let k = 0; k < 3 && !moved; k++) { if (cr(t[k], t[(k + 1) % 3], id) < -eps) { const ni = em.get(key(t[(k + 1) % 3], t[k])); if (ni === undefined) return -1; ti = ni; moved = true; } }
      if (!moved) return ti; }
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t && cr(t[0], t[1], id) > eps && cr(t[1], t[2], id) > eps && cr(t[2], t[0], id) > eps) return i; } return -1;
  };
  let guard = 0;
  pts.forEach((q) => {
    if (guard++ > 90000 || !inPoly(q) || nearB(q)) return; const id = P2.length; P2.push(q); const ti = locate(id);
    const t = ti >= 0 ? T[ti] : null; if (!t || !(cr(t[0], t[1], id) > eps && cr(t[1], t[2], id) > eps && cr(t[2], t[0], id) > eps)) { P2.pop(); return; }
    P3[id] = to3(q); const [a, b, c] = t; delT(t); const t0 = [a, b, id], t1 = [b, c, id], t2 = [c, a, id]; T[ti] = t0; T.push(t1, t2); addT(t0, ti); addT(t1, T.length - 2); addT(t2, T.length - 1); legalize(a, b, id); legalize(b, c, id); legalize(c, a, id); last = ti;
  });
}
/** soup [{pts, tag: face}] of a whole body */
function tessBody(body, res) {
  const bb = body.bbox(), scale = Math.max(1e-9, V.dist(bb.min, bb.max)), tol = resTol(res, scale), soup = [];
  body.faces.forEach((f) => { tessFace(f, tol, Math.max(res.minN || 16, 16)).forEach((t) => soup.push({ pts: t, tag: f })); });
  return soup;
}
AK.tessFace = tessFace; AK.tessBody = tessBody; AK.triangulatePolygon = triangulatePolygon; AK.insertSteiner = insertSteiner;

// ---------------------------------------------------------------- lazy model nodes + evaluation
const RES_EXACT = { tol: null, rel: 4e-3, minN: 32 };
const resKey = (r) => (r.tol == null ? 'n' : r.tol.toPrecision(4)) + '|' + r.rel + '|' + r.minN + (r.light ? '|L' : '');
class Node {
  constructor(kind, d) { this.kind = kind; Object.assign(this, d); this.cache = new Map(); this.id = ++NID; }
}
let NID = 0;
function soupBBox(soup) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; soup.forEach(t => t.pts.forEach(p => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } })); return { min: mn, max: mx }; }
const soupVolume = (soup) => { let v = 0; soup.forEach(t => { v += V.dot(t.pts[0], V.cross(t.pts[1], t.pts[2])) / 6; }); return v; };
function boolEval(node, res) {
    const a = evaluate(node.a, res), b = evaluate(node.b, res);
    const bb = soupBBox(a.soup.concat(b.soup)), scale = Math.max(1e-9, V.dist(bb.min, bb.max));
    const T0 = AK.debug ? Date.now() : 0; const polys = bspBoolean(node.op, a.soup, b.soup, scale); if (AK.debug) console.log('  bsp', Date.now() - T0, 'ms', polys.length, 'polys');
    if (!polys.length) throw new Error('the ' + node.op + ' is empty');
    const T1 = AK.debug ? Date.now() : 0; const r = reconstruct(polys, scale, res.light); if (AK.debug) console.log('  reconstruct', Date.now() - T1, 'ms'); const soup = r.tris.map(t => ({ pts: t.v.map(i => r.P[i].slice()), tag: r.body.faces[t.f] })), dsoup = r.tris.map(t => ({ pts: t.v.map(i => r.Pd[i].slice()), tag: r.body.faces[t.f] }));
    const va = Math.abs(soupVolume(a.soup)), vb = Math.abs(soupVolume(b.soup)), vr = soupVolume(soup), slack = 0.06 * (va + vb) + 1e-9 * scale ** 3;
    const lo = node.op === 'union' ? Math.max(va, vb) : 0, hi = node.op === 'union' ? va + vb : node.op === 'subtract' ? va : Math.min(va, vb);
    if (AK.guard !== false && (vr < lo - slack || vr > hi + slack)) throw new Error('boolean result failed the volume sanity check (' + vr.toPrecision(6) + ' not within ' + lo.toPrecision(6) + '..' + hi.toPrecision(6) + ')');
    let mp = null;
    if (res.light) { if (AK.guard !== false && !(vr > 1e-9 * scale ** 3)) throw new Error('the result encloses no volume'); }
    else {
      try { mp = massProps(r.body); } catch (e) { throw new Error('mass properties failed: ' + e.message); }
      if (AK.guard !== false && !(mp.volume > 0)) throw new Error('the result encloses no volume');
      if (AK.guard !== false && Math.abs(mp.volume - vr) > 0.04 * Math.max(mp.volume, vr) + 2e-3 * (va + vb)) throw new Error('exact and faceted volumes disagree (' + mp.volume.toPrecision(6) + ' vs ' + vr.toPrecision(6) + ')');
    }
    const ev = { body: r.body, soup, dsoup, scale, mp };
    return ev;
}
const RETRY_N = [37, 41, 53];
function boolAttempts(node, res) {
  let err = null;
  const tries = [res];
  if (!res.__retry) RETRY_N.forEach((m) => tries.push(Object.assign({}, res, { minN: Math.max(res.minN || 0, m), __retry: 1 })));
  const t0 = Date.now();
  for (const rs of tries) {
    if (rs !== res && Date.now() - t0 > 900) break;
    try { const ev = boolEval(node, rs); if (rs !== res) { AK.retries = (AK.retries || 0) + 1; } return ev; } catch (e) { if (!err) err = e; }
  }
  throw err;
}
function evaluate(node, res) {
  res = res || RES_EXACT; const k = resKey(res); let ev = node.cache.get(k); if (ev) return ev;
  if (node.kind === 'prim') { const soup = node.prim.tess(res); ev = { body: node.prim.body, soup }; }
  else if (node.kind === 'xf') {
    const c = evaluate(node.child, res), b = c.body.xf(node.T), idx = new Map(c.body.faces.map((f, i) => [f, i]));
    const flip = node.T.det() < 0, mp = (L) => L.map(t => ({ pts: (flip ? t.pts.slice().reverse() : t.pts).map(p => node.T.p(p)), tag: b.faces[idx.get(t.tag)] })); ev = { body: b, soup: mp(c.soup), dsoup: c.dsoup ? mp(c.dsoup) : null };
  } else if (node.kind === 'bool') {
    ev = boolAttempts(node, res);
  } else if (node.kind === 'brep') { let soup = node.soupFixed || null; if (!soup) { try { soup = tessBody(node.body, res); } catch (e) { soup = null; } } ev = { body: node.body, soup, dsoup: null }; }   // imported bodies are tessellated on demand
  else throw new Error('unknown node ' + node.kind);
  node.cache.set(k, ev); return ev;
}
const meshRes = (tol) => ({ tol: tol > 0 ? tol : null, rel: 0.005, minN: 24, light: true });
function toMesh(ev) {
  const dsoup = ev.dsoup || ev.soup; if (!dsoup) throw new Error('this body has no tessellation yet (imported STEP bodies are exact but not meshed)');
  const idx = new Map(ev.body.faces.map((f, i) => [f, i])), pos = [], ind = [], faces = [], map = new Map(), bb = soupBBox(dsoup), q = Math.max(1e-9, V.dist(bb.min, bb.max) * 1e-9);
  const vid = (p) => { const k = Math.round(p[0] / q) + ',' + Math.round(p[1] / q) + ',' + Math.round(p[2] / q); let i = map.get(k); if (i === undefined) { i = pos.length / 3; pos.push(p[0], p[1], p[2]); map.set(k, i); } return i; };
  dsoup.forEach(t => { const a = vid(t.pts[0]), b = vid(t.pts[1]), c = vid(t.pts[2]); if (a === b || b === c || a === c) return; ind.push(a, b, c); faces.push(idx.get(t.tag)); });
  return { positions: pos, indices: ind, faces };
}

AK._t = { Node, evaluate, toMesh, RES_EXACT, meshRes, soupVolume };

/** point membership of a model node by the exact primitive definitions */
function containsPoint(node, p) {
  if (node.kind === 'prim') return node.prim.inside(p);
  if (node.kind === 'xf') { const T = node.T, r = T.r, det = T.det(); const q = V.sub(p, T.t); const inv = [r[4] * r[8] - r[5] * r[7], r[2] * r[7] - r[1] * r[8], r[1] * r[5] - r[2] * r[4], r[5] * r[6] - r[3] * r[8], r[0] * r[8] - r[2] * r[6], r[2] * r[3] - r[0] * r[5], r[3] * r[7] - r[4] * r[6], r[1] * r[6] - r[0] * r[7], r[0] * r[4] - r[1] * r[3]].map(x => x / det); return containsPoint(node.child, [inv[0] * q[0] + inv[1] * q[1] + inv[2] * q[2], inv[3] * q[0] + inv[4] * q[1] + inv[5] * q[2], inv[6] * q[0] + inv[7] * q[1] + inv[8] * q[2]]); }
  const a = containsPoint(node.a, p), b = containsPoint(node.b, p);
  return node.op === 'union' ? a || b : node.op === 'subtract' ? a && !b : a && b;
}
AK._t.containsPoint = containsPoint;

// ---------------------------------------------------------------- STEP AP214 (ISO 10303-21) writer / reader for analytic B-reps
const fr = (x) => {
  if (!isFinite(x)) x = 0; if (Math.abs(x) < 1e-15) return '0.';
  let s = String(+x.toPrecision(15));
  if (/e/i.test(s)) { let [m, e] = s.toLowerCase().split('e'); if (!m.includes('.')) m += '.'; return m.toUpperCase() + 'E' + e.replace('+', ''); }
  return s.includes('.') ? s : s + '.';
};
const strq = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
function stepWrite(bodies, opts) {
  opts = opts || {}; bodies = Array.isArray(bodies) ? bodies : [bodies];
  const out = []; let id = 0; const E = (s) => { id++; out.push('#' + id + '=' + s + ';'); return '#' + id; };
  const ptc = new Map(), drc = new Map();
  const pt = (p) => { const k = p.map(x => x.toPrecision(15)).join(','); let r = ptc.get(k); if (!r) { r = E(`CARTESIAN_POINT('',(${fr(p[0])},${fr(p[1])},${fr(p[2])}))`); ptc.set(k, r); } return r; };
  const dir = (d) => { const k = d.map(x => x.toPrecision(15)).join(','); let r = drc.get(k); if (!r) { r = E(`DIRECTION('',(${fr(d[0])},${fr(d[1])},${fr(d[2])}))`); drc.set(k, r); } return r; };
  const ax2 = (o, z, x) => E(`AXIS2_PLACEMENT_3D('',${pt(o)},${dir(z)},${dir(x)})`);
  const appCtx = E("APPLICATION_CONTEXT('automotive design')");
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const prodCtx = E(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`), name = opts.name || 'Aakar_Part';
  const prod = E(`PRODUCT(${strq(name)},${strq(name)},'',(${prodCtx}))`);
  E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
  const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`), pdCtx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdCtx})`), pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const lu = E('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'), au = E('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'), su = E('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),${lu},'distance_accuracy_value','confusion accuracy')`);
  const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${lu},${au},${su})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const items = [ax2([0, 0, 0], [0, 0, 1], [1, 0, 0])];
  bodies.forEach((body, bi) => {
    const vmap = new Map(), emap = new Map(), smap = new Map();
    const vp = (v) => { let r = vmap.get(v); if (!r) { r = E(`VERTEX_POINT('',${pt(v.p)})`); vmap.set(v, r); } return r; };
    const curve = (e) => {
      if (e.kind === 'line') { const d = V.sub(e.v1.p, e.v0.p), L = V.len(d) || 1; return E(`LINE('',${pt(e.v0.p)},${E(`VECTOR('',${dir(V.mul(d, 1 / L))},${fr(L)})`)})`); }
      if (e.kind === 'circle') {
        let n = V.cross(e.x, e.y); const sw = e.a1 - e.a0;
        if (sw < 0) { n = V.neg(n); }                                   // a clockwise arc is a counter-clockwise one about the flipped axis
        const a0 = e.a0, xs = V.add(V.mul(e.x, Math.cos(a0)), V.mul(e.y, Math.sin(a0)));
        return E(`CIRCLE('',${ax2(e.c, n, xs)},${fr(e.r)})`);
      }
      let P = e.pts, m = P.length - 1;
      if (m <= 48) {   // short polyline: write it as it is (degree 1)
        const mult = ['2']; for (let i = 1; i < m; i++) mult.push('1'); mult.push('2');
        const kn = []; for (let i = 0; i <= m; i++) kn.push(fr(i));
        return E(`B_SPLINE_CURVE_WITH_KNOTS('',1,(${P.map(pt).join(',')}),.POLYLINE_FORM.,.F.,.F.,(${mult.join(',')}),(${kn.join(',')}),.UNSPECIFIED.)`);
      }
      // dense curve: thin it out and write a C1 cubic (Catmull-Rom → Bezier chain) that still passes through the kept points
      const stride = Math.max(1, Math.floor(m / 120)), K = []; for (let i = 0; i < m; i += stride) K.push(P[i]); K.push(P[m]);
      const n = K.length - 1, closed = V.dist(K[0], K[n]) < 1e-12, T = K.map((q, i) => { const a = K[i > 0 ? i - 1 : (closed ? n - 1 : 0)], b = K[i < n ? i + 1 : (closed ? 1 : n)]; return V.mul(V.sub(b, a), i === 0 && !closed || i === n && !closed ? 1 : 0.5); });
      const cps = [K[0]]; for (let i = 0; i < n; i++) { cps.push(V.madd(K[i], T[i], 1 / 3), V.madd(K[i + 1], T[i + 1], -1 / 3), K[i + 1]); }
      const mult = ['4']; for (let i = 1; i < n; i++) mult.push('3'); mult.push('4');
      const kn = []; for (let i = 0; i <= n; i++) kn.push(fr(i));
      return E(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${cps.map(pt).join(',')}),.UNSPECIFIED.,.F.,.F.,(${mult.join(',')}),(${kn.join(',')}),.UNSPECIFIED.)`);
    };
    const edgeEnt = (e) => {
      let r = emap.get(e); if (r) return r;
      r = E(`EDGE_CURVE('',${vp(e.v0)},${vp(e.v1)},${curve(e)},.T.)`); emap.set(e, r); return r;
    };
    const surfEnt = (s) => {
      let r = smap.get(s); if (r) return r;
      if (s.kind === 'plane') r = E(`PLANE('',${ax2(s.o, s.z, s.x)})`);
      else if (s.kind === 'cylinder') r = E(`CYLINDRICAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.r)})`);
      else if (s.kind === 'cone') {
        let z = s.z, k = s.k; if (k < 0) { z = V.neg(z); k = -k; }
        r = E(`CONICAL_SURFACE('',${ax2(s.o, z, s.x)},${fr(s.r)},${fr(Math.atan(k))})`);
      } else if (s.kind === 'sphere') r = E(`SPHERICAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.r)})`);
      else if (s.kind === 'torus') r = E(`TOROIDAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.R)},${fr(s.r)})`);
      else throw new Error('cannot write a ' + s.kind + ' surface');
      smap.set(s, r); return r;
    };
    const faceEnts = body.faces.map(f => {
      const loops = f.loops.map(l => {
        const oes = l.map(ce => { const e = ce.edge; return E(`ORIENTED_EDGE('',*,*,${edgeEnt(e)},${ce.fwd ? '.T.' : '.F.'})`); });
        return { ent: E(`EDGE_LOOP('',(${oes.join(',')}))`), l };
      });
      // outer bound: for a planar face the loop of largest positive area, otherwise the first loop
      let outer = 0;
      if (f.surf.kind === 'plane' && loops.length > 1) { let best = -Infinity; loops.forEach((lp, i) => { const a = V.dot(newell(f.loopPts(lp.l, 1e9, 32)), f.normalAt(f.surf.o)); if (a > best) { best = a; outer = i; } }); }
      const bnds = loops.map((lp, i) => E(`${i === outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${lp.ent},.T.)`));
      if (outer > 0) { const t = bnds[0]; bnds[0] = bnds[outer]; bnds[outer] = t; }
      return E(`ADVANCED_FACE('',(${bnds.join(',')}),${surfEnt(f.surf)},${f.rev ? '.F.' : '.T.'})`);
    });
    const shell = E(`CLOSED_SHELL('',(${faceEnts.join(',')}))`);
    items.push(E(`MANIFOLD_SOLID_BREP(${strq(bodies.length > 1 ? name + '_' + (bi + 1) : name)},${shell})`));
  });
  const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${strq(name)},(${items.join(',')}),${ctx})`);
  E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
  const now = new Date().toISOString().slice(0, 19);
  return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Aakar exact B-rep (AakarKernel)'),'2;1');", `FILE_NAME(${strq((opts.fileName || name) + '.step')},'${now}',('Aakar'),(''),'AakarKernel ${AK.version}','Aakar','');`, "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}

// ---- reader
function stepTokenize(src) {
  const toks = []; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
    if (c === "'") { let j = i + 1, s = ''; while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += src[j++]; } toks.push({ t: 's', v: s }); i = j + 1; continue; }
    if (c === '#') { let j = i + 1; while (j < n && /[0-9]/.test(src[j])) j++; toks.push({ t: 'r', v: +src.slice(i + 1, j) }); i = j; continue; }
    if (c === '.') { const m = /^\.([A-Z_0-9]+)\./.exec(src.slice(i, i + 40)); if (m) { toks.push({ t: 'e', v: m[1] }); i += m[0].length; continue; } }
    if (c === '(' || c === ')' || c === ',' || c === '=' || c === '$' || c === '*') { toks.push({ t: c }); i++; continue; }
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i, i + 40));
    if (m) { toks.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    const w = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i, i + 80)); if (w) { toks.push({ t: 'w', v: w[0].toUpperCase() }); i += w[0].length; continue; }
    i++;
  }
  return toks;
}
function stepParse(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const a = text.indexOf('DATA;'); if (a < 0) throw new Error('not a STEP file (no DATA section)');
  const b = text.indexOf('ENDSEC;', a), data = text.slice(a + 5, b < 0 ? text.length : b);
  const stmts = []; let cur = '', q = false;
  for (let i = 0; i < data.length; i++) { const c = data[i]; if (c === "'") q = !q; if (c === ';' && !q) { stmts.push(cur); cur = ''; } else cur += c; }
  const ents = new Map();
  for (const st of stmts) {
    const m = /^\s*#(\d+)\s*=\s*([\s\S]*)$/.exec(st); if (!m) continue;
    const toks = stepTokenize(m[2]); let p = 0;
    const val = () => {
      const t = toks[p++]; if (!t) return null;
      if (t.t === '(') { const L = []; while (toks[p] && toks[p].t !== ')') { L.push(val()); if (toks[p] && toks[p].t === ',') p++; } p++; return L; }
      if (t.t === 'w') { if (toks[p] && toks[p].t === '(') { p++; const L = []; while (toks[p] && toks[p].t !== ')') { L.push(val()); if (toks[p] && toks[p].t === ',') p++; } p++; return { type: t.v, args: L }; } return { type: t.v, args: [] }; }
      if (t.t === 'r') return { ref: t.v }; if (t.t === 'n' || t.t === 's') return t.v; if (t.t === 'e') return { en: t.v }; if (t.t === '$') return null; if (t.t === '*') return '*'; return null;
    };
    const v = val(); ents.set(+m[1], v);
  }
  return ents;
}
function stepRead(text, opts) {
  const ents = stepParse(text), memo = new Map(), skipped = [];
  const get = (r) => { const e = ents.get(r.ref); if (e === undefined) throw new Error('missing STEP entity #' + r.ref); return e; };
  // complex entities are a list of {type,args}: merge them into one lookup
  const typeOf = (e) => (Array.isArray(e) ? e.map(x => x.type).join('+') : e.type);
  const part = (e, t) => (Array.isArray(e) ? e.find(x => x.type === t) : (e.type === t ? e : null));
  let scale = 1;
  for (const e of ents.values()) { const lu = Array.isArray(e) ? part(e, 'LENGTH_UNIT') : null; if (lu) { const si = part(e, 'SI_UNIT'); if (si) { const pre = si.args[0] && si.args[0].en; scale = pre === 'MILLI' ? 1 : pre === 'CENTI' ? 10 : pre === 'KILO' ? 1e6 : pre === 'MICRO' ? 1e-3 : 1000; } break; } const cb = Array.isArray(e) ? part(e, 'CONVERSION_BASED_UNIT') : null; if (cb && Array.isArray(e) && part(e, 'LENGTH_UNIT')) { scale = 25.4; break; } }
  const memoize = (r, fn) => { if (memo.has(r.ref)) return memo.get(r.ref); const v = fn(); memo.set(r.ref, v); return v; };
  const P3 = (r) => memoize(r, () => { const e = get(r); return e.args[1].map(x => x * scale); });
  const D3 = (r) => memoize(r, () => V.norm(get(r).args[1]));
  const A2 = (r) => memoize(r, () => { const e = get(r); const o = P3(e.args[1]), z = e.args[2] ? D3(e.args[2]) : [0, 0, 1], x = e.args[3] ? D3(e.args[3]) : null; return frame(o, z, x); });
  const surface = (r) => memoize(r, () => {
    const e = get(r), t = typeOf(e);
    if (t === 'PLANE') return new Plane(A2(e.args[1]));
    if (t === 'CYLINDRICAL_SURFACE') return new Cylinder(A2(e.args[1]), e.args[2] * scale);
    if (t === 'CONICAL_SURFACE') return new Cone(A2(e.args[1]), e.args[2] * scale, Math.tan(e.args[3]));
    if (t === 'SPHERICAL_SURFACE') return new Sphere(A2(e.args[1]), e.args[2] * scale);
    if (t === 'TOROIDAL_SURFACE') return new Torus(A2(e.args[1]), e.args[2] * scale, e.args[3] * scale);
    throw new Error('unsupported STEP surface ' + t);
  });
  const vert = (r) => memoize(r, () => new Vertex(P3(get(r).args[1])));
  const bsplinePoints = (e) => {
    let deg, cps, mult, kv, w = null;
    if (Array.isArray(e)) { const c = part(e, 'B_SPLINE_CURVE'), kn = part(e, 'B_SPLINE_CURVE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_CURVE'); deg = c.args[0]; cps = c.args[1].map(P3); mult = kn.args[0]; kv = kn.args[1]; w = rat ? rat.args[0] : null; }
    else { deg = e.args[1]; cps = e.args[2].map(P3); mult = e.args[6]; kv = e.args[7]; }
    const knots = []; kv.forEach((k, i) => { for (let j = 0; j < mult[i]; j++) knots.push(k); });
    if (deg === 1) return cps;
    const out = [], t0 = knots[deg], t1 = knots[knots.length - deg - 1], N = Math.max(64, cps.length * 24);
    for (let s = 0; s <= N; s++) { const t = t0 + (t1 - t0) * s / N; out.push(deBoor(deg, knots, cps, w, t)); }
    return out;
  };
  function deBoor(p, U, Pc, W, t) {
    let k = p; while (k < Pc.length - 1 && t >= U[k + 1]) k++;
    const d = []; for (let j = 0; j <= p; j++) { const i = j + k - p, w = W ? W[i] : 1; d.push([Pc[i][0] * w, Pc[i][1] * w, Pc[i][2] * w, w]); }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) { const den = U[j + 1 + k - r] - U[j + k - p], al = den === 0 ? 0 : (t - U[j + k - p]) / den; for (let c = 0; c < 4; c++) d[j][c] = (1 - al) * d[j - 1][c] + al * d[j][c]; }
    return [d[p][0] / d[p][3], d[p][1] / d[p][3], d[p][2] / d[p][3]];
  }
  const edge = (r) => memoize(r, () => {
    const e = get(r); const v0 = vert(e.args[1]), v1 = vert(e.args[2]); let cur = get(e.args[3]); while (['SURFACE_CURVE', 'SEAM_CURVE', 'INTERSECTION_CURVE', 'BOUNDED_SURFACE_CURVE'].indexOf(typeOf(cur)) >= 0) cur = get(cur.args[1]);   // other CAD systems wrap the 3D curve with its pcurves
    const same = !(e.args[4] && e.args[4].en === 'F'), t = typeOf(cur);
    let a = v0, b = v1;
    if (t === 'LINE') return new Edge('line', a, b);
    if (t === 'CIRCLE') {
      const fr_ = A2(cur.args[1]), rad = cur.args[2] * scale, ang = (p) => { const d = V.sub(p, fr_.o); return Math.atan2(V.dot(d, fr_.y), V.dot(d, fr_.x)); };
      const a0 = ang(a.p); let sw;
      if (a === b) sw = TAU; else { let d = ang(b.p) - a0; d = ((d % TAU) + TAU) % TAU; sw = d; }
      if (!same) { if (a === b) sw = -TAU; else sw = sw - TAU; }
      // frame of the edge: x points at the start vertex, y completes the right-handed frame about the circle axis
      const x = V.norm(V.sub(a.p, fr_.o)); return new Edge('circle', a, b, { c: fr_.o, x, y: V.cross(fr_.z, x), r: rad, a0: 0, a1: sw });
    }
    let pts;
    if (t === 'ELLIPSE') { const fr_ = A2(cur.args[1]), A = cur.args[2] * scale, B = cur.args[3] * scale; const ang = (p) => { const d = V.sub(p, fr_.o); return Math.atan2(V.dot(d, fr_.y) / B, V.dot(d, fr_.x) / A); }; const a0 = ang(a.p); let sw = a === b ? TAU : ((ang(b.p) - a0) % TAU + TAU) % TAU; if (!same) sw = sw - TAU; pts = []; const N = 96; for (let i = 0; i <= N; i++) { const th = a0 + sw * i / N; pts.push(V.add(fr_.o, V.add(V.mul(fr_.x, A * Math.cos(th)), V.mul(fr_.y, B * Math.sin(th))))); } pts[0] = a.p; pts[N] = b.p; return new Edge('poly', a, b, { pts }); }
    if (t.indexOf('B_SPLINE_CURVE') >= 0) {
      pts = bsplinePoints(cur); if (!same) pts = pts.slice().reverse();
      // trim to the vertices when the edge covers only part of the curve
      const near = (p) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = V.dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; };
      let i0 = near(a.p), i1 = near(b.p); if (a !== b && i1 > i0) pts = pts.slice(i0, i1 + 1); else if (a !== b && i0 > i1) pts = pts.slice(i1, i0 + 1).reverse();
      pts = pts.slice(); pts[0] = a.p; pts[pts.length - 1] = b.p; return new Edge('poly', a, b, { pts });
    }
    throw new Error('unsupported STEP curve ' + t);
  });
  const bodies = [];
  for (const [id, e] of ents) {
    if (!e || e.type !== 'MANIFOLD_SOLID_BREP') continue;
    const sh = get(e.args[1]); if (sh.type !== 'CLOSED_SHELL') continue;
    let faces; try { faces = sh.args[1].map(fr_ => {
      const f = get(fr_), surf = surface(f.args[2]), rev = f.args[3] && f.args[3].en === 'F';
      const loops = f.args[1].map(br => {
        const b = get(br), lp = get(b.args[1]); if (lp.type === 'VERTEX_LOOP') return null; if (lp.type !== 'EDGE_LOOP') throw new Error('unsupported face bound ' + lp.type);
        let ces = lp.args[1].map(or => { const o = get(or), ed = edge(o.args[3]), fwd = !(o.args[4] && o.args[4].en === 'F'); return { edge: ed, fwd }; });
        if (b.args[2] && b.args[2].en === 'F') ces = ces.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd }));
        return ces;
      }).filter(Boolean);
      return new Face(surf, rev, loops);
    }); } catch (err) { if (opts && opts.tolerant && /unsupported STEP (surface|curve)/.test(String(err.message))) { skipped.push(id); continue; } throw err; }
    bodies.push({ body: new Body(faces), name: e.args[0] || ('solid' + id), id });
  }
  bodies.skipped = skipped;
  if (!bodies.length && !(opts && opts.tolerant && skipped.length)) throw new Error('the STEP file contains no MANIFOLD_SOLID_BREP');
  return bodies;
}
AK.stepWrite = stepWrite; AK.stepRead = stepRead; AK.stepParse = stepParse;

// ---------------------------------------------------------------- public kernel interface (the contract Aakar's exact-kernel panel expects, plus analysis extras)
AK.version = '1.4.0';
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

G.AakarKernel = AK;
})(typeof window !== 'undefined' ? window : globalThis);

// ---------------------------------------------------------------- AakarKernel 1.2: exact edge rounding (fillet and chamfer)
// A round is a boolean: body - cutter, where the cutter is built from exact primitives, so the new face is a true cylinder or cone.
// Straight fillets / chamfers and circular chamfers are verified at several mesh resolutions. Circular FILLETS (torus) are tangent to two surfaces, which the BSP boolean cannot yet handle reliably: they are refused with an error so that the caller falls back to the faceted engine.
//   spec {kind:'line',   p0, p1, nA, nB}                      straight edge between two planar faces that meet at 90 degrees (outward normals nA, nB)
//   spec {kind:'circle', c, n, R, boss}                       circular rim: planar face with outward normal n, coaxial cylinder; boss = material inside the circle
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.roundEdge) return;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => { const l = len(a); if (!(l > 1e-12)) throw new Error('degenerate direction'); return mul(a, 1 / l); };
  /** place a model that was built in the local frame (x = a, y = b, z = c, origin o) */
  function place(h, a, b, c, o) {
    // rotation matrix columns a, b, c -> axis-angle
    const m = [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]], tr = m[0][0] + m[1][1] + m[2][2], cs = Math.max(-1, Math.min(1, (tr - 1) / 2)); let ang = Math.acos(cs), ax;
    if (ang < 1e-9) ax = null;
    else if (Math.PI - ang < 1e-6) { // 180 degrees: axis from the largest diagonal
      const d = [m[0][0], m[1][1], m[2][2]], i = d.indexOf(Math.max(d[0], d[1], d[2])), v = [0, 0, 0]; v[i] = Math.sqrt(Math.max(0, (m[i][i] + 1) / 2)); const j = (i + 1) % 3, k = (i + 2) % 3; v[j] = (m[i][j] + m[j][i]) / (4 * v[i]); v[k] = (m[i][k] + m[k][i]) / (4 * v[i]); ax = unit(v);
    } else ax = unit([m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]]);
    return K.translate(ax ? K.rotate(h, ax, ang, [0, 0, 0]) : h, o);
  }
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  /** fillet or chamfer on an edge whose two faces meet at any angle (convex edge): a cross-section polygon, turned into a prism */
  function slantCutter(s, nA, nB, type, size, v) {
    const d = sub(s.p1, s.p0), L = len(d); need(L > 1e-9, 'the edge has no length'); const dn = mul(d, 1 / L);
    need(Math.abs(dot(nA, nB)) < 1 - 1e-6, 'the two faces are (almost) parallel');
    // directions that run away from the edge inside each face
    let tA = cross(nA, dn); if (dot(tA, nB) > 0) tA = mul(tA, -1); tA = unit(tA); let tB = cross(nB, dn); if (dot(tB, nA) > 0) tB = mul(tB, -1); tB = unit(tB);
    const cg = dot(tA, tB), gam = Math.acos(Math.max(-1, Math.min(1, cg))); need(gam > 0.02 && gam < Math.PI - 0.02, 'the faces meet at too sharp or too flat an angle to round');
    const X = tA, Yv = sub(tB, mul(tA, cg)), Y = unit(Yv); let Z = cross(X, Y); const o = dot(Z, d) >= 0 ? s.p0 : s.p1;
    const loc = (w) => [dot(w, X), dot(w, Y)], A2 = loc(nA), B2 = loc(nB), tB2 = [Math.cos(gam), Math.sin(gam)];
    const e = Math.max(size * 0.05, 1e-6 * L), z0 = v.ext ? v.ext * Math.max(size * 0.01, 1e-4 * L) : 0, Lx = L + 2 * z0, m = size * 3 + 1;
    const P = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k], corner = P(P([0, 0], A2, m), B2, m);
    let poly, T1, T2, C = null, tl, bi0 = null;
    if (type === 'fillet') throw new Error('slant fillets are made by roundSlant');
    { T1 = [size, 0]; T2 = [size * tB2[0], size * tB2[1]]; poly = [T1, P(T1, A2, m), corner, P(T2, B2, m), T2]; }
    // counter-clockwise outline
    let ar = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; ar += p[0] * q[1] - q[0] * p[1]; } if (ar < 0) poly.reverse();
    const segs = poly.map((p, i) => ({ k: 'l', a: p, b: poly[(i + 1) % poly.length] }));
    let h = K.translate(K.extrude([{ segs }], Lx), [0, 0, -z0]);
    if (type === 'fillet') h = K.cut(h, K.translate(K.cylinder(size, Lx + 2 * e), [C[0] - (v.k ? bi0[0] * size * v.k : 0), C[1] - (v.k ? bi0[1] * size * v.k : 0), -z0 - e]));
    return place(h, X, Y, Z, o);
  }
  function lineCutter(s, type, size, v) {
    const nA = unit(s.nA), nB = unit(s.nB);
    if (Math.abs(dot(nA, nB)) >= 1e-4) return slantCutter(s, nA, nB, type, size, v);   // any other angle between the two faces
    const d = sub(s.p1, s.p0), L = len(d); need(L > 1e-9, 'the edge has no length');
    const ex = mul(nA, -1), ey = mul(nB, -1); let ez = cross(ex, ey); const o = dot(ez, d) >= 0 ? s.p0 : s.p1; const e = Math.max(size * 0.05, 1e-6 * L), z0 = v.ext ? v.ext * Math.max(size * 0.01, 1e-4 * L) : 0, Lx = L + 2 * z0;
    if (type === 'fillet') {
      const box = K.translate(K.box(size + e, size + e, Lx), [-e, -e, -z0]), cyl = K.translate(K.cylinder(size, Lx + 2 * e), [size, size, -z0 - e]);
      return place(K.cut(box, cyl), ex, ey, ez, o);
    }
    // chamfer: a square turned 45 degrees; one side lies on the chamfer plane and the rest reaches outside the part
    const a = unit(sub(ex, ey)), m = unit(add(ex, ey)), b = mul(m, -1), c = cross(a, b), w = size * Math.SQRT2, D = size * Math.SQRT2;
    const oc = dot(ez, d) >= 0 ? s.p1 : s.p0, mid = add(add(oc, mul(ex, size / 2)), mul(ey, size / 2));
    return place(K.box(w, D, Lx), a, b, c, add(sub(mid, mul(a, w / 2)), mul(c, -z0)));
  }
  function circleCutter(s, type, size, v) {
    const n = unit(s.n), R = s.R, r = size, e = Math.max(r * 0.05, 1e-6 * R); need(R > r * 1.0001, 'the edge is smaller than the round');
    let ux = cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]); ux = unit(ux); const uy = cross(n, ux);
    const dz = 0, rt = r * (1 + (v.k || 0)); let h;
    if (type === 'fillet') {
      if (s.boss) {
        need(R > 2 * r * 1.0001, 'the round needs the circle to be more than twice as wide');
        const ringB = K.cut(K.translate(K.cylinder(R + e, r + e), [0, 0, -r]), K.translate(K.cylinder(R - r, r + 3 * e), [0, 0, -r - e]));
        h = K.cut(ringB, K.translate(K.torus(R - r, rt), [0, 0, -r - dz]));
      } else {
        const ringB = K.cut(K.translate(K.cylinder(R + r, r + e), [0, 0, -r]), K.translate(K.cylinder(R - e, r + 3 * e), [0, 0, -r - e]));
        h = K.cut(ringB, K.translate(K.torus(R + r, rt), [0, 0, -r - dz]));
      }
    } else if (s.boss) {
      need(R > r + 2 * e, 'the bevel is wider than the circle');
      h = K.cut(K.translate(K.cylinder(R + e, r + 2 * e), [0, 0, -r]), K.translate(K.cone(R + e, R - r - e, r + 2 * e), [0, 0, -r - e]));
    } else {
      h = K.translate(K.cone(R - e, R + r + e, r + 2 * e), [0, 0, -r - e]);
    }
    return place(h, ux, uy, n, s.c);
  }
  const VARIANTS_LINE = [{ ext: 0, k: 0 }, { ext: 1, k: 0 }], VARIANTS_FILLET_CIRCLE = [{ ext: 0, k: 0 }, { ext: 0, k: 2e-3 }], VARIANTS = VARIANTS_LINE;
  K.roundCutter = (spec, type, size, v) => { need(type === 'fillet' || type === 'chamfer', 'type must be fillet or chamfer'); need(size > 0, 'size must be positive'); v = v || VARIANTS[0]; return spec.kind === 'circle' ? circleCutter(spec, type, size, v) : lineCutter(spec, type, size, v); };
  /** body - cutter. The first cutter that the boolean accepts is used (touching and tangent surfaces make some placements numerically fragile). */
  /** fillet on an edge between two flat faces at any angle: cut the corner flat at the tangent points (a chamfer), then add the round segment back.
   *  Both steps are robust: no surface is tangent to a face of the other body, they only share edges. */
  K.roundSlant = (h, spec, size) => {
    const nA = unit(spec.nA), nB = unit(spec.nB), d = sub(spec.p1, spec.p0), L = len(d), dn = mul(d, 1 / L);
    let tA = cross(nA, dn); if (dot(tA, nB) > 0) tA = mul(tA, -1); tA = unit(tA); let tB = cross(nB, dn); if (dot(tB, nA) > 0) tB = mul(tB, -1); tB = unit(tB);
    const cg = dot(tA, tB), gam = Math.acos(Math.max(-1, Math.min(1, cg))); need(gam > 0.02 && gam < Math.PI - 0.02, 'the faces meet at too sharp or too flat an angle to round');
    const tl = size / Math.tan(gam / 2), cd = size / Math.sin(gam / 2);
    const X = tA, Y = unit(sub(tB, mul(tA, cg))), Z = cross(X, Y), o = dot(Z, d) >= 0 ? spec.p0 : spec.p1, tB2 = [Math.cos(gam), Math.sin(gam)];
    const bi = unit([1 + tB2[0], tB2[1], 0]), C = [bi[0] * cd, bi[1] * cd], T1 = [tl, 0], T2 = [tl * tB2[0], tl * tB2[1]];
    const a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]); let sw = Math.atan2(T2[1] - C[1], T2[0] - C[0]) - a0; while (sw > Math.PI) sw -= 2 * Math.PI; while (sw < -Math.PI) sw += 2 * Math.PI;
    let seg = K.extrude([{ segs: [{ k: 'l', a: T2, b: T1 }, { k: 'a', c: C, r: size, a0, a1: a0 + sw }] }], L);
    if (K.volume(seg) < 0) seg = K.extrude([{ segs: [{ k: 'l', a: T1, b: T2 }, { k: 'a', c: C, r: size, a0: a0 + sw, a1: a0 }] }], L);
    const flat = K.roundEdge(h, spec, 'chamfer', tl);
    return K.fuse(flat, place(seg, X, Y, Z, o));
  };
  K.roundEdge = (h, spec, type, size, tol) => {
    let last = null;
    if (spec.kind === 'line' && type === 'fillet' && Math.abs(dot(unit(spec.nA), unit(spec.nB))) >= 1e-4) { const node = K.roundSlant(h, spec, size); K.volume(node); [size * 0.05, size * 0.01].forEach((t) => K.mesh(node, t)); return node; }
    if (spec.kind === 'circle' && type === 'fillet' && K.roundRim) { try { const node = K.roundRim(h, spec, size); K.volume(node); K.mesh(node, size * 0.05); return node; } catch (e) { last = e; } }
    for (const v of (spec.kind === 'circle' && type === 'fillet' ? VARIANTS_FILLET_CIRCLE : VARIANTS_LINE)) { try { const node = K.cut(h, K.roundCutter(spec, type, size, v)); K.volume(node); [size * 0.05, size * 0.01, size * 0.002].concat(tol > 0 ? [tol] : []).forEach((t) => K.mesh(node, t)); return node; } catch (e) { last = e; if (/only right-angle|more than twice|smaller than the round|wider than the circle|positive|no length/.test(e.message)) throw e; } }
    throw last;
  };
  K.features = (K.features || []).concat(['round-edges', 'round-rim-torus', 'mirror', 'polyhedron', 'trimmed-torus-massprops', 'boolean-retry']);
  K.version = AK.version = '1.4.0';
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);
// ---------------------------------------------------------------- AakarKernel 1.4: freeform (NURBS) solids
// Rational B-spline curves and surfaces, and solids that are bounded by them: extrude, revolve, loft and sweep of CURVED profiles (lines, true arcs and circles,
// splines).  Surfaces are true NURBS (a circle is an exact rational quadratic, a revolved arc an exact sphere/torus patch), volume / area / centroid / inertia are
// integrated on the surfaces with the divergence theorem (Gauss-Legendre per knot span, not on a mesh) and the solid is written to STEP as B_SPLINE_SURFACE faces
// with shared B_SPLINE_CURVE edges.  Booleans with these solids still go through the faceted lane (tessellate -> BSP); NURBS/NURBS booleans are not part of this kernel.
//   AK.nurbs.arc/circle/line/polyline/interp/fromControl      curves        (segment lists = closed composite profiles, ordered, end to start)
//   AK.nurbs.extrude / revolve / loft / sweep                 -> solid {faces, topo}
//   AK.nurbs.massProps / check / mesh / stepWrite             analysis, validation, tessellation, STEP
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.nurbs) return;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => { const l = len(a); if (!(l > 1e-14)) throw new Error('degenerate direction'); return mul(a, 1 / l); };
  // ---- B-spline basis (Piegl & Tiller)
  function span(n, p, u, U) { if (u >= U[n + 1]) return n; if (u <= U[p]) return p; let lo = p, hi = n + 1, mid = (lo + hi) >> 1; while (u < U[mid] || u >= U[mid + 1]) { if (u < U[mid]) hi = mid; else lo = mid; mid = (lo + hi) >> 1; } return mid; }
  function basis(i, u, p, U) { const N = [1], L = [], R = []; for (let j = 1; j <= p; j++) { L[j] = u - U[i + 1 - j]; R[j] = U[i + j] - u; let s = 0; for (let r = 0; r < j; r++) { const t = N[r] / (R[r + 1] + L[j - r]); N[r] = s + R[r + 1] * t; s = L[j - r] * t; } N[j] = s; } return N; }
  function ders1(i, u, p, U) {   // N_{i-p..i,p}(u) and its first derivative, arrays of length p+1
    const N = basis(i, u, p, U); if (p === 0) return [N, N.map(() => 0)];
    const Nl = basis(i, u, p - 1, U), out = new Array(p + 1).fill(0);
    for (let j = 0; j <= p; j++) { const gi = i - p + j; let t = 0; if (j - 1 >= 0) { const dn = U[gi + p] - U[gi]; if (dn > 0) t += Nl[j - 1] / dn; } if (j <= p - 1) { const dn = U[gi + p + 1] - U[gi + 1]; if (dn > 0) t -= Nl[j] / dn; } out[j] = p * t; }
    return [N, out];
  }
  // ---- curves  {p, U, P:[[x,y,z]], w:[..]}
  const clampedKnots = (n, p) => { const U = []; for (let i = 0; i <= p; i++) U.push(0); for (let j = 1; j <= n - p; j++) U.push(j / (n - p + 1)); for (let i = 0; i <= p; i++) U.push(1); return U; };
  const curve = (p, U, P, w) => ({ p, U, P, w: w || P.map(() => 1) });
  function cEval(c, u, d) {
    const n = c.P.length - 1, s = span(n, c.p, u, c.U), [N, D] = ders1(s, u, c.p, c.U); let A = [0, 0, 0], Ad = [0, 0, 0], W = 0, Wd = 0;
    for (let j = 0; j <= c.p; j++) { const k = s - c.p + j, w = c.w[k]; A = add(A, mul(c.P[k], N[j] * w)); W += N[j] * w; Ad = add(Ad, mul(c.P[k], D[j] * w)); Wd += D[j] * w; }
    const pt = mul(A, 1 / W); return d ? { p: pt, d: mul(sub(Ad, mul(pt, Wd)), 1 / W) } : pt;
  }
  const dom = (c) => [c.U[c.p], c.U[c.P.length]];
  const line = (a, b) => curve(1, [0, 0, 1, 1], [a, b]);
  function polyline(pts) { const n = pts.length - 1, U = [0]; let L = 0; const cum = [0]; for (let i = 1; i <= n; i++) { L += len(sub(pts[i], pts[i - 1])); cum.push(L); } cum.forEach((x) => U.push(x / L)); U.push(1); return curve(1, U, pts.map((q) => q.slice())); }
  /** exact rational arc (Piegl A7.1): centre o, orthonormal x, y, radius r, angles a0..a1 (radians) */
  function arc(o, x, y, r, a0, a1) {
    let th = a1 - a0; if (th < 0) th += 2 * Math.PI; if (Math.abs(a1 - a0 - 2 * Math.PI) < 1e-12) th = 2 * Math.PI;
    const narcs = th <= Math.PI / 2 + 1e-12 ? 1 : th <= Math.PI + 1e-12 ? 2 : th <= 1.5 * Math.PI + 1e-12 ? 3 : 4, dth = th / narcs, w1 = Math.cos(dth / 2);
    const at = (a) => add(o, add(mul(x, r * Math.cos(a)), mul(y, r * Math.sin(a)))), tan = (a) => add(mul(x, -r * Math.sin(a)), mul(y, r * Math.cos(a)));
    const P = [at(a0)], w = [1]; let ang = a0, P0 = P[0], T0 = tan(a0);
    for (let i = 1; i <= narcs; i++) { ang += dth; const P2 = at(ang), T2 = tan(ang); // intersection of the two tangent lines
      const d = sub(P2, P0), cr = cross(T0, T2), t = dot(cross(d, T2), cr) / dot(cr, cr), P1 = add(P0, mul(T0, t)); P.push(P1, P2); w.push(w1, 1); P0 = P2; T0 = T2; }
    const n = 2 * narcs, U = [0, 0, 0]; for (let i = 1; i < narcs; i++) { U.push(i / narcs, i / narcs); } U.push(1, 1, 1); return curve(2, U, P, w);
  }
  const circle = (o, x, y, r) => arc(o, x, y, r, 0, 2 * Math.PI);
  /** non-rational curve from control points (clamped uniform knots) */
  function fromControl(p, P, w) { return curve(p, clampedKnots(P.length - 1, p), P.map((q) => q.slice()), w); }
  /** solve A X = B (n x n, B n x m) */
  function solve(A, B) { const n = A.length, m = B[0].length, M = A.map((r, i) => r.concat(B[i])); for (let c = 0; c < n; c++) { let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r; if (Math.abs(M[pv][c]) < 1e-14) throw new Error('interpolation is singular (repeated points?)'); [M[c], M[pv]] = [M[pv], M[c]]; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; if (f) for (let k = c; k < n + m; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r.slice(n).map((v) => v / M[i][i])); }
  /** global interpolation (A9.1): returns {U, P} through the homogeneous points Q (each [x*w,y*w,z*w,w]) at parameters ub */
  function interpH(Q, ub, p) {
    const n = Q.length - 1, U = []; for (let i = 0; i <= p; i++) U.push(0); for (let j = 1; j <= n - p; j++) { let s = 0; for (let i = j; i <= j + p - 1; i++) s += ub[i]; U.push(s / p); } for (let i = 0; i <= p; i++) U.push(1);
    const A = ub.map((u) => { const row = new Array(n + 1).fill(0), s = span(n, p, u, U), N = basis(s, u, p, U); for (let j = 0; j <= p; j++) row[s - p + j] = N[j]; return row; });
    return { U, X: solve(A, Q) };
  }
  /** interpolating cubic (or lower degree) spline through points, chord-length parametrised */
  function interp(pts, p) {
    p = Math.min(p || 3, pts.length - 1); const ub = [0]; let L = 0; for (let i = 1; i < pts.length; i++) { L += len(sub(pts[i], pts[i - 1])); ub.push(L); } if (!(L > 0)) throw new Error('interpolation points coincide'); for (let i = 0; i < ub.length; i++) ub[i] /= L; ub[ub.length - 1] = 1;
    const r = interpH(pts.map((q) => [q[0], q[1], q[2], 1]), ub, p); return curve(p, r.U, r.X.map((q) => [q[0], q[1], q[2]]), r.X.map(() => 1));
  }
  const cSample = (c, n) => { const [a, b] = dom(c), o = []; for (let i = 0; i <= n; i++) o.push(cEval(c, a + (b - a) * i / n)); return o; };
  const cReverse = (c) => { const [a, b] = dom(c); return curve(c.p, c.U.map((u) => a + b - u).reverse(), c.P.slice().reverse(), c.w.slice().reverse()); };
  const cMap = (c, f) => curve(c.p, c.U.slice(), c.P.map(f), c.w.slice());
  const sameStruct = (a, b) => a.p === b.p && a.P.length === b.P.length && a.U.every((u, i) => Math.abs(u - b.U[i]) < 1e-12);
  // ---- surfaces  {p, q, U, V, P[i][j], w[i][j]}  (i along u, j along v)
  function sEval(S, u, v, nd) {
    const nU = S.P.length - 1, nV = S.P[0].length - 1, su = span(nU, S.p, u, S.U), sv = span(nV, S.q, v, S.V);
    const [Nu, Du] = nd ? ders1(su, u, S.p, S.U) : [basis(su, u, S.p, S.U)], [Nv, Dv] = nd ? ders1(sv, v, S.q, S.V) : [basis(sv, v, S.q, S.V)];
    let A = [0, 0, 0], Au = [0, 0, 0], Av = [0, 0, 0], W = 0, Wu = 0, Wv = 0;
    for (let a = 0; a <= S.p; a++) { const i = su - S.p + a; for (let b = 0; b <= S.q; b++) { const j = sv - S.q + b, w = S.w[i][j], P = S.P[i][j], c = Nu[a] * Nv[b] * w; A = add(A, mul(P, c)); W += c; if (nd) { const cu = Du[a] * Nv[b] * w, cv = Nu[a] * Dv[b] * w; Au = add(Au, mul(P, cu)); Av = add(Av, mul(P, cv)); Wu += cu; Wv += cv; } } }
    const pt = mul(A, 1 / W); if (!nd) return pt;
    return { p: pt, u: mul(sub(Au, mul(pt, Wu)), 1 / W), v: mul(sub(Av, mul(pt, Wv)), 1 / W) };
  }
  const sDom = (S) => [S.U[S.p], S.U[S.P.length], S.V[S.q], S.V[S.P[0].length]];
  /** skin (A10.3): compatible curves -> surface through them; params shared when several surfaces must meet along common iso-curves */
  function compatible(cs, N) {
    if (cs.every((c) => sameStruct(c, cs[0]))) return cs;
    const n = N || Math.max(24, ...cs.map((c) => c.P.length * 2)); // resample to a common interpolating spline
    return cs.map((c) => interp(cSample(c, n), 3));
  }
  function skinParams(secs) { // chord-length parameters across all control polygons of all sections (segments of a composite section share them)
    const m = secs.length, ub = new Array(m).fill(0); let cnt = 0;
    secs[0].forEach((_, si) => secs[0][si].P.forEach((_, i) => { const d = [0]; let L = 0; for (let k = 1; k < m; k++) { L += len(sub(secs[k][si].P[i], secs[k - 1][si].P[i])); d.push(L); } if (L > 1e-14) { cnt++; for (let k = 1; k < m; k++) ub[k] += d[k] / L; } }));
    if (!cnt) throw new Error('the sections coincide'); for (let k = 1; k < m; k++) ub[k] /= cnt; ub[m - 1] = 1; return ub;
  }
  function skin(cs, ub, q) {
    const m = cs.length; q = q || Math.min(3, m - 1); if (!ub) ub = skinParams([cs]);
    const n = cs[0].P.length, Pw = [], Ww = []; let V = null;
    const cols = []; for (let i = 0; i < n; i++) { const Q = cs.map((c) => { const w = c.w[i]; return [c.P[i][0] * w, c.P[i][1] * w, c.P[i][2] * w, w]; }); const r = interpH(Q, ub, q); V = r.U; cols.push(r.X); }
    const P = cols.map((col) => col.map((h) => [h[0] / h[3], h[1] / h[3], h[2] / h[3]])), w = cols.map((col) => col.map((h) => h[3]));
    return { p: cs[0].p, q, U: cs[0].U.slice(), V, P, w };
  }
  function revolveSurface(c, o, ax, ang) {
    const arcs = (r, X, Y) => arc(o, X, Y, r, 0, ang), n = c.P.length; const P = [], w = []; let V = null;
    for (let i = 0; i < n; i++) {
      const rel = sub(c.P[i], o), h = dot(rel, ax), O = add(o, mul(ax, h)), d = sub(c.P[i], O), r = len(d);
      let ring; if (r < 1e-12) { const a0 = arc(O, [1, 0, 0], [0, 1, 0], 1, 0, ang); ring = { P: a0.P.map(() => O.slice()), w: a0.w, U: a0.U }; }
      else { const X = mul(d, 1 / r), Y = cross(ax, X), a0 = arc(O, X, Y, r, 0, ang); ring = { P: a0.P, w: a0.w, U: a0.U }; }
      P.push(ring.P); w.push(ring.w.map((x) => x * c.w[i])); V = ring.U;
    }
    return { p: c.p, q: 2, U: c.U.slice(), V, P, w };
  }
  const sRow = (S, j) => curve(S.p, S.U.slice(), S.P.map((r) => r[j]), S.w.map((r) => r[j]));
  const sCol = (S, i) => curve(S.q, S.V.slice(), S.P[i].slice(), S.w[i].slice());
  // ---- quadrature
  const GX = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363], GW = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  function* gauss(a, b, knots, sub2) { // nodes over every knot span, each span split in sub2 pieces
    const ks = [...new Set(knots.filter((k) => k >= a - 1e-14 && k <= b + 1e-14))].sort((x, y) => x - y);
    for (let s = 0; s + 1 < ks.length; s++) { const lo = ks[s], hi = ks[s + 1]; if (hi - lo < 1e-14) continue; for (let t = 0; t < sub2; t++) { const l = lo + (hi - lo) * t / sub2, h = lo + (hi - lo) * (t + 1) / sub2, m = (l + h) / 2, r = (h - l) / 2; for (let g = 0; g < 4; g++) { yield [m - r * GX[g], r * GW[g]]; yield [m + r * GX[g], r * GW[g]]; } } }
  }
  function integrate(S, sign, f, sub2) {
    const [u0, u1, v0, v1] = sDom(S), us = [...gauss(u0, u1, S.U, sub2 || 2)], vs = [...gauss(v0, v1, S.V, sub2 || 2)];
    for (const [u, wu] of us) for (const [v, wv] of vs) { const e = sEval(S, u, v, true), nv = mul(cross(e.u, e.v), sign); f(e.p, nv, wu * wv); }
  }
  // ---- solids
  const closedArea = (segs, n) => { const pts = []; segs.forEach((c) => cSample(c, n || 48).slice(0, -1).forEach((q) => pts.push(q))); let a = [0, 0, 0]; const o = pts[0]; for (let i = 1; i + 1 < pts.length; i++) a = add(a, cross(sub(pts[i], o), sub(pts[i + 1], o))); return mul(a, 0.5); };
  const centroidOf = (segs) => { const pts = []; segs.forEach((c) => cSample(c, 24).slice(0, -1).forEach((q) => pts.push(q))); return mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length); };
  function checkClosed(segs, what) { for (let i = 0; i < segs.length; i++) { const a = cEval(segs[i], dom(segs[i])[1]), b = cEval(segs[(i + 1) % segs.length], dom(segs[(i + 1) % segs.length])[0]); if (len(sub(a, b)) > 1e-7 * (1 + len(a))) throw new Error(what + ': the profile is not a closed chain (segment ' + i + ' does not meet segment ' + ((i + 1) % segs.length) + ')'); } }
  function planarity(segs) { const pts = []; segs.forEach((c) => cSample(c, 24).forEach((q) => pts.push(q))); const n = unit(closedArea(segs)), c0 = pts[0]; let dev = 0, size = 0; pts.forEach((q) => { dev = Math.max(dev, Math.abs(dot(sub(q, c0), n))); size = Math.max(size, len(sub(q, c0))); }); return dev / (size || 1); }
  /** fan patch of a planar region bounded by one segment seen from q:  S(t, s) = q + s (C(t) - q) */
  function fan(c, q) { return { p: c.p, q: 1, U: c.U.slice(), V: [0, 0, 1, 1], P: c.P.map((P) => [q.slice(), P.slice()]), w: c.w.map((w) => [w, w]) }; }
  const areaVecOf = (S, sign) => { let a = [0, 0, 0]; integrate(S, sign, (p, nv, w) => { a = add(a, mul(nv, w)); }, 1); return a; };
  function capFaces(segs, q, outward, tag) {
    return segs.map((c, k) => { const S = fan(c, q); const sg = dot(areaVecOf(S, 1), outward) >= 0 ? 1 : -1; return { kind: 'cap', surf: S, sign: sg, n: outward, tag: tag + k }; });
  }
  // ---- planar faces with holes (the caps of a solid whose profile has holes): loops of curves in one plane, outer loop counter-clockwise about the outward normal, holes clockwise
  const planBasis = (n) => { const x = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])); return [x, cross(n, x)]; };
  const reverseLoop = (loop) => loop.slice().reverse().map(cReverse);
  const orientLoop = (loop, n, ccw) => ((dot(closedArea(loop, 48), n) >= 0) === ccw ? loop : reverseLoop(loop));
  const planFace = (loops, n, tag, refs) => { const L = loops.map((l, i) => orientLoop(l, n, i === 0)); return { kind: 'plan', loops: L, n, o: cEval(L[0][0], dom(L[0][0])[0]), sign: 1, tag, refs: refs || null }; };
  /** moments  I[i,j] = integral of s^i t^j over the region (plane coordinates s, t), by Green's theorem on the boundary curves (Gauss-Legendre per knot span) */
  function planMoments(f) {
    const [e1, e2] = planBasis(f.n), o = f.o, I = {}, key = (i, j) => i + ',' + j; for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3 - i; j++) I[key(i, j)] = 0;
    f.loops.forEach((loop) => loop.forEach((c) => { const [a, b] = dom(c); for (const [t, w] of gauss(a, b, c.U, 3)) { const e = cEval(c, t, true), r = sub(e.p, o), s = dot(r, e1), u = dot(r, e2), dt = dot(e.d, e2);
      for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3 - i; j++) I[key(i, j)] += Math.pow(s, i + 1) * Math.pow(u, j) / (i + 1) * dt * w; } }));
    const lin = (a) => ({ '0,0': o[a], '1,0': e1[a], '0,1': e2[a] });             // coordinate a of a point of the plane as a polynomial in s, t
    const pmul = (P, Q) => { const R = {}; for (const k1 in P) for (const k2 in Q) { const [i1, j1] = k1.split(',').map(Number), [i2, j2] = k2.split(',').map(Number), k = (i1 + i2) + ',' + (j1 + j2); R[k] = (R[k] || 0) + P[k1] * Q[k2]; } return R; };
    const pint = (P) => { let t = 0; for (const k in P) t += P[k] * I[k]; return t; };
    return { area: I['0,0'], lin, pmul, pint, n: f.n, o };
  }
  const asSection = (s) => (Array.isArray(s) ? s : [s]);
  /** extrude a closed (composite) profile along a vector: exact (ruled) surfaces */
  function extrude(profile, vec, opts) {
    opts = opts || {}; const prof = profile && profile.outer ? profile : { outer: asSection(profile), holes: [] }, sec0 = asSection(prof.outer); checkClosed(sec0, 'extrude');
    const mv = (sec) => sec.map((c) => cMap(c, (P) => add(P, vec))), sec1 = mv(sec0);
    if (prof.holes && prof.holes.length) { const hs = prof.holes.map(asSection); hs.forEach((h) => checkClosed(h, 'extrude (hole)')); const r = skinSolidH([sec0, sec1], hs.map((h) => [h, mv(h)]), opts, 'extrude', 1); r.profile = { outer: sec0, holes: hs }; r.vec = vec.slice(); return r; }
    const r = skinSolid([sec0, sec1], opts, 'extrude', 1); r.profile = { outer: sec0, holes: [] }; r.vec = vec.slice(); return r;
  }
  /** loft closed (composite) sections: sections are arrays of segment curves (one curve = one closed section), same number of segments each */
  function loft(sections, opts) {
    opts = opts || {}; const secs = sections.map((s) => asSection(s && s.outer ? s.outer : s)); if (secs.length < 2) throw new Error('loft needs at least two sections');
    secs.forEach((s) => { checkClosed(s, 'loft'); if (s.length !== secs[0].length) throw new Error('loft: all sections need the same number of segments'); });
    const nh = (sections[0] && sections[0].holes ? sections[0].holes.length : 0);
    if (nh) { if (sections.some((s) => !s.holes || s.holes.length !== nh)) throw new Error('loft: every section needs the same number of holes'); const hs = []; for (let h = 0; h < nh; h++) { const hsec = sections.map((s) => asSection(s.holes[h])); hsec.forEach((x) => { checkClosed(x, 'loft (hole)'); if (x.length !== hsec[0].length) throw new Error('loft: a hole needs the same number of segments in every section'); }); hs.push(hsec); } return skinSolidH(secs, hs, opts, 'loft', opts.degree); }
    return skinSolid(secs, opts, 'loft', opts.degree);
  }
  /** sweep a closed profile along a path (a curve, or an array of points): the profile is carried by a rotation-minimising frame, with optional twist (radians over the whole path) */
  function sweep(profile, path, opts) {
    opts = opts || {}; const prof = profile && profile.outer ? profile : { outer: asSection(profile), holes: [] }, seg0 = asSection(prof.outer); checkClosed(seg0, 'sweep'); const pc = Array.isArray(path) ? interp(path, 3) : path, steps = Math.max(2, opts.steps || 24), [a, b] = dom(pc);
    const ts = []; for (let i = 0; i <= steps; i++) ts.push(a + (b - a) * i / steps);
    const T = ts.map((t) => unit(cEval(pc, t, true).d)), O = ts.map((t) => cEval(pc, t));
    // double-reflection rotation-minimising frames (Wang et al.)
    const R = [], S0 = (() => { const t = T[0], h = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return unit(cross(h, t)); })(); R.push(S0);
    for (let i = 0; i < steps; i++) { const v1 = sub(O[i + 1], O[i]), c1 = dot(v1, v1), rL = sub(R[i], mul(v1, 2 * dot(v1, R[i]) / c1)), tL = sub(T[i], mul(v1, 2 * dot(v1, T[i]) / c1)), v2 = sub(T[i + 1], tL), c2 = dot(v2, v2); R.push(c2 > 1e-24 ? sub(rL, mul(v2, 2 * dot(v2, rL) / c2)) : rL); }
    const frame = (i) => { const s = unit(R[i]), r = cross(T[i], s); return { o: O[i], t: T[i], s, r }; };   // (s, r, t) is right handed
    const F0 = frame(0), c0 = opts.ref || centroidOf(seg0), tw = opts.twist || 0;
    const secsFor = (sg0) => ts.map((_, i) => { const F = frame(i), th = tw * i / steps, cs = Math.cos(th), sn = Math.sin(th);
      const map = (P) => { const d = sub(P, c0), x = dot(d, F0.s), y = dot(d, F0.r), z = dot(d, F0.t), x2 = x * cs - y * sn, y2 = x * sn + y * cs; return add(F.o, add(mul(F.s, x2), add(mul(F.r, y2), mul(F.t, z)))); };
      return sg0.map((c) => cMap(c, map)); });
    const secs = secsFor(seg0);
    if (prof.holes && prof.holes.length) { const hs = prof.holes.map(asSection); hs.forEach((h) => checkClosed(h, 'sweep (hole)')); const r = skinSolidH(secs, hs.map(secsFor), opts, 'sweep', opts.degree); r.stations = steps + 1; return r; }
    const sol = skinSolid(secs, opts, 'sweep', opts.degree);
    // honest deviation estimate: the skin interpolates the sweep at the stations; compare the surface with the exactly carried profile half way between stations
    let dev = 0; try { const mid = Math.floor(steps / 2), f = (ts[mid] + ts[mid + 1] || ts[mid]) / 2; void f; } catch (e) { /* ignore */ }
    sol.stations = steps + 1; return sol;
  }
  function skinSolid(secs, opts, kind, q) {
    const m = secs.length, nseg = secs[0].length; let comp = secs.map((s) => s.slice()); if (q) q = Math.max(1, Math.min(q, m - 1));
    if (!comp.every((s) => s.every((c, k) => sameStruct(c, secs[0][k])))) { const NS = Math.max(24, ...secs.map((s) => Math.max(...s.map((c) => 2 * c.P.length)))); comp = secs.map((s) => s.map((c) => { const pts = cSample(c, NS); return interp(pts, 3); })); /* resampled to one common structure */ }
    const ub = skinParams(comp), sides = []; for (let k = 0; k < nseg; k++) sides.push(skin(comp.map((s) => s[k]), ub, q));
    const isPt = (sec) => sec.every((c) => c.P.every((q) => Math.hypot(q[0] - c.P[0][0], q[1] - c.P[0][1], q[2] - c.P[0][2]) < 1e-12)), apex0 = isPt(comp[0]), apex1 = isPt(comp[m - 1]);
    if (apex0 && apex1) throw new Error(kind + ': both ends cannot be points');
    const first = comp[0], last = comp[m - 1], nSec = apex0 ? closedArea(last) : closedArea(first), d = sub(centroidOf(last), centroidOf(first));
    const faces = sides.map((S, k) => ({ kind: 'side', surf: S, sign: dot(nSec, d) >= 0 ? 1 : -1, tag: 'side' + k }));
    if (opts.caps !== false) {
      [apex0 ? last : first, apex1 ? first : last].forEach((s) => { if (planarity(s) > 1e-6) throw new Error(kind + ': a section is not planar, so the ends cannot be capped (use caps:false for an open skin)'); });
      const q0 = centroidOf(first), q1 = centroidOf(last);
      if (!apex0) { const nA = unit(closedArea(first)); faces.push(...capFaces(first, q0, dot(nA, d) > 0 ? mul(nA, -1) : nA, 'cap0_')); }   // true section normals (a sweep end need not be perpendicular to the chord), oriented away from the solid
      if (!apex1) { const nB = unit(closedArea(last)); faces.push(...capFaces(last, q1, dot(nB, d) > 0 ? nB : mul(nB, -1), 'cap1_')); }
    }
    const sol = { kind: 'skin', op: kind, faces, topo: { type: 'skin', nseg, sections: comp, sides, caps: opts.caps !== false, apex: apex0 ? 0 : apex1 ? 1 : -1 } };
    if (opts.caps !== false) check(sol, true); return sol;
  }
  /** skin solid whose profile has holes: the outer skin, one inward-facing skin per hole, and planar caps with holes */
  function skinSolidH(outerSecs, holeSecsList, opts, kind, q) {
    const o = skinSolid(outerSecs, Object.assign({}, opts, { caps: false }), kind, q), parts = [{ topo: o.topo, signs: o.faces.map((f) => f.sign) }], faces = o.faces.slice();
    if (o.topo.apex >= 0) throw new Error(kind + ': a profile with holes cannot end in a point');
    holeSecsList.forEach((hs) => { const h = skinSolid(hs, Object.assign({}, opts, { caps: false }), kind, q); if (h.topo.apex >= 0) throw new Error(kind + ': a hole cannot end in a point'); const fl = h.faces.map((f) => Object.assign({}, f, { sign: -f.sign, tag: 'h' + parts.length + '_' + f.tag })); parts.push({ topo: h.topo, signs: fl.map((f) => f.sign) }); faces.push(...fl); });
    const first = outerSecs[0], last = outerSecs[outerSecs.length - 1], d = sub(centroidOf(last), centroidOf(first)), nA = unit(closedArea(first)), nB = unit(closedArea(last)), n0 = dot(nA, d) > 0 ? mul(nA, -1) : nA, n1 = dot(nB, d) > 0 ? nB : mul(nB, -1);
    const c0 = planFace([first].concat(holeSecsList.map((h) => h[0])), n0, 'cap0_0'), c1 = planFace([last].concat(holeSecsList.map((h) => h[h.length - 1])), n1, 'cap1_0'); faces.push(c0, c1);
    const sol = { kind: 'skin', op: kind, faces, topo: { type: 'multi', parts, caps: [c0, c1] } }; check(sol, true); return sol;
  }
  /** revolve a closed (composite) planar profile about the axis (o, ax) by ang (default full turn).  Segments lying on the axis add no surface. */
  function revolve(profile, o, ax, ang, opts) {
    opts = opts || {}; ax = unit(ax); ang = ang == null ? 2 * Math.PI : ang; const segs = asSection(profile); checkClosed(segs, 'revolve'); const full = Math.abs(ang - 2 * Math.PI) < 1e-9;
    const onAxis = (c) => c.P.every((P) => len(cross(sub(P, o), ax)) < 1e-9 * (1 + len(sub(P, o)))), pc = centroidOf(segs), pa = closedArea(segs);
    if (len(pa) < 1e-12) throw new Error('revolve: the profile has no area');
    const th0 = unit(cross(ax, (() => { const r = sub(pc, o); const rr = sub(r, mul(ax, dot(r, ax))); if (len(rr) < 1e-12) throw new Error('revolve: the profile lies on the axis'); return rr; })()));  // direction of rotation at the profile
    const sign = dot(pa, th0) >= 0 ? 1 : -1; if (Math.abs(dot(unit(pa), th0)) < 0.999) throw new Error('revolve: the profile must be planar and contain the axis');
    const faces = []; const surf = [];
    segs.forEach((c, k) => { if (onAxis(c)) { surf.push(null); return; } const S = revolveSurface(c, o, ax, ang); surf.push(S); faces.push({ kind: 'side', surf: S, sign, tag: 'rev' + k }); });
    if (!full) {
      const rot = (P, a) => { const d = sub(P, o), h = dot(d, ax), pp = sub(d, mul(ax, h)), cs = Math.cos(a), sn = Math.sin(a); return add(o, add(mul(ax, h), add(mul(pp, cs), mul(cross(ax, pp), sn)))); };
      const end = segs.map((c) => cMap(c, (P) => rot(P, ang))), q0 = pc, q1 = rot(pc, ang), th1 = unit(cross(ax, sub(rot(pc, ang), add(o, mul(ax, dot(sub(pc, o), ax))))));
      faces.push(...capFaces(segs, q0, mul(th0, -1), 'cap0_'), ...capFaces(end, q1, th1, 'cap1_'));
      var endSegs = end;
    }
    const sol = { kind: 'revolve', op: 'revolve', faces, topo: { type: 'revolve', segs, surf, o, ax, ang, full, endSegs: endSegs || segs, sign, onAxis: segs.map(onAxis) } };
    check(sol, true); return sol;
  }
  // ---- analysis
  function massProps(sol, sub2) {
    let V = 0, A = 0, M = [0, 0, 0], S2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    sol.faces.forEach((f) => { if (f.kind !== 'plan') return; const m = planMoments(f), L = [0, 1, 2].map(m.lin), nn = f.n; V += dot(nn, f.o) / 3 * m.area; A += m.area;
      for (let a = 0; a < 3; a++) { const pa = m.pmul(L[a], L[a]); M[a] += 0.5 * nn[a] * m.pint(pa); S2[a][a] += nn[a] / 3 * m.pint(m.pmul(pa, L[a])); for (let b = a + 1; b < 3; b++) S2[a][b] += 0.5 * nn[a] * m.pint(m.pmul(pa, L[b])); } });
    sol.faces.filter((f) => f.kind !== 'plan').forEach((f) => integ(f, (p, nv, w) => {
      V += dot(p, nv) / 3 * w; A += len(nv) * w;
      for (let a = 0; a < 3; a++) { M[a] += 0.5 * p[a] * p[a] * nv[a] * w; S2[a][a] += p[a] * p[a] * p[a] / 3 * nv[a] * w; for (let b = a + 1; b < 3; b++) S2[a][b] += 0.5 * p[a] * p[a] * p[b] * nv[a] * w; }
    }, sub2));
    const c = V ? mul(M, 1 / V) : [0, 0, 0], xx = S2[0][0], yy = S2[1][1], zz = S2[2][2], xy = S2[0][1], xz = S2[0][2], yz = S2[1][2];
    const Io = [[yy + zz, -xy, -xz], [-xy, xx + zz, -yz], [-xz, -yz, xx + yy]], c2 = dot(c, c), I = Io.map((r, i) => r.map((x, j) => x - V * ((i === j ? c2 : 0) - c[i] * c[j])));
    return { volume: V, area: A, centroid: c, inertia: I, exact: true };
  }
  /** closure test: the oriented area vectors of all faces must add up to zero; the volume must be positive */
  function check(sol, throwing) {
    let a = [0, 0, 0], tot = 0; sol.faces.forEach((f) => { if (f.kind === 'plan') { const m = planMoments(f); a = add(a, mul(f.n, m.area)); tot += Math.abs(m.area); return; } integ(f, (p, nv, w) => { a = add(a, mul(nv, w)); tot += len(nv) * w; }, 1); });
    const rel = len(a) / (tot || 1), mp = massProps(sol, 1), ok = rel < 1e-6 && mp.volume > 0, issues = []; if (rel >= 1e-6) issues.push('the faces do not close (gap ' + rel.toExponential(2) + ' of the area)'); if (!(mp.volume > 0)) issues.push('the volume is not positive (' + mp.volume + '): the profile is probably reversed or self-crossing');
    if (!ok && throwing) throw new Error(issues.join('; ')); return { ok, issues, closure: rel, volume: mp.volume };
  }
  function earClip(pts2) { // simple polygon -> triangles (indices), counter-clockwise input
    const n = pts2.length, idx = [...Array(n).keys()], out = [], cr = (a, b, c) => (pts2[b][0] - pts2[a][0]) * (pts2[c][1] - pts2[a][1]) - (pts2[b][1] - pts2[a][1]) * (pts2[c][0] - pts2[a][0]);
    const inside = (p, a, b, c) => cr(a, b, p) >= -1e-14 && cr(b, c, p) >= -1e-14 && cr(c, a, p) >= -1e-14; let guard = 0;
    while (idx.length > 3 && guard++ < 10 * n * n) { let cut = false; for (let i = 0; i < idx.length; i++) { const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length]; if (cr(a, b, c) <= 1e-14) continue; if (idx.some((k) => k !== a && k !== b && k !== c && inside(k, a, b, c))) continue; out.push([a, b, c]); idx.splice(i, 1); cut = true; break; } if (!cut) break; }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]); return out;
  }
  /** tessellate into outward-facing triangles [[p,q,r],...]; n = divisions per knot span */
  function trimTris(f, n) {
    const S = f.surf, [u0, u1, v0, v1] = sDom(S); let cu = 0, cv = 0, cnt = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const e = sEval(S, u0 + (u1 - u0) * i / 4, v0 + (v1 - v0) * j / 4, true); cu += len(e.u); cv += len(e.v); cnt++; } cu = cu / cnt || 1; cv = cv / cnt || 1;
    const P2 = [], P3 = [], rings = [], diag = Math.hypot((u1 - u0) * cu, (v1 - v0) * cv);
    f.loops.forEach((lp) => { const idx = []; lp.pieces.forEach((pc) => { let uvs = [];
      if (pc.type === 'c') { const m = Math.min(160, Math.max(8, pc.uvC.P.length)); uvs = cSample(pc.uvC, m).slice(0, -1).map((q) => [q[0], q[1]]); }
      else { const m = Math.max(1, Math.ceil(Math.hypot((pc.b[0] - pc.a[0]) * cu, (pc.b[1] - pc.a[1]) * cv) / (diag / (n * 3)))); for (let k = 0; k < m; k++) uvs.push([pc.a[0] + (pc.b[0] - pc.a[0]) * k / m, pc.a[1] + (pc.b[1] - pc.a[1]) * k / m]); }
      uvs.forEach((q) => { const last = idx.length ? P2[idx[idx.length - 1]] : null; if (last && Math.hypot(last[0] - q[0] * cu, last[1] - q[1] * cv) < 1e-12 * diag) return; idx.push(P2.length); P2.push([q[0] * cu, q[1] * cv]); P3.push(sEval(S, q[0], q[1])); }); });
      if (idx.length > 2 && Math.hypot(P2[idx[0]][0] - P2[idx[idx.length - 1]][0], P2[idx[0]][1] - P2[idx[idx.length - 1]][1]) < 1e-12 * diag) idx.pop(); if (idx.length >= 3) rings.push(idx); });
    if (!rings.length || !AK.triangulatePolygon) return []; const tris = AK.triangulatePolygon(P2, rings), msh = { P2, P3, tris };
    const nu = Math.max(2, (new Set(S.U).size - 1) * n), nv = Math.max(2, (new Set(S.V).size - 1) * n), du = (u1 - u0) / nu, dv = (v1 - v0) / nv, pts = [];
    for (let i = 1; i < nu; i++) for (let j = 1; j < nv; j++) pts.push([(u0 + du * i) * cu, (v0 + dv * j) * cv]);
    if (AK.insertSteiner && pts.length) AK.insertSteiner(msh, rings, pts, Math.min(du * cu, dv * cv) * 0.35, (q) => sEval(S, q[0] / cu, q[1] / cv));
    return msh.tris.filter(Boolean).map(([a, b, c]) => (f.sign > 0 ? [msh.P3[a], msh.P3[b], msh.P3[c]] : [msh.P3[a], msh.P3[c], msh.P3[b]]));
  }
  function mesh(sol, n) {
    n = n || 8; const tris = [];
    sol.faces.forEach((f) => {
      if (f.kind === 'plan') {                                                         // a planar face with holes: ear clipping of the sampled loops
        const [e1, e2] = planBasis(f.n), P3 = [], P2 = [], rings = []; f.loops.forEach((loop) => { const idx = []; loop.forEach((c) => { cSample(c, Math.max(8, n * Math.max(1, c.P.length - 1) / 2 | 0)).slice(0, -1).forEach((q) => { idx.push(P3.length); P3.push(q); P2.push([dot(sub(q, f.o), e1), dot(sub(q, f.o), e2)]); }); }); rings.push(idx); });
        (AK.triangulatePolygon ? AK.triangulatePolygon(P2, rings) : []).forEach((t) => tris.push([P3[t[0]], P3[t[1]], P3[t[2]]])); return;
      }
      if (f.kind === 'trim') { trimTris(f, n).forEach((t) => tris.push(t)); return; }
      const S = f.surf, [u0, u1, v0, v1] = sDom(S);
      if (f.kind === 'cap') { return; }
      const grid = (a, b, ks) => { const k = [...new Set(ks.filter((x) => x >= a - 1e-14 && x <= b + 1e-14))].sort((x, y) => x - y), o = [k[0]]; const nn = k.length > 33 ? Math.max(1, Math.round(n * 32 / (k.length - 1))) : n; /* many fine spans (an offset/round side): the spans are already small, so do not subdivide each one n times */ for (let i = 0; i + 1 < k.length; i++) { for (let j = 1; j <= nn; j++) o.push(k[i] + (k[i + 1] - k[i]) * j / nn); } return o; };
      const us = grid(u0, u1, S.U), vs = grid(v0, v1, S.V), P = us.map((u) => vs.map((v) => sEval(S, u, v)));
      for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) { const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1]; if (f.sign > 0) tris.push([a, b, c], [a, c, d]); else tris.push([a, c, b], [a, d, c]); }
    });
    // caps: ear clipping of the boundary polygon in the plane of the cap
    const byCap = {}; sol.faces.filter((f) => f.kind === 'cap').forEach((f) => { const k = f.tag.split('_')[0]; (byCap[k] = byCap[k] || []).push(f); });
    Object.keys(byCap).forEach((k) => {
      const fs = byCap[k], nrm = fs[0].n, pts = []; fs.forEach((f) => { const c = sRow(f.surf, 1); cSample(c, Math.max(8, n * Math.max(1, c.P.length - 1) / 2 | 0)).slice(0, -1).forEach((q) => pts.push(q)); });
      const x = unit(Math.abs(nrm[0]) < 0.9 ? cross(nrm, [1, 0, 0]) : cross(nrm, [0, 1, 0])), y = cross(nrm, x), p2 = pts.map((q) => [dot(q, x), dot(q, y)]); let ar = 0; for (let i = 0; i < p2.length; i++) { const j = (i + 1) % p2.length; ar += p2[i][0] * p2[j][1] - p2[j][0] * p2[i][1]; }
      const order = ar >= 0 ? p2.map((_, i) => i) : p2.map((_, i) => p2.length - 1 - i), poly = order.map((i) => p2[i]); earClip(poly).forEach((t) => tris.push([pts[order[t[0]]], pts[order[t[1]]], pts[order[t[2]]]]));
    });
    return tris;
  }
  // ---- STEP (AP214, B_SPLINE_SURFACE faces)
  const fr = (x) => { if (!isFinite(x)) x = 0; if (Math.abs(x) < 1e-15) return '0.'; let s = String(+x.toPrecision(15)); if (/e/i.test(s)) { let [m, e] = s.toLowerCase().split('e'); if (!m.includes('.')) m += '.'; return m.toUpperCase() + 'E' + e.replace('+', ''); } return s.includes('.') ? s : s + '.'; };
  const strq = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
  const knotsMult = (U) => { const k = [], m = []; U.forEach((u) => { if (k.length && Math.abs(u - k[k.length - 1]) < 1e-12) m[m.length - 1]++; else { k.push(u); m.push(1); } }); return [k, m]; };
  function stepWrite(sol, opts) {
    if (sol.topo && sol.topo.apex >= 0) throw new Error('STEP export of a loft that ends in a point is not supported yet');
    opts = opts || {}; const out = []; let id = 0; const E = (s) => { id++; out.push('#' + id + '=' + s + ';'); return '#' + id; };
    const ptc = new Map(), pt = (p) => { const k = p.map((x) => x.toFixed(9)).join(','); let r = ptc.get(k); if (!r) { r = E(`CARTESIAN_POINT('',(${fr(p[0])},${fr(p[1])},${fr(p[2])}))`); ptc.set(k, r); } return r; };
    const dr = (d) => E(`DIRECTION('',(${fr(d[0])},${fr(d[1])},${fr(d[2])}))`), ax2 = (o, z, x) => E(`AXIS2_PLACEMENT_3D('',${pt(o)},${dr(z)},${dr(x)})`);
    const appCtx = E("APPLICATION_CONTEXT('automotive design')"); E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
    const prodCtx = E(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`), name = opts.name || 'Aakar_Freeform', prod = E(`PRODUCT(${strq(name)},${strq(name)},'',(${prodCtx}))`); E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
    const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`), pdCtx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`), pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdCtx})`), pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    const lu = E('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'), au = E('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'), su = E('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
    const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),${lu},'distance_accuracy_value','confusion accuracy')`);
    const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${lu},${au},${su})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
    const items = [ax2([0, 0, 0], [0, 0, 1], [1, 0, 0])];
    const rational = (ws) => ws.some((w) => Math.abs(w - 1) > 1e-12), ptl = (arr) => '(' + arr.map(pt).join(',') + ')', lst = (a, f) => '(' + a.map(f).join(',') + ')';
    const curveEnt = (c) => { const [k, m] = knotsMult(c.U), base = `${c.p},${ptl(c.P)},.UNSPECIFIED.,.F.,.F.`, kn = `${lst(m, String)},${lst(k, fr)},.UNSPECIFIED.`;
      return rational(c.w) ? E(`(BOUNDED_CURVE() B_SPLINE_CURVE(${base}) B_SPLINE_CURVE_WITH_KNOTS(${kn}) CURVE() GEOMETRIC_REPRESENTATION_ITEM() RATIONAL_B_SPLINE_CURVE(${lst(c.w, fr)}) REPRESENTATION_ITEM(''))`) : E(`B_SPLINE_CURVE_WITH_KNOTS('',${base},${kn})`); };
    const surfEnt = (S) => { const [ku, mu] = knotsMult(S.U), [kv, mv] = knotsMult(S.V), net = '(' + S.P.map((r) => ptl(r)).join(',') + ')', base = `${S.p},${S.q},${net},.UNSPECIFIED.,.F.,.F.,.F.`, kn = `${lst(mu, String)},${lst(mv, String)},${lst(ku, fr)},${lst(kv, fr)},.UNSPECIFIED.`, ws = S.w.flat();
      return rational(ws) ? E(`(BOUNDED_SURFACE() B_SPLINE_SURFACE(${base}) B_SPLINE_SURFACE_WITH_KNOTS(${kn}) GEOMETRIC_REPRESENTATION_ITEM() RATIONAL_B_SPLINE_SURFACE((${S.w.map((r) => lst(r, fr)).join(',')})) REPRESENTATION_ITEM('') SURFACE())`) : E(`B_SPLINE_SURFACE_WITH_KNOTS('',${base},${kn})`); };
    const vtx = new Map(), vp = (p) => { const k = p.map((x) => x.toFixed(7)).join(','); let r = vtx.get(k); if (!r) { r = E(`VERTEX_POINT('',${pt(p)})`); vtx.set(k, r); } return r; };
    const edges = new Map(); // key -> {ent}
    const edge = (key, c) => { let e = edges.get(key); if (!e) { const a = cEval(c, dom(c)[0]), b = cEval(c, dom(c)[1]); e = E(`EDGE_CURVE('',${vp(a)},${vp(b)},${curveEnt(c)},.T.)`); edges.set(key, e); } return e; };
    const oe = (e, fwd) => E(`ORIENTED_EDGE('',*,*,${e},${fwd ? '.T.' : '.F.'})`);
    const loopOf = (list, ccw, inner) => { const L = ccw ? list : list.slice().reverse().map(([e, f]) => [e, !f]); return E(`${inner ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',${E(`EDGE_LOOP('',(${L.map(([e, f]) => oe(e, f)).join(',')}))`)},.T.)`); };
    const faceEnts = [], T = sol.topo, plane = (o, n) => E(`PLANE('',${ax2(o, n, unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])))})`);
    const bsFace = (S, sign, list) => faceEnts.push(E(`ADVANCED_FACE('',(${loopOf(list, sign > 0)}),${surfEnt(S)},${sign > 0 ? '.T.' : '.F.'})`));
    const capFace = (segKeys, segCurves, nrm, q) => { // outward-CCW loop of the section edges
      const area = closedArea(segCurves, 48), fwd = dot(area, nrm) >= 0;
      const list = segCurves.map((c, k) => [edge(segKeys[k], c), true]);
      faceEnts.push(E(`ADVANCED_FACE('',(${loopOf(list, fwd)}),${plane(q, nrm)},.T.)`));
    };
    if (T.type === 'skin') {
      const m = T.sections.length, nseg = T.nseg, first = T.sections[0], last = T.sections[m - 1];
      const bot = first.map((c, k) => edge('b' + k, c)), top = last.map((c, k) => edge('t' + k, c)), vert = []; // vertical edge at junction j
      const vertEdge = (j) => { const S = T.sides[j % nseg], c = sCol(S, 0); if (!vert[j % nseg]) vert[j % nseg] = edge('v' + (j % nseg), c); return vert[j % nseg]; };
      T.sides.forEach((S, k) => { const left = vertEdge(k), rightIdx = (k + 1) % nseg; let right; if (rightIdx === k) right = left; else right = vertEdge(rightIdx);
        const sg = sol.faces[k].sign; bsFace(S, sg, [[bot[k], true], [right, true], [top[k], false], [left, false]]); });
      if (T.caps) { const n0 = sol.faces.filter((f) => /^cap0_/.test(f.tag))[0].n, n1 = sol.faces.filter((f) => /^cap1_/.test(f.tag))[0].n; capFace(first.map((_, k) => 'b' + k), first, n0, centroidOf(first)); capFace(last.map((_, k) => 't' + k), last, n1, centroidOf(last)); }
    } else if (T.type === 'brep') {
      const known = [], near = (p, q, t) => Math.abs(p[0] - q[0]) < t && Math.abs(p[1] - q[1]) < t && Math.abs(p[2] - q[2]) < t;
      const fracOf = (c, fr) => { const pts = cSample(c, 128), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1]))); const h = cum[cum.length - 1] * fr; let k = 1; while (k < cum.length - 1 && cum[k] < h) k++; const w = (h - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return add(mul(pts[k - 1], 1 - w), mul(pts[k], w)); }, midOf = (c) => fracOf(c, 0.5);
      const edgeG = (c) => { const [a0, a1] = dom(c), a = cEval(c, a0), b = cEval(c, a1), m = midOf(c), q1 = fracOf(c, 0.25), q3 = fracOf(c, 0.75), closed = len(sub(a, b)) < 1e-6, tq = 1e-3 * (1 + len(sub(a, b)) + (closed ? len(sub(q1, m)) : 0));
        for (const k of known) { if (near(a, k.a, 1e-6) && near(b, k.b, 1e-6) && near(m, k.m, tq) && (!closed || near(q1, k.q1, tq))) return [k.e, true]; if (near(a, k.b, 1e-6) && near(b, k.a, 1e-6) && near(m, k.m, tq) && (!closed || near(q1, k.q3, tq))) return [k.e, false]; }
        const e = edge('g' + known.length, c); known.push({ a, b, m, q1, q3, e }); return [e, true]; };
      sol.faces.forEach((f) => {
        if (f.kind === 'plan') { const bounds = f.loops.map((loop, i) => loopOf(loop.map(edgeG), true, i > 0)); faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${plane(f.o, f.n)},.T.)`)); }
        else if (f.kind === 'trim') { const bounds = f.loops.map((lp, i) => loopOf(lp.pieces.filter((pc) => pc.c3).map((pc) => edgeG(pc.c3)), f.sign > 0, i > 0)); faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${surfEnt(f.surf)},${f.sign > 0 ? '.T.' : '.F.'})`)); }
        else if (f.kind === 'side') { const list = borderCurves(f.surf).map(({ c, rev }) => (curveLen(c) > 1e-10 ? edgeG(rev ? cReverse(c) : c) : null)).filter(Boolean); bsFace(f.surf, f.sign, list); }
      });
    } else if (T.type === 'multi') {
      T.parts.forEach((pt, pi) => { const Tp = pt.topo, pre = 'p' + pi + '_', m = Tp.sections.length, nseg = Tp.nseg, first = Tp.sections[0], last = Tp.sections[m - 1], bot = first.map((c, k) => edge(pre + 'b' + k, c)), top = last.map((c, k) => edge(pre + 't' + k, c)), vert = [];
        const vertEdge = (j) => { const S = Tp.sides[j % nseg], c = sCol(S, 0); if (!vert[j % nseg]) vert[j % nseg] = edge(pre + 'v' + (j % nseg), c); return vert[j % nseg]; };
        Tp.sides.forEach((S, k) => { const left = vertEdge(k), rightIdx = (k + 1) % nseg, right = rightIdx === k ? left : vertEdge(rightIdx); bsFace(S, pt.signs[k], [[bot[k], true], [right, true], [top[k], false], [left, false]]); }); });
      T.caps.forEach((cf, ci) => { const which = ci === 0 ? 0 : 1, refs = cf.refs || T.parts.map((_, pi) => ({ pi, end: which === 0 ? 'b' : 't' })), bounds = refs.map((rf, ri) => { const pi = rf.pi, secs = T.parts[pi].topo.sections, sec = rf.end === 'b' ? secs[0] : secs[secs.length - 1], pre = 'p' + pi + '_' + rf.end, list = sec.map((c, k) => [edge(pre + k, c), true]), along = dot(closedArea(sec, 48), cf.n) >= 0;
          return ri === 0 ? loopOf(list, along, false) : loopOf(list, !along, true); });
        faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${plane(cf.o, cf.n)},.T.)`)); });
    } else {
      const nseg = T.segs.length, full = T.full, prof0 = T.segs.map((c, k) => edge('p0_' + k, c)), prof1 = full ? prof0 : T.endSegs.map((c, k) => edge('p1_' + k, c));
      const junc = {}; const arcAt = (j) => { // the path of junction j (profile start point of segment j) around the axis; null on the axis
        const k = j % nseg; if (junc[k] !== undefined) return junc[k]; const S = T.surf[k] || T.surf[(k + nseg - 1) % nseg]; const useStart = !!T.surf[k], si = T.surf[k] ? 0 : T.surf[(k + nseg - 1) % nseg].P.length - 1; if (!S) return (junc[k] = null);
        const col = sCol(S, si); if (col.P.every((P) => len(sub(P, col.P[0])) < 1e-9)) return (junc[k] = null); return (junc[k] = edge('a' + k, col)); };
      void arcAt;
      const arcFor = (j) => { const k = j % nseg, a = T.surf[k] ? [T.surf[k], 0] : (T.surf[(k + nseg - 1) % nseg] ? [T.surf[(k + nseg - 1) % nseg], T.surf[(k + nseg - 1) % nseg].P.length - 1] : null); if (!a) return null; const col = sCol(a[0], a[1]); if (col.P.every((P) => len(sub(P, col.P[0])) < 1e-9)) return null; if (junc[k] === undefined) junc[k] = edge('a' + k, col); return junc[k]; };
      T.segs.forEach((c, k) => { if (!T.surf[k]) return; const loop = [[prof0[k], true]], r = arcFor(k + 1), l = arcFor(k); if (r) loop.push([r, true]); loop.push([prof1[k], false]); if (l) loop.push([l, false]); bsFace(T.surf[k], T.sign, loop); });
      if (!full) { const n0 = sol.faces.filter((f) => /^cap0_/.test(f.tag))[0].n, n1 = sol.faces.filter((f) => /^cap1_/.test(f.tag))[0].n; capFace(T.segs.map((_, k) => 'p0_' + k), T.segs, n0, centroidOf(T.segs)); capFace(T.segs.map((_, k) => 'p1_' + k), T.endSegs, n1, centroidOf(T.endSegs)); }
    }
    const shell = E(`CLOSED_SHELL('',(${faceEnts.join(',')}))`); items.push(E(`MANIFOLD_SOLID_BREP(${strq(name)},${shell})`));
    const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${strq(name)},(${items.join(',')}),${ctx})`); E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
    const now = new Date().toISOString().slice(0, 19);
    return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Aakar freeform B-rep (AakarKernel NURBS)'),'2;1');", `FILE_NAME(${strq((opts.fileName || name) + '.step')},'${now}',('Aakar'),(''),'AakarKernel ${AK.version}','Aakar','');`, "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
  }
  // ---- rigid / uniform-scale / mirror transforms of a solid (M = 9 numbers, row-major, as the rest of the kernel uses)
  function xfSolid(sol, M, t) {
    const Mp = (P) => [M[0] * P[0] + M[1] * P[1] + M[2] * P[2] + t[0], M[3] * P[0] + M[4] * P[1] + M[5] * P[2] + t[1], M[6] * P[0] + M[7] * P[1] + M[8] * P[2] + t[2]];
    const Md = (d) => [M[0] * d[0] + M[1] * d[1] + M[2] * d[2], M[3] * d[0] + M[4] * d[1] + M[5] * d[2], M[6] * d[0] + M[7] * d[1] + M[8] * d[2]];
    const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]), flip = det < 0 ? -1 : 1;
    const sm = new Map(), mapS = (S) => { if (!S) return S; let r = sm.get(S); if (!r) { r = Object.assign({}, S, { P: S.P.map((row) => row.map(Mp)) }); sm.set(S, r); } return r; };
    const mapC = (c) => cMap(c, Mp), mapT = (T) => { const nt = Object.assign({}, T);
      if (T.type === 'skin') { nt.sections = T.sections.map((sec) => sec.map(mapC)); nt.sides = T.sides.map(mapS); }
      else if (T.type === 'brep') { /* faces carry everything */ }
      else if (T.type === 'multi') { nt.parts = T.parts.map((pt) => ({ topo: mapT(pt.topo), signs: pt.signs.map((x) => x * flip) })); }
      else { nt.segs = T.segs.map(mapC); nt.endSegs = T.full ? nt.segs : T.endSegs.map(mapC); nt.surf = T.surf.map(mapS); nt.o = Mp(T.o); nt.ax = unit(Md(T.ax)); nt.sign = T.sign * flip; }
      return nt; };
    const mapF = (f) => { if (f.kind === 'trim') return Object.assign({}, f, { surf: mapS(f.surf), sign: f.sign * flip, loops: f.loops.map((lp) => ({ pieces: lp.pieces.map((pc) => Object.assign({}, pc, { c3: pc.c3 ? mapC(pc.c3) : null })) })) }); if (f.kind === 'plan') { const n = unit(Md(f.n)); return planFace(f.loops.map((l) => l.map(mapC)), n, f.tag, f.refs); } return Object.assign({}, f, { surf: mapS(f.surf), sign: f.sign * flip, n: f.n ? unit(Md(f.n)) : f.n }); };
    const faces = sol.faces.map(mapF), nt = mapT(sol.topo); if (nt.type === 'multi') nt.caps = faces.filter((f) => f.kind === 'plan');
    const out = { kind: sol.kind, op: sol.op, topo: nt, faces }; if (sol.profile) { out.profile = { outer: sol.profile.outer.map(mapC), holes: sol.profile.holes.map((h) => h.map(mapC)) }; out.vec = Md(sol.vec); } if (sol.pockets) out.pockets = sol.pockets.map((q) => ({ loop: q.loop.map(mapC), end: q.end, plane: { p: Mp(q.plane.p), n: unit(Md(q.plane.n)) }, dir: q.dir ? Md(q.dir) : undefined })); if (sol.src) out.src = { root: xfSolid(sol.src.root, M, t), ops: sol.src.ops.map((o) => ({ kind: o.kind, planes: o.planes.map((q) => { const nn = unit(Md(q.n)), pp = Mp(q.p); return { n: nn, d: dot(nn, pp), p: pp }; }) })) }; if (sol.lo) out.lo = { p: Mp(sol.lo.p), n: unit(Md(sol.lo.n)) }; if (sol.hi) out.hi = { p: Mp(sol.hi.p), n: unit(Md(sol.hi.n)) }; return out;
  }
  /** build from a plain-data description (used by the exact recipes): {kind:'extrude'|'revolve'|'loft'|'sweep', ...} with curves as {p,U,P,w} */
  function fromSpec(sp) {
    if (sp.kind === 'extrude') return extrude(sp.profile, sp.vec, sp.opts); if (sp.kind === 'loft') return loft(sp.sections, sp.opts);
    if (sp.kind === 'revolve') return revolve(sp.profile, sp.o, sp.ax, sp.ang, sp.opts); if (sp.kind === 'sweep') return sp.pieces ? sweepPieces(sp.profile, sp.pieces, sp.opts) : sweep(sp.profile, sp.path, sp.opts);
    throw new Error('unknown freeform recipe ' + sp.kind);
  }
  /** sweep along a path made of several pieces (lines and smooth curves) that meet at corners: the section at a corner is the profile cut by the mitre plane, so the solid is closed and exact on straight pieces */
  function sweepPieces(profile, pieces, opts) {
    opts = opts || {}; const seg0 = asSection(profile); checkClosed(seg0, 'sweep'); if (opts.twist) throw new Error('sweep with corners does not support twist yet');
    const rotV = (v, ax, th) => { const c = Math.cos(th), s = Math.sin(th); return add(add(mul(v, c), mul(cross(ax, v), s)), mul(ax, dot(ax, v) * (1 - c))); };
    const c0 = opts.ref || centroidOf(seg0), secs = []; let F0 = null, Rprev = null, Tprev = null, Oprev = null;
    const mapWith = (O, T, S, Rr, P) => { const d = sub(P, c0), x = dot(d, F0.s), y = dot(d, F0.r), z = dot(d, F0.t); return add(O, add(mul(S, x), add(mul(Rr, y), mul(T, z)))); };
    pieces.forEach((pc, pi) => {
      const [a, b] = dom(pc), straight = pc.p === 1 && pc.P.length === 2, steps = straight ? 1 : Math.max(2, Math.round((opts.steps || 24) / pieces.length)), ts = []; for (let i = 0; i <= steps; i++) ts.push(a + (b - a) * i / steps);
      const T = ts.map((t) => unit(cEval(pc, t, true).d)), O = ts.map((t) => cEval(pc, t)); let S0;
      if (pi === 0) { const t = T[0], h = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; S0 = unit(cross(h, t)); F0 = { s: S0, r: cross(T[0], S0), t: T[0] }; }
      else { const ax = cross(Tprev, T[0]), an = len(ax); S0 = an < 1e-9 ? Rprev : rotV(Rprev, mul(ax, 1 / an), Math.acos(Math.max(-1, Math.min(1, dot(Tprev, T[0]))))); }
      const R = [S0];
      for (let i = 0; i < steps; i++) { const v1 = sub(O[i + 1], O[i]), c1 = dot(v1, v1), rL = sub(R[i], mul(v1, 2 * dot(v1, R[i]) / c1)), tL = sub(T[i], mul(v1, 2 * dot(v1, T[i]) / c1)), v2 = sub(T[i + 1], tL), c2 = dot(v2, v2); R.push(c2 > 1e-24 ? sub(rL, mul(v2, 2 * dot(v2, rL) / c2)) : rL); }
      for (let i = (pi === 0 ? 0 : 1); i <= steps; i++) {
        const S = unit(R[i]), Rr = cross(T[i], S), last = i === steps && pi < pieces.length - 1;
        if (!last) { secs.push(seg0.map((c) => cMap(c, (P) => mapWith(O[i], T[i], S, Rr, P)))); }
        else { const Tn = unit(cEval(pieces[pi + 1], dom(pieces[pi + 1])[0], true).d), nb = unit(add(T[i], Tn)), den = dot(T[i], nb); if (Math.abs(den) < 1e-6) throw new Error('sweep: the path folds back on itself');
          secs.push(seg0.map((c) => cMap(c, (P) => { const q = mapWith(O[i], T[i], S, Rr, P), lam = -dot(sub(q, O[i]), nb) / den; return add(q, mul(T[i], lam)); }))); }
        if (i === steps) { Rprev = S; Tprev = T[i]; Oprev = O[i]; }
      }
    });
    void Oprev; return skinSolid(secs, Object.assign({}, opts, { degree: 1 }), 'sweep', 1);
  }
  // ---- prisms with planar ends: an extrusion whose two ends are cut by planes (not necessarily perpendicular to the sweep).  Every side is a ruled patch between the two projected profile curves, so it stays exact; no trimming is needed.
  const profPlane = (sec0) => ({ p: cEval(sec0[0], dom(sec0[0])[0]), n: unit(closedArea(sec0, 48)) });
  const projAlong = (P, vec, pl) => add(P, mul(vec, dot(pl.n, sub(pl.p, P)) / dot(pl.n, vec)));
  function prismSolid(prof, vec, lo, hi, pockets) {
    const outer = asSection(prof.outer), holes = (prof.holes || []).map(asSection), base = profPlane(outer), L = lo || base, H = hi || { p: add(base.p, vec), n: base.n }; pockets = pockets || [];
    if (Math.abs(dot(L.n, vec)) < 1e-9 * len(vec) || Math.abs(dot(H.n, vec)) < 1e-9 * len(vec)) throw new Error('prism: an end plane is parallel to the sweep direction');
    const pr = (loop, pl) => loop.map((c) => cMap(c, (P) => projAlong(P, vec, pl))), secs = [pr(outer, L), pr(outer, H)];
    let r;
    if (!pockets.length) r = holes.length ? skinSolidH(secs, holes.map((h) => [pr(h, L), pr(h, H)]), {}, 'extrude', 1) : skinSolid(secs, {}, 'extrude', 1);
    else {   // blind pockets: walls from a flat floor (or ceiling) to the end plane, a planar floor, and end caps that carry the pocket mouths as holes
      const o = skinSolid(secs, { caps: false }, 'extrude', 1), parts = [{ topo: o.topo, signs: o.faces.map((f) => f.sign) }], faces = o.faces.slice(), flipIn = (sk, tag) => sk.faces.map((f) => Object.assign({}, f, { sign: -f.sign, tag: tag + f.tag }));
      holes.forEach((h) => { const hk = skinSolid([pr(h, L), pr(h, H)], { caps: false }, 'extrude', 1), fl = flipIn(hk, 'h' + parts.length + '_'); parts.push({ topo: hk.topo, signs: fl.map((f) => f.sign) }); faces.push(...fl); });
      const nFull = parts.length, floors = [], mouthLo = [], mouthHi = [];
      pockets.forEach((pk, i) => { const thru = pk.end === 'thru', onto = (loop) => loop.map((c) => cMap(c, (P) => add(P, mul(pk.plane.n, dot(pk.plane.n, sub(pk.plane.p, P)))))), top = pk.end === 'hi', prd = (pl) => pk.loop.map((c) => cMap(c, (P) => projAlong(P, pk.dir, pl))), sec = thru ? [prd(L), prd(H)] : top ? [onto(pk.loop), pr(pk.loop, H)] : [pr(pk.loop, L), onto(pk.loop)];
        const wk = skinSolid(sec, { caps: false }, 'extrude', 1), wf = flipIn(wk, 'pk' + i + '_'), pi = parts.length; parts.push({ topo: wk.topo, signs: wf.map((f) => f.sign) }); faces.push(...wf); if (thru) { mouthHi.push(pi); mouthLo.push(pi); } else { (top ? mouthHi : mouthLo).push(pi); floors.push({ pi, top, k: i }); } });
      const firstS = (pi) => parts[pi].topo.sections[0], lastS = (pi) => parts[pi].topo.sections[parts[pi].topo.sections.length - 1], ids = Array.from({ length: nFull }, (_, k) => k), secOf = (rf) => (rf.end === 'b' ? firstS(rf.pi) : lastS(rf.pi));
      const nLo = dot(L.n, vec) > 0 ? mul(unit(L.n), -1) : unit(L.n), nHi = dot(H.n, vec) > 0 ? unit(H.n) : mul(unit(H.n), -1), mk = (n, tag, rs) => planFace(rs.map(secOf), n, tag, rs);
      const caps = [mk(nLo, 'cap0_0', ids.map((pi) => ({ pi, end: 'b' })).concat(mouthLo.map((pi) => ({ pi, end: 'b' })))), mk(nHi, 'cap1_0', ids.map((pi) => ({ pi, end: 't' })).concat(mouthHi.map((pi) => ({ pi, end: 't' }))))];
      floors.forEach((f, ii) => { const i = ii, pn = pockets[f.k].plane.n; caps.push(f.top ? mk(dot(pn, vec) > 0 ? pn : mul(pn, -1), 'pocket_floor' + i, [{ pi: f.pi, end: 'b' }]) : mk(dot(pn, vec) > 0 ? mul(pn, -1) : pn, 'pocket_ceiling' + i, [{ pi: f.pi, end: 't' }])); });
      faces.push(...caps); r = { kind: 'skin', op: 'extrude', faces, topo: { type: 'multi', parts, caps } }; check(r, true);
    }
    r.profile = { outer, holes }; r.vec = vec.slice(); r.lo = lo || null; r.hi = hi || null; r.pockets = pockets; return r;
  }
  /** EXACT: remove the part of an extruded freeform solid lying on the side of the plane (p, n) that n points into, when the plane crosses every side of the solid (an end cut, perpendicular or slanted).  Otherwise null. */
  function cutHalfSpace(a, p, n) {
    try {
      if (!isN(a) || !a.profile || !a.vec || (a.pockets && a.pockets.length)) return null; n = unit(n); const vec = a.vec, k = dot(n, vec), base = profPlane(a.profile.outer); if (Math.abs(k) < 1e-6 * len(vec)) return null;
      const Lp = a.lo || base, Hp = a.hi || { p: add(base.p, vec), n: base.n }, sOf = (P, pl) => dot(pl.n, sub(pl.p, P)) / dot(pl.n, vec), eps = 1e-6; let keepLo = null;
      for (const l of [a.profile.outer].concat(a.profile.holes)) for (const c of l) for (const q of cSample(c, 96)) {
        const s = dot(n, sub(p, q)) / k, s0 = sOf(q, Lp), s1 = sOf(q, Hp); if (!(s > s0 + eps && s < s1 - eps)) return null;
        const kl = dot(n, sub(add(q, mul(vec, s0)), p)) < 0; if (keepLo === null) keepLo = kl; else if (keepLo !== kl) return null; }
      const r = keepLo ? prismSolid(a.profile, vec, a.lo, { p, n }) : prismSolid(a.profile, vec, { p, n }, a.hi), c = check(r, false);
      return c.ok && massProps(r, 1).volume < massProps(a, 1).volume ? r : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  /** EXACT: cut by a convex tool with flat faces (a box, a wedge, a rotated block ...) of which exactly one face reaches the solid: that is a half-space cut */
  function cutPlanarTool(a, b) {
    try {
      if (!isN(a) || isN(b) || !AK._t) return null; const body = AK._t.evaluate(b, AK._t.RES_EXACT).body; if (body.faces.some((f) => f.surf.kind !== 'plane')) return null;
      const V = []; body.faces.forEach((f) => f.loops.forEach((lp) => lp.forEach((ce) => { V.push(ce.edge.v0.p, ce.edge.v1.p); }))); if (!V.length) return null;
      const cen = [0, 1, 2].map((i) => V.reduce((x, q) => x + q[i], 0) / V.length), size = Math.max(...V.map((q) => len(sub(q, cen))));
      const planes = body.faces.map((f) => { let nn = unit(f.surf.z); const o = f.surf.o; if (dot(nn, sub(cen, o)) > 0) nn = mul(nn, -1); return { n: nn, o }; });
      if (planes.some((pl) => V.some((q) => dot(pl.n, sub(q, pl.o)) > 1e-7 * size))) return null;                    // not convex
      const mn = [1e300, 1e300, 1e300], mx = [-1e300, -1e300, -1e300];
      faceCurves(a).forEach((c) => c.P.forEach((P) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], P[i]); mx[i] = Math.max(mx[i], P[i]); } }));
      const corners = []; for (let i = 0; i < 8; i++) corners.push([i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]]);
      const rel = planes.filter((pl) => corners.some((c) => dot(pl.n, sub(c, pl.o)) > 1e-9 * (1 + size))); if (!rel.length) return null; if (rel.length > 1) return toolCut(a, rel.map((pl) => ({ p: pl.o, n: mul(pl.n, -1) })));
      return ((a.profile && a.vec && !(a.pockets && a.pockets.length)) ? cutHalfSpace(a, rel[0].o, mul(rel[0].n, -1)) : null) || planeCut(a, rel[0].o, mul(rel[0].n, -1));
    } catch (e) { return null; }
  }
  /** EXACT: a cylinder of any axis (slanted too) passing right through a prism-type freeform solid, entering and leaving through its two flat ends with the whole mouth inside each end.  Walls are ruled along the tool axis between the two elliptical mouths. */
  function cutSkewCylinder(a, b) {
    try {
      if (!isN(a) || isN(b) || !a.profile || !a.vec || !AK._t) return null;
      const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, cyl = body.faces.filter((f) => f.surf.kind === 'cylinder'); if (cyl.length !== 1 || body.faces.length !== 3) return null;
      const S = cyl[0].surf, w = unit(S.z), r = S.r, o = S.o, base = profPlane(a.profile.outer), L = a.lo || base, H = a.hi || { p: add(base.p, a.vec), n: base.n };
      if (Math.abs(dot(L.n, w)) < 1e-3 || Math.abs(dot(H.n, w)) < 1e-3) return null;
      const tcaps = body.faces.filter((f) => f.surf.kind === 'plane'); if (tcaps.length !== 2) return null;
      const ts = tcaps.map((f) => dot(sub(f.surf.o, o), w)), tmin = Math.min(...ts), tmax = Math.max(...ts), [ex, ey] = planBasis(w);
      // the tool must reach beyond both end planes along its whole circumference
      const circ = []; for (let i = 0; i < 64; i++) { const th = 2 * Math.PI * i / 64; circ.push(add(o, add(mul(ex, r * Math.cos(th)), mul(ey, r * Math.sin(th))))); }
      const tAt = (P, pl) => dot(pl.n, sub(pl.p, P)) / dot(pl.n, w), margin = 1e-6 * (1 + r);
      for (const P of circ) { const t0 = tAt(P, L), t1 = tAt(P, H); if (!(Math.min(t0, t1) > tmin + margin && Math.max(t0, t1) < tmax - margin)) return null; }
      const loop = [circle(o, ex, ey, r)];
      // each mouth strictly inside the corresponding end face (profile loops projected onto the end plane along the sweep)
      const vec = a.vec, [f1, f2] = planBasis(unit(vec)), pj = (l, pl) => l.map((c) => cSample(c, 64).slice(0, -1).map((q) => { const x = projAlong(q, vec, pl); return [dot(x, f1), dot(x, f2)]; })).flat();
      void pj; const poly = (l, pl) => { const P = []; l.forEach((c) => cSample(c, 64).slice(0, -1).forEach((q) => { const x = projAlong(q, vec, pl); P.push([dot(x, f1), dot(x, f2)]); })); return P; };
      const inside = (p, pg) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const A = pg[i], B = pg[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
      const segD = (p, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); return Math.hypot(p[0] - A[0] - t * ab[0], p[1] - A[1] - t * ab[1]); };
      for (const pl of [L, H]) {
        const mouth = []; circ.forEach((P) => { const x = add(P, mul(w, tAt(P, pl))); mouth.push([dot(x, f1), dot(x, f2)]); });
        const O = poly(a.profile.outer, pl), Hs = a.profile.holes.map((h) => poly(h, pl)).concat((a.pockets || []).filter((q) => q.end !== 'thru').map((q) => poly(q.loop, pl))), all = [O].concat(Hs);
        let sz = 0; O.forEach((q) => { sz = Math.max(sz, Math.hypot(q[0] - O[0][0], q[1] - O[0][1])); }); const clear = 2e-3 * sz;
        for (const q of mouth) { if (!inside(q, O) || Hs.some((h) => inside(q, h))) return null; for (const pg of all) for (let i = 0; i < pg.length; i++) if (segD(q, pg[i], pg[(i + 1) % pg.length]) < clear) return null; }
        for (const pg of Hs) for (const q of pg) if (inside(q, mouth)) return null;
        for (const pg of all) for (const q of pg) for (let i = 0; i < mouth.length; i++) if (segD(q, mouth[i], mouth[(i + 1) % mouth.length]) < clear) return null;
      }
      // existing through-holes must not touch the new wall (mouths of both ends are separated, see above); existing floors of pockets are not handled
      if ((a.pockets || []).some((q) => q.end !== 'thru')) return null;
      const pk = (a.pockets || []).concat([{ loop, end: 'thru', plane: { p: o, n: w }, dir: w }]);
      const res = prismSolid(a.profile, a.vec, a.lo, a.hi, pk), c = check(res, false);
      return c.ok && massProps(res, 1).volume < massProps(a, 1).volume ? res : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }

  // ---- helpers for the curved-tool cut
  const evalOps = (ops, P) => { let m = -Infinity; for (const o of ops) { const vs = o.planes.map((q) => (q.val ? q.val(P) : dot(q.n, P) - q.d)), v = o.kind === 'keep' ? vs[0] : Math.min(...vs); if (v > m) m = v; } return m; };
  const nearestParam = (c, P) => { const [a, b] = dom(c); let t = a, bd = Infinity; for (let i = 0; i <= 400; i++) { const tt = a + (b - a) * i / 400, d = len(sub(cEval(c, tt), P)); if (d < bd) { bd = d; t = tt; } } let lo = Math.max(a, t - (b - a) / 400), hi = Math.min(b, t + (b - a) / 400); for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (len(sub(cEval(c, m1), P)) < len(sub(cEval(c, m2), P))) hi = m2; else lo = m1; } t = (lo + hi) / 2; return { t, d: len(sub(cEval(c, t), P)) }; };
  const splitAtPoints = (c, pts, tolD) => { const [a, b] = dom(c), ts = []; pts.forEach((P) => { const r = nearestParam(c, P); if (r.d < tolD) ts.push(r.t); }); const uniq = [...new Set(ts.map((x) => +x.toFixed(11)))].sort((x, y) => x - y).filter((t) => t > a + 1e-9 * (b - a) && t < b - 1e-9 * (b - a)); const out = []; let cur = c; for (const t of uniq) { const sp = cSplit(cur, t); out.push(sp[0]); cur = sp[1]; } out.push(cur); return out; };
  const inLoops2 = (P, f, e1, e2, o) => { let c = 0; const p = [dot(sub(P, o), e1), dot(sub(P, o), e2)]; f.loops.forEach((l) => { const poly = []; l.forEach((cc) => cSample(cc, 64).slice(0, -1).forEach((q) => poly.push([dot(sub(q, o), e1), dot(sub(q, o), e2)]))); for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A0 = poly[i], B0 = poly[j]; if ((A0[1] > p[1]) !== (B0[1] > p[1]) && p[0] < (B0[0] - A0[0]) * (p[1] - A0[1]) / (B0[1] - A0[1]) + A0[0]) c ^= 1; } }); return !!c; };
  /** a flat face clipped by the region where evalOps(ops) < 0 : the boundary curves are cut where they meet the tool, the tool's section curves inside the face close the outlines */
  function clipFlatByOps(f, ops, tag, scale) {
    const n = f.n, [e1, e2] = planBasis(n), o = f.o; let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    f.loops.forEach((l) => l.forEach((c) => cSample(c, 48).forEach((q) => { const s = dot(sub(q, o), e1), t = dot(sub(q, o), e2); s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); })));
    const pad = 0.05 * Math.max(s1 - s0, t1 - t0) + 1e-6 * scale; s0 -= pad; s1 += pad; t0 -= pad; t1 += pad; const cor = (s, t) => add(o, add(mul(e1, s), mul(e2, t)));
    const patch = { p: 1, q: 1, U: [0, 0, 1, 1], V: [0, 0, 1, 1], P: [[cor(s0, t0), cor(s0, t1)], [cor(s1, t0), cor(s1, t1)]], w: [[1, 1], [1, 1]] }, r = trimSurfaceByPlanes(patch, 1, ops, tag);
    if (r.mode === 'all') return { mode: 'all' }; if (r.mode === 'none') return { mode: 'none' };
    const bKept = [], roots = []; let dropped = false;
    f.loops.forEach((l) => l.forEach((c) => { const [a, b] = dom(c), Fc = (t) => evalOps(ops, cEval(c, t)), N0 = 240, ts = []; let prev = Fc(a);
      for (let i = 1; i <= N0; i++) { const t = a + (b - a) * i / N0, v = Fc(t); if ((prev < 0) !== (v < 0)) { let lo = a + (b - a) * (i - 1) / N0, hi = t, flo = prev; for (let it = 0; it < 100; it++) { const m = (lo + hi) / 2, fm = Fc(m); if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m; } const rt = (lo + hi) / 2; ts.push(rt); roots.push(cEval(c, rt)); } prev = v; }
      let cur = c; const subs = []; ts.forEach((t) => { const sp = cSplit(cur, t); subs.push(sp[0]); cur = sp[1]; }); subs.push(cur);
      subs.forEach((sc) => { const m = cEval(sc, (dom(sc)[0] + dom(sc)[1]) / 2); if (evalOps(ops, m) < 0) bKept.push(sc); else dropped = true; }); }));
    const sKept = []; r.contours.forEach((c, i) => { splitAtPoints(c, roots, 1e-6 * (1 + scale)).forEach((sc) => { const m = cEval(sc, (dom(sc)[0] + dom(sc)[1]) / 2); if (inLoops2(m, f, e1, e2, o) && curveLen(sc) > 1e-9 * (1 + scale)) sKept.push({ c: sc, k: r.ctags[i] }); }); });
    if (!dropped && !sKept.length) return { mode: 'all' }; if (!bKept.length && !sKept.length) return { mode: 'none' };
    const loops = chainLoops(bKept.concat(sKept.map((x) => x.c)), 1e-7 * (1 + scale)); if (!loops) return null;
    return { mode: 'clip', faces: facesFromLoops(loops, n, tag + 'k'), sections: sKept, off: null, nPlanes: r.nPlanes };
  }
  /** a tool body from the exact kernel: one curved face (sphere, torus, cylinder, cone) and its flat ends */
  function quadSpec(b) {
    const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, qs = body.faces.filter((f) => f.surf.kind !== 'plane'); if (qs.length !== 1 || !['sphere', 'torus', 'cylinder', 'cone'].includes(qs[0].surf.kind)) return null;
    const Q = qs[0].surf, kind = Q.kind, w0 = unit(Q.z), tcaps = body.faces.filter((f) => f.surf.kind === 'plane'); let caps = [];
    if (kind === 'cylinder' || kind === 'cone') { if (tcaps.length !== 2) return null; caps = tcaps.map((f) => ({ o: f.surf.o, t: dot(sub(f.surf.o, Q.o), w0) })).sort((x, y) => x.t - y.t); } else if (tcaps.length) return null;
    const test = kind === 'sphere' ? Q.o : kind === 'torus' ? add(Q.o, mul(unit(Q.x), Q.R)) : add(Q.o, mul(w0, (caps[0].t + caps[1].t) / 2)), sg = Q.f(test) < 0 ? 1 : -1;
    return { Q, kind, w0, caps, sg, con: { val: (P) => -sg * Q.f(P), grad: (P) => mul(Q.grad(P), -sg) } };
  }
  /** EXACT: curved tools (sphere, torus, cylinder, cone; any placement, slanted too) cutting a freeform solid: every curved side and every flat end is trimmed/clipped by the tool, the tool's own wall becomes a trimmed NURBS face (closed by the traced intersection curves), a blind end gets a flat floor.  Several tools are cut together from the original solid. */
  function cutQuadricTools(root, bodies) {
    const bail = (m) => { if (globalThis.__cpdbg) console.log('quad bail', m); return null; };
    if (!isN(root) || root.faces.some((f) => f.kind === 'trim')) return null;
    const specs = bodies.map(quadSpec); if (specs.some((x) => !x)) return null;
    const cloud = [], sides = [], flats = []; let scale = 1;
    root.faces.forEach((f) => { if (f.kind === 'cap') return; if (f.kind === 'plan') { flats.push(f); f.loops.forEach((l) => l.forEach((c) => cSample(c, 24).forEach((q) => cloud.push(q)))); } else { sides.push(...splitClosedFace(f)); const [u0, u1, v0, v1] = sDom(f.surf); for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) cloud.push(sEval(f.surf, u0 + (u1 - u0) * i / 12, v0 + (v1 - v0) * j / 12)); f.surf.P.forEach((r) => r.forEach((q) => { scale = Math.max(scale, len(q)); })); } });
    const capsF = root.faces.filter((f) => f.kind === 'cap'), grp = {}; capsF.forEach((f) => { const [u0, u1, v0, v1] = sDom(f.surf); for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) cloud.push(sEval(f.surf, u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * j / 8)); const k = f.tag.split('_')[0]; (grp[k] = grp[k] || []).push(f); });
    Object.keys(grp).forEach((k) => { const fs = grp[k].sort((x, y) => Number(x.tag.split('_')[1]) - Number(y.tag.split('_')[1])); flats.push(planFace([fs.map((f) => sRow(f.surf, 1))], fs[0].n, k)); });
    if (!cloud.length) return null;
    // point in solid by ray parity on a tessellation
    const tris = mesh(root, 14), insideA = (P) => { let votes = 0; for (const d0 of [[0.3, 0.5, 0.81], [-0.6, 0.2, 0.77], [0.1, -0.9, 0.42]]) { const d = unit(d0); let hits = 0; for (const [a, b, c] of tris) { const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-14) continue; const f = 1 / det, s = sub(P, a), u = f * dot(s, h); if (u < 0 || u > 1) continue; const q = cross(s, e1), v = f * dot(d, q); if (v < 0 || u + v > 1) continue; if (f * dot(e2, q) > 1e-12) hits++; } if (hits % 2) votes++; } return votes >= 2; };
    const minD = (P) => { let m = Infinity; for (const q of cloud) { const d = len(sub(q, P)); if (d < m) m = d; } return m; };
    // tool ends: beyond the solid (open) or inside it (a floor)
    for (const sp of specs) { sp.blind = -1; sp.tA0 = Infinity; sp.tA1 = -Infinity; cloud.forEach((P) => { const t = dot(sub(P, sp.Q.o), sp.w0); sp.tA0 = Math.min(sp.tA0, t); sp.tA1 = Math.max(sp.tA1, t); }); sp.pad = 0.05 * (sp.tA1 - sp.tA0) + 1e-6 * scale;
      if (sp.caps.length) { const st = [0, 1].map((i) => { const c = sp.caps[i], ct = add(sp.Q.o, mul(sp.w0, c.t)); if (i === 0 ? c.t < sp.tA0 - sp.pad : c.t > sp.tA1 + sp.pad) return 'open'; return insideA(ct) ? 'floor' : 'bad'; }); if (st.includes('bad')) return bail('tool end touches the surface of the solid'); if (st[0] === 'floor' && st[1] === 'floor') return bail('tool inside the solid'); sp.blind = st[0] === 'floor' ? 0 : st[1] === 'floor' ? 1 : -1; }
      const planes = [sp.con]; if (sp.blind >= 0) { const c = sp.caps[sp.blind], nIn = sp.blind === 0 ? sp.w0 : mul(sp.w0, -1), p0 = add(sp.Q.o, mul(sp.w0, c.t)); planes.push({ n: nIn, d: dot(nIn, p0) }); sp.floorN = nIn; sp.floorO = p0; }
      sp.op = { kind: 'tool', planes }; }
    const ops = specs.map((s) => s.op), off = []; { let k = 0; ops.forEach((o) => { off.push(k); k += o.planes.length; }); }
    const faces = [], pool = [], addPool = (c, k) => { let oi = 0; while (oi + 1 < off.length && off[oi + 1] <= k) oi++; pool.push({ c, oi, pi: k - off[oi] }); };
    let touched = false;
    for (const f of sides) { const r = trimSurfaceByPlanes(f.surf, f.sign, ops, f.tag + 'q'); if (r.mode === 'all') faces.push(f); else if (r.mode === 'trim') { touched = true; faces.push(...r.faces); r.contours.forEach((c, i) => addPool(c, r.ctags[i])); } else touched = true; }
    for (const f of flats) { const r = clipFlatByOps(f, ops, f.tag + 'q', scale); if (!r) return bail('flat end clip'); if (r.mode === 'all') faces.push(f); else if (r.mode === 'clip') { touched = true; faces.push(...r.faces); r.sections.forEach((x) => addPool(x.c, x.k)); } else touched = true; }
    if (!touched || !pool.length) return null;
    // ---- walls
    const planA = faces.filter((f) => f.kind === 'plan');
    specs.forEach((sp, idx) => {
      sp.wallCurves = pool.filter((x) => x.oi === idx && x.pi === 0).map((x) => x.c); sp.floorCurves = pool.filter((x) => x.oi === idx && x.pi === 1).map((x) => x.c); });
    const replaceList = [];
    for (let idx = 0; idx < specs.length; idx++) {
      const sp = specs[idx], Q = sp.Q, kind = sp.kind, w0 = sp.w0; if (!sp.wallCurves.length && !sp.floorCurves.length) continue; if (sp.floorCurves.length) return bail('floor meets the surface of the solid');
      const loops = chainLoops(sp.wallCurves, 1e-7 * scale); if (!loops) return bail('wall loops do not close');
      const perp = (w) => planBasis(w), clearOf = (pts) => { let m = Infinity; for (const P of pts) m = Math.min(m, minD(P)); return m; };
      let W = null;
      if (kind === 'sphere') { const cand = [], N0 = 64; for (let i = 0; i < N0; i++) { const z = 1 - 2 * (i + 0.5) / N0, rr = Math.sqrt(1 - z * z), ph = i * 2.399963229728653, w = [rr * Math.cos(ph), rr * Math.sin(ph), z], [e1, e2] = perp(w); for (let k = 0; k < 12; k++) { const th = 2 * Math.PI * k / 12, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th))), pts = []; for (let m = 0; m <= 16; m++) { const al = -Math.PI / 2 + Math.PI * m / 16; pts.push(add(Q.o, add(mul(ref, Q.r * Math.cos(al)), mul(w, Q.r * Math.sin(al))))); } cand.push({ sc: clearOf(pts), w, ref, pts }); } }
        cand.sort((x, y) => y.sc - x.sc); let pick = cand[0]; for (const cd of cand.slice(0, 10)) { if (!cd.pts.some((P) => insideA(P))) { pick = cd; break; } }
        W = revolve([arc(Q.o, pick.ref, pick.w, Q.r, -Math.PI / 2, Math.PI / 2), line(add(Q.o, mul(pick.w, Q.r)), add(Q.o, mul(pick.w, -Q.r)))], Q.o, pick.w).faces[0]; }
      else if (kind === 'cylinder' || kind === 'cone') { const [e1, e2] = perp(w0), t0 = sp.blind === 0 ? sp.caps[0].t : sp.tA0 - sp.pad, t1 = sp.blind === 1 ? sp.caps[1].t : sp.tA1 + sp.pad, rho = (t) => (kind === 'cone' ? Q.r + Q.k * t : Q.r); if (rho(t0) < 1e-6 * Q.r || rho(t1) < 1e-6 * Q.r) return bail('cone apex');
        const cand = []; for (let k = 0; k < 24; k++) { const th = 2 * Math.PI * k / 24, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th))), pts = []; for (let m = 0; m <= 16; m++) { const t = t0 + (t1 - t0) * m / 16; pts.push(add(add(Q.o, mul(w0, t)), mul(ref, rho(t)))); } cand.push({ sc: clearOf(pts), ref, pts }); }
        cand.sort((x, y) => y.sc - x.sc); let pick = cand[0]; for (const cd of cand.slice(0, 8)) { if (!cd.pts.some((P) => insideA(P))) { pick = cd; break; } }
        const y2 = cross(w0, pick.ref), ring = (t) => circle(add(Q.o, mul(w0, t)), pick.ref, y2, rho(t)); W = (kind === 'cylinder' ? extrude(ring(t0), mul(w0, t1 - t0)) : loft([ring(t0), ring(t1)])).faces[0]; }
      else { const [e1, e2] = perp(w0), cand = []; for (let k = 0; k < 12; k++) { const th = 2 * Math.PI * k / 12, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th)));
          for (let q = 0; q < 12; q++) { const ph = 2 * Math.PI * q / 12, p2 = [], p3 = []; for (let m = 0; m < 24; m++) { const al = 2 * Math.PI * m / 24, rr = Q.R + Q.r * Math.cos(al + ph); p2.push(add(Q.o, add(mul(ref, rr), mul(w0, Q.r * Math.sin(al + ph))))); const be = al, rr3 = Q.R + Q.r * Math.cos(ph); p3.push(add(Q.o, add(add(mul(e1, rr3 * Math.cos(be)), mul(e2, rr3 * Math.sin(be))), mul(w0, Q.r * Math.sin(ph))))); } cand.push({ sc: Math.min(clearOf(p2), clearOf(p3)), ref, ph, pts: p2.concat(p3) }); } }
        cand.sort((x, y) => y.sc - x.sc); let pick = cand[0]; for (const cd of cand.slice(0, 8)) { if (!cd.pts.some((P) => insideA(P))) { pick = cd; break; } }
        const xd = add(mul(pick.ref, Math.cos(pick.ph)), mul(w0, Math.sin(pick.ph))), yd = add(mul(pick.ref, -Math.sin(pick.ph)), mul(w0, Math.cos(pick.ph))); W = revolve([circle(add(Q.o, mul(pick.ref, Q.R)), xd, yd, Q.r)], Q.o, w0).faces[0]; }
      if (kind === 'sphere') { const S0 = W.surf; W = { surf: { p: S0.q, q: S0.p, U: S0.V, V: S0.U, P: S0.P[0].map((_, j) => S0.P.map((r) => r[j])), w: S0.w[0].map((_, j) => S0.w.map((r) => r[j])) } }; }   // revolve: u runs along the profile, v around the axis; make u the periodic one
      const WS = W.surf, [wu0, wu1, wv0, wv1] = sDom(WS), span = wu1 - wu0, spanV = wv1 - wv0, midV = (wv0 + wv1) / 2, midU = (wu0 + wu1) / 2;
      const periodic = len(sub(sEval(WS, wu0, midV), sEval(WS, wu1, midV))) < 1e-9 * (1 + scale), periodicV = len(sub(sEval(WS, midU, wv0), sEval(WS, midU, wv1))) < 1e-9 * (1 + scale);
      const mkToUV = (SS, per, perV) => { const [a0, a1, c0, c1] = sDom(SS), GG = [], GGP = []; for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const q = [a0 + (a1 - a0) * i / 40, c0 + (c1 - c0) * j / 40]; GG.push(q); GGP.push(sEval(SS, q[0], q[1])); }
        const wrapU = (u) => ((u - a0) % (a1 - a0) + (a1 - a0)) % (a1 - a0) + a0, wrapV = (v) => ((v - c0) % (c1 - c0) + (c1 - c0)) % (c1 - c0) + c0;
        return (P, seed) => { let uv = seed; if (!uv) { let bd = Infinity; GGP.forEach((g, i) => { const d = len(sub(g, P)); if (d < bd) { bd = d; uv = GG[i]; } }); } let [u, v] = uv;
          for (let it = 0; it < 60; it++) { const e = sEval(SS, per ? wrapU(u) : u, perV ? wrapV(v) : v, true), r = sub(P, e.p), a11 = dot(e.u, e.u), a12 = dot(e.u, e.v), a22 = dot(e.v, e.v), b1 = dot(r, e.u), b2 = dot(r, e.v), det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-24) break; const du = (b1 * a22 - b2 * a12) / det, dv = (a11 * b2 - a12 * b1) / det; u = per ? u + du : Math.min(a1, Math.max(a0, u + du)); v = perV ? v + dv : Math.min(c1, Math.max(c0, v + dv)); if (Math.abs(du) < 1e-15 && Math.abs(dv) < 1e-15) break; }
          return [per ? wrapU(u) : u, perV ? wrapV(v) : v]; }; };
      const toUVw = mkToUV(WS, periodic, periodicV);
      const uvSeq = (toUV, per, perV, c, n, startAtZero) => { const out = []; let seed = null, offU = 0, offV = 0, pu = null, pv = null; for (let i = 0; i <= n; i++) { const t = dom(c)[0] + (dom(c)[1] - dom(c)[0]) * i / n, uv = toUV(cEval(c, t), seed); seed = uv; let u = uv[0], v = uv[1];
          if (per) { if (i === 0 && startAtZero && u > midU) offU = -span; else if (pu !== null) { const du = u - pu; if (du > span / 2) offU -= span; else if (du < -span / 2) offU += span; } pu = u; u += offU; }
          if (perV) { if (pv !== null) { const dv = v - pv; if (dv > spanV / 2) offV -= spanV; else if (dv < -spanV / 2) offV += spanV; } pv = v; v += offV; }
          out.push([u, v]); } return out; };
      const shoe = (pts) => { let s2 = 0; for (let i = 0; i < pts.length; i++) { const p0 = pts[i], q0 = pts[(i + 1) % pts.length]; s2 += p0[0] * q0[1] - q0[0] * p0[1]; } return s2 / 2; };
      const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A0 = poly[i], B0 = poly[j]; if ((A0[1] > p[1]) !== (B0[1] > p[1]) && p[0] < (B0[0] - A0[0]) * (p[1] - A0[1]) / (B0[1] - A0[1]) + A0[0]) c = !c; } return c; };
      const mkUvC = (pts) => interp(pts.map((q) => [q[0], q[1], 0]), 3), closeN = 600;
      const info = loops.map((lp) => { const poly = []; lp.forEach((c, k) => { const q = uvSeq(toUVw, periodic, periodicV, c, 48, false); let offU = 0, offV = 0; if (k > 0) { const last = poly[poly.length - 1]; offU = periodic ? Math.round((last[0] - q[0][0]) / span) * span : 0; offV = periodicV ? Math.round((last[1] - q[0][1]) / spanV) * spanV : 0; } q.slice(0, -1).forEach((p) => poly.push([p[0] + offU, p[1] + offV])); });
        for (let i = 1; i < poly.length; i++) { if (periodic) { while (poly[i][0] - poly[i - 1][0] > span / 2) poly[i][0] -= span; while (poly[i][0] - poly[i - 1][0] < -span / 2) poly[i][0] += span; } if (periodicV) { while (poly[i][1] - poly[i - 1][1] > spanV / 2) poly[i][1] -= spanV; while (poly[i][1] - poly[i - 1][1] < -spanV / 2) poly[i][1] += spanV; } }
        const f0 = poly[0], l0 = poly[poly.length - 1], step = (() => { const a = poly[poly.length - 1], b = poly[0]; return [b[0] - a[0], b[1] - a[1]]; })(); const wndU = periodic ? Math.round(-(l0[0] - f0[0] + step[0]) / span * -1) : 0, wndV = periodicV ? Math.round((l0[1] - f0[1] + step[1]) / spanV) : 0; void wndU;
        // winding = total unwrapped displacement around the closed loop
        let totU = 0, totV = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; let du = b[0] - a[0], dv = b[1] - a[1]; if (periodic) { while (du > span / 2) du -= span; while (du < -span / 2) du += span; } if (periodicV) { while (dv > spanV / 2) dv -= spanV; while (dv < -spanV / 2) dv += spanV; } totU += du; totV += dv; }
        return { lp, poly, area: shoe(poly), wnd: periodic ? Math.round(totU / span) : 0, wndV: periodicV ? Math.round(totV / spanV) : 0 }; });
      if (info.some((x) => x.wndV !== 0)) return bail('loop winds around the tube');
      const wsign = (() => { const e0 = sEval(WS, midU, midV, true), nrm = cross(e0.u, e0.v); return dot(nrm, sp.con.grad(e0.p)) > 0 ? 1 : -1; })();
      const flat = info.filter((x) => x.wnd === 0), wrap = info.filter((x) => x.wnd !== 0);
      if (flat.length && wrap.length) return bail('mixed loops');
      const orientedLoop = (lp, ccw, area) => ((area > 0) === ccw ? lp : lp.slice().reverse().map((c) => cReverse(c)));
      const pieceOf = (c, toUV, per, perV, start0) => ({ type: 'c', uvC: mkUvC(uvSeq(toUV, per, perV, c, closeN, start0)), c3: c, plane: -1 });
      const bord = (side, A0, B0) => { const bc = borderCurves(WS)[side], vert = side % 2 === 1, ta = vert ? A0[1] : A0[0], tb = vert ? B0[1] : B0[0], lo2 = Math.min(ta, tb), hi2 = Math.max(ta, tb); let c3 = null; if (hi2 - lo2 > 1e-13) { const sc = cSub(bc.c, lo2, hi2); if (curveLen(sc) > 1e-10) c3 = ta <= tb ? sc : cReverse(sc); } return { type: 'b', side, a: A0, b: B0, c3 }; };
      // plain discs
      if (flat.length) { flat.forEach((x, i) => { x.depth = flat.filter((y, j) => j !== i && Math.abs(y.area) > Math.abs(x.area) && inPoly(x.poly[0], y.poly)).length; if (x.poly.some((p) => (periodic && (p[0] < wu0 - 1e-9 || p[0] > wu1 + 1e-9)) || p[1] < wv0 - 1e-9 || p[1] > wv1 + 1e-9)) x.cross = true; });
        if (flat.some((x) => x.cross)) return bail('loop crosses the wall seam');
        let k = 0; for (const o of flat.filter((x) => x.depth % 2 === 0)) { const holes = flat.filter((h) => h.depth % 2 === 1 && inPoly(h.poly[0], o.poly)); const cen = [o.poly.reduce((a, p) => a + p[0], 0) / o.poly.length, o.poly.reduce((a, p) => a + p[1], 0) / o.poly.length]; const pin = inPoly(cen, o.poly) ? cen : o.poly[0]; void pin;
          const mkL = (x, ccw) => ({ pieces: orientedLoop(x.lp, ccw, x.area).map((c) => pieceOf(c, toUVw, periodic, periodicV, false)) }); faces.push({ kind: 'trim', surf: WS, sign: wsign, tag: 'quad_wall' + idx + '_' + (k++), loops: [mkL(o, true)].concat(holes.map((h) => mkL(h, false))) }); } }
      // loops around the tool: strips between consecutive loops (or the ends of the wall), kept where they lie inside the solid
      if (wrap.length) {
        const entries = [];
        for (const x of wrap) {
          let found = null; const cs = x.lp.slice();
          for (let ci = 0; ci < cs.length && !found; ci++) { const c = cs[ci], seq = uvSeq(toUVw, periodic, false, c, 240, false); for (let k = 1; k < seq.length; k++) { const a = Math.floor((seq[k - 1][0] - wu0) / span + 1e-12), b = Math.floor((seq[k][0] - wu0) / span + 1e-12); if (a === b) continue;
              const [d0, d1] = dom(c); let lo = d0 + (d1 - d0) * (k - 1) / 240, hi = d0 + (d1 - d0) * k / 240; const base = seq[k - 1][0], target = wu0 + Math.max(a, b) * span; const unw = (t) => { let u = toUVw(cEval(c, t), null)[0]; while (u - base > span / 2) u -= span; while (u - base < -span / 2) u += span; return u; };
              for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if ((unw(mid) - target) * (base - target) > 0) lo = mid; else hi = mid; } found = { ci, t: (lo + hi) / 2 }; break; } }
          if (!found) return bail('no seam crossing');
          const c = cs[found.ci], [d0, d1] = dom(c), Pc = cEval(c, found.t), proper = found.t - d0 > 1e-9 * (d1 - d0) && d1 - found.t > 1e-9 * (d1 - d0), sp2 = proper ? cSplit(c, found.t) : null; let seqC;
          if (sp2) { seqC = [sp2[1]].concat(cs.slice(found.ci + 1), cs.slice(0, found.ci), [sp2[0]]); replaceList.push({ orig: c, P: Pc }); } else seqC = cs.slice(found.ci).concat(cs.slice(0, found.ci));
          let path = seqC, tot = 0; { const sq = []; path.forEach((cc) => uvSeq(toUVw, periodic, false, cc, 24, false).forEach((q) => sq.push(q))); for (let i = 1; i < sq.length; i++) { let du = sq[i][0] - sq[i - 1][0]; while (du > span / 2) du -= span; while (du < -span / 2) du += span; tot += du; } if (tot < 0) path = path.slice().reverse().map((cc) => cReverse(cc)); }
          let vHalf = null, bd = Infinity; x.poly.forEach((p) => { const fr = ((p[0] - wu0) % span + span) % span / span, d = Math.abs(fr - 0.5); if (d < bd) { bd = d; vHalf = p[1]; } });
          entries.push({ path, vHalf }); }
        entries.sort((a, b) => a.vHalf - b.vHalf);
        const bounds = [{ border: 0, v: wv0 }].concat(entries, [{ border: 2, v: wv1 }]);
        // inside-ness of the first strip, then alternate
        const mid0 = (bounds[0].v + bounds[1].vHalf) / 2, probe = sEval(WS, midU, mid0); let inside = insideA(probe);
        const flips = []; for (let k = 0; k + 1 < bounds.length; k++) { flips.push(inside); inside = !inside; }
        const lastIn = insideA(sEval(WS, midU, (bounds[bounds.length - 1].v + bounds[bounds.length - 2].vHalf) / 2)); if (lastIn !== flips[flips.length - 1]) return bail('strip parity');
        let sk = 0;
        for (let k = 0; k + 1 < bounds.length; k++) { if (!flips[k]) continue; const lo = bounds[k], hi = bounds[k + 1], ring = [];
          const lowPieces = lo.path ? lo.path.map((cc, ci) => pieceOf(cc, toUVw, periodic, periodicV, ci === 0)) : null, hiRev = hi.path ? hi.path.slice().reverse().map((cc) => cReverse(cc)) : null, hiPieces = hiRev ? hiRev.map((cc) => pieceOf(cc, toUVw, periodic, periodicV, false)) : null;
          const fixU = (arr, startU) => { let cur = startU; arr.forEach((pc) => { const U = pc.uvC, uS = cEval(U, dom(U)[0])[0], shift = Math.round((cur - uS) / span) * span; if (shift) pc.uvC = curve(U.p, U.U, U.P.map((q) => [q[0] + shift, q[1], q[2]]), U.w); cur = cEval(pc.uvC, dom(pc.uvC)[1])[0]; }); };
          if (lowPieces) fixU(lowPieces, wu0); if (hiPieces) fixU(hiPieces, wu1);
          const endV = (arr, atStart) => (atStart ? cEval(arr[0].uvC, dom(arr[0].uvC)[0])[1] : cEval(arr[arr.length - 1].uvC, dom(arr[arr.length - 1].uvC)[1])[1]);
          const vLoStart = lowPieces ? endV(lowPieces, true) : wv0, vLoEnd = lowPieces ? endV(lowPieces, false) : wv0, vHiStart = hiPieces ? endV(hiPieces, true) : wv1, vHiEnd = hiPieces ? endV(hiPieces, false) : wv1;
          if (lowPieces) ring.push(...lowPieces); else ring.push(bord(0, [wu0, wv0], [wu1, wv0]));
          ring.push(bord(1, [wu1, vLoEnd], [wu1, vHiStart])); if (hiPieces) ring.push(...hiPieces); else ring.push(bord(2, [wu1, wv1], [wu0, wv1])); ring.push(bord(3, [wu0, vHiEnd], [wu0, vLoStart]));
          faces.push({ kind: 'trim', surf: WS, sign: wsign, tag: 'quad_wall' + idx + '_s' + (sk++), loops: [{ pieces: ring }] }); }
        // the solid's faces meet the wall along the same edges: cut their contour pieces at the same points
        for (const rp of replaceList.splice(0)) { let done = false;
          for (const f of faces) { if (done) break;
            if (f.kind === 'trim') { for (const lp of f.loops) { const idx2 = lp.pieces.findIndex((pc) => { if (pc.type !== 'c') return false; const r0 = nearestParam(pc.c3, rp.P); return r0.d < 1e-7 * (1 + scale) && curveLen(pc.c3) > 0; }); if (idx2 < 0) continue; const pc = lp.pieces[idx2], toA = mkToUV(f.surf, false, false), r0 = nearestParam(pc.c3, rp.P), [e0, e1] = dom(pc.c3); if (r0.t <= e0 + 1e-9 * (e1 - e0) || r0.t >= e1 - 1e-9 * (e1 - e0)) { done = true; break; }
                const sp3 = cSplit(pc.c3, r0.t), mk = (c3) => ({ type: 'c', uvC: mkUvC(uvSeq(toA, false, false, c3, closeN, false)), c3, plane: -1 }); lp.pieces.splice(idx2, 1, mk(sp3[0]), mk(sp3[1])); done = true; break; } }
            else if (f.kind === 'plan') { for (const lp of f.loops) { const idx2 = lp.findIndex((c) => nearestParam(c, rp.P).d < 1e-7 * (1 + scale)); if (idx2 < 0) continue; const c = lp[idx2], r0 = nearestParam(c, rp.P), [e0, e1] = dom(c); if (r0.t <= e0 + 1e-9 * (e1 - e0) || r0.t >= e1 - 1e-9 * (e1 - e0)) { done = true; break; } const sp3 = cSplit(c, r0.t); lp.splice(idx2, 1, sp3[0], sp3[1]); done = true; break; } } } }
      }
      // the floor of a blind end: the flat disc closed by the wall's own border circle
      if (sp.blind >= 0) { const side = sp.blind === 0 ? 0 : 2, bcv = borderCurves(WS)[side].c; faces.push(planFace([[bcv]], sp.floorN, 'quad_floor' + idx)); }
    }
    void planA;
    if (!faces.length) return null; const res = { kind: 'skin', op: 'cut', faces, topo: { type: 'brep' } }, c = check(res, false); if (globalThis.__cpdbg) console.log('quad check', JSON.stringify(c), faces.map((f) => f.kind + ':' + f.tag).join());
    if (!c.ok || !(c.volume > 0) || !(c.volume < massProps(root, 1).volume)) return bail('check failed'); return res;
  }
  function cutQuadricTool(a, b) {
    try {
      if (!isN(a) || isN(b) || !AK._t) return null; const root = a.qsrc ? a.qsrc.root : a, bodies = (a.qsrc ? a.qsrc.bodies : []).concat([b]);
      const r = cutQuadricTools(root, bodies); if (r) r.qsrc = { root, bodies }; return r;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  const cutExact = (a, b) => cutPrism(a, b) || cutSkewCylinder(a, b) || cutPlanarTool(a, b) || cutQuadricTool(a, b) || boolPrisms('cut', a, b);
  /** EXACT cut of an extruded freeform solid by a prism (box, cylinder, any extrusion of lines and arcs) whose axis is parallel to the extrusion and which passes right through it, lying inside the profile:
   *  the result is the same extrusion with one more hole.  Returns null when the case is not this one (the caller then uses another way). */
  function cutPrism(a, b) {
    try {
      if (!isN(a) || isN(b) || !a.profile || !a.vec || !AK._t || (a.pockets || []).some((q) => q.end === 'thru')) return null;
      const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, L = len(a.vec); if (!(L > 0)) return null; const d = mul(a.vec, 1 / L), caps = [];
      for (const f of body.faces) { const S = f.surf, zd = Math.abs(dot(S.z, d));
        if (S.kind === 'plane' && zd > 1 - 1e-9) caps.push(f); else if ((S.kind === 'plane' && zd < 1e-9) || (S.kind === 'cylinder' && zd > 1 - 1e-9)) continue; else return null; }
      if (caps.length !== 2) return null;
      const off = (f) => dot(f.surf.o, d), lo = off(caps[0]) <= off(caps[1]) ? caps[0] : caps[1], t0 = Math.min(off(caps[0]), off(caps[1])), t1 = Math.max(off(caps[0]), off(caps[1]));
      const first = a.profile.outer[0], s0 = dot(cEval(first, dom(first)[0]), d), s1 = s0 + L, eps = 1e-9 * (1 + L); if (lo.loops.length !== 1) return null;
      const base = profPlane(a.profile.outer), slanted = !!(a.lo || a.hi), flatEnds = !slanted && Math.abs(dot(base.n, d)) > 1 - 1e-9, Lp = a.lo || base, Hp = a.hi || { p: add(base.p, a.vec), n: base.n };
      let s0min = 1e300, s1max = -1e300; for (const l of [a.profile.outer].concat(a.profile.holes)) for (const c of l) for (const q of cSample(c, 64)) { s0min = Math.min(s0min, dot(projAlong(q, a.vec, Lp), d)); s1max = Math.max(s1max, dot(projAlong(q, a.vec, Hp), d)); }
      const into = (P) => projAlong(P, a.vec, base), loop = [];
      for (const ce of lo.loops[0]) { const e = ce.edge; let c;
        if (e.kind === 'line') c = line(e.v0.p, e.v1.p);
        else if (e.kind === 'circle') { const full = Math.abs(Math.abs(e.a1 - e.a0) - 2 * Math.PI) < 1e-9; c = full ? arc(e.c, e.x, e.y, e.r, e.a0, e.a0 + 2 * Math.PI) : arc(e.c, e.x, e.y, e.r, e.a0, e.a1); }
        else return null;
        c = cMap(c, into); loop.push(ce.fwd ? c : cReverse(c)); }
      checkClosed(loop, 'tool profile');
      // containment: the tool profile lies strictly inside the solid's profile and outside its holes, with a clearance
      const [e1, e2] = planBasis(d), pl = (loops) => loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 64).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
      const O = pl([a.profile.outer])[0], H = pl(a.profile.holes.concat((a.pockets || []).map((q) => q.loop))), Tl = pl([loop])[0], all = [O].concat(H);
      const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
      let size = 0; O.forEach((p) => { size = Math.max(size, Math.hypot(p[0] - O[0][0], p[1] - O[0][1])); }); const clear = 2e-3 * size;
      const segDist = (p, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); return Math.hypot(p[0] - A[0] - t * ab[0], p[1] - A[1] - t * ab[1]); };
      for (const p of Tl) { if (!inside(p, O)) return null; if (H.some((h) => inside(p, h))) return null; for (const poly of all) for (let i = 0; i < poly.length; i++) if (segDist(p, poly[i], poly[(i + 1) % poly.length]) < clear) return null; }
      for (const poly of all.slice(1)) for (const p of poly) if (inside(p, Tl)) return null;             // an existing hole would be swallowed
      for (const poly of all) for (const p of poly) for (let i = 0; i < Tl.length; i++) if (segDist(p, Tl[i], Tl[(i + 1) % Tl.length]) < clear) return null;
      const pks = a.pockets || [], mkPrism = (holes, pockets) => (slanted || pockets.length || (a.pockets && a.pockets.length) ? prismSolid({ outer: a.profile.outer, holes }, a.vec, a.lo, a.hi, pockets) : extrude({ outer: a.profile.outer, holes }, a.vec));
      if (t0 <= s0min + eps && t1 >= s1max - eps) return mkPrism(a.profile.holes.concat([loop]), pks);
      // blind pocket from one end: the floor must lie strictly between the two ends along the whole mouth
      let loMax = -1e300, hiMin = 1e300; for (const c of loop) for (const q of cSample(c, 64)) { loMax = Math.max(loMax, dot(projAlong(q, a.vec, Lp), d)); hiMin = Math.min(hiMin, dot(projAlong(q, a.vec, Hp), d)); }
      const tol = 1e-6 * (1 + L), fromTop = t1 >= s1max - eps && t0 > loMax + tol && t0 < hiMin - tol, fromBot = t0 <= s0min + eps && t1 < hiMin - tol && t1 > loMax + tol; if (!fromTop && !fromBot) return null;
      const ft = fromTop ? t0 : t1, plane = { p: mul(d, ft), n: d };
      const r = mkPrism(a.profile.holes, pks.concat([{ loop, end: fromTop ? 'hi' : 'lo', plane }])); return check(r, false).ok ? r : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  // ======================================================================================================
  // Trimmed freeform faces and the general plane cut.  A trimmed face is a NURBS surface plus loops of trim pieces:
  // iso-parameter border pieces (exact sub-curves of the surface border) and contour pieces (the plane meets the surface
  // along a curve that is traced to 1e-13 on both the surface and the plane, then interpolated by a cubic spline).
  // ======================================================================================================
  const insertKnotOnce = (c, t) => {
    const p = c.p, U = c.U, n = c.P.length - 1, k = span(n, p, t, U), Pw = c.P.map((q, i) => [q[0] * c.w[i], q[1] * c.w[i], q[2] * c.w[i], c.w[i]]), Q = [];
    for (let i = 0; i <= n + 1; i++) { if (i <= k - p) Q.push(Pw[i]); else if (i >= k + 1) Q.push(Pw[i - 1]); else { const a = (t - U[i]) / (U[i + p] - U[i]); Q.push([0, 1, 2, 3].map((m) => (1 - a) * Pw[i - 1][m] + a * Pw[i][m])); } }
    return curve(p, U.slice(0, k + 1).concat([t], U.slice(k + 1)), Q.map((q) => [q[0] / q[3], q[1] / q[3], q[2] / q[3]]), Q.map((q) => q[3]));
  };
  function cSplit(c, t) {
    const p = c.p; let cc = c, mult = c.U.filter((u) => Math.abs(u - t) < 1e-14).length;
    while (mult < p + 1) { cc = insertKnotOnce(cc, t); mult++; }
    const f = cc.U.findIndex((u) => Math.abs(u - t) < 1e-14);
    return [curve(p, cc.U.slice(0, f + p + 1), cc.P.slice(0, f), cc.w.slice(0, f)), curve(p, cc.U.slice(f), cc.P.slice(f), cc.w.slice(f))];
  }
  function cSub(c, a, b) { const [d0, d1] = dom(c); let r = c; if (a > d0 + 1e-13) r = cSplit(r, a)[1]; if (b < d1 - 1e-13) r = cSplit(r, b)[0]; return r; }
  const gaussRange = (a, b, knots, sub2) => { const ks = [a].concat(knots.filter((k) => k > a + 1e-13 && k < b - 1e-13), [b]), out = []; for (let s = 0; s + 1 < ks.length; s++) { const lo = ks[s], hi = ks[s + 1]; for (let t = 0; t < sub2; t++) { const l = lo + (hi - lo) * t / sub2, h = lo + (hi - lo) * (t + 1) / sub2, m = (l + h) / 2, r = (h - l) / 2; for (let g = 0; g < 4; g++) { out.push([m - r * GX[g], r * GW[g]], [m + r * GX[g], r * GW[g]]); } } } return out; };
  /** Green's theorem over the trimmed parameter region: the surface integral becomes a line integral over the trim pieces with an inner integral in v */
  function integrateTrim(face, f) {
    const S = face.surf, [, , v0] = sDom(S), sg = face.sign;
    const inner = (u, vEnd, wo) => { if (vEnd <= v0 + 1e-15) return; for (const [v, wv] of gaussRange(v0, vEnd, S.V, 3)) { const e = sEval(S, u, v, true); f(e.p, mul(cross(e.u, e.v), sg), wo * wv); } };
    face.loops.forEach((lp) => lp.pieces.forEach((pc) => {
      if (pc.type === 'b') { if (pc.side % 2 === 1) return; const ua = pc.a[0], ub = pc.b[0], dir = ub >= ua ? 1 : -1; if (Math.abs(ub - ua) < 1e-15) return; for (const [u, w] of gaussRange(Math.min(ua, ub), Math.max(ua, ub), S.U, 2)) inner(u, pc.a[1], -dir * w); return; }
      const [t0, t1] = dom(pc.uvC); for (const [t, w] of gaussRange(t0, t1, pc.uvC.U, 1)) { const e = cEval(pc.uvC, t, true); inner(e.p[0], e.p[1], -e.d[0] * w); }
    }));
  }
  const integ = (f, cb, s) => (f.kind === 'trim' ? integrateTrim(f, cb) : integrate(f.surf, f.sign, cb, s));
  const borderCurves = (S) => { const nU = S.P.length - 1, nV = S.P[0].length - 1; return [{ c: sRow(S, 0), rev: false }, { c: sCol(S, nU), rev: false }, { c: sRow(S, nV), rev: true }, { c: sCol(S, 0), rev: true }]; };
  const curveLen = (c) => { let L = 0, q = cEval(c, dom(c)[0]); for (let i = 1; i <= 8; i++) { const r = cEval(c, dom(c)[0] + (dom(c)[1] - dom(c)[0]) * i / 8); L += len(sub(r, q)); q = r; } return L; };
  /** trim a NURBS surface face by the half-space  nrm.x <= d : {mode:'all'|'none'|'trim', faces:[trim faces], contours:[3D curves in the plane]} */
  const trimSurfaceByPlane = (S, sign, nrm, d, tag) => trimSurfaceByPlanes(S, sign, [{ n: nrm, d }], tag);
  function trimSurfaceByPlanes(S, sign, opsIn, tag) {
    const ops = opsIn[0] && opsIn[0].planes ? opsIn : opsIn.map((pl) => ({ kind: 'keep', planes: [pl] })), planes = [], off = []; ops.forEach((o) => { off.push(planes.length); o.planes.forEach((pl) => planes.push(pl)); });
    const [u0, u1, v0, v1] = sDom(S), cv = (q, P) => (q.val ? q.val(P) : dot(q.n, P) - q.d), cg = (q, P) => (q.grad ? q.grad(P) : q.n), fk = (P) => planes.map((q) => cv(q, P)), opVal = (f) => ops.map((o, oi) => (o.kind === 'keep' ? f[off[oi]] : Math.min(...o.planes.map((_, k) => f[off[oi] + k])))), fv = (u, v) => Math.max(...opVal(fk(sEval(S, u, v))));
    const actOf = (uv) => { const f = fk(sEval(S, uv[0], uv[1])), ov = opVal(f); let b = 0; ov.forEach((x, k) => { if (x > ov[b]) b = k; }); if (ops[b].kind === 'keep') return off[b]; let m = off[b]; ops[b].planes.forEach((_, k) => { if (f[off[b] + k] < f[m]) m = off[b] + k; }); return m; };
    const mk = (a, b, ks, per, min) => { const k = [...new Set(ks.filter((x) => x >= a - 1e-14 && x <= b + 1e-14))].sort((x, y) => x - y), o = [k[0]], tot = Math.max(per, Math.ceil(min / Math.max(1, k.length - 1))); for (let i = 0; i + 1 < k.length; i++) for (let j = 1; j <= tot; j++) o.push(k[i] + (k[i + 1] - k[i]) * j / tot); return o; };
    const us = mk(u0, u1, S.U, 10, 24), vs = mk(v0, v1, S.V, 10, 24), NU = us.length - 1, NV = vs.length - 1, F = us.map((u) => vs.map((v) => fv(u, v)));
    let any = false, all = true, fmax = 0; F.forEach((r) => r.forEach((x) => { if (x < 0) any = true; else all = false; fmax = Math.max(fmax, Math.abs(x)); }));
    if (all) return { mode: 'all' }; if (!any) return { mode: 'none' };
    const ins = (i, j) => F[i][j] < 0, cache = new Map(), pos = new Map(), vkey = (i, j) => 'V' + i + ',' + j, vpos = (i, j) => [us[i], vs[j]];
    const crossing = (dir, i, j) => { const key = dir + ',' + i + ',' + j; let r = cache.get(key); if (r) return r; const ai = i, aj = j, bi = dir === 0 ? i + 1 : i, bj = dir === 0 ? j : j + 1, A = vpos(ai, aj), B = vpos(bi, bj); let lo = 0, hi = 1, flo = F[ai][aj], fhi = F[bi][bj], side = 0, s = 0.5;
      for (let it = 0; it < 100; it++) { s = lo - flo * (hi - lo) / (fhi - flo); if (!(s > lo && s < hi)) s = (lo + hi) / 2; const fs = fv(A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s); if (Math.abs(fs) < 1e-14 * (1 + fmax) || hi - lo < 1e-15) { break; } if ((fs < 0) === (flo < 0)) { lo = s; flo = fs; if (side === -1) fhi /= 2; side = -1; } else { hi = s; fhi = fs; if (side === 1) flo /= 2; side = 1; } }
      r = { key, uv: [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s] }; cache.set(key, r); pos.set(key, r.uv); return r; };
    const next = new Map(), seg = (a, b, kind, side) => { if (next.has(a)) throw new Error('trim: ambiguous contour'); next.set(a, { to: b, kind, side }); };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const cs = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], inn = cs.map(([a, b]) => ins(a, b)), ek = [crossing0(0, i, j), crossing0(1, i + 1, j), crossing0(0, i, j + 1), crossing0(1, i, j)], L = [];
      function crossing0(dir, a, b) { return () => crossing(dir, a, b).key; }
      for (let e = 0; e < 4; e++) { const a = inn[e], b = inn[(e + 1) % 4]; if (a !== b) L.push({ k: ek[e], leaving: a && !b }); }
      if (!L.length) continue; let cin = true; if (L.length === 4) { cin = fv((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2) < 0; }
      L.forEach((x, k) => { if (!x.leaving) return; const partner = L.length === 2 ? L[(k + 1) % 2] : (cin ? L[(k + 1) % 4] : L[(k + 3) % 4]); seg(x.k(), partner.k(), 'c', -1); });
    }
    const border = (ai, aj, bi, bj, dir, ci, cj, side) => { const a = ins(ai, aj), b = ins(bi, bj), ka = vkey(ai, aj), kb = vkey(bi, bj); pos.set(ka, vpos(ai, aj)); pos.set(kb, vpos(bi, bj)); if (a && b) seg(ka, kb, 'b', side); else if (a) seg(ka, crossing(dir, ci, cj).key, 'b', side); else if (b) seg(crossing(dir, ci, cj).key, kb, 'b', side); };
    for (let i = 0; i < NU; i++) border(i, 0, i + 1, 0, 0, i, 0, 0);
    for (let j = 0; j < NV; j++) border(NU, j, NU, j + 1, 1, NU, j, 1);
    for (let i = NU - 1; i >= 0; i--) border(i + 1, NV, i, NV, 0, i, NV, 2);
    for (let j = NV - 1; j >= 0; j--) border(0, j + 1, 0, j, 1, 0, j, 3);
    // loops
    const used = new Set(), loopsRaw = [];
    for (const start of next.keys()) { if (used.has(start)) continue; const segs = []; let k = start; for (let g = 0; g < 1e6; g++) { const s = next.get(k); if (!s) throw new Error('trim: open contour'); used.add(k); segs.push({ from: k, to: s.to, kind: s.kind, side: s.side }); k = s.to; if (k === start) break; } if (k !== start) throw new Error('trim: loop does not close'); loopsRaw.push(segs); }
    const grp = (a, b) => a.kind === b.kind && (a.kind === 'c' || a.side === b.side), loops = [];
    for (const segs of loopsRaw) {
      let r0 = 0; if (segs.every((s) => s.kind === segs[0].kind && s.side === segs[0].side)) r0 = 0; else { for (let i = 0; i < segs.length; i++) if (!grp(segs[i], segs[(i + segs.length - 1) % segs.length])) { r0 = i; break; } }
      const rot = segs.slice(r0).concat(segs.slice(0, r0)), pieces = []; let cur = null;
      rot.forEach((s) => { if (cur && grp(cur.segs[0], s)) cur.segs.push(s); else { cur = { segs: [s] }; pieces.push(cur); } });
      loops.push(pieces.map((pc) => ({ kind: pc.segs[0].kind, side: pc.segs[0].side, keys: [pc.segs[0].from].concat(pc.segs.map((s) => s.to)) })));
    }
    // geometry of every piece
    const contours = [], ctags = [], uvOf = (key) => pos.get(key), shoe = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const project = (uv, kp) => { const q = planes[kp]; let [u, v] = uv; for (let it = 0; it < 30; it++) { const e = sEval(S, u, v, true), f = cv(q, e.p), nrm = cg(q, e.p); if (Math.abs(f) < 1e-14 * (1 + fmax)) break; const gu = dot(nrm, e.u), gv = dot(nrm, e.v), g2 = gu * gu + gv * gv; if (g2 < 1e-30) break; u = Math.min(u1, Math.max(u0, u - f * gu / g2)); v = Math.min(v1, Math.max(v0, v - f * gv / g2)); } return [u, v]; };
    const kink = (A, B, ka, kb) => { let u = (A[0] + B[0]) / 2, v = (A[1] + B[1]) / 2; for (let it = 0; it < 40; it++) { const e = sEval(S, u, v, true), fa = cv(planes[ka], e.p), fb = cv(planes[kb], e.p), na = cg(planes[ka], e.p), nb = cg(planes[kb], e.p); if (Math.abs(fa) < 1e-14 * (1 + fmax) && Math.abs(fb) < 1e-14 * (1 + fmax)) break;
        const a1 = dot(na, e.u), a2 = dot(na, e.v), b1 = dot(nb, e.u), b2 = dot(nb, e.v), det = a1 * b2 - a2 * b1; if (Math.abs(det) < 1e-18) return null; u = Math.min(u1, Math.max(u0, u - (fa * b2 - fb * a2) / det)); v = Math.min(v1, Math.max(v0, v - (a1 * fb - b1 * fa) / det)); }
      return [u, v]; };
    const built = loops.map((pcs) => { const pieces = [], poly = [];
      pcs.forEach((pc) => {
        if (pc.kind === 'c') {
          const raw = pc.keys.map(uvOf), runs = []; let cur = { k: actOf(raw[0]), pts: [raw[0]] };
          for (let q = 1; q < raw.length; q++) { const kq = actOf(raw[q]); if (kq === cur.k || planes.length === 1) { cur.pts.push(raw[q]); continue; } const K = kink(raw[q - 1], raw[q], cur.k, kq); if (!K) { cur.pts.push(raw[q]); continue; } cur.pts.push(K); runs.push(cur); cur = { k: kq, pts: [K, raw[q]] }; }
          runs.push(cur);
          runs.forEach((run) => { let pts = run.pts; for (let r = 0; r < (planes[run.k].val ? 5 : 3); r++) { const nw = [pts[0]]; for (let k = 0; k + 1 < pts.length; k++) nw.push(project([(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2], run.k), pts[k + 1]); pts = nw; }
            const P3 = pts.map((q) => sEval(S, q[0], q[1])), keep = [0]; for (let k = 1; k < pts.length; k++) if (len(sub(P3[k], P3[keep[keep.length - 1]])) > 1e-10 * (1 + len(P3[k]))) keep.push(k); if (keep.length < 2) return; { const ds = []; for (let k = 1; k < keep.length; k++) ds.push(len(sub(P3[keep[k]], P3[keep[k - 1]]))); const med = ds.slice().sort((x, y) => x - y)[ds.length >> 1], k2 = [keep[0]]; for (let k = 1; k < keep.length; k++) { const d = len(sub(P3[keep[k]], P3[k2[k2.length - 1]])); if (k === keep.length - 1 || d > 0.35 * med) k2.push(keep[k]); } if (k2.length >= 2) { keep.length = 0; keep.push(...k2); } }
            const q3 = keep.map((k) => P3[k]), quv = keep.map((k) => pts[k]), deg = Math.min(3, q3.length - 1), c3 = interp(q3, deg), uvC = interp(quv.map((q) => [q[0], q[1], 0]), deg);
            pieces.push({ type: 'c', uvC, c3, plane: run.k }); contours.push(c3); ctags.push(run.k); quv.forEach((q) => poly.push(q)); }); }
        else { const A = uvOf(pc.keys[0]), B = uvOf(pc.keys[pc.keys.length - 1]), bc = borderCurves(S)[pc.side], vert = pc.side % 2 === 1, ta = vert ? A[1] : A[0], tb = vert ? B[1] : B[0], lo = Math.min(ta, tb), hi = Math.max(ta, tb); poly.push(A, B);
          let c3 = null; if (hi - lo > 1e-13) { const sc = cSub(bc.c, lo, hi), L = curveLen(sc); if (L > 1e-10) c3 = ta <= tb ? sc : cReverse(sc); }
          pieces.push({ type: 'b', side: pc.side, a: A, b: B, c3 }); }
      });
      return { pieces, poly, area: shoe(poly.length > 2 ? poly : [[0, 0], [0, 0], [0, 0]]) }; });
    // outer loops (counter-clockwise in uv) each get their holes
    const outers = built.filter((l) => l.area > 0), holes = built.filter((l) => l.area <= 0);
    const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const faces = outers.map((o, k) => ({ kind: 'trim', surf: S, sign, tag: tag + '_t' + k, loops: [o].concat(holes.filter((h) => inPoly(h.poly[0], o.poly)).sort((a, b) => 0)).map((l) => ({ pieces: l.pieces })) }));
    return { mode: 'trim', faces, contours, ctags, off, nPlanes: planes.length };
  }
  /** loops of 3D curve pieces from unordered pieces, joined by matching end points */
  function chainLoops(pieces, tol) {
    const rest = pieces.filter((c) => curveLen(c) > tol), out = [], ends = (c) => [cEval(c, dom(c)[0]), cEval(c, dom(c)[1])];
    while (rest.length) { const loop = [rest.shift()], start = ends(loop[0])[0]; let cur = ends(loop[0])[1], guard = 0;
      while (len(sub(cur, start)) > tol && guard++ < 1e5) { let bi = -1, brev = false, bd = Infinity; rest.forEach((c, i) => { const [a, b] = ends(c), da = len(sub(a, cur)), db = len(sub(b, cur)); if (da < bd) { bd = da; bi = i; brev = false; } if (db < bd) { bd = db; bi = i; brev = true; } }); if (bi < 0 || bd > tol) return null; let c = rest.splice(bi, 1)[0]; if (brev) c = cReverse(c); loop.push(c); cur = ends(c)[1]; }
      if (len(sub(cur, start)) > tol) return null; out.push(loop); }
    return out;
  }
  /** planar faces from loops: nesting by containment, outer loops counter-clockwise about n, holes clockwise */
  function facesFromLoops(loops, n, tag) {
    const [e1, e2] = planBasis(n), poly = loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
    const ar = poly.map((P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }), order = loops.map((_, i) => i).sort((a, b) => ar[b] - ar[a]);
    const inPoly = (p, pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const depth = loops.map((_, i) => order.filter((j) => j !== i && ar[j] > ar[i] && inPoly(poly[i][0], poly[j])).length), parent = loops.map((_, i) => { if (depth[i] % 2 === 0) return -1; let best = -1; order.forEach((j) => { if (j !== i && ar[j] > ar[i] && depth[j] === depth[i] - 1 && inPoly(poly[i][0], poly[j])) best = j; }); return best; });
    return loops.map((_, i) => i).filter((i) => depth[i] % 2 === 0).map((i, k) => planFace([loops[i]].concat(loops.map((_, h) => h).filter((h) => parent[h] === i).map((h) => loops[h])), n, tag + k));
  }
  /** a planar face cut by the half-space nrm.x <= d: {mode, faces, lines} */
  function clipPlanFace(f, nrm, d, tag) {
    const g = (c, t) => dot(nrm, cEval(c, t)) - d, kept = [], X = [];
    for (const loop of f.loops) for (const c of loop) {
      const [a, b] = dom(c), N = Math.max(48, c.P.length * 8), roots = []; let pv = g(c, a);
      for (let i = 1; i <= N; i++) { const t = a + (b - a) * i / N, gv = g(c, t); if ((pv < 0) !== (gv < 0)) { let lo = a + (b - a) * (i - 1) / N, hi = t, flo = pv; for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2, fm = g(c, m); if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } const r = (lo + hi) / 2; if (r > a + 1e-12 && r < b - 1e-12) roots.push(r); } pv = gv; }
      let rest = c, base = a; const subs = []; roots.forEach((r) => { const [l, rr] = cSplit(rest, r); subs.push(l); rest = rr; X.push(cEval(c, r)); }); subs.push(rest);
      subs.forEach((s) => { const m = dom(s), mid = g(s, (m[0] + m[1]) / 2); if (mid <= 0) kept.push(s); for (const e of [m[0], m[1]]) if (Math.abs(g(s, e)) < 1e-9 * (1 + len(cEval(s, e)))) X.push(cEval(s, e)); }); void base;
    }
    if (!X.length) { const c0 = f.loops[0][0]; return g(c0, (dom(c0)[0] + dom(c0)[1]) / 2) <= 0 ? { mode: 'all' } : { mode: 'none' }; }
    const t = unit(cross(f.n, nrm)); if (len(cross(f.n, nrm)) < 1e-9) { if (globalThis.__cpdbg) console.log('parallel'); return null; }
    const [e1, e2] = planBasis(f.n), poly = f.loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
    const inside = (q) => { const p = [dot(q, e1), dot(q, e2)]; let cnt = 0; poly.forEach((pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c) cnt++; }); return cnt % 2 === 1; };
    const srt = X.map((q) => ({ q, s: dot(t, q) })).sort((a, b) => a.s - b.s), lines = [];
    for (let i = 0; i + 1 < srt.length; i++) { if (srt[i + 1].s - srt[i].s < 1e-9) continue; const m = add(srt[i].q, mul(t, (srt[i + 1].s - srt[i].s) / 2)); if (inside(m)) lines.push(line(srt[i].q, srt[i + 1].q)); }
    const sc = Math.max(1, ...X.map(len)), loops = chainLoops(kept.concat(lines), 1e-7 * sc); if (!loops) { if (globalThis.__cpdbg) console.log('chain fail', kept.length, lines.length, X.length); return null; }
    return { mode: 'clip', faces: facesFromLoops(loops, f.n, tag), lines };
  }
  const faceCurves = (sol) => { const out = []; sol.faces.forEach((f) => { if (f.kind === 'plan') f.loops.forEach((l) => l.forEach((c) => out.push(c))); else if (f.surf) f.surf.P.forEach((r) => r.forEach((q) => out.push({ P: [q] }))); }); return out; };
  /** a surface that closes on itself (a full revolve, a closed section) is cut into two halves along its seam, so that every trimmed loop is an ordinary loop on a patch that does not wrap (what other kernels' STEP readers need) */
  function splitClosedFace(f) {
    const S = f.surf, nU = S.P.length - 1, nV = S.P[0].length - 1, same = (c1, c2) => { const a = cSample(c1, 8), b = cSample(c2, 8); return a.every((q, i) => len(sub(q, b[i])) < 1e-9 * (1 + len(q))) && curveLen(c1) > 1e-9; };
    const mkU = (C) => ({ p: S.p, q: S.q, U: C[0].U, V: S.V.slice(), P: C[0].P.map((_, i) => C.map((c) => c.P[i])), w: C[0].w.map((_, i) => C.map((c) => c.w[i])) }), mkV = (C) => ({ p: S.p, q: S.q, U: S.U.slice(), V: C[0].U, P: C.map((c) => c.P), w: C.map((c) => c.w) });
    if (same(sCol(S, 0), sCol(S, nU))) { const t = (S.U[S.p] + S.U[S.P.length]) / 2, L = [], R = []; for (let j = 0; j <= nV; j++) { const [l, r] = cSplit(sRow(S, j), t); L.push(l); R.push(r); } return [Object.assign({}, f, { surf: mkU(L), tag: f.tag + 'a' }), Object.assign({}, f, { surf: mkU(R), tag: f.tag + 'b' })]; }
    if (same(sRow(S, 0), sRow(S, nV))) { const t = (S.V[S.q] + S.V[S.P[0].length]) / 2, L = [], R = []; for (let i = 0; i <= nU; i++) { const [l, r] = cSplit(sCol(S, i), t); L.push(l); R.push(r); } return [Object.assign({}, f, { surf: mkV(L), tag: f.tag + 'a' }), Object.assign({}, f, { surf: mkV(R), tag: f.tag + 'b' })]; }
    return [f];
  }
  /** an operation on the planar faces: keep the outside of a convex flat tool (the union of the outsides of its planes).  The edge pieces are the face boundary left outside the tool plus the tool's own boundary inside the face. */
  function clipFlatNotTool(f, planes, tag) {
    const g = (pl, q) => dot(pl.n, q) - pl.d, Fm = (q) => Math.min(...planes.map((pl) => g(pl, q))), kept = [], X = [];
    for (const loop of f.loops) for (const c of loop) {
      const [a, b] = dom(c), Ns = Math.max(64, c.P.length * 8), roots = []; let pv = Fm(cEval(c, a));
      for (let i = 1; i <= Ns; i++) { const t = a + (b - a) * i / Ns, gv = Fm(cEval(c, t)); if ((pv <= 0) !== (gv <= 0)) { let lo = a + (b - a) * (i - 1) / Ns, hi = t, flo = pv; for (let it = 0; it < 90; it++) { const m = (lo + hi) / 2, fm = Fm(cEval(c, m)); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } const r = (lo + hi) / 2; if (r > a + 1e-12 && r < b - 1e-12) roots.push(r); } pv = gv; }
      let rest = c; const subs = []; roots.forEach((r) => { const [l, rr] = cSplit(rest, r); subs.push(l); rest = rr; X.push(cEval(c, r)); }); subs.push(rest);
      subs.forEach((sc) => { const m = dom(sc); if (Fm(cEval(sc, (m[0] + m[1]) / 2)) <= 0) kept.push(sc); for (const e of [m[0], m[1]]) { const q = cEval(sc, e); if (Math.abs(Fm(q)) < 1e-9 * (1 + len(q))) X.push(q); } });
    }
    const inFace = (() => { const [e1, e2] = planBasis(f.n), poly = f.loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; }); return (q) => { const p = [dot(q, e1), dot(q, e2)]; let cnt = 0; poly.forEach((pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c) cnt++; }); return cnt % 2 === 1; }; })();
    // the tool boundary inside the face: along each tool plane's line in the face plane
    const lines = [];
    planes.forEach((pi, ii) => { const dir = cross(f.n, pi.n); if (len(dir) < 1e-9) return; const t = unit(dir), P0 = (() => { /* a point on both planes */ const n1 = f.n, d1 = dot(f.n, f.o), n2 = pi.n, d2 = pi.d, c = cross(n1, n2), cc = dot(c, c); return add(mul(cross(n2, c), d1 / cc), mul(cross(c, n1), d2 / cc)); })();
      const bp = [];   // break points along the line: the face outline crossings and the other planes
      X.forEach((q) => { if (Math.abs(g(pi, q)) < 1e-7) bp.push(dot(t, sub(q, P0))); });
      planes.forEach((pj, jj) => { if (jj === ii) return; const dj = dot(pj.n, t); if (Math.abs(dj) < 1e-12) return; bp.push(-(dot(pj.n, P0) - pj.d) / dj); });
      // every crossing of the face outline with this line, found directly (the outline may cross the line away from the tool)
      for (const loop of f.loops) for (const c of loop) { const [a, b] = dom(c), Ns = Math.max(64, c.P.length * 8), h = (q) => dot(pi.n, q) - pi.d; let pv = h(cEval(c, a)); for (let i = 1; i <= Ns; i++) { const tt = a + (b - a) * i / Ns, gv = h(cEval(c, tt)); if ((pv <= 0) !== (gv <= 0)) { let lo = a + (b - a) * (i - 1) / Ns, hi = tt, flo = pv; for (let it = 0; it < 90; it++) { const m = (lo + hi) / 2, fm = h(cEval(c, m)); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } bp.push(dot(t, sub(cEval(c, (lo + hi) / 2), P0))); } pv = gv; } }
      const ss = bp.sort((x, y) => x - y).filter((x, k, A) => k === 0 || x - A[k - 1] > 1e-9);
      for (let k = 0; k + 1 < ss.length; k++) { const mid = add(P0, mul(t, (ss[k] + ss[k + 1]) / 2)); if (!inFace(mid)) continue; if (planes.some((pj, jj) => jj !== ii && g(pj, mid) < 0)) continue; lines.push(line(add(P0, mul(t, ss[k])), add(P0, mul(t, ss[k + 1])))); } });
    if (!X.length && !lines.length) { const c0 = f.loops[0][0], q = cEval(c0, (dom(c0)[0] + dom(c0)[1]) / 2); return Fm(q) <= 0 ? { mode: 'all' } : { mode: 'none' }; }
    const sc = Math.max(1, ...X.map(len)), loops = chainLoops(kept.concat(lines), 1e-7 * sc); if (!loops) return null;
    return { mode: 'clip', faces: facesFromLoops(loops, f.n, tag), lines };
  }
  /** direct modelling on planar faces that came from cuts or from the ends of a prism: move a face along its normal (dist > 0 = outwards), or delete it (the cut it belongs to is undone).  Exact, recomputed from the source; null when the face is not of that kind or the result is not valid. */
  /** index of the flat face of a freeform solid that contains the point P (or is nearest to it) and has the normal n; -1 when there is none */
  function faceAt(sol, P, n) {
    let scale = 1; faceCurves(sol).forEach((c) => c.P.forEach((q) => { scale = Math.max(scale, len(q)); })); n = unit(n); let best = -1, bd = Infinity;
    sol.faces.forEach((f, i) => { if (f.kind !== 'plan' && f.kind !== 'cap') return; const fn = f.n; if (!fn || dot(fn, n) < 1 - 1e-6) return; const o = f.kind === 'plan' ? f.o : f.surf.P[0][0]; if (Math.abs(dot(fn, sub(P, o))) > 1e-6 * scale) return; let d = Infinity;
      if (f.kind === 'plan') { const [e1, e2] = planBasis(fn); if (inLoops2(P, f, e1, e2, f.o)) d = 0; else f.loops.forEach((l) => l.forEach((c) => cSample(c, 64).forEach((q) => { d = Math.min(d, len(sub(q, P))); }))); }
      else { const [u0, u1, v0, v1] = sDom(f.surf); for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) d = Math.min(d, len(sub(sEval(f.surf, u0 + (u1 - u0) * a / 8, v0 + (v1 - v0) * b / 8), P))); }
      if (d < bd) { bd = d; best = i; } });
    return bd < 1e-3 * scale ? best : -1;
  }
  /** a copy of a tool body with its wall offset (offset > 0 shrinks the tool: the solid grows) and/or its floor end moved (floorSign: which end is the floor) */
  function retool(b, o) {
    const sp = quadSpec(b); if (!sp) return null; const Q = sp.Q, w = sp.w0, M = [Q.x[0], Q.y[0], Q.z[0], Q.x[1], Q.y[1], Q.z[1], Q.x[2], Q.y[2], Q.z[2]], off = o.offset || 0, r = (Q.r || 0) - off;
    if (sp.kind === 'sphere') { if (!(r > 0)) return null; return K.translate(K.sphere(r), Q.o); }
    if (sp.kind === 'torus') { if (!(r > 0) || r >= Q.R) return null; return K.transform(K.torus(Q.R, r), M, Q.o); }
    if (sp.kind === 'cylinder') { if (!(r > 0)) return null; let t0 = sp.caps[0].t, t1 = sp.caps[1].t; if (o.floorSign === 0) t0 += o.floor || 0; else if (o.floorSign === 1) t1 -= o.floor || 0; if (!(t1 > t0)) return null; return K.translate(K.transform(K.cylinder(r, t1 - t0), M, [0, 0, 0]), add(Q.o, mul(w, t0))); }
    return null;
  }
  /** direct modelling on the results of curved cuts: undo a tool (delete its wall or floor), offset its wall, move its floor, move an end of the solid the tools were cut from */
  function qsrcEdit(sol, f, kind, dist) {
    const q = sol.qsrc, tag = f.tag || '', again = (root, bodies) => { const r = bodies.length ? cutQuadricTools(root, bodies) : root; if (r && bodies.length) r.qsrc = { root, bodies }; return r; };
    let m = /^quad_(wall|floor)(\d+)/.exec(tag);
    if (m) { const idx = +m[2]; if (kind === 'delete') return again(q.root, q.bodies.filter((_, i) => i !== idx));
      const sp = quadSpec(q.bodies[idx]); if (!sp) return null; const nb = retool(q.bodies[idx], m[1] === 'floor' ? { floor: dist, floorSign: dot(f.n, sp.w0) > 0 ? 0 : 1 } : { offset: dist }); if (!nb) return null; const bodies = q.bodies.slice(); bodies[idx] = nb; return again(q.root, bodies); }
    if (kind === 'move' && (m = /^(cap[01])(?:_|q|$)/.exec(tag))) { const ri = q.root.faces.findIndex((g) => g.tag && g.tag.indexOf(m[1] + '_') === 0 && (g.kind === 'plan' || g.kind === 'cap')); if (ri < 0) return null; const nr = moveFace(q.root, ri, dist); if (!nr) return null; return again(nr, q.bodies); }
    return null;
  }
  function moveFace(sol, idx, dist) {
    try {
      const f = sol.faces[idx]; if (!f) return null; if (sol.qsrc) return qsrcEdit(sol, f, 'move', dist);
      if (sol.src) { const m = /^cut(\d+)_(\d+)_/.exec(f.tag || ''); if (!m) return null; const ops = sol.src.ops.map((o) => ({ kind: o.kind, planes: o.planes.map((q) => Object.assign({}, q)) })), q = ops[+m[1]].planes[+m[2]]; if (!q) return null;
        const p2 = add(q.p, mul(q.n, dist)); ops[+m[1]].planes[+m[2]] = { n: q.n, d: dot(q.n, p2), p: p2 }; const r = opsCut(sol.src.root, ops); if (r) r.src = { root: sol.src.root, ops }; return r; }
      if (sol.profile && sol.vec && /^cap[01]_/.test(f.tag || '') && (f.kind === 'plan' || f.kind === 'cap')) { const lo = /^cap0/.test(f.tag), base = profPlane(sol.profile.outer), cur = lo ? (sol.lo || base) : (sol.hi || { p: add(base.p, sol.vec), n: base.n }), out = unit(lo ? (dot(cur.n, sol.vec) > 0 ? mul(cur.n, -1) : cur.n) : (dot(cur.n, sol.vec) > 0 ? cur.n : mul(cur.n, -1))), pl = { p: add(cur.p, mul(out, dist)), n: cur.n };
        const r = prismSolid(sol.profile, sol.vec, lo ? pl : sol.lo, lo ? sol.hi : pl, sol.pockets || []); return check(r, false).ok ? r : null; }
      return null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  function deleteFace(sol, idx) {
    try {
      const f = sol.faces[idx]; if (f && sol.qsrc) return qsrcEdit(sol, f, 'delete', 0); if (!f || !sol.src) return null; const m = /^cut(\d+)_(\d+)_/.exec(f.tag || ''); if (!m) return null;
      const ops = sol.src.ops.filter((_, i) => i !== +m[1]); if (!ops.length) return sol.src.root; const r = opsCut(sol.src.root, ops); if (r) r.src = { root: sol.src.root, ops }; return r;
    } catch (e) { return null; }
  }
  /** planes of one operation in keep form (keep n.x <= d) */
  const planeOf = (p, n) => { const nrm = unit(n); return { n: nrm, d: dot(nrm, p), p: p.slice() }; };
  function planeCut(sol, p, n) { return opCut(sol, { kind: 'keep', planes: [planeOf(p, n)] }); }
  /** cut by a convex flat tool given by planes whose normals point into the tool: the result is the solid minus the tool (planes with p, n) */
  function toolCut(sol, planes) { return opCut(sol, { kind: 'tool', planes: planes.map((q) => planeOf(q.p, q.n)) }); }
  function opCut(sol, op) {
    try {
      if (!isN(sol)) return null; let root = sol, ops = [op];
      if (sol.src) { root = sol.src.root; ops = sol.src.ops.concat([op]); } else if (sol.faces.some((f) => f.kind === 'trim')) return null;
      const res = opsCut(root, ops); if (res) res.src = { root, ops }; return res;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  function opsCut(root, ops) {
    let scale = 1; root.faces.forEach((f) => { if (f.surf) f.surf.P.forEach((r) => r.forEach((q) => { scale = Math.max(scale, len(q)); })); else if (f.loops) f.loops.forEach((l) => l.forEach((c) => c.P.forEach((q) => { scale = Math.max(scale, len(q)); }))); });
    const topo = ops.map((o) => ({ kind: o.kind === 'tool' ? 'notTool' : 'keep', planes: o.planes })), neg = (pl) => ({ n: mul(pl.n, -1), d: -pl.d, p: pl.p });
    const clipHalf = (faces, pl, tag) => { const out = []; for (const f of faces) { const r = clipPlanFace(f, pl.n, pl.d, f.tag + tag); if (!r) throw new Error('plan clip ' + f.tag + ' n=' + pl.n.map((x) => x.toFixed(2)) + ' d=' + pl.d.toFixed(3)); if (r.mode === 'all') out.push(f); else if (r.mode === 'clip') out.push(...r.faces); } return out; };
    const clipOp = (faces, o) => { if (o.kind === 'keep') return clipHalf(faces, o.planes[0], 'c'); const out = []; for (const f of faces) { const r = clipFlatNotTool(f, o.planes, f.tag + 't'); if (!r) throw new Error('tool clip'); if (r.mode === 'all') out.push(f); else if (r.mode === 'clip') out.push(...r.faces); } return out; };
    const flats = [], sides = [], groups = {}; root.faces.forEach((f) => { if (f.kind === 'cap') { const k = f.tag.split('_')[0]; (groups[k] = groups[k] || []).push(f); } else if (f.kind === 'plan') flats.push(f); else sides.push(...splitClosedFace(f)); });
    Object.keys(groups).forEach((k) => { const fs = groups[k].sort((a, b) => Number(a.tag.split('_')[1]) - Number(b.tag.split('_')[1])); flats.push(planFace([fs.map((f) => sRow(f.surf, 1))], fs[0].n, k)); });
    const faces = [];
    sides.forEach((f) => { const r = trimSurfaceByPlanes(f.surf, f.sign, topo, f.tag); if (r.mode === 'all') faces.push(f); else if (r.mode === 'trim') faces.push(...r.faces); });
    flats.forEach((f) => { let cur = [f]; topo.forEach((o) => { cur = clipOp(cur, o); }); faces.push(...cur); });
    topo.forEach((o, oi) => o.planes.forEach((pl, pi) => {      // the cap on that plane: the section of the whole solid, limited by everything else
      const contours = [], lines = [];
      sides.forEach((f) => { const r = trimSurfaceByPlane(f.surf, f.sign, pl.n, pl.d, f.tag); if (r.mode === 'trim') contours.push(...r.contours); });
      flats.forEach((f) => { const r = clipPlanFace(f, pl.n, pl.d, f.tag + 'k'); if (!r) throw new Error('section'); if (r.mode === 'clip') lines.push(...r.lines); });
      if (!contours.length && !lines.length) return; const loops = chainLoops(contours.concat(lines), 1e-7 * scale); if (!loops) throw new Error('section does not close');
      facesFromLoops(loops, pl.n, 'cut' + oi + '_' + pi + '_').forEach((cf) => {
        let cur = [cf]; if (o.kind === 'notTool') o.planes.forEach((q, qi) => { if (qi !== pi) cur = clipHalf(cur, neg(q), 'i'); });   // on the tool boundary: inside the other tool planes
        topo.forEach((o2, oj) => { if (oj !== oi) cur = clipOp(cur, o2); }); faces.push(...cur); }); }));
    if (!faces.length) return null; const res = { kind: 'skin', op: 'cut', faces, topo: { type: 'brep' } }, c = check(res, false); if (!c.ok || !(c.volume > 0)) return null; return res;
  }
  const isN = (h) => !!(h && h.faces && h.topo && h.kind && h.faces.length && h.faces.some((f) => f.surf || f.loops));
  function indexedMesh(sol, n) {
    const pos = [], ind = [], fid = [], map = new Map(), tol = 1e-9; let k = 0;
    const faceTris = (f, ix) => mesh({ faces: [f] }, n).map((t) => ({ t, ix }));
    const vid = (p) => { const key = Math.round(p[0] / 1e-7) + ',' + Math.round(p[1] / 1e-7) + ',' + Math.round(p[2] / 1e-7); let i = map.get(key); if (i === undefined) { i = pos.length / 3; pos.push(p[0], p[1], p[2]); map.set(key, i); } return i; };
    const sides = sol.faces.filter((f) => f.kind !== 'cap'); sides.forEach((f, ix) => faceTris(f, sol.faces.indexOf(f)).forEach(({ t, ix: i }) => { const a = vid(t[0]), b = vid(t[1]), c = vid(t[2]); if (a === b || b === c || a === c) return; ind.push(a, b, c); fid.push(i); }));
    const capFaces = sol.faces.filter((f) => f.kind === 'cap'); if (capFaces.length) { const all = mesh({ faces: capFaces }, n), owner = {}; capFaces.forEach((f) => { owner[f.tag.split('_')[0]] = sol.faces.indexOf(f); }); const groups = {}; capFaces.forEach((f) => { const g = f.tag.split('_')[0]; (groups[g] = groups[g] || []).push(f); }); void groups; all.forEach((t) => { const a = vid(t[0]), b = vid(t[1]), c = vid(t[2]); if (a === b || b === c || a === c) return; const cen = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3]; let best = capFaces[0], bd = Infinity; capFaces.forEach((f) => { const q = f.surf.P[0][0], d = Math.abs(dot(sub(cen, q), f.n)); if (d < bd) { bd = d; best = f; } }); ind.push(a, b, c); fid.push(sol.faces.indexOf(best)); }); }
    void k; void tol; return { positions: pos, indices: ind, faces: fid };
  }
  const infoOf = (sol) => { const faces = {}, edges = {}; sol.faces.forEach((f) => { const kd = f.kind === 'cap' || f.kind === 'plan' ? 'plane' : 'bspline'; faces[kd] = (faces[kd] || 0) + 1; }); return { faces, edges, freeform: true, faceCount: sol.faces.length }; };
  // the kernel facade (volume, area, mesh, STEP ...) accepts freeform solids too, so recipes and the app can treat them like any other exact body
  const wrap = (name, fn) => { const o = K[name]; if (typeof o === 'function' && !o.__nurbsWrapped) { const w = function (h, ...a) { return isN(h) ? fn(h, ...a) : o.call(this, h, ...a); }; w.__nurbsWrapped = true; K[name] = w; } };
  wrap('volume', (h) => massProps(h).volume); wrap('area', (h) => massProps(h).area); wrap('massProps', (h) => massProps(h)); wrap('validate', (h) => { const c = check(h); return { ok: c.ok, issues: c.issues, counts: { faces: h.faces.length } }; });
  wrap('info', (h) => infoOf(h)); wrap('mesh', (h, tol) => indexedMesh(h, tol && tol < 0.01 ? 48 : 16)); wrap('stepExport', (h, o) => stepWrite(h, o));
  wrap('bbox', (h) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; mesh(h, 6).forEach((t) => t.forEach((p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } })); return { min: mn, max: mx }; });
  wrap('translate', (h, d) => xfSolid(h, [1, 0, 0, 0, 1, 0, 0, 0, 1], d)); wrap('transform', (h, M, t) => xfSolid(h, M, t || [0, 0, 0]));
  // ======================================================================================================
  // 1.10: exact booleans, offsets, shells and rounds of extruded freeform solids (prisms with flat, perpendicular ends and a single outer profile loop).
  // Booleans work on the profiles (curve-curve intersection by Newton to 1e-12, pieces chained into loops) and on the height ranges, so the result is again an exact prism.
  // Offsets and rounds sample the profile and its normals, interpolate each row of the result with one shared parameter, and assemble the side as ONE rational quadratic
  // patch per profile segment (straight pieces and exact quarter-circle pieces, joined with double knots).  The reported error is measured against the true offset distance.
  // ======================================================================================================
  const isPrism = (a) => isN(a) && a.kind === 'skin' && a.op === 'extrude' && a.profile && a.vec && !a.lo && !a.hi && !(a.pockets && a.pockets.length) && !(a.profile.holes && a.profile.holes.length);
  function prismFrame(a, ref) {
    const base = profPlane(a.profile.outer), v = unit(a.vec), d = ref ? ref.d : v; if (Math.abs(dot(v, d)) < 1 - 1e-9 || Math.abs(dot(base.n, d)) < 1 - 1e-9) return null;
    const s0 = dot(base.p, d), s1 = s0 + dot(a.vec, d), e = planBasis(d); return { d, e1: e[0], e2: e[1], lo: Math.min(s0, s1), hi: Math.max(s0, s1), H: Math.abs(s1 - s0), to2: (P) => [dot(P, e[0]), dot(P, e[1])] };
  }
  const onPlane = (c, d, z) => cMap(c, (P) => add(P, mul(d, z - dot(P, d))));
  function polyOf(loop, F, n) { const o = []; loop.forEach((c) => cSample(c, n || 400).slice(0, -1).forEach((q) => o.push(F.to2(q)))); return o; }
  const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
  const distPoly = (p, poly) => { let m = Infinity; for (let i = 0; i < poly.length; i++) { const A = poly[i], B = poly[(i + 1) % poly.length], ab = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); m = Math.min(m, Math.hypot(p[0] - A[0] - t * ab[0], p[1] - A[1] - t * ab[1])); } return m; };
  /** all transversal crossings of two profile segments, refined to 1e-12 */
  function curveHits(ca, cb, F) {
    const M = 200, A = cSample(ca, M).map(F.to2), B = cSample(cb, M).map(F.to2), [a0, a1] = dom(ca), [b0, b1] = dom(cb), out = [];
    const refine = (s, t) => { for (let k = 0; k < 50; k++) { const ea = cEval(ca, s, true), eb = cEval(cb, t, true), dd = sub(ea.p, eb.p), f0 = dot(dd, F.e1), f1 = dot(dd, F.e2), ja0 = dot(ea.d, F.e1), ja1 = dot(ea.d, F.e2), jb0 = dot(eb.d, F.e1), jb1 = dot(eb.d, F.e2), det = -ja0 * jb1 + jb0 * ja1; if (Math.abs(det) < 1e-18) return null;
      const ds = (f0 * jb1 - jb0 * f1) / det, dt = (-ja0 * f1 + f0 * ja1) / det; s = Math.max(a0, Math.min(a1, s + ds)); t = Math.max(b0, Math.min(b1, t + dt)); if (Math.hypot(ds, dt) < 1e-14) break; }
      const ea = cEval(ca, s), eb = cEval(cb, t); return len(sub(ea, eb)) < 1e-9 * (1 + len(ea)) ? { s, t, p: ea } : null; };
    for (let i = 0; i < M; i++) { const p = A[i], q = A[i + 1], r = [q[0] - p[0], q[1] - p[1]], xl = Math.min(p[0], q[0]), xh = Math.max(p[0], q[0]), yl = Math.min(p[1], q[1]), yh = Math.max(p[1], q[1]);
      for (let j = 0; j < M; j++) { const u = B[j], w = B[j + 1]; if (Math.max(u[0], w[0]) < xl || Math.min(u[0], w[0]) > xh || Math.max(u[1], w[1]) < yl || Math.min(u[1], w[1]) > yh) continue;
        const s2 = [w[0] - u[0], w[1] - u[1]], den = r[0] * s2[1] - r[1] * s2[0]; if (Math.abs(den) < 1e-18) continue; const t = ((u[0] - p[0]) * s2[1] - (u[1] - p[1]) * s2[0]) / den, v = ((u[0] - p[0]) * r[1] - (u[1] - p[1]) * r[0]) / den;
        if (t < -1e-9 || t > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue; const h = refine(a0 + (a1 - a0) * (i + t) / M, b0 + (b1 - b0) * (j + v) / M); if (h && !out.some((o) => len(sub(o.p, h.p)) < 1e-8 * (1 + len(h.p)))) out.push(h); } }
    return out;
  }
  /** boolean of two profile loops (outer loops, counter-clockwise about F.d).  Returns {loops} (loops[0] may be several), {empty:true}, or null when it is not a single clean region */
  function regionOp(op, LA, LB, F) {
    const hitsA = LA.map(() => []), hitsB = LB.map(() => []); let nh = 0;
    LA.forEach((ca, i) => LB.forEach((cb, j) => curveHits(ca, cb, F).forEach((h) => { hitsA[i].push(h.s); hitsB[j].push(h.t); nh++; })));
    const PA = polyOf(LA, F), PB = polyOf(LB, F), size = Math.max(...PA.map((p) => Math.hypot(p[0] - PA[0][0], p[1] - PA[0][1])), 1e-9);
    if (!nh) { const aIn = inPoly(PA[0], PB), bIn = inPoly(PB[0], PA); if (aIn && bIn) return null;
      if (op === 'common') return aIn ? { loops: [LA] } : bIn ? { loops: [LB] } : { empty: true };
      if (op === 'fuse') return aIn ? { loops: [LB] } : bIn ? { loops: [LA] } : null;
      return aIn ? { empty: true } : bIn ? { loops: [LA, reverseLoop(LB)] } : { loops: [LA] }; }
    if (hitsA.reduce((s, h) => s + h.length, 0) % 2) return null;
    const mkPieces = (loop, hits, other, keepIn, rev) => { const out = [];
      loop.forEach((c, k) => { const [a, b] = dom(c), ts = [a].concat(hits[k].filter((t) => t > a + 1e-9 && t < b - 1e-9).sort((x, y) => x - y), [b]);
        for (let i = 0; i + 1 < ts.length; i++) { if (ts[i + 1] - ts[i] < 1e-10) continue; const pc = cSub(c, ts[i], ts[i + 1]), m = F.to2(cEval(pc, (dom(pc)[0] + dom(pc)[1]) / 2)); if (distPoly(m, other) < 1e-7 * (1 + size)) { out.amb = true; continue; }
          if (inPoly(m, other) === keepIn) out.push(rev ? { c: cReverse(pc), p0: cEval(pc, dom(pc)[1]), p1: cEval(pc, dom(pc)[0]) } : { c: pc, p0: cEval(pc, dom(pc)[0]), p1: cEval(pc, dom(pc)[1]) }); } });
      return out; };
    const wantA = op === 'common' ? true : false, wantB = op === 'fuse' ? false : true;     // keep the part of A inside B (common) or outside B (fuse, cut); the part of B inside A (common, cut) or outside A (fuse)
    const pa = mkPieces(LA, hitsA.length ? hitsA : [[]], PB, wantA, false), pb = mkPieces(LB, hitsB, PA, op === 'fuse' ? false : true, op === 'cut');
    if (pa.amb || pb.amb) return null; const all = pa.concat(pb), used = all.map(() => false), tol = 1e-6 * (1 + size), loops = [];
    for (let s = 0; s < all.length; s++) { if (used[s]) continue; used[s] = true; const lp = [all[s].c]; let cur = all[s].p1; const start = all[s].p0, guard = all.length + 2;
      for (let g = 0; g < guard && len(sub(cur, start)) > tol; g++) { const nx = all.findIndex((q, i) => !used[i] && len(sub(q.p0, cur)) < tol); if (nx < 0) return null; used[nx] = true; lp.push(all[nx].c); cur = all[nx].p1; }
      if (len(sub(cur, start)) > tol) return null; loops.push(lp); }
    void wantB; return loops.length ? { loops } : { empty: true };
  }
  /** build the prism of region loops (outer counter-clockwise, holes clockwise about d) between heights z0 and z1 */
  function prismOfLoops(loops, d, z0, z1) {
    const F = { d }; void F; const ar = loops.map((l) => dot(closedArea(l, 64), d)), outs = ar.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0), holes = ar.map((x, i) => (x < 0 ? i : -1)).filter((i) => i >= 0);
    if (outs.length !== 1) return null; const mv = (l) => l.map((c) => onPlane(c, d, z0)), up = (secs) => secs.map((l) => l.map((c) => cMap(c, (P) => add(P, mul(d, z1 - z0))))), o0 = mv(loops[outs[0]]), hs0 = holes.map((i) => mv(loops[i]));
    const r = skinSolidH([o0, up([o0])[0]], hs0.map((h) => [h, up([h])[0]]), {}, 'extrude', 1); r.profile = { outer: o0, holes: hs0 }; r.vec = mul(d, z1 - z0); return check(r, false).ok ? r : null;
  }
  /** EXACT union / difference / intersection of two extruded freeform solids with parallel axes.  op: 'fuse' | 'cut' | 'common'.  null when the result is not a single prism (the caller falls back) */
  function boolPrisms(op, a, b) {
    try {
      if (!isPrism(a) || !isPrism(b)) return null; const FA = prismFrame(a), FB = FA && prismFrame(b, FA); if (!FB) return null;
      const eps = 1e-9 * (1 + FA.H + FB.H), orient = (l) => orientLoop(l, FA.d, true), LA = orient(a.profile.outer), LB = orient(b.profile.outer);
      const wrapR = (r, z0, z1) => (r === null ? null : r.empty ? null : prismOfLoops(r.loops, FA.d, z0, z1));
      if (op === 'common') { const lo = Math.max(FA.lo, FB.lo), hi = Math.min(FA.hi, FB.hi); if (hi - lo < 1e-7 * (1 + FA.H)) return null; return wrapR(regionOp('common', LA, LB, FA), lo, hi); }
      if (op === 'fuse') { if (Math.abs(FA.lo - FB.lo) > eps || Math.abs(FA.hi - FB.hi) > eps) return null; return wrapR(regionOp('fuse', LA, LB, FA), FA.lo, FA.hi); }
      if (op === 'cut') {
        if (FB.lo <= FA.lo + eps && FB.hi >= FA.hi - eps) return wrapR(regionOp('cut', LA, LB, FA), FA.lo, FA.hi);
        // a blind pocket: B's loop strictly inside A's profile, B reaching one end of A, its other end strictly between the two ends of A
        const PA = polyOf(LA, FA), PB = polyOf(LB, FA); let size = 0; PA.forEach((p) => { size = Math.max(size, Math.hypot(p[0] - PA[0][0], p[1] - PA[0][1])); }); const clear = 2e-3 * size;
        for (const p of PB) if (!inPoly(p, PA) || distPoly(p, PA) < clear) return null; for (const p of PA) if (distPoly(p, PB) < clear) return null;
        const tol = 1e-6 * (1 + FA.H), fromTop = FB.hi >= FA.hi - eps && FB.lo > FA.lo + tol && FB.lo < FA.hi - tol, fromBot = FB.lo <= FA.lo + eps && FB.hi < FA.hi - tol && FB.hi > FA.lo + tol; if (!fromTop && !fromBot) return null;
        const loop = LB.map((c) => onPlane(c, FA.d, fromTop ? FA.hi : FA.lo)), ft = fromTop ? FB.lo : FB.hi, plane = { p: mul(FA.d, ft), n: FA.d };
        const va = massProps(a, 1).volume, r = prismSolid({ outer: a.profile.outer, holes: [] }, a.vec, null, null, [{ loop: reverseLoop(loop), end: fromTop ? 'hi' : 'lo', plane }]); if (check(r, false).ok && massProps(r, 1).volume < va) return r;
        const r2 = prismSolid({ outer: a.profile.outer, holes: [] }, a.vec, null, null, [{ loop, end: fromTop ? 'hi' : 'lo', plane }]); return check(r2, false).ok && massProps(r2, 1).volume < va ? r2 : null;
      }
      return null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  // ---- offset curves of profile loops and the one-patch-per-segment side surfaces
  const turnAbout = (ta, tb, d) => Math.atan2(dot(cross(ta, tb), d), dot(ta, tb));
  /** cut the offset curves of two neighbouring segments where they meet (an overlapping corner): returns the new end parameter of segment A and start parameter of segment B */
  function trimCorner(cA, cB, d, delta) {
    const [a0, a1] = dom(cA), [b0, b1] = dom(cB), off = (c, t) => { const e = cEval(c, t, true); return add(e.p, mul(unit(cross(unit(e.d), d)), delta)); };
    let s = a1, t = b0; const h = 1e-7 * Math.min(a1 - a0, b1 - b0);
    for (let k = 0; k < 60; k++) { const f = sub(off(cA, s), off(cB, t)), ja = mul(sub(off(cA, s + h * 0.5), off(cA, s - h * 0.5)), 1 / h), jb = mul(sub(off(cB, t + h * 0.5), off(cB, t - h * 0.5)), 1 / h);
      const [e1, e2] = planBasis(d), A = [[dot(ja, e1), -dot(jb, e1)], [dot(ja, e2), -dot(jb, e2)]], r = [-dot(f, e1), -dot(f, e2)], det = A[0][0] * A[1][1] - A[0][1] * A[1][0]; if (Math.abs(det) < 1e-18) return null;
      const ds = (r[0] * A[1][1] - A[0][1] * r[1]) / det, dt = (A[0][0] * r[1] - r[0] * A[1][0]) / det; s += ds; t += dt; if (Math.hypot(ds, dt) < 1e-14) break; }
    if (!(s > a0 && s <= a1 + 1e-12 && t >= b0 - 1e-12 && t < b1)) return null; return { s: Math.min(s, a1), t: Math.max(t, b0) };
  }
  /** sample a profile loop (counter-clockwise about d).  Items: {seg} = samples of a profile segment (points P, outward normals N, right of the tangent) and {join} = a circular join at a corner (fixed point, normal sweeping through the corner angle).  mode 'rows': joins at every corner, no trimming; mode 'offset': joins where the offset opens a gap, segment ends trimmed where it overlaps. */
  function sampleLoop(loop, d, N, mode, delta) {
    const n = loop.length, ends = loop.map((c) => { const [a, b] = dom(c), ea = cEval(c, a, true), eb = cEval(c, b, true); return { a, b, p0: ea.p, p1: eb.p, t0: unit(ea.d), t1: unit(eb.d) }; });
    const lo = ends.map((e) => e.a), hi = ends.map((e) => e.b), joins = new Array(n).fill(null);
    for (let k = 0; k < n; k++) { const A = ends[k], kb = (k + 1) % n, B = ends[kb], th = turnAbout(A.t1, B.t0, d); if (Math.abs(th) < 1e-9) continue; const gap = mode === 'rows' || delta * th > 0;
      if (gap) joins[k] = { th, C: mul(add(A.p1, B.p0), 0.5), nA: unit(cross(A.t1, d)), nB: unit(cross(B.t0, d)), d };
      else { const tr = trimCorner(loop[k], loop[kb], d, delta); if (!tr) return null; hi[k] = tr.s; lo[kb] = tr.t; } }
    const items = [];
    for (let k = 0; k < n; k++) { const c = loop[k], P = [], Nn = [], ts = []; for (let i = 0; i <= N; i++) { const t = lo[k] + (hi[k] - lo[k]) * i / N, e = cEval(c, t, true); ts.push(t); P.push(e.p); Nn.push(unit(cross(unit(e.d), d))); } items.push({ seg: k, P, N: Nn });
      if (joins[k]) { const J = joins[k], M = Math.max(4, Math.min(24, Math.ceil(Math.abs(J.th) / 0.1) + 4)), JP = [], JN = []; for (let i = 0; i <= M; i++) { const a = J.th * i / M, c1 = Math.cos(a), s1 = Math.sin(a); JP.push(J.C); JN.push(add(mul(J.nA, c1), mul(cross(d, J.nA), s1))); } items.push({ join: k, P: JP, N: JN }); } }
    return items;
  }
  const rowPts = (it, d, cz, z0) => it.P.map((p, i) => add(add(p, mul(it.N[i], cz[0])), mul(d, cz[1] - z0)));
  /** one rational quadratic patch from a path in the (offset, height) plane: pieces {t:'line',to:[delta,z]} and {t:'arc',mid:[delta,z],to:[delta,z]} (a quarter circle, weight 1/sqrt 2) */
  function pathSide(it, d, z0, start, pieces) {
    const ctrl = [start], wts = [1]; pieces.forEach((pc) => { if (pc.t === 'line') { const l = ctrl[ctrl.length - 1]; ctrl.push([(l[0] + pc.to[0]) / 2, (l[1] + pc.to[1]) / 2]); wts.push(1); ctrl.push(pc.to); wts.push(1); } else { ctrl.push(pc.mid); wts.push(Math.SQRT1_2); ctrl.push(pc.to); wts.push(1); } });
    const np = pieces.length, V = [0, 0, 0]; for (let j = 1; j < np; j++) V.push(j / np, j / np); V.push(1, 1, 1);
    const dm = ctrl.reduce((m, c) => (Math.abs(c[0]) > Math.abs(m) ? c[0] : m), 0), ub = chordParams(it.P.map((p, i) => add(p, mul(it.N[i], dm)))); let U = null; const cols = [];
    ctrl.forEach((cz) => { const r = interpH(rowPts(it, d, cz, z0).map((q) => [q[0], q[1], q[2], 1]), ub, 3); U = r.U; cols.push(r.X.map((h) => [h[0], h[1], h[2]])); });
    const n = cols[0].length; return { p: 3, q: 2, U, V, P: Array.from({ length: n }, (_, i) => cols.map((c) => c[i])), w: Array.from({ length: n }, () => wts.slice()) };
  }
  const chordParams = (pts) => { const ub = [0]; for (let i = 1; i < pts.length; i++) ub.push(ub[i - 1] + len(sub(pts[i], pts[i - 1]))); const L = ub[ub.length - 1]; return ub.map((x) => x / L); };
  const degenerate = (c) => c.P.every((q) => len(sub(q, c.P[0])) < 1e-10);
  /** a solid whose side is the profile moved along a (offset, height) path, with planar ends; null if a corner overlaps (needs a trimmed intersection) or the error is too large */
  function pathSolid(a, F, start, pieces, tag) {
    const loop = orientLoop(a.profile.outer, F.d, true), z0 = dot(cEval(loop[0], dom(loop[0])[0]), F.d), deltas = [start[0]].concat(pieces.map((p) => p.to[0]), pieces.filter((p) => p.mid).map((p) => p.mid[0]));
    for (const N of [96, 192, 384]) {
      const items = sampleLoop(loop, F.d, N, 'rows', 0); if (!items) return null;
      for (const it of items) if (it.join !== undefined) { const th = turnAbout(cross(it.N[0], F.d) , cross(it.N[it.N.length - 1], F.d), F.d); void th; const turn = Math.atan2(dot(cross(it.N[0], it.N[it.N.length - 1]), F.d), dot(it.N[0], it.N[it.N.length - 1])); if (deltas.some((x) => x * turn < 0)) return null; }
      const sides = items.map((it) => pathSide(it, F.d, z0, start, pieces)), last = sides[0].P[0].length - 1, first = [], lastR = [];
      sides.forEach((S) => { const r0 = sRow(S, 0), r1 = sRow(S, last); if (!degenerate(r0)) first.push(r0); if (!degenerate(r1)) lastR.push(r1); });
      const faces = sides.map((S, k) => ({ kind: 'side', surf: S, sign: 1, tag: 'side' + k })); faces.push(planFace([first], mul(F.d, -1), 'cap0_0'), planFace([lastR], F.d, 'cap1_0'));
      const sol = { kind: 'skin', op: tag, faces, topo: { type: 'skin', nseg: sides.length, sections: [first, lastR], sides, caps: true, apex: -1 } };
      let err = 0; for (let j = 0; j <= pieces.length; j++) { const dl = j === 0 ? start[0] : pieces[j - 1].to[0]; if (!(Math.abs(dl) > 0)) continue;
        sides.forEach((S, si) => { if (items[si].join !== undefined) return; const [u0, u1] = [S.U[S.p], S.U[S.P.length]]; for (let i = 0; i < 100; i++) { const P = sEval(S, u0 + (u1 - u0) * (i + 0.5) / 100, j / pieces.length), Pp = sub(P, mul(F.d, dot(P, F.d) - z0)); let dd = Infinity; for (const c of loop) dd = Math.min(dd, len(sub(cEval(c, nearestParam(c, Pp).t), Pp))); err = Math.max(err, Math.abs(dd - Math.abs(dl))); } }); }
      sol.offsetError = err; if (err <= 5e-8 * (1 + F.H)) { const c = check(sol, false); return c.ok ? sol : null; } if (err > 1e-3 * (1 + F.H)) return null;
    }
    return null;
  }
  /** offset loop (one interpolated curve per segment and per round join) at distance delta (positive = outward); null if the offset folds */
  function offsetLoopCurves(loop, F, delta) {
    for (const N of [96, 192, 384]) { const items = sampleLoop(loop, F.d, N, 'offset', delta); if (!items) return null;
      const cs = items.map((it) => { const pts = it.P.map((p, i) => add(p, mul(it.N[i], delta))), ub = chordParams(pts), r = interpH(pts.map((q) => [q[0], q[1], q[2], 1]), ub, 3); return curve(3, r.U, r.X.map((h) => [h[0], h[1], h[2]]), r.X.map(() => 1)); });
      let err = 0; cs.forEach((c) => { for (let i = 0; i < 100; i++) { const P = cEval(c, dom(c)[0] + (dom(c)[1] - dom(c)[0]) * (i + 0.5) / 100); let dd = Infinity; for (const o of loop) { const np = nearestParam(o, P); dd = Math.min(dd, len(sub(cEval(o, np.t), P))); } err = Math.max(err, Math.abs(dd - Math.abs(delta))); } });
      if (err <= 5e-8 * (1 + F.H)) return { curves: cs, err }; if (err > 1e-3 * (1 + F.H)) return null; }
    return null;
  }
  /** EXACT offset of an extruded freeform solid: d > 0 grows it (flat faces move out, the sharp edges become quarter-round bands of radius d), d < 0 shrinks it (sharp edges stay sharp) */
  function offsetPrism(a, d) {
    try { if (!isPrism(a) || !(Math.abs(d) > 0)) return null; const F = prismFrame(a); if (!F) return null; const lo = F.lo, hi = F.hi;
      if (d > 0) return pathSolid(a, F, [0, lo - d], [{ t: 'arc', mid: [d, lo - d], to: [d, lo] }, { t: 'line', to: [d, hi] }, { t: 'arc', mid: [d, hi + d], to: [0, hi + d] }], 'offset');
      const t = -d; if (!(F.H > 2 * t * (1 + 1e-9))) return null; const inner = offsetLoopCurves(orientLoop(a.profile.outer, F.d, true), F, -t); if (!inner) return null; const r = prismOfLoops([inner.curves], F.d, lo + t, hi - t); if (r) r.offsetError = inner.err; return r;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  /** EXACT round of the edges between the flat ends and the side of an extruded freeform solid (radius r): which = 'top' | 'bottom' | 'both' (top = the end the extrusion runs to) */
  function roundPrism(a, r, which) {
    try { if (!isPrism(a) || !(r > 0)) return null; const F = prismFrame(a); if (!F) return null; const lo = F.lo, hi = F.hi, top = which === 'top' || which === 'both', bot = which === 'bottom' || which === 'both';
      if (!top && !bot) return null; if (!(F.H > (top && bot ? 2 : 1) * r * (1 + 1e-9))) return null;
      const pcs = [], start = bot ? [-r, lo] : [0, lo]; if (bot) pcs.push({ t: 'arc', mid: [0, lo], to: [0, lo + r] }); pcs.push({ t: 'line', to: [0, top ? hi - r : hi] }); if (top) pcs.push({ t: 'arc', mid: [0, hi], to: [-r, hi] });
      return pathSolid(a, F, start, pcs, 'round');
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  /** EXACT shell of an extruded freeform solid: wall thickness t inward, the end(s) in `open` ('top' | 'bottom' | 'both') removed; a blind cavity keeps a floor of thickness t */
  function shellPrism(a, open, t) {
    try { if (!isPrism(a) || !(t > 0)) return null; const F = prismFrame(a); if (!F || !(F.H > t * (1 + 1e-9))) return null; const loop = orientLoop(a.profile.outer, F.d, true), inner = offsetLoopCurves(loop, F, -t); if (!inner) return null;
      const va = massProps(a, 1).volume, base = { outer: a.profile.outer, holes: [] };
      if (open === 'both') { for (const cav of [inner.curves, reverseLoop(inner.curves)]) { const r = extrude({ outer: a.profile.outer, holes: [cav] }, a.vec); if (check(r, false).ok && massProps(r, 1).volume < va) return r; } return null; }
      const fromTop = open !== 'bottom', pl = fromTop ? F.hi : F.lo, floor = fromTop ? F.lo + t : F.hi - t; if (!(F.H > 2 * t * (1 + 1e-9))) return null;
      const cav = inner.curves.map((c) => onPlane(c, F.d, pl)), plane = { p: mul(F.d, floor), n: F.d };
      for (const lp of [cav, reverseLoop(cav)]) { const r = prismSolid(base, a.vec, null, null, [{ loop: lp, end: fromTop ? 'hi' : 'lo', plane }]); if (check(r, false).ok && massProps(r, 1).volume < va) return r; } return null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  /** shell with the faces to open named the way the app / OpenCascade adapter does: { near | c: [x,y,z] } (a point of the face) or { dir: [x,y,z] }; only the flat ends of an extruded freeform solid can be opened exactly */
  function shellExact(h, specs, t) {
    try { if (!isPrism(h) || !specs || !specs.length || !(t > 0)) return null; const F = prismFrame(h); if (!F) return null; let top = false, bot = false;
      for (const sp of specs) { let which; if (sp.dir) { const k = dot(unit(sp.dir), F.d); if (Math.abs(k) < 0.9) return null; which = k > 0 ? 'top' : 'bottom'; } else { const p = sp.near || sp.c; if (!p) return null; const z = dot(p, F.d), dh = Math.abs(z - F.hi), dl = Math.abs(z - F.lo); if (Math.min(dh, dl) > 1e-4 * (1 + F.H)) return null; which = dh < dl ? 'top' : 'bottom'; } if (which === 'top') top = true; else bot = true; }
      return shellPrism(h, top && bot ? 'both' : top ? 'top' : 'bottom', t);
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  const boolExact = (op, a, b) => boolPrisms(op, a, b);
  AK.nurbs = K.nurbs = { line, polyline, arc, circle, interp, fromControl, curve, cEval, sEval, cSample, cReverse, cMap, extrude, revolve, loft, sweep, sweepPieces, cutPrism, cutHalfSpace, cutPlanarTool, cutExact, prismSolid, planeCut, toolCut, moveFace, deleteFace, faceAt, clipPlanFace, trimSurfaceByPlane, trimSurfaceByPlanes, cutSkewCylinder, cutQuadricTool, boolPrisms, boolExact, isPrism, shellExact, offsetPrism, shellPrism, roundPrism, offsetLoopCurves, chainLoops, facesFromLoops, cSplit, cSub, massProps, check, mesh, indexedMesh, stepWrite, xf: xfSolid, fromSpec, isNurbs: isN, version: '1.4.0' };
  K.features = (K.features || []).concat(['nurbs-curves', 'nurbs-solids', 'nurbs-massprops', 'nurbs-step']);
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);

// ---------------------------------------------------------------- AakarKernel 1.4: per-operation OpenCascade fallback
// K.hybrid(primary, secondary) returns a kernel with the same interface as AakarKernel whose operations run in AakarKernel FIRST. When one of them cannot be done
// there (a boolean that does not close, a round on an edge it cannot treat, ...) only THAT operation is handed to OpenCascade: the operands travel as STEP, the result
// is read back into AakarKernel when it is made of analytic surfaces (so the rest of the model stays in the fast exact kernel) and otherwise stays an OpenCascade body
// that later operations pick up there. Nothing is ever done twice or silently approximated: every hand-over is counted in hybrid.stats and written to hybrid.log.
// `secondary` is the Aakar OpenCascade binding (kernel with .raw = the occt-wasm kernel).
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.hybrid) return;
  K.hybrid = function (primary, secondary, opts) {
    opts = opts || {}; const raw = secondary && secondary.raw; if (!primary || !secondary) throw new Error('hybrid kernel needs a primary and a secondary kernel');
    const H = { name: 'AakarKernel + OpenCascade', isHybrid: true, primary, secondary, stats: { offloaded: 0, back: 0, foreign: 0, failed: 0 }, log: [] }, note = (s) => { H.log.push(s); if (H.log.length > 200) H.log.shift(); if (opts.onNote) { try { opts.onNote(s); } catch (e) { /* ignore */ } } };
    const isF = (h) => !!(h && h.__foreign), F = (s) => ({ __foreign: true, s }), cache = new WeakMap(), rtol = opts.tol || 1e-6;
    const toSec = (h) => { if (isF(h)) return h.s; let s = cache.get(h); if (!s) { s = secondary.stepImport(primary.stepExport(h)); cache.set(h, s); } return s; };
    const back = (s, op) => {   // OpenCascade result -> AakarKernel when it is analytic and agrees, else stays foreign
      try { const v = secondary.volume(s), p = primary.stepImport(secondary.stepExport(s)), pv = primary.volume(p); const vd = primary.validate ? primary.validate(p) : null;
        if (v > 0 && Math.abs(pv - v) <= rtol * Math.max(1, v) && !(vd && vd.ok === false)) { cache.set(p, s); H.stats.back++; return p; } } catch (e) { /* stays foreign */ }
      H.stats.foreign++; note(op + ': result kept as an OpenCascade body (it contains surfaces AakarKernel does not hold)'); return F(s);
    };
    const offload = (op, run, why) => { H.stats.offloaded++; note(op + ': AakarKernel could not do it (' + String(why && why.message || why).slice(0, 90) + ') - done in OpenCascade'); try { return back(run(), op); } catch (e) { H.stats.failed++; note(op + ': OpenCascade failed too (' + String(e.message || e).slice(0, 90) + ')'); throw e; } };
    // ---- pass-through (primary first)
    ['box', 'cylinder', 'sphere', 'cone', 'torus', 'extrude', 'revolve', 'polyhedron', 'stepImport', 'stepImportAll'].forEach((m) => { if (typeof primary[m] === 'function') H[m] = (...a) => primary[m](...a); });
    ['translate', 'transform', 'rotate', 'scale', 'mirror'].forEach((m) => { if (typeof primary[m] !== 'function') return; H[m] = (h, ...a) => { if (!isF(h)) return primary[m](h, ...a); if (typeof secondary[m] !== 'function') throw new Error('OpenCascade body: ' + m + ' not available'); return F(secondary[m](h.s, ...a)); }; });
    const bool = (op, name) => (a, b) => {   // evaluated right away, so a failure is found here and not later in the app
      if (name === 'subtract' && !isF(a) && !isF(b) && K.nurbs && K.nurbs.cutExact && K.nurbs.isNurbs(a)) { const ex = K.nurbs.cutExact(a, b); if (ex) return ex; }
      if (!isF(a) && !isF(b) && K.nurbs && K.nurbs.boolExact && K.nurbs.isNurbs(a) && K.nurbs.isNurbs(b)) { const ex = K.nurbs.boolExact(op, a, b); if (ex) return ex; }
      if (!isF(a) && !isF(b) && K.nurbs && (K.nurbs.isNurbs(a) || K.nurbs.isNurbs(b))) return offload(name, () => secondary[op](toSec(a), toSec(b)), 'AakarKernel has no booleans on freeform (NURBS) solids');
      if (!isF(a) && !isF(b)) { try { const r = primary[op](a, b); primary.volume(r); return r; } catch (e) { return offload(name, () => secondary[op](toSec(a), toSec(b)), e); } }
      H.stats.offloaded++; try { return back(secondary[op](toSec(a), toSec(b)), name); } catch (e) { H.stats.failed++; throw e; }
    };
    H.fuse = bool('fuse', 'union'); H.cut = bool('cut', 'subtract'); H.common = bool('common', 'intersect');
    // ---- measurements and output work on either kind of body
    // a body read back from OpenCascade is exact in AakarKernel but has no tessellation there: it is meshed by the OpenCascade body it came from
    const meas = (m, sm) => (h, ...a) => { if (isF(h)) return secondary[sm || m](h.s, ...a); try { return primary[m](h, ...a); } catch (e) { const s = cache.get(h); if (s && typeof secondary[sm || m] === 'function' && (m === 'mesh' || m === 'stepExport')) return secondary[sm || m](s, ...a); throw e; } };
    ['volume', 'area', 'mesh', 'stepExport', 'massProps', 'bbox', 'validate', 'info'].forEach((m) => { if (typeof primary[m] === 'function' && (typeof secondary[m] === 'function' || !['massProps', 'bbox', 'validate', 'info'].includes(m))) H[m] = meas(m); else if (typeof primary[m] === 'function') H[m] = (h, ...a) => isF(h) ? (m === 'validate' ? { ok: true, issues: [], foreign: true } : m === 'info' ? null : (() => { throw new Error(m + ' is not available for this OpenCascade body'); })()) : primary[m](h, ...a); });
    // ---- rounds: AakarKernel first, OpenCascade for the edges it refuses
    const near = (a, b, t) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;
    function pickEdges(s, spec) {
      const out = [], sc = Math.max(1e-6, spec.R || 0, spec.p0 && spec.p1 ? Math.hypot(spec.p1[0] - spec.p0[0], spec.p1[1] - spec.p0[1], spec.p1[2] - spec.p0[2]) : 0), t = 1e-5 * sc + 1e-7, v3 = (p) => [p.x, p.y, p.z];
      raw.getSubShapes(s, 'edge').forEach((e) => {
        try {
          if (spec.kind === 'circle') { const d = raw.curveData(e); if (d && d.kind === 'circle' && Math.abs(d.radius - spec.R) < t * 10 && near(v3(d.center), spec.c, t * 10) && Math.abs(Math.abs(d.axis.x * spec.n[0] + d.axis.y * spec.n[1] + d.axis.z * spec.n[2]) - 1) < 1e-6) out.push(e); }
          else if (spec.kind === 'line') { const vs = raw.getSubShapes(e, 'vertex').map((v) => v3(raw.vertexPosition(v))); if (vs.length === 2 && ((near(vs[0], spec.p0, t * 10) && near(vs[1], spec.p1, t * 10)) || (near(vs[0], spec.p1, t * 10) && near(vs[1], spec.p0, t * 10)))) out.push(e); }
        } catch (err) { /* edge without curve data */ }
      }); return out;
    }
    if (typeof primary.roundEdge === 'function') H.roundEdge = (h, spec, type, r, tol) => {
      if (!isF(h)) { try { return (primary.roundEdge.__exact || primary.roundEdge)(h, spec, type, r, tol); } catch (e) { if (!raw || !raw.fillet) throw e; return offload(type || 'round', () => secondaryRound(toSec(h), spec, type, r), e); } }
      return back(secondaryRound(h.s, spec, type, r), type || 'round');
    };
    function secondaryRound(s, spec, type, r) {
      const es = pickEdges(s, spec); if (!es.length) throw new Error('the edge was not found in the OpenCascade body');
      const run = (list) => type === 'chamfer' ? raw.chamfer(s, list, r) : raw.fillet(s, list, r);
      const res = run(es);
      // a rim between a boss and its plate is concave: rounding it must ADD material. Some OpenCascade builds return a body that lost
      // material instead (wrong edge set or flipped sense); then try the edges one by one and keep the first result that has the right sign.
      if (spec.boss === true && typeof raw.volume === 'function') {
        try {
          const v0 = raw.volume(s), ok = (x) => raw.volume(x) > v0 + 1e-9 * Math.abs(v0);
          if (!ok(res)) { for (const e of es) { try { const one = run([e]); if (ok(one)) return one; } catch (e2) { /* next */ } } }
        } catch (e3) { /* volume check unavailable: keep the result */ }
      }
      return res;
    }
    // ---- operations AakarKernel has no exact version of: available when OpenCascade is present
    /** hollow a body: faceSpecs name the faces to open, each { c: [x,y,z] } (the face's centre of mass), { near: [x,y,z] } (the face whose centre is nearest) or { dir: [x,y,z] } (the face lying farthest along that direction); thickness > 0 grows inwards, < 0 outwards */
    H.shell = (h, faceSpecs, thickness) => { if (!isF(h) && K.nurbs && K.nurbs.shellExact && K.nurbs.isNurbs(h)) { const ex = K.nurbs.shellExact(h, faceSpecs, thickness); if (ex) return ex; } if (!raw || !raw.shell) throw new Error('OpenCascade is not available'); const s = toSec(h); const faces = raw.getSubShapes(s, 'face'), cm = (f) => { const c = raw.getSurfaceCenterOfMass(f); return [c.x, c.y, c.z]; };
      const pick = faceSpecs.map((fs) => { if (fs.c) return faces.find((f) => { try { const c = cm(f); return near(c, fs.c, 1e-4 * (1 + Math.hypot(...fs.c))); } catch (e) { return false; } }); if (fs.near) { let best = null, bd = Infinity; faces.forEach((f) => { try { const c = cm(f), d = Math.hypot(c[0] - fs.near[0], c[1] - fs.near[1], c[2] - fs.near[2]); if (d < bd) { bd = d; best = f; } } catch (e) { /* skip */ } }); return best; } if (fs.dir) { let best = null, bd = -Infinity; const d = fs.dir, L = Math.hypot(...d) || 1; faces.forEach((f) => { try { const c = cm(f), v = (c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / L; if (v > bd + 1e-9) { bd = v; best = f; } } catch (e) { /* skip */ } }); return best; } return null; }).filter(Boolean);
      if (pick.length !== faceSpecs.length) throw new Error('a face to open was not found'); H.stats.offloaded++; note('shell: done in OpenCascade'); return back(raw.shell(s, pick, thickness, 1e-3), 'shell'); };
    H.offset = (h, d) => { if (!isF(h) && K.nurbs && K.nurbs.offsetPrism && K.nurbs.isNurbs(h)) { const ex = K.nurbs.offsetPrism(h, d); if (ex) return ex; } if (!raw || !raw.offset) throw new Error('OpenCascade is not available'); H.stats.offloaded++; note('offset: done in OpenCascade'); return back(raw.offset(toSec(h), d, 1e-3), 'offset'); };
    if (primary.nurbs) H.nurbs = primary.nurbs;
    H.isForeign = isF; H.toSecondary = toSec;
    H.version = primary.version; H.features = (primary.features || []).concat(['occt-fallback']);
    return H;
  };
  K.features = (K.features || []).concat(['occt-fallback']);
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);

// AakarKernel 1.5 - approximate operations on ANY body, without OpenCascade: booleans with freeform (NURBS) solids, shell, offset and fillets on general curved bodies.
// Method (stated plainly, because it is not an exact B-rep method): the bodies are tessellated finely, signed-distance fields are built on a grid, the result is
// the zero set of the combined field (marching tetrahedra, subcell interpolation) and comes back as a real AakarKernel body (planar triangles) that every later
// operation, mass property and STEP export accepts.  The error is about one grid cell (default: 1/96 of the model size, finer when the wall / radius asks for it)
// and is returned with every result; K.meshops.isApprox(body) tells whether a body came from here.  Exact operations stay exact: this is only used where
// AakarKernel has no exact version, and OpenCascade (K.hybrid) is still preferred when it is present.
(function (AK) {
  'use strict';
  const K = AK && AK.kernel; if (!K || K.meshops) return;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len = (a) => Math.hypot(a[0], a[1], a[2]);
  const approx = new WeakMap(), MAXCELLS = 6e6;

  // ------------------------------------------------------------ tessellation of any body into a welded triangle list
  function triangles(h, rel) {
    let tol = rel; try { const b = K.bbox(h); tol = rel * Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]); } catch (e) { /* use it as an absolute value */ }
    const m = K.mesh(h, tol), P = m.positions, I = m.indices, key = new Map(), V = [], T = [], fid = [], faces = m.faces || null;
    const vid = (i) => { const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], k = Math.round(x * 1e7) + ',' + Math.round(y * 1e7) + ',' + Math.round(z * 1e7); let v = key.get(k); if (v === undefined) { v = V.length; V.push([x, y, z]); key.set(k, v); } return v; };
    for (let i = 0; i < I.length; i += 3) { const a = vid(I[i]), b = vid(I[i + 1]), c = vid(I[i + 2]); if (a === b || b === c || a === c) continue; T.push([a, b, c]); fid.push(faces ? faces[i / 3] : 0); }
    return { V, T, fid };
  }
  const bboxOf = (V) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; V.forEach((p) => { for (let i = 0; i < 3; i++) { if (p[i] < mn[i]) mn[i] = p[i]; if (p[i] > mx[i]) mx[i] = p[i]; } }); return { mn, mx }; };
  const volOf = (M) => { let v = 0; M.T.forEach(([a, b, c]) => { v += dot(M.V[a], cross(M.V[b], M.V[c])) / 6; }); return v; };

  // ------------------------------------------------------------ grid and signed distance field
  function makeGrid(bb, pad, h) {
    pad += 2.5 * h; const o = [bb.mn[0] - pad, bb.mn[1] - pad, bb.mn[2] - pad], n = [0, 1, 2].map((i) => Math.max(4, Math.ceil((bb.mx[i] + pad - o[i]) / h) + 1));
    return { o, h, nx: n[0], ny: n[1], nz: n[2], N: n[0] * n[1] * n[2] };
  }
  function chooseH(bb, need, pad) {
    const ext = [0, 1, 2].map((i) => bb.mx[i] - bb.mn[i] + 2 * pad), L = Math.max(...ext); let h = Math.min(L / 96, need / 3);
    const cells = (hh) => ext.reduce((a, e) => a * (Math.ceil(e / hh) + 1), 1);
    while (cells(h) > MAXCELLS) h *= 1.08;
    if (need > 0 && need / h < 1.4) throw new Error('approximate mode cannot resolve a wall / radius of ' + need.toPrecision(3) + ' on a model of size ' + L.toPrecision(4) + ' (needs OpenCascade as helper)');
    return h;
  }
  const closestOnTri = (p, a, b, c) => {            // Ericson, Real-Time Collision Detection
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    const dn = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * dn), mul(ac, vc * dn)));
  };
  /** signed distance (negative inside) of a closed triangle mesh on the grid; exact within 1.5 cells of the surface, propagated outwards by vector sweeps, limited to maxD */
  function sdfOfMesh(M, G, maxD) {
    const { nx, ny, nz, N, h } = G, o = G.o, dist = new Float32Array(N).fill(Infinity), seed = new Float32Array(3 * N), ix = (i, j, k) => (k * ny + j) * nx + i;
    const cellC = (i, j, k) => [o[0] + i * h, o[1] + j * h, o[2] + k * h];
    const touch = (a, b, c) => {                       // seed the cells near one (small) triangle
      const mn = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2])], mx = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])];
      const lo = [0, 1, 2].map((q) => Math.max(0, Math.floor((mn[q] - o[q]) / h) - 1)), hi = [Math.min(nx - 1, Math.ceil((mx[0] - o[0]) / h) + 1), Math.min(ny - 1, Math.ceil((mx[1] - o[1]) / h) + 1), Math.min(nz - 1, Math.ceil((mx[2] - o[2]) / h) + 1)];
      for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
        const p = cellC(i, j, k), q = closestOnTri(p, a, b, c), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), id = ix(i, j, k);
        if (d < dist[id]) { dist[id] = d; seed[3 * id] = q[0]; seed[3 * id + 1] = q[1]; seed[3 * id + 2] = q[2]; }
      }
    };
    const split = (a, b, c, depth) => {
      const ab = len(sub(b, a)), bc = len(sub(c, b)), ca = len(sub(a, c)), m = Math.max(ab, bc, ca); if (m <= 1.1 * h || depth > 14) { touch(a, b, c); return; }
      if (m === ab) { const d = mul(add(a, b), 0.5); split(a, d, c, depth + 1); split(d, b, c, depth + 1); } else if (m === bc) { const d = mul(add(b, c), 0.5); split(a, b, d, depth + 1); split(a, d, c, depth + 1); } else { const d = mul(add(c, a), 0.5); split(a, b, d, depth + 1); split(d, b, c, depth + 1); }
    };
    M.T.forEach(([a, b, c]) => split(M.V[a], M.V[b], M.V[c], 0));
    // propagate: forward and backward sweeps over the causal neighbours (2 rounds)
    const fw = [], bw = []; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const s = dz * 1e4 + dy * 1e2 + dx; if (s < 0) fw.push([dx, dy, dz]); else if (s > 0) bw.push([dx, dy, dz]); }
    const relax = (i, j, k, list) => {
      const id = ix(i, j, k), px = o[0] + i * h, py = o[1] + j * h, pz = o[2] + k * h; let best = dist[id], bx = seed[3 * id], by = seed[3 * id + 1], bz = seed[3 * id + 2];
      for (let q = 0; q < list.length; q++) { const ni = i + list[q][0], nj = j + list[q][1], nk = k + list[q][2]; if (ni < 0 || nj < 0 || nk < 0 || ni >= nx || nj >= ny || nk >= nz) continue; const nid = ix(ni, nj, nk); if (dist[nid] === Infinity) continue; const sx = seed[3 * nid], sy = seed[3 * nid + 1], sz = seed[3 * nid + 2], d = Math.sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy) + (pz - sz) * (pz - sz)); if (d < best) { best = d; bx = sx; by = sy; bz = sz; } }
      if (best < dist[id]) { dist[id] = best; seed[3 * id] = bx; seed[3 * id + 1] = by; seed[3 * id + 2] = bz; }
    };
    for (let round = 0; round < 2; round++) {
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) relax(i, j, k, fw);
      for (let k = nz - 1; k >= 0; k--) for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) relax(i, j, k, bw);
    }
    // sign: parity of the crossings of a ray along +x through every grid column
    const cols = new Array(ny * nz), e1 = 0.3719 * h * 1e-3, e2 = 0.6143 * h * 1e-3;
    M.T.forEach(([ia, ib, ic]) => {
      const a = M.V[ia], b = M.V[ib], c = M.V[ic], mnY = Math.min(a[1], b[1], c[1]), mxY = Math.max(a[1], b[1], c[1]), mnZ = Math.min(a[2], b[2], c[2]), mxZ = Math.max(a[2], b[2], c[2]);
      const nrm = cross(sub(b, a), sub(c, a)); if (Math.abs(nrm[0]) < 1e-18) return;
      const j0 = Math.max(0, Math.ceil((mnY - o[1] - e1) / h)), j1 = Math.min(ny - 1, Math.floor((mxY - o[1] - e1) / h)), k0 = Math.max(0, Math.ceil((mnZ - o[2] - e2) / h)), k1 = Math.min(nz - 1, Math.floor((mxZ - o[2] - e2) / h));
      const den = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]); if (Math.abs(den) < 1e-18) return;
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
        const y = o[1] + j * h + e1, z = o[2] + k * h + e2, u = ((y - a[1]) * (c[2] - a[2]) - (z - a[2]) * (c[1] - a[1])) / den, v = ((b[1] - a[1]) * (z - a[2]) - (b[2] - a[2]) * (y - a[1])) / den;
        if (u < 0 || v < 0 || u + v >= 1) continue; const x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), id = k * ny + j; (cols[id] || (cols[id] = [])).push(x);
      }
    });
    const F = new Float32Array(N), far = (maxD || Infinity) + h;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      const xs = cols[k * ny + j]; if (xs) xs.sort((p, q) => p - q);
      let c = 0, p = 0;
      for (let i = 0; i < nx; i++) { const x = o[0] + i * h; if (xs) while (p < xs.length && xs[p] < x) { p++; c++; } const id = ix(i, j, k), d = Math.min(dist[id], far); F[id] = (c & 1) ? -d : d; }
    }
    return F;
  }

  // ------------------------------------------------------------ marching tetrahedra: the level set of a field as a welded, outward oriented triangle mesh
  const TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];
  function extract(F, G, level) {
    const { nx, ny, nz, o, h } = G, V = [], T = [], map = new Map(), lv = level + 1e-7 * h, ix = (i, j, k) => (k * ny + j) * nx + i;
    const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edgePt = (ga, gb, fa, fb) => { const k = ga < gb ? ga + ',' + gb : gb + ',' + ga; let v = map.get(k); if (v !== undefined) return v; const t = (lv - fa) / (fb - fa); const pa = gp(ga), pb = gp(gb); v = V.length; V.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t]); map.set(k, v); return v; };
    const gp = (g) => { const i = g % nx, j = Math.floor(g / nx) % ny, k = Math.floor(g / (nx * ny)); return [o[0] + i * h, o[1] + j * h, o[2] + k * h]; };
    const cg = new Array(8), cf = new Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mn = Infinity, mx = -Infinity; for (let c = 0; c < 8; c++) { const g = ix(i + corner[c][0], j + corner[c][1], k + corner[c][2]); cg[c] = g; const f = F[g]; cf[c] = f; if (f < mn) mn = f; if (f > mx) mx = f; }
      if (mn > lv || mx < lv) continue;
      for (const tet of TETS) {
        const ins = [], out = []; tet.forEach((c) => { (cf[c] < lv ? ins : out).push(c); }); if (!ins.length || !out.length) continue;
        const ep = (a, b) => edgePt(cg[a], cg[b], cf[a], cf[b]); let tris = [];
        if (ins.length === 1) tris.push([ep(ins[0], out[0]), ep(ins[0], out[1]), ep(ins[0], out[2])]);
        else if (out.length === 1) tris.push([ep(out[0], ins[0]), ep(out[0], ins[1]), ep(out[0], ins[2])]);
        else { const a = ep(ins[0], out[0]), b = ep(ins[0], out[1]), c = ep(ins[1], out[1]), d = ep(ins[1], out[0]); tris.push([a, b, c], [a, c, d]); }
        const ci = [0, 0, 0], co = [0, 0, 0]; ins.forEach((c) => { const q = gp(cg[c]); for (let t = 0; t < 3; t++) ci[t] += q[t] / ins.length; }); out.forEach((c) => { const q = gp(cg[c]); for (let t = 0; t < 3; t++) co[t] += q[t] / out.length; });
        const dir = sub(co, ci);
        tris.forEach((t) => { const a = V[t[0]], b = V[t[1]], c = V[t[2]]; if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) return; const nn = cross(sub(b, a), sub(c, a)); T.push(dot(nn, dir) >= 0 ? t : [t[0], t[2], t[1]]); });
      }
    }
    return { V, T };
  }
  /** drop slivers, then make a real AakarKernel body out of the triangles */
  function weld(M, q) {                                                           // marching tetrahedra leave vertices a hair apart: merge them, drop the collapsed triangles
    const key = new Map(), map = new Array(M.V.length), V = []; M.V.forEach((p, i) => { const k = Math.round(p[0] / q) + ',' + Math.round(p[1] / q) + ',' + Math.round(p[2] / q); let v = key.get(k); if (v === undefined) { v = V.length; V.push(p); key.set(k, v); } map[i] = v; });
    const T = []; M.T.forEach((t) => { const a = map[t[0]], b = map[t[1]], c = map[t[2]]; if (a !== b && b !== c && a !== c) T.push([a, b, c]); }); return { V, T };
  }
  function toBody(M0, info) {
    const M = weld(M0, 0.02 * (info.h || 1e-3)), V = M.V, faces = [], used = new Set();
    M.T.forEach((t) => { const nn = cross(sub(V[t[1]], V[t[0]]), sub(V[t[2]], V[t[0]])), L = len(nn); if (L < 1e-14) return; faces.push({ n: mul(nn, 1 / L), loops: [t] }); t.forEach((i) => used.add(i)); });
    if (!faces.length) throw new Error('the approximate result is empty');
    const remap = new Map(), verts = []; used.forEach((i) => { remap.set(i, verts.length); verts.push(V[i]); });
    const body = K.polyhedron(verts, faces.map((f) => ({ n: f.n, loops: [f.loops[0].map((i) => remap.get(i))] })));
    info.props = propsOf(verts, faces.map((f) => f.loops[0].map((i) => remap.get(i)))); info.closed = info.props.closed; approx.set(body, info); return body;
  }
  /** volume, area, centroid and inertia of a closed triangle mesh (unit density) and whether every edge is used by exactly two triangles in opposite directions */
  function propsOf(V, T) {
    let vol = 0, area = 0, c = [0, 0, 0]; const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], dir = new Map();
    T.forEach(([ia, ib, ic]) => {
      const a = V[ia], b = V[ib], d = V[ic], v = dot(a, cross(b, d)) / 6; vol += v; area += len(cross(sub(b, a), sub(d, a))) / 2; const s = add(a, add(b, d));
      for (let q = 0; q < 3; q++) c[q] += v * s[q] / 4;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += v / 20 * (a[i] * a[j] + b[i] * b[j] + d[i] * d[j] + s[i] * s[j]);
      [[ia, ib], [ib, ic], [ic, ia]].forEach(([p, q]) => { const k = p + '>' + q; dir.set(k, (dir.get(k) || 0) + 1); });
    });
    let closed = true; for (const [k, n] of dir) { const [p, q] = k.split('>'); if (n !== 1 || dir.get(q + '>' + p) !== 1) { closed = false; break; } }
    const tr = S[0][0] + S[1][1] + S[2][2], Io = [[tr - S[0][0], -S[0][1], -S[0][2]], [-S[1][0], tr - S[1][1], -S[1][2]], [-S[2][0], -S[2][1], tr - S[2][2]]], cen = vol ? mul(c, 1 / vol) : [0, 0, 0], m2 = cen[0] * cen[0] + cen[1] * cen[1] + cen[2] * cen[2];
    const I = Io.map((r, i) => r.map((x, j) => x - vol * ((i === j ? m2 : 0) - cen[i] * cen[j])));
    return { volume: vol, area, approximateFaces: 0, centroid: cen, inertiaOrigin: Io, inertia: I, faceAreas: [], closed };
  }

  // ------------------------------------------------------------ operations
  const fieldOf = (M, G, maxD) => sdfOfMesh(M, G, maxD);
  const combine = (G, fs, fn) => { const r = new Float32Array(G.N); for (let i = 0; i < G.N; i++) r[i] = fn(i); return r; };
  const run = (what, M, need, pad, fn) => {
    const bb = bboxOf(M.V), h = chooseH(bb, need, pad), G = makeGrid(bb, pad, h), t0 = Date.now(), R = fn(G, h), body = toBody(R, { op: what, h, cells: G.N, ms: Date.now() - t0 });
    return body;
  };
  /** offset a closed body by d (d > 0 grows with rounded outside corners, d < 0 shrinks) */
  function offset(h, d, o) {
    if (!(Math.abs(d) > 0)) throw new Error('offset distance is zero'); const M = triangles(h, (o && o.tol) || 2e-4);
    return run('offset', M, Math.abs(d), Math.max(0, d) + 2 * Math.abs(d) * 0 + 1e-9, (G, hh) => { const F = fieldOf(M, G, Math.abs(d) + 3 * hh); return extract(F, G, d); });
  }
  const faceCentre = (M, id) => { let a = 0, c = [0, 0, 0]; M.T.forEach((t, i) => { if (M.fid[i] !== id) return; const A = M.V[t[0]], B = M.V[t[1]], C = M.V[t[2]], w = len(cross(sub(B, A), sub(C, A))); a += w; c = add(c, mul(add(A, add(B, C)), w / 3)); }); return a > 0 ? mul(c, 1 / a) : null; };
  /** hollow a body: closed (no specs) or with faces opened; specs are { near:[x,y,z] } | { dir:[x,y,z] } | { c:[x,y,z] }; t > 0 wall thickness inwards */
  function shell(h, specs, t, o) {
    if (!(t > 0)) throw new Error('shell thickness must be positive'); const M = triangles(h, (o && o.tol) || 2e-4); specs = specs || [];
    const bb0 = bboxOf(M.V), L = len(sub(bb0.mx, bb0.mn)), slab = 2 * t + 0.02 * L;
    let Mo = M;                                                                                  // the body with the opened faces extended outwards (its erosion is the cavity)
    if (specs.length) {
      const ids = new Set(M.fid), cen = new Map(); ids.forEach((id) => cen.set(id, faceCentre(M, id)));
      const open = new Set(); specs.forEach((sp) => { let best = null, bd = sp.dir ? -Infinity : Infinity; ids.forEach((id) => { const c = cen.get(id); if (!c) return; if (sp.dir) { const v = dot(c, sp.dir) / (len(sp.dir) || 1); if (v > bd + 1e-9) { bd = v; best = id; } } else { const p = sp.near || sp.c, dd = len(sub(c, p)); if (dd < bd) { bd = dd; best = id; } } }); if (best === null) throw new Error('a face to open was not found'); open.add(best); });
      const keep = [], face = []; M.T.forEach((tr, i) => { (open.has(M.fid[i]) ? face : keep).push(tr); });
      const V = M.V.map((p) => p.slice()), T = keep.slice(), ec = new Map(); face.forEach((tr) => { for (let q = 0; q < 3; q++) { const a = tr[q], b = tr[(q + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; ec.set(k, (ec.get(k) || []).concat([[a, b]])); } });
      let nrm = [0, 0, 0]; face.forEach((tr) => { nrm = add(nrm, cross(sub(M.V[tr[1]], M.V[tr[0]]), sub(M.V[tr[2]], M.V[tr[0]]))); }); nrm = mul(nrm, 1 / (len(nrm) || 1));
      const top = new Map(), up = (i) => { let v = top.get(i); if (v === undefined) { v = V.length; V.push(add(M.V[i], mul(nrm, slab))); top.set(i, v); } return v; };
      face.forEach((tr) => T.push([up(tr[0]), up(tr[1]), up(tr[2])]));
      ec.forEach((arr) => { if (arr.length !== 1) return; const [a, b] = arr[0]; T.push([a, b, up(b)], [a, up(b), up(a)]); });
      Mo = { V, T, fid: T.map(() => 0) };
    }
    return run('shell', M, t, slab + t, (G, hh) => {
      const FA = fieldOf(M, G, t + 3 * hh), FC = specs.length ? fieldOf(Mo, G, t + 3 * hh) : FA;
      const F = combine(G, null, (i) => Math.max(FA[i], -(FC[i] + t))); return extract(F, G, 0);
    });
  }
  /** polyline of a rounded edge from the specs the app uses: { kind:'line', p0, p1 } or { kind:'circle', c, n, R } */
  function edgePoints(spec, step) {
    if (spec.kind === 'line') { const a = spec.p0, b = spec.p1, n = Math.max(1, Math.ceil(len(sub(b, a)) / step)); return Array.from({ length: n + 1 }, (_, i) => add(a, mul(sub(b, a), i / n))); }
    if (spec.kind === 'circle') { const nn = mul(spec.n, 1 / len(spec.n)), x = len(cross(nn, [1, 0, 0])) > 0.1 ? mul(cross(nn, [1, 0, 0]), 1 / len(cross(nn, [1, 0, 0]))) : mul(cross(nn, [0, 1, 0]), 1 / len(cross(nn, [0, 1, 0]))), y = cross(nn, x), n = Math.max(24, Math.ceil(2 * Math.PI * spec.R / step)); return Array.from({ length: n + 1 }, (_, i) => { const a = 2 * Math.PI * i / n; return add(spec.c, add(mul(x, spec.R * Math.cos(a)), mul(y, spec.R * Math.sin(a)))); }); }
    throw new Error('this edge shape cannot be rounded in approximate mode');
  }
  /** round (fillet) the given edges of any closed body with radius r: convex edges by an opening, concave edges by a closing, both limited to a tube around the edges */
  function fillet(h, specs, r, o) {
    if (!(r > 0)) throw new Error('fillet radius must be positive'); const M = triangles(h, (o && o.tol) || 2e-4), mr = 1.2 * r;
    return run('fillet', M, r, 2.5 * r, (G, hh) => {
      const FA = fieldOf(M, G, 3 * r + 3 * hh);
      const Mi = extract(FA, G, -r), Fo = fieldOf(Mi, G, 3 * r + 3 * hh), Mc = extract(FA, G, r), Fc = fieldOf(Mc, G, 3 * r + 3 * hh);   // opening = dilate(erode), closing = erode(dilate)
      const mask = new Float32Array(G.N).fill(1e30), { nx, ny, nz, o: go } = G, bump = (id, d) => { if (d < mask[id]) mask[id] = d; };
      specs.forEach((sp) => {
        const pts = sp.kind === 'line' ? [sp.p0, sp.p1] : edgePoints(sp, hh * 0.8), ln = sp.kind === 'line', ax = ln ? sub(sp.p1, sp.p0) : null, L = ln ? len(ax) : 0, u = ln ? mul(ax, 1 / L) : null;
        const mn = [0, 1, 2].map((q) => Math.min(...pts.map((p) => p[q])) - mr), mx = [0, 1, 2].map((q) => Math.max(...pts.map((p) => p[q])) + mr);
        const lo = [0, 1, 2].map((q) => Math.max(0, Math.floor((mn[q] - go[q]) / hh))), hi = [Math.min(nx - 1, Math.ceil((mx[0] - go[0]) / hh)), Math.min(ny - 1, Math.ceil((mx[1] - go[1]) / hh)), Math.min(nz - 1, Math.ceil((mx[2] - go[2]) / hh))];
        const pp = ln ? null : edgePoints(sp, hh * 0.8);
        for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
          const id = (k * ny + j) * nx + i, c = [go[0] + i * hh, go[1] + j * hh, go[2] + k * hh];
          if (ln) { const w = sub(c, sp.p0), t = dot(w, u); if (t < -1e-9 || t > L + 1e-9) continue; bump(id, len(sub(w, mul(u, t)))); }
          else { let d = Infinity; for (let q = 0; q < pp.length; q++) { const e = Math.hypot(c[0] - pp[q][0], c[1] - pp[q][1], c[2] - pp[q][2]); if (e < d) d = e; } bump(id, d); }
        }
      });
      const F = combine(G, null, (i) => { const g = mask[i] - mr, opened = Fo[i] - r, closed = Fc[i] + r, removed = Math.max(FA[i], Math.min(opened, -g)), added = Math.max(closed, -FA[i], g); return Math.min(removed, added); });
      return extract(F, G, 0);
    });
  }
  /** robust boolean of any two closed bodies by signed-distance fields (accuracy about one grid cell); used when an operand is itself an approximate body or the exact intersection of the tessellations fails */
  function fieldBoolean(op, a, b, o) {
    const Ma = triangles(a, (o && o.tol) || 2e-4), Mb = triangles(b, (o && o.tol) || 2e-4), all = { V: Ma.V.concat(Mb.V) }, bb = bboxOf(all.V), L = Math.hypot(bb.mx[0] - bb.mn[0], bb.mx[1] - bb.mn[1], bb.mx[2] - bb.mn[2]);
    const hh = chooseH(bb, L / 40, 0), G = makeGrid(bb, 0, hh), t0 = Date.now(), FA = sdfOfMesh(Ma, G, 3 * hh), FB = sdfOfMesh(Mb, G, 3 * hh), F = new Float32Array(G.N);
    for (let i = 0; i < G.N; i++) F[i] = op === 'fuse' ? Math.min(FA[i], FB[i]) : op === 'common' ? Math.max(FA[i], FB[i]) : Math.max(FA[i], -FB[i]);
    return toBody(extract(F, G, 0), { op: 'field ' + op, h: hh, cells: G.N, ms: Date.now() - t0 });
  }
  /** boolean of two bodies, at least one freeform: exact intersection of their fine tessellations (planar triangles), so sharp creases stay sharp */
  function boolean(op, a, b, o) {
    const tol = (o && o.tol) || 2e-4, mk = (x) => { const M = triangles(x, tol); const faces = M.T.map((t) => { const nn = cross(sub(M.V[t[1]], M.V[t[0]]), sub(M.V[t[2]], M.V[t[0]])), L = len(nn); return L < 1e-14 ? null : { n: mul(nn, 1 / L), loops: [t] }; }).filter(Boolean); return K.polyhedron(M.V, faces); };
    const pa = mk(a), pb = mk(b), prev = K.__rawBool; const fn = prev ? prev[op] : null; if (!fn) throw new Error('no boolean available');
    const r = fn(pa, pb); approx.set(r, { op: 'boolean ' + op, tol }); return r;
  }
  // keep the planar boolean entry points to use on the tessellated operands, then route freeform operands to them
  K.__rawBool = { cut: K.cut, fuse: K.fuse, common: K.common };
  const isN = (h) => !!(K.nurbs && K.nurbs.isNurbs && K.nurbs.isNurbs(h));
  ['cut', 'fuse', 'common'].forEach((op) => { const o = K[op]; if (typeof o !== 'function' || o.__meshWrapped) return; const w = function (a, b, ...rest) { if (op === 'cut' && isN(a) && !isN(b) && K.nurbs.cutExact) { const r = K.nurbs.cutExact(a, b); if (r) return r; } if (isN(a) && isN(b) && K.nurbs.boolExact) { const r = K.nurbs.boolExact(op, a, b); if (r) return r; } if (approx.has(a) || approx.has(b)) return fieldBoolean(op, a, b); if (isN(a) || isN(b)) { try { const r = boolean(op, a, b); K.volume(r); return r; } catch (e) { return fieldBoolean(op, a, b); } } return o.call(this, a, b, ...rest); }; w.__meshWrapped = true; K[op] = w; });
  // shell / offset / fillet entry points of the kernel facade (the hybrid kernel with OpenCascade replaces them by exact ones)
  if (typeof K.shell !== 'function') K.shell = (h, specs, t) => { if (isN(h) && K.nurbs.shellExact) { const r = K.nurbs.shellExact(h, specs, t); if (r) return r; } return shell(h, specs, t); };
  if (typeof K.offset !== 'function') K.offset = (h, d) => { if (isN(h) && K.nurbs.offsetPrism) { const r = K.nurbs.offsetPrism(h, d); if (r) return r; } return offset(h, d); };
  if (typeof K.roundEdge === 'function' && !K.roundEdge.__meshWrapped) {
    const ro = K.roundEdge, w = function (h, spec, type, r, tol) {
      try { return ro.call(this, h, spec, type, r, tol); } catch (e) { if (!K.meshops.autoRound || type === 'chamfer' || !spec || !(r > 0) || !(spec.kind === 'line' || spec.kind === 'circle')) throw e; const res = fillet(h, [spec], r); const inf = approx.get(res); if (inf) inf.fallbackFor = String(e.message || e).slice(0, 100); return res; }
    }; w.__meshWrapped = true; w.__exact = ro; K.roundEdge = w;
  }
  // measurements of an approximate body come straight from its triangles (a body with 10^5 faces would make the exact face-by-face route very slow)
  const wrapA = (name, fn) => { const o = K[name]; if (typeof o !== 'function' || o.__meshWrapped) return; const w = function (h, ...a) { const i = h && approx.get(h); return i && i.props ? fn(i, h, ...a) : o.call(this, h, ...a); }; w.__meshWrapped = true; K[name] = w; };
  wrapA('volume', (i) => i.props.volume); wrapA('area', (i) => i.props.area); wrapA('massProps', (i) => i.props);
  wrapA('validate', (i) => ({ ok: !!i.closed, issues: i.closed ? [] : ['the approximate result is not closed'], counts: { faces: 0 }, approximate: true }));
  K.meshops = { autoRound: false, fieldBoolean, offset, shell, fillet, boolean, isApprox: (h) => approx.get(h) || null, triangles, sdfOfMesh, extract, version: '1.5.0' };
  K.features = (K.features || []).concat(['approx-offset', 'approx-shell', 'approx-fillet', 'approx-nurbs-booleans']);
  void volOf;
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);

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
    for (const L of A.loops) for (const c of L) { if ((m.adj.get(c.id) || []).indexOf(j) < 0) continue; any = true; const p = edgeMid(c), na = normalAt(A, p), nb = normalAt(B, p); if (dot(na, nb) < 1 - 1e-4) return false; }
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
    // sloped side walls: when the walls next to the face are flat and not square to it, the new material is bounded by those wall planes (they carry on), not by the outline straight up
    let walls = null;
    if (F.loops.length === 1) { const nbs = F.loops[0].map((c) => m.FL[(m.adj.get(c.id) || []).find((j) => j !== F.i)]); if (nbs.every((g) => g && g.kind === 'plane') && nbs.some((g) => Math.abs(dot(g.n, F.n)) > 1e-6)) { const seen = []; nbs.forEach((g) => { if (!seen.some((q) => dot(q.n, g.n) > 1 - 1e-9 && Math.abs(dot(q.n, sub(g.o, q.o))) < m.tol * 10)) seen.push(g); }); walls = seen; } }
    const wallRegion = (zone) => { let r = zone; walls.forEach((g) => { r = K.common(r, half(g.o, g.n, -1)); }); return r; };
    if (walls) {
      if (hmax > m.tol * 10) { const zone = K.common(half(F.o, F.n, +1), half(p2, n2, -1)); cur = apply(cur, wallRegion(zone), true, 'replace face (added)'); }
      if (hmin < -m.tol * 10) { const zone = K.common(half(F.o, F.n, -1), half(p2, n2, +1)); cur = apply(cur, wallRegion(zone), false, 'replace face (removed)'); }
      return cur;
    }
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
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);

// ---------------------------------------------------------------- AakarKernel 1.5: free-form STEP import and editing
// STEP files whose faces are B_SPLINE_SURFACE (rational or not, with knots or uniform / quasi-uniform / Bezier) are read into exact free-form solids
// (the same {faces, topo:{type:'brep'}} bodies the NURBS operations make): flat faces become 'plan' faces, B-spline faces become trimmed patches whose
// boundary is the STEP edge curves projected onto the surface (Newton).  Cylinders are read as exact rational patches as well.
//   K.stepImport / K.stepImportAll   use this reader for the solids that have B-spline faces; every other solid still goes through the analytic reader
//   K.nurbs.moveFace(sol, idx, dist) on an imported solid: a flat face moved OUTWARD grows exact side walls (each boundary edge swept along the normal);
//                                    moved INWARD it is an exact plane cut when the whole body lies behind the face.  Anything else returns null.
(function (AK) {
  const K = AK && AK.kernel; if (!K || !K.nurbs || K.stepFree || !AK.stepParse) return;
  const N = K.nurbs, V3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: (a) => Math.hypot(a[0], a[1], a[2]) };
  const { sub, add, mul, dot, cross, len } = V3, unit = (a) => { const l = len(a); if (!(l > 1e-14)) throw new Error('degenerate direction in STEP'); return mul(a, 1 / l); };
  const dom = (c) => [c.U[c.p], c.U[c.P.length]], sDom = (S) => [S.U[S.p], S.U[S.P.length], S.V[S.q], S.V[S.P[0].length]];
  const clampedKnots = (n, p) => { const U = []; for (let i = 0; i <= p; i++) U.push(0); for (let j = 1; j <= n - p; j++) U.push(j); for (let i = 0; i <= p; i++) U.push(n - p + 1); return U; };

  // ---- re-seaming of a patch that is closed in u (first and last control column coincide): the same surface with the seam moved to u = us (exact: knot insertion, then the two halves swap)
  const insertU = (S, t) => {
    const p = S.p, U = S.U, n = S.P.length - 1; let k = p; while (k < n && t >= U[k + 1]) k++;
    const H = S.P.map((row, i) => row.map((q, j) => { const w = S.w[i][j]; return [q[0] * w, q[1] * w, q[2] * w, w]; })), R2 = [];
    for (let i = 0; i <= n + 1; i++) { if (i <= k - p) R2.push(H[i]); else if (i > k) R2.push(H[i - 1]); else { const a = (t - U[i]) / (U[i + p] - U[i]); R2.push(H[i].map((h, j) => h.map((x, c) => a * x + (1 - a) * H[i - 1][j][c]))); } }
    return { p, q: S.q, U: U.slice(0, k + 1).concat([t], U.slice(k + 1)), V: S.V, P: R2.map((r) => r.map((h) => [h[0] / h[3], h[1] / h[3], h[2] / h[3]])), w: R2.map((r) => r.map((h) => h[3])) };
  };
  const reseamU = (S, us) => {
    const p = S.p, u0 = S.U[p], u1 = S.U[S.P.length], eq = (x) => Math.abs(x - us) < 1e-12 * (1 + Math.abs(us)); let T = S; while (T.U.filter(eq).length < p) T = insertU(T, us);
    const k = T.U.findIndex(eq), j = k - 1, nT = T.P.length, J = u0 + (u1 - us);
    const UA = [us].concat([], T.U.slice(k + p)); const A = { U: Array(p + 1).fill(u0).concat(T.U.slice(k + p, T.U.length - (p + 1)).map((x) => x - us + u0), Array(p + 1).fill(J)), P: T.P.slice(j), w: T.w.slice(j) }; void UA;
    const B = { U: Array(p + 1).fill(J).concat(T.U.slice(p + 1, k).map((x) => x - u0 + J), Array(p + 1).fill(u1)), P: T.P.slice(0, j + 1), w: T.w.slice(0, j + 1) };
    const U = A.U.slice(0, A.U.length - (p + 1)).concat(Array(p).fill(J), B.U.slice(p + 1));
    const out = { p, q: S.q, U, V: S.V, P: A.P.concat(B.P.slice(1)), w: A.w.concat(B.w.slice(1)) }; void nT;
    if (out.U.length !== out.P.length + p + 1) throw new Error('re-seaming of a closed B-spline patch failed (knots)');
    return out;
  };
  function readStep(text, ropts) {
    const ents = AK.stepParse(text);
    const get = (r) => { const e = ents.get(r.ref); if (e === undefined) throw new Error('missing STEP entity #' + r.ref); return e; };
    const typeOf = (e) => (Array.isArray(e) ? e.map((x) => x.type).join('+') : e.type), part = (e, t) => (Array.isArray(e) ? e.find((x) => x.type === t) : (e.type === t ? e : null));
    let scale = 1;
    for (const e of ents.values()) { const lu = Array.isArray(e) ? part(e, 'LENGTH_UNIT') : null; if (lu) { const si = part(e, 'SI_UNIT'); if (si) { const pre = si.args[0] && si.args[0].en; scale = pre === 'MILLI' ? 1 : pre === 'CENTI' ? 10 : pre === 'KILO' ? 1e6 : pre === 'MICRO' ? 1e-3 : 1000; } break; } if (Array.isArray(e) && part(e, 'CONVERSION_BASED_UNIT') && part(e, 'LENGTH_UNIT')) { scale = 25.4; break; } }
    const memo = new Map(), memoize = (r, fn) => { if (memo.has(r.ref)) return memo.get(r.ref); const v = fn(); memo.set(r.ref, v); return v; };
    const P3 = (r) => memoize(r, () => get(r).args[1].map((x) => x * scale)), D3 = (r) => memoize(r, () => unit(get(r).args[1]));
    const A2 = (r) => memoize(r, () => { const e = get(r), o = P3(e.args[1]), z = e.args[2] ? D3(e.args[2]) : [0, 0, 1]; let x = e.args[3] ? D3(e.args[3]) : null; if (!x) x = unit(Math.abs(z[0]) < 0.9 ? cross(z, [1, 0, 0]) : cross(z, [0, 1, 0])); x = unit(sub(x, mul(z, dot(x, z)))); return { o, z, x, y: cross(z, x) }; });

    // ---- surfaces
    const knotVec = (mult, kv) => { const U = []; kv.forEach((k, i) => { for (let j = 0; j < mult[i]; j++) U.push(k); }); return U; };
    const bsSurface = (e) => {
      let pu, pv, rows, mu, mv, ku, kv, W = null, kind;
      if (Array.isArray(e)) {
        const b = part(e, 'B_SPLINE_SURFACE'), kn = part(e, 'B_SPLINE_SURFACE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_SURFACE');
        pu = b.args[0]; pv = b.args[1]; rows = b.args[2]; if (kn) { mu = kn.args[0]; mv = kn.args[1]; ku = kn.args[2]; kv = kn.args[3]; } if (rat) W = rat.args[0]; kind = kn ? 'knots' : 'uniform';
      } else { pu = e.args[1]; pv = e.args[2]; rows = e.args[3]; if (e.type === 'B_SPLINE_SURFACE_WITH_KNOTS') { mu = e.args[8]; mv = e.args[9]; ku = e.args[10]; kv = e.args[11]; kind = 'knots'; } else kind = 'uniform'; }
      const P = rows.map((row) => row.map((r) => P3(r))), nu = P.length, nv = P[0].length;
      const U = kind === 'knots' ? knotVec(mu, ku) : clampedKnots(nu - 1, pu), Vk = kind === 'knots' ? knotVec(mv, kv) : clampedKnots(nv - 1, pv);
      if (U.length !== nu + pu + 1 || Vk.length !== nv + pv + 1) throw new Error('inconsistent B-spline surface (knots do not match the control net)');
      return { p: pu, q: pv, U, V: Vk, P, w: W ? W.map((r) => r.slice()) : P.map((r) => r.map(() => 1)) };
    };
    const surface = (r) => memoize(r, () => {
      const e = get(r), t = typeOf(e);
      if (t === 'PLANE') { const f = A2(e.args[1]); return { kind: 'plane', o: f.o, n: f.z }; }
      if (t === 'CYLINDRICAL_SURFACE') { const f = A2(e.args[1]); return { kind: 'cyl', f, r: e.args[2] * scale }; }
      if (/B_SPLINE_SURFACE/.test(t) || /UNIFORM_SURFACE|BEZIER_SURFACE/.test(t)) return { kind: 'bs', S: bsSurface(e) };
      throw new Error('this STEP file has a ' + t.toLowerCase().replace(/_/g, ' ') + ' next to free-form faces; only planes, cylinders and B-spline surfaces are read together');
    });

    // ---- edge curves (oriented along the loop)
    const bsCurve = (e) => {
      let deg, cps, mult, kv, w = null, uni = false;
      if (Array.isArray(e)) { const c = part(e, 'B_SPLINE_CURVE'), kn = part(e, 'B_SPLINE_CURVE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_CURVE'); deg = c.args[0]; cps = c.args[1].map(P3); if (kn) { mult = kn.args[0]; kv = kn.args[1]; } else uni = true; w = rat ? rat.args[0] : null; }
      else { deg = e.args[1]; cps = e.args[2].map(P3); if (e.type === 'B_SPLINE_CURVE_WITH_KNOTS') { mult = e.args[6]; kv = e.args[7]; } else uni = true; }
      const U = uni ? clampedKnots(cps.length - 1, deg) : knotVec(mult, kv);
      return N.curve(deg, U, cps, w ? w.slice() : cps.map(() => 1));
    };
    const nearestT = (c, P) => { const [a, b] = dom(c); let t = a, bd = Infinity; const M = Math.max(200, c.P.length * 40); for (let i = 0; i <= M; i++) { const tt = a + (b - a) * i / M, d = len(sub(N.cEval(c, tt), P)); if (d < bd) { bd = d; t = tt; } } let lo = Math.max(a, t - (b - a) / M), hi = Math.min(b, t + (b - a) / M); for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (len(sub(N.cEval(c, m1), P)) < len(sub(N.cEval(c, m2), P))) hi = m2; else lo = m1; } return (lo + hi) / 2; };
    const edgeCurve = (r) => memoize(r, () => {
      const e = get(r), a = P3(get(e.args[1]).args[1]), b = P3(get(e.args[2]).args[1]), same = !(e.args[4] && e.args[4].en === 'F'); let cur = get(e.args[3]);
      while (['SURFACE_CURVE', 'SEAM_CURVE', 'INTERSECTION_CURVE', 'BOUNDED_SURFACE_CURVE'].indexOf(typeOf(cur)) >= 0) cur = get(cur.args[1]);
      const t = typeOf(cur); let c;
      if (t === 'LINE') c = N.line(a, b);
      else if (t === 'CIRCLE') {
        const f = A2(cur.args[1]), rad = cur.args[2] * scale, ang = (p) => { const d = sub(p, f.o); return Math.atan2(dot(d, f.y), dot(d, f.x)); };
        const full = len(sub(a, b)) < 1e-9 * (1 + rad); c = same ? N.arc(f.o, f.x, f.y, rad, ang(a), full ? ang(a) + 2 * Math.PI : ang(b)) : N.arc(f.o, f.x, f.y, rad, ang(b), full ? ang(b) + 2 * Math.PI : ang(a));
        if (!same) c = N.cReverse(c);
        return c;
      } else if (/B_SPLINE_CURVE/.test(t)) {
        c = bsCurve(cur); const [d0, d1] = dom(c), closed = len(sub(a, b)) < 1e-9 * (1 + len(a));
        if (!closed) { let ta = nearestT(c, a), tb = nearestT(c, b); if (!same) { const x = ta; ta = tb; tb = x; } const lo = Math.min(ta, tb), hi = Math.max(ta, tb); if (hi - lo < (d1 - d0) * 1 - 1e-9 * (d1 - d0)) c = N.cSub(c, Math.max(d0, lo), Math.min(d1, hi)); if (!same) c = N.cReverse(c); }
        else if (!same) c = N.cReverse(c);
        return c;
      } else throw new Error('this STEP file has a ' + t.toLowerCase().replace(/_/g, ' ') + ' edge next to free-form faces; only lines, circles and B-splines are read together');
      return c;     // LINE
    });

    // ---- loops
    const loopCurves = (br) => {
      const b = get(br), lp = get(b.args[1]); if (lp.type !== 'EDGE_LOOP') return null;
      let cs = lp.args[1].map((or) => { const o = get(or), c = edgeCurve(o.args[3]), fwd = !(o.args[4] && o.args[4].en === 'F'); return fwd ? c : N.cReverse(c); });
      if (b.args[2] && b.args[2].en === 'F') cs = cs.slice().reverse().map((c) => N.cReverse(c));
      return { cs, outer: b.type === 'FACE_OUTER_BOUND' };
    };
    const areaVec = (cs) => { const pts = []; cs.forEach((c) => N.cSample(c, 32).slice(0, -1).forEach((q) => pts.push(q))); let a = [0, 0, 0]; for (let i = 1; i + 1 < pts.length; i++) a = add(a, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]))); return mul(a, 0.5); };

    // ---- projection onto a B-spline surface
    const invert = (S, P, guess) => {
      const [u0, u1, v0, v1] = sDom(S); let u, v;
      if (guess) { u = guess[0]; v = guess[1]; }
      else { let bd = Infinity; const G = 24; for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) { const uu = u0 + (u1 - u0) * i / G, vv = v0 + (v1 - v0) * j / G, d = len(sub(N.sEval(S, uu, vv), P)); if (d < bd) { bd = d; u = uu; v = vv; } } }
      for (let it = 0; it < 60; it++) {
        const e = N.sEval(S, u, v, true), r = sub(e.p, P), a = dot(e.u, e.u), b = dot(e.u, e.v), c = dot(e.v, e.v), g1 = dot(e.u, r), g2 = dot(e.v, r), det = a * c - b * b; if (Math.abs(det) < 1e-24) break;
        let du = -(c * g1 - b * g2) / det, dv = -(a * g2 - b * g1) / det; const nu = Math.min(u1, Math.max(u0, u + du)), nv = Math.min(v1, Math.max(v0, v + dv));
        if (Math.abs(nu - u) < 1e-13 * (u1 - u0) && Math.abs(nv - v) < 1e-13 * (v1 - v0)) { u = nu; v = nv; break; } u = nu; v = nv;
      }
      return { uv: [u, v], d: len(sub(N.sEval(S, u, v), P)) };
    };
    const uvOfCurve = (S, c, size, carryTh) => {
      const n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)), pts = [], [a, b] = dom(c); let prev = null;
      let prevTh = carryTh === undefined ? null : carryTh;
      for (let i = 0; i <= n; i++) { const P = N.cEval(c, a + (b - a) * i / n); let g = prev;
        if (S.cyl) { const d = sub(P, S.cyl.f.o); let th = Math.atan2(dot(d, S.cyl.f.y), dot(d, S.cyl.f.x)); if (prevTh === null) { while (th < S.cyl.th0 - 1e-9) th += 2 * Math.PI; while (th > S.cyl.th0 + 2 * Math.PI - 1e-9) th -= 2 * Math.PI; } else { while (th - prevTh > Math.PI) th -= 2 * Math.PI; while (th - prevTh < -Math.PI) th += 2 * Math.PI; } prevTh = th; g = [S.U[S.p] + (S.U[S.P.length] - S.U[S.p]) * Math.min(1, Math.max(0, (th - S.cyl.th0) / S.cyl.span)), Math.min(S.V[S.V.length - 1], Math.max(S.V[0], dot(d, S.cyl.f.z)))]; }
        const r = invert(S, P, g); if (r.d > 2e-3 * size + 1e-6) { throw new Error((closedIn(S, 0, size) || closedIn(S, 1, size)) ? 'a loop of this STEP face crosses the seam of a closed B-spline patch; faces that straddle a seam are not read yet (rotate the part or split the face at the seam)' : 'a STEP edge does not lie on its B-spline face (distance ' + r.d.toExponential(2) + ')'); } prev = r.uv; if (pts.length && Math.hypot(r.uv[0] - pts[pts.length - 1][0], r.uv[1] - pts[pts.length - 1][1]) < 1e-12) continue; pts.push(r.uv); }
      pts.lastTh = prevTh; return pts;
    };
    // a closed patch (a tube: first and last control column coincide) has its seam at both ends of the parameter range; points that sit exactly on the seam
    // go to the side their neighbours are on, so a loop that crosses the seam closes in the parameter rectangle
    const closedIn = (S, dir, size) => { const nU = S.P.length - 1, nV = S.P[0].length - 1; if (dir === 0) return S.P[0].every((q, j) => len(sub(q, S.P[nU][j])) < 1e-8 * size + 1e-9 && Math.abs(S.w[0][j] - S.w[nU][j]) < 1e-9); return S.P.every((row) => len(sub(row[0], row[nV])) < 1e-8 * size + 1e-9 && true); };
    const seamFix = (S, pieces, size) => {
      const [u0, u1, v0, v1] = sDom(S), flat = []; pieces.forEach((pc) => pc.uv.forEach((q, k) => flat.push({ q, pc, k })));
      [[0, u0, u1], [1, v0, v1]].forEach(([d, lo, hi]) => {
        if (!closedIn(S, d, size)) return; const eps = 1e-9 * (hi - lo) + 1e-12, on = flat.map((x) => Math.abs(x.q[d] - lo) < eps || Math.abs(x.q[d] - hi) < eps), M = flat.length; if (!on.some(Boolean) || on.every(Boolean)) return;
        for (let i = 0; i < M; i++) {
          if (!on[i] || (on[(i + M - 1) % M] && !(false))) { if (!on[i]) continue; }
          if (!on[i]) continue; if (on[(i + M - 1) % M]) continue;                         // start of a run of seam points
          let j = i; while (on[(j + 1) % M]) j++; const before = flat[(i + M - 1) % M].q[d], after = flat[(j + 1) % M].q[d], mid = (lo + hi) / 2;
          const side = (before + after) / 2 < mid ? lo : hi; for (let k = i; k <= j; k++) flat[k % M].q[d] = side;
        }
      });
    };
    const shoe = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

    // ---- cylinder faces: an exact rational patch over the angle / height range of the loops, then the same trimming as any other patch
    const cylPatch = (sf, loops, forceTh0) => {
      const f = sf.f, th = [], ts = []; loops.forEach((l) => l.cs.forEach((c) => N.cSample(c, 360).forEach((q) => { const d = sub(q, f.o); th.push(Math.atan2(dot(d, f.y), dot(d, f.x))); ts.push(dot(d, f.z)); })));
      let tmin = Math.min(...ts), tmax = Math.max(...ts); const pad = (tmax - tmin) * 0.02 + 1e-6; tmin -= pad; tmax += pad;
      const sorted = th.slice().sort((x, y) => x - y); let gap = -1, gi = 0; for (let i = 0; i < sorted.length; i++) { const nx = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI, g = nx - sorted[i]; if (g > gap) { gap = g; gi = i; } }
      const full = gap < 0.02 || forceTh0 !== undefined, th0 = forceTh0 !== undefined ? forceTh0 : full ? thOf(f, N.cEval(loops[0].cs[0], dom(loops[0].cs[0])[0])) : (gi + 1 < sorted.length ? sorted[gi + 1] : sorted[0]), sweep = full ? 2 * Math.PI : 2 * Math.PI - gap, margin = full ? 0 : Math.min(0.02, gap / 4);
      const ar = N.arc(f.o, f.x, f.y, sf.r, th0 - margin, th0 - margin + sweep + 2 * margin);
      // u runs around (rational quadratic arc), v along the axis (degree 1): Su x Sv points away from the axis
      const S = { p: ar.p, q: 1, U: ar.U.slice(), V: [tmin, tmin, tmax, tmax], P: ar.P.map((p) => [add(p, mul(f.z, tmin)), add(p, mul(f.z, tmax))]), w: ar.w.map((w) => [w, w]) };
      S.cyl = { f, th0: th0 - margin, span: sweep + 2 * margin };
      return S;
    };

    const thOf = (f, P) => { const d = sub(P, f.o); return Math.atan2(dot(d, f.y), dot(d, f.x)); };
    const loopTurn = (f, cs) => { let prev = null, first = 0; cs.forEach((c) => N.cSample(c, 48).forEach((q) => { let th = thOf(f, q); if (prev !== null) { while (th - prev > Math.PI) th -= 2 * Math.PI; while (th - prev < -Math.PI) th += 2 * Math.PI; } else first = th; prev = th; })); return prev - first; };
    const axial = (f, cs) => { let s = 0, n = 0; cs.forEach((c) => N.cSample(c, 8).forEach((q) => { s += dot(sub(q, f.o), f.z); n++; })); return s / n; };
    const revLoop = (cs) => cs.slice().reverse().map((c) => N.cReverse(c));
    /** a full cylinder wall bounded by two separate circles (no seam edge): cut the top circle at the seam of the bottom one and join both with two axial lines into ONE loop */
    const joinFullCylinder = (f, loops, size) => {
      const turns = loops.map((l) => loopTurn(f, l.cs)), wraps = turns.map((x) => Math.abs(Math.abs(x) - 2 * Math.PI) < 0.05);
      if (!wraps.some(Boolean)) return null; if (loops.length !== 2 || !wraps.every(Boolean)) throw new Error('a cylinder face of this STEP body wraps around its axis in a way that is not read yet');
      let L = loops.map((l, i) => (turns[i] > 0 ? l.cs : revLoop(l.cs)));                 // both counter-clockwise about the axis
      const order = axial(f, L[0]) <= axial(f, L[1]) ? [0, 1] : [1, 0], bot = L[order[0]], top0 = L[order[1]];
      const th0 = thOf(f, N.cEval(bot[0], dom(bot[0])[0])), p0 = N.cEval(bot[0], dom(bot[0])[0]);
      // rotate the top circle so that it starts where it crosses th0
      let top = top0, run = null, found = -1, tcut = 0; const thetaAt = (c, t, base) => { let th = thOf(f, N.cEval(c, t)); while (th - base > Math.PI) th -= 2 * Math.PI; while (th - base < -Math.PI) th += 2 * Math.PI; return th; };
      let prevTh = thOf(f, N.cEval(top0[0], dom(top0[0])[0])); const startTh = prevTh; const rel = (th) => { let d = (th - th0) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI; return d; };
      if (Math.abs(rel(startTh)) > 1e-7 && Math.abs(rel(startTh) - 2 * Math.PI) > 1e-7) {
        const target = th0 + Math.ceil((startTh - th0) / (2 * Math.PI)) * 2 * Math.PI; let th = startTh;
        for (let k = 0; k < top0.length && found < 0; k++) { const c = top0[k], [a, b] = dom(c), n = 96; let pt = th; for (let i = 1; i <= n; i++) { const t = a + (b - a) * i / n, cur = thetaAt(c, t, pt); if (cur >= target - 1e-12) { let lo = a + (b - a) * (i - 1) / n, hi = t, base = pt; for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (thetaAt(c, mid, base) >= target) hi = mid; else lo = mid; } found = k; tcut = (lo + hi) / 2; break; } pt = cur; } if (found < 0) th = pt; }
        if (found < 0) throw new Error('cannot place the seam of a cylinder face');
        const pieces = N.cSplit(top0[found], tcut); top = [pieces[1]].concat(top0.slice(found + 1), top0.slice(0, found), [pieces[0]]);
      }
      const pTop = N.cEval(top[0], dom(top[0])[0]), seamUp = N.line(p0, pTop);
      void run; void size;
      return [{ cs: bot.concat([seamUp], revLoop(top), [N.cReverse(seamUp)]), outer: true, th0 }];
    };
    // ---- closed B-spline patches: loops that cross the seam, or wind once around (a tube bounded by two circles)
    const invertP = (S, P, guess) => {
      const [u0, u1, v0, v1] = sDom(S), per = u1 - u0, wrapU = (x) => u0 + (((x - u0) % per) + per) % per; let u, v;
      if (guess) { u = guess[0]; v = guess[1]; } else { let bd = Infinity; const G = 24; for (let i = 0; i < G; i++) for (let j = 0; j <= G; j++) { const uu = u0 + per * i / G, vv = v0 + (v1 - v0) * j / G, d = len(sub(N.sEval(S, uu, vv), P)); if (d < bd) { bd = d; u = uu; v = vv; } } }
      for (let it = 0; it < 60; it++) {
        const e = N.sEval(S, wrapU(u), v, true), r = sub(e.p, P), a = dot(e.u, e.u), b = dot(e.u, e.v), c = dot(e.v, e.v), g1 = dot(e.u, r), g2 = dot(e.v, r), det = a * c - b * b; if (Math.abs(det) < 1e-24) break;
        const du = -(c * g1 - b * g2) / det, dv = -(a * g2 - b * g1) / det, nv = Math.min(v1, Math.max(v0, v + dv)); u += du; if (Math.abs(du) < 1e-13 * per && Math.abs(nv - v) < 1e-13 * (v1 - v0)) { v = nv; break; } v = nv;
      }
      return { uv: [u, v], d: len(sub(N.sEval(S, wrapU(u), v), P)) };
    };
    const sampleLoopU = (S, cs) => { const out = []; let g = null; cs.forEach((c) => { const [a, b] = dom(c), n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)); for (let i = 0; i <= n; i++) { const r = invertP(S, N.cEval(c, a + (b - a) * i / n), g); g = r.uv; out.push({ u: r.uv[0], v: r.uv[1], c, t: a + (b - a) * i / n }); } }); return out; };
    const uvLoopClosed = (S, cs, size) => {                       // unwrapped, continuous uv of a loop on a patch closed in u, shifted so that the loop lies inside the parameter range
      const [u0, u1] = sDom(S), per = u1 - u0; let g = null, lo = Infinity, hi = -Infinity;
      const lists = cs.map((c) => { const [a, b] = dom(c), n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)), pts = []; for (let i = 0; i <= n; i++) { const P = N.cEval(c, a + (b - a) * i / n), r = invertP(S, P, g); if (r.d > 2e-3 * size + 1e-6) throw new Error('a STEP edge does not lie on its B-spline face (distance ' + r.d.toExponential(2) + ')'); g = r.uv; if (pts.length && Math.hypot(r.uv[0] - pts[pts.length - 1][0], r.uv[1] - pts[pts.length - 1][1]) < 1e-12) continue; pts.push([r.uv[0], r.uv[1]]); lo = Math.min(lo, r.uv[0]); hi = Math.max(hi, r.uv[0]); } return pts; });
      const sh = Math.floor((lo - u0 + 1e-9 * per) / per) * per; if (hi - sh > u1 + 1e-7 * per) throw new Error('a loop of this STEP face is wider than its closed B-spline patch');
      lists.forEach((pts) => pts.forEach((q) => { q[0] -= sh; if (q[0] > u1) q[0] = u1; if (q[0] < u0) q[0] = u0; }));
      return lists;
    };
    const prepClosed = (S, loops, size) => {
      const [u0, u1] = sDom(S), per = u1 - u0; const smp = loops.map((l) => sampleLoopU(S, l.cs)), turn = smp.map((s) => s[s.length - 1].u - s[0].u), k = turn.map((x) => Math.round(x / per));
      if (k.every((x) => x === 0)) {
        { let lo = Infinity, hi = -Infinity; smp.forEach((s) => s.forEach((x) => { lo = Math.min(lo, x.u); hi = Math.max(hi, x.u); })); if (hi - lo >= per * (1 - 1e-6)) { const us = u0 + (((lo - u0) % per) + per) % per; return (Math.abs(us - u0) < 1e-9 * per || Math.abs(us - u1) < 1e-9 * per) ? { S, loops } : { S: reseamU(S, us), loops }; } }    // the loop spans the whole range (seam edges at both ends)
        const m = []; smp.forEach((s) => s.forEach((x) => m.push((((x.u - u0) % per) + per) % per))); m.sort((a, b) => a - b); let gap = -1, ga = 0; for (let i = 0; i < m.length; i++) { const nx = i + 1 < m.length ? m[i + 1] : m[0] + per, g = nx - m[i]; if (g > gap) { gap = g; ga = m[i]; } }
        const seamIn = ga + gap > per - 1e-12 * per || (ga <= 1e-9 * per && false); if (seamIn || gap < 1e-6 * per) return { S, loops };       // the seam already lies in the empty gap
        return { S: reseamU(S, u0 + (((ga + gap / 2) % per + per) % per)), loops };
      }
      if (loops.length !== 2 || !k.every((x) => Math.abs(x) === 1)) throw new Error('a closed B-spline face of this STEP body wraps around in a way that is not read yet');
      // two rings: the lower one decides where the seam goes
      const cs0 = loops.map((l, i) => (k[i] > 0 ? l.cs : revLoop(l.cs))), vm = cs0.map((cs, i) => { const s = k[i] > 0 ? smp[i] : sampleLoopU(S, cs0[i]); return s.reduce((a, x) => a + x.v, 0) / s.length; });
      const ib = vm[0] <= vm[1] ? 0 : 1, bot = cs0[ib], top0 = cs0[1 - ib], sb = sampleLoopU(S, bot), us = u0 + (((sb[0].u - u0) % per) + per) % per;
      const S2 = Math.abs(us - u0) < 1e-12 * per ? S : reseamU(S, us), sB = sampleLoopU(S2, bot), sT = sampleLoopU(S2, top0);
      // top ring: cut where its (unwrapped) u reaches the end of the range, start there
      let cut = -1; for (let i = 1; i < sT.length; i++) if (sT[i].u >= u1 - 1e-12 * per && sT[i - 1].u < u1 - 1e-12 * per) { cut = i; break; }
      let top = top0; if (cut > 0 && Math.abs(sT[0].u - u0) > 1e-9 * per && Math.abs(sT[0].u - u1) > 1e-9 * per) {
        const hi = sT[cut], lo = sT[cut - 1]; let a = lo.t, b = hi.t, c = hi.c; if (lo.c !== hi.c) { a = dom(hi.c)[0]; } let g = [lo.u, lo.v];
        for (let it = 0; it < 60; it++) { const mid = (a + b) / 2, r = invertP(S2, N.cEval(c, mid), g); if (r.uv[0] >= u1) b = mid; else { a = mid; g = r.uv; } }
        const idx = top0.indexOf(c), parts = N.cSplit(c, (a + b) / 2); top = [parts[1]].concat(top0.slice(idx + 1), top0.slice(0, idx), [parts[0]]);
      }
      const nU = S2.P.length - 1, v0 = S2.V[S2.q], v1 = S2.V[S2.P[0].length], colAt = (i) => N.curve(S2.q, S2.V.slice(), S2.P[i].map((q) => q.slice()), S2.w[i].slice());
      const vb = sB[0].v, vt = invertP(S2, N.cEval(top[0], dom(top[0])[0]), null).uv[1], lo = Math.max(v0, Math.min(vb, vt)), hi = Math.min(v1, Math.max(vb, vt));
      const up = N.cSub(colAt(nU), lo, hi), down = N.cSub(colAt(0), lo, hi);
      return { S: S2, loops: [{ cs: bot.concat([up], revLoop(top), [N.cReverse(down)]), outer: true }] };
    };
    // ---- faces
    const faceOf = (fr, bodyScale) => {
      const f = get(fr); let sf = surface(f.args[2]); const same = !(f.args[3] && f.args[3].en === 'F');
      const loops = f.args[1].map(loopCurves).filter(Boolean); if (!loops.length) throw new Error('a STEP face has no edge loop');
      if (sf.kind === 'plane') {
        const n = same ? sf.n : mul(sf.n, -1);
        // outer loop first, counter-clockwise about the outward normal; holes clockwise
        let order = loops.slice().sort((a, b) => (b.outer ? 1 : 0) - (a.outer ? 1 : 0));
        const L = order.map((l, i) => { const ccw = dot(areaVec(l.cs), n) >= 0; return (ccw === (i === 0)) ? l.cs : l.cs.slice().reverse().map((c) => N.cReverse(c)); });
        return { kind: 'plan', loops: L, n, o: N.cEval(L[0][0], dom(L[0][0])[0]), sign: 1, tag: 'step' + fr.ref, refs: null };
      }
      let loopsU = loops, forceTh0; if (sf.kind === 'cyl') { const j = joinFullCylinder(sf.f, loops, bodyScale); if (j) { loopsU = j; forceTh0 = j[0].th0; } }
      if (sf.kind === 'bs' && closedIn(sf.S, 0, bodyScale)) { const pc = prepClosed(sf.S, loops, bodyScale); sf = Object.assign({}, sf, { S: pc.S }); loopsU = pc.loops; }
      const S = sf.kind === 'bs' ? sf.S : cylPatch(sf, loopsU, forceTh0), sign = same ? 1 : -1, size = bodyScale;
      const closedPath = sf.kind === 'bs' && closedIn(S, 0, size);
      const built = loopsU.map((l) => {
        let carryTh; const uvl = closedPath ? uvLoopClosed(S, l.cs, size) : null, pieces = l.cs.map((c, ci) => { if (uvl) return { type: 'c', c3: c, uv: uvl[ci] }; const uv = uvOfCurve(S, c, size, carryTh); carryTh = uv.lastTh; return { type: 'c', c3: c, uv }; }), poly = []; if (!closedPath) seamFix(S, pieces, size); pieces.forEach((pc) => pc.uv.slice(0, -1).forEach((q) => poly.push(q)));
        const f0 = pieces[0].uv[0], l0 = pieces[pieces.length - 1].uv[pieces[pieces.length - 1].uv.length - 1], [a0, a1, b0, b1] = sDom(S);
        if (Math.abs(f0[0] - l0[0]) > 1e-6 * (a1 - a0) + 1e-9 || Math.abs(f0[1] - l0[1]) > 1e-6 * (b1 - b0) + 1e-9) throw new Error('a face of this STEP body wraps around a closed surface (a full cylinder wall or a periodic B-spline); split it at a seam first, this is not read yet');
        return { pieces, poly, outer: l.outer, area: shoe(poly) };
      });
      let oi = built.findIndex((b) => b.outer); if (oi < 0) { let m = 0; built.forEach((b, i) => { if (Math.abs(b.area) > Math.abs(built[m].area)) m = i; }); oi = m; }
      const ordered = [built[oi]].concat(built.filter((_, i) => i !== oi));
      const out = ordered.map((b, i) => {
        let pieces = b.pieces; const ccw = b.area >= 0; if (ccw !== (i === 0)) pieces = pieces.slice().reverse().map((pc) => ({ type: 'c', c3: N.cReverse(pc.c3), uv: pc.uv.slice().reverse() }));
        return { pieces: pieces.map((pc) => ({ type: 'c', uvC: N.interp(pc.uv.map((q) => [q[0], q[1], 0]), Math.min(3, pc.uv.length - 1)), c3: pc.c3, plane: -1 })) };
      });
      return { kind: 'trim', surf: S, sign, tag: 'step' + fr.ref, loops: out };
    };

    const solids = [];
    for (const [id, e] of ents) {
      if (!e || e.type !== 'MANIFOLD_SOLID_BREP') continue; const sh = get(e.args[1]); if (sh.type !== 'CLOSED_SHELL') continue;
      const refs = sh.args[1], free = refs.some((fr) => { const sf = get(get(fr).args[2]); return /B_SPLINE_SURFACE|UNIFORM_SURFACE|BEZIER_SURFACE/.test(typeOf(sf)); });
      solids.push({ id, name: e.args[0] || ('solid' + id), free: free || !!(ropts && ropts.all), make: () => {
        let sc = 1; try { const bb = [Infinity, -Infinity]; refs.forEach((fr) => { const f = get(fr); f.args[1].forEach((b) => { const lp = get(get(b).args[1]); if (lp.type === 'EDGE_LOOP') lp.args[1].forEach((or) => { const c = edgeCurve(get(or).args[3]); const q = N.cEval(c, dom(c)[0]); bb[0] = Math.min(bb[0], q[0], q[1], q[2]); bb[1] = Math.max(bb[1], q[0], q[1], q[2]); }); }); }); sc = Math.max(1, bb[1] - bb[0]); } catch (er) { sc = 1; }
        const faces = refs.map((fr) => faceOf(fr, sc));
        const res = { kind: 'skin', op: 'import', faces, topo: { type: 'brep' }, stepName: e.args[0] || ('solid' + id) }, c = N.check(res, false);
        if (!c.ok) { if (c.volume < 0) { faces.forEach((f) => { f.sign = -f.sign; if (f.kind === 'plan') { f.n = mul(f.n, -1); f.loops = f.loops.map((l) => l.slice().reverse().map((cc) => N.cReverse(cc))); } }); } const c2 = N.check(res, false); if (!c2.ok) throw new Error('the free-form faces of this STEP body do not close into a solid (' + c.issues.join('; ') + ')'); }
       
        return res; } });
    }
    return solids;
  }

  const has = (text) => /B_SPLINE_SURFACE|UNIFORM_SURFACE|BEZIER_SURFACE/.test(text);
  const asText = (t) => (typeof t === 'string' ? t : new TextDecoder().decode(t));
  const oldAll = K.stepImportAll;
  K.stepImportAll = function (text) {
    const t = asText(text); if (!has(t)) return oldAll.call(this, t);
    const solids = readStep(t), free = solids.filter((s) => s.free); let analytic = [];
    if (solids.some((s) => !s.free)) { AK.__stepTol = true; try { analytic = oldAll.call(this, t); } finally { AK.__stepTol = false; } }
    return analytic.concat(free.map((s) => { const h = s.make(); return h; }));
  };
  K.stepImport = function (text) { const L = K.stepImportAll(text); if (!L.length) throw new Error('the STEP file contains no MANIFOLD_SOLID_BREP'); return L[0]; };

  // ---------------------------------------------------------------- editing of imported solids
  const isImp = (s) => !!(s && s.faces && s.topo && s.op === 'import');
  const planArea = (f) => { let t = 0; f.loops.forEach((l, i) => { const pts = []; l.forEach((c) => N.cSample(c, 400).slice(0, -1).forEach((q) => pts.push(q))); let a = [0, 0, 0]; for (let k = 1; k + 1 < pts.length; k++) a = add(a, cross(sub(pts[k], pts[0]), sub(pts[k + 1], pts[0]))); t += Math.abs(dot(a, f.n)) * 0.5 * (i === 0 ? 1 : -1); }); return t; };
  function moveImported(sol, idx, dist) {
    const f = sol.faces[idx]; if (!f || f.kind !== 'plan' || !(Math.abs(dist) > 1e-12)) return null; const n = unit(f.n), v0 = N.massProps(sol, 1).volume, A = planArea(f);
    if (dist > 0) {
      const faces = sol.faces.filter((_, i) => i !== idx).map((g) => g), sh = mul(n, dist);
      f.loops.forEach((l) => l.forEach((c) => { const S = { p: c.p, q: 1, U: c.U.slice(), V: [0, 0, 1, 1], P: c.P.map((P) => [P.slice(), add(P, sh)]), w: c.w.map((w) => [w, w]) }; faces.push({ kind: 'side', surf: S, sign: 1, tag: 'move' + idx + '_wall' }); }));
      faces.push({ kind: 'plan', loops: f.loops.map((l) => l.map((c) => N.cMap(c, (P) => add(P, sh)))), n: f.n, o: add(f.o, sh), sign: 1, tag: f.tag, refs: null });
      const res = { kind: 'skin', op: 'import', faces, topo: { type: 'brep' }, stepName: sol.stepName }; let c = N.check(res, false);
      if (!c.ok) { faces.forEach((g) => { if (g.kind === 'side') g.sign = -1; }); c = N.check(res, false); }
      return c.ok && Math.abs(c.volume - (v0 + A * dist)) < 2e-4 * Math.max(1, v0) ? res : null;
    }
    // inward: only a plane cut when every other face lies behind the moved plane, and every B-spline face is a whole patch (its loop is the border of the parameter rectangle)
    const whole = (g) => { if (g.kind !== 'trim') return true; const [u0, u1, v0, v1] = [g.surf.U[g.surf.p], g.surf.U[g.surf.P.length], g.surf.V[g.surf.q], g.surf.V[g.surf.P[0].length]], eu = 1e-7 * (u1 - u0), ev = 1e-7 * (v1 - v0);
      return g.loops.length === 1 && g.loops[0].pieces.every((pc) => pc.uvC && N.cSample(pc.uvC, 12).every((q) => Math.abs(q[0] - u0) < eu || Math.abs(q[0] - u1) < eu || Math.abs(q[1] - v0) < ev || Math.abs(q[1] - v1) < ev)); };
    if (!sol.faces.every(whole)) return null;
    sol = Object.assign({}, sol, { faces: sol.faces.map((g) => (g.kind === 'trim' ? { kind: 'side', surf: g.surf, sign: g.sign, tag: g.tag } : g)) }); delete sol.src;
    const p2 = add(f.o, mul(n, dist)), d2 = dot(n, p2); let behind = true;
    sol.faces.forEach((g, i) => { if (i === idx) return; const pts = []; if (g.kind === 'plan') g.loops.forEach((l) => l.forEach((c) => N.cSample(c, 8).forEach((q) => pts.push(q)))); else if (g.surf) { g.surf.P.forEach((r) => r.forEach((q) => pts.push(q))); } pts.forEach((q) => { if (dot(n, q) > dot(n, f.o) + 1e-7 * (1 + len(q))) behind = false; }); });
    if (!behind) return null;
    let r; try { r = N.planeCut(sol, p2, n); } catch (e) { return null; } if (!r) return null; const c = N.check(r, false);
    r.op = 'import'; r.stepName = sol.stepName; return c.ok && c.volume > 0 && c.volume < v0 ? r : null;
  }
  const oldMove = N.moveFace; N.moveFace = function (sol, idx, dist) { return isImp(sol) ? moveImported(sol, idx, dist) : oldMove.call(this, sol, idx, dist); };
  const oldDel = N.deleteFace; N.deleteFace = function (sol, idx) { return isImp(sol) ? null : oldDel.call(this, sol, idx); };
  AK.stepFree = K.stepFree = { read: readStep, has, moveImported };
})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);
