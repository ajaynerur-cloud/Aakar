// ---------------------------------------------------------------- STEP AP214 (ISO 10303-21) writer / reader for analytic B-reps
const fr = (x) => {
  if (!isFinite(x)) x = 0; if (Math.abs(x) < 1e-15) return '0.';
  let s = String(+x.toPrecision(15));
  if (/e/i.test(s)) { let [m, e] = s.toLowerCase().split('e'); if (!m.includes('.')) m += '.'; return m.toUpperCase() + 'E' + e.replace('+', ''); }
  return s.includes('.') ? s : s + '.';
};
const strq = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
function stepWrite(bodies, opts) {
  opts = opts || {}; bodies = Array.isArray(bodies) ? bodies : [bodies];
  const out = []; let id = 0; const E = (s) => { id++; out.push('#' + id + '=' + s + ';'); return '#' + id; };
  const ptc = new Map(), drc = new Map();
  const pt = (p) => { const k = p.map(x => x.toPrecision(15)).join(','); let r = ptc.get(k); if (!r) { r = E(`CARTESIAN_POINT('',(${fr(p[0])},${fr(p[1])},${fr(p[2])}))`); ptc.set(k, r); } return r; };
  const dir = (d) => { const k = d.map(x => x.toPrecision(15)).join(','); let r = drc.get(k); if (!r) { r = E(`DIRECTION('',(${fr(d[0])},${fr(d[1])},${fr(d[2])}))`); drc.set(k, r); } return r; };
  const ax2 = (o, z, x) => E(`AXIS2_PLACEMENT_3D('',${pt(o)},${dir(z)},${dir(x)})`);
  const appCtx = E("APPLICATION_CONTEXT('automotive design')");
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const prodCtx = E(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`), name = opts.name || 'Aakar_Part';
  const prod = E(`PRODUCT(${strq(name)},${strq(name)},'',(${prodCtx}))`);
  E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
  const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${prod})`), pdCtx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdCtx})`), pds = E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const lu = E('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'), au = E('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'), su = E('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),${lu},'distance_accuracy_value','confusion accuracy')`);
  const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${lu},${au},${su})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const items = [ax2([0, 0, 0], [0, 0, 1], [1, 0, 0])];
  bodies.forEach((body, bi) => {
    const vmap = new Map(), emap = new Map(), smap = new Map();
    const vp = (v) => { let r = vmap.get(v); if (!r) { r = E(`VERTEX_POINT('',${pt(v.p)})`); vmap.set(v, r); } return r; };
    const curve = (e) => {
      if (e.kind === 'line') { const d = V.sub(e.v1.p, e.v0.p), L = V.len(d) || 1; return E(`LINE('',${pt(e.v0.p)},${E(`VECTOR('',${dir(V.mul(d, 1 / L))},${fr(L)})`)})`); }
      if (e.kind === 'circle') {
        let n = V.cross(e.x, e.y); const sw = e.a1 - e.a0;
        if (sw < 0) { n = V.neg(n); }                                   // a clockwise arc is a counter-clockwise one about the flipped axis
        const a0 = e.a0, xs = V.add(V.mul(e.x, Math.cos(a0)), V.mul(e.y, Math.sin(a0)));
        return E(`CIRCLE('',${ax2(e.c, n, xs)},${fr(e.r)})`);
      }
      let P = e.pts, m = P.length - 1;
      if (m <= 48) {   // short polyline: write it as it is (degree 1)
        const mult = ['2']; for (let i = 1; i < m; i++) mult.push('1'); mult.push('2');
        const kn = []; for (let i = 0; i <= m; i++) kn.push(fr(i));
        return E(`B_SPLINE_CURVE_WITH_KNOTS('',1,(${P.map(pt).join(',')}),.POLYLINE_FORM.,.F.,.F.,(${mult.join(',')}),(${kn.join(',')}),.UNSPECIFIED.)`);
      }
      // dense curve: thin it out and write a C1 cubic (Catmull-Rom → Bezier chain) that still passes through the kept points
      const stride = Math.max(1, Math.floor(m / 120)), K = []; for (let i = 0; i < m; i += stride) K.push(P[i]); K.push(P[m]);
      const n = K.length - 1, closed = V.dist(K[0], K[n]) < 1e-12, T = K.map((q, i) => { const a = K[i > 0 ? i - 1 : (closed ? n - 1 : 0)], b = K[i < n ? i + 1 : (closed ? 1 : n)]; return V.mul(V.sub(b, a), i === 0 && !closed || i === n && !closed ? 1 : 0.5); });
      const cps = [K[0]]; for (let i = 0; i < n; i++) { cps.push(V.madd(K[i], T[i], 1 / 3), V.madd(K[i + 1], T[i + 1], -1 / 3), K[i + 1]); }
      const mult = ['4']; for (let i = 1; i < n; i++) mult.push('3'); mult.push('4');
      const kn = []; for (let i = 0; i <= n; i++) kn.push(fr(i));
      return E(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${cps.map(pt).join(',')}),.UNSPECIFIED.,.F.,.F.,(${mult.join(',')}),(${kn.join(',')}),.UNSPECIFIED.)`);
    };
    const edgeEnt = (e) => {
      let r = emap.get(e); if (r) return r;
      r = E(`EDGE_CURVE('',${vp(e.v0)},${vp(e.v1)},${curve(e)},.T.)`); emap.set(e, r); return r;
    };
    const surfEnt = (s) => {
      let r = smap.get(s); if (r) return r;
      if (s.kind === 'plane') r = E(`PLANE('',${ax2(s.o, s.z, s.x)})`);
      else if (s.kind === 'cylinder') r = E(`CYLINDRICAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.r)})`);
      else if (s.kind === 'cone') {
        let z = s.z, k = s.k; if (k < 0) { z = V.neg(z); k = -k; }
        r = E(`CONICAL_SURFACE('',${ax2(s.o, z, s.x)},${fr(s.r)},${fr(Math.atan(k))})`);
      } else if (s.kind === 'sphere') r = E(`SPHERICAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.r)})`);
      else if (s.kind === 'torus') r = E(`TOROIDAL_SURFACE('',${ax2(s.o, s.z, s.x)},${fr(s.R)},${fr(s.r)})`);
      else throw new Error('cannot write a ' + s.kind + ' surface');
      smap.set(s, r); return r;
    };
    const faceEnts = body.faces.map(f => {
      const loops = f.loops.map(l => {
        const oes = l.map(ce => { const e = ce.edge; return E(`ORIENTED_EDGE('',*,*,${edgeEnt(e)},${ce.fwd ? '.T.' : '.F.'})`); });
        return { ent: E(`EDGE_LOOP('',(${oes.join(',')}))`), l };
      });
      // outer bound: for a planar face the loop of largest positive area, otherwise the first loop
      let outer = 0;
      if (f.surf.kind === 'plane' && loops.length > 1) { let best = -Infinity; loops.forEach((lp, i) => { const a = V.dot(newell(f.loopPts(lp.l, 1e9, 32)), f.normalAt(f.surf.o)); if (a > best) { best = a; outer = i; } }); }
      const bnds = loops.map((lp, i) => E(`${i === outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${lp.ent},.T.)`));
      if (outer > 0) { const t = bnds[0]; bnds[0] = bnds[outer]; bnds[outer] = t; }
      return E(`ADVANCED_FACE('',(${bnds.join(',')}),${surfEnt(f.surf)},${f.rev ? '.F.' : '.T.'})`);
    });
    const shell = E(`CLOSED_SHELL('',(${faceEnts.join(',')}))`);
    items.push(E(`MANIFOLD_SOLID_BREP(${strq(bodies.length > 1 ? name + '_' + (bi + 1) : name)},${shell})`));
  });
  const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${strq(name)},(${items.join(',')}),${ctx})`);
  E(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
  const now = new Date().toISOString().slice(0, 19);
  return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Aakar exact B-rep (AakarKernel)'),'2;1');", `FILE_NAME(${strq((opts.fileName || name) + '.step')},'${now}',('Aakar'),(''),'AakarKernel ${AK.version}','Aakar','');`, "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...out, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}

// ---- reader
function stepTokenize(src) {
  const toks = []; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
    if (c === "'") { let j = i + 1, s = ''; while (j < n) { if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; } s += src[j++]; } toks.push({ t: 's', v: s }); i = j + 1; continue; }
    if (c === '#') { let j = i + 1; while (j < n && /[0-9]/.test(src[j])) j++; toks.push({ t: 'r', v: +src.slice(i + 1, j) }); i = j; continue; }
    if (c === '.') { const m = /^\.([A-Z_0-9]+)\./.exec(src.slice(i, i + 40)); if (m) { toks.push({ t: 'e', v: m[1] }); i += m[0].length; continue; } }
    if (c === '(' || c === ')' || c === ',' || c === '=' || c === '$' || c === '*') { toks.push({ t: c }); i++; continue; }
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i, i + 40));
    if (m) { toks.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    const w = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i, i + 80)); if (w) { toks.push({ t: 'w', v: w[0].toUpperCase() }); i += w[0].length; continue; }
    i++;
  }
  return toks;
}
function stepParse(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const a = text.indexOf('DATA;'); if (a < 0) throw new Error('not a STEP file (no DATA section)');
  const b = text.indexOf('ENDSEC;', a), data = text.slice(a + 5, b < 0 ? text.length : b);
  const stmts = []; let cur = '', q = false;
  for (let i = 0; i < data.length; i++) { const c = data[i]; if (c === "'") q = !q; if (c === ';' && !q) { stmts.push(cur); cur = ''; } else cur += c; }
  const ents = new Map();
  for (const st of stmts) {
    const m = /^\s*#(\d+)\s*=\s*([\s\S]*)$/.exec(st); if (!m) continue;
    const toks = stepTokenize(m[2]); let p = 0;
    const val = () => {
      const t = toks[p++]; if (!t) return null;
      if (t.t === '(') { const L = []; while (toks[p] && toks[p].t !== ')') { L.push(val()); if (toks[p] && toks[p].t === ',') p++; } p++; return L; }
      if (t.t === 'w') { if (toks[p] && toks[p].t === '(') { p++; const L = []; while (toks[p] && toks[p].t !== ')') { L.push(val()); if (toks[p] && toks[p].t === ',') p++; } p++; return { type: t.v, args: L }; } return { type: t.v, args: [] }; }
      if (t.t === 'r') return { ref: t.v }; if (t.t === 'n' || t.t === 's') return t.v; if (t.t === 'e') return { en: t.v }; if (t.t === '$') return null; if (t.t === '*') return '*'; return null;
    };
    const v = val(); ents.set(+m[1], v);
  }
  return ents;
}
function stepRead(text) {
  const ents = stepParse(text), memo = new Map();
  const get = (r) => { const e = ents.get(r.ref); if (e === undefined) throw new Error('missing STEP entity #' + r.ref); return e; };
  // complex entities are a list of {type,args}: merge them into one lookup
  const typeOf = (e) => (Array.isArray(e) ? e.map(x => x.type).join('+') : e.type);
  const part = (e, t) => (Array.isArray(e) ? e.find(x => x.type === t) : (e.type === t ? e : null));
  let scale = 1;
  for (const e of ents.values()) { const lu = Array.isArray(e) ? part(e, 'LENGTH_UNIT') : null; if (lu) { const si = part(e, 'SI_UNIT'); if (si) { const pre = si.args[0] && si.args[0].en; scale = pre === 'MILLI' ? 1 : pre === 'CENTI' ? 10 : pre === 'KILO' ? 1e6 : pre === 'MICRO' ? 1e-3 : 1000; } break; } const cb = Array.isArray(e) ? part(e, 'CONVERSION_BASED_UNIT') : null; if (cb && Array.isArray(e) && part(e, 'LENGTH_UNIT')) { scale = 25.4; break; } }
  const memoize = (r, fn) => { if (memo.has(r.ref)) return memo.get(r.ref); const v = fn(); memo.set(r.ref, v); return v; };
  const P3 = (r) => memoize(r, () => { const e = get(r); return e.args[1].map(x => x * scale); });
  const D3 = (r) => memoize(r, () => V.norm(get(r).args[1]));
  const A2 = (r) => memoize(r, () => { const e = get(r); const o = P3(e.args[1]), z = e.args[2] ? D3(e.args[2]) : [0, 0, 1], x = e.args[3] ? D3(e.args[3]) : null; return frame(o, z, x); });
  const surface = (r) => memoize(r, () => {
    const e = get(r), t = typeOf(e);
    if (t === 'PLANE') return new Plane(A2(e.args[1]));
    if (t === 'CYLINDRICAL_SURFACE') return new Cylinder(A2(e.args[1]), e.args[2] * scale);
    if (t === 'CONICAL_SURFACE') return new Cone(A2(e.args[1]), e.args[2] * scale, Math.tan(e.args[3]));
    if (t === 'SPHERICAL_SURFACE') return new Sphere(A2(e.args[1]), e.args[2] * scale);
    if (t === 'TOROIDAL_SURFACE') return new Torus(A2(e.args[1]), e.args[2] * scale, e.args[3] * scale);
    throw new Error('unsupported STEP surface ' + t);
  });
  const vert = (r) => memoize(r, () => new Vertex(P3(get(r).args[1])));
  const bsplinePoints = (e) => {
    let deg, cps, mult, kv, w = null;
    if (Array.isArray(e)) { const c = part(e, 'B_SPLINE_CURVE'), kn = part(e, 'B_SPLINE_CURVE_WITH_KNOTS'), rat = part(e, 'RATIONAL_B_SPLINE_CURVE'); deg = c.args[0]; cps = c.args[1].map(P3); mult = kn.args[0]; kv = kn.args[1]; w = rat ? rat.args[0] : null; }
    else { deg = e.args[1]; cps = e.args[2].map(P3); mult = e.args[6]; kv = e.args[7]; }
    const knots = []; kv.forEach((k, i) => { for (let j = 0; j < mult[i]; j++) knots.push(k); });
    if (deg === 1) return cps;
    const out = [], t0 = knots[deg], t1 = knots[knots.length - deg - 1], N = Math.max(64, cps.length * 24);
    for (let s = 0; s <= N; s++) { const t = t0 + (t1 - t0) * s / N; out.push(deBoor(deg, knots, cps, w, t)); }
    return out;
  };
  function deBoor(p, U, Pc, W, t) {
    let k = p; while (k < Pc.length - 1 && t >= U[k + 1]) k++;
    const d = []; for (let j = 0; j <= p; j++) { const i = j + k - p, w = W ? W[i] : 1; d.push([Pc[i][0] * w, Pc[i][1] * w, Pc[i][2] * w, w]); }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) { const den = U[j + 1 + k - r] - U[j + k - p], al = den === 0 ? 0 : (t - U[j + k - p]) / den; for (let c = 0; c < 4; c++) d[j][c] = (1 - al) * d[j - 1][c] + al * d[j][c]; }
    return [d[p][0] / d[p][3], d[p][1] / d[p][3], d[p][2] / d[p][3]];
  }
  const edge = (r) => memoize(r, () => {
    const e = get(r); const v0 = vert(e.args[1]), v1 = vert(e.args[2]), cur = get(e.args[3]), same = !(e.args[4] && e.args[4].en === 'F'), t = typeOf(cur);
    let a = v0, b = v1;
    if (t === 'LINE') return new Edge('line', a, b);
    if (t === 'CIRCLE') {
      const fr_ = A2(cur.args[1]), rad = cur.args[2] * scale, ang = (p) => { const d = V.sub(p, fr_.o); return Math.atan2(V.dot(d, fr_.y), V.dot(d, fr_.x)); };
      const a0 = ang(a.p); let sw;
      if (a === b) sw = TAU; else { let d = ang(b.p) - a0; d = ((d % TAU) + TAU) % TAU; sw = d; }
      if (!same) { if (a === b) sw = -TAU; else sw = sw - TAU; }
      // frame of the edge: x points at the start vertex, y completes the right-handed frame about the circle axis
      const x = V.norm(V.sub(a.p, fr_.o)); return new Edge('circle', a, b, { c: fr_.o, x, y: V.cross(fr_.z, x), r: rad, a0: 0, a1: sw });
    }
    let pts;
    if (t === 'ELLIPSE') { const fr_ = A2(cur.args[1]), A = cur.args[2] * scale, B = cur.args[3] * scale; const ang = (p) => { const d = V.sub(p, fr_.o); return Math.atan2(V.dot(d, fr_.y) / B, V.dot(d, fr_.x) / A); }; const a0 = ang(a.p); let sw = a === b ? TAU : ((ang(b.p) - a0) % TAU + TAU) % TAU; if (!same) sw = sw - TAU; pts = []; const N = 96; for (let i = 0; i <= N; i++) { const th = a0 + sw * i / N; pts.push(V.add(fr_.o, V.add(V.mul(fr_.x, A * Math.cos(th)), V.mul(fr_.y, B * Math.sin(th))))); } pts[0] = a.p; pts[N] = b.p; return new Edge('poly', a, b, { pts }); }
    if (t.indexOf('B_SPLINE_CURVE') >= 0) {
      pts = bsplinePoints(cur); if (!same) pts = pts.slice().reverse();
      // trim to the vertices when the edge covers only part of the curve
      const near = (p) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = V.dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; };
      let i0 = near(a.p), i1 = near(b.p); if (a !== b && i1 > i0) pts = pts.slice(i0, i1 + 1); else if (a !== b && i0 > i1) pts = pts.slice(i1, i0 + 1).reverse();
      pts = pts.slice(); pts[0] = a.p; pts[pts.length - 1] = b.p; return new Edge('poly', a, b, { pts });
    }
    throw new Error('unsupported STEP curve ' + t);
  });
  const bodies = [];
  for (const [id, e] of ents) {
    if (!e || e.type !== 'MANIFOLD_SOLID_BREP') continue;
    const sh = get(e.args[1]); if (sh.type !== 'CLOSED_SHELL') continue;
    const faces = sh.args[1].map(fr_ => {
      const f = get(fr_), surf = surface(f.args[2]), rev = f.args[3] && f.args[3].en === 'F';
      const loops = f.args[1].map(br => {
        const b = get(br), lp = get(b.args[1]); if (lp.type !== 'EDGE_LOOP') throw new Error('unsupported face bound ' + lp.type);
        let ces = lp.args[1].map(or => { const o = get(or), ed = edge(o.args[3]), fwd = !(o.args[4] && o.args[4].en === 'F'); return { edge: ed, fwd }; });
        if (b.args[2] && b.args[2].en === 'F') ces = ces.slice().reverse().map(c => ({ edge: c.edge, fwd: !c.fwd }));
        return ces;
      });
      return new Face(surf, rev, loops);
    });
    bodies.push({ body: new Body(faces), name: e.args[0] || ('solid' + id) });
  }
  if (!bodies.length) throw new Error('the STEP file contains no MANIFOLD_SOLID_BREP');
  return bodies;
}
AK.stepWrite = stepWrite; AK.stepRead = stepRead;
