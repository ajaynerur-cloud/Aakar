/* Aakar · OpenCascade binding for the `occt-wasm` npm package (andymai/occt-wasm, OCCT 8 compiled to WebAssembly).
 *
 * Adds OpenCascade to Aakar as a second exact kernel next to the built-in AakarKernel; the user switches between them in the
 * "Exact kernel" panel (Engine: AakarKernel | OpenCascade).  It is loaded at RUN time from this folder, so nothing has to be bundled:
 *
 *     app/occt/aakar-occt.mjs     this file                      (the Aakar binding)
 *     app/occt/aakar-occt.js      tiny classic-script loader      (sets window.AakarOcctBinding)
 *     app/occt/occt-wasm.js       from node_modules/occt-wasm/dist   (copied by scripts/fetch-occt-wasm.js)
 *     app/occt/occt-wasm.wasm     from node_modules/occt-wasm/dist
 *
 * Contract: exports { name, version, init(opts) -> kernel } where kernel offers what Aakar's exact-kernel framework needs
 * (box, cylinder, sphere, translate, fuse, cut, common, volume, area, mesh, stepExport) plus cone, torus, rotate, scale, bbox,
 * massProps, stepImport.  Any problem simply leaves AakarKernel active.
 *
 * The facade of occt-wasm is not guessed blindly: method names are looked up from a list of aliases and every argument convention
 * (argument order, translate / rotate / scale signatures, angle units, where primitives are anchored) is CALIBRATED against tiny
 * test shapes when the kernel starts.  If calibration cannot make sense of the kernel, init() throws a message saying what failed.
 * `init({ module })` accepts an already imported module (used by the tests and by hosts that bundle occt-wasm themselves). */

export const name = 'OpenCascade (occt-wasm)';
export let version = 'occt-wasm';

// index.js is the package's facade (exports OcctKernel with init / makeBox / fuse ...); occt-wasm.js is only the raw Emscripten
// module factory underneath it, so it must come LAST - loading it first gave a module with none of the kernel methods.
const FILES = ['index.js', 'occt-wasm.mjs', 'occt-wasm.js'];
const here = (f) => new URL(f, import.meta.url).href;

function readBytes(url) {
  return new Promise((res, rej) => {
    const r = new XMLHttpRequest(); r.open('GET', url, true); r.responseType = 'arraybuffer';
    r.onload = () => ((r.status === 200 || (r.status === 0 && r.response)) ? res(r.response) : rej(new Error(url + ' HTTP ' + r.status)));
    r.onerror = () => rej(new Error('cannot read ' + url)); r.send();
  });
}
const factoryOf = (m) => {
  const K = m && (m.OcctKernel || (m.default && m.default.OcctKernel));
  if (K && typeof K.init === 'function') return (o) => K.init(o);
  const c = m && (m.createOcctKernel || (m.default && m.default.createOcctKernel) || (typeof m.default === 'function' ? m.default : null));
  return c ? (o) => c(o) : null;
};
async function loadModule(opts, notes) {
  if (opts && opts.module) return opts.module;
  let last = null;
  for (const f of FILES) {
    try { const m = await import(/* @vite-ignore */ here(f)); if (factoryOf(m)) return m; notes.push(f + ' loaded but exports no OcctKernel'); }
    catch (e) { last = e; notes.push(f + ': ' + ((e && e.message) || e)); }
  }
  throw new Error('occt-wasm.js was not found next to aakar-occt.mjs (' + here('') + '). Run  node scripts/fetch-occt-wasm.js  after  npm install occt-wasm.' + (last ? ' Last error: ' + (last.message || last) : ''));
}
async function createRaw(factory, opts, notes) {
  const attempts = [['default', () => factory(undefined)]];
  attempts.push(['wasm blob', async () => { const b = await readBytes(here('occt-wasm.wasm')); const url = URL.createObjectURL(new Blob([b], { type: 'application/wasm' })); return factory({ wasmUrl: url, wasm: url, locateFile: () => url }); }]);
  attempts.push(['wasm bytes', async () => { const b = await readBytes(here('occt-wasm.wasm')); return factory({ wasmBinary: new Uint8Array(b) }); }]);
  for (const [label, fn] of attempts) {
    try { const k = await fn(); if (k) { notes.push('kernel started (' + label + ')'); return k; } } catch (e) { notes.push(label + ': ' + ((e && e.message) || e)); }
  }
  throw new Error('occt-wasm could not start — ' + notes.join(' | '));
}

