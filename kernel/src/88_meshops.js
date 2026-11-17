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
})(window.AakarKernel);
