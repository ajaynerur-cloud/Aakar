#!/usr/bin/env node
/* Refreshes the kernel scripts inside an Aakar html file from kernel/dist (built first).   node kernel/sync.js app/index.html
 * Replaces the bodies of <script id="aakar-kernel">, <script id="aakar-kernel-round"> (merged into the first) and <script id="aakar-kernel-wire">. */
'use strict';
const fs = require('fs'), path = require('path');
const file = process.argv[2]; if (!file) { console.error('usage: node kernel/sync.js <aakar.html>'); process.exit(1); }
require('./build.js');
const d = (f) => fs.readFileSync(path.join(__dirname, 'dist', f), 'utf8');
const src = path.join(__dirname, 'src'), rd = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const core = fs.readdirSync(src).filter(f => /^\d\d_.*\.js$/.test(f) && f !== '82_round.js').sort().map(rd).join('\n');
let html = fs.readFileSync(file, 'utf8');
const swap = (id, body) => { const a = html.indexOf('<script id="' + id + '">'); if (a < 0) throw new Error('script #' + id + ' not found in ' + file); const s = html.indexOf('>', a) + 1, e = html.indexOf('</script>', s); html = html.slice(0, s) + '\n' + body + '\n' + html.slice(e); };
swap('aakar-kernel', core); swap('aakar-kernel-round', rd('82_round.js')); swap('aakar-kernel-wire', d('aakar-kernel-wire.js'));
fs.writeFileSync(file, html); console.log('kernel refreshed in ' + file);
