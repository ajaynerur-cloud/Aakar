// Aakar CI smoke test  ->  `npm test`
// Finds the app page (app/index.html, index.html or app/Aakar*.html) and checks that
//   * every inline <script> parses (a syntax error would be a blank app),
//   * the embedded tutorial JSON is valid,
//   * the page carries a version, which is compared with package.json (warning only).
// Exit code 1 only for a real defect (syntax error / bad JSON). If no page is found it warns and exits 0,
// so a different repo layout can never block the EXE build by itself.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = __dirname;
const candidates = [
  'app/index.html', 'index.html',
  ...['app', '.'].flatMap((d) => { try { return fs.readdirSync(path.join(root, d)).filter((f) => /^Aakar.*\.html$/i.test(f)).sort().reverse().map((f) => path.join(d, f)); } catch (e) { return []; } })
];
const rel = candidates.find((f) => fs.existsSync(path.join(root, f)));
if (!rel) { console.log('WARNING: no app page found (looked for ' + candidates.slice(0, 2).join(', ') + ', Aakar*.html). Nothing to test.'); process.exit(0); }
const html = fs.readFileSync(path.join(root, rel), 'utf8');
console.log('Testing ' + rel + ' (' + (html.length / 1048576).toFixed(2) + ' MB)');
let n = 0, json = 0; const errors = [];
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g; let m;
while ((m = re.exec(html))) {
  const attrs = m[1], body = m[2]; if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
  const id = (/id="([^"]+)"/.exec(attrs) || [])[1] || ('#' + (n + json + 1));
  if (/type\s*=\s*["']application\/json/i.test(attrs)) { json++; try { JSON.parse(body); } catch (e) { errors.push('JSON block "' + id + '": ' + e.message); } continue; }
  if (/type\s*=/.test(attrs) && !/javascript|module/i.test(attrs)) continue;
  n++;
  try { new vm.Script(body, { filename: id }); } catch (e) { errors.push('script "' + id + '": ' + e.message); }
}
console.log('  ' + n + ' inline scripts parsed, ' + json + ' JSON block(s) checked');
const t = /<title>\s*Aakar\s+([\d.]+)/i.exec(html), pkg = require('./package.json').version;
if (!t) console.log('  WARNING: no "Aakar x.y.z" version in <title>');
else if (t[1] !== pkg) console.log('  WARNING: page says ' + t[1] + ' but package.json says ' + pkg + ' (installer names use package.json)');
else console.log('  version ' + pkg + ' matches package.json');
if (errors.length) { console.error('FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('OK');
