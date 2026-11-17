// Freeform (NURBS) solids: extrude / revolve / loft / sweep of curved profiles. Volumes are checked against closed forms (to 1e-12 for exact cases),
// closure and mesh volume are checked, bad input must be refused. test/occt_crosscheck.py additionally reads the STEP files with a real OpenCascade.
require('../dist/aakar-kernel.js'); const AK = globalThis.AakarKernel, N = AK.kernel.nurbs; const PI = Math.PI, X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], O = [0, 0, 0];
let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b), run = (n, f) => { try { f(); } catch (e) { T(n + ' (threw)', false, e.message); } };
const sq = [[-5, -5, 0], [5, -5, 0], [5, 5, 0], [-5, 5, 0]], sqs = sq.map((a, i) => N.line(a, sq[(i + 1) % 4])), R = 7, half = [N.arc(O, X, Z, R, -PI / 2, PI / 2), N.line([0, 0, R], [0, 0, -R])];
T('feature flags', ['nurbs-solids', 'nurbs-step'].every((f) => AK.kernel.features.includes(f)));
run('circle is exact', () => { const c = N.circle(O, X, Y, 10); let worst = 0; for (let i = 0; i <= 200; i++) { const p = N.cEval(c, i / 200); worst = Math.max(worst, Math.abs(Math.hypot(p[0], p[1]) - 10)); } T('rational circle radius', worst < 1e-12, worst.toExponential(2)); });
run('cylinder', () => { const s = N.extrude(N.circle(O, X, Y, 10), [0, 0, 25]), m = N.massProps(s); T('cylinder volume', rel(m.volume, PI * 2500) < 1e-12); T('cylinder area', rel(m.area, 2 * PI * 250 + 2 * PI * 100) < 1e-12); T('cylinder centroid', Math.abs(m.centroid[2] - 12.5) < 1e-10); T('cylinder Izz', rel(m.inertia[2][2], PI * 2500 * 100 / 2) < 1e-10); });
run('reversed profile', () => { const s = N.extrude(N.cReverse(N.circle(O, X, Y, 10)), [0, 0, 25]); T('clockwise profile still gives a positive solid', rel(N.massProps(s).volume, PI * 2500) < 1e-12); });
run('frustum loft', () => { const m = N.massProps(N.loft([N.circle(O, X, Y, 10), N.circle([0, 0, 25], X, Y, 4)])); T('frustum volume', rel(m.volume, PI * 25 / 3 * 156) < 1e-12); });
run('sphere', () => { const m = N.massProps(N.revolve(half, O, Z)); T('sphere volume', rel(m.volume, 4 / 3 * PI * R ** 3) < 1e-12); T('sphere area', rel(m.area, 4 * PI * R * R) < 1e-12); T('sphere centroid', Math.hypot(...m.centroid) < 1e-9); });
run('torus', () => { const m = N.massProps(N.revolve(N.circle([20, 0, 0], X, Z, 5), O, Z)); T('torus volume', rel(m.volume, 2 * PI * PI * 500) < 1e-12); T('torus area', rel(m.area, 4 * PI * PI * 100) < 1e-12); });
run('partial revolve', () => { T('half torus', rel(N.massProps(N.revolve(N.circle([20, 0, 0], X, Z, 5), O, Z, PI)).volume, PI * PI * 500) < 1e-12); T('quarter sphere', rel(N.massProps(N.revolve(half, O, Z, PI / 2)).volume, PI * R ** 3 / 3) < 1e-12); });
run('composite profile', () => { const slot = [N.line([0, -5, 0], [20, -5, 0]), N.arc([20, 0, 0], X, Y, 5, -PI / 2, PI / 2), N.line([20, 5, 0], [0, 5, 0]), N.arc(O, X, Y, 5, PI / 2, 3 * PI / 2)]; T('slot (2 lines + 2 arcs) volume', rel(N.massProps(N.extrude(slot, [0, 0, 8])).volume, (200 + PI * 25) * 8) < 1e-12); T('square', rel(N.massProps(N.extrude(sqs, [0, 0, 40])).volume, 4000) < 1e-12); });
run('sweep', () => { const s = N.sweep(N.circle([40, 0, 0], X, Z, 5), N.arc(O, X, Y, 40, 0, PI / 2), { steps: 24 }); T('pipe along a quarter circle', rel(N.massProps(s).volume, PI * 25 * 40 * PI / 2) < 1e-6, rel(N.massProps(s).volume, PI * 25 * 40 * PI / 2).toExponential(2)); const t = N.sweep(sqs, N.line(O, [0, 0, 40]), { steps: 16, twist: PI / 2 }); T('twisted square', rel(N.massProps(t).volume, 4000) < 1e-6 && N.check(t).ok); });
run('freeform loft', () => { const e = N.interp(Array.from({ length: 17 }, (_, i) => [12 * Math.cos(2 * PI * i / 16), 6 * Math.sin(2 * PI * i / 16), 0]), 3), s = N.loft([e, N.circle([0, 0, 30], X, Y, 5)]), c = N.check(s); T('spline section -> circle loft is closed', c.ok && c.closure < 1e-5, c.closure.toExponential(2)); const v = N.massProps(s).volume; T('volume between the two prisms', v > PI * 25 * 30 && v < PI * 72 * 30 + 1, String(v)); });
run('mesh', () => { const tr = N.mesh(N.extrude(N.circle(O, X, Y, 10), [0, 0, 25]), 16); let v = 0; tr.forEach(([a, b, c]) => { v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }); T('tessellation is outward and closed', rel(v, PI * 2500) < 3e-3, rel(v, PI * 2500).toExponential(2)); });
run('step', () => { const t = N.stepWrite(N.revolve(N.circle([20, 0, 0], X, Z, 5), O, Z), { name: 't' }); T('STEP has B-spline surface + closed shell', /RATIONAL_B_SPLINE_SURFACE/.test(t) && /CLOSED_SHELL/.test(t) && /MANIFOLD_SOLID_BREP/.test(t)); });
run('facade', () => { const K = AK.kernel, s = N.extrude(N.circle(O, X, Y, 10), [0, 0, 25]); T('K.volume / K.area accept freeform solids', rel(K.volume(s), PI * 2500) < 1e-12 && rel(K.area(s), 2 * PI * 250 + 2 * PI * 100) < 1e-12); T('K.validate', K.validate(s).ok === true); const t = K.translate(s, [5, 5, 5]); T('K.translate', Math.abs(K.massProps(t).centroid[0] - 5) < 1e-9 && rel(K.volume(t), PI * 2500) < 1e-12);
  const m = K.transform(s, [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]); T('K.transform with a mirror keeps the volume positive', rel(K.volume(m), PI * 2500) < 1e-12 && N.check(m).ok); const M = K.mesh(s, 1e-3); T('K.mesh gives an indexed mesh with face ids', M.indices.length > 100 && M.faces.length === M.indices.length / 3 && Math.max(...M.faces) === 2);
  const sp = JSON.parse(JSON.stringify({ kind: 'loft', sections: [[N.circle(O, X, Y, 10)], [N.circle([0, 0, 25], X, Y, 4)]] })); T('fromSpec from plain JSON (what a recipe stores)', rel(K.volume(N.fromSpec(sp)), PI * 25 / 3 * 156) < 1e-12); });
