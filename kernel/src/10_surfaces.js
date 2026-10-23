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
