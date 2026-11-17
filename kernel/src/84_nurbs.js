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
  const asSection = (s) => (Array.isArray(s) ? s : [s]);
  /** extrude a closed (composite) profile along a vector: exact (ruled) surfaces */
  function extrude(profile, vec, opts) {
    opts = opts || {}; const sec0 = asSection(profile); checkClosed(sec0, 'extrude');
    const sec1 = sec0.map((c) => cMap(c, (P) => add(P, vec)));
    return skinSolid([sec0, sec1], opts, 'extrude', 1);
  }
  /** loft closed (composite) sections: sections are arrays of segment curves (one curve = one closed section), same number of segments each */
  function loft(sections, opts) {
    opts = opts || {}; const secs = sections.map(asSection); if (secs.length < 2) throw new Error('loft needs at least two sections');
    secs.forEach((s) => { checkClosed(s, 'loft'); if (s.length !== secs[0].length) throw new Error('loft: all sections need the same number of segments'); });
    return skinSolid(secs, opts, 'loft', opts.degree);
  }
  /** sweep a closed profile along a path (a curve, or an array of points): the profile is carried by a rotation-minimising frame, with optional twist (radians over the whole path) */
  function sweep(profile, path, opts) {
    opts = opts || {}; const seg0 = asSection(profile); checkClosed(seg0, 'sweep'); const pc = Array.isArray(path) ? interp(path, 3) : path, steps = Math.max(2, opts.steps || 24), [a, b] = dom(pc);
    const ts = []; for (let i = 0; i <= steps; i++) ts.push(a + (b - a) * i / steps);
    const T = ts.map((t) => unit(cEval(pc, t, true).d)), O = ts.map((t) => cEval(pc, t));
    // double-reflection rotation-minimising frames (Wang et al.)
    const R = [], S0 = (() => { const t = T[0], h = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return unit(cross(h, t)); })(); R.push(S0);
    for (let i = 0; i < steps; i++) { const v1 = sub(O[i + 1], O[i]), c1 = dot(v1, v1), rL = sub(R[i], mul(v1, 2 * dot(v1, R[i]) / c1)), tL = sub(T[i], mul(v1, 2 * dot(v1, T[i]) / c1)), v2 = sub(T[i + 1], tL), c2 = dot(v2, v2); R.push(c2 > 1e-24 ? sub(rL, mul(v2, 2 * dot(v2, rL) / c2)) : rL); }
    const frame = (i) => { const s = unit(R[i]), r = cross(T[i], s); return { o: O[i], t: T[i], s, r }; };   // (s, r, t) is right handed
    const F0 = frame(0), c0 = opts.ref || centroidOf(seg0), tw = opts.twist || 0;
    const secs = ts.map((_, i) => { const F = frame(i), th = tw * i / steps, cs = Math.cos(th), sn = Math.sin(th);
      const map = (P) => { const d = sub(P, c0), x = dot(d, F0.s), y = dot(d, F0.r), z = dot(d, F0.t), x2 = x * cs - y * sn, y2 = x * sn + y * cs; return add(F.o, add(mul(F.s, x2), add(mul(F.r, y2), mul(F.t, z)))); };
      return seg0.map((c) => cMap(c, map)); });
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
    sol.faces.forEach((f) => integrate(f.surf, f.sign, (p, nv, w) => {
      V += dot(p, nv) / 3 * w; A += len(nv) * w;
      for (let a = 0; a < 3; a++) { M[a] += 0.5 * p[a] * p[a] * nv[a] * w; S2[a][a] += p[a] * p[a] * p[a] / 3 * nv[a] * w; for (let b = a + 1; b < 3; b++) S2[a][b] += 0.5 * p[a] * p[a] * p[b] * nv[a] * w; }
    }, sub2));
    const c = V ? mul(M, 1 / V) : [0, 0, 0], xx = S2[0][0], yy = S2[1][1], zz = S2[2][2], xy = S2[0][1], xz = S2[0][2], yz = S2[1][2];
    const Io = [[yy + zz, -xy, -xz], [-xy, xx + zz, -yz], [-xz, -yz, xx + yy]], c2 = dot(c, c), I = Io.map((r, i) => r.map((x, j) => x - V * ((i === j ? c2 : 0) - c[i] * c[j])));
    return { volume: V, area: A, centroid: c, inertia: I, exact: true };
  }
  /** closure test: the oriented area vectors of all faces must add up to zero; the volume must be positive */
  function check(sol, throwing) {
    let a = [0, 0, 0], tot = 0; sol.faces.forEach((f) => { integrate(f.surf, f.sign, (p, nv, w) => { a = add(a, mul(nv, w)); tot += len(nv) * w; }, 1); });
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
  function mesh(sol, n) {
    n = n || 8; const tris = [];
    sol.faces.forEach((f) => {
      const S = f.surf, [u0, u1, v0, v1] = sDom(S);
      if (f.kind === 'cap') { return; }
      const grid = (a, b, ks) => { const k = [...new Set(ks.filter((x) => x >= a - 1e-14 && x <= b + 1e-14))].sort((x, y) => x - y), o = [k[0]]; for (let i = 0; i + 1 < k.length; i++) { for (let j = 1; j <= n; j++) o.push(k[i] + (k[i + 1] - k[i]) * j / n); } return o; };
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
    const loopOf = (list, ccw) => { const L = ccw ? list : list.slice().reverse().map(([e, f]) => [e, !f]); return E(`FACE_OUTER_BOUND('',${E(`EDGE_LOOP('',(${L.map(([e, f]) => oe(e, f)).join(',')}))`)},.T.)`); };
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
    const mapC = (c) => cMap(c, Mp), T = sol.topo, nt = Object.assign({}, T);
    if (T.type === 'skin') { nt.sections = T.sections.map((sec) => sec.map(mapC)); nt.sides = T.sides.map(mapS); }
    else { nt.segs = T.segs.map(mapC); nt.endSegs = T.full ? nt.segs : T.endSegs.map(mapC); nt.surf = T.surf.map(mapS); nt.o = Mp(T.o); nt.ax = unit(Md(T.ax)); nt.sign = T.sign * flip; }
    return { kind: sol.kind, op: sol.op, topo: nt, faces: sol.faces.map((f) => Object.assign({}, f, { surf: mapS(f.surf), sign: f.sign * flip, n: f.n ? unit(Md(f.n)) : f.n })) };
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
  const isN = (h) => !!(h && h.faces && h.topo && h.kind && h.faces[0] && h.faces[0].surf);
  function indexedMesh(sol, n) {
    const pos = [], ind = [], fid = [], map = new Map(), tol = 1e-9; let k = 0;
    const faceTris = (f, ix) => mesh({ faces: [f] }, n).map((t) => ({ t, ix }));
    const vid = (p) => { const key = Math.round(p[0] / 1e-7) + ',' + Math.round(p[1] / 1e-7) + ',' + Math.round(p[2] / 1e-7); let i = map.get(key); if (i === undefined) { i = pos.length / 3; pos.push(p[0], p[1], p[2]); map.set(key, i); } return i; };
    const sides = sol.faces.filter((f) => f.kind !== 'cap'); sides.forEach((f, ix) => faceTris(f, sol.faces.indexOf(f)).forEach(({ t, ix: i }) => { const a = vid(t[0]), b = vid(t[1]), c = vid(t[2]); if (a === b || b === c || a === c) return; ind.push(a, b, c); fid.push(i); }));
    const capFaces = sol.faces.filter((f) => f.kind === 'cap'); if (capFaces.length) { const all = mesh({ faces: capFaces }, n), owner = {}; capFaces.forEach((f) => { owner[f.tag.split('_')[0]] = sol.faces.indexOf(f); }); const groups = {}; capFaces.forEach((f) => { const g = f.tag.split('_')[0]; (groups[g] = groups[g] || []).push(f); }); void groups; all.forEach((t) => { const a = vid(t[0]), b = vid(t[1]), c = vid(t[2]); if (a === b || b === c || a === c) return; const cen = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3]; let best = capFaces[0], bd = Infinity; capFaces.forEach((f) => { const q = f.surf.P[0][0], d = Math.abs(dot(sub(cen, q), f.n)); if (d < bd) { bd = d; best = f; } }); ind.push(a, b, c); fid.push(sol.faces.indexOf(best)); }); }
    void k; void tol; return { positions: pos, indices: ind, faces: fid };
  }
  const infoOf = (sol) => { const faces = {}, edges = {}; sol.faces.forEach((f) => { const kd = f.kind === 'cap' ? 'plane' : 'bspline'; faces[kd] = (faces[kd] || 0) + 1; }); return { faces, edges, freeform: true, faceCount: sol.faces.length }; };
  // the kernel facade (volume, area, mesh, STEP ...) accepts freeform solids too, so recipes and the app can treat them like any other exact body
  const wrap = (name, fn) => { const o = K[name]; if (typeof o === 'function' && !o.__nurbsWrapped) { const w = function (h, ...a) { return isN(h) ? fn(h, ...a) : o.call(this, h, ...a); }; w.__nurbsWrapped = true; K[name] = w; } };
  wrap('volume', (h) => massProps(h).volume); wrap('area', (h) => massProps(h).area); wrap('massProps', (h) => massProps(h)); wrap('validate', (h) => { const c = check(h); return { ok: c.ok, issues: c.issues, counts: { faces: h.faces.length } }; });
  wrap('info', (h) => infoOf(h)); wrap('mesh', (h, tol) => indexedMesh(h, tol && tol < 0.01 ? 32 : 16)); wrap('stepExport', (h, o) => stepWrite(h, o));
  wrap('bbox', (h) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; mesh(h, 6).forEach((t) => t.forEach((p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } })); return { min: mn, max: mx }; });
  wrap('translate', (h, d) => xfSolid(h, [1, 0, 0, 0, 1, 0, 0, 0, 1], d)); wrap('transform', (h, M, t) => xfSolid(h, M, t || [0, 0, 0]));
  AK.nurbs = K.nurbs = { line, polyline, arc, circle, interp, fromControl, curve, cEval, sEval, cSample, cReverse, cMap, extrude, revolve, loft, sweep, sweepPieces, massProps, check, mesh, indexedMesh, stepWrite, xf: xfSolid, fromSpec, isNurbs: isN, version: '1.4.0' };
  K.features = (K.features || []).concat(['nurbs-curves', 'nurbs-solids', 'nurbs-massprops', 'nurbs-step']);
})(window.AakarKernel);