const bad = (n, f, re) => { try { f(); T(n, false, 'did not throw'); } catch (e) { T(n, re.test(e.message), e.message); } };
bad('open profile is refused', () => N.extrude([N.line(O, [10, 0, 0]), N.line([10, 0, 0], [10, 10, 0])], [0, 0, 5]), /not a closed chain/);
bad('non-planar section cannot be capped', () => N.loft([N.interp([[0, 0, 0], [10, 0, 3], [10, 10, 0], [0, 10, 3], [0, 0, 0]], 3), N.circle([5, 5, 20], X, Y, 4)]), /not planar|closed|coincide/);
bad('revolve of a profile that straddles the axis is refused', () => N.revolve([N.circle([0, 0, 0], X, Z, 3)], O, Z), /axis/);
// sweep along a path with a corner (mitre) and a loft that ends in a point
{ const sq = N.polyline([[0, -5, -5], [0, 5, -5], [0, 5, 5], [0, -5, 5], [0, -5, -5]]), L = N.sweepPieces(sq, [N.line([0, 0, 0], [50, 0, 0]), N.line([50, 0, 0], [50, 40, 0])], {});
  T('mitred L sweep: volume = section area x centre-line length', Math.abs(N.massProps(L).volume - 9000) < 1e-6, String(N.massProps(L).volume)); T('mitred L sweep is closed', N.check(L).ok);
  const L3 = N.sweepPieces(sq, [N.line([0, 0, 0], [30, 0, 0]), N.line([30, 0, 0], [30, 25, 0]), N.line([30, 25, 0], [30, 25, 20])], {}); T('three-piece sweep with a turn out of the plane', Math.abs(N.massProps(L3).volume - 100 * 75) < 1e-6 && N.check(L3).ok, String(N.massProps(L3).volume));
  const c = N.circle(O, X, Y, 10), pt = Object.assign({}, c, { P: c.P.map(() => [0, 0, 30]) }), cone = N.loft([[c], [pt]], {}), cone2 = N.loft([[pt], [c]], {});
  T('loft to a point is a cone', Math.abs(N.massProps(cone).volume - Math.PI * 100 * 10) < 1e-6 && N.check(cone).ok); T('loft from a point is a cone', Math.abs(N.massProps(cone2).volume - Math.PI * 100 * 10) < 1e-6);
  bad('STEP of a loft that ends in a point is refused clearly', () => N.stepWrite(cone), /point/); }
