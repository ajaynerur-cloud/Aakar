#!/usr/bin/env node
/* Concatenates kernel/src/*.js (numbered parts) into kernel/dist/aakar-kernel.js.   usage: node kernel/build.js */
'use strict';
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src'), out = path.join(__dirname, 'dist');
const parts = fs.readdirSync(src).filter(f => /^\d\d_.*\.js$/.test(f)).sort();
const body = parts.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
if (/<\/script/i.test(body) || /<!--/.test(body)) throw new Error('kernel source must not contain "</script" or "<!--" (it is embedded in an HTML file)');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'aakar-kernel.js'), body);
fs.copyFileSync(path.join(src, 'wire.js'), path.join(out, 'aakar-kernel-wire.js'));
console.log('built dist/aakar-kernel.js (' + (body.length / 1024).toFixed(0) + ' kB from ' + parts.length + ' parts) and dist/aakar-kernel-wire.js');
