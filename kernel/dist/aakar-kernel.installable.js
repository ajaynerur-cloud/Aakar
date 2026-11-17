(function(){
'use strict';
var g=typeof window!=='undefined'?window:globalThis,T=Object.create(g);
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
    const EC = G.CAD && G.CAD.solid && G.CAD.solid.earcut; if (!EC) throw new Error('triangulator missing');
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
    const EC = G.CAD && G.CAD.solid && G.CAD.solid.earcut; if (!EC) throw new Error('triangulator missing');
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
  } else if (node.kind === 'brep') { ev = { body: node.body, soup: node.soupFixed || null, dsoup: null, mp: node.soupFixed ? null : undefined }; if (node.soupFixed) delete ev.mp; }
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
function stepRead(text) {
  const ents = stepParse(text), memo = new Map();
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
    const e = get(r); const v0 = vert(e.args[1]), v1 = vert(e.args[2]), cur = get(e.args[3]), same = !(e.args[4] && e.args[4].en === 'F'), t = typeOf(cur);
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
    const faces = sh.args[1].map(fr_ => {
      const f = get(fr_), surf = surface(f.args[2]), rev = f.args[3] && f.args[3].en === 'F';
      const loops = f.args[1].map(br => {
        const b = get(br), lp = get(b.args[1]); if (lp.type !== 'EDGE_LOOP') throw new Error('unsupported face bound ' + lp.type);
        let ces = lp.args[1].map(or => { const o = get(or), ed = edge(o.args[3]), fwd = !(o.args[4] && o.args[4].en === 'F'); return { edge: ed, fwd }; });
        if (b.args[2] && b.args[2].en === 'F') ces = ces.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd }));
        return ces;
      });
      return new Face(surf, rev, loops);
    });
    bodies.push({ body: new Body(faces), name: e.args[0] || ('solid' + id) });
  }
  if (!bodies.length) throw new Error('the STEP file contains no MANIFOLD_SOLID_BREP');
  return bodies;
}
AK.stepWrite = stepWrite; AK.stepRead = stepRead;

// ---------------------------------------------------------------- public kernel interface (the contract Aakar's exact-kernel panel expects, plus analysis extras)
AK.version = '1.3.0';
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
  const EC = G.CAD && G.CAD.solid && G.CAD.solid.earcut;
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
  stepImportAll: (text) => stepRead(typeof text === 'string' ? text : new TextDecoder().decode(text)).map(x => mkNode('brep', { body: x.body, name: x.name }))
};
AK.kernel = kernel;
AK.init = () => Promise.resolve(kernel);
AK.Node = Node;

G.AakarKernel = AK;
})(T);
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
  function lineCutter(s, type, size, v) {
    const nA = unit(s.nA), nB = unit(s.nB); need(Math.abs(dot(nA, nB)) < 1e-4, 'only right-angle edges can be rounded exactly');
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
  K.roundEdge = (h, spec, type, size, tol) => {
    let last = null;
    if (spec.kind === 'circle' && type === 'fillet' && K.roundRim) { try { const node = K.roundRim(h, spec, size); K.volume(node); K.mesh(node, size * 0.05); return node; } catch (e) { last = e; } }
    for (const v of (spec.kind === 'circle' && type === 'fillet' ? VARIANTS_FILLET_CIRCLE : VARIANTS_LINE)) { try { const node = K.cut(h, K.roundCutter(spec, type, size, v)); K.volume(node); [size * 0.05, size * 0.01, size * 0.002].concat(tol > 0 ? [tol] : []).forEach((t) => K.mesh(node, t)); return node; } catch (e) { last = e; if (/only right-angle|more than twice|smaller than the round|wider than the circle|positive|no length/.test(e.message)) throw e; } }
    throw last;
  };
  K.features = (K.features || []).concat(['round-edges', 'round-rim-torus', 'mirror', 'polyhedron', 'trimmed-torus-massprops', 'boolean-retry']);
  K.version = AK.version = '1.3.0';
})(T.AakarKernel);
g.AakarKernelInstalled=T.AakarKernel;
if(typeof module!=='undefined'&&module.exports)module.exports=T.AakarKernel;
})();
