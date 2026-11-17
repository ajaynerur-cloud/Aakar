// Approximate operations without OpenCascade (88_meshops.js): booleans with freeform solids, shell, offset, fillet. Accuracy is about one grid cell, so the checks use 1 %.
require('../dist/aakar-kernel.js'); const K = globalThis.AakarKernel.kernel, M = K.meshops, N = K.nurbs;
let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); }; const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const box = K.box(40, 30, 20);
{ const o = M.offset(box, 2); T('offset box +2 (OpenCascade: 35564.48)', rel(K.volume(o), 35564.4837) < 0.005, String(K.volume(o))); T('offset result is a closed body flagged approximate', K.validate(o).ok && !!M.isApprox(o));
  const c = K.massProps(o).centroid; T('offset centroid stays at the centre', Math.hypot(c[0] - 20, c[1] - 15, c[2] - 10) < 0.05, c.join(',')); }
{ const s = M.offset(K.sphere(10), -2); T('sphere shrunk by 2', rel(K.volume(s), 4 / 3 * Math.PI * 512) < 0.01, String(K.volume(s))); }
{ const s = M.shell(box, [{ dir: [0, 0, 1] }], 2); T('shell, top open (exact 7152)', rel(K.volume(s), 7152) < 0.01, String(K.volume(s))); const s2 = M.shell(box, [{ near: [20, 15, 20] }], 2); T('shell, face named by a nearby point', rel(K.volume(s2), 7152) < 0.01);
  const c = M.shell(K.cylinder(10, 30), [], 1.5); T('closed shell of a cylinder', rel(K.volume(c), Math.PI * (100 * 30 - 8.5 * 8.5 * 27)) < 0.01, String(K.volume(c))); }
{ const f = M.fillet(box, [{ kind: 'line', p0: [0, 0, 20], p1: [40, 0, 20] }], 4); const v = K.volume(f); T('fillet removes material, no more than the edge region allows', v < 24000 - 100 && v > 24000 - 260, String(v));
  const cut = K.cut(f, K.translate(K.box(10, 10, 10), [10, 10, 5])); T('result keeps working in later booleans (field boolean, about one cell)', rel(K.volume(cut), v - 1000) < 0.003, String(K.volume(cut))); }
{ const pipe = N.extrude(N.circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 10), [0, 0, 25]), notch = K.translate(K.box(30, 8, 10), [-15, -4, 5]); let a = 0; const n = 100000; for (let i = 0; i < n; i++) { const y = -4 + 8 * (i + 0.5) / n; a += 2 * Math.sqrt(100 - y * y); } a *= 8 / n;
  const r = K.cut(pipe, notch); T('freeform cylinder minus box', rel(K.volume(r), Math.PI * 2500 - a * 10) < 0.005, K.volume(r) + ' vs ' + (Math.PI * 2500 - a * 10));
  const u = K.fuse(pipe, K.translate(K.box(10, 10, 10), [5, -5, 10])); T('freeform union', K.volume(u) > Math.PI * 2500 && K.validate(u).ok, String(K.volume(u))); T('result exports to STEP', /ADVANCED_FACE/.test(K.stepExport(r)));
  const s = K.shell(pipe, [{ dir: [0, 0, 1] }], 1.5); T('shell of a freeform solid', rel(K.volume(s), Math.PI * (2500 - 8.5 * 8.5 * 23.5)) < 0.01, String(K.volume(s))); }
{ let err = null; try { M.offset(K.box(40, 30, 20), 0.001); } catch (e) { err = e; } T('a wall the grid cannot resolve is refused, not faked', !!err && /cannot resolve/.test(err.message), err && err.message); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
