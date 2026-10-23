// Builds app/occt/ for the desktop app: the binding as one ES module (aakar-occt.mjs) + the WebAssembly files + licence notices.
//   npm install --no-save occt-wasm esbuild && node tools/build-occt.mjs
// esbuild bundles the binding with the package. Without esbuild the package is copied next to the binding and the import is rewritten
// to a relative path (works when the package has no further bare imports).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd(), OUT = path.join(ROOT, 'app', 'occt');
// find the package folder itself (require.resolve('occt-wasm/package.json') fails when the package's "exports" does not list package.json)
let pkgDir = null; for (let d = ROOT; ; d = path.dirname(d)) { const c = path.join(d, 'node_modules', 'occt-wasm'); if (fs.existsSync(path.join(c, 'package.json'))) { pkgDir = c; break; } if (path.dirname(d) === d) break; }
if (!pkgDir) { console.error('occt-wasm is not installed - run: npm install --no-save occt-wasm esbuild'); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const src = path.join(ROOT, 'occt', 'binding-occt-wasm.mjs');
let bundled = false;
try {
  const { build } = await import('esbuild');
  await build({ entryPoints: [src], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: path.join(OUT, 'aakar-occt.mjs'), logLevel: 'warning', loader: { '.wasm': 'file' } });
  bundled = true; console.log('bundled with esbuild');
} catch (e) {
  if (!/Cannot find (package|module) 'esbuild'|ERR_MODULE_NOT_FOUND/.test(String(e && (e.code || '') + ' ' + e.message))) { console.error('esbuild failed:', e.message); process.exit(1); }
  const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')), entry = (pj.exports && (pj.exports['.'] && (pj.exports['.'].import || pj.exports['.'].default || pj.exports['.']))) || pj.module || pj.main || 'index.js';
  fs.cpSync(pkgDir, path.join(OUT, 'occt-wasm'), { recursive: true, filter: (p) => !/[\\/](node_modules|test|examples|benchmarks)([\\/]|$)/.test(p.slice(pkgDir.length)) });
  const rel = './occt-wasm/' + String(entry).replace(/^\.\//, '');
  fs.writeFileSync(path.join(OUT, 'aakar-occt.mjs'), fs.readFileSync(src, 'utf8').replace(/from 'occt-wasm'/, "from '" + rel + "'"));
  console.log('esbuild not available: copied the package and pointed the binding at', rel);
}
let wasm = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(node_modules|test|examples|benchmarks)$/.test(e.name)) walk(p); } else if (/\.wasm$/i.test(e.name)) { const dst = path.join(OUT, e.name); if (!fs.existsSync(dst)) fs.copyFileSync(p, dst); wasm++; } } };
walk(pkgDir);
if (!wasm) { console.error('No .wasm file found in the occt-wasm package - check its layout.'); process.exit(1); }
for (const f of ['LICENSE', 'LICENSE-APACHE', 'LICENSE-MIT']) { const s = path.join(pkgDir, f); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(OUT, 'OCCT-WASM-' + f + '.txt')); }
fs.writeFileSync(path.join(OUT, 'NOTICE.txt'), 'OpenCascade Technology (OCCT), compiled to WebAssembly by the occt-wasm package. OCCT is LGPL-2.1 with the OCCT exception.\nThis folder is a separate, replaceable component of Aakar. Built ' + new Date().toISOString() + (bundled ? ' (bundled)' : ' (copied)') + '.\n');
console.log('exact kernel written to', path.relative(ROOT, OUT), '-', wasm, 'wasm file(s)');
