// Copies the runtime of the `occt-wasm` npm package into app/occt/ so that Aakar can load it at run time (no bundler involved).
//   npm install occt-wasm --no-save && node scripts/fetch-occt-wasm.js
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), pkgDir = path.join(root, 'node_modules', 'occt-wasm'), src = path.join(pkgDir, 'dist'), dst = path.join(root, 'app', 'occt');
if (!fs.existsSync(src)) { console.error('[occt] node_modules/occt-wasm/dist not found. Run: npm install occt-wasm --no-save'); process.exit(1); }
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b); else if (!/\.(d\.ts|map)$/.test(e.name)) fs.copyFileSync(a, b);
  }
}
copy(src, dst);
const all = fs.readdirSync(dst), js = all.find((f) => /^occt-wasm\.(m?js)$/.test(f)), wasm = all.find((f) => /\.wasm$/.test(f));
if (!js || !wasm) { console.error('[occt] expected occt-wasm.js and a .wasm file in ' + dst + ', found: ' + all.join(', ')); process.exit(1); }
if (wasm !== 'occt-wasm.wasm') fs.copyFileSync(path.join(dst, wasm), path.join(dst, 'occt-wasm.wasm'));
const ver = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(dst, 'occt-wasm-manifest.json'), JSON.stringify({ package: 'occt-wasm', version: ver, js, wasm, wasmMB: +(fs.statSync(path.join(dst, wasm)).size / 1048576).toFixed(1) }, null, 2));
fs.writeFileSync(path.join(dst, 'NOTICE.txt'), 'OpenCascade Technology (OCCT) compiled to WebAssembly by the occt-wasm package ' + ver + '.\nOCCT is LGPL-2.1 with the OCCT exception; occt-wasm.wasm is a separate, replaceable component of Aakar.\n');
console.log('[occt] occt-wasm ' + ver + ': copied ' + all.length + ' file(s) to app/occt/  (' + js + ', ' + wasm + ')');
