#!/usr/bin/env node
/* Builds the AakarKernel bundles from kernel/src.   usage: node kernel/build.js
 *   dist/aakar-kernel.js              built-in form (core + round extension), embedded into the single HTML file
 *   dist/aakar-kernel-wire.js         wiring into CAD.exact
 *   dist/aakar-kernel.installable.js  drop-in form: sets window.AakarKernelInstalled and never touches window.AakarKernel;
 *                                     the exe build ships it as app/kernel/aakar-kernel.installable.js and the app loads it at start-up */
'use strict';
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src'), out = path.join(__dirname, 'dist');
const rd = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const EXT = ['82_round.js', '84_nurbs.js', '86_hybrid.js', '88_meshops.js', '90_direct.js', '92_stepfree.js'];   // extensions: wrapped (function (AK) {...})(window.AakarKernel), loaded after the core
const parts = fs.readdirSync(src).filter(f => /^\d\d_.*\.js$/.test(f) && !EXT.includes(f)).sort();
const core = parts.map(rd).join('\n'), round = EXT.map(rd).join('\n');
for (const [n, t] of [['core', core], ['round', round]]) if (/<\/script/i.test(t) || /<!--/.test(t)) throw new Error(n + ' must not contain "</script" or "<!--" (embedded in HTML)');
const END = "})(typeof window !== 'undefined' ? window : globalThis);";
if (!core.trimEnd().endsWith(END)) throw new Error('99_end.js no longer ends with the expected global wrapper');
const version = (/K\.version = AK\.version = '([0-9.]+)'/.exec(round) || [])[1] || '0.0.0';
fs.mkdirSync(out, { recursive: true });
// the html embeds the round extension with `window`; node (tests, tools) has no window, so the dist file uses the same global lookup as the core
const roundG = round.split('})(window.AakarKernel);').join("})((typeof window !== 'undefined' ? window : globalThis).AakarKernel);");
if (roundG === round) throw new Error('extension wrapper not found');
fs.writeFileSync(path.join(out, 'aakar-kernel.js'), core + '\n' + roundG);
fs.copyFileSync(path.join(src, 'wire.js'), path.join(out, 'aakar-kernel-wire.js'));
const coreT = core.trimEnd().slice(0, -END.length) + '})(T);';
const roundT = round.split('})(window.AakarKernel);').join('})(T.AakarKernel);');
if (roundT === round) throw new Error('extension wrapper not found');
const inst = "(function(){\n'use strict';\nvar g=typeof window!=='undefined'?window:globalThis,T=Object.create(g);\n" + coreT + '\n' + roundT +
  "\ng.AakarKernelInstalled=T.AakarKernel;\nif(typeof module!=='undefined'&&module.exports)module.exports=T.AakarKernel;\n})();\n";
fs.writeFileSync(path.join(out, 'aakar-kernel.installable.js'), inst);
console.log('AakarKernel ' + version + ': dist/aakar-kernel.js (' + ((core.length + round.length) / 1024).toFixed(0) + ' kB), aakar-kernel-wire.js, aakar-kernel.installable.js (' + (inst.length / 1024).toFixed(0) + ' kB)');
