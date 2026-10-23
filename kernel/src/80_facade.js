// ---------------------------------------------------------------- public kernel interface (the contract Aakar's exact-kernel panel expects, plus analysis extras)
AK.version = '1.0.0';
const mkNode = (kind, d) => new Node(kind, d);
const prim = (p) => mkNode('prim', { prim: p });
const num = (x, name) => { if (!(typeof x === 'number' && isFinite(x))) throw new Error(name + ' must be a finite number'); return x; };
const pos = (x, name) => { if (!(num(x, name) > 0)) throw new Error(name + ' must be positive'); return x; };
function evalExact(h) { const ev = evaluate(h, RES_EXACT); if (!ev.mp) ev.mp = massProps(ev.body); return ev; }
const rng = (a, b) => (b - a);
const kernel = {
  name: 'AakarKernel', version: AK.version, isAakarKernel: true,
  // --- primitives (the placement convention matches the Aakar replay: box corner and cylinder / cone base on the origin, sphere centred on it)
  box: (w, d, h) => prim(mkBox(pos(w, 'width'), pos(d, 'depth'), pos(h, 'height'))),
  cylinder: (r, h) => prim(mkCone(pos(r, 'radius'), r, pos(h, 'height'))),
  cone: (r, rt, h) => prim(mkCone(pos(r, 'radius'), Math.max(0, num(rt || 0, 'top radius')), pos(h, 'height'))),
  sphere: (r) => prim(mkSphere(pos(r, 'radius'))),
  torus: (R, r) => { if (!(r > 0 && R > r)) throw new Error('torus needs 0 < minor radius < major radius'); return prim(mkTorus(R, r)); },
  // --- transforms
  translate: (h, v) => mkNode('xf', { child: h, T: Xf.translate(v) }),
  rotate: (h, axis, angle, center) => mkNode('xf', { child: h, T: Xf.rotate(axis, angle, center) }),
  scale: (h, s, center) => mkNode('xf', { child: h, T: Xf.scale(pos(s, 'scale'), center) }),
  // --- booleans (evaluated lazily; any failure throws so that the caller can fall back)
  fuse: (a, b) => mkNode('bool', { op: 'union', a, b }),
  cut: (a, b) => mkNode('bool', { op: 'subtract', a, b }),
  common: (a, b) => mkNode('bool', { op: 'intersect', a, b }),
  // --- measurement (exact: Green's theorem on the true surfaces)
  volume: (h) => evalExact(h).mp.volume,
  area: (h) => evalExact(h).mp.area,
  massProps: (h) => evalExact(h).mp,
  validate: (h) => validate(evalExact(h).body),
  bbox: (h) => { const ev = evalExact(h); if (ev.soup && ev.soup.length) return soupBBox(ev.soup); return ev.body.bbox(); },   // tight (tessellation) bounds; the analytic bound is only a fallback for imported bodies
  contains: (h, p) => containsPoint(h, p),
  /** structure of the exact B-rep: faces by surface type, edges by curve type */
  info: (h) => { const ev = evalExact(h), faces = {}, edges = {}; ev.body.faces.forEach(f => { faces[f.surf.kind] = (faces[f.surf.kind] || 0) + 1; }); ev.body.edges().forEach(e => { edges[e.kind] = (edges[e.kind] || 0) + 1; }); return { faces, edges, faceCount: ev.body.faces.length, edgeCount: ev.body.edges().length, vertexCount: ev.body.vertices().length, approximateFaces: ev.mp.approximateFaces || 0 }; },
  /** triangle mesh whose vertices lie on the exact surfaces; `faces[i]` is the B-rep face of triangle i */
  mesh: (h, tol) => toMesh(evaluate(h, meshRes(tol))),
  // --- exchange
  stepExport: (h, opts) => stepWrite([evalExact(h).body], opts),
  stepImport: (text) => { const L = stepRead(typeof text === 'string' ? text : new TextDecoder().decode(text)); return mkNode('brep', { body: L[0].body, name: L[0].name }); },
  stepImportAll: (text) => stepRead(typeof text === 'string' ? text : new TextDecoder().decode(text)).map(x => mkNode('brep', { body: x.body, name: x.name }))
};
AK.kernel = kernel;
AK.init = () => Promise.resolve(kernel);
AK.Node = Node;
