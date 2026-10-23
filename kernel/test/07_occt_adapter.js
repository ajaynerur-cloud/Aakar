// Tests the OpenCascade binding (app/occt/aakar-occt.mjs) against MOCK occt-wasm kernels that follow different API conventions.
// The mocks are backed by AakarKernel, so this checks the adapter's plumbing (name aliases, argument-order / anchor / unit calibration,
// handle unwrapping, mesh + STEP normalisation, engine switching in the real wired HTML) — it does NOT prove the real occt-wasm API matches.
const fs = require('fs'), vm = require('vm'), path = require('path'), { pathToFileURL } = require('url');
require('../dist/aakar-kernel.js'); const AK = globalThis.AakarKernel, K = AK.kernel, pi = Math.PI;
const html = process.argv[2] || process.env.AAKAR_HTML || path.join(__dirname, '..', '..', 'app', 'index.html');
const adapterFile = path.join(__dirname, '..', '..', 'app', 'occt', 'aakar-occt.mjs');
let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
const S = (n, fn) => { try { fn(); } catch (e) { T(n, false, 'threw: ' + ((e && e.message) || e)); } };
const near = (a, b, t) => Math.abs(a - b) <= Math.abs(b) * (t == null ? 1e-6 : t) + 1e-9;

// ------------------------------------------------------------------ mock occt-wasm modules
function mockModule(style) {
  const arena = new Map(); let next = 1; const rel = [];
  const put = (node) => { const id = next++; arena.set(id, node); return style.wrapResults ? { ok: true, shape: id } : id; };
  const get = (h) => { const id = (h && typeof h === 'object') ? h.shape : h; const n = arena.get(id); if (!n) throw new Error('bad handle ' + JSON.stringify(h)); return n; };
  const ctr = (w, d, h) => [-w / 2, -d / 2, -h / 2];
  const raw = {
    makeBox: (a, b, c) => { let n = K.box(a, b, c); if (style.centered) n = K.translate(n, ctr(a, b, c)); return put(n); },
    makeCylinder: (...a) => { const [r, h] = style.swapCyl ? [a[1], a[0]] : a; let n = K.cylinder(r, h); if (style.centered) n = K.translate(n, [0, 0, -h / 2]); return put(n); },
    makeSphere: (r) => put(K.sphere(r)),
    makeCone: (r1, r2, h) => { let n = K.cone(r1, r2, h); if (style.centered) n = K.translate(n, [0, 0, -h / 2]); return put(n); },
    makeTorus: (R, r) => put(K.torus(R, r)),
    fuse: (a, b) => put(K.fuse(get(a), get(b))), cut: (a, b) => put(K.cut(get(a), get(b))), common: (a, b) => put(K.common(get(a), get(b))),
    getVolume: (h) => { const v = K.volume(get(h)); return style.wrapResults ? { ok: true, value: v } : v; },
    getSurfaceArea: (h) => K.area(get(h)),
    getCenterOfMass: (h) => { const c = K.massProps(get(h)).centroid; return style.wrapResults ? { x: c[0], y: c[1], z: c[2] } : c; },
    getBoundingBox: (h) => { const b = K.bbox(get(h)); return style.bboxArray ? [b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]] : b; },
    tessellate: (h, lin) => { const m = K.mesh(get(h), lin); const r = style.altMesh ? { vertices: Float32Array.from(m.positions), triangles: Uint32Array.from(m.indices) } : { positions: Float32Array.from(m.positions), normals: new Float32Array(m.positions.length), indices: Uint32Array.from(m.indices) }; return style.wrapResults ? { ok: true, ...r } : r; },
    exportStep: (h) => { const s = K.stepExport(get(h)); return style.stepBytes ? new TextEncoder().encode(s) : s; },
    importStep: (t) => put(K.stepImport(typeof t === 'string' ? t : new TextDecoder().decode(t))),
    release: (h) => { rel.push(h); }
  };
  if (style.degrees) raw.rotate = (h, px, py, pz, dx, dy, dz, deg) => put(K.rotate(get(h), [dx, dy, dz], deg * pi / 180, [px, py, pz]));
  else raw.rotate = (h, axis, ang) => put(K.rotate(get(h), axis, ang, [0, 0, 0]));
  if (style.moveArray) raw.translate = (h, v) => put(K.translate(get(h), v)); else raw.translate = (h, x, y, z) => put(K.translate(get(h), [x, y, z]));
  if (style.scaleOrigin) raw.scale = (h, o, s) => put(K.scale(get(h), s, o)); else raw.scale = (h, s) => put(K.scale(get(h), s, [0, 0, 0]));
  raw.__released = rel;
  const M = { OcctKernel: { init: async () => raw } };
  return { M, raw };
}
const STYLES = {
  'andymai-like (handles, translate(h,x,y,z), rotate in degrees with origin)': { degrees: true },
  'wrapped results, centred primitives, swapped cylinder args, array bbox, vertices/triangles, STEP bytes': { wrapResults: true, centered: true, swapCyl: true, bboxArray: true, altMesh: true, stepBytes: true, moveArray: true, scaleOrigin: true }
};