// native holes and the exact through-hole cut
{ const K = AK.kernel, sqL = (h) => [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]].map((a, i, A) => N.line(a, A[(i + 1) % 4]));
  const h1 = N.extrude({ outer: sqL(10), holes: [[N.circle(O, X, Y, 4)]] }, [0, 0, 20]), v1 = 400 * 20 - PI * 16 * 20;
  T('holes: extrude volume exact', rel(N.massProps(h1).volume, v1) < 1e-11 && N.check(h1).ok);
  T('holes: STEP carries the inner bounds', (N.stepWrite(h1).match(/FACE_BOUND/g) || []).length === 2);
  T('holes: translate keeps volume', rel(K.volume(K.translate(h1, [3, 4, 5])), v1) < 1e-11);
  const P = [[-10, -10, 0], [10, -10, 0], [12, 0, 0], [10, 10, 0], [-10, 10, 0], [-12, 0, 0]], a = N.extrude([N.line(P[0], P[1]), N.interp([P[1], P[2], P[3]], 2), N.line(P[3], P[4]), N.interp([P[4], P[5], P[0]], 2)], [0, 0, 20]), va = N.massProps(a).volume;
  let r = K.cut(a, K.translate(K.cylinder(3, 40), [0, 0, -10]));
  T('cutPrism: cylinder through a freeform extrusion is exact', rel(K.volume(r), va - PI * 9 * 20) < 1e-11 && !(K.meshops && K.meshops.isApprox(r)) && N.check(r).ok);
  r = K.cut(r, K.translate(K.box(4, 4, 40), [4, -2, -10])); T('cutPrism: second tool (box) still exact', rel(K.volume(r), va - PI * 9 * 20 - 320) < 1e-11 && !(K.meshops && K.meshops.isApprox(r)));
  T('cutPrism: tool touching the outline is declined', N.cutPrism(a, K.translate(K.cylinder(3, 40), [9.5, 0, -10])) === null);
  T('cutPrism: tool fully inside (a void) is declined', N.cutPrism(a, K.translate(K.cylinder(3, 10), [0, 0, 5])) === null);
  const pt = K.cut(a, K.translate(K.cylinder(3, 30), [0, 0, 8])), pb = K.cut(a, K.translate(K.box(4, 4, 30), [-2, -2, -15]));
  T('pocket from the top: exact volume, closed, not approximate', rel(K.volume(pt), va - PI * 9 * 12) < 1e-11 && N.check(pt).ok && !(K.meshops && K.meshops.isApprox(pt)));
  T('pocket from the bottom: exact volume', rel(K.volume(pb), va - 16 * 15) < 1e-11 && N.check(pb).ok && !(K.meshops && K.meshops.isApprox(pb)));
  T('pocket: translate and mirror keep the volume', rel(K.volume(K.translate(pt, [5, 5, 5])), va - PI * 9 * 12) < 1e-11 && rel(K.volume(K.transform(pt, [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0])), va - PI * 9 * 12) < 1e-11);
  const st = N.stepWrite(pt); T('pocket: STEP has the floor face and the inner bound', (st.match(/ADVANCED_FACE/g) || []).length === 3 + 4 + 1 + 0 || /FACE_BOUND/.test(st)); }
