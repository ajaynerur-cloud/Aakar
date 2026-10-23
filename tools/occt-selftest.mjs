// Conformance self-test of the exact-kernel binding, in Node. Exit code 1 when anything fails (the GitHub workflow then leaves the kernel out).
//   node tools/occt-selftest.mjs [path-to-binding.mjs]
import { conformance } from './occt-conformance.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'occt/binding-occt-wasm.mjs');
let kernel;
try { const b = await import(pathToFileURL(file).href); kernel = await b.init({}); }
catch (e) { console.error('The exact kernel could not be started: ' + (e && e.message || e)); process.exit(1); }
const results = conformance(kernel, 1e-4); let failed = 0;
for (const r of results) { console.log((r.ok ? '  ok    ' : '  FAIL  ') + r.name + (r.detail ? '   (' + r.detail + ')' : '')); if (!r.ok) failed++; }
if (failed) { console.error('\n' + failed + ' of ' + results.length + ' checks failed - the kernel will NOT be packaged'); process.exit(1); }
console.log('\nall ' + results.length + ' checks passed - the kernel can be packaged');
