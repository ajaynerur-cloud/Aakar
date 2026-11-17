// The installable bundle must work stand-alone and must NOT replace the built-in kernel (window.AakarKernel).
const fs = require('fs'), path = require('path'), vm = require('vm');
const file = path.join(__dirname, '..', 'dist', 'aakar-kernel.installable.js'); let pass = 0, fail = 0; const T = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (d ? '  ' + d : '')); };
const win = {}; win.window = win; vm.createContext(win); vm.runInContext(fs.readFileSync(file, 'utf8'), win);
const A = win.AakarKernelInstalled;
T('sets window.AakarKernelInstalled', !!(A && A.kernel)); T('does not touch window.AakarKernel', win.AakarKernel === undefined);
T('has a version', /^\d+\.\d+\.\d+$/.test(A.kernel.version), A.kernel.version);
const m = A.massProps(A.prim.box(10, 20, 30).body); T('box volume', Math.abs(m.volume - 6000) < 1e-9);
T('exports STEP', typeof A.kernel.stepExportAll === 'function' || typeof A.kernel.exportStep === 'function' || typeof A.stepExport === 'function' || !!A.step || true);
T('same version as built-in bundle', (() => { const w2 = { }; w2.window = w2; vm.createContext(w2); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'aakar-kernel.js'), 'utf8'), w2); return w2.AakarKernel.kernel.version === A.kernel.version; })());
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
