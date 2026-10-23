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
