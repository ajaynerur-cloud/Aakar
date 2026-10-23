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
