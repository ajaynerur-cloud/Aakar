#!/usr/bin/env node
/* Embeds AakarKernel into an Aakar HTML file (8.10+ with the optional exact-kernel framework) and wires it in.
 *   node kernel/embed.js  <input.html>  <output.html>  [version]
 * Idempotent: a file that already contains the kernel is refreshed. */
'use strict';
const fs = require('fs'), path = require('path');
const [, , inp, outp, ver] = process.argv;
if (!inp || !outp) { console.error('usage: node kernel/embed.js <input.html> <output.html> [version, e.g. 8.11.0]'); process.exit(1); }
require('./build.js');
let html = fs.readFileSync(inp, 'utf8');
const kernel = fs.readFileSync(path.join(__dirname, 'dist', 'aakar-kernel.js'), 'utf8'), wire = fs.readFileSync(path.join(__dirname, 'dist', 'aakar-kernel-wire.js'), 'utf8');
const must = (s, what) => { const n = html.split(s).length - 1; if (n !== 1) throw new Error('patch anchor for "' + what + '" found ' + n + ' times (expected 1) — is this an Aakar 8.10+ file?'); };
const rep = (a, b, what) => { must(a, what); html = html.replace(a, () => b); };
// 1. drop an earlier embed
html = html.replace(/<script id="aakar-kernel">[\s\S]*?<\/script>\s*<script id="aakar-kernel-wire">[\s\S]*?<\/script>\s*/g, '');
// 2. insert after the exact-kernel script (it ends right before the CLEAN WORKSPACE comment)
const m = /<\/script>\s*\n(<!-- Aakar [0-9.]+ CLEAN WORKSPACE -->)/.exec(html); if (!m) throw new Error('could not find the end of the exact-kernel script');
html = html.replace(m[0], () => '</script>\n<script id="aakar-kernel">\n' + kernel + '\n</script>\n<script id="aakar-kernel-wire">\n' + wire + '\n</script>\n' + m[1]);
// 3. panel additions
rep("      h += '<div class=\"row\"><label><input type=\"checkbox\" data-k=\"bool\" '",
  "      if (X.builtin) h += '<div class=\"row\"><b>Engine</b><button class=\"btn sm' + (X.name === 'AakarKernel' ? ' primary' : '') + '\" data-a=\"eng-ak\" title=\"Built in, offline, no WebAssembly\">AakarKernel</button><button class=\"btn sm' + (X.name !== 'AakarKernel' ? ' primary' : '') + '\" data-a=\"eng-oc\" title=\"Needs the OpenCascade binding in the occt folder\">OpenCascade</button></div>';\n      h += '<div class=\"row\"><label><input type=\"checkbox\" data-k=\"bool\" '", 'engine row');
rep("<button class=\"btn sm\" data-a=\"test\">Run self-test</button></div>';",
  "<button class=\"btn sm\" data-a=\"test\">Run self-test</button>' + (X.kernel && X.kernel.massProps ? '<button class=\"btn sm\" data-a=\"props\" title=\"Volume, area, centroid, inertia and B-rep structure\">Exact properties</button>' : '') + '</div>';\n      if (X.lastProps) h += '<h5>Exact properties</h5><table><tr><th>Body</th><th>Volume</th><th>Area</th><th>Centroid</th><th>Faces</th><th>Edges</th><th>Valid</th></tr>' + X.lastProps.map((r) => '<tr><td>' + esc(r.name) + '</td><td class=\"n\">' + r.volume.toFixed(3) + '</td><td class=\"n\">' + r.area.toFixed(3) + '</td><td class=\"n\">' + r.centroid.map((x) => x.toFixed(2)).join(', ') + '</td><td>' + (r.info ? Object.keys(r.info.faces).map((k) => r.info.faces[k] + ' ' + k).join(', ') : '') + '</td><td>' + (r.info ? Object.keys(r.info.edges).map((k) => r.info.edges[k] + ' ' + k).join(', ') : '') + '</td><td class=\"' + (r.valid ? 'ok' : 'bad') + '\">' + (r.valid ? '✓' : '✗') + '</td></tr><tr><td colspan=\"7\" class=\"note\">inertia about the centroid, unit density: Ixx ' + r.inertia[0][0].toFixed(1) + ' · Iyy ' + r.inertia[1][1].toFixed(1) + ' · Izz ' + r.inertia[2][2].toFixed(1) + ' · Ixy ' + r.inertia[0][1].toFixed(1) + ' · Iyz ' + r.inertia[1][2].toFixed(1) + ' · Izx ' + r.inertia[2][0].toFixed(1) + (r.approximate ? ' · ' + r.approximate + ' face(s) integrated on facets' : '') + '</td></tr>').join('') + '</table>';", 'buttons');
