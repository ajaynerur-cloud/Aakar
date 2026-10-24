/* Aakar 8.14.0 add-on
 *  1. Design tables & configurations  (columns linked to parameters, derived columns, rules, size series,
 *     CSV / TSV import + paste, compare all sizes, assembly tables with per-component configuration, configuration BOM)
 *  2. Export: binary glTF (.glb) and 3MF from the solids in the model
 *  3. GD&T symbol generator (feature control frames, datum symbols, surface finish) -> SVG
 *
 * Works only through public hooks: window.CAD, window.PRISM, CAD.x10.ui.api (global parameters).
 * The pure logic is exposed as CAD.x814.core so it can be tested without a browser.
 */
(function (G) {
  'use strict';
  const VERSION = '8.14.0';
  const CAD = G.CAD = G.CAD || {};
  const core = {};

  // ====================================================================================================
  //  A. expression evaluator (no eval) — numbers, + - * / % ^, comparisons, && || !, functions, constants
  // ====================================================================================================
  const FN = {
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil,
    pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp,
    round: (x, n) => { n = n || 0; const k = Math.pow(10, n); return Math.round(x * k) / k; },
    sin: (a) => Math.sin(a * Math.PI / 180), cos: (a) => Math.cos(a * Math.PI / 180), tan: (a) => Math.tan(a * Math.PI / 180),
    asin: (x) => Math.asin(x) * 180 / Math.PI, acos: (x) => Math.acos(x) * 180 / Math.PI, atan: (x) => Math.atan(x) * 180 / Math.PI,
    atan2: (y, x) => Math.atan2(y, x) * 180 / Math.PI,
    if: (c, a, b) => (c ? a : b)
  };
  const CONST = { pi: Math.PI, PI: Math.PI, e: Math.E };

  function tokenize(src) {
    const t = [], re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*\/%^(),<>!]))/y;
    let i = 0;
    src = String(src);
    while (i < src.length) {
      if (/^\s*$/.test(src.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) throw new Error('Unexpected character "' + src.slice(i).trim()[0] + '" in "' + src + '"');
      if (m[1] !== undefined) t.push({ k: 'n', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) t.push({ k: 'id', v: m[2] });
      else t.push({ k: 'op', v: m[3] });
      i = re.lastIndex;
    }
    return t;
  }

  function evaluate(expr, scope) {
    const toks = tokenize(expr);
    let p = 0;
    const peek = () => toks[p], isOp = (v) => toks[p] && toks[p].k === 'op' && toks[p].v === v;
    const take = () => toks[p++];
    function or() { let a = and(); while (isOp('||')) { take(); const b = and(); a = (a || b) ? 1 : 0; } return a; }
    function and() { let a = cmp(); while (isOp('&&')) { take(); const b = cmp(); a = (a && b) ? 1 : 0; } return a; }
    function cmp() {
      const a = add();
      const t = peek();
      if (t && t.k === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
        take(); const b = add();
        switch (t.v) {
          case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b + 1e-12 ? 1 : 0;
          case '>=': return a >= b - 1e-12 ? 1 : 0; case '==': return Math.abs(a - b) < 1e-9 ? 1 : 0; default: return Math.abs(a - b) >= 1e-9 ? 1 : 0;
        }
      }
      return a;
    }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const o = take().v, b = mul(); a = o === '+' ? a + b : a - b; } return a; }
    function mul() { let a = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const o = take().v, b = unary(); a = o === '*' ? a * b : o === '/' ? a / b : a % b; } return a; }
    function unary() { if (isOp('-')) { take(); return -unary(); } if (isOp('+')) { take(); return unary(); } if (isOp('!')) { take(); return unary() ? 0 : 1; } return pow(); }
    function pow() { const a = primary(); if (isOp('^')) { take(); return Math.pow(a, unary()); } return a; }
    function primary() {
      const t = take();
      if (!t) throw new Error('Incomplete expression "' + expr + '"');
      if (t.k === 'n') return t.v;
      if (t.k === 'op' && t.v === '(') { const v = or(); if (!isOp(')')) throw new Error('Missing ) in "' + expr + '"'); take(); return v; }
      if (t.k === 'id') {
        if (isOp('(')) {
          take(); const args = [];
          if (!isOp(')')) { args.push(or()); while (isOp(',')) { take(); args.push(or()); } }
          if (!isOp(')')) throw new Error('Missing ) in "' + expr + '"'); take();
          const f = FN[t.v]; if (!f) throw new Error('Unknown function ' + t.v + '()');
          return f.apply(null, args);
        }
        if (scope && Object.prototype.hasOwnProperty.call(scope, t.v)) { const v = scope[t.v]; if (typeof v !== 'number' || !isFinite(v)) throw new Error('"' + t.v + '" has no numeric value'); return v; }
        if (Object.prototype.hasOwnProperty.call(CONST, t.v)) return CONST[t.v];
        throw new Error('Unknown name "' + t.v + '"');
      }
      throw new Error('Unexpected "' + t.v + '" in "' + expr + '"');
    }
    const v = or();
    if (p < toks.length) throw new Error('Unexpected "' + toks[p].v + '" in "' + expr + '"');
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('"' + expr + '" is not a finite number');
    return v;
  }
  core.evaluate = evaluate;

  // ====================================================================================================
  //  B. CSV / TSV
  // ====================================================================================================
  function parseDelimited(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    let inQ = false; const cnt = { '\t': 0, ',': 0, ';': 0 };
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in cnt) cnt[ch]++; }
    const delim = cnt['\t'] ? '\t' : (cnt[';'] > cnt[','] ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell.trim()); if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  function toCSV(rows) { return rows.map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n') + '\r\n'; }
  core.parseDelimited = parseDelimited; core.toCSV = toCSV;

  // ====================================================================================================
  //  C. design table model
  //   col kinds: label (row name) · param (numeric, linked to a global parameter) · derived (formula)
  //              text (free text, e.g. Material or a component configuration) · qty (header ends with '#')
  // ====================================================================================================
  const keyOf = (s) => { let k = String(s).trim().replace(/[^A-Za-z0-9_]/g, '_'); if (/^\d/.test(k)) k = '_' + k; return k || '_'; };
  const isNum = (s) => s !== '' && s != null && isFinite(Number(String(s).replace(',', '.')));
  const num = (s) => Number(String(s).replace(',', '.'));
  core.keyOf = keyOf;

  function fromRows(name, rows) {
    if (!rows || rows.length < 2) throw new Error('The data needs a header row and at least one data row');
    const head = rows[0], body = rows.slice(1);
    const cols = head.map((h, ci) => {
      h = String(h).trim();
      if (!h) throw new Error('Column ' + (ci + 1) + ' has no header');
      if (h.includes('=')) { const i = h.indexOf('='); const nm = h.slice(0, i).trim(), ex = h.slice(i + 1).trim(); if (!nm || !ex) throw new Error('Derived column "' + h + '" must look like name = formula'); return { name: nm, key: keyOf(nm), kind: 'derived', expr: ex }; }
      if (h.endsWith('#')) return { name: h, key: keyOf(h.slice(0, -1)) + '__qty', kind: 'qty', of: h.slice(0, -1).trim() };
      return { name: h, key: keyOf(h), kind: 'text' };
    });
    const seen = new Set();
    cols.forEach(c => { if (seen.has(c.key)) throw new Error('Duplicate column "' + c.name + '"'); seen.add(c.key); });
    // first non-derived column is the row label unless every value is numeric and the header isn't a name-like word
    const lab = cols.findIndex(c => c.kind === 'text');
    cols.forEach((c, ci) => {
      if (c.kind !== 'text') return;
      const vals = body.map(r => r[ci] == null ? '' : r[ci]);
      const numeric = vals.every(v => v === '' || isNum(v)) && vals.some(v => v !== '');
      if (ci === lab && (!numeric || /^(config|name|size|id|label|variant|item)/i.test(c.name))) c.kind = 'label';
      else c.kind = numeric ? 'param' : 'text';
    });
    if (!cols.some(c => c.kind === 'label')) cols.unshift({ name: 'Config', key: 'Config', kind: 'label', auto: true });
    const cells = body.map((r, ri) => { const o = {}; head.forEach((h, ci) => { const c = cols.find(x => x.name === String(h).trim()); if (c) o[c.key] = r[ci] == null ? '' : r[ci]; }); if (!o.Config && cols[0].auto) o.Config = 'Row ' + (ri + 1); return o; });
    const labelCol = cols.find(c => c.kind === 'label');
    return { name: name || 'Table', prefix: '', assembly: false, cols, rows: cells.map(o => ({ label: o[labelCol.key] || '', cells: o })), rules: [] };
  }
  core.fromRows = fromRows;
  core.fromText = (name, text) => fromRows(name, parseDelimited(text));

  function evalRow(table, ri) {
    const row = table.rows[ri], vals = {}, errors = [], scope = {};
    table.cols.forEach(c => {
      if (c.kind === 'param') { const raw = row.cells[c.key]; if (raw === '' || raw == null) { vals[c.key] = NaN; } else { vals[c.key] = num(raw); scope[c.key] = vals[c.key]; } }
      else if (c.kind === 'text' || c.kind === 'label') vals[c.key] = row.cells[c.key] == null ? '' : row.cells[c.key];
      else if (c.kind === 'qty') vals[c.key] = isNum(row.cells[c.key]) ? num(row.cells[c.key]) : 1;
    });
    table.cols.forEach(c => {
      if (c.kind !== 'derived') return;
      try { vals[c.key] = evaluate(c.expr, scope); scope[c.key] = vals[c.key]; }
      catch (e) { vals[c.key] = NaN; errors.push(c.name + ': ' + e.message); }
    });
    const warnings = [];
    (table.rules || []).forEach(r => { try { if (!evaluate(r.expr, scope)) warnings.push(r.msg || ('Rule failed: ' + r.expr)); } catch (e) { warnings.push('Rule "' + r.expr + '": ' + e.message); } });
    return { vals, errors, warnings };
  }
  core.evalRow = evalRow;
  core.numericCols = (t) => t.cols.filter(c => c.kind === 'param' || c.kind === 'derived');
  core.paramValues = (t, ri) => { const r = evalRow(t, ri), out = {}; core.numericCols(t).forEach(c => { if (isFinite(r.vals[c.key])) out[(t.prefix || '') + c.key] = r.vals[c.key]; }); return { params: out, errors: r.errors, warnings: r.warnings }; };
  core.parseRules = (text) => String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => { const i = l.indexOf(';'); return i < 0 ? { expr: l, msg: '' } : { expr: l.slice(0, i).trim(), msg: l.slice(i + 1).trim() }; });
  core.rulesText = (t) => (t.rules || []).map(r => r.msg ? r.expr + ' ; ' + r.msg : r.expr).join('\n');

  // size series: new rows from a start / end / step on one parameter column (other cells copied from the template row)
  core.series = function (table, colKey, start, end, step, labelPattern, templateIdx, replace) {
    const col = table.cols.find(c => c.key === colKey && c.kind === 'param');
    if (!col) throw new Error('Pick a numeric (linked) column for the series');
    if (!(step > 0)) throw new Error('Step must be positive');
    if (end < start) throw new Error('End must not be less than start');
    const n = Math.floor((end - start) / step + 1e-9) + 1;
    if (n > 500) throw new Error('That series would create ' + n + ' rows (limit 500)');
    const tpl = table.rows[templateIdx || 0]; if (!tpl) throw new Error('The table has no template row');
    const labelCol = table.cols.find(c => c.kind === 'label'), out = [];
    for (let i = 0; i < n; i++) {
      const v = Math.round((start + i * step) * 1e9) / 1e9, cells = Object.assign({}, tpl.cells); cells[colKey] = String(v);
      const label = (labelPattern || '{v}').replace(/\{v\}/g, String(v)).replace(/\{n\}/g, String(i + 1)); cells[labelCol.key] = label;
      out.push({ label, cells });
    }
    if (replace) table.rows = out; else table.rows = table.rows.concat(out);
    return out.length;
  };

  // assembly tables: every text column (not label / qty) names a component; the cell is that component's configuration
  core.assemblyComponents = (t) => t.cols.filter(c => c.kind === 'text');
  core.bom = function (tables, asm) {
    const comps = core.assemblyComponents(asm), qtyOf = {};
    asm.cols.filter(c => c.kind === 'qty').forEach(c => { qtyOf[c.of.toLowerCase()] = c; });
    const perSize = [], total = new Map();
    asm.rows.forEach((row, ri) => {
      const r = evalRow(asm, ri), items = [];
      comps.forEach(c => {
        const cfg = row.cells[c.key]; if (!cfg) return;
        const q = qtyOf[c.name.toLowerCase()], qty = q ? r.vals[q.key] : 1;
        const tab = tables.find(t => t !== asm && t.name.toLowerCase() === c.name.toLowerCase());
        const known = tab ? tab.rows.some(x => x.label === cfg) : null;
        items.push({ component: c.name, config: cfg, qty, known });
        const k = c.name + '\u0000' + cfg; total.set(k, (total.get(k) || 0) + qty);
      });
      perSize.push({ size: row.label, items });
    });
    return { perSize, total: [...total.entries()].map(([k, qty]) => { const [component, config] = k.split('\u0000'); return { component, config, qty }; }) };
  };
  core.bomCSV = (b) => {
    const rows = [['Assembly size', 'Component', 'Configuration', 'Qty']];
    b.perSize.forEach(s => s.items.forEach(i => rows.push([s.size, i.component, i.config, i.qty])));
    rows.push([], ['ALL SIZES (combined)', 'Component', 'Configuration', 'Qty']);
    b.total.forEach(i => rows.push(['', i.component, i.config, i.qty]));
    return toCSV(rows);
  };
  core.tableCSV = (t) => toCSV([t.cols.map(c => c.kind === 'derived' ? c.name + ' = ' + c.expr : c.name)].concat(t.rows.map(r => t.cols.map(c => r.cells[c.key] == null ? '' : r.cells[c.key]))));

  // ====================================================================================================
  //  D. exporters : GLB (glTF 2.0 binary) and 3MF (zip, stored)
  // ====================================================================================================
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function trisOf(solid) {
    const tf = (CAD.solid && CAD.solid.triangulateFace);
    if (!tf) throw new Error('Aakar kernel not ready (CAD.solid.triangulateFace missing)');
    const out = []; solid.F.forEach((f, fi) => tf(solid, fi).forEach(t => out.push(t))); return out;
  }
  const colorOf = (b, meta) => {
    const c = (b && Array.isArray(b.color) && b.color) || (meta && meta.colors && b && Array.isArray(meta.colors[b.key]) && meta.colors[b.key]);
    return c && c.length >= 3 && c.every(x => typeof x === 'number') ? c.slice(0, 3).map(x => Math.max(0, Math.min(1, x))) : [0.62, 0.70, 0.80];
  };

  core.toGLB = function (bodies, opts) {
    opts = opts || {}; const S = opts.scale == null ? 0.001 : opts.scale, meta = opts.meta;
    const chunks = [], accessors = [], views = [], meshes = [], nodes = [], mats = [];
    let off = 0;
    bodies.forEach((b, bi) => {
      const s = b.solid || b, tris = trisOf(s); if (!tris.length) return;
      const pos = new Float32Array(tris.length * 9), nrm = new Float32Array(tris.length * 9);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      tris.forEach((t, ti) => {
        const P = t.map(i => s.V[i]); let n = crs(sub(P[1], P[0]), sub(P[2], P[0])); const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
        for (let k = 0; k < 3; k++) {
          const x = P[k][0] * S, y = P[k][1] * S, z = P[k][2] * S;            // Aakar: Z up (mm)  ->  glTF: Y up (m)
          const o = ti * 9 + k * 3; pos[o] = x; pos[o + 1] = z; pos[o + 2] = -y; nrm[o] = n[0]; nrm[o + 1] = n[2]; nrm[o + 2] = -n[1];
          for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[o + a]); mx[a] = Math.max(mx[a], pos[o + a]); }
        }
      });
      const vp = views.length; views.push({ buffer: 0, byteOffset: off, byteLength: pos.byteLength, target: 34962 }); chunks.push(new Uint8Array(pos.buffer)); off += pos.byteLength;
      const vn = views.length; views.push({ buffer: 0, byteOffset: off, byteLength: nrm.byteLength, target: 34962 }); chunks.push(new Uint8Array(nrm.buffer)); off += nrm.byteLength;
      const ap = accessors.length; accessors.push({ bufferView: vp, componentType: 5126, count: tris.length * 3, type: 'VEC3', min: mn, max: mx });
      const an = accessors.length; accessors.push({ bufferView: vn, componentType: 5126, count: tris.length * 3, type: 'VEC3' });
      const name = (meta && meta.names && meta.names[b.key]) || b.name || ('Body ' + (bi + 1)), col = colorOf(b, meta), mi = mats.length;
      mats.push({ name: name + ' material', pbrMetallicRoughness: { baseColorFactor: [col[0], col[1], col[2], 1], metallicFactor: 0.1, roughnessFactor: 0.6 } });
      meshes.push({ name, primitives: [{ attributes: { POSITION: ap, NORMAL: an }, material: mi, mode: 4 }] });
      nodes.push({ name, mesh: meshes.length - 1 });
    });
    if (!meshes.length) throw new Error('There are no solids to export');
    const json = { asset: { version: '2.0', generator: 'Aakar ' + VERSION }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials: mats, accessors, bufferViews: views, buffers: [{ byteLength: off }] };
    let js = new TextEncoder().encode(JSON.stringify(json)); const jPad = (4 - js.length % 4) % 4;
    if (jPad) { const t = new Uint8Array(js.length + jPad); t.set(js); t.fill(0x20, js.length); js = t; }
    const bPad = (4 - off % 4) % 4, binLen = off + bPad, total = 12 + 8 + js.length + 8 + binLen;
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
    let p = 20 + js.length; dv.setUint32(p, binLen, true); dv.setUint32(p + 4, 0x004E4942, true); p += 8;
    chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  };

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  core.crc32 = crc32;
  core.zipStore = function (files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new Uint8Array(30 + name.length), d = new DataView(lh.buffer);
      d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true); d.setUint16(6, 0x0800, true); d.setUint16(8, 0, true); d.setUint16(10, 0, true); d.setUint16(12, 0x21, true);
      d.setUint32(14, crc, true); d.setUint32(18, data.length, true); d.setUint32(22, data.length, true); d.setUint16(26, name.length, true); d.setUint16(28, 0, true); lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length), c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true); ch.set(name, 46);
      parts.push(lh, data); central.push(ch); off += lh.length + data.length;
    });
    const cdSize = central.reduce((a, c) => a + c.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((a, c) => a + c.length, 0)); let p = 0; all.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  };
  const xe = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = (c) => '#' + c.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  core.to3MF = function (bodies, opts) {
    opts = opts || {}; const meta = opts.meta, objs = [], base = [];
    bodies.forEach((b, bi) => {
      const s = b.solid || b, tris = trisOf(s); if (!tris.length) return;
      const remap = new Map(), V = [];
      const T = tris.map(t => t.map(i => { if (!remap.has(i)) { remap.set(i, V.length); V.push(s.V[i]); } return remap.get(i); }));
      objs.push({ name: (meta && meta.names && meta.names[b.key]) || b.name || ('Body ' + (bi + 1)), V, T, mi: base.length }); base.push(colorOf(b, meta));
    });
    if (!objs.length) throw new Error('There are no solids to export');
    let m = '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<metadata name="Application">Aakar ' + VERSION + '</metadata>\n<resources>\n';
    m += '<basematerials id="1">' + base.map((c, i) => '<base name="Material ' + (i + 1) + '" displaycolor="' + hex(c) + 'FF"/>').join('') + '</basematerials>\n';
    objs.forEach((o, i) => {
      m += '<object id="' + (i + 2) + '" type="model" name="' + xe(o.name) + '" pid="1" pindex="' + o.mi + '"><mesh><vertices>';
      o.V.forEach(v => { m += '<vertex x="' + (+v[0].toFixed(6)) + '" y="' + (+v[1].toFixed(6)) + '" z="' + (+v[2].toFixed(6)) + '"/>'; });
      m += '</vertices><triangles>'; o.T.forEach(t => { m += '<triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>'; }); m += '</triangles></mesh></object>\n';
    });
    m += '</resources>\n<build>' + objs.map((_, i) => '<item objectid="' + (i + 2) + '"/>').join('') + '</build>\n</model>\n';
    return core.zipStore([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
      { name: '3D/3dmodel.model', data: m }
    ]);
  };

  // ====================================================================================================
  //  E. GD&T symbols -> SVG
  // ====================================================================================================
  core.GDT = [
    ['position', '\u2316', 'Position'], ['flatness', '\u23E5', 'Flatness'], ['straightness', '\u23E4', 'Straightness'], ['circularity', '\u25CB', 'Circularity'],
    ['cylindricity', '\u232D', 'Cylindricity'], ['profile-line', '\u2312', 'Profile of a line'], ['profile-surface', '\u2313', 'Profile of a surface'],
    ['perpendicularity', '\u27C2', 'Perpendicularity'], ['parallelism', '\u2225', 'Parallelism'], ['angularity', '\u2220', 'Angularity'], ['symmetry', '\u232F', 'Symmetry'],
    ['concentricity', '\u25CE', 'Concentricity'], ['runout', '\u2197', 'Circular runout'], ['total-runout', '\u2330', 'Total runout']
  ];
  const FONT = '"Segoe UI Symbol","Segoe UI","DejaVu Sans","Arial Unicode MS",Arial,sans-serif';
  const MOD = { M: '\u24C2', L: '\u24C1', P: '\u24C5', S: '', none: '' };
  core.fcfSVG = function (o) {
    const H = 28, sym = (core.GDT.find(g => g[0] === o.char) || core.GDT[0])[1];
    const tol = (o.diameter ? '\u2300' : '') + String(o.tol || '0.1') + (MOD[o.mod] ? ' ' + MOD[o.mod] : '');
    const datums = (o.datums || []).filter(d => d && d.id).map(d => d.id + (MOD[d.mod] ? ' ' + MOD[d.mod] : ''));
    const widths = [H, Math.max(46, tol.length * 11 + 14)].concat(datums.map(d => Math.max(H, d.length * 12 + 12)));
    const total = widths.reduce((a, b) => a + b, 0), cells = [sym, tol].concat(datums);
    let x = 0, s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (total + 4) + '" height="' + (H + 4) + '" viewBox="-2 -2 ' + (total + 4) + ' ' + (H + 4) + '"><g font-family=\'' + FONT + '\' fill="none" stroke="#000" stroke-width="1.4">';
    s += '<rect x="0" y="0" width="' + total + '" height="' + H + '"/>';
    cells.forEach((c, i) => { if (i > 0) s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>'; s += '<text x="' + (x + widths[i] / 2) + '" y="' + (H / 2 + 6) + '" text-anchor="middle" font-size="' + (i === 0 ? 20 : 16) + '" fill="#000" stroke="none">' + xe(c) + '</text>'; x += widths[i]; });
    return s + '</g></svg>';
  };
  core.datumSVG = function (id) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="64" viewBox="-2 -2 44 64"><g font-family=\'' + FONT + '\' stroke="#000" stroke-width="1.4" fill="none"><rect x="6" y="0" width="28" height="28"/><line x1="20" y1="28" x2="20" y2="42"/><polygon points="12,56 28,56 20,42" fill="#000"/><text x="20" y="21" text-anchor="middle" font-size="17" fill="#000" stroke="none">' + xe(id || 'A') + '</text></g></svg>';
  };
  core.finishSVG = function (o) {
    const t = (v, x, y) => v ? '<text x="' + x + '" y="' + y + '" font-size="13" fill="#000" stroke="none">' + xe(v) + '</text>' : '';
    const req = o.removal === 'required' ? '<line x1="0" y1="26" x2="23.6" y2="26"/>' : '';
    const pro = o.removal === 'prohibited' ? '<circle cx="14" cy="30" r="8"/>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="60" viewBox="-2 -6 130 60"><g font-family=\'' + FONT + '\' stroke="#000" stroke-width="1.4" fill="none"><polyline points="0,26 14,46 36,0 112,0"/>' + req + pro + t(o.ra ? 'Ra ' + o.ra : '', 42, -4) + t(o.process || '', 42, 18) + '</g></svg>';
  };
  core.version = VERSION;
  CAD.x814 = { core, version: VERSION };

  // ====================================================================================================
  //  F. UI (browser only)
  // ====================================================================================================
  if (typeof document === 'undefined') return;
  let P = null;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = xe;
  const toast = (m, bad) => { try { P.toast(m, !!bad); } catch (e) { /* ignore */ } };
  const status = (m) => { try { P.status(m); } catch (e) { /* ignore */ } };
  const api = () => CAD.x10 && CAD.x10.ui && CAD.x10.ui.api;
  const saveBlob = (name, data, mime) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const modelName = () => { try { const w = CAD.v8 && CAD.v8.windows && CAD.v8.windows.W && CAD.v8.windows.W.active; return (w && w.name || 'Aakar').replace(/[^\w.-]+/g, '_'); } catch (e) { return 'Aakar'; } };
  const solids = () => { const st = P.st, vis = (st.doc && st.doc.meta && st.doc.meta.vis) || {}; return (st.bodies || []).filter(b => (b.solid || b).F && vis[b.key] !== false); };

  const css = document.createElement('style');
  css.textContent = '#x814{position:fixed;top:96px;right:290px;width:min(880px,calc(100vw - 40px));max-height:calc(100vh - 130px);overflow:auto;z-index:80;background:var(--panel,#1a202c);color:var(--txt,#dfe6f2);border:1px solid var(--line,#2c3547);border-radius:12px;padding:14px 16px;box-shadow:0 20px 50px #000a;font-size:12.5px}' +
    '#x814 h3{margin:0 0 8px;font-size:15px;display:flex;align-items:center;gap:8px}#x814 h3 .sp{flex:1}#x814 h4{margin:12px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut,#8a97ad)}' +
    '#x814 .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:5px 0}#x814 input,#x814 select,#x814 textarea{background:#11161f;border:1px solid var(--line,#2c3547);color:inherit;border-radius:5px;padding:4px 6px;font:inherit}' +
    '#x814 textarea{width:100%;min-height:70px;font-family:Consolas,monospace;font-size:12px}#x814 input[type=number],#x814 input.s{width:90px}#x814 input.m{width:150px}' +
    '#x814 button{background:#11161f;border:1px solid var(--line,#2c3547);border-radius:6px;padding:4px 10px;cursor:pointer;color:inherit}#x814 button:hover{border-color:var(--acc2,#3db8ff)}#x814 button.pri{background:var(--acc,#ff8a3d);border-color:var(--acc,#ff8a3d);color:#1a1208;font-weight:600}' +
    '#x814 table{border-collapse:collapse;width:100%;margin:6px 0}#x814 th,#x814 td{border:1px solid var(--line,#2c3547);padding:3px 7px;text-align:right}#x814 th{background:var(--panel2,#212938);color:var(--mut,#8a97ad);font-weight:500}#x814 td:first-child,#x814 th:first-child{text-align:left}' +
    '#x814 td.bad{color:#ff8a95}#x814 tr.act td{background:#2f2519}#x814 .k{font-size:10px;color:var(--acc2,#3db8ff);margin-left:4px}#x814 .warn{color:var(--warn,#ffc94d)}#x814 .err{color:#ff8a95}#x814 .ok{color:var(--ok,#42d392)}#x814 .mut{color:var(--mut,#8a97ad)}' +
    '#x814 .prev{background:#fff;border-radius:8px;padding:12px;display:inline-block;margin:6px 8px 6px 0;vertical-align:top}';
  document.head.appendChild(css);

  let panel = null;
  const openPanel = (title, build) => {
    if (panel) panel.remove();
    panel = document.createElement('div'); panel.id = 'x814';
    panel.innerHTML = '<h3>' + esc(title) + '<span class="sp"></span><button id="x814x" title="Close">\u2715</button></h3><div id="x814b"></div>';
    document.body.appendChild(panel); $('#x814x', panel).onclick = () => { panel.remove(); panel = null; };
    build($('#x814b', panel)); return panel;
  };

  // ---------------------------------------------------------------- design-table store
  const LS = 'aakar.x814.tables';
  const store = { tables: [], sel: 0, active: {}, density: 7.85 };
  const loadStore = () => { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); if (o && Array.isArray(o.tables)) { store.tables = o.tables; store.sel = Math.min(o.sel || 0, Math.max(0, o.tables.length - 1)); store.density = o.density || 7.85; } } catch (e) { /* ignore */ } };
  const saveStore = () => { try { localStorage.setItem(LS, JSON.stringify({ tables: store.tables, sel: store.sel, density: store.density })); } catch (e) { /* ignore */ } };
  const cur = () => store.tables[store.sel] || null;

  const applyParams = (params) => {
    const A = api(); if (!A) throw new Error('Global parameters are not available in this build (CAD.x10.ui.api missing)');
    Object.keys(params).forEach(k => A.param(k, String(+params[k].toFixed(6))));
  };
  function applyRow(ti, ri) {
    const t = store.tables[ti], r = core.paramValues(t, ri);
    if (r.errors.length) throw new Error(r.errors[0]);
    if (!Object.keys(r.params).length) throw new Error('This table has no numeric columns to apply');
    applyParams(r.params); store.active[t.name] = ri;
    return r;
  }
  function applyAssemblyRow(ti, ri) {
    const asm = store.tables[ti], row = asm.rows[ri], notes = [];
    core.assemblyComponents(asm).forEach(c => {
      const cfg = row.cells[c.key]; if (!cfg) return;
      const tj = store.tables.findIndex(t => t !== asm && t.name.toLowerCase() === c.name.toLowerCase());
      if (tj < 0) { notes.push('No table named "' + c.name + '"'); return; }
      const rj = store.tables[tj].rows.findIndex(x => x.label === cfg);
      if (rj < 0) { notes.push(c.name + ': no configuration "' + cfg + '"'); return; }
      applyRow(tj, rj);
    });
    store.active[asm.name] = ri; return notes;
  }
  const measure = (density) => {
    let vol = 0, area = 0; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; let n = 0;
    solids().forEach(b => { const s = b.solid || b; if (!s.volume) return; n++; vol += s.volume(); area += s.surfaceArea ? s.surfaceArea() : 0; const bb = s.bbox(); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], bb.min[k]); mx[k] = Math.max(mx[k], bb.max[k]); } });
    return { bodies: n, vol, area, size: n ? [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] : [0, 0, 0], mass: vol / 1000 * density };
  };
  const tick = () => new Promise(r => setTimeout(r, 30));
  const f3 = (x) => isFinite(x) ? String(+x.toFixed(3)) : '\u2013';

  function designTablePanel() {
    loadStore();
    openPanel('Design tables & configurations', (box) => {
      const t = cur();
      const sel = '<select id="dtSel">' + store.tables.map((x, i) => '<option value="' + i + '"' + (i === store.sel ? ' selected' : '') + '>' + esc(x.name) + (x.assembly ? ' (assembly)' : '') + '</option>').join('') + '</select>';
      let h = '<div class="r">' + (store.tables.length ? sel : '<span class="mut">No tables yet \u2014 paste CSV / TSV below (copy straight from Excel) or import a file.</span>') +
        (t ? '<input class="m" id="dtName" value="' + esc(t.name) + '" title="Table name \u2014 an assembly table refers to components by this name"><input class="s" id="dtPre" placeholder="param prefix" value="' + esc(t.prefix || '') + '" title="Optional prefix added to every parameter name"><label><input type="checkbox" id="dtAsm"' + (t.assembly ? ' checked' : '') + '> assembly table</label><button id="dtDel">Delete</button>' : '') + '</div>';
      h += '<h4>Import</h4><textarea id="dtPaste" placeholder="Config,d,L,P,b = 2*d+6\nM8x25,8,25,1.25\n..."></textarea><div class="r"><button class="pri" id="dtLoad">Load pasted data as new table</button><button id="dtFile">Import CSV file\u2026</button><input type="file" id="dtF" accept=".csv,.tsv,.txt" hidden>' + (t ? '<button id="dtExp">Export CSV</button>' : '') + '<button id="dtJson">Save all tables (.json)</button><button id="dtJsonIn">Load tables (.json)</button><input type="file" id="dtFJ" accept=".json" hidden></div>';
      h += '<div class="mut">Headers: a plain name links a column to the global parameter of that name \u00b7 <b>name = formula</b> makes a derived column \u00b7 a header ending in <b>#</b> is a quantity (assembly tables) \u00b7 text columns (Material, component configs) are kept as labels. Trig functions use degrees.</div>';
      if (t) {
        h += '<h4>Rows</h4><div id="dtGrid"></div>';
        h += '<h4>Rules (one per line: <code>expression ; message</code>)</h4><textarea id="dtRules" placeholder="L > b ; Bolt is shorter than its thread length\nd >= 6 ; Diameter below M6">' + esc(core.rulesText(t)) + '</textarea><div class="r"><button id="dtRulesSet">Update rules</button></div>';
        if (!t.assembly) {
          const pc = t.cols.filter(c => c.kind === 'param');
          h += '<h4>Size series</h4><div class="r"><select id="seCol">' + pc.map(c => '<option value="' + c.key + '">' + esc(c.name) + '</option>').join('') + '</select>from <input type="number" id="seA" value="10" step="any"> to <input type="number" id="seB" value="50" step="any"> step <input type="number" id="seS" value="10" step="any"> label <input class="s" id="seL" value="{v}"><label><input type="checkbox" id="seR"> replace rows</label><button id="seGo">Generate</button></div><div class="mut">Other cells are copied from the first row; derived columns recalculate.</div>';
          h += '<h4>Compare all sizes</h4><div class="r">density g/cm\u00b3 <input type="number" id="cpD" value="' + store.density + '" step="any"><button id="cpGo" class="pri">Apply every row and measure</button></div><div id="cpOut"></div>';
        } else {
          h += '<h4>Configuration BOM</h4><div class="r"><button id="bmGo" class="pri">Build BOM for all sizes</button></div><div id="bmOut"></div>';
        }
      }
      box.innerHTML = h;
      const re = () => { saveStore(); designTablePanel(); };
      const ld = (txt, nm) => { try { const tb = core.fromText(nm, txt); store.tables.push(tb); store.sel = store.tables.length - 1; re(); toast('Loaded "' + nm + '": ' + tb.rows.length + ' rows, ' + tb.cols.length + ' columns'); } catch (e) { toast(e.message, true); } };
      $('#dtLoad', box).onclick = () => { const v = $('#dtPaste', box).value; if (!v.trim()) return toast('Paste some CSV or tab-separated data first', true); ld(v, 'Table ' + (store.tables.length + 1)); };
      $('#dtFile', box).onclick = () => $('#dtF', box).click();
      $('#dtF', box).onchange = async (e) => { const f = e.target.files[0]; if (f) ld(await f.text(), f.name.replace(/\.[^.]+$/, '')); };
      $('#dtJson', box).onclick = () => saveBlob('Aakar_design_tables_' + stamp() + '.json', JSON.stringify({ aakarDesignTables: 1, tables: store.tables }, null, 1), 'application/json');
      $('#dtJsonIn', box).onclick = () => $('#dtFJ', box).click();
      $('#dtFJ', box).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (!Array.isArray(o.tables)) throw new Error('Not an Aakar design-table file'); o.tables.forEach(x => { const i = store.tables.findIndex(y => y.name === x.name); if (i >= 0) store.tables[i] = x; else store.tables.push(x); }); re(); toast('Loaded ' + o.tables.length + ' table(s)'); } catch (er) { toast(er.message, true); } };
      if (!t) return;
      $('#dtSel', box).onchange = (e) => { store.sel = +e.target.value; re(); };
      $('#dtName', box).onchange = (e) => { const v = e.target.value.trim(); if (v) { t.name = v; re(); } };
      $('#dtPre', box).onchange = (e) => { t.prefix = e.target.value.trim(); saveStore(); toast('Parameters from this table will be named ' + (t.prefix || '') + '<column>'); };
      $('#dtAsm', box).onchange = (e) => { t.assembly = e.target.checked; re(); };
      $('#dtDel', box).onclick = () => { store.tables.splice(store.sel, 1); store.sel = 0; re(); };
      $('#dtExp', box).onclick = () => saveBlob(t.name.replace(/[^\w.-]+/g, '_') + '.csv', core.tableCSV(t), 'text/csv');
      $('#dtRulesSet', box).onclick = () => { t.rules = core.parseRules($('#dtRules', box).value); re(); };
      // grid
      const grid = $('#dtGrid', box), act = store.active[t.name];
      let g = '<table><tr><th></th>' + t.cols.map(c => '<th>' + esc(c.name) + '<span class="k">' + (c.kind === 'param' ? 'linked' : c.kind === 'derived' ? 'derived' : c.kind === 'qty' ? 'qty' : c.kind === 'text' ? 'text' : '') + '</span></th>').join('') + '<th>Check</th></tr>';
      t.rows.forEach((row, ri) => {
        const r = core.evalRow(t, ri);
        g += '<tr' + (act === ri ? ' class="act"' : '') + '><td><button data-ap="' + ri + '" title="' + (t.assembly ? 'Apply this assembly size (sets every component\'s configuration)' : 'Set the global parameters to this row') + '">' + (act === ri ? '\u25cf ' : '') + 'Apply</button></td>' +
          t.cols.map(c => { const v = r.vals[c.key]; return '<td' + (c.kind === 'derived' && !isFinite(v) ? ' class="bad"' : '') + '>' + esc(typeof v === 'number' ? f3(v) : v) + '</td>'; }).join('') +
          '<td class="' + (r.errors.length ? 'err' : r.warnings.length ? 'warn' : 'ok') + '">' + esc(r.errors.concat(r.warnings).join('; ') || 'OK') + '</td></tr>';
      });
      grid.innerHTML = g + '</table>';
      grid.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => {
        try { const ri = +b.dataset.ap; if (t.assembly) { const n = applyAssemblyRow(store.sel, ri); toast(n.length ? 'Applied with notes: ' + n.join('; ') : 'Applied "' + t.rows[ri].label + '"', !!n.length); } else { const r = applyRow(store.sel, ri); toast('Applied "' + t.rows[ri].label + '"' + (r.warnings.length ? ' \u2014 ' + r.warnings[0] : ''), !!r.warnings.length); } saveStore(); designTablePanel(); }
        catch (e) { toast(e.message, true); }
      });
      if (!t.assembly) {
        $('#seGo', box).onclick = () => { try { const n = core.series(t, $('#seCol', box).value, +$('#seA', box).value, +$('#seB', box).value, +$('#seS', box).value, $('#seL', box).value, 0, $('#seR', box).checked); toast('Added ' + n + ' rows'); re(); } catch (e) { toast(e.message, true); } };
        $('#cpGo', box).onclick = async () => {
          store.density = +$('#cpD', box).value || 7.85; saveStore();
          const out = $('#cpOut', box), prev = store.active[t.name]; const res = [];
          try {
            for (let ri = 0; ri < t.rows.length; ri++) { applyRow(store.sel, ri); await tick(); const m = measure(store.density); res.push({ label: t.rows[ri].label, m, w: core.evalRow(t, ri).warnings }); }
            if (prev != null) { applyRow(store.sel, prev); await tick(); }
          } catch (e) { return toast(e.message, true); }
          let o = '<table><tr><th>Config</th><th>Bodies</th><th>Volume mm\u00b3</th><th>Surface mm\u00b2</th><th>Size X \u00d7 Y \u00d7 Z mm</th><th>Mass g</th><th>Check</th></tr>';
          res.forEach(r => { o += '<tr><td>' + esc(r.label) + '</td><td>' + r.m.bodies + '</td><td>' + f3(r.m.vol) + '</td><td>' + f3(r.m.area) + '</td><td>' + r.m.size.map(f3).join(' \u00d7 ') + '</td><td>' + f3(r.m.mass) + '</td><td class="' + (r.w.length ? 'warn' : 'ok') + '">' + esc(r.w.join('; ') || 'OK') + '</td></tr>'; });
          out.innerHTML = o + '</table><div class="r"><button id="cpCsv">Download CSV</button></div><div class="mut">' + (prev != null ? 'The previously applied row was restored.' : 'No row had been applied before, so the last size stays applied.') + ' Only solids are measured.</div>';
          $('#cpCsv', box).onclick = () => saveBlob(t.name + '_compare.csv', core.toCSV([['Config', 'Bodies', 'Volume mm3', 'Surface mm2', 'Size X', 'Size Y', 'Size Z', 'Mass g', 'Check']].concat(res.map(r => [r.label, r.m.bodies, +r.m.vol.toFixed(3), +r.m.area.toFixed(3)].concat(r.m.size.map(x => +x.toFixed(3)), [+r.m.mass.toFixed(3), r.w.join('; ') || 'OK'])))), 'text/csv');
        };
      } else {
        $('#bmGo', box).onclick = () => {
          const b = core.bom(store.tables, t); let o = '<table><tr><th>Assembly size</th><th>Component</th><th>Configuration</th><th>Qty</th></tr>';
          b.perSize.forEach(s => s.items.forEach(i => { o += '<tr><td>' + esc(s.size) + '</td><td>' + esc(i.component) + '</td><td class="' + (i.known === false ? 'bad' : '') + '">' + esc(i.config) + (i.known === false ? ' (no such configuration)' : '') + '</td><td>' + i.qty + '</td></tr>'; }));
          o += '</table><h4>All sizes combined</h4><table><tr><th>Component</th><th>Configuration</th><th>Qty</th></tr>' + b.total.map(i => '<tr><td>' + esc(i.component) + '</td><td>' + esc(i.config) + '</td><td>' + i.qty + '</td></tr>').join('') + '</table><div class="r"><button id="bmCsv">Download CSV</button></div>';
          $('#bmOut', box).innerHTML = o; $('#bmCsv', box).onclick = () => saveBlob(t.name + '_BOM.csv', core.bomCSV(b), 'text/csv');
        };
      }
    });
  }

  // ---------------------------------------------------------------- export commands
  function exportGLB() { try { const b = solids(); const d = core.toGLB(b, { meta: P.st.doc && P.st.doc.meta }); saveBlob(modelName() + '.glb', d, 'model/gltf-binary'); status('Exported ' + b.length + ' solid(s) to glTF binary (.glb) \u2014 Y up, metres'); toast('Exported ' + modelName() + '.glb'); } catch (e) { toast('glTF export: ' + e.message, true); } }
  function export3MF() { try { const b = solids(); const d = core.to3MF(b, { meta: P.st.doc && P.st.doc.meta }); saveBlob(modelName() + '.3mf', d, 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'); status('Exported ' + b.length + ' solid(s) to 3MF \u2014 millimetres, Z up'); toast('Exported ' + modelName() + '.3mf'); } catch (e) { toast('3MF export: ' + e.message, true); } }

  // ---------------------------------------------------------------- GD&T panel
  function gdtPanel() {
    openPanel('GD&T symbols', (box) => {
      box.innerHTML = '<h4>Feature control frame</h4><div class="r"><select id="gC">' + core.GDT.map(g => '<option value="' + g[0] + '">' + g[1] + '  ' + g[2] + '</option>').join('') + '</select><label><input type="checkbox" id="gD" checked> \u2300 zone</label> tolerance <input class="s" id="gT" value="0.1"> modifier <select id="gM"><option value="none">none</option><option value="M">M (MMC)</option><option value="L">L (LMC)</option><option value="P">P (projected)</option></select></div>' +
        '<div class="r">datums ' + [1, 2, 3].map(i => '<input class="s" id="gA' + i + '" maxlength="2" placeholder="' + 'ABC'[i - 1] + '" style="width:44px"><select id="gB' + i + '"><option value="none">\u2013</option><option value="M">M</option><option value="L">L</option></select>').join(' ') + '</div>' +
        '<h4>Datum feature</h4><div class="r">letter <input class="s" id="gDa" value="A" maxlength="2" style="width:44px"></div>' +
        '<h4>Surface finish</h4><div class="r">Ra <input class="s" id="gRa" value="1.6"> process <input class="m" id="gPr" placeholder="e.g. milled"> <select id="gRm"><option value="any">any removal</option><option value="required">removal required</option><option value="prohibited">removal prohibited</option></select></div>' +
        '<div id="gPrev"></div><div class="r"><button id="gDl" class="pri">Download SVGs</button><button id="gCp">Copy frame SVG</button></div><div class="mut">Symbols are generated as SVG text; they are not yet attached to drawing geometry \u2014 insert the SVG into your sheet or drawing tool.</div>';
      const read = () => ({ char: $('#gC', box).value, diameter: $('#gD', box).checked, tol: $('#gT', box).value, mod: $('#gM', box).value, datums: [1, 2, 3].map(i => ({ id: $('#gA' + i, box).value.trim(), mod: $('#gB' + i, box).value })) });
      const draw = () => { const o = read(); $('#gPrev', box).innerHTML = '<span class="prev">' + core.fcfSVG(o) + '</span><span class="prev">' + core.datumSVG($('#gDa', box).value) + '</span><span class="prev">' + core.finishSVG({ ra: $('#gRa', box).value, process: $('#gPr', box).value, removal: $('#gRm', box).value }) + '</span>'; };
      box.querySelectorAll('input,select').forEach(e => { e.oninput = draw; e.onchange = draw; }); draw();
      $('#gDl', box).onclick = () => { const o = read(); saveBlob('GDT_frame_' + o.char + '.svg', core.fcfSVG(o), 'image/svg+xml'); saveBlob('GDT_datum_' + $('#gDa', box).value + '.svg', core.datumSVG($('#gDa', box).value), 'image/svg+xml'); saveBlob('GDT_finish.svg', core.finishSVG({ ra: $('#gRa', box).value, process: $('#gPr', box).value, removal: $('#gRm', box).value }), 'image/svg+xml'); };
      $('#gCp', box).onclick = async () => { try { await navigator.clipboard.writeText(core.fcfSVG(read())); toast('SVG copied'); } catch (e) { toast('Clipboard not available \u2014 use Download', true); } };
    });
  }

  // ---------------------------------------------------------------- registration
  const IC = {
    dt: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 4v16"/>',
    glb: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    mf: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v9l8 4 8-4V7"/><path d="M12 11v9"/>',
    gdt: '<rect x="3" y="8" width="18" height="8"/><path d="M8 8v8M15 8v8"/><circle cx="5.5" cy="12" r="1.3"/>'
  };
  function setBrand() { try { const b = $('.brand span'); if (b) b.innerHTML = 'Aakar <b>' + VERSION + '</b>'; if (/^Aakar \d/.test(document.title)) document.title = document.title.replace(/^Aakar [\d.]+/, 'Aakar ' + VERSION); } catch (e) { /* ignore */ } }
  function register() {
    P = G.PRISM;
    const add = (tab, name, items) => { try { P.addGroup(tab, name, items); } catch (e) { try { console.warn('Aakar 8.14: could not add "' + name + '" to ' + tab + ': ' + e.message); } catch (e2) { /* ignore */ } } };
    add('assembly', 'Configurations', [['x814dt', 'Design table', designTablePanel, 'Design tables: linked columns, derived values, rules, size series, compare all sizes, per-component configurations, configuration BOM', IC.dt]]);
    add('model', 'Export 8.14', [['x814glb', 'glTF (.glb)', exportGLB, 'Export all visible solids as binary glTF 2.0 (Y up, metres)', IC.glb], ['x814mf', '3MF', export3MF, 'Export all visible solids as 3MF (millimetres) with colours', IC.mf]]);
    add('drawing', 'GD&T', [['x814gdt', 'GD&T', gdtPanel, 'Feature control frames, datum symbols and surface-finish symbols as SVG', IC.gdt]]);
    setBrand(); setTimeout(setBrand, 800); setTimeout(setBrand, 2500);
    CAD.x814.ui = { designTablePanel, exportGLB, export3MF, gdtPanel, store, applyRow, applyAssemblyRow, measure };
    status('Aakar ' + VERSION + ' \u2014 design tables & configurations (Assembly tab) \u00b7 glTF / 3MF export (Model tab) \u00b7 GD&T symbols (Drawing tab)');
  }
  let tries = 0;
  (function wait() {
    const p = G.PRISM;
    if (p && p.addGroup && p.st && CAD.solid && document.querySelector('#ribbon')) { try { register(); } catch (e) { try { console.error('Aakar 8.14 add-on failed', e); } catch (e2) { /* ignore */ } } return; }
    if (tries++ < 200) setTimeout(wait, 100); else try { console.warn('Aakar 8.14 add-on: application core not found'); } catch (e) { /* ignore */ }
  })();
})(typeof window !== 'undefined' ? window : globalThis);