// ---------------------------------------------------------------------------------------------------------------- the kernel
function perms(a) { if (a.length <= 1) return [a.slice()]; const o = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach((p) => o.push([x].concat(p)))); return o; }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * (1 + Math.abs(b));

function wrapKernel(raw, notes) {
  const pick = (...n) => { for (const x of n) if (typeof raw[x] === 'function') return raw[x].bind(raw); return null; };
  const unwrap = (r, what) => {
    if (r && typeof r === 'object' && !Array.isArray(r) && !ArrayBuffer.isView(r) && 'ok' in r) {
      if (!r.ok) throw new Error((r.error && (r.error.message || r.error.code)) || (what + ' failed'));
      for (const k of ['shape', 'handle', 'value', 'result', 'data']) if (k in r) return r[k];
      return r;
    }
    return r;
  };
  const num = (r, what) => { r = unwrap(r, what); if (r && typeof r === 'object' && !Array.isArray(r)) r = r.value != null ? r.value : r.volume != null ? r.volume : r.area != null ? r.area : r; if (typeof r !== 'number' || !isFinite(r)) throw new Error(what + ' returned no number'); return r; };
  // ---- handle bookkeeping: occt-wasm keeps shapes in an arena; free the old intermediates of long replays
  const live = []; const release = pick('release', 'free', 'dispose');
  const track = (h) => { if (h != null) { live.push(h); if (release && live.length > 1000) live.splice(0, 300).forEach((x) => { try { release(x); } catch (e) { /* ignore */ } }); } return h; };
  const call = (fn, what, ...a) => track(unwrap(fn(...a), what));
  const F = {
    box: pick('makeBox', 'box'), cyl: pick('makeCylinder', 'cylinder'), cone: pick('makeCone', 'cone'), sph: pick('makeSphere', 'sphere'), tor: pick('makeTorus', 'torus'),
    fuse: pick('fuse', 'union'), cut: pick('cut', 'subtract'), common: pick('common', 'intersect'),
    translate: pick('translate', 'move'), rotate: pick('rotate'), scale: pick('scale'),
    vol: pick('getVolume', 'volume'), area: pick('getSurfaceArea', 'surfaceArea', 'getArea', 'area'), bbox: pick('getBoundingBox', 'boundingBox', 'bbox'),
    com: pick('getCenterOfMass', 'centerOfMass', 'getCentreOfMass'), tess: pick('tessellate', 'mesh', 'meshShape'),
    stepOut: pick('exportStep', 'stepExport'), stepIn: pick('importStep', 'stepImport'), valid: pick('checkValidity', 'isValid', 'validate', 'checkShape')
  };
  const need = ['box', 'cyl', 'sph', 'fuse', 'cut', 'common', 'translate', 'vol', 'bbox', 'tess', 'stepOut'].filter((k) => !F[k]);
  if (need.length) throw new Error('this occt-wasm build lacks: ' + need.join(', ') + '. Methods found: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(raw)).concat(Object.keys(raw)).filter((x) => typeof raw[x] === 'function').slice(0, 60).join(', '));
  const vec = (r) => { r = unwrap(r, 'vector'); if (Array.isArray(r) || ArrayBuffer.isView(r)) return [r[0], r[1], r[2]]; if (r && 'x' in r) return [r.x, r.y, r.z]; throw new Error('unreadable vector'); };
  const parseBox = (r) => {
    r = unwrap(r, 'bounding box');
    if (r && r.min && r.max) return { min: vec(r.min), max: vec(r.max) };
    if (r && r.xmin !== undefined) return { min: [r.xmin, r.ymin, r.zmin], max: [r.xmax, r.ymax, r.zmax] };
    if (r && r.minX !== undefined) return { min: [r.minX, r.minY, r.minZ], max: [r.maxX, r.maxY, r.maxZ] };
    if ((Array.isArray(r) || ArrayBuffer.isView(r)) && r.length >= 6) return { min: [r[0], r[1], r[2]], max: [r[3], r[4], r[5]] };
    throw new Error('unreadable bounding box');
  };
  const bboxOf = (h) => parseBox(F.bbox(h));
  const ext = (b) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

  // ---- calibration: translate (checked as a SHIFT of the bounding box, so it does not matter where the kernel anchors a box)
  let tr = null, probe = null, pb = null;
  try { probe = unwrap(F.box(1, 1, 1), 'box'); pb = bboxOf(probe); } catch (e) { throw new Error('makeBox(1,1,1) failed: ' + ((e && e.message) || e)); }
  { const forms = [(h, v) => F.translate(h, v[0], v[1], v[2]), (h, v) => F.translate(h, v), (h, v) => F.translate(h, { x: v[0], y: v[1], z: v[2] })];
    for (const f of forms) { try { const b = bboxOf(unwrap(f(probe, [5, 6, 7]), 'translate')); if (near(b.min[0] - pb.min[0], 5, 1e-6) && near(b.min[1] - pb.min[1], 6, 1e-6) && near(b.min[2] - pb.min[2], 7, 1e-6)) { tr = f; break; } } catch (e) { /* next form */ } }
    if (!tr) throw new Error('could not work out how translate() is called'); }
  const translate = (h, v) => (v[0] === 0 && v[1] === 0 && v[2] === 0 ? h : call(tr, 'translate', h, v));

  // ---- calibration: primitives (argument order + anchor point) → wrappers that follow Aakar's convention
  //      box: corner on the origin · cylinder / cone: base centred on the origin, axis +z · sphere / torus: centred on the origin
  //      The anchor offset is stored as a FRACTION of the shape's size (a centred box sits half its size off the corner), so it holds for any size.
  function calibPrim(label, fn, params, extFn, minFn) {
    if (!fn) return null;
    const expExt = extFn(params), expMin = minFn(params);
    for (const p of perms(params.map((_, i) => i))) {
      try {
        const h = unwrap(fn(...p.map((i) => params[i])), label), b = bboxOf(h), e = ext(b);
        if (e.every((x, i) => near(x, expExt[i], 1e-5))) {
          const frac = [0, 1, 2].map((i) => (expExt[i] > 0 ? (b.min[i] - expMin[i]) / expExt[i] : 0)), fix = frac.some((x) => Math.abs(x) > 1e-9);
          if (fix) notes.push(label + ': shape is anchored differently (offset ' + frac.map((x) => x.toFixed(2)).join(',') + ' of its size), compensating');
          return (...a) => {
            const s = call(fn, label, ...p.map((i) => a[i]));
            if (!fix) return s;
            const E = extFn(a); return call(tr, 'translate', s, [-frac[0] * E[0], -frac[1] * E[1], -frac[2] * E[2]]);
          };
        }
      } catch (e) { /* next order */ }
    }
    throw new Error('could not work out the arguments of ' + label);
  }
  //      sizes and anchors in Aakar's convention, as functions of the arguments given in Aakar's order
  const boxExt = (a) => [a[0], a[1], a[2]], boxMin = () => [0, 0, 0];
  const cylExt = (a) => [2 * a[0], 2 * a[0], a[1]], cylMin = (a) => [-a[0], -a[0], 0];
  const sphExt = (a) => [2 * a[0], 2 * a[0], 2 * a[0]], sphMin = (a) => [-a[0], -a[0], -a[0]];
  const coneExt = (a) => [2 * Math.max(a[0], a[1]), 2 * Math.max(a[0], a[1]), a[2]], coneMin = (a) => [-Math.max(a[0], a[1]), -Math.max(a[0], a[1]), 0];
  const torExt = (a) => [2 * (a[0] + a[1]), 2 * (a[0] + a[1]), 2 * a[1]], torMin = (a) => [-(a[0] + a[1]), -(a[0] + a[1]), -a[1]];
  const box = calibPrim('makeBox', F.box, [2, 3, 4], boxExt, boxMin);
  const cylinder = calibPrim('makeCylinder', F.cyl, [2, 5], cylExt, cylMin);
  const sphere = calibPrim('makeSphere', F.sph, [2], sphExt, sphMin);
  let cone = null, torus = null;
  try { cone = calibPrim('makeCone', F.cone, [3, 1, 5], coneExt, coneMin); } catch (e) { notes.push(String(e.message || e)); }
  try { torus = calibPrim('makeTorus', F.tor, [5, 1], torExt, torMin); } catch (e) { notes.push(String(e.message || e)); }

  // ---- calibration: rotate (angle units and axis form) and scale
  let rot = null, scl = null;
  if (F.rotate) {
    const forms = [];
    for (const unit of ['rad', 'deg']) {
      const A = (a) => (unit === 'rad' ? a : a * 180 / Math.PI);
      forms.push({ origin: true, f: (h, o, d, a) => F.rotate(h, o, d, A(a)) }, { origin: true, f: (h, o, d, a) => F.rotate(h, o[0], o[1], o[2], d[0], d[1], d[2], A(a)) }, { origin: false, f: (h, o, d, a) => F.rotate(h, d, A(a)) }, { origin: false, f: (h, o, d, a) => F.rotate(h, d[0], d[1], d[2], A(a)) });
    }
    // asymmetric probe (a 1×2×3 box on the origin): 90° about +z maps (x, y) to (−y, x), so x spans −2…0 and y spans 0…1 — a call that does nothing cannot pass
    const rp = box(1, 2, 3);
    for (const fm of forms) { try { const b = bboxOf(unwrap(fm.f(rp, [0, 0, 0], [0, 0, 1], Math.PI / 2), 'rotate')); if (near(b.min[0], -2, 1e-6) && near(b.max[0], 0, 1e-6) && near(b.min[1], 0, 1e-6) && near(b.max[1], 1, 1e-6) && near(b.max[2], 3, 1e-6)) { rot = fm; break; } } catch (e) { /* next */ } }
    if (!rot) notes.push('rotate(): signature not recognised (rotation of exact bodies disabled)');
  }
  if (F.scale) {
    const forms = [{ origin: false, f: (h, o, s) => F.scale(h, s) }, { origin: true, f: (h, o, s) => F.scale(h, o, s) }, { origin: true, f: (h, o, s) => F.scale(h, o[0], o[1], o[2], s) }, { origin: false, f: (h, o, s) => F.scale(h, s, s, s) }];
    const sp = box(1, 2, 3);
    for (const fm of forms) { try { const b = bboxOf(unwrap(fm.f(sp, [0, 0, 0], 2), 'scale')); if (near(b.max[0], 2, 1e-6) && near(b.max[1], 4, 1e-6) && near(b.max[2], 6, 1e-6) && near(b.min[0], 0, 1e-6)) { scl = fm; break; } } catch (e) { /* next */ } }
    if (!scl) notes.push('scale(): signature not recognised');
  }

  // ---- mesh / STEP normalisation
  const toBytesOrText = (r) => { r = unwrap(r, 'STEP'); if (typeof r === 'string') return r; if (ArrayBuffer.isView(r) || r instanceof ArrayBuffer) return new TextDecoder().decode(r); if (r && typeof r === 'object') { for (const k of ['step', 'text', 'data', 'content']) if (k in r) return toBytesOrText(r[k]); } throw new Error('unreadable STEP output'); };
  const mesh = (h, tol) => {
    const lin = tol > 0 ? tol : 0.1; let r = null, err = null;
    for (const a of [[h, lin, 0.35], [h, { linearDeflection: lin, angularDeflection: 0.35 }], [h]]) { try { r = unwrap(F.tess(...a), 'tessellate'); if (r) break; } catch (e) { err = e; } }
    if (!r) throw err || new Error('tessellate returned nothing');
    const positions = r.positions || r.vertices || r.points, indices = r.indices || r.triangles || r.faces;
    if (!positions || !indices) throw new Error('tessellate output has no positions / indices');
    return { positions, indices, normals: r.normals || null };
  };
  const k = {
    name, version, isOcctWasm: true, raw,
    box, cylinder, sphere, cone, torus,
    translate: (h, v) => translate(h, v),
    rotate: (h, axis, angle, center) => {
      if (!rot) throw new Error('rotate is not available in this kernel');
      const c = center || [0, 0, 0], d = axis; let s = h;
      if (!rot.origin && (c[0] || c[1] || c[2])) s = translate(s, [-c[0], -c[1], -c[2]]);
      s = call(rot.f, 'rotate', s, rot.origin ? c : [0, 0, 0], d, angle);
      if (!rot.origin && (c[0] || c[1] || c[2])) s = translate(s, c);
      return s;
    },
    scale: (h, f, center) => {
      if (!scl) throw new Error('scale is not available in this kernel');
      const c = center || [0, 0, 0]; let s = h;
      if (!scl.origin) { s = call(scl.f, 'scale', s, c, f); return (c[0] || c[1] || c[2]) ? translate(s, [c[0] - f * c[0], c[1] - f * c[1], c[2] - f * c[2]]) : s; }
      return call(scl.f, 'scale', s, c, f);
    },
    fuse: (a, b) => call(F.fuse, 'fuse', a, b), cut: (a, b) => call(F.cut, 'cut', a, b), common: (a, b) => call(F.common, 'common', a, b),
    volume: (h) => Math.abs(num(F.vol(h), 'volume')),
    area: (h) => { if (!F.area) throw new Error('this occt-wasm build has no surface-area query'); return num(F.area(h), 'area'); },
    bbox: (h) => bboxOf(h),
    mesh,
    stepExport: (h) => toBytesOrText(F.stepOut(h)),
    stepImport: (text) => { if (!F.stepIn) throw new Error('this occt-wasm build has no STEP import'); return call(F.stepIn, 'importStep', text); },
    massProps: (h) => ({ volume: Math.abs(num(F.vol(h), 'volume')), area: F.area ? num(F.area(h), 'area') : NaN, centroid: F.com ? vec(F.com(h)) : [NaN, NaN, NaN], inertia: null, approximateFaces: 0 }),
    validate: F.valid ? (h) => { const r = unwrap(F.valid(h), 'validity'); const ok = typeof r === 'boolean' ? r : !!(r && (r.valid ?? r.ok ?? r.isValid ?? r.success)); return { ok, issues: ok ? [] : [{ severity: 'error', code: 'OCCT', message: 'OpenCascade reports the shape as invalid' }] }; } : undefined,
    dispose: () => { try { if (typeof raw.dispose === 'function') raw.dispose(); } catch (e) { /* ignore */ } }
  };
  return k;
}

let cached = null;
export function init(opts) {
  opts = opts || {};
  if (cached && !opts.fresh) return cached;
  const notes = [];
  cached = (async () => {
    const mod = await loadModule(opts, notes);
    const factory = factoryOf(mod); if (!factory) throw new Error('the occt-wasm module exports no OcctKernel');
    if (mod.version) version = String(mod.version);
    const raw = opts.raw || (await createRaw(factory, opts, notes));
    const kernel = wrapKernel(raw, notes); kernel.notes = notes; return kernel;
  })();
  cached.catch(() => { cached = null; });      // allow another try after a failure
  return cached;
}
export default { name, get version() { return version; }, init };