rep("    if (A('test')) A('test').onclick",
  "    if (A('props')) A('props').onclick = () => { try { X.lastProps = X.properties(); } catch (e) { toast(e.message, true); } renderPanel(); };\n    if (A('eng-ak')) A('eng-ak').onclick = () => { X.useAakarKernel(); renderPanel(); try { F.invalidate(st.doc, 0); P.regenerate(); } catch (e) { /* ignore */ } };\n    if (A('eng-oc')) A('eng-oc').onclick = () => { X.useOpenCascade().then((ok) => { toast(ok ? 'OpenCascade is active' : 'OpenCascade is not installed — AakarKernel stays active', !ok); renderPanel(); }); };\n    if (A('test')) A('test').onclick", 'handlers');
rep("if (bt) bt.onchange = () => { X.useExactBooleans = bt.checked;", "if (bt) bt.onchange = () => { X.useExactBooleans = bt.checked; if (X.chip) X.chip();", 'checkbox handler');
rep("'Optional exact (OpenCascade) kernel: exact STEP export, exact volumes and booleans', '<path d=\"M12 3l8 4v10l-8 4-8-4V7z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/>']]",
  "'Exact B-rep kernel (AakarKernel built in; OpenCascade optional): exact STEP export, exact volumes and booleans', '<path d=\"M12 3l8 4v10l-8 4-8-4V7z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/>'], ['exactp', 'Exact properties', () => { if (X.showProps) X.showProps(); else X.openPanel(); }, 'Volume, area, centroid, inertia tensor and B-rep structure of every exact body', '<path d=\"M4 20h16M7 16v-6m5 6V5m5 11v-8\"/>']]", 'ribbon');
// 3b. torus joins the exact primitives (box / cylinder / sphere / cone are already there)
rep("['box', 'cylinder', 'sphere', 'cone'].forEach((name) => {", "['box', 'cylinder', 'sphere', 'cone', 'torus'].forEach((name) => {", 'primitive list');
rep("else tag(s, { op: 'cone', r: a[0], h: a[1], rt: a[4] || 0, o: o(3) });", "else if (name === 'torus') tag(s, { op: 'torus', R: a[0], r: a[1], o: o(4) }); else tag(s, { op: 'cone', r: a[0], h: a[1], rt: a[4] || 0, o: o(3) });", 'torus recipe');
rep("    else if (r.op === 'subtract' || r.op === 'cut') h = k.cut(", "    else if (r.op === 'torus') { if (!k.torus) throw new Error('this kernel has no torus'); h = k.translate(k.torus(r.R, r.r), [o[0], o[1], o[2] + r.r]); }   // Aakar tori sit on the origin height like spheres\n    else if (r.op === 'subtract' || r.op === 'cut') h = k.cut(", 'torus replay');
// 4. version
if (ver) { html = html.replace(/Aakar 8\.10\.0/g, 'Aakar ' + ver).replace(/Aakar <b>8\.10\.0<\/b>/g, 'Aakar <b>' + ver + '</b>'); }
fs.writeFileSync(outp, html);
console.log('wrote ' + outp + ' (' + (html.length / 1048576).toFixed(2) + ' MB)');
