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
