// Package tests that need no network: the aakar-asset handler, the kernel build tool and the self-test gate (pass and fail).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import Module from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m); } else { fail++; console.log('  FAIL  ' + m); } };

// ---- 1. the asset handler in main.js (with a stand-in electron module)
{
  const require = createRequire(path.join(ROOT, 'main.js')), noop = () => {};
  const fake = { app: { on: noop, whenReady: () => new Promise(noop), requestSingleInstanceLock: () => true, quit: noop }, BrowserWindow: function () {}, ipcMain: { on: noop }, shell: {}, Menu: {}, dialog: {}, protocol: { registerSchemesAsPrivileged: noop, handle: noop } };
  const orig = Module._load; Module._load = function (req, ...rest) { return req === 'electron' ? fake : orig.call(this, req, ...rest); };
  const { serveAsset } = require(path.join(ROOT, 'main.js')); Module._load = orig;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-occt-')); fs.writeFileSync(path.join(dir, 'k.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])); fs.writeFileSync(path.join(dir, 'aakar-occt.mjs'), 'export const name = "x";');
  const r1 = await serveAsset(new Request('aakar-asset://occt/k.wasm'), dir), b1 = Buffer.from(await r1.arrayBuffer());
  ok(r1.status === 200 && r1.headers.get('content-type') === 'application/wasm' && b1.length === 8, 'asset handler serves a .wasm with application/wasm');
  const r2 = await serveAsset(new Request('aakar-asset://occt/aakar-occt.mjs'), dir); ok(r2.status === 200 && /javascript/.test(r2.headers.get('content-type')), 'asset handler serves the module as JavaScript');
  ok((await serveAsset(new Request('aakar-asset://occt/missing.wasm'), dir)).status === 404, 'missing file gives 404');
  fs.writeFileSync(path.join(path.dirname(dir), 'aakar-secret.txt'), 'secret');
  const trav = await Promise.all(['aakar-asset://occt/../aakar-secret.txt', 'aakar-asset://occt/%2E%2E/aakar-secret.txt', 'aakar-asset://occt/..%2Faakar-secret.txt', 'aakar-asset://occt/%2e%2e%5caakar-secret.txt'].map(async (u) => { const r = await serveAsset(new Request(u), dir); return r.status === 200 ? (await r.text()) : r.status; }));
  ok(trav.every((x) => x !== 'secret'), 'files outside app/occt can never be read (statuses ' + trav.join(', ') + ')');
  ok((await serveAsset(new Request('aakar-asset://other/k.wasm'), dir)).status === 403, 'other hosts are refused');
  ok((await serveAsset(new Request('aakar-asset://smlib/k.wasm'), dir)).status === 200, 'the smlib host is served too (SMLib WebAssembly route)');
}

