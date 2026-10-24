/* Aakar 8.13 · AakarKernel 1.1
 *   + clash(a, b)        : exact-mesh interference test of two kernel models (triangle BVH, contact is not a clash)
 *   + clashMatrix(list)  : every pair of a list of models
 *   + features           : capability list, so the app can tell which kernel level is loaded
 *   The kernel stays pure and dependency-free; the BVH comes from the assembly collision engine when the app is present. */
(function (G) {
  'use strict';
  const AK = G.AakarKernel, CAD = G.CAD; if (!AK || !AK.kernel) return;
  const K = AK.kernel;
  K.version = AK.version = '1.1.0';
  K.features = ['exact-brep', 'booleans', 'mass-properties', 'step', 'clash', 'persistent-face-ids'];
  const tri9 = (m) => { const out = new Float64Array(m.indices.length * 3), p = m.positions; for (let i = 0; i < m.indices.length; i++) { const v = m.indices[i] * 3; out[i * 3] = p[v]; out[i * 3 + 1] = p[v + 1]; out[i * 3 + 2] = p[v + 2]; } return out; };
  const scaleOf = (m) => { let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.positions[i + k]); mx[k] = Math.max(mx[k], m.positions[i + k]); } return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); };
  K.clash = function (a, b, opts) {
    const IKc = CAD && CAD.ik && CAD.ik.col; if (!IKc || !IKc.buildMesh) throw new Error('The collision engine is not loaded');
    opts = opts || {}; const ma = K.mesh(a, opts.tol), mb = K.mesh(b, opts.tol), A = IKc.buildMesh(tri9(ma)), B = IKc.buildMesh(tri9(mb));
    const sc = Math.min(scaleOf(ma), scaleOf(mb)), r = IKc.collide(null, null, { meshA: A, meshB: B, tol: opts.clearance != null ? opts.clearance : Math.max(1e-6, sc * 1e-6), maxPairs: opts.maxPairs || 1, contain: opts.contain });
    return { clash: !!r.hit, pairs: r.n, contained: r.contained || null, triangles: r.tris.slice(0, 20).map(([i, j]) => ({ a: i, b: j, faceA: ma.faces[i], faceB: mb.faces[j] })) };
  };
  K.clashMatrix = (list, opts) => { const out = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const r = K.clash(list[i], list[j], opts); if (r.clash) out.push({ i, j, pairs: r.pairs, contained: r.contained }); } return out; };
  try { if (CAD && CAD.exact && CAD.exact.useAakarKernel && CAD.exact.name === 'AakarKernel') CAD.exact.version = K.version; } catch (e) { /* ignore */ }
})(typeof window !== 'undefined' ? window : globalThis);

