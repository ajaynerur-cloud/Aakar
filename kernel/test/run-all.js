#!/usr/bin/env node
/* Runs the AakarKernel test suite.   node kernel/test/run-all.js [path-to-aakar.html]   (set AAKAR_HTML or pass the path for the integration tests) */
'use strict';
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const html = process.argv[2] || process.env.AAKAR_HTML;
spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js')], { stdio: 'inherit' });
const suites = ['01_primitives.js', '02_booleans.js', '03_kernel_step.js', '06_sphere_lenses.js', '04_app_integration.js', '05_wired_html.js', '07_occt_adapter.js'];
let bad = 0;
for (const f of suites) {
  if (/_(app_integration|wired_html|occt_adapter)/.test(f) && !(html || fs.existsSync(path.join(__dirname, '..', '..', 'app', 'index.html')))) { console.log('-- skipped ' + f + ' (no Aakar html found)'); continue; }
  const r = spawnSync(process.execPath, [path.join(__dirname, f)].concat(html ? [html] : []), { encoding: 'utf8', timeout: 240000, env: Object.assign({}, process.env, html ? { AAKAR_HTML: html } : {}) });
  const out = (r.stdout || '') + (r.stderr || ''), last = out.trim().split('\n').slice(-1)[0];
  const fails = out.split('\n').filter(l => /^FAIL/.test(l));
  console.log((r.status === 0 && !fails.length ? 'PASS ' : 'FAIL ') + f + '  —  ' + last);
  if (r.status !== 0 || fails.length) { bad++; console.log(fails.join('\n') || out.slice(-800)); }
}
console.log(bad ? bad + ' suite(s) failed' : 'all suites passed');
process.exit(bad ? 1 : 0);
