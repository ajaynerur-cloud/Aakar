#!/usr/bin/env node
// AakarKernel command line (also packed into AakarKernel.exe by .github/workflows/build-kernel-exe.yml).
//   AakarKernel --selftest      builds a few solids, checks exact volumes, prints OK / FAIL
//   AakarKernel --version
//   AakarKernel --step out.step  writes a demo plate with a hole as STEP
'use strict';
const path = require('path'), fs = require('fs');
require('./dist/aakar-kernel.js');   // literal path so pkg bundles it
const K = globalThis.AakarKernel.kernel, a = process.argv.slice(2);
const near = (x, y) => Math.abs(x - y) / Math.abs(y) < 1e-9;
if (a.includes('--version')) { console.log('AakarKernel ' + K.version); process.exit(0); }
if (a[0] === '--step') { const b = K.cut(K.box(60, 40, 10), K.translate(K.cylinder(6, 20), [30, 20, -5])); fs.writeFileSync(a[1] || 'plate.step', K.stepExport(b)); console.log('wrote ' + (a[1] || 'plate.step')); process.exit(0); }
const t = [['box volume', () => near(K.volume(K.box(40, 30, 20)), 24000)],
  ['box minus cylinder', () => near(K.volume(K.cut(K.box(40, 30, 20), K.translate(K.cylinder(5, 40), [20, 15, -5]))), 24000 - Math.PI * 25 * 20)],
  ['union', () => near(K.volume(K.fuse(K.box(10, 10, 10), K.translate(K.box(10, 10, 10), [5, 0, 0]))), 1500)],
  ['STEP export', () => /ADVANCED_FACE/.test(K.stepExport(K.box(5, 5, 5)))]];
let bad = 0; t.forEach(([n, f]) => { let ok = false; try { ok = f(); } catch (e) { /* fail */ } if (!ok) bad++; console.log((ok ? 'OK   ' : 'FAIL ') + n); });
console.log(bad ? bad + ' failed' : 'AakarKernel ' + K.version + ': all checks passed'); process.exit(bad ? 1 : 0);