// slanted end cuts and chained exact cuts
{ const K = AK.kernel, P = [[-10, -10, 0], [10, -10, 0], [12, 0, 0], [10, 10, 0], [-10, 10, 0], [-12, 0, 0]], a = N.extrude([N.line(P[0], P[1]), N.interp([P[1], P[2], P[3]], 2), N.line(P[3], P[4]), N.interp([P[4], P[5], P[0]], 2)], [0, 0, 20]), A = N.massProps(a).volume / 20;
  const ap = (r) => !!(K.meshops && K.meshops.isApprox(r)), tilt = (deg, z) => { const t = deg * PI / 180; return K.transform(K.translate(K.box(100, 100, 50), [-50, -50, 0]), [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)], [0, 0, z]); };
  let r = K.cut(a, tilt(30, 12)); T('slanted end cut by a rotated box is exact', rel(K.volume(r), 12 * A) < 1e-11 && N.check(r).ok && !ap(r));
  const t2 = 20 * PI / 180, low = K.transform(K.translate(K.box(100, 100, 50), [-50, -50, -50]), [1, 0, 0, 0, Math.cos(t2), -Math.sin(t2), 0, Math.sin(t2), Math.cos(t2)], [0, 0, 5]);
  r = K.cut(r, low); T('a second slanted cut from the other end', rel(K.volume(r), 7 * A) < 1e-11 && !ap(r));
  const h = K.cut(r, K.translate(K.cylinder(3, 60), [0, 0, -20])); T('through hole in a prism with slanted ends', rel(K.volume(h), 7 * A - PI * 63) < 1e-11 && !ap(h));
  T('moving it keeps the volume', rel(K.volume(K.translate(h, [3, 2, 1])), 7 * A - PI * 63) < 1e-11);
  const ex = K.cut(a, tilt(30, 2)); T('a plane that leaves through the side is now exact too (trimmed faces)', N.isNurbs(ex) && !ap(ex) && N.check(ex).ok);
  let q = K.cut(a, K.translate(K.cylinder(3, 30), [0, 0, 8])); q = K.cut(q, K.translate(K.box(4, 4, 30), [6, -3, -20])); q = K.cut(q, K.translate(K.cylinder(1, 60), [-6, 0, -20]));
  T('pocket, opposite pocket and through hole chain exactly', rel(K.volume(q), N.massProps(a).volume - PI * 108 - 160 - PI * 20) < 1e-11 && !ap(q) && N.check(q).ok);
  T('and survive mirroring', rel(K.volume(K.transform(q, [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0])), N.massProps(a).volume - PI * 108 - 160 - PI * 20) < 1e-11);
  let sp = K.cut(a, tilt(30, 12)); sp = K.cut(sp, K.translate(K.cylinder(3, 30), [0, 0, 6])); T('pocket under a slanted end', rel(K.volume(sp), 12 * A - PI * 54) < 1e-11 && !ap(sp)); }
