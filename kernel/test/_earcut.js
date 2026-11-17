// Gives the kernel the triangulator the app normally provides (CAD.solid.earcut): (rings of point ids, id -> [x,y]) -> [[a,b,c], ...].
// Uses the npm package "earcut" (npm i --no-save earcut@2.2.4); returns false when it is not installed.
module.exports = function install() {
  let ec; try { ec = require('earcut'); } catch (e) { try { ec = require('/tmp/ecx/node_modules/earcut'); } catch (e2) { return false; } }
  ec = ec.default || ec;
  const EC = (rings, get) => { const flat = [], holes = [], order = []; rings.forEach((r, k) => { if (k > 0) holes.push(order.length); r.forEach((i) => { const p = get(i); flat.push(p[0], p[1]); order.push(i); }); }); const t = ec(flat, holes, 2), out = []; for (let i = 0; i < t.length; i += 3) out.push([order[t[i]], order[t[i + 1]], order[t[i + 2]]]); return out; };
  globalThis.CAD = globalThis.CAD || {}; globalThis.CAD.solid = globalThis.CAD.solid || {}; globalThis.CAD.solid.earcut = EC; return true;
};