// ---- 1b. SMLib native route in main.js: loader, IPC call shim, handles (with a stand-in kernel module)
{
  const require = createRequire(path.join(ROOT, 'main.js')), noop = () => {};
  const fake = { app: { on: noop, whenReady: () => new Promise(noop), requestSingleInstanceLock: () => true, quit: noop }, BrowserWindow: function () {}, ipcMain: { on: noop }, shell: {}, Menu: {}, dialog: {}, protocol: { registerSchemesAsPrivileged: noop, handle: noop } };
  const orig = Module._load; Module._load = function (req, ...rest) { return req === 'electron' ? fake : orig.call(this, req, ...rest); };
  const mainPath = require.resolve(path.join(ROOT, 'main.js')); delete require.cache[mainPath];
  const M = require(mainPath); Module._load = orig;
  const none = await M.loadSmlibNative(fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-nosm-')));
  ok(!none.kernel && /no native SMLib module/.test(none.error) && M.smlibInfo().available === false, 'no native SMLib module: reported as unavailable (' + none.error + ')');
  ok(M.smlibCall('box', [1, 1, 1]).ok === false, 'calls fail cleanly while SMLib is not loaded');
}
{
  const require = createRequire(path.join(ROOT, 'main.js')), noop = () => {};
  const fake = { app: { on: noop, whenReady: () => new Promise(noop), requestSingleInstanceLock: () => true, quit: noop }, BrowserWindow: function () {}, ipcMain: { on: noop }, shell: {}, Menu: {}, dialog: {}, protocol: { registerSchemesAsPrivileged: noop, handle: noop } };
  const orig = Module._load; Module._load = function (req, ...rest) { return req === 'electron' ? fake : orig.call(this, req, ...rest); };
  const mainPath = require.resolve(path.join(ROOT, 'main.js')); delete require.cache[mainPath];
  const M = require(mainPath); Module._load = orig;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-sm-'));
  fs.writeFileSync(path.join(d, 'index.js'), `exports.name = 'SMLib test'; exports.version = '9.9';
    exports.init = async () => { const S = []; const put = (v) => (S.push({ v }), S[S.length - 1]);
      return { box: (w, d, h) => put(w * d * h), cylinder: (r, h) => put(Math.PI * r * r * h), sphere: (r) => put(4 / 3 * Math.PI * r ** 3), translate: (s) => put(s.v),
        fuse: (a, b) => put(a.v + b.v), cut: (a, b) => put(a.v - b.v), common: (a, b) => put(Math.min(a.v, b.v)), volume: (s) => s.v, area: () => 0,
        mesh: () => ({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }), stepExport: () => 'ISO-10303-21;', release: () => {} }; };`);
  const st = await M.loadSmlibNative(d), inf = M.smlibInfo();
  ok(st.kernel && inf.available && inf.name === 'SMLib test' && inf.version === '9.9' && inf.methods.includes('release'), 'native SMLib module loads (async init) and reports its name, version and methods');
  const a = M.smlibCall('box', [10, 10, 10]), b = M.smlibCall('box', [5, 2, 1]);
  ok(a.ok && a.value && typeof a.value.__sm === 'number', 'shapes come back as handles { __sm }');
  const c = M.smlibCall('cut', [a.value, b.value]), v = M.smlibCall('volume', [c.value]);
  ok(v.ok && v.value === 990, 'handles round-trip through booleans and measurements (volume ' + v.value + ')');
  const m = M.smlibCall('mesh', [c.value, 0.1]); ok(m.ok && m.value.positions instanceof Float32Array, 'mesh data passes through unchanged');
  ok(M.smlibCall('rotate', [a.value]).ok === false && M.smlibCall('__proto__', []).ok === false, 'missing / unknown methods are refused');
  M.smlibCall('release', [c.value]); ok(/stale/.test(M.smlibCall('volume', [c.value]).error || ''), 'a released handle is reported as stale');
}

// ---- 2. the kernel build tool and the self-test gate, with stand-in "occt-wasm" packages in a scratch copy
const fakeKernel = (exact) => `
const H = new Map(); let n = 1; const put = (s) => { H.set(n, s); return n++; }, g = (h) => H.get(h);
const PI = Math.PI;
export class OcctKernel {
  static async init() { return new OcctKernel(); }
  makeBox(w, d, h) { return put({ v: w * d * h, a: 2 * (w * d + d * h + w * h), kind: 'box', w, d, h, o: [0, 0, 0] }); }
  makeCylinder(r, h) { return put({ v: PI * r * r * h, a: 2 * PI * r * (r + h), kind: 'cyl', r, h, o: [0, 0, 0] }); }
  makeSphere(r) { return put({ v: 4 / 3 * PI * r ** 3, a: 4 * PI * r * r, kind: 'sph', r, o: [0, 0, 0] }); }
  translate(h, x, y, z) { const s = g(h); return put({ ...s, o: [s.o[0] + x, s.o[1] + y, s.o[2] + z] }); }
  getBoundingBox(h) { const s = g(h), o = s.o || [0, 0, 0], P = (x, y, z) => ({ x, y, z });
    if (s.kind === 'box') return { min: P(o[0], o[1], o[2]), max: P(o[0] + s.w, o[1] + s.d, o[2] + s.h) };
    if (s.kind === 'cyl') return { min: P(o[0] - s.r, o[1] - s.r, o[2]), max: P(o[0] + s.r, o[1] + s.r, o[2] + s.h) };
    if (s.kind === 'sph') return { min: P(o[0] - s.r, o[1] - s.r, o[2] - s.r), max: P(o[0] + s.r, o[1] + s.r, o[2] + s.r) };
    return { min: P(0, 0, 0), max: P(1, 1, 1) }; }
  fuse(a, b) { const A = g(a), B = g(b); return put({ v: A.v + B.v - overlap(A, B), a: 0 }); }
  cut(a, b) { const A = g(a), B = g(b); return put({ v: A.v - overlap(A, B), a: 0 }); }
  common(a, b) { return put({ v: overlap(g(a), g(b)), a: 0 }); }
  getVolume(h) { return g(h).v; } getSurfaceArea(h) { return g(h).a; }
  tessellate(h) { const s = g(h); if (s.kind === 'cyl') { const P = [], I = []; for (let i = 0; i < 64; i++) { const t = 2 * PI * i / 64; P.push(s.r * Math.cos(t), s.r * Math.sin(t), 0, s.r * Math.cos(t), s.r * Math.sin(t), s.h); } for (let i = 0; i < 62; i++) I.push(i, i + 1, i + 2); return { positions: new Float32Array(P), indices: new Uint32Array(I), normals: new Float32Array(P.length) }; }
    const w = s.w || 1, d = s.d || 1, hh = s.h || 1, P = [0,0,0, w,0,0, w,d,0, 0,d,0, 0,0,hh, w,0,hh, w,d,hh, 0,d,hh], I = [0,1,2,0,2,3,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]; return { positions: new Float32Array(P), indices: new Uint32Array(I), normals: new Float32Array(24) }; }
  exportStep(h) { const s = g(h); return 'ISO-10303-21;\\nDATA;\\n' + (${exact} && s.kind === 'cyl' ? '#1=CYLINDRICAL_SURFACE();\\n' : '#1=PLANE();\\n') + '/*V=' + s.v + '*/\\nENDSEC;\\nEND-ISO-10303-21;'; }
  importStep(t) { const m = /V=([0-9.e+-]+)/.exec(t); return put({ v: +m[1], a: 0 }); }
}
// overlap of axis-aligned boxes, or of a cylinder fully crossing a box slab (enough for the conformance checks)
function overlap(A, B) {
  if (A.kind === 'box' && B.kind === 'box') { let v = 1; for (let k = 0; k < 3; k++) { const a0 = A.o[k], a1 = a0 + [A.w, A.d, A.h][k], b0 = B.o[k], b1 = b0 + [B.w, B.d, B.h][k]; v *= Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); } return v; }
  if (A.kind === 'box' && B.kind === 'cyl') return PI * B.r * B.r * Math.max(0, Math.min(A.o[2] + A.h, B.o[2] + B.h) - Math.max(A.o[2], B.o[2]));
  return 0;
}`;
function scratch(exact) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-pkg-'));
  fs.cpSync(path.join(ROOT, 'tools'), path.join(d, 'tools'), { recursive: true }); fs.cpSync(path.join(ROOT, 'occt'), path.join(d, 'occt'), { recursive: true });
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"t","private":true,"type":"commonjs"}');
  const p = path.join(d, 'node_modules', 'occt-wasm'); fs.mkdirSync(path.join(p, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name: 'occt-wasm', version: '0.0.0-test', type: 'module', exports: { '.': { import: './dist/index.js' } } }));
  fs.writeFileSync(path.join(p, 'dist', 'index.js'), fakeKernel(exact)); fs.writeFileSync(path.join(p, 'dist', 'occt.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])); fs.writeFileSync(path.join(p, 'LICENSE-MIT'), 'MIT');
  return d;
}
const run = (cwd, args) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
{
  const d = scratch(true), b = run(d, ['tools/build-occt.mjs']);
  ok(b.status === 0, 'build-occt finishes (' + (b.stdout.trim().split('\n').pop() || b.stderr.trim()) + ')');
  const out = path.join(d, 'app', 'occt'), files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  ok(files.includes('aakar-occt.mjs') && files.includes('occt.wasm') && files.includes('NOTICE.txt'), 'app/occt has the module, the .wasm and the notice: ' + files.join(', '));
  const t = run(d, ['tools/occt-selftest.mjs', 'app/occt/aakar-occt.mjs']);
  ok(t.status === 0 && /all \d+ checks passed/.test(t.stdout), 'self-test of the BUILT module passes with a conforming kernel (exit ' + t.status + ')');
  const t2 = run(d, ['tools/occt-selftest.mjs']);
  ok(t2.status === 0, 'self-test of the binding source passes with a conforming kernel (exit ' + t2.status + ')');
}
{
  const d = scratch(false), t = run(d, ['tools/occt-selftest.mjs']);
  ok(t.status === 1 && /FAIL\s+STEP export writes a true cylinder/.test(t.stdout) && /will NOT be packaged/.test(t.stderr), 'self-test FAILS (exit 1) when STEP has no true cylinder - the kernel would be left out');
}
{
  const d = scratch(true); fs.writeFileSync(path.join(d, 'node_modules', 'occt-wasm', 'dist', 'index.js'), 'export class OcctKernel { static async init() { return {}; } }');
  const t = run(d, ['tools/occt-selftest.mjs']); ok(t.status === 1 && /none of makeBox/.test(t.stderr), 'a package with a different API fails with a clear message: ' + (t.stderr.trim().split('\n')[0] || ''));
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-none-')); fs.cpSync(path.join(ROOT, 'tools'), path.join(d, 'tools'), { recursive: true }); fs.writeFileSync(path.join(d, 'package.json'), '{}');
  const b = run(d, ['tools/build-occt.mjs']); ok(b.status === 1 && /not installed/.test(b.stderr), 'build-occt without the package stops with "not installed"');
}
// ---- 6. the run-time binding app/occt/aakar-occt.mjs must use the package FACADE (index.js -> OcctKernel), not the raw
//         Emscripten factory occt-wasm.js that sits next to it (that mix-up left desktop users with "OpenCascade not available")
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aakar-rt-')), o = path.join(d, 'app', 'occt'); fs.mkdirSync(o, { recursive: true });
  fs.cpSync(path.join(ROOT, 'tools'), path.join(d, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'app', 'occt', 'aakar-occt.mjs'), path.join(o, 'aakar-occt.mjs'));
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"t","private":true,"type":"commonjs"}');
  fs.copyFileSync(path.join(ROOT, 'app', 'occt', 'package.json'), path.join(o, 'package.json'));
  fs.writeFileSync(path.join(o, 'index.js'), fakeKernel(true));
  fs.writeFileSync(path.join(o, 'occt-wasm.js'), 'export default async function createModule() { return { OcctKernel: function () {}, VectorDouble: function () {} }; }');
  fs.writeFileSync(path.join(o, 'occt-wasm.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  const t = run(d, ['tools/occt-selftest.mjs', 'app/occt/aakar-occt.mjs']);
  ok(t.status === 0 && /all \d+ checks passed/.test(t.stdout), 'run-time binding loads index.js (OcctKernel) even when the raw occt-wasm.js is present (exit ' + t.status + (t.status ? ': ' + (t.stderr.trim().split('\n')[0] || '') : '') + ')');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