// trimmed faces: a plane cut that may leave through the sides
{ const K = AK.kernel, R = 7, half2 = [N.arc(O, X, Z, R, -PI / 2, PI / 2), N.line([0, 0, R], [0, 0, -R])], sph = N.revolve(half2, O, Z), hh = 4;
  const cut = N.planeCut(sph, [0, 0, 3], [0, 0, 1]), exp = 4 / 3 * PI * R ** 3 - PI * hh * hh * (3 * R - hh) / 3;
  T('sphere cut by a plane: volume equals the sphere minus the cap', !!cut && rel(N.massProps(cut).volume, exp) < 1e-9 && N.check(cut).ok);
  T('sphere cut: area = sphere - cap area + disc', rel(N.massProps(cut).area, 4 * PI * R * R - 2 * PI * R * hh + PI * (R * R - 9)) < 1e-9);
  const M = K.mesh(cut, 1e-3); let v = 0; for (let i = 0; i < M.indices.length; i += 3) { const g = (k) => [0, 1, 2].map((c) => M.positions[M.indices[i + k] * 3 + c]), A = g(0), B = g(1), C = g(2); v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }
  T('trimmed face meshes to a closed outward surface (volume within 0.5%)', rel(v, exp) < 5e-3, String(rel(v, exp)));
  T('STEP of the trimmed solid has trimmed bounds', /ADVANCED_FACE/.test(N.stepWrite(cut)) && (N.stepWrite(cut).match(/ADVANCED_FACE/g) || []).length >= 2);
  T('move / mirror keep the volume', rel(K.volume(K.translate(cut, [1, 2, 3])), exp) < 1e-9 && rel(K.volume(K.transform(cut, [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0])), exp) < 1e-9);
  const lo = N.loft([N.circle(O, X, Y, 10), N.circle([0, 0, 30], X, Y, 4)]), rl = N.planeCut(lo, [0, 0, 12], [0, 0, 1]), r12 = 10 - 6 * 12 / 30;
  T('loft cut by a plane', !!rl && rel(N.massProps(rl).volume, PI * 12 / 3 * (100 + r12 * r12 + 10 * r12)) < 1e-9);
  const tor = N.revolve(N.circle([20, 0, 0], X, Z, 5), O, Z), rt = N.planeCut(tor, [0, 0, 2], [0, 0, 1]); let vt = 0; const nn = 40000; for (let i = 0; i < nn; i++) { const y = -5 + 10 * (i + 0.5) / nn; if (y <= 2) vt += 2 * PI * 20 * 2 * Math.sqrt(25 - y * y) * (10 / nn); }
  T('torus cut by a plane (a face wrapping round the tube)', !!rt && rel(N.massProps(rt).volume, vt) < 1e-6 && N.check(rt).ok, rt ? String(rel(N.massProps(rt).volume, vt)) : 'null');
  const P = [[-10, -10, 0], [10, -10, 0], [12, 0, 0], [10, 10, 0], [-10, 10, 0], [-12, 0, 0]], pr = N.extrude([N.line(P[0], P[1]), N.interp([P[1], P[2], P[3]], 2), N.line(P[3], P[4]), N.interp([P[4], P[5], P[0]], 2)], [0, 0, 20]), nl = Math.hypot(0.6, 1), ex = N.planeCut(pr, [0, 0, 2], [0, -0.6 / nl, 1 / nl]);
  T('a plane that leaves through the sides of a freeform prism (exact to an independent OpenCascade volume)', !!ex && Math.abs(N.massProps(ex).volume - 1193.0864197535) < 1e-7 && N.check(ex).ok, ex ? String(N.massProps(ex).volume) : 'null');
  const tc = Math.atan(0.6), cc = Math.cos(tc), sn = Math.sin(tc), tool = K.transform(K.translate(K.box(100, 100, 50), [-50, -50, 0]), [1, 0, 0, 0, cc, -sn, 0, sn, cc], [0, 0, 2]), kr = K.cut(pr, tool);
  T('K.cut with a rotated box takes the exact path for that case', N.isNurbs(kr) && !(K.meshops && K.meshops.isApprox(kr)) && Math.abs(K.volume(kr) - 1193.0864197535) < 1e-7);
  const ch = N.cSub(N.line([0, 0, 0], [10, 0, 0]), 0.2, 0.5), dm = [ch.U[ch.p], ch.U[ch.P.length]]; T('exact curve sub-interval (knot insertion)', Math.abs(N.cEval(ch, dm[0])[0] - 2) < 1e-12 && Math.abs(N.cEval(ch, dm[1])[0] - 5) < 1e-12); }
