// Run:  node tests/test-core.js      (no browser, no dependencies)
const assert = require('assert');
const fs = require('fs'), path = require('path');
// minimal kernel stub: CAD.solid.triangulateFace for convex quads/tris (same signature as the real one)
globalThis.CAD = { solid: { triangulateFace(s, fi) { const l = s.F[fi].loops[0]; const out = []; for (let i = 1; i + 1 < l.length; i++) out.push([l[0], l[i], l[i + 1]]); return out; } } };
require('../addons/aakar-8.14-addon.js');
const core = CAD.x814.core;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; }; const near = (a, b, m) => { assert.ok(Math.abs(a - b) < 1e-9, m + ' got ' + a + ' want ' + b); n++; };

// ---- expressions
near(core.evaluate('2*d+6', { d: 8 }), 22, 'linear');
near(core.evaluate('d - 1.2269*P', { d: 8, P: 1.25 }), 6.466375, 'thread');
near(core.evaluate('2^3^2'), 512, 'right-assoc power');
near(core.evaluate('-2^2'), -4, 'unary minus binds looser than ^'); near(core.evaluate('2^-1'), 0.5, 'negative exponent');
near(core.evaluate('sqrt(16)+abs(-3)+max(1,5,2)'), 12, 'functions');
near(core.evaluate('sin(30)'), 0.5, 'degrees');
near(core.evaluate('if(L > b, 1, 0)', { L: 20, b: 18 }), 1, 'if');
near(core.evaluate('round(pi*10, 2)'), 31.42, 'round/pi');
assert.throws(() => core.evaluate('x+1', {}), /Unknown name/); n++;
assert.throws(() => core.evaluate('1/0'), /finite/); n++;
assert.throws(() => core.evaluate('process.exit(1)'), /Unexpected/); n++;           // no code execution

// ---- CSV
eq(core.parseDelimited('a,b\n1,"x,y"\n'), [['a', 'b'], ['1', 'x,y']], 'quoted comma');
eq(core.parseDelimited('a\tb\r\n1\t2\r\n'), [['a', 'b'], ['1', '2']], 'tsv (Excel paste)');
eq(core.parseDelimited('a;b\n1;2'), [['a', 'b'], ['1', '2']], 'semicolon');

// ---- bolt table (the examples shipped in /examples)
const csv = fs.readFileSync(path.join(__dirname, '../examples/DesignTable_HexBolt.csv'), 'utf8');
const bolt = core.fromText('HexBolt', csv);
eq(bolt.cols.map(c => c.kind), ['label', 'param', 'param', 'param', 'param', 'param', 'text', 'derived', 'derived', 'derived'], 'column kinds');
eq(bolt.rows.length, 10, 'rows');
let r = core.evalRow(bolt, bolt.rows.findIndex(x => x.label === 'M8x25'));
near(r.vals.b, 22, 'derived b'); near(r.vals.d3, 8 - 1.2269 * 1.25, 'derived d3'); near(r.vals.Grip, 3, 'derived grip');
bolt.rules = core.parseRules('Grip >= 5 ; Grip below 5 mm - bolt too short\nd >= 6');
r = core.evalRow(bolt, 0); ok(r.warnings.length === 1 && /too short/.test(r.warnings[0]), 'rule fires on M6x20 (grip 2)');
r = core.evalRow(bolt, 9); eq(r.warnings, [], 'no warning on M16x80');
const pv = core.paramValues(bolt, 2); near(pv.params.d, 8, 'param d'); ok(!('Config' in pv.params) && !('Material' in pv.params), 'labels are not parameters');
bolt.prefix = 'Bolt_'; ok('Bolt_d' in core.paramValues(bolt, 2).params, 'prefix');
// broken formula -> error, not a crash
const bad = core.fromText('Bad', 'Config,d,x = d*zz\nA,1'); ok(core.evalRow(bad, 0).errors.length === 1, 'bad formula reported');

