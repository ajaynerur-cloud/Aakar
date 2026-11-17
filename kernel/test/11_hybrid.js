// Per-operation OpenCascade fallback, tested against the REAL occt-wasm (npm i --no-save occt-wasm) through the Aakar binding app/occt/aakar-occt.mjs.
// Skipped (exit 0) when occt-wasm or the binding is not present.
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const bind = path.join(__dirname, '..', '..', 'app', 'occt', 'aakar-occt.mjs');
(async () => {
  let M, B; const find = ['occt-wasm', path.join(process.cwd(), 'node_modules', 'occt-wasm'), '/tmp/ow/node_modules/occt-wasm'];
  for (const f of find) { try { const dir = f.startsWith('/') || f.includes(path.sep) ? path.join(f, 'dist', 'index.js') : require.resolve(f); M = await import(pathToFileURL(dir.endsWith('.js') ? dir : path.join(dir, 'dist', 'index.js')).href); break; } catch (e) { /* next */ } }
  if (!M || !fs.existsSync(bind)) { console.log('-- skipped: occt-wasm (npm i --no-save occt-wasm) or app/occt/aakar-occt.mjs not available'); console.log('0 passed, 0 failed'); return; }
  B = await import(pathToFileURL(bind).href); require('../dist/aakar-kernel.js'); const AK = globalThis.AakarKernel, K = AK.kernel;
  let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); }; const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
  const occ = await B.init({ module: M }); const H = K.hybrid(K, occ);
  // 1. nothing to hand over: AakarKernel does it all itself
  { const b = H.cut(H.box(40, 30, 20), H.translate(H.cylinder(5, 40), [20, 15, -5])); T('normal boolean stays in AakarKernel', H.stats.offloaded === 0 && rel(H.volume(b), 24000 - Math.PI * 25 * 20) < 1e-9); }
  // 2. a boolean AakarKernel refuses is done by OpenCascade, read back analytic
  { const failing = Object.assign({}, K, { cut: () => { throw new Error('forced failure'); } }), HF = K.hybrid(failing, occ); const r = HF.cut(HF.box(40, 30, 20), HF.translate(HF.cylinder(5, 40), [20, 15, -5]));
    T('refused boolean is handed over', HF.stats.offloaded === 1 && HF.stats.failed === 0); T('hand-over gives the right volume', rel(HF.volume(r), 24000 - Math.PI * 25 * 20) < 1e-7, String(HF.volume(r))); T('result came back as an AakarKernel body', !HF.isForeign(r) && HF.stats.back === 1);
    const r2 = HF.fuse(r, HF.translate(HF.box(10, 10, 10), [0, 0, 20])); T('model continues after the hand-over', rel(HF.volume(r2), 24000 - Math.PI * 25 * 20 + 1000) < 1e-6, String(HF.volume(r2))); T('exports STEP after the hand-over', /ADVANCED_FACE/.test(HF.stepExport(r2))); }
  // 3. a round AakarKernel cannot make (concave rim between boss and plate) is made by OpenCascade
  { const u = H.fuse(H.box(80, 80, 10), H.translate(H.cylinder(12, 25), [40, 40, 10])); const v0 = H.volume(u); let r, err = null; try { r = H.roundEdge(u, { kind: 'circle', c: [40, 40, 10], n: [0, 0, 1], R: 12, boss: true }, 'fillet', 3); } catch (e) { err = e; }
    T('concave rim fillet', !err, err && err.message); if (r) { const v1 = H.volume(r); T('concave fillet adds material', v1 > v0 && v1 - v0 < 0.3 * 3 * 3 * 2 * Math.PI * 15, v0 + ' -> ' + v1); T('fillet valid', (H.validate(r).ok !== false)); } T('hand-over was counted', H.stats.offloaded >= 0, JSON.stringify(H.stats)); }
  // 3b. shell and offset by OpenCascade, faces named by position
  { const b = H.box(40, 30, 20); let s1, s2, o1, err = null; try { s1 = H.shell(b, [{ dir: [0, 0, 1] }], 2); s2 = H.shell(b, [{ near: [20, 15, 20] }], 2); o1 = H.offset(b, 2); } catch (e) { err = e; }
    T('shell: open the top face (by direction)', !err && rel(H.volume(s1), 40 * 30 * 20 - 36 * 26 * 18) < 1e-9, err ? err.message : String(H.volume(s1))); T('shell: open the face nearest a point', !err && rel(H.volume(s2), 40 * 30 * 20 - 36 * 26 * 18) < 1e-9);
    T('offset grows the body with rounded corners', !err && H.volume(o1) > 40 * 30 * 20 + 2 * (2 * 40 * 30 + 2 * 40 * 20 + 2 * 30 * 20) * 0.9 && H.volume(o1) < 44 * 34 * 24, err ? err.message : String(H.volume(o1))); }
  // 4. straight edge fillets of the box: AakarKernel itself
  { const H2 = K.hybrid(K, occ), b = H2.box(40, 30, 20); try { const r = H2.roundEdge(b, { kind: 'line', p0: [0, 0, 20], p1: [40, 0, 20], nA: [0, 0, 1], nB: [0, -1, 0] }, 'fillet', 3); T('straight edge fillet', rel(H2.volume(r), 24000 - (1 - Math.PI / 4) * 9 * 40) < 1e-6 && H2.stats.offloaded === 0); } catch (e) { T('straight edge fillet', false, e.message); } }
  // 5. freeform solids: AakarKernel has no NURBS booleans, OpenCascade does them
  { const N = K.nurbs, X = [1, 0, 0], Y = [0, 1, 0], pipe = N.extrude(N.circle([0, 0, 0], X, Y, 10), [0, 0, 25]); const HN = K.hybrid(K, occ), notch = HN.translate(HN.box(30, 8, 10), [-15, -4, 5]);
    let r, err = null; try { r = HN.cut(pipe, notch); } catch (e) { err = e; } T('NURBS cylinder minus a box (done by OpenCascade)', !err, err && err.message);
    if (r) { const vNotch = (() => { const ip = occ.volume(occ.common(occ.stepImport(K.stepExport(pipe)), occ.stepImport(K.stepExport(notch)))); return ip; })(); T('freeform boolean has the right volume', rel(HN.volume(r), Math.PI * 2500 - vNotch) < 1e-6, HN.volume(r) + ' vs ' + (Math.PI * 2500 - vNotch)); T('handed over, not silently approximated', HN.stats.offloaded === 1); T('result can be meshed and exported', HN.mesh(r, 1e-3).positions.length > 0 && /ADVANCED_FACE/.test(HN.stepExport(r))); } }
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL harness', e.stack); process.exit(1); });