// chained plane cuts on trimmed solids (recomputed from the source solid and all planes; checked against an independent OpenCascade boolean)
{ const K = AK.kernel, R = 7, sph = N.revolve([N.arc(O, X, Z, R, -PI / 2, PI / 2), N.line([0, 0, R], [0, 0, -R])], O, Z), s2 = Math.SQRT1_2;
  const a = N.planeCut(sph, [0, 0, 3], [0, 0, 1]), b = a && N.planeCut(a, [0, 0, 3 / s2], [s2, 0, s2]), c = b && N.planeCut(b, [-4, 0, 0], [-1, 0, 0]);
  T('two chained plane cuts (sphere): matches OpenCascade', !!b && Math.abs(N.massProps(b).volume - 1021.8913894065) < 1e-4 && N.check(b).ok, b ? String(N.massProps(b).volume) : 'null');
  T('three chained plane cuts: matches OpenCascade', !!c && Math.abs(N.massProps(c).volume - 872.9837386533) < 1e-4 && N.check(c).ok, c ? String(N.massProps(c).volume) : 'null');
  T('chained cuts agree with the single-plane result', !!a && Math.abs(N.massProps(a).volume - (4 / 3 * PI * R ** 3 - PI * 16 * (3 * R - 4) / 3)) < 1e-7);
  T('a moved trimmed solid can be cut again', !!c && !!N.planeCut(K.translate(c, [5, 5, 5]), [5, 5, 7], [0, 0, 1]));
  T('STEP of a three-plane cut has the cap faces', !!c && (N.stepWrite(c).match(/ADVANCED_FACE/g) || []).length >= 4); }