// ---- series
const br = core.fromText('Bracket', fs.readFileSync(path.join(__dirname, '../examples/DesignTable_LBracket.csv'), 'utf8'));
const before = br.rows.length, added = core.series(br, 'Thickness', 2, 6, 1, 'T{v}', 0, false);
eq([added, br.rows.length], [5, before + 5], 'series appends'); eq(br.rows[br.rows.length - 1].label, 'T6', 'series label');
core.series(br, 'Thickness', 0.5, 2, 0.5, '{v}', 0, true); eq(br.rows.map(x => x.cells.Thickness), ['0.5', '1', '1.5', '2'], 'series replace, float steps');
assert.throws(() => core.series(br, 'Thickness', 0, 1, 0, '{v}'), /positive/); n++;
assert.throws(() => core.series(br, 'Thickness', 0, 1000, 1, '{v}'), /limit/); n++;

// ---- assembly + BOM with per-size configurations
const asm = core.fromText('Shaft assembly', fs.readFileSync(path.join(__dirname, '../examples/DesignTable_ShaftAssembly.csv'), 'utf8'));
asm.assembly = true;
const tabs = [asm, core.fromText('Shaft', 'Config,d\nShaft-D20,20\nShaft-D25,25\nShaft-D30,30'), core.fromText('Bearing', 'Config,bore\nBearing-6004,20\nBearing-6005,25\nBearing-6006,30'), core.fromText('Housing', 'Config,w\nHousing-20,60\nHousing-25,70\nHousing-30,80'), bolt];
const bom = core.bom(tabs, asm);
eq(bom.perSize.length, 3, 'three sizes');
const s25 = bom.perSize.find(s => s.size === 'Size-25'); ok(s25.items.find(i => i.component === 'Bearing').qty === 2, 'bearing qty 2');
ok(bom.perSize.every(s => s.items.filter(i => i.component === 'Shaft').every(i => i.known === true)), 'configs resolved to tables');
const tot = Object.fromEntries(bom.total.map(i => [i.component + '|' + i.config, i.qty])); eq(tot['Bearing|Bearing-6005'], 2, 'combined BOM groups by part + configuration');
ok(core.bomCSV(bom).includes('Size-30'), 'bom csv'); ok(core.tableCSV(bolt).includes('b = 2*d+6'), 'table csv keeps formulas');

// ---- zip / crc32
eq(core.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'crc32 check value');

// ---- GLB + 3MF on a unit box (mm) -> files are verified against external readers in tests/verify.py
const V = [[0,0,0],[10,0,0],[10,20,0],[0,20,0],[0,0,30],[10,0,30],[10,20,30],[0,20,30]];
const F = [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(l => ({ loops: [l] }));
const box = { V, F };
const glb = core.toGLB([{ key: 'b1', name: 'Box', solid: box, color: [1, 0.5, 0.25] }], {});
fs.writeFileSync(path.join(__dirname, 'out_box.glb'), glb);
const mf = core.to3MF([{ key: 'b1', name: 'Box & <1>', solid: box, color: [1, 0.5, 0.25] }], {});
fs.writeFileSync(path.join(__dirname, 'out_box.3mf'), mf);
const dv = new DataView(glb.buffer, glb.byteOffset); eq([dv.getUint32(0, true), dv.getUint32(4, true), dv.getUint32(8, true)], [0x46546C67, 2, glb.length], 'GLB header');
ok(glb.length % 4 === 0, 'GLB 4-byte aligned');
assert.throws(() => core.toGLB([], {}), /no solids/); n++;

// ---- GD&T svg
const svg = core.fcfSVG({ char: 'position', diameter: true, tol: '0.05', mod: 'M', datums: [{ id: 'A' }, { id: 'B', mod: 'M' }, { id: '' }] });
ok(svg.startsWith('<svg') && svg.includes('\u2316') && svg.includes('\u2300') && svg.includes('\u24C2'), 'fcf svg'); ok((svg.match(/<line/g) || []).length === 3, 'frame has 3 separators (symbol|tol|A|B)');
ok(core.datumSVG('A').includes('>A<'), 'datum'); ok(core.finishSVG({ ra: '1.6', removal: 'required' }).includes('Ra 1.6'), 'finish');
console.log('all ' + n + ' assertions passed');
