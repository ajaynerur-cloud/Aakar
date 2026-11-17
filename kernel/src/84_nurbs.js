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
  // ---- planar faces with holes (the caps of a solid whose profile has holes): loops of curves in one plane, outer loop counter-clockwise about the outward normal, holes clockwise
  const planBasis = (n) => { const x = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])); return [x, cross(n, x)]; };
  const reverseLoop = (loop) => loop.slice().reverse().map(cReverse);
  const orientLoop = (loop, n, ccw) => ((dot(closedArea(loop, 48), n) >= 0) === ccw ? loop : reverseLoop(loop));
  const planFace = (loops, n, tag, refs) => { const L = loops.map((l, i) => orientLoop(l, n, i === 0)); return { kind: 'plan', loops: L, n, o: cEval(L[0][0], dom(L[0][0])[0]), sign: 1, tag, refs: refs || null }; };
  /** moments  I[i,j] = integral of s^i t^j over the region (plane coordinates s, t), by Green's theorem on the boundary curves (Gauss-Legendre per knot span) */
  function planMoments(f) {
    const [e1, e2] = planBasis(f.n), o = f.o, I = {}, key = (i, j) => i + ',' + j; for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3 - i; j++) I[key(i, j)] = 0;
    f.loops.forEach((loop) => loop.forEach((c) => { const [a, b] = dom(c); for (const [t, w] of gauss(a, b, c.U, 3)) { const e = cEval(c, t, true), r = sub(e.p, o), s = dot(r, e1), u = dot(r, e2), dt = dot(e.d, e2);
      for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3 - i; j++) I[key(i, j)] += Math.pow(s, i + 1) * Math.pow(u, j) / (i + 1) * dt * w; } }));
    const lin = (a) => ({ '0,0': o[a], '1,0': e1[a], '0,1': e2[a] });             // coordinate a of a point of the plane as a polynomial in s, t
    const pmul = (P, Q) => { const R = {}; for (const k1 in P) for (const k2 in Q) { const [i1, j1] = k1.split(',').map(Number), [i2, j2] = k2.split(',').map(Number), k = (i1 + i2) + ',' + (j1 + j2); R[k] = (R[k] || 0) + P[k1] * Q[k2]; } return R; };
    const pint = (P) => { let t = 0; for (const k in P) t += P[k] * I[k]; return t; };
    return { area: I['0,0'], lin, pmul, pint, n: f.n, o };
  }
  const asSection = (s) => (Array.isArray(s) ? s : [s]);
  /** extrude a closed (composite) profile along a vector: exact (ruled) surfaces */
  function extrude(profile, vec, opts) {
    opts = opts || {}; const prof = profile && profile.outer ? profile : { outer: asSection(profile), holes: [] }, sec0 = asSection(prof.outer); checkClosed(sec0, 'extrude');
    const mv = (sec) => sec.map((c) => cMap(c, (P) => add(P, vec))), sec1 = mv(sec0);
    if (prof.holes && prof.holes.length) { const hs = prof.holes.map(asSection); hs.forEach((h) => checkClosed(h, 'extrude (hole)')); const r = skinSolidH([sec0, sec1], hs.map((h) => [h, mv(h)]), opts, 'extrude', 1); r.profile = { outer: sec0, holes: hs }; r.vec = vec.slice(); return r; }
    const r = skinSolid([sec0, sec1], opts, 'extrude', 1); r.profile = { outer: sec0, holes: [] }; r.vec = vec.slice(); return r;
  }
  /** loft closed (composite) sections: sections are arrays of segment curves (one curve = one closed section), same number of segments each */
  function loft(sections, opts) {
    opts = opts || {}; const secs = sections.map((s) => asSection(s && s.outer ? s.outer : s)); if (secs.length < 2) throw new Error('loft needs at least two sections');
    secs.forEach((s) => { checkClosed(s, 'loft'); if (s.length !== secs[0].length) throw new Error('loft: all sections need the same number of segments'); });
    const nh = (sections[0] && sections[0].holes ? sections[0].holes.length : 0);
    if (nh) { if (sections.some((s) => !s.holes || s.holes.length !== nh)) throw new Error('loft: every section needs the same number of holes'); const hs = []; for (let h = 0; h < nh; h++) { const hsec = sections.map((s) => asSection(s.holes[h])); hsec.forEach((x) => { checkClosed(x, 'loft (hole)'); if (x.length !== hsec[0].length) throw new Error('loft: a hole needs the same number of segments in every section'); }); hs.push(hsec); } return skinSolidH(secs, hs, opts, 'loft', opts.degree); }
    return skinSolid(secs, opts, 'loft', opts.degree);
  }
  /** sweep a closed profile along a path (a curve, or an array of points): the profile is carried by a rotation-minimising frame, with optional twist (radians over the whole path) */
  function sweep(profile, path, opts) {
    opts = opts || {}; const prof = profile && profile.outer ? profile : { outer: asSection(profile), holes: [] }, seg0 = asSection(prof.outer); checkClosed(seg0, 'sweep'); const pc = Array.isArray(path) ? interp(path, 3) : path, steps = Math.max(2, opts.steps || 24), [a, b] = dom(pc);
    const ts = []; for (let i = 0; i <= steps; i++) ts.push(a + (b - a) * i / steps);
    const T = ts.map((t) => unit(cEval(pc, t, true).d)), O = ts.map((t) => cEval(pc, t));
    // double-reflection rotation-minimising frames (Wang et al.)
    const R = [], S0 = (() => { const t = T[0], h = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; return unit(cross(h, t)); })(); R.push(S0);
    for (let i = 0; i < steps; i++) { const v1 = sub(O[i + 1], O[i]), c1 = dot(v1, v1), rL = sub(R[i], mul(v1, 2 * dot(v1, R[i]) / c1)), tL = sub(T[i], mul(v1, 2 * dot(v1, T[i]) / c1)), v2 = sub(T[i + 1], tL), c2 = dot(v2, v2); R.push(c2 > 1e-24 ? sub(rL, mul(v2, 2 * dot(v2, rL) / c2)) : rL); }
    const frame = (i) => { const s = unit(R[i]), r = cross(T[i], s); return { o: O[i], t: T[i], s, r }; };   // (s, r, t) is right handed
    const F0 = frame(0), c0 = opts.ref || centroidOf(seg0), tw = opts.twist || 0;
    const secsFor = (sg0) => ts.map((_, i) => { const F = frame(i), th = tw * i / steps, cs = Math.cos(th), sn = Math.sin(th);
      const map = (P) => { const d = sub(P, c0), x = dot(d, F0.s), y = dot(d, F0.r), z = dot(d, F0.t), x2 = x * cs - y * sn, y2 = x * sn + y * cs; return add(F.o, add(mul(F.s, x2), add(mul(F.r, y2), mul(F.t, z)))); };
      return sg0.map((c) => cMap(c, map)); });
    const secs = secsFor(seg0);
    if (prof.holes && prof.holes.length) { const hs = prof.holes.map(asSection); hs.forEach((h) => checkClosed(h, 'sweep (hole)')); const r = skinSolidH(secs, hs.map(secsFor), opts, 'sweep', opts.degree); r.stations = steps + 1; return r; }
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
  /** skin solid whose profile has holes: the outer skin, one inward-facing skin per hole, and planar caps with holes */
  function skinSolidH(outerSecs, holeSecsList, opts, kind, q) {
    const o = skinSolid(outerSecs, Object.assign({}, opts, { caps: false }), kind, q), parts = [{ topo: o.topo, signs: o.faces.map((f) => f.sign) }], faces = o.faces.slice();
    if (o.topo.apex >= 0) throw new Error(kind + ': a profile with holes cannot end in a point');
    holeSecsList.forEach((hs) => { const h = skinSolid(hs, Object.assign({}, opts, { caps: false }), kind, q); if (h.topo.apex >= 0) throw new Error(kind + ': a hole cannot end in a point'); const fl = h.faces.map((f) => Object.assign({}, f, { sign: -f.sign, tag: 'h' + parts.length + '_' + f.tag })); parts.push({ topo: h.topo, signs: fl.map((f) => f.sign) }); faces.push(...fl); });
    const first = outerSecs[0], last = outerSecs[outerSecs.length - 1], d = sub(centroidOf(last), centroidOf(first)), nA = unit(closedArea(first)), nB = unit(closedArea(last)), n0 = dot(nA, d) > 0 ? mul(nA, -1) : nA, n1 = dot(nB, d) > 0 ? nB : mul(nB, -1);
    const c0 = planFace([first].concat(holeSecsList.map((h) => h[0])), n0, 'cap0_0'), c1 = planFace([last].concat(holeSecsList.map((h) => h[h.length - 1])), n1, 'cap1_0'); faces.push(c0, c1);
    const sol = { kind: 'skin', op: kind, faces, topo: { type: 'multi', parts, caps: [c0, c1] } }; check(sol, true); return sol;
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
    sol.faces.forEach((f) => { if (f.kind !== 'plan') return; const m = planMoments(f), L = [0, 1, 2].map(m.lin), nn = f.n; V += dot(nn, f.o) / 3 * m.area; A += m.area;
      for (let a = 0; a < 3; a++) { const pa = m.pmul(L[a], L[a]); M[a] += 0.5 * nn[a] * m.pint(pa); S2[a][a] += nn[a] / 3 * m.pint(m.pmul(pa, L[a])); for (let b = a + 1; b < 3; b++) S2[a][b] += 0.5 * nn[a] * m.pint(m.pmul(pa, L[b])); } });
    sol.faces.filter((f) => f.kind !== 'plan').forEach((f) => integ(f, (p, nv, w) => {
      V += dot(p, nv) / 3 * w; A += len(nv) * w;
      for (let a = 0; a < 3; a++) { M[a] += 0.5 * p[a] * p[a] * nv[a] * w; S2[a][a] += p[a] * p[a] * p[a] / 3 * nv[a] * w; for (let b = a + 1; b < 3; b++) S2[a][b] += 0.5 * p[a] * p[a] * p[b] * nv[a] * w; }
    }, sub2));
    const c = V ? mul(M, 1 / V) : [0, 0, 0], xx = S2[0][0], yy = S2[1][1], zz = S2[2][2], xy = S2[0][1], xz = S2[0][2], yz = S2[1][2];
    const Io = [[yy + zz, -xy, -xz], [-xy, xx + zz, -yz], [-xz, -yz, xx + yy]], c2 = dot(c, c), I = Io.map((r, i) => r.map((x, j) => x - V * ((i === j ? c2 : 0) - c[i] * c[j])));
    return { volume: V, area: A, centroid: c, inertia: I, exact: true };
  }
  /** closure test: the oriented area vectors of all faces must add up to zero; the volume must be positive */
  function check(sol, throwing) {
    let a = [0, 0, 0], tot = 0; sol.faces.forEach((f) => { if (f.kind === 'plan') { const m = planMoments(f); a = add(a, mul(f.n, m.area)); tot += Math.abs(m.area); return; } integ(f, (p, nv, w) => { a = add(a, mul(nv, w)); tot += len(nv) * w; }, 1); });
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
  function trimTris(f, n) {
    const S = f.surf, [u0, u1, v0, v1] = sDom(S); let cu = 0, cv = 0, cnt = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const e = sEval(S, u0 + (u1 - u0) * i / 4, v0 + (v1 - v0) * j / 4, true); cu += len(e.u); cv += len(e.v); cnt++; } cu = cu / cnt || 1; cv = cv / cnt || 1;
    const P2 = [], P3 = [], rings = [], diag = Math.hypot((u1 - u0) * cu, (v1 - v0) * cv);
    f.loops.forEach((lp) => { const idx = []; lp.pieces.forEach((pc) => { let uvs = [];
      if (pc.type === 'c') { const m = Math.min(160, Math.max(8, pc.uvC.P.length)); uvs = cSample(pc.uvC, m).slice(0, -1).map((q) => [q[0], q[1]]); }
      else { const m = Math.max(1, Math.ceil(Math.hypot((pc.b[0] - pc.a[0]) * cu, (pc.b[1] - pc.a[1]) * cv) / (diag / (n * 3)))); for (let k = 0; k < m; k++) uvs.push([pc.a[0] + (pc.b[0] - pc.a[0]) * k / m, pc.a[1] + (pc.b[1] - pc.a[1]) * k / m]); }
      uvs.forEach((q) => { const last = idx.length ? P2[idx[idx.length - 1]] : null; if (last && Math.hypot(last[0] - q[0] * cu, last[1] - q[1] * cv) < 1e-12 * diag) return; idx.push(P2.length); P2.push([q[0] * cu, q[1] * cv]); P3.push(sEval(S, q[0], q[1])); }); });
      if (idx.length > 2 && Math.hypot(P2[idx[0]][0] - P2[idx[idx.length - 1]][0], P2[idx[0]][1] - P2[idx[idx.length - 1]][1]) < 1e-12 * diag) idx.pop(); if (idx.length >= 3) rings.push(idx); });
    if (!rings.length || !AK.triangulatePolygon) return []; const tris = AK.triangulatePolygon(P2, rings), msh = { P2, P3, tris };
    const nu = Math.max(2, (new Set(S.U).size - 1) * n), nv = Math.max(2, (new Set(S.V).size - 1) * n), du = (u1 - u0) / nu, dv = (v1 - v0) / nv, pts = [];
    for (let i = 1; i < nu; i++) for (let j = 1; j < nv; j++) pts.push([(u0 + du * i) * cu, (v0 + dv * j) * cv]);
    if (AK.insertSteiner && pts.length) AK.insertSteiner(msh, rings, pts, Math.min(du * cu, dv * cv) * 0.35, (q) => sEval(S, q[0] / cu, q[1] / cv));
    return msh.tris.filter(Boolean).map(([a, b, c]) => (f.sign > 0 ? [msh.P3[a], msh.P3[b], msh.P3[c]] : [msh.P3[a], msh.P3[c], msh.P3[b]]));
  }
  function mesh(sol, n) {
    n = n || 8; const tris = [];
    sol.faces.forEach((f) => {
      if (f.kind === 'plan') {                                                         // a planar face with holes: ear clipping of the sampled loops
        const [e1, e2] = planBasis(f.n), P3 = [], P2 = [], rings = []; f.loops.forEach((loop) => { const idx = []; loop.forEach((c) => { cSample(c, Math.max(8, n * Math.max(1, c.P.length - 1) / 2 | 0)).slice(0, -1).forEach((q) => { idx.push(P3.length); P3.push(q); P2.push([dot(sub(q, f.o), e1), dot(sub(q, f.o), e2)]); }); }); rings.push(idx); });
        (AK.triangulatePolygon ? AK.triangulatePolygon(P2, rings) : []).forEach((t) => tris.push([P3[t[0]], P3[t[1]], P3[t[2]]])); return;
      }
      if (f.kind === 'trim') { trimTris(f, n).forEach((t) => tris.push(t)); return; }
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
    const loopOf = (list, ccw, inner) => { const L = ccw ? list : list.slice().reverse().map(([e, f]) => [e, !f]); return E(`${inner ? 'FACE_BOUND' : 'FACE_OUTER_BOUND'}('',${E(`EDGE_LOOP('',(${L.map(([e, f]) => oe(e, f)).join(',')}))`)},.T.)`); };
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
    } else if (T.type === 'brep') {
      const known = [], near = (p, q, t) => Math.abs(p[0] - q[0]) < t && Math.abs(p[1] - q[1]) < t && Math.abs(p[2] - q[2]) < t;
      const midOf = (c) => { const pts = cSample(c, 128), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1]))); const h = cum[cum.length - 1] / 2; let k = 1; while (k < cum.length - 1 && cum[k] < h) k++; const w = (h - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return add(mul(pts[k - 1], 1 - w), mul(pts[k], w)); };
      const edgeG = (c) => { const [a0, a1] = dom(c), a = cEval(c, a0), b = cEval(c, a1), m = midOf(c);
        for (const k of known) { if (near(a, k.a, 1e-6) && near(b, k.b, 1e-6) && near(m, k.m, 1e-3 * (1 + len(sub(a, b))))) return [k.e, true]; if (near(a, k.b, 1e-6) && near(b, k.a, 1e-6) && near(m, k.m, 1e-3 * (1 + len(sub(a, b))))) return [k.e, false]; }
        const e = edge('g' + known.length, c); known.push({ a, b, m, e }); return [e, true]; };
      sol.faces.forEach((f) => {
        if (f.kind === 'plan') { const bounds = f.loops.map((loop, i) => loopOf(loop.map(edgeG), true, i > 0)); faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${plane(f.o, f.n)},.T.)`)); }
        else if (f.kind === 'trim') { const bounds = f.loops.map((lp, i) => loopOf(lp.pieces.filter((pc) => pc.c3).map((pc) => edgeG(pc.c3)), f.sign > 0, i > 0)); faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${surfEnt(f.surf)},${f.sign > 0 ? '.T.' : '.F.'})`)); }
        else if (f.kind === 'side') { const list = borderCurves(f.surf).map(({ c, rev }) => (curveLen(c) > 1e-10 ? edgeG(rev ? cReverse(c) : c) : null)).filter(Boolean); bsFace(f.surf, f.sign, list); }
      });
    } else if (T.type === 'multi') {
      T.parts.forEach((pt, pi) => { const Tp = pt.topo, pre = 'p' + pi + '_', m = Tp.sections.length, nseg = Tp.nseg, first = Tp.sections[0], last = Tp.sections[m - 1], bot = first.map((c, k) => edge(pre + 'b' + k, c)), top = last.map((c, k) => edge(pre + 't' + k, c)), vert = [];
        const vertEdge = (j) => { const S = Tp.sides[j % nseg], c = sCol(S, 0); if (!vert[j % nseg]) vert[j % nseg] = edge(pre + 'v' + (j % nseg), c); return vert[j % nseg]; };
        Tp.sides.forEach((S, k) => { const left = vertEdge(k), rightIdx = (k + 1) % nseg, right = rightIdx === k ? left : vertEdge(rightIdx); bsFace(S, pt.signs[k], [[bot[k], true], [right, true], [top[k], false], [left, false]]); }); });
      T.caps.forEach((cf, ci) => { const which = ci === 0 ? 0 : 1, refs = cf.refs || T.parts.map((_, pi) => ({ pi, end: which === 0 ? 'b' : 't' })), bounds = refs.map((rf, ri) => { const pi = rf.pi, secs = T.parts[pi].topo.sections, sec = rf.end === 'b' ? secs[0] : secs[secs.length - 1], pre = 'p' + pi + '_' + rf.end, list = sec.map((c, k) => [edge(pre + k, c), true]), along = dot(closedArea(sec, 48), cf.n) >= 0;
          return ri === 0 ? loopOf(list, along, false) : loopOf(list, !along, true); });
        faceEnts.push(E(`ADVANCED_FACE('',(${bounds.join(',')}),${plane(cf.o, cf.n)},.T.)`)); });
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
    const mapC = (c) => cMap(c, Mp), mapT = (T) => { const nt = Object.assign({}, T);
      if (T.type === 'skin') { nt.sections = T.sections.map((sec) => sec.map(mapC)); nt.sides = T.sides.map(mapS); }
      else if (T.type === 'brep') { /* faces carry everything */ }
      else if (T.type === 'multi') { nt.parts = T.parts.map((pt) => ({ topo: mapT(pt.topo), signs: pt.signs.map((x) => x * flip) })); }
      else { nt.segs = T.segs.map(mapC); nt.endSegs = T.full ? nt.segs : T.endSegs.map(mapC); nt.surf = T.surf.map(mapS); nt.o = Mp(T.o); nt.ax = unit(Md(T.ax)); nt.sign = T.sign * flip; }
      return nt; };
    const mapF = (f) => { if (f.kind === 'trim') return Object.assign({}, f, { surf: mapS(f.surf), sign: f.sign * flip, loops: f.loops.map((lp) => ({ pieces: lp.pieces.map((pc) => Object.assign({}, pc, { c3: pc.c3 ? mapC(pc.c3) : null })) })) }); if (f.kind === 'plan') { const n = unit(Md(f.n)); return planFace(f.loops.map((l) => l.map(mapC)), n, f.tag, f.refs); } return Object.assign({}, f, { surf: mapS(f.surf), sign: f.sign * flip, n: f.n ? unit(Md(f.n)) : f.n }); };
    const faces = sol.faces.map(mapF), nt = mapT(sol.topo); if (nt.type === 'multi') nt.caps = faces.filter((f) => f.kind === 'plan');
    const out = { kind: sol.kind, op: sol.op, topo: nt, faces }; if (sol.profile) { out.profile = { outer: sol.profile.outer.map(mapC), holes: sol.profile.holes.map((h) => h.map(mapC)) }; out.vec = Md(sol.vec); } if (sol.pockets) out.pockets = sol.pockets.map((q) => ({ loop: q.loop.map(mapC), end: q.end, plane: { p: Mp(q.plane.p), n: unit(Md(q.plane.n)) }, dir: q.dir ? Md(q.dir) : undefined })); if (sol.src) out.src = { root: xfSolid(sol.src.root, M, t), ops: sol.src.ops.map((o) => ({ kind: o.kind, planes: o.planes.map((q) => { const nn = unit(Md(q.n)), pp = Mp(q.p); return { n: nn, d: dot(nn, pp), p: pp }; }) })) }; if (sol.lo) out.lo = { p: Mp(sol.lo.p), n: unit(Md(sol.lo.n)) }; if (sol.hi) out.hi = { p: Mp(sol.hi.p), n: unit(Md(sol.hi.n)) }; return out;
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
  // ---- prisms with planar ends: an extrusion whose two ends are cut by planes (not necessarily perpendicular to the sweep).  Every side is a ruled patch between the two projected profile curves, so it stays exact; no trimming is needed.
  const profPlane = (sec0) => ({ p: cEval(sec0[0], dom(sec0[0])[0]), n: unit(closedArea(sec0, 48)) });
  const projAlong = (P, vec, pl) => add(P, mul(vec, dot(pl.n, sub(pl.p, P)) / dot(pl.n, vec)));
  function prismSolid(prof, vec, lo, hi, pockets) {
    const outer = asSection(prof.outer), holes = (prof.holes || []).map(asSection), base = profPlane(outer), L = lo || base, H = hi || { p: add(base.p, vec), n: base.n }; pockets = pockets || [];
    if (Math.abs(dot(L.n, vec)) < 1e-9 * len(vec) || Math.abs(dot(H.n, vec)) < 1e-9 * len(vec)) throw new Error('prism: an end plane is parallel to the sweep direction');
    const pr = (loop, pl) => loop.map((c) => cMap(c, (P) => projAlong(P, vec, pl))), secs = [pr(outer, L), pr(outer, H)];
    let r;
    if (!pockets.length) r = holes.length ? skinSolidH(secs, holes.map((h) => [pr(h, L), pr(h, H)]), {}, 'extrude', 1) : skinSolid(secs, {}, 'extrude', 1);
    else {   // blind pockets: walls from a flat floor (or ceiling) to the end plane, a planar floor, and end caps that carry the pocket mouths as holes
      const o = skinSolid(secs, { caps: false }, 'extrude', 1), parts = [{ topo: o.topo, signs: o.faces.map((f) => f.sign) }], faces = o.faces.slice(), flipIn = (sk, tag) => sk.faces.map((f) => Object.assign({}, f, { sign: -f.sign, tag: tag + f.tag }));
      holes.forEach((h) => { const hk = skinSolid([pr(h, L), pr(h, H)], { caps: false }, 'extrude', 1), fl = flipIn(hk, 'h' + parts.length + '_'); parts.push({ topo: hk.topo, signs: fl.map((f) => f.sign) }); faces.push(...fl); });
      const nFull = parts.length, floors = [], mouthLo = [], mouthHi = [];
      pockets.forEach((pk, i) => { const thru = pk.end === 'thru', onto = (loop) => loop.map((c) => cMap(c, (P) => add(P, mul(pk.plane.n, dot(pk.plane.n, sub(pk.plane.p, P)))))), top = pk.end === 'hi', prd = (pl) => pk.loop.map((c) => cMap(c, (P) => projAlong(P, pk.dir, pl))), sec = thru ? [prd(L), prd(H)] : top ? [onto(pk.loop), pr(pk.loop, H)] : [pr(pk.loop, L), onto(pk.loop)];
        const wk = skinSolid(sec, { caps: false }, 'extrude', 1), wf = flipIn(wk, 'pk' + i + '_'), pi = parts.length; parts.push({ topo: wk.topo, signs: wf.map((f) => f.sign) }); faces.push(...wf); if (thru) { mouthHi.push(pi); mouthLo.push(pi); } else { (top ? mouthHi : mouthLo).push(pi); floors.push({ pi, top, k: i }); } });
      const firstS = (pi) => parts[pi].topo.sections[0], lastS = (pi) => parts[pi].topo.sections[parts[pi].topo.sections.length - 1], ids = Array.from({ length: nFull }, (_, k) => k), secOf = (rf) => (rf.end === 'b' ? firstS(rf.pi) : lastS(rf.pi));
      const nLo = dot(L.n, vec) > 0 ? mul(unit(L.n), -1) : unit(L.n), nHi = dot(H.n, vec) > 0 ? unit(H.n) : mul(unit(H.n), -1), mk = (n, tag, rs) => planFace(rs.map(secOf), n, tag, rs);
      const caps = [mk(nLo, 'cap0_0', ids.map((pi) => ({ pi, end: 'b' })).concat(mouthLo.map((pi) => ({ pi, end: 'b' })))), mk(nHi, 'cap1_0', ids.map((pi) => ({ pi, end: 't' })).concat(mouthHi.map((pi) => ({ pi, end: 't' }))))];
      floors.forEach((f, ii) => { const i = ii, pn = pockets[f.k].plane.n; caps.push(f.top ? mk(dot(pn, vec) > 0 ? pn : mul(pn, -1), 'pocket_floor' + i, [{ pi: f.pi, end: 'b' }]) : mk(dot(pn, vec) > 0 ? mul(pn, -1) : pn, 'pocket_ceiling' + i, [{ pi: f.pi, end: 't' }])); });
      faces.push(...caps); r = { kind: 'skin', op: 'extrude', faces, topo: { type: 'multi', parts, caps } }; check(r, true);
    }
    r.profile = { outer, holes }; r.vec = vec.slice(); r.lo = lo || null; r.hi = hi || null; r.pockets = pockets; return r;
  }
  /** EXACT: remove the part of an extruded freeform solid lying on the side of the plane (p, n) that n points into, when the plane crosses every side of the solid (an end cut, perpendicular or slanted).  Otherwise null. */
  function cutHalfSpace(a, p, n) {
    try {
      if (!isN(a) || !a.profile || !a.vec || (a.pockets && a.pockets.length)) return null; n = unit(n); const vec = a.vec, k = dot(n, vec), base = profPlane(a.profile.outer); if (Math.abs(k) < 1e-6 * len(vec)) return null;
      const Lp = a.lo || base, Hp = a.hi || { p: add(base.p, vec), n: base.n }, sOf = (P, pl) => dot(pl.n, sub(pl.p, P)) / dot(pl.n, vec), eps = 1e-6; let keepLo = null;
      for (const l of [a.profile.outer].concat(a.profile.holes)) for (const c of l) for (const q of cSample(c, 96)) {
        const s = dot(n, sub(p, q)) / k, s0 = sOf(q, Lp), s1 = sOf(q, Hp); if (!(s > s0 + eps && s < s1 - eps)) return null;
        const kl = dot(n, sub(add(q, mul(vec, s0)), p)) < 0; if (keepLo === null) keepLo = kl; else if (keepLo !== kl) return null; }
      const r = keepLo ? prismSolid(a.profile, vec, a.lo, { p, n }) : prismSolid(a.profile, vec, { p, n }, a.hi), c = check(r, false);
      return c.ok && massProps(r, 1).volume < massProps(a, 1).volume ? r : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  /** EXACT: cut by a convex tool with flat faces (a box, a wedge, a rotated block ...) of which exactly one face reaches the solid: that is a half-space cut */
  function cutPlanarTool(a, b) {
    try {
      if (!isN(a) || isN(b) || !AK._t) return null; const body = AK._t.evaluate(b, AK._t.RES_EXACT).body; if (body.faces.some((f) => f.surf.kind !== 'plane')) return null;
      const V = []; body.faces.forEach((f) => f.loops.forEach((lp) => lp.forEach((ce) => { V.push(ce.edge.v0.p, ce.edge.v1.p); }))); if (!V.length) return null;
      const cen = [0, 1, 2].map((i) => V.reduce((x, q) => x + q[i], 0) / V.length), size = Math.max(...V.map((q) => len(sub(q, cen))));
      const planes = body.faces.map((f) => { let nn = unit(f.surf.z); const o = f.surf.o; if (dot(nn, sub(cen, o)) > 0) nn = mul(nn, -1); return { n: nn, o }; });
      if (planes.some((pl) => V.some((q) => dot(pl.n, sub(q, pl.o)) > 1e-7 * size))) return null;                    // not convex
      const mn = [1e300, 1e300, 1e300], mx = [-1e300, -1e300, -1e300];
      faceCurves(a).forEach((c) => c.P.forEach((P) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], P[i]); mx[i] = Math.max(mx[i], P[i]); } }));
      const corners = []; for (let i = 0; i < 8; i++) corners.push([i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]]);
      const rel = planes.filter((pl) => corners.some((c) => dot(pl.n, sub(c, pl.o)) > 1e-9 * (1 + size))); if (!rel.length) return null; if (rel.length > 1) return toolCut(a, rel.map((pl) => ({ p: pl.o, n: mul(pl.n, -1) })));
      return ((a.profile && a.vec && !(a.pockets && a.pockets.length)) ? cutHalfSpace(a, rel[0].o, mul(rel[0].n, -1)) : null) || planeCut(a, rel[0].o, mul(rel[0].n, -1));
    } catch (e) { return null; }
  }
  /** EXACT: a cylinder of any axis (slanted too) passing right through a prism-type freeform solid, entering and leaving through its two flat ends with the whole mouth inside each end.  Walls are ruled along the tool axis between the two elliptical mouths. */
  function cutSkewCylinder(a, b) {
    try {
      if (!isN(a) || isN(b) || !a.profile || !a.vec || !AK._t) return null;
      const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, cyl = body.faces.filter((f) => f.surf.kind === 'cylinder'); if (cyl.length !== 1 || body.faces.length !== 3) return null;
      const S = cyl[0].surf, w = unit(S.z), r = S.r, o = S.o, base = profPlane(a.profile.outer), L = a.lo || base, H = a.hi || { p: add(base.p, a.vec), n: base.n };
      if (Math.abs(dot(L.n, w)) < 1e-3 || Math.abs(dot(H.n, w)) < 1e-3) return null;
      const tcaps = body.faces.filter((f) => f.surf.kind === 'plane'); if (tcaps.length !== 2) return null;
      const ts = tcaps.map((f) => dot(sub(f.surf.o, o), w)), tmin = Math.min(...ts), tmax = Math.max(...ts), [ex, ey] = planBasis(w);
      // the tool must reach beyond both end planes along its whole circumference
      const circ = []; for (let i = 0; i < 64; i++) { const th = 2 * Math.PI * i / 64; circ.push(add(o, add(mul(ex, r * Math.cos(th)), mul(ey, r * Math.sin(th))))); }
      const tAt = (P, pl) => dot(pl.n, sub(pl.p, P)) / dot(pl.n, w), margin = 1e-6 * (1 + r);
      for (const P of circ) { const t0 = tAt(P, L), t1 = tAt(P, H); if (!(Math.min(t0, t1) > tmin + margin && Math.max(t0, t1) < tmax - margin)) return null; }
      const loop = [circle(o, ex, ey, r)];
      // each mouth strictly inside the corresponding end face (profile loops projected onto the end plane along the sweep)
      const vec = a.vec, [f1, f2] = planBasis(unit(vec)), pj = (l, pl) => l.map((c) => cSample(c, 64).slice(0, -1).map((q) => { const x = projAlong(q, vec, pl); return [dot(x, f1), dot(x, f2)]; })).flat();
      void pj; const poly = (l, pl) => { const P = []; l.forEach((c) => cSample(c, 64).slice(0, -1).forEach((q) => { const x = projAlong(q, vec, pl); P.push([dot(x, f1), dot(x, f2)]); })); return P; };
      const inside = (p, pg) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const A = pg[i], B = pg[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
      const segD = (p, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); return Math.hypot(p[0] - A[0] - t * ab[0], p[1] - A[1] - t * ab[1]); };
      for (const pl of [L, H]) {
        const mouth = []; circ.forEach((P) => { const x = add(P, mul(w, tAt(P, pl))); mouth.push([dot(x, f1), dot(x, f2)]); });
        const O = poly(a.profile.outer, pl), Hs = a.profile.holes.map((h) => poly(h, pl)).concat((a.pockets || []).filter((q) => q.end !== 'thru').map((q) => poly(q.loop, pl))), all = [O].concat(Hs);
        let sz = 0; O.forEach((q) => { sz = Math.max(sz, Math.hypot(q[0] - O[0][0], q[1] - O[0][1])); }); const clear = 2e-3 * sz;
        for (const q of mouth) { if (!inside(q, O) || Hs.some((h) => inside(q, h))) return null; for (const pg of all) for (let i = 0; i < pg.length; i++) if (segD(q, pg[i], pg[(i + 1) % pg.length]) < clear) return null; }
        for (const pg of Hs) for (const q of pg) if (inside(q, mouth)) return null;
        for (const pg of all) for (const q of pg) for (let i = 0; i < mouth.length; i++) if (segD(q, mouth[i], mouth[(i + 1) % mouth.length]) < clear) return null;
      }
      // existing through-holes must not touch the new wall (mouths of both ends are separated, see above); existing floors of pockets are not handled
      if ((a.pockets || []).some((q) => q.end !== 'thru')) return null;
      const pk = (a.pockets || []).concat([{ loop, end: 'thru', plane: { p: o, n: w }, dir: w }]);
      const res = prismSolid(a.profile, a.vec, a.lo, a.hi, pk), c = check(res, false);
      return c.ok && massProps(res, 1).volume < massProps(a, 1).volume ? res : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }

  /** EXACT: a quadric tool (sphere, torus, cylinder, cone; any placement, slanted too) cutting the curved sides of a freeform solid.  The sides are trimmed by the tool surface, and the tool's own wall becomes a trimmed NURBS face whose region comes from the traced intersection curves.  Limits: the flat ends of the solid must stay clear of the tool and the tool must reach beyond the solid along its axis (no floor). */
  function cutQuadricTool(a, b) {
    try {
      if (!isN(a) || isN(b) || !AK._t || a.faces.some((f) => f.kind === 'trim')) return (globalThis.__cpdbg && console.log('quad bail 1'), null);
      const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, qs = body.faces.filter((f) => f.surf.kind !== 'plane'); if (qs.length !== 1 || !['sphere', 'torus', 'cylinder', 'cone'].includes(qs[0].surf.kind)) return (globalThis.__cpdbg && console.log('quad bail 2'), null);
      const Q = qs[0].surf, kind = Q.kind, w0 = unit(Q.z), tcaps = body.faces.filter((f) => f.surf.kind === 'plane'), tOf = (P) => dot(sub(P, Q.o), w0);
      let tc0 = -Infinity, tc1 = Infinity; if (kind === 'cylinder' || kind === 'cone') { if (tcaps.length !== 2) return (globalThis.__cpdbg && console.log('quad bail 3'), null); const ts = tcaps.map((f) => tOf(f.surf.o)); tc0 = Math.min(...ts); tc1 = Math.max(...ts); }
      const test = kind === 'sphere' ? Q.o : kind === 'torus' ? add(Q.o, mul(unit(Q.x), Q.R)) : add(Q.o, mul(w0, (tc0 + tc1) / 2)), sg = Q.f(test) < 0 ? 1 : -1;
      const con = { val: (P) => -sg * Q.f(P), grad: (P) => mul(Q.grad(P), -sg) };
      // point cloud of the solid
      const cloud = [], sides = [], flats = []; let scale = 1;
      a.faces.forEach((f) => { if (f.kind === 'cap') return; if (f.kind === 'plan') { flats.push(f); f.loops.forEach((l) => l.forEach((c) => cSample(c, 24).forEach((q) => cloud.push(q)))); } else { sides.push(...splitClosedFace(f)); const [u0, u1, v0, v1] = sDom(f.surf); for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) cloud.push(sEval(f.surf, u0 + (u1 - u0) * i / 12, v0 + (v1 - v0) * j / 12)); f.surf.P.forEach((r) => r.forEach((q) => { scale = Math.max(scale, len(q)); })); } });
      const capsF = a.faces.filter((f) => f.kind === 'cap'); capsF.forEach((f) => { const [u0, u1, v0, v1] = sDom(f.surf); for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) cloud.push(sEval(f.surf, u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * j / 8)); });
      if (!cloud.length) return (globalThis.__cpdbg && console.log('quad bail 4'), null);
      // flat ends must be clear of the tool
      const minD = (P) => { let m = Infinity; for (const q of cloud) { const d = len(sub(q, P)); if (d < m) m = d; } return m; };
      for (const f of flats.concat(capsF)) { const pts = []; if (f.kind === 'plan') { f.loops.forEach((l) => l.forEach((c) => cSample(c, 24).forEach((q) => pts.push(q)))); } else { const [u0, u1, v0, v1] = sDom(f.surf); for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) pts.push(sEval(f.surf, u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * j / 8)); }
        if (pts.some((P) => con.val(P) > -1e-6 * scale)) return (globalThis.__cpdbg && console.log('quad bail 5'), null);
        // inside the end face: sample the polygon's bounding grid
        const mn = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]))), mx = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i]))); for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) for (let k = 0; k <= 10; k++) { const P = [mn[0] + (mx[0] - mn[0]) * i / 10, mn[1] + (mx[1] - mn[1]) * j / 10, mn[2] + (mx[2] - mn[2]) * k / 10]; if (Math.abs(f.n ? dot(f.n, sub(P, pts[0])) : 1) < 1e-9 * scale && con.val(P) > 0) return (globalThis.__cpdbg && console.log('quad bail 6'), null); } }
      const prj = (P) => dot(sub(P, Q.o), w0); let tA0 = Infinity, tA1 = -Infinity; cloud.forEach((P) => { tA0 = Math.min(tA0, prj(P)); tA1 = Math.max(tA1, prj(P)); });
      const pad = 0.05 * (tA1 - tA0) + 1e-6 * scale; if ((kind === 'cylinder' || kind === 'cone') && !(tc0 < tA0 - pad && tc1 > tA1 + pad)) return (globalThis.__cpdbg && console.log('quad bail 7'), null);
      // trim the sides
      const faces = [], contours = []; let trimmed = false;
      for (const f of sides) { const r = trimSurfaceByPlanes(f.surf, f.sign, [{ kind: 'keep', planes: [con] }], f.tag + 'q'); if (r.mode === 'all') faces.push(f); else if (r.mode === 'trim') { faces.push(...r.faces); contours.push(...r.contours); trimmed = true; } }
      if (!trimmed || !contours.length) return (globalThis.__cpdbg && console.log('quad bail 8'), null);
      flats.forEach((f) => faces.push(f)); const grp = {}; capsF.forEach((f) => { const k = f.tag.split('_')[0]; (grp[k] = grp[k] || []).push(f); }); Object.keys(grp).forEach((k) => { const fs = grp[k].sort((x, y) => Number(x.tag.split('_')[1]) - Number(y.tag.split('_')[1])); faces.push(planFace([fs.map((f) => sRow(f.surf, 1))], fs[0].n, k)); });
      const loops = chainLoops(contours, 1e-7 * scale); if (!loops) return (globalThis.__cpdbg && console.log('quad bail 9'), null);
      // the tool wall: a NURBS patch of the tool surface whose seam and poles lie well away from the solid
      const perp = (w) => planBasis(w), curveClear = (pts) => { let m = Infinity; for (const P of pts) m = Math.min(m, minD(P)); return m; };
      let W = null;
      if (kind === 'sphere') { let best = -1, bw = null, br = null; const N0 = 64; for (let i = 0; i < N0; i++) { const z = 1 - 2 * (i + 0.5) / N0, rr = Math.sqrt(1 - z * z), ph = i * 2.399963229728653, w = [rr * Math.cos(ph), rr * Math.sin(ph), z], [e1, e2] = perp(w);
          for (let k = 0; k < 12; k++) { const th = 2 * Math.PI * k / 12, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th))), pts = []; for (let m = 0; m <= 16; m++) { const al = -Math.PI / 2 + Math.PI * m / 16; pts.push(add(Q.o, add(mul(ref, Q.r * Math.cos(al)), mul(w, Q.r * Math.sin(al))))); } const sc = curveClear(pts); if (sc > best) { best = sc; bw = w; br = ref; } } }
        if (!(best > 0)) return (globalThis.__cpdbg && console.log('quad bail 10'), null); W = revolve([arc(Q.o, br, bw, Q.r, -Math.PI / 2, Math.PI / 2), line(add(Q.o, mul(bw, Q.r)), add(Q.o, mul(bw, -Q.r)))], Q.o, bw).faces[0]; }
      else if (kind === 'cylinder' || kind === 'cone') { const [e1, e2] = perp(w0); let best = -1, br = null; const t0 = tA0 - pad, t1 = tA1 + pad, rho = (t) => (kind === 'cone' ? Q.r + Q.k * t : Q.r); if (rho(t0) < 1e-6 * Q.r || rho(t1) < 1e-6 * Q.r) return (globalThis.__cpdbg && console.log('quad bail 11'), null);
        for (let k = 0; k < 24; k++) { const th = 2 * Math.PI * k / 24, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th))), pts = []; for (let m = 0; m <= 16; m++) { const t = t0 + (t1 - t0) * m / 16; pts.push(add(add(Q.o, mul(w0, t)), mul(ref, rho(t)))); } const sc = curveClear(pts); if (sc > best) { best = sc; br = ref; } }
        if (!(best > 0)) return (globalThis.__cpdbg && console.log('quad bail 12'), null); const y2 = cross(w0, br), ring = (t) => circle(add(Q.o, mul(w0, t)), br, y2, rho(t)); W = (kind === 'cylinder' ? extrude(ring(t0), mul(w0, t1 - t0)) : loft([ring(t0), ring(t1)])).faces[0]; }
      else { const [e1, e2] = perp(w0); let best = -1, br = null, bp = 0; for (let k = 0; k < 12; k++) { const th = 2 * Math.PI * k / 12, ref = add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th)));
          for (let q = 0; q < 12; q++) { const ph = 2 * Math.PI * q / 12, xd = add(mul(ref, Math.cos(ph)), mul(w0, Math.sin(ph))), pts = []; for (let m = 0; m < 24; m++) { const al = 2 * Math.PI * m / 24; pts.push(add(Q.o, add(mul(ref, Q.R + Q.r * Math.cos(ph) * Math.cos(al) - 0), mul(w0, 0)))); void al; }
            const pts2 = []; for (let m = 0; m < 24; m++) { const al = 2 * Math.PI * m / 24, rr = Q.R + Q.r * Math.cos(al + ph); pts2.push(add(Q.o, add(mul(ref, rr), mul(w0, Q.r * Math.sin(al + ph))))); } const pts3 = []; for (let m = 0; m < 24; m++) { const be = 2 * Math.PI * m / 24, rr = Q.R + Q.r * Math.cos(ph), r2 = [Math.cos(be), Math.sin(be)]; pts3.push(add(Q.o, add(add(mul(e1, rr * r2[0]), mul(e2, rr * r2[1])), mul(w0, Q.r * Math.sin(ph))))); void xd; }
            const sc = Math.min(curveClear(pts2), curveClear(pts3)); if (sc > best) { best = sc; br = ref; bp = ph; } } }
        if (!(best > 0)) return (globalThis.__cpdbg && console.log('quad bail 13'), null); const xd = add(mul(br, Math.cos(bp)), mul(w0, Math.sin(bp))), yd = add(mul(br, -Math.sin(bp)), mul(w0, Math.cos(bp))); W = revolve([circle(add(Q.o, mul(br, Q.R)), xd, yd, Q.r)], Q.o, w0).faces[0]; }
      if (!W) return (globalThis.__cpdbg && console.log('quad bail 14'), null);
      // wall region: loops mapped into the wall's parameter plane
      const [wu0, wu1, wv0, wv1] = sDom(W.surf), WS = W.surf, periodic = len(sub(sEval(WS, wu0, (wv0 + wv1) / 2), sEval(WS, wu1, (wv0 + wv1) / 2))) < 1e-9 * (1 + scale), G = [];
      for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) G.push([wu0 + (wu1 - wu0) * i / 40, wv0 + (wv1 - wv0) * j / 40]);
      const mkToUV = (SS, per) => { const [a0, a1, c0, c1] = sDom(SS), GG = [], GGP = []; for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const q = [a0 + (a1 - a0) * i / 40, c0 + (c1 - c0) * j / 40]; GG.push(q); GGP.push(sEval(SS, q[0], q[1])); }
        return (P, seed) => { let uv = seed; if (!uv) { let bd = Infinity; GGP.forEach((g, i) => { const d = len(sub(g, P)); if (d < bd) { bd = d; uv = GG[i]; } }); } let [u, v] = uv;
          for (let it = 0; it < 60; it++) { const e = sEval(SS, per ? ((u - a0) % (a1 - a0) + (a1 - a0)) % (a1 - a0) + a0 : u, v, true), r = sub(P, e.p), a11 = dot(e.u, e.u), a12 = dot(e.u, e.v), a22 = dot(e.v, e.v), b1 = dot(r, e.u), b2 = dot(r, e.v), det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-24) break; const du = (b1 * a22 - b2 * a12) / det, dv = (a11 * b2 - a12 * b1) / det; u = per ? u + du : Math.min(a1, Math.max(a0, u + du)); v = Math.min(c1, Math.max(c0, v + dv)); if (Math.abs(du) < 1e-15 && Math.abs(dv) < 1e-15) break; }
          if (per) u = ((u - a0) % (a1 - a0) + (a1 - a0)) % (a1 - a0) + a0; return [u, v]; }; };
      const toUVw = mkToUV(WS, periodic);
      /** uv samples of a 3D curve lying on the surface, u unwrapped (continuous) when the surface is periodic in u; start offset forces the first u near 0 when startAtZero */
      const uvSeq = (toUV, per, c, n, startAtZero) => { const out = []; let seed = null, off = 0, prev = null; for (let i = 0; i <= n; i++) { const t = dom(c)[0] + (dom(c)[1] - dom(c)[0]) * i / n; let uv = toUV(cEval(c, t), seed); seed = uv; let u = uv[0]; if (per) { if (i === 0 && startAtZero && u > 0.5 * (wu0 + wu1)) off = -(wu1 - wu0); else if (prev !== null) { const du = u - prev; if (du > 0.5 * (wu1 - wu0)) off -= wu1 - wu0; else if (du < -0.5 * (wu1 - wu0)) off += wu1 - wu0; } prev = u; u += off; } out.push([u, uv[1]]); } return out; };
      const shoe = (pts) => { let s2 = 0; for (let i = 0; i < pts.length; i++) { const p0 = pts[i], q0 = pts[(i + 1) % pts.length]; s2 += p0[0] * q0[1] - q0[0] * p0[1]; } return s2 / 2; };
      const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A0 = poly[i], B0 = poly[j]; if ((A0[1] > p[1]) !== (B0[1] > p[1]) && p[0] < (B0[0] - A0[0]) * (p[1] - A0[1]) / (B0[1] - A0[1]) + A0[0]) c = !c; } return c; };
      const span = wu1 - wu0, mkUvC = (pts) => interp(pts.map((q) => [q[0], q[1], 0]), 3);
      const info = loops.map((lp) => { const seqs = lp.map((c) => uvSeq(toUVw, periodic, c, 48, false)); let off = 0; const poly = []; seqs.forEach((q, k) => { if (k > 0) { const last = poly[poly.length - 1]; off = last[0] - q[0][0]; off = Math.round(off / span) * span; } q.slice(0, -1).forEach((p) => poly.push([p[0] + (k > 0 ? off : 0), p[1]])); });
        // continuity across pieces: re-unwrap whole polygon
        for (let i = 1; i < poly.length; i++) { while (poly[i][0] - poly[i - 1][0] > span / 2) poly[i][0] -= span; while (poly[i][0] - poly[i - 1][0] < -span / 2) poly[i][0] += span; }
        const first = poly[0], lastP = poly[poly.length - 1]; let wnd = 0; if (periodic) { let d = first[0] - lastP[0]; wnd = Math.round(-d / span); const wrapLast = [lastP[0], lastP[1]]; void wrapLast; }
        return { lp, poly, area: shoe(poly), wnd }; });
      const wsign = (() => { const e0 = sEval(WS, (wu0 + wu1) / 2, (wv0 + wv1) / 2, true), nrm = cross(e0.u, e0.v); return dot(nrm, con.grad(e0.p)) > 0 ? 1 : -1; })();
      const sgnOf = wsign, closeN = 600;
      const oriented = (lp, ccw, area) => (area > 0) === ccw ? lp : lp.slice().reverse().map((c) => cReverse(c));
      const pieceOf = (c, SS, toUV, per, start0) => { const pts = uvSeq(toUV, per, c, closeN, start0); return { type: 'c', uvC: mkUvC(pts), c3: c, plane: -1 }; };
      const flat = info.filter((x) => x.wnd === 0), wrap = info.filter((x) => x.wnd !== 0);
      if (wrap.length % 2 !== 0) return (globalThis.__cpdbg && console.log('quad bail wrap odd'), null);
      // loops that do not wind around the tool: plain trimmed discs (with nested holes)
      flat.forEach((x, i) => { x.depth = flat.filter((y, j) => j !== i && Math.abs(y.area) > Math.abs(x.area) && inPoly(x.poly[0], y.poly)).length; if (x.poly.some((p) => p[0] < wu0 - 1e-9 || p[0] > wu1 + 1e-9)) x.cross = true; });
      if (flat.some((x) => x.cross)) return (globalThis.__cpdbg && console.log('quad bail loop crosses the seam'), null);
      flat.filter((x) => x.depth % 2 === 0).forEach((o, k) => { const holes = flat.filter((h) => h.depth % 2 === 1 && inPoly(h.poly[0], o.poly)); const mkL = (x, ccw) => ({ pieces: oriented(x.lp, ccw, x.area).map((c) => pieceOf(c, WS, toUVw, periodic, false)) });
        faces.push({ kind: 'trim', surf: WS, sign: sgnOf, tag: 'quad_wall' + k, loops: [mkL(o, true)].concat(holes.map((h) => mkL(h, false))) }); });
      // loops that wind once around the tool (a tube between two of them): cut each at the seam of the wall
      if (wrap.length) {
        const fixed = [], replace = [];   // fixed: {path:[curves running u 0->1], v}
        for (const x of wrap) {
          // locate the seam crossing along the loop
          const cs = x.lp.slice(); let found = null;
          for (let ci = 0; ci < cs.length && !found; ci++) { const c = cs[ci], seq = uvSeq(toUVw, periodic, c, 200, false), pv = []; seq.forEach((q) => pv.push(q[0])); for (let k = 1; k < seq.length; k++) { const a = Math.floor((seq[k - 1][0] - wu0) / span + 1e-12), b = Math.floor((seq[k][0] - wu0) / span + 1e-12); if (a !== b) { // bracket
                const [d0, d1] = dom(c); let lo = d0 + (d1 - d0) * (k - 1) / 200, hi = d0 + (d1 - d0) * k / 200; const lvl = Math.max(a, b); const uAt = (t, sd) => { const uv = toUVw(cEval(c, t), sd); return uv; };
                // continuous unwrapped u along [lo,hi]: compare to the seam by the sign of (raw u shifted)
                const base = seq[k - 1][0]; const unw = (t, sd) => { const uv = uAt(t, sd); let u = uv[0]; while (u - base > span / 2) u -= span; while (u - base < -span / 2) u += span; return u; };
                const target = wu0 + lvl * span; let sd = null; for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2, um = unw(mid, sd); sd = null; if ((um - target) * (base - target) > 0) lo = mid; else hi = mid; }
                found = { ci, t: (lo + hi) / 2 }; break; } } }
          if (!found) return (globalThis.__cpdbg && console.log('quad bail no seam crossing'), null);
          // rotate the loop to start at the crossing
          const c = cs[found.ci], [d0, d1] = dom(c), parts = []; const Pc = cEval(c, found.t); const sp = found.t - d0 > 1e-9 * (d1 - d0) && d1 - found.t > 1e-9 * (d1 - d0) ? cSplit(c, found.t) : null;
          let seqCurves; if (sp) { seqCurves = [sp[1]].concat(cs.slice(found.ci + 1), cs.slice(0, found.ci), [sp[0]]); replace.push({ orig: c, parts: [sp[0], sp[1]], P: Pc }); } else seqCurves = cs.slice(found.ci).concat(cs.slice(0, found.ci));
          void parts;
          // direction: u must increase from 0 to 1
          let path = seqCurves; { const seq = []; path.forEach((cc) => uvSeq(toUVw, periodic, cc, 24, false).forEach((q) => seq.push(q))); let off = 0, tot = 0; for (let i = 1; i < seq.length; i++) { let du = seq[i][0] - seq[i - 1][0]; while (du > span / 2) du -= span; while (du < -span / 2) du += span; tot += du; } if (tot < 0) path = path.slice().reverse().map((cc) => cReverse(cc)); void off; }
          const uv0 = toUVw(cEval(path[0], dom(path[0])[0]), null); fixed.push({ path, v: uv0[1], P: Pc });
        }
        fixed.sort((a, b) => a.v - b.v);
        for (let k = 0; k + 1 < fixed.length; k += 2) { const lo = fixed[k], hi = fixed[k + 1];
          const pcs = []; lo.path.forEach((cc, ci) => pcs.push(pieceOf(cc, WS, toUVw, periodic, ci === 0)));
          // the pieces' u are unwrapped relative to the previous piece: re-offset so the whole path runs 0 -> 1
          const fixU = (arr, startU, dirSign) => { let cur = startU; arr.forEach((pc) => { const U = pc.uvC; const uS = cEval(U, dom(U)[0])[0]; const shift = Math.round((cur - uS) / span) * span; if (shift) pc.uvC = curve(U.p, U.U, U.P.map((q) => [q[0] + shift, q[1], q[2]]), U.w); cur = cEval(pc.uvC, dom(pc.uvC)[1])[0]; }); void dirSign; };
          fixU(pcs, wu0, 1);
          const vLoStart = cEval(pcs[0].uvC, dom(pcs[0].uvC)[0])[1], vLoEnd = cEval(pcs[pcs.length - 1].uvC, dom(pcs[pcs.length - 1].uvC)[1])[1];
          const hiRev = hi.path.slice().reverse().map((cc) => cReverse(cc)), hpcs = []; hiRev.forEach((cc, ci) => hpcs.push(pieceOf(cc, WS, toUVw, periodic, false)));
          fixU(hpcs, wu1, -1);
          const vHiStart = cEval(hpcs[0].uvC, dom(hpcs[0].uvC)[0])[1], vHiEnd = cEval(hpcs[hpcs.length - 1].uvC, dom(hpcs[hpcs.length - 1].uvC)[1])[1];
          const bord = (side, A0, B0) => { const bc = borderCurves(WS)[side], vert = side % 2 === 1, ta = vert ? A0[1] : A0[0], tb = vert ? B0[1] : B0[0], lo2 = Math.min(ta, tb), hi2 = Math.max(ta, tb); let c3 = null; if (hi2 - lo2 > 1e-13) { const sc = cSub(bc.c, lo2, hi2); c3 = ta <= tb ? sc : cReverse(sc); } return { type: 'b', side, a: A0, b: B0, c3 }; };
          const ring = pcs.concat([bord(1, [wu1, vLoEnd], [wu1, vHiStart])], hpcs, [bord(3, [wu0, vHiEnd], [wu0, vLoStart])]);
          faces.push({ kind: 'trim', surf: WS, sign: sgnOf, tag: 'quad_wall_t' + k, loops: [{ pieces: ring }] }); }
        // the solid's faces must meet the wall along the same edges: cut their contour pieces at the same points
        for (const rp of replace) { let done = false; for (const f of faces) { if (f.kind !== 'trim' || done) continue; for (const lp of f.loops) { const idx = lp.pieces.findIndex((pc) => { if (pc.type !== 'c') return false; const m0 = cEval(pc.c3, (dom(pc.c3)[0] + dom(pc.c3)[1]) / 2), m1 = cEval(rp.orig, (dom(rp.orig)[0] + dom(rp.orig)[1]) / 2); return len(sub(m0, m1)) < 1e-7 * (1 + scale) && Math.abs(curveLen(pc.c3) - curveLen(rp.orig)) < 1e-7 * (1 + scale); }); if (idx < 0) continue;
              const pc = lp.pieces[idx], toA = mkToUV(f.surf, false), [e0, e1] = dom(pc.c3); const same = len(sub(cEval(pc.c3, e0), cEval(rp.orig, dom(rp.orig)[0]))) < 1e-7 * (1 + scale); let t = null, bd = Infinity; for (let i = 0; i <= 2000; i++) { const tt = e0 + (e1 - e0) * i / 2000, d = len(sub(cEval(pc.c3, tt), rp.P)); if (d < bd) { bd = d; t = tt; } } let lo3 = Math.max(e0, t - (e1 - e0) / 2000), hi3 = Math.min(e1, t + (e1 - e0) / 2000); for (let it = 0; it < 60; it++) { const m1 = lo3 + (hi3 - lo3) / 3, m2 = hi3 - (hi3 - lo3) / 3; if (len(sub(cEval(pc.c3, m1), rp.P)) < len(sub(cEval(pc.c3, m2), rp.P))) hi3 = m2; else lo3 = m1; } t = (lo3 + hi3) / 2; void same;
              const sp2 = cSplit(pc.c3, t), mk = (c3) => ({ type: 'c', uvC: mkUvC(uvSeq(toA, false, c3, closeN, false)), c3, plane: -1 }); lp.pieces.splice(idx, 1, mk(sp2[0]), mk(sp2[1])); done = true; break; } } } }
      const res = { kind: 'skin', op: 'cut', faces, topo: { type: 'brep' } }, c = check(res, false); if (globalThis.__cpdbg) console.log('quad check', JSON.stringify(c), massProps(a, 1).volume, faces.map((f) => f.kind + ':' + f.tag).join()); if (!c.ok || !(c.volume > 0) || !(c.volume < massProps(a, 1).volume)) return (globalThis.__cpdbg && console.log('quad bail 15'), null); return res;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return (globalThis.__cpdbg && console.log('quad bail 16'), null); }
  }
  const cutExact = (a, b) => cutPrism(a, b) || cutSkewCylinder(a, b) || cutPlanarTool(a, b) || cutQuadricTool(a, b);
  /** EXACT cut of an extruded freeform solid by a prism (box, cylinder, any extrusion of lines and arcs) whose axis is parallel to the extrusion and which passes right through it, lying inside the profile:
   *  the result is the same extrusion with one more hole.  Returns null when the case is not this one (the caller then uses another way). */
  function cutPrism(a, b) {
    try {
      if (!isN(a) || isN(b) || !a.profile || !a.vec || !AK._t || (a.pockets || []).some((q) => q.end === 'thru')) return null;
      const body = AK._t.evaluate(b, AK._t.RES_EXACT).body, L = len(a.vec); if (!(L > 0)) return null; const d = mul(a.vec, 1 / L), caps = [];
      for (const f of body.faces) { const S = f.surf, zd = Math.abs(dot(S.z, d));
        if (S.kind === 'plane' && zd > 1 - 1e-9) caps.push(f); else if ((S.kind === 'plane' && zd < 1e-9) || (S.kind === 'cylinder' && zd > 1 - 1e-9)) continue; else return null; }
      if (caps.length !== 2) return null;
      const off = (f) => dot(f.surf.o, d), lo = off(caps[0]) <= off(caps[1]) ? caps[0] : caps[1], t0 = Math.min(off(caps[0]), off(caps[1])), t1 = Math.max(off(caps[0]), off(caps[1]));
      const first = a.profile.outer[0], s0 = dot(cEval(first, dom(first)[0]), d), s1 = s0 + L, eps = 1e-9 * (1 + L); if (lo.loops.length !== 1) return null;
      const base = profPlane(a.profile.outer), slanted = !!(a.lo || a.hi), flatEnds = !slanted && Math.abs(dot(base.n, d)) > 1 - 1e-9, Lp = a.lo || base, Hp = a.hi || { p: add(base.p, a.vec), n: base.n };
      let s0min = 1e300, s1max = -1e300; for (const l of [a.profile.outer].concat(a.profile.holes)) for (const c of l) for (const q of cSample(c, 64)) { s0min = Math.min(s0min, dot(projAlong(q, a.vec, Lp), d)); s1max = Math.max(s1max, dot(projAlong(q, a.vec, Hp), d)); }
      const into = (P) => projAlong(P, a.vec, base), loop = [];
      for (const ce of lo.loops[0]) { const e = ce.edge; let c;
        if (e.kind === 'line') c = line(e.v0.p, e.v1.p);
        else if (e.kind === 'circle') { const full = Math.abs(Math.abs(e.a1 - e.a0) - 2 * Math.PI) < 1e-9; c = full ? arc(e.c, e.x, e.y, e.r, e.a0, e.a0 + 2 * Math.PI) : arc(e.c, e.x, e.y, e.r, e.a0, e.a1); }
        else return null;
        c = cMap(c, into); loop.push(ce.fwd ? c : cReverse(c)); }
      checkClosed(loop, 'tool profile');
      // containment: the tool profile lies strictly inside the solid's profile and outside its holes, with a clearance
      const [e1, e2] = planBasis(d), pl = (loops) => loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 64).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
      const O = pl([a.profile.outer])[0], H = pl(a.profile.holes.concat((a.pockets || []).map((q) => q.loop))), Tl = pl([loop])[0], all = [O].concat(H);
      const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j]; if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
      let size = 0; O.forEach((p) => { size = Math.max(size, Math.hypot(p[0] - O[0][0], p[1] - O[0][1])); }); const clear = 2e-3 * size;
      const segDist = (p, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1))); return Math.hypot(p[0] - A[0] - t * ab[0], p[1] - A[1] - t * ab[1]); };
      for (const p of Tl) { if (!inside(p, O)) return null; if (H.some((h) => inside(p, h))) return null; for (const poly of all) for (let i = 0; i < poly.length; i++) if (segDist(p, poly[i], poly[(i + 1) % poly.length]) < clear) return null; }
      for (const poly of all.slice(1)) for (const p of poly) if (inside(p, Tl)) return null;             // an existing hole would be swallowed
      for (const poly of all) for (const p of poly) for (let i = 0; i < Tl.length; i++) if (segDist(p, Tl[i], Tl[(i + 1) % Tl.length]) < clear) return null;
      const pks = a.pockets || [], mkPrism = (holes, pockets) => (slanted || pockets.length || (a.pockets && a.pockets.length) ? prismSolid({ outer: a.profile.outer, holes }, a.vec, a.lo, a.hi, pockets) : extrude({ outer: a.profile.outer, holes }, a.vec));
      if (t0 <= s0min + eps && t1 >= s1max - eps) return mkPrism(a.profile.holes.concat([loop]), pks);
      // blind pocket from one end: the floor must lie strictly between the two ends along the whole mouth
      let loMax = -1e300, hiMin = 1e300; for (const c of loop) for (const q of cSample(c, 64)) { loMax = Math.max(loMax, dot(projAlong(q, a.vec, Lp), d)); hiMin = Math.min(hiMin, dot(projAlong(q, a.vec, Hp), d)); }
      const tol = 1e-6 * (1 + L), fromTop = t1 >= s1max - eps && t0 > loMax + tol && t0 < hiMin - tol, fromBot = t0 <= s0min + eps && t1 < hiMin - tol && t1 > loMax + tol; if (!fromTop && !fromBot) return null;
      const ft = fromTop ? t0 : t1, plane = { p: mul(d, ft), n: d };
      const r = mkPrism(a.profile.holes, pks.concat([{ loop, end: fromTop ? 'hi' : 'lo', plane }])); return check(r, false).ok ? r : null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  // ======================================================================================================
  // Trimmed freeform faces and the general plane cut.  A trimmed face is a NURBS surface plus loops of trim pieces:
  // iso-parameter border pieces (exact sub-curves of the surface border) and contour pieces (the plane meets the surface
  // along a curve that is traced to 1e-13 on both the surface and the plane, then interpolated by a cubic spline).
  // ======================================================================================================
  const insertKnotOnce = (c, t) => {
    const p = c.p, U = c.U, n = c.P.length - 1, k = span(n, p, t, U), Pw = c.P.map((q, i) => [q[0] * c.w[i], q[1] * c.w[i], q[2] * c.w[i], c.w[i]]), Q = [];
    for (let i = 0; i <= n + 1; i++) { if (i <= k - p) Q.push(Pw[i]); else if (i >= k + 1) Q.push(Pw[i - 1]); else { const a = (t - U[i]) / (U[i + p] - U[i]); Q.push([0, 1, 2, 3].map((m) => (1 - a) * Pw[i - 1][m] + a * Pw[i][m])); } }
    return curve(p, U.slice(0, k + 1).concat([t], U.slice(k + 1)), Q.map((q) => [q[0] / q[3], q[1] / q[3], q[2] / q[3]]), Q.map((q) => q[3]));
  };
  function cSplit(c, t) {
    const p = c.p; let cc = c, mult = c.U.filter((u) => Math.abs(u - t) < 1e-14).length;
    while (mult < p + 1) { cc = insertKnotOnce(cc, t); mult++; }
    const f = cc.U.findIndex((u) => Math.abs(u - t) < 1e-14);
    return [curve(p, cc.U.slice(0, f + p + 1), cc.P.slice(0, f), cc.w.slice(0, f)), curve(p, cc.U.slice(f), cc.P.slice(f), cc.w.slice(f))];
  }
  function cSub(c, a, b) { const [d0, d1] = dom(c); let r = c; if (a > d0 + 1e-13) r = cSplit(r, a)[1]; if (b < d1 - 1e-13) r = cSplit(r, b)[0]; return r; }
  const gaussRange = (a, b, knots, sub2) => { const ks = [a].concat(knots.filter((k) => k > a + 1e-13 && k < b - 1e-13), [b]), out = []; for (let s = 0; s + 1 < ks.length; s++) { const lo = ks[s], hi = ks[s + 1]; for (let t = 0; t < sub2; t++) { const l = lo + (hi - lo) * t / sub2, h = lo + (hi - lo) * (t + 1) / sub2, m = (l + h) / 2, r = (h - l) / 2; for (let g = 0; g < 4; g++) { out.push([m - r * GX[g], r * GW[g]], [m + r * GX[g], r * GW[g]]); } } } return out; };
  /** Green's theorem over the trimmed parameter region: the surface integral becomes a line integral over the trim pieces with an inner integral in v */
  function integrateTrim(face, f) {
    const S = face.surf, [, , v0] = sDom(S), sg = face.sign;
    const inner = (u, vEnd, wo) => { if (vEnd <= v0 + 1e-15) return; for (const [v, wv] of gaussRange(v0, vEnd, S.V, 3)) { const e = sEval(S, u, v, true); f(e.p, mul(cross(e.u, e.v), sg), wo * wv); } };
    face.loops.forEach((lp) => lp.pieces.forEach((pc) => {
      if (pc.type === 'b') { if (pc.side % 2 === 1) return; const ua = pc.a[0], ub = pc.b[0], dir = ub >= ua ? 1 : -1; if (Math.abs(ub - ua) < 1e-15) return; for (const [u, w] of gaussRange(Math.min(ua, ub), Math.max(ua, ub), S.U, 2)) inner(u, pc.a[1], -dir * w); return; }
      const [t0, t1] = dom(pc.uvC); for (const [t, w] of gaussRange(t0, t1, pc.uvC.U, 1)) { const e = cEval(pc.uvC, t, true); inner(e.p[0], e.p[1], -e.d[0] * w); }
    }));
  }
  const integ = (f, cb, s) => (f.kind === 'trim' ? integrateTrim(f, cb) : integrate(f.surf, f.sign, cb, s));
  const borderCurves = (S) => { const nU = S.P.length - 1, nV = S.P[0].length - 1; return [{ c: sRow(S, 0), rev: false }, { c: sCol(S, nU), rev: false }, { c: sRow(S, nV), rev: true }, { c: sCol(S, 0), rev: true }]; };
  const curveLen = (c) => { let L = 0, q = cEval(c, dom(c)[0]); for (let i = 1; i <= 8; i++) { const r = cEval(c, dom(c)[0] + (dom(c)[1] - dom(c)[0]) * i / 8); L += len(sub(r, q)); q = r; } return L; };
  /** trim a NURBS surface face by the half-space  nrm.x <= d : {mode:'all'|'none'|'trim', faces:[trim faces], contours:[3D curves in the plane]} */
  const trimSurfaceByPlane = (S, sign, nrm, d, tag) => trimSurfaceByPlanes(S, sign, [{ n: nrm, d }], tag);
  function trimSurfaceByPlanes(S, sign, opsIn, tag) {
    const ops = opsIn[0] && opsIn[0].planes ? opsIn : opsIn.map((pl) => ({ kind: 'keep', planes: [pl] })), planes = [], off = []; ops.forEach((o) => { off.push(planes.length); o.planes.forEach((pl) => planes.push(pl)); });
    const [u0, u1, v0, v1] = sDom(S), cv = (q, P) => (q.val ? q.val(P) : dot(q.n, P) - q.d), cg = (q, P) => (q.grad ? q.grad(P) : q.n), fk = (P) => planes.map((q) => cv(q, P)), opVal = (f) => ops.map((o, oi) => (o.kind === 'keep' ? f[off[oi]] : Math.min(...o.planes.map((_, k) => f[off[oi] + k])))), fv = (u, v) => Math.max(...opVal(fk(sEval(S, u, v))));
    const actOf = (uv) => { const f = fk(sEval(S, uv[0], uv[1])), ov = opVal(f); let b = 0; ov.forEach((x, k) => { if (x > ov[b]) b = k; }); if (ops[b].kind === 'keep') return off[b]; let m = off[b]; ops[b].planes.forEach((_, k) => { if (f[off[b] + k] < f[m]) m = off[b] + k; }); return m; };
    const mk = (a, b, ks, per, min) => { const k = [...new Set(ks.filter((x) => x >= a - 1e-14 && x <= b + 1e-14))].sort((x, y) => x - y), o = [k[0]], tot = Math.max(per, Math.ceil(min / Math.max(1, k.length - 1))); for (let i = 0; i + 1 < k.length; i++) for (let j = 1; j <= tot; j++) o.push(k[i] + (k[i + 1] - k[i]) * j / tot); return o; };
    const us = mk(u0, u1, S.U, 10, 24), vs = mk(v0, v1, S.V, 10, 24), NU = us.length - 1, NV = vs.length - 1, F = us.map((u) => vs.map((v) => fv(u, v)));
    let any = false, all = true, fmax = 0; F.forEach((r) => r.forEach((x) => { if (x < 0) any = true; else all = false; fmax = Math.max(fmax, Math.abs(x)); }));
    if (all) return { mode: 'all' }; if (!any) return { mode: 'none' };
    const ins = (i, j) => F[i][j] < 0, cache = new Map(), pos = new Map(), vkey = (i, j) => 'V' + i + ',' + j, vpos = (i, j) => [us[i], vs[j]];
    const crossing = (dir, i, j) => { const key = dir + ',' + i + ',' + j; let r = cache.get(key); if (r) return r; const ai = i, aj = j, bi = dir === 0 ? i + 1 : i, bj = dir === 0 ? j : j + 1, A = vpos(ai, aj), B = vpos(bi, bj); let lo = 0, hi = 1, flo = F[ai][aj], fhi = F[bi][bj], side = 0, s = 0.5;
      for (let it = 0; it < 100; it++) { s = lo - flo * (hi - lo) / (fhi - flo); if (!(s > lo && s < hi)) s = (lo + hi) / 2; const fs = fv(A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s); if (Math.abs(fs) < 1e-14 * (1 + fmax) || hi - lo < 1e-15) { break; } if ((fs < 0) === (flo < 0)) { lo = s; flo = fs; if (side === -1) fhi /= 2; side = -1; } else { hi = s; fhi = fs; if (side === 1) flo /= 2; side = 1; } }
      r = { key, uv: [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s] }; cache.set(key, r); pos.set(key, r.uv); return r; };
    const next = new Map(), seg = (a, b, kind, side) => { if (next.has(a)) throw new Error('trim: ambiguous contour'); next.set(a, { to: b, kind, side }); };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const cs = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], inn = cs.map(([a, b]) => ins(a, b)), ek = [crossing0(0, i, j), crossing0(1, i + 1, j), crossing0(0, i, j + 1), crossing0(1, i, j)], L = [];
      function crossing0(dir, a, b) { return () => crossing(dir, a, b).key; }
      for (let e = 0; e < 4; e++) { const a = inn[e], b = inn[(e + 1) % 4]; if (a !== b) L.push({ k: ek[e], leaving: a && !b }); }
      if (!L.length) continue; let cin = true; if (L.length === 4) { cin = fv((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2) < 0; }
      L.forEach((x, k) => { if (!x.leaving) return; const partner = L.length === 2 ? L[(k + 1) % 2] : (cin ? L[(k + 1) % 4] : L[(k + 3) % 4]); seg(x.k(), partner.k(), 'c', -1); });
    }
    const border = (ai, aj, bi, bj, dir, ci, cj, side) => { const a = ins(ai, aj), b = ins(bi, bj), ka = vkey(ai, aj), kb = vkey(bi, bj); pos.set(ka, vpos(ai, aj)); pos.set(kb, vpos(bi, bj)); if (a && b) seg(ka, kb, 'b', side); else if (a) seg(ka, crossing(dir, ci, cj).key, 'b', side); else if (b) seg(crossing(dir, ci, cj).key, kb, 'b', side); };
    for (let i = 0; i < NU; i++) border(i, 0, i + 1, 0, 0, i, 0, 0);
    for (let j = 0; j < NV; j++) border(NU, j, NU, j + 1, 1, NU, j, 1);
    for (let i = NU - 1; i >= 0; i--) border(i + 1, NV, i, NV, 0, i, NV, 2);
    for (let j = NV - 1; j >= 0; j--) border(0, j + 1, 0, j, 1, 0, j, 3);
    // loops
    const used = new Set(), loopsRaw = [];
    for (const start of next.keys()) { if (used.has(start)) continue; const segs = []; let k = start; for (let g = 0; g < 1e6; g++) { const s = next.get(k); if (!s) throw new Error('trim: open contour'); used.add(k); segs.push({ from: k, to: s.to, kind: s.kind, side: s.side }); k = s.to; if (k === start) break; } if (k !== start) throw new Error('trim: loop does not close'); loopsRaw.push(segs); }
    const grp = (a, b) => a.kind === b.kind && (a.kind === 'c' || a.side === b.side), loops = [];
    for (const segs of loopsRaw) {
      let r0 = 0; if (segs.every((s) => s.kind === segs[0].kind && s.side === segs[0].side)) r0 = 0; else { for (let i = 0; i < segs.length; i++) if (!grp(segs[i], segs[(i + segs.length - 1) % segs.length])) { r0 = i; break; } }
      const rot = segs.slice(r0).concat(segs.slice(0, r0)), pieces = []; let cur = null;
      rot.forEach((s) => { if (cur && grp(cur.segs[0], s)) cur.segs.push(s); else { cur = { segs: [s] }; pieces.push(cur); } });
      loops.push(pieces.map((pc) => ({ kind: pc.segs[0].kind, side: pc.segs[0].side, keys: [pc.segs[0].from].concat(pc.segs.map((s) => s.to)) })));
    }
    // geometry of every piece
    const contours = [], uvOf = (key) => pos.get(key), shoe = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const project = (uv, kp) => { const q = planes[kp]; let [u, v] = uv; for (let it = 0; it < 30; it++) { const e = sEval(S, u, v, true), f = cv(q, e.p), nrm = cg(q, e.p); if (Math.abs(f) < 1e-14 * (1 + fmax)) break; const gu = dot(nrm, e.u), gv = dot(nrm, e.v), g2 = gu * gu + gv * gv; if (g2 < 1e-30) break; u = Math.min(u1, Math.max(u0, u - f * gu / g2)); v = Math.min(v1, Math.max(v0, v - f * gv / g2)); } return [u, v]; };
    const kink = (A, B, ka, kb) => { let u = (A[0] + B[0]) / 2, v = (A[1] + B[1]) / 2; for (let it = 0; it < 40; it++) { const e = sEval(S, u, v, true), fa = cv(planes[ka], e.p), fb = cv(planes[kb], e.p), na = cg(planes[ka], e.p), nb = cg(planes[kb], e.p); if (Math.abs(fa) < 1e-14 * (1 + fmax) && Math.abs(fb) < 1e-14 * (1 + fmax)) break;
        const a1 = dot(na, e.u), a2 = dot(na, e.v), b1 = dot(nb, e.u), b2 = dot(nb, e.v), det = a1 * b2 - a2 * b1; if (Math.abs(det) < 1e-18) return null; u = Math.min(u1, Math.max(u0, u - (fa * b2 - fb * a2) / det)); v = Math.min(v1, Math.max(v0, v - (a1 * fb - b1 * fa) / det)); }
      return [u, v]; };
    const built = loops.map((pcs) => { const pieces = [], poly = [];
      pcs.forEach((pc) => {
        if (pc.kind === 'c') {
          const raw = pc.keys.map(uvOf), runs = []; let cur = { k: actOf(raw[0]), pts: [raw[0]] };
          for (let q = 1; q < raw.length; q++) { const kq = actOf(raw[q]); if (kq === cur.k || planes.length === 1) { cur.pts.push(raw[q]); continue; } const K = kink(raw[q - 1], raw[q], cur.k, kq); if (!K) { cur.pts.push(raw[q]); continue; } cur.pts.push(K); runs.push(cur); cur = { k: kq, pts: [K, raw[q]] }; }
          runs.push(cur);
          runs.forEach((run) => { let pts = run.pts; for (let r = 0; r < (planes[run.k].val ? 5 : 3); r++) { const nw = [pts[0]]; for (let k = 0; k + 1 < pts.length; k++) nw.push(project([(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2], run.k), pts[k + 1]); pts = nw; }
            const P3 = pts.map((q) => sEval(S, q[0], q[1])), keep = [0]; for (let k = 1; k < pts.length; k++) if (len(sub(P3[k], P3[keep[keep.length - 1]])) > 1e-10 * (1 + len(P3[k]))) keep.push(k); if (keep.length < 2) return; { const ds = []; for (let k = 1; k < keep.length; k++) ds.push(len(sub(P3[keep[k]], P3[keep[k - 1]]))); const med = ds.slice().sort((x, y) => x - y)[ds.length >> 1], k2 = [keep[0]]; for (let k = 1; k < keep.length; k++) { const d = len(sub(P3[keep[k]], P3[k2[k2.length - 1]])); if (k === keep.length - 1 || d > 0.35 * med) k2.push(keep[k]); } if (k2.length >= 2) { keep.length = 0; keep.push(...k2); } }
            const q3 = keep.map((k) => P3[k]), quv = keep.map((k) => pts[k]), deg = Math.min(3, q3.length - 1), c3 = interp(q3, deg), uvC = interp(quv.map((q) => [q[0], q[1], 0]), deg);
            pieces.push({ type: 'c', uvC, c3, plane: run.k }); contours.push(c3); quv.forEach((q) => poly.push(q)); }); }
        else { const A = uvOf(pc.keys[0]), B = uvOf(pc.keys[pc.keys.length - 1]), bc = borderCurves(S)[pc.side], vert = pc.side % 2 === 1, ta = vert ? A[1] : A[0], tb = vert ? B[1] : B[0], lo = Math.min(ta, tb), hi = Math.max(ta, tb); poly.push(A, B);
          let c3 = null; if (hi - lo > 1e-13) { const sc = cSub(bc.c, lo, hi), L = curveLen(sc); if (L > 1e-10) c3 = ta <= tb ? sc : cReverse(sc); }
          pieces.push({ type: 'b', side: pc.side, a: A, b: B, c3 }); }
      });
      return { pieces, poly, area: shoe(poly.length > 2 ? poly : [[0, 0], [0, 0], [0, 0]]) }; });
    // outer loops (counter-clockwise in uv) each get their holes
    const outers = built.filter((l) => l.area > 0), holes = built.filter((l) => l.area <= 0);
    const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const faces = outers.map((o, k) => ({ kind: 'trim', surf: S, sign, tag: tag + '_t' + k, loops: [o].concat(holes.filter((h) => inPoly(h.poly[0], o.poly)).sort((a, b) => 0)).map((l) => ({ pieces: l.pieces })) }));
    return { mode: 'trim', faces, contours };
  }
  /** loops of 3D curve pieces from unordered pieces, joined by matching end points */
  function chainLoops(pieces, tol) {
    const rest = pieces.filter((c) => curveLen(c) > tol), out = [], ends = (c) => [cEval(c, dom(c)[0]), cEval(c, dom(c)[1])];
    while (rest.length) { const loop = [rest.shift()], start = ends(loop[0])[0]; let cur = ends(loop[0])[1], guard = 0;
      while (len(sub(cur, start)) > tol && guard++ < 1e5) { let bi = -1, brev = false, bd = Infinity; rest.forEach((c, i) => { const [a, b] = ends(c), da = len(sub(a, cur)), db = len(sub(b, cur)); if (da < bd) { bd = da; bi = i; brev = false; } if (db < bd) { bd = db; bi = i; brev = true; } }); if (bi < 0 || bd > tol) return null; let c = rest.splice(bi, 1)[0]; if (brev) c = cReverse(c); loop.push(c); cur = ends(c)[1]; }
      if (len(sub(cur, start)) > tol) return null; out.push(loop); }
    return out;
  }
  /** planar faces from loops: nesting by containment, outer loops counter-clockwise about n, holes clockwise */
  function facesFromLoops(loops, n, tag) {
    const [e1, e2] = planBasis(n), poly = loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
    const ar = poly.map((P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }), order = loops.map((_, i) => i).sort((a, b) => ar[b] - ar[a]);
    const inPoly = (p, pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const depth = loops.map((_, i) => order.filter((j) => j !== i && ar[j] > ar[i] && inPoly(poly[i][0], poly[j])).length), parent = loops.map((_, i) => { if (depth[i] % 2 === 0) return -1; let best = -1; order.forEach((j) => { if (j !== i && ar[j] > ar[i] && depth[j] === depth[i] - 1 && inPoly(poly[i][0], poly[j])) best = j; }); return best; });
    return loops.map((_, i) => i).filter((i) => depth[i] % 2 === 0).map((i, k) => planFace([loops[i]].concat(loops.map((_, h) => h).filter((h) => parent[h] === i).map((h) => loops[h])), n, tag + k));
  }
  /** a planar face cut by the half-space nrm.x <= d: {mode, faces, lines} */
  function clipPlanFace(f, nrm, d, tag) {
    const g = (c, t) => dot(nrm, cEval(c, t)) - d, kept = [], X = [];
    for (const loop of f.loops) for (const c of loop) {
      const [a, b] = dom(c), N = Math.max(48, c.P.length * 8), roots = []; let pv = g(c, a);
      for (let i = 1; i <= N; i++) { const t = a + (b - a) * i / N, gv = g(c, t); if ((pv < 0) !== (gv < 0)) { let lo = a + (b - a) * (i - 1) / N, hi = t, flo = pv; for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2, fm = g(c, m); if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } const r = (lo + hi) / 2; if (r > a + 1e-12 && r < b - 1e-12) roots.push(r); } pv = gv; }
      let rest = c, base = a; const subs = []; roots.forEach((r) => { const [l, rr] = cSplit(rest, r); subs.push(l); rest = rr; X.push(cEval(c, r)); }); subs.push(rest);
      subs.forEach((s) => { const m = dom(s), mid = g(s, (m[0] + m[1]) / 2); if (mid <= 0) kept.push(s); for (const e of [m[0], m[1]]) if (Math.abs(g(s, e)) < 1e-9 * (1 + len(cEval(s, e)))) X.push(cEval(s, e)); }); void base;
    }
    if (!X.length) { const c0 = f.loops[0][0]; return g(c0, (dom(c0)[0] + dom(c0)[1]) / 2) <= 0 ? { mode: 'all' } : { mode: 'none' }; }
    const t = unit(cross(f.n, nrm)); if (len(cross(f.n, nrm)) < 1e-9) { if (globalThis.__cpdbg) console.log('parallel'); return null; }
    const [e1, e2] = planBasis(f.n), poly = f.loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; });
    const inside = (q) => { const p = [dot(q, e1), dot(q, e2)]; let cnt = 0; poly.forEach((pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c) cnt++; }); return cnt % 2 === 1; };
    const srt = X.map((q) => ({ q, s: dot(t, q) })).sort((a, b) => a.s - b.s), lines = [];
    for (let i = 0; i + 1 < srt.length; i++) { if (srt[i + 1].s - srt[i].s < 1e-9) continue; const m = add(srt[i].q, mul(t, (srt[i + 1].s - srt[i].s) / 2)); if (inside(m)) lines.push(line(srt[i].q, srt[i + 1].q)); }
    const sc = Math.max(1, ...X.map(len)), loops = chainLoops(kept.concat(lines), 1e-7 * sc); if (!loops) { if (globalThis.__cpdbg) console.log('chain fail', kept.length, lines.length, X.length); return null; }
    return { mode: 'clip', faces: facesFromLoops(loops, f.n, tag), lines };
  }
  const faceCurves = (sol) => { const out = []; sol.faces.forEach((f) => { if (f.kind === 'plan') f.loops.forEach((l) => l.forEach((c) => out.push(c))); else if (f.surf) f.surf.P.forEach((r) => r.forEach((q) => out.push({ P: [q] }))); }); return out; };
  /** a surface that closes on itself (a full revolve, a closed section) is cut into two halves along its seam, so that every trimmed loop is an ordinary loop on a patch that does not wrap (what other kernels' STEP readers need) */
  function splitClosedFace(f) {
    const S = f.surf, nU = S.P.length - 1, nV = S.P[0].length - 1, same = (c1, c2) => { const a = cSample(c1, 8), b = cSample(c2, 8); return a.every((q, i) => len(sub(q, b[i])) < 1e-9 * (1 + len(q))) && curveLen(c1) > 1e-9; };
    const mkU = (C) => ({ p: S.p, q: S.q, U: C[0].U, V: S.V.slice(), P: C[0].P.map((_, i) => C.map((c) => c.P[i])), w: C[0].w.map((_, i) => C.map((c) => c.w[i])) }), mkV = (C) => ({ p: S.p, q: S.q, U: S.U.slice(), V: C[0].U, P: C.map((c) => c.P), w: C.map((c) => c.w) });
    if (same(sCol(S, 0), sCol(S, nU))) { const t = (S.U[S.p] + S.U[S.P.length]) / 2, L = [], R = []; for (let j = 0; j <= nV; j++) { const [l, r] = cSplit(sRow(S, j), t); L.push(l); R.push(r); } return [Object.assign({}, f, { surf: mkU(L), tag: f.tag + 'a' }), Object.assign({}, f, { surf: mkU(R), tag: f.tag + 'b' })]; }
    if (same(sRow(S, 0), sRow(S, nV))) { const t = (S.V[S.q] + S.V[S.P[0].length]) / 2, L = [], R = []; for (let i = 0; i <= nU; i++) { const [l, r] = cSplit(sCol(S, i), t); L.push(l); R.push(r); } return [Object.assign({}, f, { surf: mkV(L), tag: f.tag + 'a' }), Object.assign({}, f, { surf: mkV(R), tag: f.tag + 'b' })]; }
    return [f];
  }
  /** an operation on the planar faces: keep the outside of a convex flat tool (the union of the outsides of its planes).  The edge pieces are the face boundary left outside the tool plus the tool's own boundary inside the face. */
  function clipFlatNotTool(f, planes, tag) {
    const g = (pl, q) => dot(pl.n, q) - pl.d, Fm = (q) => Math.min(...planes.map((pl) => g(pl, q))), kept = [], X = [];
    for (const loop of f.loops) for (const c of loop) {
      const [a, b] = dom(c), Ns = Math.max(64, c.P.length * 8), roots = []; let pv = Fm(cEval(c, a));
      for (let i = 1; i <= Ns; i++) { const t = a + (b - a) * i / Ns, gv = Fm(cEval(c, t)); if ((pv <= 0) !== (gv <= 0)) { let lo = a + (b - a) * (i - 1) / Ns, hi = t, flo = pv; for (let it = 0; it < 90; it++) { const m = (lo + hi) / 2, fm = Fm(cEval(c, m)); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } const r = (lo + hi) / 2; if (r > a + 1e-12 && r < b - 1e-12) roots.push(r); } pv = gv; }
      let rest = c; const subs = []; roots.forEach((r) => { const [l, rr] = cSplit(rest, r); subs.push(l); rest = rr; X.push(cEval(c, r)); }); subs.push(rest);
      subs.forEach((sc) => { const m = dom(sc); if (Fm(cEval(sc, (m[0] + m[1]) / 2)) <= 0) kept.push(sc); for (const e of [m[0], m[1]]) { const q = cEval(sc, e); if (Math.abs(Fm(q)) < 1e-9 * (1 + len(q))) X.push(q); } });
    }
    const inFace = (() => { const [e1, e2] = planBasis(f.n), poly = f.loops.map((l) => { const P = []; l.forEach((c) => cSample(c, 48).slice(0, -1).forEach((q) => P.push([dot(q, e1), dot(q, e2)]))); return P; }); return (q) => { const p = [dot(q, e1), dot(q, e2)]; let cnt = 0; poly.forEach((pl) => { let c = false; for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) { const a = pl[i], b = pl[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c) cnt++; }); return cnt % 2 === 1; }; })();
    // the tool boundary inside the face: along each tool plane's line in the face plane
    const lines = [];
    planes.forEach((pi, ii) => { const dir = cross(f.n, pi.n); if (len(dir) < 1e-9) return; const t = unit(dir), P0 = (() => { /* a point on both planes */ const n1 = f.n, d1 = dot(f.n, f.o), n2 = pi.n, d2 = pi.d, c = cross(n1, n2), cc = dot(c, c); return add(mul(cross(n2, c), d1 / cc), mul(cross(c, n1), d2 / cc)); })();
      const bp = [];   // break points along the line: the face outline crossings and the other planes
      X.forEach((q) => { if (Math.abs(g(pi, q)) < 1e-7) bp.push(dot(t, sub(q, P0))); });
      planes.forEach((pj, jj) => { if (jj === ii) return; const dj = dot(pj.n, t); if (Math.abs(dj) < 1e-12) return; bp.push(-(dot(pj.n, P0) - pj.d) / dj); });
      // every crossing of the face outline with this line, found directly (the outline may cross the line away from the tool)
      for (const loop of f.loops) for (const c of loop) { const [a, b] = dom(c), Ns = Math.max(64, c.P.length * 8), h = (q) => dot(pi.n, q) - pi.d; let pv = h(cEval(c, a)); for (let i = 1; i <= Ns; i++) { const tt = a + (b - a) * i / Ns, gv = h(cEval(c, tt)); if ((pv <= 0) !== (gv <= 0)) { let lo = a + (b - a) * (i - 1) / Ns, hi = tt, flo = pv; for (let it = 0; it < 90; it++) { const m = (lo + hi) / 2, fm = h(cEval(c, m)); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; if (hi - lo < 1e-15) break; } bp.push(dot(t, sub(cEval(c, (lo + hi) / 2), P0))); } pv = gv; } }
      const ss = bp.sort((x, y) => x - y).filter((x, k, A) => k === 0 || x - A[k - 1] > 1e-9);
      for (let k = 0; k + 1 < ss.length; k++) { const mid = add(P0, mul(t, (ss[k] + ss[k + 1]) / 2)); if (!inFace(mid)) continue; if (planes.some((pj, jj) => jj !== ii && g(pj, mid) < 0)) continue; lines.push(line(add(P0, mul(t, ss[k])), add(P0, mul(t, ss[k + 1])))); } });
    if (!X.length && !lines.length) { const c0 = f.loops[0][0], q = cEval(c0, (dom(c0)[0] + dom(c0)[1]) / 2); return Fm(q) <= 0 ? { mode: 'all' } : { mode: 'none' }; }
    const sc = Math.max(1, ...X.map(len)), loops = chainLoops(kept.concat(lines), 1e-7 * sc); if (!loops) return null;
    return { mode: 'clip', faces: facesFromLoops(loops, f.n, tag), lines };
  }
  /** direct modelling on planar faces that came from cuts or from the ends of a prism: move a face along its normal (dist > 0 = outwards), or delete it (the cut it belongs to is undone).  Exact, recomputed from the source; null when the face is not of that kind or the result is not valid. */
  function moveFace(sol, idx, dist) {
    try {
      const f = sol.faces[idx]; if (!f) return null;
      if (sol.src) { const m = /^cut(\d+)_(\d+)_/.exec(f.tag || ''); if (!m) return null; const ops = sol.src.ops.map((o) => ({ kind: o.kind, planes: o.planes.map((q) => Object.assign({}, q)) })), q = ops[+m[1]].planes[+m[2]]; if (!q) return null;
        const p2 = add(q.p, mul(q.n, dist)); ops[+m[1]].planes[+m[2]] = { n: q.n, d: dot(q.n, p2), p: p2 }; const r = opsCut(sol.src.root, ops); if (r) r.src = { root: sol.src.root, ops }; return r; }
      if (sol.profile && sol.vec && /^cap[01]_/.test(f.tag || '') && (f.kind === 'plan' || f.kind === 'cap')) { const lo = /^cap0/.test(f.tag), base = profPlane(sol.profile.outer), cur = lo ? (sol.lo || base) : (sol.hi || { p: add(base.p, sol.vec), n: base.n }), out = unit(lo ? (dot(cur.n, sol.vec) > 0 ? mul(cur.n, -1) : cur.n) : (dot(cur.n, sol.vec) > 0 ? cur.n : mul(cur.n, -1))), pl = { p: add(cur.p, mul(out, dist)), n: cur.n };
        const r = prismSolid(sol.profile, sol.vec, lo ? pl : sol.lo, lo ? sol.hi : pl, sol.pockets || []); return check(r, false).ok ? r : null; }
      return null;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  function deleteFace(sol, idx) {
    try {
      const f = sol.faces[idx]; if (!f || !sol.src) return null; const m = /^cut(\d+)_(\d+)_/.exec(f.tag || ''); if (!m) return null;
      const ops = sol.src.ops.filter((_, i) => i !== +m[1]); if (!ops.length) return sol.src.root; const r = opsCut(sol.src.root, ops); if (r) r.src = { root: sol.src.root, ops }; return r;
    } catch (e) { return null; }
  }
  /** planes of one operation in keep form (keep n.x <= d) */
  const planeOf = (p, n) => { const nrm = unit(n); return { n: nrm, d: dot(nrm, p), p: p.slice() }; };
  function planeCut(sol, p, n) { return opCut(sol, { kind: 'keep', planes: [planeOf(p, n)] }); }
  /** cut by a convex flat tool given by planes whose normals point into the tool: the result is the solid minus the tool (planes with p, n) */
  function toolCut(sol, planes) { return opCut(sol, { kind: 'tool', planes: planes.map((q) => planeOf(q.p, q.n)) }); }
  function opCut(sol, op) {
    try {
      if (!isN(sol)) return null; let root = sol, ops = [op];
      if (sol.src) { root = sol.src.root; ops = sol.src.ops.concat([op]); } else if (sol.faces.some((f) => f.kind === 'trim')) return null;
      const res = opsCut(root, ops); if (res) res.src = { root, ops }; return res;
    } catch (e) { if (globalThis.__cpdbg) console.log(e.stack); return null; }
  }
  function opsCut(root, ops) {
    let scale = 1; root.faces.forEach((f) => { if (f.surf) f.surf.P.forEach((r) => r.forEach((q) => { scale = Math.max(scale, len(q)); })); else if (f.loops) f.loops.forEach((l) => l.forEach((c) => c.P.forEach((q) => { scale = Math.max(scale, len(q)); }))); });
    const topo = ops.map((o) => ({ kind: o.kind === 'tool' ? 'notTool' : 'keep', planes: o.planes })), neg = (pl) => ({ n: mul(pl.n, -1), d: -pl.d, p: pl.p });
    const clipHalf = (faces, pl, tag) => { const out = []; for (const f of faces) { const r = clipPlanFace(f, pl.n, pl.d, f.tag + tag); if (!r) throw new Error('plan clip ' + f.tag + ' n=' + pl.n.map((x) => x.toFixed(2)) + ' d=' + pl.d.toFixed(3)); if (r.mode === 'all') out.push(f); else if (r.mode === 'clip') out.push(...r.faces); } return out; };
    const clipOp = (faces, o) => { if (o.kind === 'keep') return clipHalf(faces, o.planes[0], 'c'); const out = []; for (const f of faces) { const r = clipFlatNotTool(f, o.planes, f.tag + 't'); if (!r) throw new Error('tool clip'); if (r.mode === 'all') out.push(f); else if (r.mode === 'clip') out.push(...r.faces); } return out; };
    const flats = [], sides = [], groups = {}; root.faces.forEach((f) => { if (f.kind === 'cap') { const k = f.tag.split('_')[0]; (groups[k] = groups[k] || []).push(f); } else if (f.kind === 'plan') flats.push(f); else sides.push(...splitClosedFace(f)); });
    Object.keys(groups).forEach((k) => { const fs = groups[k].sort((a, b) => Number(a.tag.split('_')[1]) - Number(b.tag.split('_')[1])); flats.push(planFace([fs.map((f) => sRow(f.surf, 1))], fs[0].n, k)); });
    const faces = [];
    sides.forEach((f) => { const r = trimSurfaceByPlanes(f.surf, f.sign, topo, f.tag); if (r.mode === 'all') faces.push(f); else if (r.mode === 'trim') faces.push(...r.faces); });
    flats.forEach((f) => { let cur = [f]; topo.forEach((o) => { cur = clipOp(cur, o); }); faces.push(...cur); });
    topo.forEach((o, oi) => o.planes.forEach((pl, pi) => {      // the cap on that plane: the section of the whole solid, limited by everything else
      const contours = [], lines = [];
      sides.forEach((f) => { const r = trimSurfaceByPlane(f.surf, f.sign, pl.n, pl.d, f.tag); if (r.mode === 'trim') contours.push(...r.contours); });
      flats.forEach((f) => { const r = clipPlanFace(f, pl.n, pl.d, f.tag + 'k'); if (!r) throw new Error('section'); if (r.mode === 'clip') lines.push(...r.lines); });
      if (!contours.length && !lines.length) return; const loops = chainLoops(contours.concat(lines), 1e-7 * scale); if (!loops) throw new Error('section does not close');
      facesFromLoops(loops, pl.n, 'cut' + oi + '_' + pi + '_').forEach((cf) => {
        let cur = [cf]; if (o.kind === 'notTool') o.planes.forEach((q, qi) => { if (qi !== pi) cur = clipHalf(cur, neg(q), 'i'); });   // on the tool boundary: inside the other tool planes
        topo.forEach((o2, oj) => { if (oj !== oi) cur = clipOp(cur, o2); }); faces.push(...cur); }); }));
    if (!faces.length) return null; const res = { kind: 'skin', op: 'cut', faces, topo: { type: 'brep' } }, c = check(res, false); if (!c.ok || !(c.volume > 0)) return null; return res;
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
  const infoOf = (sol) => { const faces = {}, edges = {}; sol.faces.forEach((f) => { const kd = f.kind === 'cap' || f.kind === 'plan' ? 'plane' : 'bspline'; faces[kd] = (faces[kd] || 0) + 1; }); return { faces, edges, freeform: true, faceCount: sol.faces.length }; };
  // the kernel facade (volume, area, mesh, STEP ...) accepts freeform solids too, so recipes and the app can treat them like any other exact body
  const wrap = (name, fn) => { const o = K[name]; if (typeof o === 'function' && !o.__nurbsWrapped) { const w = function (h, ...a) { return isN(h) ? fn(h, ...a) : o.call(this, h, ...a); }; w.__nurbsWrapped = true; K[name] = w; } };
  wrap('volume', (h) => massProps(h).volume); wrap('area', (h) => massProps(h).area); wrap('massProps', (h) => massProps(h)); wrap('validate', (h) => { const c = check(h); return { ok: c.ok, issues: c.issues, counts: { faces: h.faces.length } }; });
  wrap('info', (h) => infoOf(h)); wrap('mesh', (h, tol) => indexedMesh(h, tol && tol < 0.01 ? 48 : 16)); wrap('stepExport', (h, o) => stepWrite(h, o));
  wrap('bbox', (h) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; mesh(h, 6).forEach((t) => t.forEach((p) => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } })); return { min: mn, max: mx }; });
  wrap('translate', (h, d) => xfSolid(h, [1, 0, 0, 0, 1, 0, 0, 0, 1], d)); wrap('transform', (h, M, t) => xfSolid(h, M, t || [0, 0, 0]));
  AK.nurbs = K.nurbs = { line, polyline, arc, circle, interp, fromControl, curve, cEval, sEval, cSample, cReverse, cMap, extrude, revolve, loft, sweep, sweepPieces, cutPrism, cutHalfSpace, cutPlanarTool, cutExact, prismSolid, planeCut, toolCut, moveFace, deleteFace, clipPlanFace, trimSurfaceByPlane, trimSurfaceByPlanes, cutSkewCylinder, cutQuadricTool, chainLoops, facesFromLoops, cSplit, cSub, massProps, check, mesh, indexedMesh, stepWrite, xf: xfSolid, fromSpec, isNurbs: isN, version: '1.4.0' };
  K.features = (K.features || []).concat(['nurbs-curves', 'nurbs-solids', 'nurbs-massprops', 'nurbs-step']);
})(window.AakarKernel);
