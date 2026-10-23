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
    if (T.det() <= 0) throw new Error('mirror transforms are not supported');
    const vmap = new Map(), emap = new Map();
    const faces = this.faces.map(f => new Face(f.surf.xf(T), f.rev, f.loops.map(l => l.map(c => { let e = emap.get(c.edge); if (!e) { e = c.edge.xf(T, vmap); emap.set(c.edge, e); } return { edge: e, fwd: c.fwd }; }))));
    this.faces.forEach((f, i) => { if (f.tris) faces[i].tris = f.tris.map(t => t.map(p => T.p(p))); });
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