// cuts by tools of which two or more faces reach the solid (a box corner, a slot): exact, checked against OpenCascade booleans
{ const K = AK.kernel, R = 7, sph = N.revolve([N.arc(O, X, Z, R, -PI / 2, PI / 2), N.line([0, 0, R], [0, 0, -R])], O, Z), ap = (r) => !!(K.meshops && K.meshops.isApprox(r));
  const r1 = K.cut(sph, K.translate(K.box(18, 6, 19), [2, -2.9, 1]));
  T('box tool with several faces reaching a sphere: exact', N.isNurbs(r1) && !ap(r1) && Math.abs(K.volume(r1) - 1328.7015577880) < 1e-5 && N.check(r1).ok, String(K.volume(r1)));
  const r2 = K.cut(r1, K.translate(K.box(14, 3, 30), [-20, -1.5, -2])); T('a second tool on the trimmed solid', N.isNurbs(r2) && Math.abs(K.volume(r2) - 1316.8830764623) < 1e-5 && N.check(r2).ok, String(K.volume(r2)));
  const r3 = K.cut(r1, K.translate(K.box(100, 100, 50), [-50, -50, 5])); T('then a plane cut on the same solid', N.isNurbs(r3) && Math.abs(K.volume(r3) - 1262.7197189814) < 1e-5, String(K.volume(r3)));
  T('STEP of the slot cut shares every edge between two faces', (() => { const t = N.stepWrite(r1), eds = (t.match(/#(\d+)=EDGE_CURVE/g) || []).map((x) => x.match(/#(\d+)/)[1]), use = {}; (t.match(/ORIENTED_EDGE\('',\*,\*,#(\d+)/g) || []).forEach((x) => { const e = x.match(/#(\d+)$/)[1]; use[e] = (use[e] || 0) + 1; }); return eds.length > 6 && eds.every((e) => use[e] === 2); })());
  T('move and mirror keep the volume', rel(K.volume(K.translate(r1, [3, 2, 1])), K.volume(r1)) < 1e-8 && rel(K.volume(K.transform(r1, [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0])), K.volume(r1)) < 1e-8); }
// direct modelling on planar faces of freeform solids: move a cut face / a prism end, delete a cut (exact, recomputed from the source)
{ const K = AK.kernel, R = 7, sph = N.revolve([N.arc(O, X, Z, R, -PI / 2, PI / 2), N.line([0, 0, R], [0, 0, -R])], O, Z), c = N.planeCut(sph, [0, 0, 3], [0, 0, 1]), ci = c.faces.findIndex((f) => /^cut/.test(f.tag));
  const m = N.moveFace(c, ci, -2), h = 6; T('move a cut face (sphere cap plane 3 -> 1)', !!m && rel(K.volume(m), 4 / 3 * PI * 343 - PI * h * h * (21 - h) / 3) < 1e-9);
  const d = N.deleteFace(c, ci); T('delete the cut face restores the solid', !!d && rel(K.volume(d), 4 / 3 * PI * 343) < 1e-12);
  const P = [[-10, -10, 0], [10, -10, 0], [12, 0, 0], [10, 10, 0], [-10, 10, 0], [-12, 0, 0]], a = N.extrude([N.line(P[0], P[1]), N.interp([P[1], P[2], P[3]], 2), N.line(P[3], P[4]), N.interp([P[4], P[5], P[0]], 2)], [0, 0, 20]), A = N.massProps(a).volume / 20;
  const mt = N.moveFace(a, a.faces.findIndex((f) => f.tag === 'cap1_0'), 5), mb = N.moveFace(a, a.faces.findIndex((f) => f.tag === 'cap0_0'), 3);
  T('move the top end of a freeform prism', !!mt && rel(K.volume(mt), 25 * A) < 1e-11); T('move the bottom end of a freeform prism', !!mb && rel(K.volume(mb), 23 * A) < 1e-11); }
// slanted cylinder through a freeform extrusion: exact, walls ruled along the tool axis, elliptical mouths in both ends
run('slanted cylinder through-hole', () => { const K = AK.kernel, e = N.interp(Array.from({ length: 17 }, (_, i) => [12 * Math.cos(2 * PI * i / 16), 8 * Math.sin(2 * PI * i / 16), 0]), 3), A = N.extrude(e, [0, 0, 20]), V0 = N.massProps(A).volume;
  for (const [ax, r] of [[[1, 0, 3], 2], [[1, 1, 5], 1.5], [[-2, 1, 6], 2.5]]) { const w = ax.map((x) => x / Math.hypot(...ax)), ang = Math.acos(w[2]); let k = [-w[1], w[0], 0]; const n = Math.hypot(...k); k = k.map((x) => x / n); const cs = Math.cos(ang), sn = Math.sin(ang), [x, y, z] = k;
    const R = [cs + x * x * (1 - cs), x * y * (1 - cs) - z * sn, x * z * (1 - cs) + y * sn, y * x * (1 - cs) + z * sn, cs + y * y * (1 - cs), y * z * (1 - cs) - x * sn, z * x * (1 - cs) - y * sn, z * y * (1 - cs) + x * sn, cs + z * z * (1 - cs)];
    const T = K.translate(K.transform(K.translate(K.cylinder(r, 80), [0, 0, -40]), R, [0, 0, 0]), [1, 0, 10]), res = K.cut(A, T), v = K.volume(res), ex = V0 - PI * r * r * 20 / w[2];
    T_(ax, res, v, ex); } });
function T_(ax, res, v, ex) { T('slanted cylinder ' + ax + ' stays native and exact', !!res.topo && rel(v, ex) < 1e-12, rel(v, ex).toExponential(1)); T('  closed', N.check(res, false).ok); const mv = (() => { let s = 0; N.mesh(res, 16).forEach(([a, b, c]) => { s += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }); return s; })(); T('  mesh volume', rel(mv, ex) < 2e-3, rel(mv, ex).toExponential(1)); }
// curved tools (sphere, slanted cylinder, cone, torus) cutting freeform sides: sides trimmed by the tool, the tool wall is a trimmed NURBS face.  Reference values: OpenCascade booleans / closed forms.
run('quadric tools', () => { const K = AK.kernel, Rr = 7, A = N.revolve([N.arc(O, X, Z, Rr, -PI / 2, PI / 2), N.line([0, 0, Rr], [0, 0, -Rr])], O, Z);
  const rot = (w) => { const ang = Math.acos(w[2]); let k = [-w[1], w[0], 0]; const n = Math.hypot(...k); k = k.map((x) => x / n); const cs = Math.cos(ang), sn = Math.sin(ang), [x, y, z] = k; return [cs + x * x * (1 - cs), x * y * (1 - cs) - z * sn, x * z * (1 - cs) + y * sn, y * x * (1 - cs) + z * sn, cs + y * y * (1 - cs), y * z * (1 - cs) - x * sn, z * x * (1 - cs) - y * sn, z * y * (1 - cs) + x * sn, cs + z * z * (1 - cs)]; };
  const chk = (n, res, ex, tol) => { const v = K.volume(res); T(n + ' stays native', !!res.topo && res.faces.some((f) => f.kind === 'trim')); T(n + ' volume', rel(v, ex) < tol, rel(v, ex).toExponential(1)); T(n + ' closed', N.check(res, false).ok); };
  for (const [d, r] of [[9, 4], [8.5, 3], [10, 5]]) { const lens = PI * (Rr + r - d) ** 2 * (d * d + 2 * d * r - 3 * r * r + 2 * d * Rr + 6 * r * Rr - 3 * Rr * Rr) / (12 * d); chk('sphere tool d=' + d + ' r=' + r, K.cut(A, K.translate(K.sphere(r), [0, -d, 0])), 4 / 3 * PI * Rr ** 3 - lens, 1e-7); }
  let w = [0.2, 1, 0.1]; let n = Math.hypot(...w); w = w.map((q) => q / n); chk('slanted cylinder through the sides', K.cut(A, K.translate(K.transform(K.translate(K.cylinder(2, 60), [0, 0, -30]), rot(w), O), [3, 0, 1])), 1283.4832293596737, 1e-7);
  w = [0, 1, 0.15]; n = Math.hypot(...w); w = w.map((q) => q / n); chk('slanted cone through the sides', K.cut(A, K.translate(K.transform(K.translate(K.cone(1.5, 3.5, 40), [0, 0, -20]), rot(w), O), [2, 0, 1])), 1187.040900188565, 1e-7);
  chk('torus tool', K.cut(A, K.translate(K.torus(6, 2), [8, 0, 0])), 1288.1669952881705, 1e-7);
  const e = N.interp(Array.from({ length: 17 }, (_, i) => [12 * Math.cos(2 * PI * i / 16), 8 * Math.sin(2 * PI * i / 16), 0]), 3), P = N.extrude(e, [0, 0, 20]); w = [Math.cos(0.1), 0.15, Math.sin(0.1)]; n = Math.hypot(...w); w = w.map((q) => q / n);
  chk('cylinder through the side of a freeform prism', K.cut(P, K.translate(K.transform(K.translate(K.cylinder(2.5, 80), [0, 0, -40]), rot(w), O), [1, 0.5, 10])), 5570.926196179, 1e-7); });
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
