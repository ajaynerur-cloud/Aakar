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