(async () => {
  const A = await import(pathToFileURL(adapterFile).href);
  T('adapter exports name / version / init', typeof A.init === 'function' && /OpenCascade/.test(A.name), A.name);
  for (const [label, style] of Object.entries(STYLES)) {
    console.log('--- mock: ' + label);
    const { M, raw } = mockModule(style);
    const k = await A.init({ module: M, fresh: true });
    T('init() calibrated the kernel', !!k && k.isOcctWasm, (k.notes || []).join(' | '));
    const bb = (h) => k.bbox(h);
    let b; S('box', () => { b = bb(k.box(20, 30, 40)); T('box: corner on the origin, size 20×30×40', near(b.min[0], 0) && near(b.min[2], 0) && near(b.max[0], 20) && near(b.max[1], 30) && near(b.max[2], 40), JSON.stringify(b)); });
    S('cylinder', () => { b = bb(k.cylinder(10, 25)); T('cylinder(r, h): base on z=0, axis +z', near(b.min[2], 0) && near(b.max[2], 25) && near(b.max[0], 10) && near(b.min[1], -10), JSON.stringify(b)); });
    b = bb(k.sphere(7)); T('sphere centred on the origin', near(b.min[0], -7) && near(b.max[2], 7));
    S('cone', () => { b = bb(k.cone(10, 4, 20)); T('cone(r, rt, h): base on z=0', near(b.min[2], 0) && near(b.max[2], 20) && near(b.max[0], 10), JSON.stringify(b)); });
    b = bb(k.torus(20, 5)); T('torus centred on the origin', near(b.max[0], 25) && near(b.min[2], -5) && near(b.max[2], 5));
    const plate = k.cut(k.box(40, 40, 10), k.translate(k.cylinder(5, 30), [20, 20, -10]));
    T('cut: block with a hole, exact volume', near(k.volume(plate), 16000 - pi * 250, 1e-9), k.volume(plate).toFixed(6));
    T('area()', near(k.area(plate), 4957.0796327, 1e-7), k.area(plate).toFixed(5));
    const mp = k.massProps(plate); T('massProps: volume, area, centroid (no inertia tensor)', near(mp.volume, 16000 - pi * 250, 1e-9) && near(mp.centroid[0], 20, 1e-6) && mp.inertia === null, JSON.stringify(mp.centroid));
    S('rotate', () => { const rr = k.rotate(k.box(10, 20, 30), [0, 0, 1], pi / 2, [0, 0, 0]); b = bb(rr);
    T('rotate: 90° about z', near(b.min[0], -20) && near(b.max[0], 0, 1e-6) && near(b.max[1], 10), JSON.stringify(b.min) + JSON.stringify(b.max)); });
    S('rotate about a centre', () => { const rc = k.rotate(k.box(10, 20, 30), [0, 0, 1], pi / 2, [5, 10, 0]); b = bb(rc); T('rotate about a centre', near(b.min[0], -5) && near(b.max[0], 15) && near(b.min[1], 5) && near(b.max[1], 15), JSON.stringify(b.min) + JSON.stringify(b.max)); });
    S('scale', () => { T('scale ×2 → volume ×8', near(k.volume(k.scale(k.box(10, 10, 10), 2)), 8000, 1e-9));
    const sc = k.scale(k.box(10, 10, 10), 2, [5, 5, 5]); b = bb(sc); T('scale about a centre', near(b.min[0], -5) && near(b.max[0], 15), JSON.stringify(b.min)); });
    const m = k.mesh(k.box(10, 10, 10), 0.1); T('mesh: positions + indices', m.positions.length >= 24 && m.indices.length >= 36, m.indices.length / 3 + ' triangles');
    const s = k.stepExport(k.cylinder(5, 10)); T('stepExport returns text with a true cylinder', typeof s === 'string' && /ISO-10303-21/.test(s) && /CYLINDRICAL_SURFACE/.test(s));
    const re = k.stepImport(s); T('stepImport round trip', near(k.volume(re), pi * 250, 1e-9));
    for (let i = 0; i < 1400; i++) k.box(1, 1, 1);
    T('arena handles are released in batches', raw.__released.length >= 300, raw.__released.length + ' released');
  }
  // ---- an incompatible kernel must fail with a clear message, not hang or corrupt anything
  { let msg = ''; try { await A.init({ module: { OcctKernel: { init: async () => ({ makeBox: () => 1 }) } }, fresh: true }); } catch (e) { msg = e.message; }
    T('a kernel without the needed methods is refused with a clear message', /lacks/.test(msg), msg.slice(0, 120)); }
  { let msg = ''; try { await A.init({ module: { nothing: 1 }, fresh: true }); } catch (e) { msg = e.message; } T('a module without OcctKernel is refused', /exports no OcctKernel/.test(msg), msg.slice(0, 100)); }

  // ------------------------------------------------------------------ the real wired HTML: switching engines through its own panel
  console.log('--- wired Aakar html: engine switch');
  const src = fs.readFileSync(html, 'utf8'), scripts = []; const re2 = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g; let mm; while ((mm = re2.exec(src))) scripts.push(mm[1]);
  const find = (n) => { const s = scripts.find((x) => x.includes(n)); if (!s) throw new Error('script not found: ' + n); return s; };
  const store = {}, chip = { style: {}, children: [], className: '', title: '', set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
  const stub = () => ({ style: {}, children: [], appendChild(c) { this.children.push(c); return c; }, remove() {}, addEventListener() {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });
  const statusEl = stub(), doc = { getElementById: (id) => id === 'status' ? statusEl : id === 'stKernel' ? (statusEl.children.includes(chip) ? chip : null) : null, createElement: (t) => t === 'span' ? chip : stub(), head: stub() };
  const ctx = { console, setTimeout, clearTimeout, setImmediate, TextDecoder, TextEncoder, performance: { now: Date.now }, document: doc, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, addEventListener() {} }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  ['Aakar - math.js', 'Aakar - solid.js', 'Aakar - csg.js'].forEach((n) => vm.runInContext(find(n), ctx));
  const CAD = ctx.CAD, bodies = new Map(), panels = {}, toasts = [];
  ctx.PRISM = { st: { doc: {}, state: { bodies } }, toast: (m, b) => toasts.push([m, b]), addGroup() {}, meta: () => ({ vis: {} }), refreshPanels() {}, regenerate() {} };
  CAD.feat = { invalidate() {} }; CAD.io = { download() {} }; CAD.step = { exportStep: () => 'FACETED' };
  CAD.ik = { toast: (m, b) => toasts.push([m, b]), copyGroup() {}, panel: (id) => { if (panels[id]) return panels[id]; const els = {}; const p = { on: false, isOn: () => p.on, show() { p.on = true; }, body: { innerHTML: '', querySelector: (sel) => els[sel] || (els[sel] = {}), els } }; return (panels[id] = p); } };
  const big = find('OPTIONAL EXACT KERNEL'); vm.runInContext(big.slice(big.lastIndexOf('/* Aakar 8.10 · OPTIONAL EXACT KERNEL')), ctx);
  vm.runInContext(find('AakarKernel 1.0'), ctx); vm.runInContext(find('AakarKernel wiring'), ctx);
  const X = CAD.exact;
  T('starts on AakarKernel', X.state === 'ready' && X.name === 'AakarKernel');
  const { M } = mockModule(STYLES[Object.keys(STYLES)[0]]);
  ctx.AakarOcctBinding = { name: A.name, version: 'mock', init: (o) => A.init({ ...o, module: M, fresh: true }) };
  X.openPanel(); const pn = CAD.ik.panel('ik-exact'); pn.body.els['[data-a=eng-oc]'].onclick(); await new Promise((r) => setTimeout(r, 400));
  T('switched to OpenCascade through the panel', X.state === 'ready' && /OpenCascade/.test(X.name), X.state + ' ' + X.name + ' | ' + X.log.slice(-2).join(' | '));
  T('the choice is remembered', store['aakar.exact.engine'] === 'occt');
  const st = X.selfTest(); T('shipped conformance self-test on the OpenCascade kernel', st.passed === st.total, st.passed + ' / ' + st.total + (st.passed === st.total ? '' : ' ' + JSON.stringify(st.results.filter((r) => !r.ok))));
  const P = CAD.solid.PRIM; X.useExactBooleans = true;
  const a = CAD.csg.boolean('subtract', P.box(40, 40, 10), P.cylinder(5, 30, 64, [0, 0, -10]));
  T('Aakar booleans are routed to OpenCascade', X.exactBooleansDone >= 1 && !!X.recipeOf(a[0]), 'done=' + X.exactBooleansDone);
  bodies.set('p', { key: 'p', name: 'Plate', solid: a[0] });
  pn.body.els['[data-a=props]'] && pn.body.els['[data-a=props]'].onclick(); const hh = pn.body.innerHTML;
  T('Exact properties renders without an inertia tensor', /Exact properties<\/h5>/.test(hh) && !/inertia about/.test(hh) && hh.includes((16000 - pi * 250).toFixed(3)));
  const rep = X.report().find((r) => r.name === 'Plate'); T('exact vs faceted report on OpenCascade', rep && rep.exact && Math.abs(rep.diff) < 2, rep && rep.diff.toFixed(3) + ' %');
  pn.body.els['[data-a=eng-ak]'].onclick();
  T('switched back to AakarKernel and remembered it', X.state === 'ready' && X.name === 'AakarKernel' && store['aakar.exact.engine'] === 'aakar');
  const a2 = CAD.csg.boolean('union', P.box(30, 30, 10), P.cylinder(6, 12, 48, [0, 0, 10])); T('booleans work again on AakarKernel', !!X.recipeOf(a2[0]));
  // OpenCascade missing: the switch must fall back cleanly
  ctx.AakarOcctBinding = { name: A.name, version: 'x', init: () => Promise.reject(new Error('wasm missing')) };
  pn.body.els['[data-a=eng-oc]'].onclick(); await new Promise((r) => setTimeout(r, 400));
  T('failed OpenCascade start → AakarKernel stays active, reason logged', X.state === 'ready' && X.name === 'AakarKernel' && X.log.some((l) => /wasm missing/.test(l)), X.log.slice(-1)[0]);
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL harness threw: ' + (e.stack || e)); process.exit(1); });
