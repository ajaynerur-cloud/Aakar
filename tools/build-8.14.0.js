#!/usr/bin/env node
/* Builds Aakar 8.14.0 from an existing Aakar single-file HTML (8.12 or later) by
 *   1. syncing the version text (<title>, brand label) to 8.14.0
 *   2. injecting addons/aakar-8.14-addon.js as one inline <script> before </body>
 * Re-running on an already patched file replaces the old add-on block (idempotent). No dependencies.
 *
 *   node tools/build-8.14.0.js Aakar_8.12.html              ->  Aakar_8.14.0.html
 *   node tools/build-8.14.0.js Aakar_8.12.html out.html     ->  out.html
 *   node tools/build-8.14.0.js Aakar_8.12.html --index      ->  Aakar_8.14.0.html and index.html
 */
const fs = require('fs'), path = require('path');
const VERSION = '8.14.0';
const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), pos = args.filter(a => !a.startsWith('--'));
if (!pos.length) { console.error('usage: node tools/build-8.14.0.js <Aakar.html> [output.html] [--index]'); process.exit(2); }
const inFile = pos[0], outFile = pos[1] || path.join(path.dirname(inFile), 'Aakar_' + VERSION + '.html');
const addonFile = path.join(__dirname, '..', 'addons', 'aakar-8.14-addon.js');
let html = fs.readFileSync(inFile, 'utf8'), addon = fs.readFileSync(addonFile, 'utf8');
if (!/<html[\s>]/i.test(html) || !/PRISM/.test(html)) { console.error('This does not look like an Aakar HTML build (no <html> / PRISM found): ' + inFile); process.exit(1); }
const START = '<!--AAKAR-X814-START-->', END = '<!--AAKAR-X814-END-->';
const had = html.includes(START);
html = html.replace(new RegExp('\\n?' + START + '[\\s\\S]*?' + END + '\\n?', 'g'), '');
let nTitle = 0, nBrand = 0;
html = html.replace(/(<title>\s*Aakar )\d+(?:\.\d+)*/i, (m, a) => { nTitle++; return a + VERSION; });
html = html.replace(/(Aakar <b>)\d+(?:\.\d+)*(<\/b>)/g, (m, a, b) => { nBrand++; return a + VERSION + b; });
if (/<\/script/i.test(addon)) addon = addon.replace(/<\/script/gi, '<\\/script');
const block = '\n' + START + '\n<script id="aakar-814-addon">\n' + addon + '\n</script>\n' + END + '\n';
const i = html.toLowerCase().lastIndexOf('</body>');
html = i >= 0 ? html.slice(0, i) + block + html.slice(i) : html + block;
fs.writeFileSync(outFile, html);
console.log((had ? 'Replaced the existing 8.14 add-on block. ' : '') + 'Wrote ' + outFile + ' (' + (html.length / 1048576).toFixed(2) + ' MB) — title updated: ' + nTitle + ', brand labels updated: ' + nBrand);
if (flags.includes('--index')) { const ix = path.join(path.dirname(outFile), 'index.html'); fs.writeFileSync(ix, html); console.log('Wrote ' + ix); }
