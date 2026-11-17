// ---------------------------------------------------------------- exact mass properties (Green's theorem on the true surfaces)
// Every closed-surface integral ∬ F(p)·n dA is evaluated in the face's own (u,v) space as  -∮ H du,  H(u,v) = ∫ g dv,
// with the boundary taken along the real edge curves and the inner integral by Gauss-Legendre.  g = F(P(u,v))·(Pu×Pv).
const FIELDS = [
  (p, n) => (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / 3,   // 0 volume
  (p, n) => p[0] * p[0] * n[0] / 2,                          // 1 ∫x
  (p, n) => p[1] * p[1] * n[1] / 2,                          // 2 ∫y
  (p, n) => p[2] * p[2] * n[2] / 2,                          // 3 ∫z
  (p, n) => p[0] * p[0] * p[0] * n[0] / 3,                   // 4 ∫x²
  (p, n) => p[1] * p[1] * p[1] * n[1] / 3,                   // 5 ∫y²
  (p, n) => p[2] * p[2] * p[2] * n[2] / 3,                   // 6 ∫z²
  (p, n) => p[0] * p[0] * p[1] * n[0] / 2,                   // 7 ∫xy
  (p, n) => p[1] * p[1] * p[2] * n[1] / 2,                   // 8 ∫yz
  (p, n) => p[2] * p[2] * p[0] * n[2] / 2                    // 9 ∫zx
];
const NC = 11; // [area, 10 fields]
function integrand(S, u, v, out) {
  const d = S.D(u, v), p = d.p, n = d.n; out[0] = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  for (let k = 0; k < 10; k++) out[k + 1] = FIELDS[k](p, n);
}
const innerN = (S) => (S.kind === 'sphere' || S.kind === 'torus') ? 20 : (S.kind === 'cone' ? 8 : 6);
/** H(u,v) = ∫_{vref}^{v} g(u,v') dv'  (all 11 components) */
function Hint(S, u, v, vref, out) {
  out.fill(0); if (v === vref) return;
  const n = innerN(S), g = gauss(n), h = (v - vref) / 2, m = (v + vref) / 2, t = new Array(NC);
  for (let i = 0; i < n; i++) { integrand(S, u, m + h * g.x[i], t); const w = g.w[i] * h; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
}
/** orient a loop so that its region lies to the left in (u,v) space */
function uvLoop(face, loop) { return face.rev ? loop.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd })) : loop; }
function frameCandidates() { return [[0.31, 0.47, 0.83], [-0.52, 0.21, 0.79], [0.66, -0.58, 0.47], [0.12, 0.91, -0.4], [-0.77, -0.3, 0.56], [0.4, -0.2, -0.89]].map(V.norm); }
function subPieces(pcs, n) { if (n <= 1) return pcs; const o = []; for (const [a, b] of pcs) for (let i = 0; i < n; i++) o.push([a + (b - a) * i / n, a + (b - a) * (i + 1) / n]); return o; }
function fibonacci(n) { const o = [], g = PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z); o.push([r * Math.cos(g * i), r * Math.sin(g * i), z]); } return o; }
/** points sampled densely along every loop of a face, in traversal order (loops oriented as stored) */
function loopSamples(face, per) { return face.loops.map(l => { const pts = []; l.forEach(ce => { const P = ce.edge.kind === 'poly' ? ce.edge.pts : ce.edge.sample(1e9, per || 64); const Q = ce.fwd ? P : P.slice().reverse(); for (let i = 0; i < Q.length - 1; i++) pts.push(Q[i]); }); return pts; }); }
/** a point of the sphere that certainly belongs to the face: just left of the middle of a boundary segment */
function sphereInner(face, S, loops) {
  const L = loops[0], i = Math.floor(L.length / 2), a = L[i], b = L[(i + 1) % L.length], m = V.mid(a, b), t = V.norm(V.sub(b, a)), n = face.normalAt(m), d = V.norm(V.cross(n, t));
  return S.project(V.madd(m, d, S.r * 2e-3));
}
/** is the direction q (a unit vector from the sphere centre) inside the face?  Stereographic projection from a known inner point turns this into a winding number. */
function sphereContains(face, S, loops, x0, q) {
  const d0 = V.norm(V.sub(x0, S.o)), fr = frame([0, 0, 0], d0, null), proj = (p) => { const w = V.norm(V.sub(p, S.o)), a = V.dot(w, fr.x), b = V.dot(w, fr.y), c = V.dot(w, d0), den = 1 - c; return [a / den, b / den]; };
  const t = proj(V.madd(S.o, q, S.r)); let tot = 0;
  for (const L of loops) { let prev = null, first = null, acc = 0; for (const p of L.concat([L[0]])) { const pp = proj(p), ang = Math.atan2(pp[1] - t[1], pp[0] - t[0]); if (prev !== null) { let d = ang - prev; while (d > PI) d -= TAU; while (d < -PI) d += TAU; acc += d; } prev = ang; } tot += acc / TAU; }
  return Math.abs(Math.round(tot)) === 0;   // winding 0 ↔ q lies in the face (the face contains the projection centre), ±1 ↔ outside
}
function pickSpherePole(face, S) {
  const loops = loopSamples(face, 64), pts = []; loops.forEach(L => { const step = Math.max(1, Math.floor(L.length / 400)); for (let i = 0; i < L.length; i += step) pts.push(V.norm(V.sub(L[i], S.o))); });
  let best = null; for (const c0 of fibonacci(160)) { const c = S.gdir(c0); let mx = 0; for (const p of pts) { const d = Math.abs(V.dot(p, c)); if (d > mx) mx = d; } const ang = Math.acos(Math.min(1, mx)); if (!best || ang > best.angle) best = { z: c, c, angle: ang }; }
  const x0 = sphereInner(face, S, loops);
  best.inside = sphereContains(face, S, loops, x0, best.c);
  return best;
}
/** U(u,v) = ∫_{uref}^{u} g(u',v) du'  (all 11 components) */
function Uint(S, u, v, uref, out) {
  out.fill(0); if (u === uref) return;
  const n = 32, g = gauss(n), h = (u - uref) / 2, m = (u + uref) / 2, t = new Array(NC);
  for (let i = 0; i < n; i++) { integrand(S, m + h * g.x[i], v, t); const w = g.w[i] * h; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
}
/** exact integrals over a trimmed torus face. The boundary is walked with continuous (unwrapped) angles. A loop that closes in v uses the v-antiderivative
 *  (∮ H du, H periodic in u), a loop that closes in u uses the u-antiderivative (∮ U dv, U periodic in v); a face with loops of both kinds, or a loop
 *  that winds both ways, is refused (the caller then falls back to the faceted estimate). If the face is the complement of its loops (negative signed area
 *  in the unwrapped angle plane) the whole torus is added. */
function torusTrimmed(face, S, sign) {
  const g = gauss(6), H = new Array(NC), loopsInfo = [];
  let areaSum = 0;
  for (const loop of face.loops) {
    const smp = []; let uprev = null, vprev = null, uoff = 0, voff = 0;
    for (const ce of uvLoop(face, loop)) {
      const e = ce.edge, pcs = subPieces(e.pieces(), 8), seq = ce.fwd ? pcs : pcs.slice().reverse();
      for (const [a, b] of seq) for (let ii = 0; ii < 6; ii++) {
        const i = ce.fwd ? ii : 5 - ii, t = (a + b) / 2 + (b - a) / 2 * g.x[i], w = g.w[i] * (b - a) / 2, p = e.pt(t); let dp = e.dpt(t); if (!ce.fwd) dp = V.neg(dp);
        const r = S.duv(p, dp); let u = r[0] + uoff, v = r[1] + voff;
        if (uprev !== null) { while (u - uprev > PI) { u -= TAU; uoff -= TAU; } while (u - uprev < -PI) { u += TAU; uoff += TAU; } while (v - vprev > PI) { v -= TAU; voff -= TAU; } while (v - vprev < -PI) { v += TAU; voff += TAU; } }
        uprev = u; vprev = v; smp.push({ u, v, du: r[2] * w, dv: r[3] * w });
      }
    }
    const n = smp.length, wu = Math.round((smp[n - 1].u - smp[0].u) / TAU), wv = Math.round((smp[n - 1].v - smp[0].v) / TAU);
    let ar = 0, mu = 0, mv = 0; for (let i = 0; i < n; i++) { const a = smp[i], b = smp[(i + 1) % n]; ar += (a.u * b.v - b.u * a.v) / 2; mu += a.u; mv += a.v; }
    loopsInfo.push({ smp, wu, wv, mu: mu / n, mv: mv / n }); areaSum += ar;
  }
  const pure = loopsInfo.every(L => L.wu === 0 && L.wv === 0), bandV = loopsInfo.every(L => L.wu === 0 && Math.abs(L.wv) === 1), bandU = loopsInfo.every(L => L.wv === 0 && Math.abs(L.wu) === 1);
  if (!pure && !bandV && !bandU) throw new Error('this torus face cannot be integrated exactly (mixed or multiple windings)');
  const norm = (x) => { x = x % TAU; return x < 0 ? x + TAU : x; };
  // a band that wraps the tube (bandV) is integrated with the u-antiderivative, one that wraps the axis (bandU) with the v-antiderivative; every loop pair (left edge, right edge) must be lifted to the same period
  if (bandV || bandU) {
    const key = bandV ? 'mu' : 'mv', wk = bandV ? 'wv' : 'wu', sh = bandV ? 'u' : 'v';
    const items = loopsInfo.map(L => ({ L, m: norm(L[key]) })).sort((p, q) => p.m - q.m), n = items.length;
    if (n % 2) throw new Error('unbalanced torus band');
    items.forEach(it => { it.shift = TAU * Math.round((it.m - it.L[key]) / TAU); });
    // bandV: region lies between a wv = -1 loop (lower u) and the next wv = +1 loop (higher u); bandU: between a wu = +1 loop (lower v) and the next wu = -1 loop
    const first = bandV ? -1 : 1;
    for (let k = 0; k < n; k++) if (items[k].L[wk] === first) {
      const nx = items[(k + 1) % n]; if (nx.L[wk] !== -first) throw new Error('torus band loops do not alternate');
      if ((k + 1) >= n) nx.shift += TAU;
    }
    items.forEach(it => it.L.smp.forEach(s => { s[sh] += it.shift; }));
  }
  const acc = new Array(NC).fill(0);
  for (const L of loopsInfo) for (const s of L.smp) {
    if (!bandV) { Hint(S, s.u, s.v, 0, H); for (let k = 0; k < NC; k++) acc[k] -= H[k] * s.du; }
    else { Uint(S, s.u, s.v, 0, H); for (let k = 0; k < NC; k++) acc[k] += H[k] * s.dv; }
  }
  if (pure && areaSum < 0) { const full = faceIntegrals(new Face(S, false, [])); for (let k = 0; k < NC; k++) acc[k] += full[k]; }   // the face is everything except the loops' interior
  const out = new Array(NC); out[0] = acc[0]; for (let k = 1; k < NC; k++) out[k] = acc[k] * sign; return out;
}
function faceIntegrals(face) {
  let S = face.surf; const out = new Array(NC).fill(0);
  const sign = face.rev ? -1 : 1;
  if (!face.loops.length) {
    // full closed periodic surface
    if (S.kind === 'sphere' || S.kind === 'torus') {
      const nu = 64, nv = 24, g = gauss(nv), t = new Array(NC), du = TAU / nu;
      for (let i = 0; i < nu; i++) {
        const u = i * du;
        if (S.kind === 'sphere') { for (let j = 0; j < nv; j++) { integrand(S, u, g.x[j] * PI / 2, t); const w = g.w[j] * PI / 2 * du; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } }
        else for (let j = 0; j < 64; j++) { integrand(S, u, j * TAU / 64, t); const w = du * TAU / 64; for (let k = 0; k < NC; k++) out[k] += w * t[k]; }
      }
      for (let k = 1; k < NC; k++) out[k] *= sign; return out;
    }
    throw new Error('face without a boundary on a ' + S.kind);
  }
  if (S.kind === 'torus') {
    if (!face.vrange) return torusTrimmed(face, S, sign);
    // a full turn about the axis between two tube angles: periodic trapezoid in u (exact for trig polynomials), Gauss-Legendre in v
    const [v0, v1] = face.vrange, [u0, u1] = face.urange || [0, TAU], nu = Math.max(8, Math.ceil(96 * (u1 - u0) / TAU)), du = (u1 - u0) / nu, np = Math.max(1, Math.ceil((v1 - v0) / (PI / 3))), g = gauss(10), t = new Array(NC);
    for (let i = 0; i < nu; i++) for (let q = 0; q < np; q++) { const a = v0 + (v1 - v0) * q / np, b = v0 + (v1 - v0) * (q + 1) / np; for (let j = 0; j < g.x.length; j++) { const v = (a + b) / 2 + g.x[j] * (b - a) / 2; if (face.urange) { for (let m = 0; m < g.x.length; m++) { const u = u0 + (i + 0.5 + g.x[m] / 2) * du; integrand(S, u, v, t); const w = g.w[j] * (b - a) / 2 * g.w[m] * du / 2; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } } else { integrand(S, i * du, v, t); const w = g.w[j] * (b - a) / 2 * du; for (let k = 0; k < NC; k++) out[k] += w * t[k]; } } }
    for (let k = 1; k < NC; k++) out[k] *= sign; return out;
  }
  let northInside = false, pieceSub = 1;
  if (S.kind === 'sphere') {
    const pol = pickSpherePole(face, S); S = new Sphere(frame(S.o, pol.z, S.x), S.r); northInside = pol.inside; if (pol.angle < 0.15) pieceSub = 4;
  }
  const vref = S.kind === 'sphere' ? -PI / 2 : S.kind === 'cone' ? S.apexV : 0;
  const g = gauss(6), H = new Array(NC), acc = new Array(NC).fill(0);
  let du_total = 0;
  for (const loop of face.loops) {
    for (const ce of uvLoop(face, loop)) {
      const e = ce.edge;
      for (const [a, b] of subPieces(e.pieces(), pieceSub)) for (let i = 0; i < 6; i++) {
        const t = (a + b) / 2 + (b - a) / 2 * g.x[i], w = g.w[i] * (b - a) / 2, p = e.pt(t); let dp = e.dpt(t); if (!ce.fwd) dp = V.neg(dp);
        const r = S.duv(p, dp); Hint(S, r[0], r[1], vref, H); const dw = ce.fwd ? w : w; // weight is positive; the sign of dp already carries the direction
        for (let k = 0; k < NC; k++) acc[k] -= H[k] * r[2] * dw; du_total += r[2] * dw;
      }
    }
  }
  if (S.kind === 'sphere' && northInside) {
    const nu = 64, du = TAU / nu;
    for (let i = 0; i < nu; i++) { Hint(S, i * du, PI / 2, vref, H); for (let k = 0; k < NC; k++) acc[k] += H[k] * du; }
  } else if (S.kind === 'cylinder' && Math.abs(Math.round(du_total / TAU)) > 0) throw new Error('a cylinder face with an unbalanced wrapping boundary is not closed');
  out[0] = acc[0];
  for (let k = 1; k < NC; k++) out[k] = acc[k] * sign;
  return out;
}
/** exact volume, area, centroid and inertia tensor of a closed body */
/** fallback for faces the exact integrator cannot handle (trimmed torus): flux through the face's own triangles (second-order accurate) */
function faceIntegralsTris(face) {
  const out = new Array(NC).fill(0); if (!face.tris || !face.tris.length) throw new Error('no triangles stored for the face');
  for (const [a, b, c] of face.tris) {
    const n = V.mul(V.cross(V.sub(b, a), V.sub(c, a)), 0.5); out[0] += V.len(n);
    for (const m of [V.mid(a, b), V.mid(b, c), V.mid(c, a)]) for (let k = 0; k < 10; k++) out[k + 1] += FIELDS[k](m, n) / 3;
  }
  return out;
}
function massProps(body) {
  const tot = new Array(NC).fill(0); let approx = 0;
  body.faces.forEach(f => { let r; try { r = faceIntegrals(f); } catch (e) { if (!f.tris) throw e; r = faceIntegralsTris(f); approx++; } for (let k = 0; k < NC; k++) tot[k] += r[k]; });
  const A = tot[0], Vv = tot[1], c = Math.abs(Vv) > 1e-300 ? [tot[2] / Vv, tot[3] / Vv, tot[4] / Vv] : [0, 0, 0];
  const [sx2, sy2, sz2, sxy, syz, szx] = [tot[5], tot[6], tot[7], tot[8], tot[9], tot[10]];
  const Io = [[sy2 + sz2, -sxy, -szx], [-sxy, sx2 + sz2, -syz], [-szx, -syz, sx2 + sy2]];
  const c2 = V.dot(c, c), I = Io.map((row, i) => row.map((x, j) => x - Vv * ((i === j ? c2 : 0) - c[i] * c[j])));
  return { volume: Vv, area: A, approximateFaces: approx, centroid: c, inertiaOrigin: Io, inertia: I, faceAreas: body.faces.map(f => { try { return faceIntegrals(f)[0]; } catch (e) { try { return faceIntegralsTris(f)[0]; } catch (e2) { return null; } } }) };
}
AK.massProps = massProps;
