// ---------------------------------------------------------------- AakarKernel 1.5: free-form STEP import and editing
// STEP files whose faces are B_SPLINE_SURFACE (rational or not, with knots or uniform / quasi-uniform / Bezier) are read into exact free-form solids
// (the same {faces, topo:{type:'brep'}} bodies the NURBS operations make): flat faces become 'plan' faces, B-spline faces become trimmed patches whose
// boundary is the STEP edge curves projected onto the surface (Newton).  Cylinders are read as exact rational patches as well.
//   K.stepImport / K.stepImportAll   use this reader for the solids that have B-spline faces; every other solid still goes through the analytic reader
//   K.nurbs.moveFace(sol, idx, dist) on an imported solid: a flat face moved OUTWARD grows exact side walls (each boundary edge swept along the normal);
//                                    moved INWARD it is an exact plane cut when the whole body lies behind the face.  Anything else returns null.
(function (AK) {
  const K = AK && AK.kernel; if (!K || !K.nurbs || K.stepFree || !AK.stepParse) return;
  const N = K.nurbs, V3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: (a) => Math.hypot(a[0], a[1], a[2]) };
  const { sub, add, mul, dot, cross, len } = V3, unit = (a) => { const l = len(a); if (!(l > 1e-14)) throw new Error('degenerate direction in STEP'); return mul(a, 1 / l); };
  const dom = (c) => [c.U[c.p], c.U[c.P.length]], sDom = (S) => [S.U[S.p], S.U[S.P.length], S.V[S.q], S.V[S.P[0].length]];
  const clampedKnots = (n, p) => { const U = []; for (let i = 0; i <= p; i++) U.push(0); for (let j = 1; j <= n - p; j++) U.push(j); for (let i = 0; i <= p; i++) U.push(n - p + 1); return U; };

  // ---- re-seaming of a patch that is closed in u (first and last control column coincide): the same surface with the seam moved to u = us (exact: knot insertion, then the two halves swap)
  const insertU = (S, t) => {
    const p = S.p, U = S.U, n = S.P.length - 1; let k = p; while (k < n && t >= U[k + 1]) k++;
    const H = S.P.map((row, i) => row.map((q, j) => { const w = S.w[i][j]; return [q[0] * w, q[1] * w, q[2] * w, w]; })), R2 = [];
    for (let i = 0; i <= n + 1; i++) { if (i <= k - p) R2.push(H[i]); else if (i > k) R2.push(H[i - 1]); else { const a = (t - U[i]) / (U[i + p] - U[i]); R2.push(H[i].map((h, j) => h.map((x, c) => a * x + (1 - a) * H[i - 1][j][c]))); } }
    return { p, q: S.q, U: U.slice(0, k + 1).concat([t], U.slice(k + 1)), V: S.V, P: R2.map((r) => r.map((h) => [h[0] / h[3], h[1] / h[3], h[2] / h[3]])), w: R2.map((r) => r.map((h) => h[3])) };
  };
  const reseamU = (S, us) => {
    const p = S.p, u0 = S.U[p], u1 = S.U[S.P.length], eq = (x) => Math.abs(x - us) < 1e-12 * (1 + Math.abs(us)); let T = S; while (T.U.filter(eq).length < p) T = insertU(T, us);
    const k = T.U.findIndex(eq), j = k - 1, nT = T.P.length, J = u0 + (u1 - us);
    const UA = [us].concat([], T.U.slice(k + p)); const A = { U: Array(p + 1).fill(u0).concat(T.U.slice(k + p, T.U.length - (p + 1)).map((x) => x - us + u0), Array(p + 1).fill(J)), P: T.P.slice(j), w: T.w.slice(j) }; void UA;
    const B = { U: Array(p + 1).fill(J).concat(T.U.slice(p + 1, k).map((x) => x - u0 + J), Array(p + 1).fill(u1)), P: T.P.slice(0, j + 1), w: T.w.slice(0, j + 1) };
    const U = A.U.slice(0, A.U.length - (p + 1)).concat(Array(p).fill(J), B.U.slice(p + 1));
    const out = { p, q: S.q, U, V: S.V, P: A.P.concat(B.P.slice(1)), w: A.w.concat(B.w.slice(1)) }; void nT;
    if (out.U.length !== out.P.length + p + 1) throw new Error('re-seaming of a closed B-spline patch failed (knots)');
    return out;
  };
  function readStep(text, ropts) {
    const ents = AK.stepParse(text);
    const get = (r) => { const e = ents.get(r.ref); if (e === undefined) throw new Error('missing STEP entity #' + r.ref); return e; };
    const typeOf = (e) => (Array.isArray(e) ? e.map((x) => x.type).join('+') : e.type), part = (e, t) => (Array.isArray(e) ? e.find((x) => x.type === t) : (e.type === t ? e : null));
    let scale = 1;
    for (const e of ents.values()) { const lu = Array.isArray(e) ? part(e, 'LENGTH_UNIT') : null; if (lu) { const si = part(e, 'SI_UNIT'); if (si) { const pre = si.args[0] && si.args[0].en; scale = pre === 'MILLI' ? 1 : pre === 'CENTI' ? 10 : pre === 'KILO' ? 1e6 : pre === 'MICRO' ? 1e-3 : 1000; } break; } if (Array.isArray(e) && part(e, 'CONVERSION_BASED_UNIT') && part(e, 'LENGTH_UNIT')) { scale = 25.4; break; } }
    const memo = new Map(), memoize = (r, fn) => { if (memo.has(r.ref)) return memo.get(r.ref); const v = fn(); memo.set(r.ref, v); return v; };
    const P3 = (r) => memoize(r, () => get(r).args[1].map((x) => x * scale)), D3 = (r) => memoize(r, () => unit(get(r).args[1]));
    const A2 = (r) => memoize(r, () => { const e = get(r), o = P3(e.args[1]), z = e.args[2] ? D3(e.args[2]) : [0, 0, 1]; let x = e.args[3] ? D3(e.args[3]) : null; if (!x) x = unit(Math.abs(z[0]) < 0.9 ? cross(z, [1, 0, 0]) : cross(z, [0, 1, 0])); x = unit(sub(x, mul(z, dot(x, z)))); return { o, z, x, y: cross(z, x) }; });

    // ---- surfaces
    const knotVec = (mult, kv) => { const U = []; kv.forEach((k, i) => { for (let j = 0; j < mult[i]; j++) U.push(k); }); return U; };
    const bsSurface = (e) => {
      let pu, pv, rows, mu, mv, ku, kv, W = null, kind;
      if (Array.isArray(e)) {
        const b = part(e, 'B_SPLINE_SURFACE'), kn = part(e, 'B_SPLINE_SURFACE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_SURFACE');
        pu = b.args[0]; pv = b.args[1]; rows = b.args[2]; if (kn) { mu = kn.args[0]; mv = kn.args[1]; ku = kn.args[2]; kv = kn.args[3]; } if (rat) W = rat.args[0]; kind = kn ? 'knots' : 'uniform';
      } else { pu = e.args[1]; pv = e.args[2]; rows = e.args[3]; if (e.type === 'B_SPLINE_SURFACE_WITH_KNOTS') { mu = e.args[8]; mv = e.args[9]; ku = e.args[10]; kv = e.args[11]; kind = 'knots'; } else kind = 'uniform'; }
      const P = rows.map((row) => row.map((r) => P3(r))), nu = P.length, nv = P[0].length;
      const U = kind === 'knots' ? knotVec(mu, ku) : clampedKnots(nu - 1, pu), Vk = kind === 'knots' ? knotVec(mv, kv) : clampedKnots(nv - 1, pv);
      if (U.length !== nu + pu + 1 || Vk.length !== nv + pv + 1) throw new Error('inconsistent B-spline surface (knots do not match the control net)');
      return { p: pu, q: pv, U, V: Vk, P, w: W ? W.map((r) => r.slice()) : P.map((r) => r.map(() => 1)) };
    };
    const surface = (r) => memoize(r, () => {
      const e = get(r), t = typeOf(e);
      if (t === 'PLANE') { const f = A2(e.args[1]); return { kind: 'plane', o: f.o, n: f.z }; }
      if (t === 'CYLINDRICAL_SURFACE') { const f = A2(e.args[1]); return { kind: 'cyl', f, r: e.args[2] * scale }; }
      if (/B_SPLINE_SURFACE/.test(t) || /UNIFORM_SURFACE|BEZIER_SURFACE/.test(t)) return { kind: 'bs', S: bsSurface(e) };
      throw new Error('this STEP file has a ' + t.toLowerCase().replace(/_/g, ' ') + ' next to free-form faces; only planes, cylinders and B-spline surfaces are read together');
    });

    // ---- edge curves (oriented along the loop)
    const bsCurve = (e) => {
      let deg, cps, mult, kv, w = null, uni = false;
      if (Array.isArray(e)) { const c = part(e, 'B_SPLINE_CURVE'), kn = part(e, 'B_SPLINE_CURVE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_CURVE'); deg = c.args[0]; cps = c.args[1].map(P3); if (kn) { mult = kn.args[0]; kv = kn.args[1]; } else uni = true; w = rat ? rat.args[0] : null; }
      else { deg = e.args[1]; cps = e.args[2].map(P3); if (e.type === 'B_SPLINE_CURVE_WITH_KNOTS') { mult = e.args[6]; kv = e.args[7]; } else uni = true; }
      const U = uni ? clampedKnots(cps.length - 1, deg) : knotVec(mult, kv);
      return N.curve(deg, U, cps, w ? w.slice() : cps.map(() => 1));
    };
    const nearestT = (c, P) => { const [a, b] = dom(c); let t = a, bd = Infinity; const M = Math.max(200, c.P.length * 40); for (let i = 0; i <= M; i++) { const tt = a + (b - a) * i / M, d = len(sub(N.cEval(c, tt), P)); if (d < bd) { bd = d; t = tt; } } let lo = Math.max(a, t - (b - a) / M), hi = Math.min(b, t + (b - a) / M); for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (len(sub(N.cEval(c, m1), P)) < len(sub(N.cEval(c, m2), P))) hi = m2; else lo = m1; } return (lo + hi) / 2; };
    const edgeCurve = (r) => memoize(r, () => {
      const e = get(r), a = P3(get(e.args[1]).args[1]), b = P3(get(e.args[2]).args[1]), same = !(e.args[4] && e.args[4].en === 'F'); let cur = get(e.args[3]);
      while (['SURFACE_CURVE', 'SEAM_CURVE', 'INTERSECTION_CURVE', 'BOUNDED_SURFACE_CURVE'].indexOf(typeOf(cur)) >= 0) cur = get(cur.args[1]);
      const t = typeOf(cur); let c;
      if (t === 'LINE') c = N.line(a, b);
      else if (t === 'CIRCLE') {
        const f = A2(cur.args[1]), rad = cur.args[2] * scale, ang = (p) => { const d = sub(p, f.o); return Math.atan2(dot(d, f.y), dot(d, f.x)); };
        const full = len(sub(a, b)) < 1e-9 * (1 + rad); c = same ? N.arc(f.o, f.x, f.y, rad, ang(a), full ? ang(a) + 2 * Math.PI : ang(b)) : N.arc(f.o, f.x, f.y, rad, ang(b), full ? ang(b) + 2 * Math.PI : ang(a));
        if (!same) c = N.cReverse(c);
        return c;
      } else if (/B_SPLINE_CURVE/.test(t)) {
        c = bsCurve(cur); const [d0, d1] = dom(c), closed = len(sub(a, b)) < 1e-9 * (1 + len(a));
        if (!closed) { let ta = nearestT(c, a), tb = nearestT(c, b); if (!same) { const x = ta; ta = tb; tb = x; } const lo = Math.min(ta, tb), hi = Math.max(ta, tb); if (hi - lo < (d1 - d0) * 1 - 1e-9 * (d1 - d0)) c = N.cSub(c, Math.max(d0, lo), Math.min(d1, hi)); if (!same) c = N.cReverse(c); }
        else if (!same) c = N.cReverse(c);
        return c;
      } else throw new Error('this STEP file has a ' + t.toLowerCase().replace(/_/g, ' ') + ' edge next to free-form faces; only lines, circles and B-splines are read together');
      return c;     // LINE
    });

    // ---- loops
    const loopCurves = (br) => {
      const b = get(br), lp = get(b.args[1]); if (lp.type !== 'EDGE_LOOP') return null;
      let cs = lp.args[1].map((or) => { const o = get(or), c = edgeCurve(o.args[3]), fwd = !(o.args[4] && o.args[4].en === 'F'); return fwd ? c : N.cReverse(c); });
      if (b.args[2] && b.args[2].en === 'F') cs = cs.slice().reverse().map((c) => N.cReverse(c));
      return { cs, outer: b.type === 'FACE_OUTER_BOUND' };
    };
    const areaVec = (cs) => { const pts = []; cs.forEach((c) => N.cSample(c, 32).slice(0, -1).forEach((q) => pts.push(q))); let a = [0, 0, 0]; for (let i = 1; i + 1 < pts.length; i++) a = add(a, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]))); return mul(a, 0.5); };

    // ---- projection onto a B-spline surface
    const invert = (S, P, guess) => {
      const [u0, u1, v0, v1] = sDom(S); let u, v;
      if (guess) { u = guess[0]; v = guess[1]; }
      else { let bd = Infinity; const G = 24; for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) { const uu = u0 + (u1 - u0) * i / G, vv = v0 + (v1 - v0) * j / G, d = len(sub(N.sEval(S, uu, vv), P)); if (d < bd) { bd = d; u = uu; v = vv; } } }
      for (let it = 0; it < 60; it++) {
        const e = N.sEval(S, u, v, true), r = sub(e.p, P), a = dot(e.u, e.u), b = dot(e.u, e.v), c = dot(e.v, e.v), g1 = dot(e.u, r), g2 = dot(e.v, r), det = a * c - b * b; if (Math.abs(det) < 1e-24) break;
        let du = -(c * g1 - b * g2) / det, dv = -(a * g2 - b * g1) / det; const nu = Math.min(u1, Math.max(u0, u + du)), nv = Math.min(v1, Math.max(v0, v + dv));
        if (Math.abs(nu - u) < 1e-13 * (u1 - u0) && Math.abs(nv - v) < 1e-13 * (v1 - v0)) { u = nu; v = nv; break; } u = nu; v = nv;
      }
      return { uv: [u, v], d: len(sub(N.sEval(S, u, v), P)) };
    };
    const uvOfCurve = (S, c, size, carryTh) => {
      const n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)), pts = [], [a, b] = dom(c); let prev = null;
      let prevTh = carryTh === undefined ? null : carryTh;
      for (let i = 0; i <= n; i++) { const P = N.cEval(c, a + (b - a) * i / n); let g = prev;
        if (S.cyl) { const d = sub(P, S.cyl.f.o); let th = Math.atan2(dot(d, S.cyl.f.y), dot(d, S.cyl.f.x)); if (prevTh === null) { while (th < S.cyl.th0 - 1e-9) th += 2 * Math.PI; while (th > S.cyl.th0 + 2 * Math.PI - 1e-9) th -= 2 * Math.PI; } else { while (th - prevTh > Math.PI) th -= 2 * Math.PI; while (th - prevTh < -Math.PI) th += 2 * Math.PI; } prevTh = th; g = [S.U[S.p] + (S.U[S.P.length] - S.U[S.p]) * Math.min(1, Math.max(0, (th - S.cyl.th0) / S.cyl.span)), Math.min(S.V[S.V.length - 1], Math.max(S.V[0], dot(d, S.cyl.f.z)))]; }
        const r = invert(S, P, g); if (r.d > 2e-3 * size + 1e-6) { throw new Error((closedIn(S, 0, size) || closedIn(S, 1, size)) ? 'a loop of this STEP face crosses the seam of a closed B-spline patch; faces that straddle a seam are not read yet (rotate the part or split the face at the seam)' : 'a STEP edge does not lie on its B-spline face (distance ' + r.d.toExponential(2) + ')'); } prev = r.uv; if (pts.length && Math.hypot(r.uv[0] - pts[pts.length - 1][0], r.uv[1] - pts[pts.length - 1][1]) < 1e-12) continue; pts.push(r.uv); }
      pts.lastTh = prevTh; return pts;
    };
    // a closed patch (a tube: first and last control column coincide) has its seam at both ends of the parameter range; points that sit exactly on the seam
    // go to the side their neighbours are on, so a loop that crosses the seam closes in the parameter rectangle
    const closedIn = (S, dir, size) => { const nU = S.P.length - 1, nV = S.P[0].length - 1; if (dir === 0) return S.P[0].every((q, j) => len(sub(q, S.P[nU][j])) < 1e-8 * size + 1e-9 && Math.abs(S.w[0][j] - S.w[nU][j]) < 1e-9); return S.P.every((row) => len(sub(row[0], row[nV])) < 1e-8 * size + 1e-9 && true); };
    const seamFix = (S, pieces, size) => {
      const [u0, u1, v0, v1] = sDom(S), flat = []; pieces.forEach((pc) => pc.uv.forEach((q, k) => flat.push({ q, pc, k })));
      [[0, u0, u1], [1, v0, v1]].forEach(([d, lo, hi]) => {
        if (!closedIn(S, d, size)) return; const eps = 1e-9 * (hi - lo) + 1e-12, on = flat.map((x) => Math.abs(x.q[d] - lo) < eps || Math.abs(x.q[d] - hi) < eps), M = flat.length; if (!on.some(Boolean) || on.every(Boolean)) return;
        for (let i = 0; i < M; i++) {
          if (!on[i] || (on[(i + M - 1) % M] && !(false))) { if (!on[i]) continue; }
          if (!on[i]) continue; if (on[(i + M - 1) % M]) continue;                         // start of a run of seam points
          let j = i; while (on[(j + 1) % M]) j++; const before = flat[(i + M - 1) % M].q[d], after = flat[(j + 1) % M].q[d], mid = (lo + hi) / 2;
          const side = (before + after) / 2 < mid ? lo : hi; for (let k = i; k <= j; k++) flat[k % M].q[d] = side;
        }
      });
    };
    const shoe = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

    // ---- cylinder faces: an exact rational patch over the angle / height range of the loops, then the same trimming as any other patch
    const cylPatch = (sf, loops, forceTh0) => {
      const f = sf.f, th = [], ts = []; loops.forEach((l) => l.cs.forEach((c) => N.cSample(c, 360).forEach((q) => { const d = sub(q, f.o); th.push(Math.atan2(dot(d, f.y), dot(d, f.x))); ts.push(dot(d, f.z)); })));
      let tmin = Math.min(...ts), tmax = Math.max(...ts); const pad = (tmax - tmin) * 0.02 + 1e-6; tmin -= pad; tmax += pad;
      const sorted = th.slice().sort((x, y) => x - y); let gap = -1, gi = 0; for (let i = 0; i < sorted.length; i++) { const nx = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI, g = nx - sorted[i]; if (g > gap) { gap = g; gi = i; } }
      const full = gap < 0.02 || forceTh0 !== undefined, th0 = forceTh0 !== undefined ? forceTh0 : full ? thOf(f, N.cEval(loops[0].cs[0], dom(loops[0].cs[0])[0])) : (gi + 1 < sorted.length ? sorted[gi + 1] : sorted[0]), sweep = full ? 2 * Math.PI : 2 * Math.PI - gap, margin = full ? 0 : Math.min(0.02, gap / 4);
      const ar = N.arc(f.o, f.x, f.y, sf.r, th0 - margin, th0 - margin + sweep + 2 * margin);
      // u runs around (rational quadratic arc), v along the axis (degree 1): Su x Sv points away from the axis
      const S = { p: ar.p, q: 1, U: ar.U.slice(), V: [tmin, tmin, tmax, tmax], P: ar.P.map((p) => [add(p, mul(f.z, tmin)), add(p, mul(f.z, tmax))]), w: ar.w.map((w) => [w, w]) };
      S.cyl = { f, th0: th0 - margin, span: sweep + 2 * margin };
      return S;
    };

    const thOf = (f, P) => { const d = sub(P, f.o); return Math.atan2(dot(d, f.y), dot(d, f.x)); };
    const loopTurn = (f, cs) => { let prev = null, first = 0; cs.forEach((c) => N.cSample(c, 48).forEach((q) => { let th = thOf(f, q); if (prev !== null) { while (th - prev > Math.PI) th -= 2 * Math.PI; while (th - prev < -Math.PI) th += 2 * Math.PI; } else first = th; prev = th; })); return prev - first; };
    const axial = (f, cs) => { let s = 0, n = 0; cs.forEach((c) => N.cSample(c, 8).forEach((q) => { s += dot(sub(q, f.o), f.z); n++; })); return s / n; };
    const revLoop = (cs) => cs.slice().reverse().map((c) => N.cReverse(c));
    /** a full cylinder wall bounded by two separate circles (no seam edge): cut the top circle at the seam of the bottom one and join both with two axial lines into ONE loop */
    const joinFullCylinder = (f, loops, size) => {
      const turns = loops.map((l) => loopTurn(f, l.cs)), wraps = turns.map((x) => Math.abs(Math.abs(x) - 2 * Math.PI) < 0.05);
      if (!wraps.some(Boolean)) return null; if (loops.length !== 2 || !wraps.every(Boolean)) throw new Error('a cylinder face of this STEP body wraps around its axis in a way that is not read yet');
      let L = loops.map((l, i) => (turns[i] > 0 ? l.cs : revLoop(l.cs)));                 // both counter-clockwise about the axis
      const order = axial(f, L[0]) <= axial(f, L[1]) ? [0, 1] : [1, 0], bot = L[order[0]], top0 = L[order[1]];
      const th0 = thOf(f, N.cEval(bot[0], dom(bot[0])[0])), p0 = N.cEval(bot[0], dom(bot[0])[0]);
      // rotate the top circle so that it starts where it crosses th0
      let top = top0, run = null, found = -1, tcut = 0; const thetaAt = (c, t, base) => { let th = thOf(f, N.cEval(c, t)); while (th - base > Math.PI) th -= 2 * Math.PI; while (th - base < -Math.PI) th += 2 * Math.PI; return th; };
      let prevTh = thOf(f, N.cEval(top0[0], dom(top0[0])[0])); const startTh = prevTh; const rel = (th) => { let d = (th - th0) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI; return d; };
      if (Math.abs(rel(startTh)) > 1e-7 && Math.abs(rel(startTh) - 2 * Math.PI) > 1e-7) {
        const target = th0 + Math.ceil((startTh - th0) / (2 * Math.PI)) * 2 * Math.PI; let th = startTh;
        for (let k = 0; k < top0.length && found < 0; k++) { const c = top0[k], [a, b] = dom(c), n = 96; let pt = th; for (let i = 1; i <= n; i++) { const t = a + (b - a) * i / n, cur = thetaAt(c, t, pt); if (cur >= target - 1e-12) { let lo = a + (b - a) * (i - 1) / n, hi = t, base = pt; for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (thetaAt(c, mid, base) >= target) hi = mid; else lo = mid; } found = k; tcut = (lo + hi) / 2; break; } pt = cur; } if (found < 0) th = pt; }
        if (found < 0) throw new Error('cannot place the seam of a cylinder face');
        const pieces = N.cSplit(top0[found], tcut); top = [pieces[1]].concat(top0.slice(found + 1), top0.slice(0, found), [pieces[0]]);
      }
      const pTop = N.cEval(top[0], dom(top[0])[0]), seamUp = N.line(p0, pTop);
      void run; void size;
      return [{ cs: bot.concat([seamUp], revLoop(top), [N.cReverse(seamUp)]), outer: true, th0 }];
    };
    // ---- closed B-spline patches: loops that cross the seam, or wind once around (a tube bounded by two circles)
    const invertP = (S, P, guess) => {
      const [u0, u1, v0, v1] = sDom(S), per = u1 - u0, wrapU = (x) => u0 + (((x - u0) % per) + per) % per; let u, v;
      if (guess) { u = guess[0]; v = guess[1]; } else { let bd = Infinity; const G = 24; for (let i = 0; i < G; i++) for (let j = 0; j <= G; j++) { const uu = u0 + per * i / G, vv = v0 + (v1 - v0) * j / G, d = len(sub(N.sEval(S, uu, vv), P)); if (d < bd) { bd = d; u = uu; v = vv; } } }
      for (let it = 0; it < 60; it++) {
        const e = N.sEval(S, wrapU(u), v, true), r = sub(e.p, P), a = dot(e.u, e.u), b = dot(e.u, e.v), c = dot(e.v, e.v), g1 = dot(e.u, r), g2 = dot(e.v, r), det = a * c - b * b; if (Math.abs(det) < 1e-24) break;
        const du = -(c * g1 - b * g2) / det, dv = -(a * g2 - b * g1) / det, nv = Math.min(v1, Math.max(v0, v + dv)); u += du; if (Math.abs(du) < 1e-13 * per && Math.abs(nv - v) < 1e-13 * (v1 - v0)) { v = nv; break; } v = nv;
      }
      return { uv: [u, v], d: len(sub(N.sEval(S, wrapU(u), v), P)) };
    };
    const sampleLoopU = (S, cs) => { const out = []; let g = null; cs.forEach((c) => { const [a, b] = dom(c), n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)); for (let i = 0; i <= n; i++) { const r = invertP(S, N.cEval(c, a + (b - a) * i / n), g); g = r.uv; out.push({ u: r.uv[0], v: r.uv[1], c, t: a + (b - a) * i / n }); } }); return out; };
    const uvLoopClosed = (S, cs, size) => {                       // unwrapped, continuous uv of a loop on a patch closed in u, shifted so that the loop lies inside the parameter range
      const [u0, u1] = sDom(S), per = u1 - u0; let g = null, lo = Infinity, hi = -Infinity;
      const lists = cs.map((c) => { const [a, b] = dom(c), n = Math.min(128, Math.max(24, (c.P.length - 1) * 2)), pts = []; for (let i = 0; i <= n; i++) { const P = N.cEval(c, a + (b - a) * i / n), r = invertP(S, P, g); if (r.d > 2e-3 * size + 1e-6) throw new Error('a STEP edge does not lie on its B-spline face (distance ' + r.d.toExponential(2) + ')'); g = r.uv; if (pts.length && Math.hypot(r.uv[0] - pts[pts.length - 1][0], r.uv[1] - pts[pts.length - 1][1]) < 1e-12) continue; pts.push([r.uv[0], r.uv[1]]); lo = Math.min(lo, r.uv[0]); hi = Math.max(hi, r.uv[0]); } return pts; });
      const sh = Math.floor((lo - u0 + 1e-9 * per) / per) * per; if (hi - sh > u1 + 1e-7 * per) throw new Error('a loop of this STEP face is wider than its closed B-spline patch');
      lists.forEach((pts) => pts.forEach((q) => { q[0] -= sh; if (q[0] > u1) q[0] = u1; if (q[0] < u0) q[0] = u0; }));
      return lists;
    };
    const prepClosed = (S, loops, size) => {
      const [u0, u1] = sDom(S), per = u1 - u0; const smp = loops.map((l) => sampleLoopU(S, l.cs)), turn = smp.map((s) => s[s.length - 1].u - s[0].u), k = turn.map((x) => Math.round(x / per));
      if (k.every((x) => x === 0)) {
        { let lo = Infinity, hi = -Infinity; smp.forEach((s) => s.forEach((x) => { lo = Math.min(lo, x.u); hi = Math.max(hi, x.u); })); if (hi - lo >= per * (1 - 1e-6)) { const us = u0 + (((lo - u0) % per) + per) % per; return (Math.abs(us - u0) < 1e-9 * per || Math.abs(us - u1) < 1e-9 * per) ? { S, loops } : { S: reseamU(S, us), loops }; } }    // the loop spans the whole range (seam edges at both ends)
        const m = []; smp.forEach((s) => s.forEach((x) => m.push((((x.u - u0) % per) + per) % per))); m.sort((a, b) => a - b); let gap = -1, ga = 0; for (let i = 0; i < m.length; i++) { const nx = i + 1 < m.length ? m[i + 1] : m[0] + per, g = nx - m[i]; if (g > gap) { gap = g; ga = m[i]; } }
        const seamIn = ga + gap > per - 1e-12 * per || (ga <= 1e-9 * per && false); if (seamIn || gap < 1e-6 * per) return { S, loops };       // the seam already lies in the empty gap
        return { S: reseamU(S, u0 + (((ga + gap / 2) % per + per) % per)), loops };
      }
      if (loops.length !== 2 || !k.every((x) => Math.abs(x) === 1)) throw new Error('a closed B-spline face of this STEP body wraps around in a way that is not read yet');
      // two rings: the lower one decides where the seam goes
      const cs0 = loops.map((l, i) => (k[i] > 0 ? l.cs : revLoop(l.cs))), vm = cs0.map((cs, i) => { const s = k[i] > 0 ? smp[i] : sampleLoopU(S, cs0[i]); return s.reduce((a, x) => a + x.v, 0) / s.length; });
      const ib = vm[0] <= vm[1] ? 0 : 1, bot = cs0[ib], top0 = cs0[1 - ib], sb = sampleLoopU(S, bot), us = u0 + (((sb[0].u - u0) % per) + per) % per;
      const S2 = Math.abs(us - u0) < 1e-12 * per ? S : reseamU(S, us), sB = sampleLoopU(S2, bot), sT = sampleLoopU(S2, top0);
      // top ring: cut where its (unwrapped) u reaches the end of the range, start there
      let cut = -1; for (let i = 1; i < sT.length; i++) if (sT[i].u >= u1 - 1e-12 * per && sT[i - 1].u < u1 - 1e-12 * per) { cut = i; break; }
      let top = top0; if (cut > 0 && Math.abs(sT[0].u - u0) > 1e-9 * per && Math.abs(sT[0].u - u1) > 1e-9 * per) {
        const hi = sT[cut], lo = sT[cut - 1]; let a = lo.t, b = hi.t, c = hi.c; if (lo.c !== hi.c) { a = dom(hi.c)[0]; } let g = [lo.u, lo.v];
        for (let it = 0; it < 60; it++) { const mid = (a + b) / 2, r = invertP(S2, N.cEval(c, mid), g); if (r.uv[0] >= u1) b = mid; else { a = mid; g = r.uv; } }
        const idx = top0.indexOf(c), parts = N.cSplit(c, (a + b) / 2); top = [parts[1]].concat(top0.slice(idx + 1), top0.slice(0, idx), [parts[0]]);
      }
      const nU = S2.P.length - 1, v0 = S2.V[S2.q], v1 = S2.V[S2.P[0].length], colAt = (i) => N.curve(S2.q, S2.V.slice(), S2.P[i].map((q) => q.slice()), S2.w[i].slice());
      const vb = sB[0].v, vt = invertP(S2, N.cEval(top[0], dom(top[0])[0]), null).uv[1], lo = Math.max(v0, Math.min(vb, vt)), hi = Math.min(v1, Math.max(vb, vt));
      const up = N.cSub(colAt(nU), lo, hi), down = N.cSub(colAt(0), lo, hi);
      return { S: S2, loops: [{ cs: bot.concat([up], revLoop(top), [N.cReverse(down)]), outer: true }] };
    };
    // ---- faces
    const faceOf = (fr, bodyScale) => {
      const f = get(fr); let sf = surface(f.args[2]); const same = !(f.args[3] && f.args[3].en === 'F');
      const loops = f.args[1].map(loopCurves).filter(Boolean); if (!loops.length) throw new Error('a STEP face has no edge loop');
      if (sf.kind === 'plane') {
        const n = same ? sf.n : mul(sf.n, -1);
        // outer loop first, counter-clockwise about the outward normal; holes clockwise
        let order = loops.slice().sort((a, b) => (b.outer ? 1 : 0) - (a.outer ? 1 : 0));
        const L = order.map((l, i) => { const ccw = dot(areaVec(l.cs), n) >= 0; return (ccw === (i === 0)) ? l.cs : l.cs.slice().reverse().map((c) => N.cReverse(c)); });
        return { kind: 'plan', loops: L, n, o: N.cEval(L[0][0], dom(L[0][0])[0]), sign: 1, tag: 'step' + fr.ref, refs: null };
      }
      let loopsU = loops, forceTh0; if (sf.kind === 'cyl') { const j = joinFullCylinder(sf.f, loops, bodyScale); if (j) { loopsU = j; forceTh0 = j[0].th0; } }
      if (sf.kind === 'bs' && closedIn(sf.S, 0, bodyScale)) { const pc = prepClosed(sf.S, loops, bodyScale); sf = Object.assign({}, sf, { S: pc.S }); loopsU = pc.loops; }
      const S = sf.kind === 'bs' ? sf.S : cylPatch(sf, loopsU, forceTh0), sign = same ? 1 : -1, size = bodyScale;
      const closedPath = sf.kind === 'bs' && closedIn(S, 0, size);
      const built = loopsU.map((l) => {
        let carryTh; const uvl = closedPath ? uvLoopClosed(S, l.cs, size) : null, pieces = l.cs.map((c, ci) => { if (uvl) return { type: 'c', c3: c, uv: uvl[ci] }; const uv = uvOfCurve(S, c, size, carryTh); carryTh = uv.lastTh; return { type: 'c', c3: c, uv }; }), poly = []; if (!closedPath) seamFix(S, pieces, size); pieces.forEach((pc) => pc.uv.slice(0, -1).forEach((q) => poly.push(q)));
        const f0 = pieces[0].uv[0], l0 = pieces[pieces.length - 1].uv[pieces[pieces.length - 1].uv.length - 1], [a0, a1, b0, b1] = sDom(S);
        if (Math.abs(f0[0] - l0[0]) > 1e-6 * (a1 - a0) + 1e-9 || Math.abs(f0[1] - l0[1]) > 1e-6 * (b1 - b0) + 1e-9) throw new Error('a face of this STEP body wraps around a closed surface (a full cylinder wall or a periodic B-spline); split it at a seam first, this is not read yet');
        return { pieces, poly, outer: l.outer, area: shoe(poly) };
      });
      let oi = built.findIndex((b) => b.outer); if (oi < 0) { let m = 0; built.forEach((b, i) => { if (Math.abs(b.area) > Math.abs(built[m].area)) m = i; }); oi = m; }
      const ordered = [built[oi]].concat(built.filter((_, i) => i !== oi));
      const out = ordered.map((b, i) => {
        let pieces = b.pieces; const ccw = b.area >= 0; if (ccw !== (i === 0)) pieces = pieces.slice().reverse().map((pc) => ({ type: 'c', c3: N.cReverse(pc.c3), uv: pc.uv.slice().reverse() }));
        return { pieces: pieces.map((pc) => ({ type: 'c', uvC: N.interp(pc.uv.map((q) => [q[0], q[1], 0]), Math.min(3, pc.uv.length - 1)), c3: pc.c3, plane: -1 })) };
      });
      return { kind: 'trim', surf: S, sign, tag: 'step' + fr.ref, loops: out };
    };

    const solids = [];
    for (const [id, e] of ents) {
      if (!e || e.type !== 'MANIFOLD_SOLID_BREP') continue; const sh = get(e.args[1]); if (sh.type !== 'CLOSED_SHELL') continue;
      const refs = sh.args[1], free = refs.some((fr) => { const sf = get(get(fr).args[2]); return /B_SPLINE_SURFACE|UNIFORM_SURFACE|BEZIER_SURFACE/.test(typeOf(sf)); });
      solids.push({ id, name: e.args[0] || ('solid' + id), free: free || !!(ropts && ropts.all), make: () => {
        let sc = 1; try { const bb = [Infinity, -Infinity]; refs.forEach((fr) => { const f = get(fr); f.args[1].forEach((b) => { const lp = get(get(b).args[1]); if (lp.type === 'EDGE_LOOP') lp.args[1].forEach((or) => { const c = edgeCurve(get(or).args[3]); const q = N.cEval(c, dom(c)[0]); bb[0] = Math.min(bb[0], q[0], q[1], q[2]); bb[1] = Math.max(bb[1], q[0], q[1], q[2]); }); }); }); sc = Math.max(1, bb[1] - bb[0]); } catch (er) { sc = 1; }
        const faces = refs.map((fr) => faceOf(fr, sc));
        const res = { kind: 'skin', op: 'import', faces, topo: { type: 'brep' }, stepName: e.args[0] || ('solid' + id) }, c = N.check(res, false);
        if (!c.ok) { if (c.volume < 0) { faces.forEach((f) => { f.sign = -f.sign; if (f.kind === 'plan') { f.n = mul(f.n, -1); f.loops = f.loops.map((l) => l.slice().reverse().map((cc) => N.cReverse(cc))); } }); } const c2 = N.check(res, false); if (!c2.ok) throw new Error('the free-form faces of this STEP body do not close into a solid (' + c.issues.join('; ') + ')'); }
       
        return res; } });
    }
    return solids;
  }

  const has = (text) => /B_SPLINE_SURFACE|UNIFORM_SURFACE|BEZIER_SURFACE/.test(text);
  const asText = (t) => (typeof t === 'string' ? t : new TextDecoder().decode(t));
  const oldAll = K.stepImportAll;
  K.stepImportAll = function (text) {
    const t = asText(text); if (!has(t)) return oldAll.call(this, t);
    const solids = readStep(t), free = solids.filter((s) => s.free); let analytic = [];
    if (solids.some((s) => !s.free)) { AK.__stepTol = true; try { analytic = oldAll.call(this, t); } finally { AK.__stepTol = false; } }
    return analytic.concat(free.map((s) => { const h = s.make(); return h; }));
  };
  K.stepImport = function (text) { const L = K.stepImportAll(text); if (!L.length) throw new Error('the STEP file contains no MANIFOLD_SOLID_BREP'); return L[0]; };

  // ---------------------------------------------------------------- editing of imported solids
  const isImp = (s) => !!(s && s.faces && s.topo && s.op === 'import');
  const planArea = (f) => { let t = 0; f.loops.forEach((l, i) => { const pts = []; l.forEach((c) => N.cSample(c, 400).slice(0, -1).forEach((q) => pts.push(q))); let a = [0, 0, 0]; for (let k = 1; k + 1 < pts.length; k++) a = add(a, cross(sub(pts[k], pts[0]), sub(pts[k + 1], pts[0]))); t += Math.abs(dot(a, f.n)) * 0.5 * (i === 0 ? 1 : -1); }); return t; };
  function moveImported(sol, idx, dist) {
    const f = sol.faces[idx]; if (!f || f.kind !== 'plan' || !(Math.abs(dist) > 1e-12)) return null; const n = unit(f.n), v0 = N.massProps(sol, 1).volume, A = planArea(f);
    if (dist > 0) {
      const faces = sol.faces.filter((_, i) => i !== idx).map((g) => g), sh = mul(n, dist);
      f.loops.forEach((l) => l.forEach((c) => { const S = { p: c.p, q: 1, U: c.U.slice(), V: [0, 0, 1, 1], P: c.P.map((P) => [P.slice(), add(P, sh)]), w: c.w.map((w) => [w, w]) }; faces.push({ kind: 'side', surf: S, sign: 1, tag: 'move' + idx + '_wall' }); }));
      faces.push({ kind: 'plan', loops: f.loops.map((l) => l.map((c) => N.cMap(c, (P) => add(P, sh)))), n: f.n, o: add(f.o, sh), sign: 1, tag: f.tag, refs: null });
      const res = { kind: 'skin', op: 'import', faces, topo: { type: 'brep' }, stepName: sol.stepName }; let c = N.check(res, false);
      if (!c.ok) { faces.forEach((g) => { if (g.kind === 'side') g.sign = -1; }); c = N.check(res, false); }
      return c.ok && Math.abs(c.volume - (v0 + A * dist)) < 2e-4 * Math.max(1, v0) ? res : null;
    }
    // inward: only a plane cut when every other face lies behind the moved plane, and every B-spline face is a whole patch (its loop is the border of the parameter rectangle)
    const whole = (g) => { if (g.kind !== 'trim') return true; const [u0, u1, v0, v1] = [g.surf.U[g.surf.p], g.surf.U[g.surf.P.length], g.surf.V[g.surf.q], g.surf.V[g.surf.P[0].length]], eu = 1e-7 * (u1 - u0), ev = 1e-7 * (v1 - v0);
      return g.loops.length === 1 && g.loops[0].pieces.every((pc) => pc.uvC && N.cSample(pc.uvC, 12).every((q) => Math.abs(q[0] - u0) < eu || Math.abs(q[0] - u1) < eu || Math.abs(q[1] - v0) < ev || Math.abs(q[1] - v1) < ev)); };
    if (!sol.faces.every(whole)) return null;
    sol = Object.assign({}, sol, { faces: sol.faces.map((g) => (g.kind === 'trim' ? { kind: 'side', surf: g.surf, sign: g.sign, tag: g.tag } : g)) }); delete sol.src;
    const p2 = add(f.o, mul(n, dist)), d2 = dot(n, p2); let behind = true;
    sol.faces.forEach((g, i) => { if (i === idx) return; const pts = []; if (g.kind === 'plan') g.loops.forEach((l) => l.forEach((c) => N.cSample(c, 8).forEach((q) => pts.push(q)))); else if (g.surf) { g.surf.P.forEach((r) => r.forEach((q) => pts.push(q))); } pts.forEach((q) => { if (dot(n, q) > dot(n, f.o) + 1e-7 * (1 + len(q))) behind = false; }); });
    if (!behind) return null;
    let r; try { r = N.planeCut(sol, p2, n); } catch (e) { return null; } if (!r) return null; const c = N.check(r, false);
    r.op = 'import'; r.stepName = sol.stepName; return c.ok && c.volume > 0 && c.volume < v0 ? r : null;
  }
  const oldMove = N.moveFace; N.moveFace = function (sol, idx, dist) { return isImp(sol) ? moveImported(sol, idx, dist) : oldMove.call(this, sol, idx, dist); };
  const oldDel = N.deleteFace; N.deleteFace = function (sol, idx) { return isImp(sol) ? null : oldDel.call(this, sol, idx); };
  AK.stepFree = K.stepFree = { read: readStep, has, moveImported };
})(window.AakarKernel);
