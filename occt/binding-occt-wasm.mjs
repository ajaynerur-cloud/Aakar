// Aakar exact-kernel binding for the npm package "occt-wasm" (OpenCascade V8 compiled to WebAssembly, github.com/andymai/occt-wasm).
// Confirmed from that package's README: OcctKernel.init, makeBox, makeCylinder, fuse, cut, common, tessellate -> {positions, normals, indices},
// exportStep, importStep, getVolume. makeSphere appears in the package's Rust crate docs. translate and surface area are not confirmed, so
// several likely names are tried and the error lists them. This file has not been run against the real package by its author:
// `node tools/occt-selftest.mjs` (run by the GitHub workflow) is the gate, and the app is built without the kernel if it fails.
import { OcctKernel } from 'occt-wasm';

export const name = 'occt-wasm';
export const version = 'OpenCascade V8';

const text = (s) => (typeof s === 'string' ? s : new TextDecoder().decode(s));
const pick = (k, names) => { for (const n of names) if (typeof k[n] === 'function') return k[n].bind(k); return null; };
const need = (k, label, names) => { const f = pick(k, names); if (!f) throw new Error('occt-wasm has none of ' + names.join(' / ') + ' (needed for ' + label + ')'); return f; };

export async function init(opts = {}) {
  const k = await OcctKernel.init(opts.init);
  const makeBox = need(k, 'box', ['makeBox']), makeCyl = need(k, 'cylinder', ['makeCylinder']), makeSph = need(k, 'sphere', ['makeSphere']);
  const fuse = need(k, 'union', ['fuse']), cut = need(k, 'subtract', ['cut']), common = need(k, 'intersect', ['common']);
  const vol = need(k, 'volume', ['getVolume', 'volume']), tess = need(k, 'mesh', ['tessellate']), step = need(k, 'STEP export', ['exportStep']);
  const tr = pick(k, ['translate', 'translateShape', 'move']), area = pick(k, ['getSurfaceArea', 'surfaceArea', 'getArea', 'area']);
  const cone = pick(k, ['makeCone']), imp = pick(k, ['importStep']), rel = pick(k, ['release', 'free']);
  return {
    name, version,
    box: (w, d, h) => makeBox(w, d, h),                       // corner at the origin (OpenCascade convention; checked by the self-test)
    cylinder: (r, h) => makeCyl(r, h),                        // base centre at the origin, along +Z
    sphere: (r) => makeSph(r),                                // centre at the origin
    cone: cone ? (r1, r2, h) => cone(r1, r2, h) : undefined,
    translate: (h, v) => { if (!tr) throw new Error('occt-wasm has no translate / translateShape / move'); return tr(h, v[0], v[1], v[2]); },
    fuse: (a, b) => fuse(a, b), cut: (a, b) => cut(a, b), common: (a, b) => common(a, b),
    volume: (h) => vol(h),
    area: (h) => { if (!area) throw new Error('occt-wasm has no getSurfaceArea / surfaceArea / getArea / area'); return area(h); },
    mesh: (h, tol) => { let m; try { m = tess(h, tol, 0.5); } catch (e) { m = tess(h); } const tri = m.indices.length / 3, ids = m.faceIds || m.faceGroups || m.faces || null; return { positions: m.positions, indices: m.indices, faces: ids && ids.length === tri ? ids : null }; },
    stepExport: (h) => text(step(h)),
    stepImport: imp ? (s) => imp(s) : undefined,
    release: (h) => { if (rel) rel(h); }
  };
}
