const assert = require('assert'); const fs = require('fs'); const code = fs.readFileSync('aakar-camtab.js', 'utf8');
function run(setup) {
  const calls = { groups: [], toasts: [], fr: 0, meas: 0, start: [], sec: 0 };
  const G = { PRISM: { addGroup: (tab, title, items) => calls.groups.push({ tab, title, items }), toast: (m, b) => calls.toasts.push([m, !!b]) }, CAD: {} };
  setup(G, calls); new Function('window', 'globalThis', code.replace(/\}\)\(typeof window[^\n]*$/, '})(window);'))(G, G);
  return { G, calls };
}
// 1. everything available
let { G, calls } = run((G, c) => { G.CAD.fr = { open: () => c.fr++ }; G.CAD.x10 = { ui: { measPanel: () => c.meas++, startMeasure: (m) => c.start.push(m), secPanel: () => c.sec++ } }; });
assert.deepStrictEqual(calls.groups.map(g => g.tab + ':' + g.title + ':' + g.items.map(i => i[1]).join('|')), ['cam:Recognize:Features', 'cam:Inspect:Measure|Section']);
const items = Object.fromEntries(calls.groups.flatMap(g => g.items).map(i => [i[1], i]));
items.Features[2](); items.Measure[2](); items.Section[2]();
assert.deepStrictEqual([calls.fr, calls.meas, calls.start, calls.sec], [1, 1, ['dist'], 1]);
assert.deepStrictEqual(calls.groups.flatMap(g => g.items).map(i => i[0]), ['camfeat', 'cammeas', 'camsec'], 'unique ids');
assert.ok(calls.groups.flatMap(g => g.items).every(i => typeof i[3] === 'string' && i[3].length > 20 && i[4].startsWith('<')), 'tooltips + icons');
// 2. run twice -> no duplicate groups
({ G, calls } = run((G, c) => { G.CAD.fr = { open() {} }; }));
new Function('window', 'globalThis', code.replace(/\}\)\(typeof window[^\n]*$/, '})(window);'))(G, G); assert.strictEqual(calls.groups.length, 2, 'second run must not add groups');
// 3. missing pieces -> friendly toast, no exception
({ G, calls } = run(() => {})); calls.groups.flatMap(g => g.items).forEach(i => i[2]());
assert.strictEqual(calls.toasts.length, 3); assert.ok(calls.toasts.every(t => t[1] && /not available/.test(t[0])), JSON.stringify(calls.toasts));
// 4. a panel that throws is reported, not propagated
({ G, calls } = run((G) => { G.CAD.x10 = { ui: { measPanel() { throw new Error('boom'); }, secPanel() { throw new Error('bang'); } } }; })); calls.groups.flatMap(g => g.items).filter(i => i[1] !== 'Features').forEach(i => i[2]());
assert.deepStrictEqual(calls.toasts.map(t => t[0]), ['Measure: boom', 'Section: bang']);
// 5. no PRISM at all -> silently does nothing
assert.doesNotThrow(() => new Function('window', 'globalThis', code.replace(/\}\)\(typeof window[^\n]*$/, '})(window);'))({}, {}));
console.log('module tests passed');
