// ---------------------------------------------------------------- AakarKernel 1.2: exact edge rounding (fillet and chamfer)
// A round is a boolean: body - cutter, where the cutter is built from exact primitives, so the new face is a true cylinder or cone.
// Straight fillets / chamfers and circular chamfers are verified at several mesh resolutions. Circular FILLETS (torus) are tangent to two surfaces, which the BSP boolean cannot yet handle reliably: they are refused with an error so that the caller falls back to the faceted engine.
//   spec {kind:'line',   p0, p1, nA, nB}                      straight edge between two planar faces that meet at 90 degrees (outward normals nA, nB)
//   spec {kind:'circle', c, n, R, boss}                       circular rim: planar face with outward normal n, coaxial cylinder; boss = material inside the circle
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.roundEdge) return;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => { const l = len(a); if (!(l > 1e-12)) throw new Error('degenerate direction'); return mul(a, 1 / l); };
  /** place a model that was built in the local frame (x = a, y = b, z = c, origin o) */
  function place(h, a, b, c, o) {
    // rotation matrix columns a, b, c -> axis-angle
    const m = [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]], tr = m[0][0] + m[1][1] + m[2][2], cs = Math.max(-1, Math.min(1, (tr - 1) / 2)); let ang = Math.acos(cs), ax;
    if (ang < 1e-9) ax = null;
    else if (Math.PI - ang < 1e-6) { // 180 degrees: axis from the largest diagonal
      const d = [m[0][0], m[1][1], m[2][2]], i = d.indexOf(Math.max(d[0], d[1], d[2])), v = [0, 0, 0]; v[i] = Math.sqrt(Math.max(0, (m[i][i] + 1) / 2)); const j = (i + 1) % 3, k = (i + 2) % 3; v[j] = (m[i][j] + m[j][i]) / (4 * v[i]); v[k] = (m[i][k] + m[k][i]) / (4 * v[i]); ax = unit(v);
    } else ax = unit([m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]]);
    return K.translate(ax ? K.rotate(h, ax, ang, [0, 0, 0]) : h, o);
  }
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  function lineCutter(s, type, size, v) {
    const nA = unit(s.nA), nB = unit(s.nB); need(Math.abs(dot(nA, nB)) < 1e-4, 'only right-angle edges can be rounded exactly');
    const d = sub(s.p1, s.p0), L = len(d); need(L > 1e-9, 'the edge has no length');
    const ex = mul(nA, -1), ey = mul(nB, -1); let ez = cross(ex, ey); const o = dot(ez, d) >= 0 ? s.p0 : s.p1; const e = Math.max(size * 0.05, 1e-6 * L), z0 = v.ext ? v.ext * Math.max(size * 0.01, 1e-4 * L) : 0, Lx = L + 2 * z0;
    if (type === 'fillet') {
      const box = K.translate(K.box(size + e, size + e, Lx), [-e, -e, -z0]), cyl = K.translate(K.cylinder(size, Lx + 2 * e), [size, size, -z0 - e]);
      return place(K.cut(box, cyl), ex, ey, ez, o);
    }
    // chamfer: a square turned 45 degrees; one side lies on the chamfer plane and the rest reaches outside the part
    const a = unit(sub(ex, ey)), m = unit(add(ex, ey)), b = mul(m, -1), c = cross(a, b), w = size * Math.SQRT2, D = size * Math.SQRT2;
    const oc = dot(ez, d) >= 0 ? s.p1 : s.p0, mid = add(add(oc, mul(ex, size / 2)), mul(ey, size / 2));
    return place(K.box(w, D, Lx), a, b, c, add(sub(mid, mul(a, w / 2)), mul(c, -z0)));
  }
  function circleCutter(s, type, size, v) {
    const n = unit(s.n), R = s.R, r = size, e = Math.max(r * 0.05, 1e-6 * R); need(R > r * 1.0001, 'the edge is smaller than the round');
    let ux = cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]); ux = unit(ux); const uy = cross(n, ux);
    const dz = 0, rt = r * (1 + (v.k || 0)); let h;
    if (type === 'fillet') {
      if (s.boss) {
        need(R > 2 * r * 1.0001, 'the round needs the circle to be more than twice as wide');
        const ringB = K.cut(K.translate(K.cylinder(R + e, r + e), [0, 0, -r]), K.translate(K.cylinder(R - r, r + 3 * e), [0, 0, -r - e]));
        h = K.cut(ringB, K.translate(K.torus(R - r, rt), [0, 0, -r - dz]));
      } else {
        const ringB = K.cut(K.translate(K.cylinder(R + r, r + e), [0, 0, -r]), K.translate(K.cylinder(R - e, r + 3 * e), [0, 0, -r - e]));
        h = K.cut(ringB, K.translate(K.torus(R + r, rt), [0, 0, -r - dz]));
      }
    } else if (s.boss) {
      need(R > r + 2 * e, 'the bevel is wider than the circle');
      h = K.cut(K.translate(K.cylinder(R + e, r + 2 * e), [0, 0, -r]), K.translate(K.cone(R + e, R - r - e, r + 2 * e), [0, 0, -r - e]));
    } else {
      h = K.translate(K.cone(R - e, R + r + e, r + 2 * e), [0, 0, -r - e]);
    }
    return place(h, ux, uy, n, s.c);
  }
  const VARIANTS_LINE = [{ ext: 0, k: 0 }, { ext: 1, k: 0 }], VARIANTS_FILLET_CIRCLE = [{ ext: 0, k: 0 }, { ext: 0, k: 2e-3 }], VARIANTS = VARIANTS_LINE;
  K.roundCutter = (spec, type, size, v) => { need(type === 'fillet' || type === 'chamfer', 'type must be fillet or chamfer'); need(size > 0, 'size must be positive'); v = v || VARIANTS[0]; return spec.kind === 'circle' ? circleCutter(spec, type, size, v) : lineCutter(spec, type, size, v); };
  /** body - cutter. The first cutter that the boolean accepts is used (touching and tangent surfaces make some placements numerically fragile). */
  K.roundEdge = (h, spec, type, size, tol) => {
    let last = null;
    if (spec.kind === 'circle' && type === 'fillet' && K.roundRim) { try { const node = K.roundRim(h, spec, size); K.volume(node); K.mesh(node, size * 0.05); return node; } catch (e) { last = e; } }
    for (const v of (spec.kind === 'circle' && type === 'fillet' ? VARIANTS_FILLET_CIRCLE : VARIANTS_LINE)) { try { const node = K.cut(h, K.roundCutter(spec, type, size, v)); K.volume(node); [size * 0.05, size * 0.01, size * 0.002].concat(tol > 0 ? [tol] : []).forEach((t) => K.mesh(node, t)); return node; } catch (e) { last = e; if (/only right-angle|more than twice|smaller than the round|wider than the circle|positive|no length/.test(e.message)) throw e; } }
    throw last;
  };
  K.features = (K.features || []).concat(['round-edges', 'round-rim-torus', 'mirror', 'polyhedron', 'trimmed-torus-massprops', 'boolean-retry']);
  K.version = AK.version = '1.3.0';
})(window.AakarKernel);