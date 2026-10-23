// ---------------------------------------------------------------- lazy model nodes + evaluation
const RES_EXACT = { tol: null, rel: 4e-3, minN: 32 };
const resKey = (r) => (r.tol == null ? 'n' : r.tol.toPrecision(4)) + '|' + r.rel + '|' + r.minN + (r.light ? '|L' : '');
class Node {
  constructor(kind, d) { this.kind = kind; Object.assign(this, d); this.cache = new Map(); this.id = ++NID; }
}
let NID = 0;
function soupBBox(soup) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; soup.forEach(t => t.pts.forEach(p => { for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } })); return { min: mn, max: mx }; }
const soupVolume = (soup) => { let v = 0; soup.forEach(t => { v += V.dot(t.pts[0], V.cross(t.pts[1], t.pts[2])) / 6; }); return v; };
function evaluate(node, res) {
  res = res || RES_EXACT; const k = resKey(res); let ev = node.cache.get(k); if (ev) return ev;
  if (node.kind === 'prim') { const soup = node.prim.tess(res); ev = { body: node.prim.body, soup }; }
  else if (node.kind === 'xf') {
    const c = evaluate(node.child, res), b = c.body.xf(node.T), idx = new Map(c.body.faces.map((f, i) => [f, i]));
    const mp = (L) => L.map(t => ({ pts: t.pts.map(p => node.T.p(p)), tag: b.faces[idx.get(t.tag)] })); ev = { body: b, soup: mp(c.soup), dsoup: c.dsoup ? mp(c.dsoup) : null };
  } else if (node.kind === 'bool') {
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
    ev = { body: r.body, soup, dsoup, scale, mp };
  } else if (node.kind === 'brep') { ev = { body: node.body, soup: null, dsoup: null }; }
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
