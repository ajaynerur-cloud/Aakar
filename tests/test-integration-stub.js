// Smoke test of the browser-side wiring against a stubbed Aakar host (NOT the real app): node tests/test-integration-stub.js
const assert = require('assert');
const calls = { groups: [], params: {}, toasts: [], downloads: [] };
const box = (w, d, h) => { const V = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]];
  const F = [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(l => ({ loops: [l] }));
  return { V, F, volume: () => w*d*h, surfaceArea: () => 2*(w*d+w*h+d*h), bbox: () => ({ min: [0,0,0], max: [w,d,h] }) }; };
let W = 10;
const P = { st: { doc: { meta: { vis: {}, names: { b1: 'Plate' }, colors: {} } }, get bodies() { return [{ key: 'b1', name: 'Plate', solid: box(W, 20, 5) }]; } },
  addGroup: (tab, name, items) => calls.groups.push([tab, name, items.map(i => i[1])]), toast: (m, e) => calls.toasts.push([m, !!e]), status() {} };
const el = () => ({ style: {}, appendChild() {}, remove() {}, click() { calls.downloads.push(this.download); }, set innerHTML(v) {}, get innerHTML() { return ''; } });
globalThis.document = { title: 'Aakar 8.12 — x', head: { appendChild() {} }, body: { appendChild() {} }, createElement: el, querySelector: (s) => s === '#ribbon' ? el() : (s === '.brand span' ? (globalThis.__brand = el()) : null) };
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } };
globalThis.window = globalThis;
globalThis.CAD = { solid: { triangulateFace(s, fi) { const l = s.F[fi].loops[0]; const o = []; for (let i = 1; i + 1 < l.length; i++) o.push([l[0], l[i], l[i+1]]); return o; } },
  x10: { ui: { api: { param: (k, v) => { calls.params[k] = v; if (k === 'w') W = +v; } } } } };
globalThis.PRISM = P;
require('../addons/aakar-8.14-addon.js');
setTimeout(() => {
  const tabs = calls.groups.map(g => g[0] + ':' + g[1] + ':' + g[2].join('|'));
  assert.deepStrictEqual(tabs, ['assembly:Configurations:Design table', 'model:Export 8.14:glTF (.glb)|3MF', 'drawing:GD&T:GD&T']);
  const ui = CAD.x814.ui, core = CAD.x814.core;
  ui.exportGLB(); ui.export3MF();
  assert.deepStrictEqual(calls.downloads, ['Aakar.glb', 'Aakar.3mf'], 'downloads: ' + calls.downloads);
  // design table -> parameters -> geometry
  ui.store.tables = [core.fromText('Plate', 'Config,w,t = w/5\nS,10\nM,20\nL,40')]; ui.store.sel = 0;
  const r = ui.applyRow(0, 2); assert.strictEqual(calls.params.w, '40'); assert.strictEqual(calls.params.t, '8');
  assert.strictEqual(ui.measure(7.85).vol, 40 * 20 * 5);
  assert.strictEqual(ui.store.active.Plate, 2);
  // assembly row applies each component table's configuration
  ui.store.tables = [core.fromText('Plate', 'Config,w\nS,10\nL,40'), Object.assign(core.fromText('Asm', 'Size,Plate\nBig,L\nSmall,S'), { assembly: true })];
  const notes = ui.applyAssemblyRow(1, 1); assert.deepStrictEqual(notes, []); assert.strictEqual(calls.params.w, '10');
  assert.ok(ui.applyAssemblyRow(1, 0).length === 0 && calls.params.w === '40');
  assert.strictEqual(globalThis.__brand.innerHTML, '', 'brand stub (setter ignored) - just must not throw');
  console.log('integration stub OK; groups =', tabs.join(' ; '));
}, 300);
