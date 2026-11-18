#!/usr/bin/env node
/* Refreshes the kernel scripts inside an Aakar html file from kernel/dist (built first).   node kernel/sync.js app/index.html
 * Replaces the bodies of <script id="aakar-kernel">, <script id="aakar-kernel-round"> (merged into the first) and <script id="aakar-kernel-wire">. */
'use strict';
const fs = require('fs'), path = require('path');
const file = process.argv[2]; if (!file) { console.error('usage: node kernel/sync.js <aakar.html>'); process.exit(1); }
require('./build.js');
const d = (f) => fs.readFileSync(path.join(__dirname, 'dist', f), 'utf8');
const src = path.join(__dirname, 'src'), rd = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const EXT = ['82_round.js', '84_nurbs.js', '86_hybrid.js', '88_meshops.js', '90_direct.js', '92_stepfree.js'], core = fs.readdirSync(src).filter(f => /^\d\d_.*\.js$/.test(f) && !EXT.includes(f)).sort().map(rd).join('\n');
let html = fs.readFileSync(file, 'utf8');
const swap = (id, body) => { let a = html.indexOf('<script id="' + id + '">'); if (a < 0 && id === 'aakar-kernel-stepfree') { const m = html.indexOf('<script id="aakar-kernel-direct">'), me = html.indexOf('</script>', m) + 9; html = html.slice(0, me) + '\n<script id="aakar-kernel-stepfree">\n</script>' + html.slice(me); a = html.indexOf('<script id="' + id + '">'); }
  if (a < 0 && id === 'aakar-kernel-direct') { const m = html.indexOf('<script id="aakar-kernel-meshops">'), me = html.indexOf('</script>', m) + 9; html = html.slice(0, me) + '\n<script id="aakar-kernel-direct">\n</script>' + html.slice(me); a = html.indexOf('<script id="' + id + '">'); } if (a < 0) throw new Error('script #' + id + ' not found in ' + file); const s = html.indexOf('>', a) + 1, e = html.indexOf('</script>', s); html = html.slice(0, s) + '\n' + body + '\n' + html.slice(e); };
swap('aakar-kernel', core); swap('aakar-kernel-round', rd('82_round.js')); swap('aakar-kernel-nurbs', rd('84_nurbs.js')); swap('aakar-kernel-hybrid', rd('86_hybrid.js')); swap('aakar-kernel-meshops', rd('88_meshops.js')); swap('aakar-kernel-direct', rd('90_direct.js')); swap('aakar-kernel-stepfree', rd('92_stepfree.js')); swap('aakar-kernel-wire', d('aakar-kernel-wire.js'));
fs.writeFileSync(file, html); console.log('kernel refreshed in ' + file);
