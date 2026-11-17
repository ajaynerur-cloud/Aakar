// General tessellation of imported B-rep bodies, tested on shapes written by the REAL OpenCascade (occt-wasm). Skipped (exit 0) when occt-wasm is not installed.
const path = require('path'), { pathToFileURL } = require('url');
(async () => {
  let M; for (const f of ['occt-wasm', path.join(process.cwd(), 'node_modules', 'occt-wasm'), '/tmp/ow/node_modules/occt-wasm']) { try { const p = f.includes(path.sep) ? path.join(f, 'dist', 'index.js') : require.resolve(f); M = await import(pathToFileURL(p.endsWith('.js') ? p : p).href); break; } catch (e) { /* next */ } }
  if (!M) { console.log('-- skipped: occt-wasm not available (npm i --no-save occt-wasm)'); console.log('0 passed, 0 failed'); return; }
  require('../dist/aakar-kernel.js'); const K = globalThis.AakarKernel.kernel; const oc = await M.OcctKernel.init();
  let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
  const open = (m) => { const id = new Map(), dir = new Map(), P = m.positions, vid = (i) => { const k = [0, 1, 2].map((j) => Math.round(P[3 * i + j] * 1e6)).join(','); if (!id.has(k)) id.set(k, id.size); return id.get(k); }; for (let i = 0; i < m.indices.length; i += 3) { const a = vid(m.indices[i]), b = vid(m.indices[i + 1]), c = vid(m.indices[i + 2]); for (const [p, q] of [[a, b], [b, c], [c, a]]) dir.set(p + '>' + q, (dir.get(p + '>' + q) || 0) + 1); } let bad = 0; for (const [k, n] of dir) { const [p, q] = k.split('>'); if (n !== 1 || dir.get(q + '>' + p) !== 1) bad++; } return bad; };
  const mvol = (m) => { let v = 0; const P = m.positions, g = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; for (let i = 0; i < m.indices.length; i += 3) { const a = g(m.indices[i]), b = g(m.indices[i + 1]), c = g(m.indices[i + 2]); v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return v; };
  const shapes = {
    box: () => oc.makeBox(20, 30, 40), cylinder: () => oc.makeCylinder(10, 30), cone: () => oc.makeCone(10, 4, 25), sphere: () => oc.makeSphere(10), torus: () => oc.makeTorus(20, 5),
    'plate with hole': () => oc.cut(oc.makeBox(60, 40, 12), oc.translate(oc.makeCylinder(8, 30), 15, 20, -5)),
    'plate with boss': () => oc.fuse(oc.makeBox(60, 60, 10), oc.translate(oc.makeCylinder(12, 25), 30, 30, 10)),
    'box minus sphere': () => oc.cut(oc.makeBox(30, 30, 30), oc.translate(oc.makeSphere(12), 15, 15, 30)),
    'box minus cone': () => oc.cut(oc.makeBox(40, 40, 30), oc.translate(oc.makeCone(10, 3, 30), 20, 20, 0)),
    lens: () => oc.common(oc.makeSphere(10), oc.translate(oc.makeSphere(10), 12, 0, 0)),
    'half sphere': () => oc.common(oc.makeSphere(10), oc.translate(oc.makeBox(30, 30, 30), -15, -15, 0)),
    'half torus (rings round the tube)': () => oc.common(oc.makeTorus(20, 5), oc.translate(oc.makeBox(60, 60, 30), 0, -30, -15)),
    'quarter torus': () => oc.common(oc.makeTorus(20, 5), oc.translate(oc.makeBox(60, 60, 30), 0, 0, -15)),
    'torus sector': () => oc.cut(oc.makeTorus(20, 5), oc.translate(oc.makeBox(60, 60, 20), -30, -30, 0)) };
  for (const [name, f] of Object.entries(shapes)) {
    try { const s = f(), ov = oc.getVolume(s), h = K.stepImport(oc.exportStep(s)), m = K.mesh(h, 1e-3), err = Math.abs(mvol(m) - ov) / ov, ob = open(m);
      T(name + ': watertight mesh', ob === 0, ob + ' open edges'); T(name + ': mesh volume matches OpenCascade', err < 3e-3, err.toExponential(1));
      const t = K.translate(h, [5, 6, 7]); T(name + ': moves as a body', Math.abs(mvol(K.mesh(t, 1e-3)) - ov) / ov < 3e-3);
    } catch (e) { T(name, false, e.message); }
  }
  console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
})();
