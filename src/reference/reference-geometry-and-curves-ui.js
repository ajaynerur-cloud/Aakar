/* ======================================================================
 * Aakar 8.16 · REFERENCE GEOMETRY + CURVES   (part B: panel · picking · menus · toolbar)
 * ====================================================================== */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, IK = CAD && CAD.ik, F = CAD && CAD.feat, RG = CAD && CAD.ref;
  if (!RG || !IK || !P) return;
  const st = P.st, R = P.R, A = RG.A, V = A.V, { toast, status, esc } = IK, RS = RG.resolvers;
  const PLn = 'plane', AXn = 'axis', PTn = 'point', DRn = 'dir', FCn = 'face', CVn = 'curve', SFn = 'surf', EDn = 'edge';
  const NOUN = { edge: 'edge', plane: 'plane or flat face', axis: 'edge or axis', point: 'vertex or point', dir: 'edge, axis or plane', face: 'face', curve: 'curve, edge or sketch', surf: 'face, body, surface or plane' };
  const sl = (k, label, t, o) => Object.assign({ k, label, t }, o || {});
  const num = (k, label, def, o) => Object.assign({ k, label, def }, o || {});
  const chk = (k, label, def) => ({ k, label, def: !!def, type: 'chk' });
  const sel = (k, label, def, opts, o) => Object.assign({ k, label, def, type: 'sel', opts }, o || {});
  const DIRV = [sel('dir', 'Project along', 'sketch', [['sketch', 'The sketch normal'], ['normal', 'Normal to the target'], ['vec', 'A direction (below)']]),
    num('vx', 'Direction X', 0, { show: (v) => v.dir === 'vec' }), num('vy', 'Direction Y', 0, { show: (v) => v.dir === 'vec' }), num('vz', 'Direction Z', -1, { show: (v) => v.dir === 'vec' }), chk('both', 'Both ways along the direction', true)];

  const SPECS = {
    refPlane: { title: 'Reference plane', modes: [
      { id: 'offset', label: 'Offset from a plane or face', slots: [sl('base', 'Plane or flat face', PLn)], vals: [num('dist', 'Distance (mm)', 10), chk('flip', 'Flip side')], help: 'A plane parallel to the chosen plane or face. A positive distance goes along the plane’s normal.' },
      { id: 'angle', label: 'At an angle to a plane', slots: [sl('base', 'Plane or flat face', PLn), sl('axis', 'Rotate about (edge or axis)', AXn)], vals: [num('angle', 'Angle (°)', 45)], help: 'Rotates the chosen plane about an edge or axis — the new plane contains that axis.' },
      { id: 'three', label: 'Through three points', slots: [sl('p1', 'Point 1', PTn), sl('p2', 'Point 2', PTn), sl('p3', 'Point 3', PTn)] },
      { id: 'mid', label: 'Mid-plane between two planes', slots: [sl('a', 'First plane or face', PLn), sl('b', 'Second plane or face', PLn)], vals: [chk('flip', 'Use the other bisector')], help: 'Halfway between two parallel faces, or the bisector of two planes that meet.' },
      { id: 'pointNormal', label: 'Through a point, normal to an edge', slots: [sl('pt', 'Point', PTn), sl('dir', 'Edge, axis or plane (its direction)', DRn)] },
      { id: 'parallelAt', label: 'Parallel to a plane, through a point', slots: [sl('pt', 'Point', PTn), sl('base', 'Plane or flat face', PLn)] },
      { id: 'tangent', label: 'Tangent to a cylinder', slots: [sl('cyl', 'Cylindrical face', FCn), sl('ref', 'Measure the angle from this plane', PLn, { opt: 1 })], vals: [num('angle', 'Angle around the cylinder (°)', 0), chk('flip', 'Flip side')], help: 'A plane touching the cylinder at the chosen angle around it (0° = facing the reference plane’s normal).' },
      { id: 'curveNormal', label: 'Normal to a curve', slots: [sl('curve', 'Curve, edge or sketch', CVn)], vals: [num('t', 'Position along the curve (0 – 1)', 0.5)], help: 'A plane perpendicular to the curve at the chosen position — handy as a sweep or loft profile plane.' }
    ] },
    refAxis: { title: 'Reference axis', modes: [
      { id: 'twoPoints', label: 'Through two points', slots: [sl('p1', 'Point 1', PTn), sl('p2', 'Point 2', PTn)] },
      { id: 'edge', label: 'Along an edge', slots: [sl('edge', 'Straight edge', AXn)] },
      { id: 'cylinder', label: 'Axis of a cylinder', slots: [sl('face', 'Cylindrical face (hole, boss, round)', FCn)] },
      { id: 'planes', label: 'Intersection of two planes', slots: [sl('a', 'First plane or face', PLn), sl('b', 'Second plane or face', PLn)] },
      { id: 'pointNormal', label: 'Through a point, normal to a plane', slots: [sl('pt', 'Point', PTn), sl('base', 'Plane or flat face', PLn)] }
    ] },
    refPoint: { title: 'Reference point', modes: [
      { id: 'xyz', label: 'At coordinates', slots: [], vals: [num('x', 'X (mm)', 0), num('y', 'Y (mm)', 0), num('z', 'Z (mm)', 0)] },
      { id: 'vertex', label: 'At a vertex, edge midpoint or face centre', slots: [sl('pt', 'Vertex, edge or face', PTn)] },
      { id: 'onEdge', label: 'On an edge', slots: [sl('edge', 'Edge', EDn)], vals: [num('t', 'Position along the edge (0 – 1)', 0.5)] },
      { id: 'faceCenter', label: 'Centre of a face', slots: [sl('face', 'Face', FCn)] },
      { id: 'cylCenter', label: 'On the axis of a cylinder', slots: [sl('face', 'Cylindrical face', FCn)], vals: [num('t', 'Position along the axis (0 – 1)', 0.5)] },
      { id: 'project', label: 'Projection of a point on a plane', slots: [sl('pt', 'Point', PTn), sl('base', 'Plane or flat face', PLn)] },
      { id: 'axisPlane', label: 'Axis meets plane', slots: [sl('axis', 'Edge or axis', AXn), sl('base', 'Plane or flat face', PLn)] },
      { id: 'onCurve', label: 'On a curve', slots: [sl('curve', 'Curve, edge or sketch', CVn)], vals: [num('t', 'Position along the curve (0 – 1)', 0.5)] },
      { id: 'midpoint', label: 'Midpoint of two points', slots: [sl('p1', 'Point 1', PTn), sl('p2', 'Point 2', PTn)] }
    ] },
    refCS: { title: 'Coordinate system', modes: [
      { id: 'fromPoint', label: 'Origin + directions', slots: [sl('o', 'Origin', PTn), sl('z', 'Z direction (plane, axis or edge)', DRn, { opt: 1 }), sl('x', 'X direction (edge or axis)', DRn, { opt: 1 })], vals: [chk('flipZ', 'Flip Z'), chk('flipX', 'Flip X'), num('rot', 'Rotate about Z (°)', 0)], help: 'Leave a direction empty to use the world Z / X.' },
      { id: 'threePoints', label: 'Origin + point on X + point in the XY plane', slots: [sl('o', 'Origin', PTn), sl('px', 'Point on the X axis', PTn), sl('py', 'Point in the XY plane', PTn)] }
    ] },
    crvComposite: { title: 'Composite curve', modes: [{ id: 'join', label: 'Join curves', slots: [sl('srcs', 'Edges, curves or sketches to join', CVn, { multi: 1 })], vals: [num('tol', 'Join tolerance (mm)', 0.02), chk('smooth', 'Smooth into one spline', false)], help: 'Chains the picks end to end (in any direction) into one continuous curve.' }] },
    crvIntersect: { title: 'Intersection curve', modes: [{ id: 'x', label: 'Intersect two surfaces', slots: [sl('a', 'First: face, body, surface or plane', SFn), sl('b', 'Second: face, body, surface or plane', SFn)], vals: [chk('simplify', 'Remove redundant points', true), chk('smooth', 'Smooth into a spline', false)], help: 'Ctrl-click picks a whole body instead of one face. Curved faces are intersected on their tessellation.' }] },
    crvThrough: { title: 'Curve through points', modes: [{ id: 'pts', label: 'Through points', slots: [sl('pts', 'Vertices, points or midpoints (in order)', PTn, { multi: 1 })], vals: [chk('smooth', 'Smooth spline (off = straight segments)', true), chk('closed', 'Closed curve', false)] }] },
    crvProject: { title: 'Projected curve', modes: [
      { id: 'onto', label: 'Project onto a face, body, surface or plane', slots: [sl('src', 'Curve, edge or sketch to project', CVn), sl('target', 'Project onto', SFn)], vals: DIRV.concat([num('res', 'Samples', 240)]) },
      { id: 'crossing', label: 'Sketch on sketch (crossing of two sketches)', slots: [sl('src', 'First sketch', CVn), sl('target', 'Second sketch', CVn)], vals: [num('res', 'Samples', 240)], help: 'Each sketch is extruded along its own normal; the curve is where the two surfaces cross.' }
    ] },
    crvSplit: { title: 'Split line', modes: [{ id: 'split', label: 'Curve on selected faces', slots: [sl('src', 'Curve, edge or sketch', CVn), sl('faces', 'Faces to project onto', FCn, { multi: 1 })], vals: DIRV.concat([num('res', 'Samples', 240)]), help: 'Projects the curve onto the chosen faces only — the result is a curve lying on the face (the face itself is not cut).' }] },
    crvOffset: { title: 'Offset curve', modes: [{ id: 'off', label: 'Offset a curve', slots: [sl('src', 'Curve, edge or sketch', CVn), sl('plane', 'Offset in this plane', PLn, { opt: 1 })], vals: [sel('mode', 'Offset', 'plane', [['plane', 'In the plane of the curve'], ['vector', 'Along a direction']]), num('dist', 'Distance (mm)', 5), chk('flip', 'Other side'), num('vx', 'Direction X', 0, { show: (v) => v.mode === 'vector' }), num('vy', 'Direction Y', 0, { show: (v) => v.mode === 'vector' }), num('vz', 'Direction Z', 1, { show: (v) => v.mode === 'vector' }), chk('smooth', 'Smooth into a spline', false)], help: 'In a plane the curve is offset sideways (a closed curve grows or shrinks); “along a direction” copies it.' }] }
  };
  // the crvOffset mode value collides with the generic "mode" key: it is stored as p.mode ('plane' | 'vector'); the single UI mode is 'off'
  RG.specs = SPECS;
  const modeOf = (c) => SPECS[c.type].modes.find((m) => m.id === c.mode) || SPECS[c.type].modes[0];
  const evalNum = (s) => { s = String(s).trim(); if (s === '') return NaN; if (!/^[\d\s.+\-*/()eE]+$/.test(s)) return NaN; try { return Function('"use strict";return (' + s + ')')(); } catch (e) { return NaN; } };
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));

  // ------------------------------------------------------------------ descriptions
  const bodyName = (k) => { const b = st.bodies.find((x) => x.key === k); return b ? b.name : 'body'; };
  function describe(T) {
    if (!T) return '';
    const S = (RG.cur && RG.cur.base) || st.state;
    switch (T.k) {
      case 'std': return T.n === 'O' ? 'Origin' : T.n + (T.n.length === 2 ? ' plane' : ' axis');
      case 'ref': { const r = S && S.refs && S.refs.get(T.key); return r ? r.name : '(missing reference)'; }
      case 'sketch': { const s = S && S.sketches.get(T.id); return s ? 'Sketch · ' + s.name : '(missing sketch)'; }
      case 'curve': case 'item': { const it = S && S.items.get(T.key); return it ? it.name : '(missing item)'; }
      case 'face': return 'Face of ' + bodyName(T.body);
      case 'edge': return (T.t != null ? 'Midpoint of an edge of ' : 'Edge of ') + bodyName(T.body);
      case 'vert': return 'Vertex of ' + bodyName(T.body);
      case 'body': return bodyName(T.body) + ' (whole body)';
      case 'xyz': return '(' + T.p.map((x) => +(+x).toFixed(3)).join(', ') + ')';
      default: return '?';
    }
  }
  function quickOptions(t) {
    const S = (RG.cur && RG.cur.base) || st.state, o = [], refs = S && S.refs ? [...S.refs.values()] : [], sks = S ? [...S.sketches.values()] : [], its = S ? [...S.items.values()] : [];
    const stdPl = [['std:XY', 'XY plane'], ['std:XZ', 'XZ plane'], ['std:YZ', 'YZ plane']], stdAx = [['std:X', 'X axis'], ['std:Y', 'Y axis'], ['std:Z', 'Z axis']];
    if (t === PLn) { o.push(...stdPl); refs.filter((r) => r.kind === 'plane' || r.kind === 'cs').forEach((r) => o.push(['ref:' + r.key, '▱ ' + r.name])); sks.forEach((s) => o.push(['sk:' + s.id, '✎ Plane of ' + s.name])); }
    else if (t === AXn) { o.push(...stdAx); refs.filter((r) => r.kind === 'axis').forEach((r) => o.push(['ref:' + r.key, '⟋ ' + r.name])); }
    else if (t === PTn) { o.push(['std:O', 'Origin']); refs.filter((r) => r.kind === 'point' || r.kind === 'cs').forEach((r) => o.push(['ref:' + r.key, (r.kind === 'point' ? '✛ ' : '⊹ ') + r.name])); }
    else if (t === DRn) { stdAx.forEach((a) => o.push([a[0], a[1] + ' direction'])); stdPl.forEach((a) => o.push([a[0], 'Normal of ' + a[1]])); refs.forEach((r) => { if (r.kind === 'axis') o.push(['ref:' + r.key, '⟋ ' + r.name]); else if (r.kind === 'plane') o.push(['ref:' + r.key, '▱ Normal of ' + r.name]); else if (r.kind === 'cs') o.push(['ref:' + r.key, '⊹ Z of ' + r.name]); }); }
    else if (t === CVn) { its.filter((i) => i.kind === 'curve').forEach((i) => o.push(['cv:' + i.key, '⌇ ' + i.name])); sks.forEach((s) => o.push(['sk:' + s.id, '✎ ' + s.name])); }
    else if (t === SFn) { o.push(...stdPl); refs.filter((r) => r.kind === 'plane').forEach((r) => o.push(['ref:' + r.key, '▱ ' + r.name])); its.filter((i) => i.kind !== 'curve' && i.kind !== 'frame' && i.kind !== 'cloud').forEach((i) => o.push(['it:' + i.key, '◠ ' + i.name])); }
    return o;
  }
  function tFromQuick(v) { const i = v.indexOf(':'), k = v.slice(0, i), id = v.slice(i + 1); return k === 'std' ? { k: 'std', n: id } : k === 'ref' ? { k: 'ref', key: id } : k === 'sk' ? { k: 'sketch', id } : k === 'cv' ? { k: 'curve', key: id } : k === 'it' ? { k: 'item', key: id } : null; }

  // ------------------------------------------------------------------ picking in the 3D view
  function faceOutline(s, fis) { const L = []; fis.forEach((fi) => s.F[fi].loops.forEach((lp) => { const pts = lp.map((vi) => s.V[vi]); L.push(pts.concat([pts[0]])); })); return L; }
  function pickRefAt(x, y, ray, M, type) {
    let best = null; const cv = IK.cv, scr = (p) => R.project(p, M);
    RG.list().forEach((r) => {
      if (r.hide || !RG.show) return;
      const ok = (k) => (k === 'point' ? type === PTn : k === 'axis' ? (type === AXn || type === DRn) : k === 'plane' ? (type === PLn || type === DRn || type === SFn) : (type === PTn || type === DRn));
      if (!ok(r.kind)) return;
      if (r.kind === 'point' || r.kind === 'cs') { const q = scr(r.kind === 'point' ? r.p : r.o); if (q[3] <= 0) return; const d = Math.hypot(q[0] - x, q[1] - y); if (d <= 11 && (!best || d - 4 < best.sc)) best = { key: r.key, kind: r.kind, sc: d - 4, t: V.dist(ray.o, r.kind === 'point' ? r.p : r.o) }; }
      else if (r.kind === 'axis') { const hs = (r.size > 0 ? r.size / 2 : Math.max(25, RG.sceneScale() * 0.7)) * 1.15, d = IK.segDist(x, y, V.madd(r.o, r.d, -hs), V.madd(r.o, r.d, hs), M); if (d <= 8 && (!best || d - 2 < best.sc)) best = { key: r.key, kind: 'axis', sc: d - 2, t: V.dist(ray.o, r.o) }; }
      else if (r.kind === 'plane') {
        const den = V.dot(ray.d, r.n); if (Math.abs(den) < 1e-9) return; const t = V.dot(V.sub(r.o, ray.o), r.n) / den; if (t <= 0) return; const q = V.madd(ray.o, ray.d, t), w = V.sub(q, r.o), hs = r.size > 0 ? r.size / 2 : Math.max(25, RG.sceneScale() * 0.7);
        if (Math.abs(V.dot(w, r.u)) <= hs && Math.abs(V.dot(w, r.v)) <= hs && (!best || (best.kind === 'plane' && t < best.t))) { if (!best || best.kind === 'plane') best = { key: r.key, kind: 'plane', sc: 50, t }; }
      }
    });
    return best;
  }
  function refHL(key) { RG.hov = { refKey: key }; }
  /** what would be picked at (x,y) for a slot of this type → {T, hl} or null */
  function candidate(x, y, type, whole, alt) {
    const M = R.matrices(), ray = R.ray(x, y, M), want = (type === PLn || type === FCn || type === SFn) ? 'face' : (type === CVn || type === EDn) ? 'edge' : 'auto', f0 = st.filter;
    st.filter = want; let h = null; try { h = P.pickAt(x, y); } finally { st.filter = f0; }
    if (h && h.kind === 'item') {
      const it = st.items.find((i) => i.key === h.key); if (!it) return null;
      if (type === CVn && it.kind === 'curve') return { T: { k: 'curve', key: it.key }, hl: { itemKey: it.key } };
      if (type === SFn && it.kind !== 'curve' && it.kind !== 'frame' && it.kind !== 'cloud') return { T: { k: 'item', key: it.key }, hl: { itemKey: it.key } };
      h = null;
    }
    const rh = (whole || alt) && h && h.body ? null : pickRefAt(x, y, ray, M, type), vi = h && (h.kind === 'vertex' || h.kind === 'edge');
    if (rh && !vi && (rh.kind !== 'plane' || !h || (h.t == null) || rh.t <= h.t + 1e-6)) { const r = RG.list().find((q) => q.key === rh.key); const T = { k: 'ref', key: rh.key }; return { T, hl: { refKey: rh.key } }; }
    if (!h || !h.body) return null;
    const b = h.body, s = b.solid;
    if (h.kind === 'vertex') return type === PTn ? { T: { k: 'vert', body: b.key, ref: F.vertexRef(s, h.vi) }, hl: { pts: [s.V[h.vi]] } } : null;
    if (h.kind === 'edge') {
      const fr = CAD.solver.edgeFrame(s, h.le), ref = F.edgeRef(s, h.le), hl = { lines: [RS.edgePoly(s, h.le).pts] };
      if (type === AXn || type === DRn || type === CVn || type === EDn) return { T: { k: 'edge', body: b.key, ref }, hl };
      if (type === PTn) return { T: { k: 'edge', body: b.key, ref, t: 0.5 }, hl: { lines: hl.lines, pts: [V.lerp(fr.p0, fr.p1, 0.5)] } };
      return null;
    }
    if (h.kind === 'face' || h.kind === 'body') {
      const fi = h.fi, reg = RS.faceRegion(s, fi), hl = { lines: faceOutline(s, reg) }, T = { k: 'face', body: b.key, ref: F.faceRef(s, fi) };
      if (type === PLn) { if (!RS.isFlat(s, fi)) { toast('That face is curved — pick a flat face or a plane', true); return null; } return { T, hl }; }
      if (type === FCn || type === AXn || type === DRn) return { T, hl };
      if (type === PTn) return { T, hl: { lines: hl.lines, pts: [s.faceCentroid(fi)] } };
      if (type === SFn) return whole ? { T: { k: 'body', body: b.key }, hl: { lines: faceOutline(s, s.F.map((_, i) => i)) } } : { T, hl };
    }
    return null;
  }

  // ------------------------------------------------------------------ the panel
  let pan = null;
  function panel() {
    if (pan) return pan;
    pan = IK.panel('rgp', 'Reference geometry', { top: '56px', left: '14px' }, 372); pan.classList.add('rgp'); pan.onclose = () => closePanel();
    pan.body.addEventListener('click', onClick); pan.body.addEventListener('change', onChange); pan.body.addEventListener('input', onInput);
    pan.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); e.target.blur(); } });
    return pan;
  }
  function slotHTML(c, s) {
    const T = c.s[s.k], armed = c.armed === s.k; let h = '<div class="slot' + (armed ? ' arm' : '') + '" data-k="' + s.k + '"><div class="lab"><span>' + esc(s.label) + (s.opt ? ' <em>optional</em>' : '') + '</span>' + (armed ? '<em>click it in the 3D view…</em>' : '') + '</div>';
    const q = quickOptions(s.t), quick = q.length ? '<select data-a="quick"><option value="">…or choose from the model</option>' + q.map((o) => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('') + '</select>' : '';
    if (s.multi) {
      h += '<div class="row"><div class="val ' + ((T && T.length) ? 'set' : 'empty') + '">' + ((T && T.length) ? T.length + ' selected' : 'nothing selected yet') + '</div><button class="pk' + (armed ? ' on' : '') + '" data-a="pick">' + (armed ? 'Done' : '＋ Pick') + '</button></div>';
      h += '<div class="multi">' + (T || []).map((t, i) => '<div><b>' + (i + 1) + '</b><span>' + esc(describe(t)) + '</span><button data-a="rm" data-i="' + i + '" title="Remove">✕</button></div>').join('') + '</div>' + quick;
    } else {
      h += '<div class="row"><div class="val ' + (T ? 'set' : 'empty') + '">' + (T ? esc(describe(T)) : 'nothing selected') + '</div><button class="pk' + (armed ? ' on' : '') + '" data-a="pick" title="Pick in the 3D view">' + (armed ? '…' : 'Pick') + '</button>' + (T && s.opt ? '<button data-a="clear" title="Clear">✕</button>' : '') + '</div>' + quick;
    }
    if (s.t === PTn) h += '<div class="xyz"><span>x y z</span><input type="text" data-a="px" value="0"><input type="text" data-a="py" value="0"><input type="text" data-a="pz" value="0"><button data-a="setxyz">' + (s.multi ? 'Add' : 'Use') + '</button></div>';
    return h + '</div>';
  }
  function valsHTML(c, m) {
    const vs = (m.vals || []).filter((v) => !v.show || v.show(c.v)); if (!vs.length) return '';
    let h = '<h5>Parameters</h5><div class="vals">';
    vs.forEach((v) => {
      h += '<label>' + esc(v.label) + '</label>';
      if (v.type === 'chk') h += '<input type="checkbox" data-v="' + v.k + '"' + (c.v[v.k] ? ' checked' : '') + '>';
      else if (v.type === 'sel') h += '<select data-v="' + v.k + '">' + v.opts.map((o) => '<option value="' + o[0] + '"' + (String(c.v[v.k]) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
      else h += '<input type="text" data-v="' + v.k + '" value="' + (+(+c.v[v.k]).toFixed(6)) + '">';
    });
    return h + '</div>';
  }
  function render() {
    const c = RG.cur; if (!c || !pan) return; const spec = SPECS[c.type], m = modeOf(c); let h = '';
    if (spec.modes.length > 1) h += '<h5>Method</h5><select class="mode" data-a="mode">' + spec.modes.map((x) => '<option value="' + x.id + '"' + (x.id === m.id ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select>';
    else h += '<h5>' + esc(m.label) + '</h5>';
    if (m.help) h += '<div class="help">' + esc(m.help) + '</div>';
    if (m.slots.length) { h += '<h5>Selections</h5>'; m.slots.forEach((s) => { h += slotHTML(c, s); }); }
    h += valsHTML(c, m) + '<div class="err hint" id="rgErr"></div>';
    h += '<div class="nm"><label>Name</label><input type="text" data-a="name" placeholder="automatic" value="' + esc(c.name || '') + '"></div>';
    h += '<div class="btns"><button class="p" data-a="ok" id="rgOk">' + (c.edit ? 'Update' : 'Create') + '</button><button data-a="cancel">Cancel</button></div>';
    pan.body.innerHTML = h; showMsg();
  }
  function showMsg() {
    const e = pan && pan.body.querySelector('#rgErr'), c = RG.cur; if (!e || !c) return; const m = c.msg || { hint: '' };
    e.className = 'err ' + (m.bad ? 'bad' : m.ok ? 'ok' : 'hint'); e.textContent = m.bad || m.ok || m.hint || ''; e.style.display = (m.bad || m.ok || m.hint) ? '' : 'none';
    const ok = pan.body.querySelector('#rgOk'); if (ok) ok.disabled = !!(m.bad || m.hint);
  }
  function paramsOf(c) {
    const m = modeOf(c), p = { mode: c.mode, s: {} }; if (c.type === 'crvOffset') p.mode = c.v.mode;
    m.slots.forEach((s) => { const T = c.s[s.k]; if (s.multi) p.s[s.k] = (T || []).map(clone); else if (T) p.s[s.k] = clone(T); });
    (m.vals || []).forEach((v) => { p[v.k] = c.v[v.k]; });
    if (c.type === 'crvOffset') p.mode = c.v.mode;
    if (c.edit && c.edit.params.hide) p.hide = true; return p;
  }
  function updatePreview() {
    const c = RG.cur; if (!c) return; const m = modeOf(c);
    const missing = m.slots.find((s) => !s.opt && (s.multi ? !(c.s[s.k] && c.s[s.k].length) : !c.s[s.k]));
    if (missing) { RG.prev = null; c.msg = { hint: 'Choose: ' + missing.label.toLowerCase() }; showMsg(); P.redraw(); return; }
    try {
      const p = paramsOf(c), H = F.H(st.doc);
      if (c.type.indexOf('ref') === 0) { const g = RG.computeRef(c.type, p, c.base, H); RG.prev = { ref: g }; c.msg = { ok: summary(g) }; }
      else { const polys = RG.computeCurves(c.type, p, c.base, H); RG.prev = { polys }; c.msg = { ok: polys.length + ' curve' + (polys.length > 1 ? 's' : '') + ' · length ' + polys.map((q) => A.polyLen(q.pts, q.closed)).reduce((a, b) => a + b, 0).toFixed(2) + ' mm' }; }
    } catch (e) { RG.prev = null; c.msg = { bad: e.message || String(e) }; }
    showMsg(); P.redraw();
  }
  function summary(g) {
    const f = (a) => '(' + a.map((x) => +x.toFixed(3)).join(', ') + ')';
    return g.kind === 'plane' ? 'Plane through ' + f(g.o) + ', normal ' + f(g.n) : g.kind === 'axis' ? 'Axis through ' + f(g.o) + ', direction ' + f(g.d) : g.kind === 'point' ? 'Point at ' + f(g.p) : 'Origin ' + f(g.o) + ' · Z ' + f(g.z);
  }
  function openPanel(type, o) {
    o = o || {}; if (RG.cur) closePanel(); const spec = SPECS[type], f = o.edit || null; panel();
    const mode = (f && f.params.mode && spec.modes.some((m) => m.id === f.params.mode) ? f.params.mode : null) || (type === 'crvOffset' ? 'off' : null) || o.mode || spec.modes[0].id;
    const c = RG.cur = { type, mode, s: clone(f ? f.params.s : {}), v: {}, name: f ? f.name : '', edit: f, armed: null, msg: null, base: f ? P.featureIndexState(st.doc.features.indexOf(f)) : st.state };
    spec.modes.forEach((m) => (m.vals || []).forEach((v) => { if (!(v.k in c.v)) c.v[v.k] = f && f.params[v.k] != null ? f.params[v.k] : (v.def !== undefined ? v.def : v.type === 'chk' ? false : 0); }));
    pan.querySelector('header b').textContent = (f ? 'Edit · ' : '') + spec.title; pan.show();
    if (!f) prefill(c); render(); updatePreview();
    if (!f) { const m = modeOf(c), next = m.slots.find((s) => (s.multi ? !(c.s[s.k] && c.s[s.k].length) : !c.s[s.k]) && !s.opt); if (next) arm(next.k); }
  }
  function closePanel() { disarm(); RG.cur = null; RG.prev = null; RG.hov = null; if (pan) pan.classList.remove('on'); P.redraw(); }
  function disarm() { if (RG.cur && RG.cur.armed) IK.endPick(); document.body.classList.remove('rg-picking'); }
  const slotOf = (c, k) => modeOf(c).slots.find((s) => s.k === k);
  function arm(k) {
    const c = RG.cur; if (!c) return; if (c.armed) IK.endPick(); const s = slotOf(c, k); if (!s) return; c.armed = k; document.body.classList.add('rg-picking');
    IK.pickMode((s.multi ? 'Click to add (Esc or Done to finish): ' : 'Pick ') + NOUN[s.t] + ' · Alt-click picks the model behind a plane', {
      click: ({ x, y, e }) => { const r = candidate(x, y, s.t, e.ctrlKey || e.metaKey, e.altKey); if (!r) { toast('Nothing suitable there — pick a ' + NOUN[s.t], true); return; } assign(k, r.T, s); },
      move: ({ x, y, e }) => { const r = candidate(x, y, s.t, e.ctrlKey || e.metaKey, e.altKey); RG.hov = r ? r.hl : null; },
      end: () => { if (RG.cur) { RG.cur.armed = null; RG.hov = null; document.body.classList.remove('rg-picking'); render(); updatePreview(); } }
    });
    render();
  }
  function assign(k, T, s) {
    const c = RG.cur; if (!c) return;
    if (s.multi) { (c.s[k] = c.s[k] || []).push(T); render(); updatePreview(); return; }
    c.s[k] = T; IK.endPick();   // end() re-renders and previews
    const m = modeOf(c), next = m.slots.find((q) => !q.opt && !c.s[q.k] && !q.multi); if (next) arm(next.k);
  }
  function prefill(c) {
    const sel = st.sel; if (!sel || !sel.bodyId) return; const b = st.bodies.find((x) => x.key === sel.bodyId); if (!b) return; const m = modeOf(c);
    const hit = sel.type === 'face' ? { kind: 'face', body: b, fi: sel.faces[0] } : sel.type === 'edge' ? { kind: 'edge', body: b, le: sel.edges[0] } : sel.type === 'vertex' ? { kind: 'vertex', body: b, vi: sel.verts[0] } : null; if (!hit) return;
    const s = m.slots.find((q) => !q.multi && !c.s[q.k] && !q.opt && (hit.kind === 'face' ? [PLn, FCn, AXn, DRn, PTn, SFn].includes(q.t) : hit.kind === 'edge' ? [AXn, DRn, CVn, PTn, EDn].includes(q.t) : q.t === PTn)); if (!s) return;
    try {
      const s0 = b.solid; let T = null;
      if (hit.kind === 'face') { if (s.t === PLn && !RS.isFlat(s0, hit.fi)) return; T = { k: 'face', body: b.key, ref: F.faceRef(s0, hit.fi) }; }
      else if (hit.kind === 'edge') { T = { k: 'edge', body: b.key, ref: F.edgeRef(s0, hit.le) }; if (s.t === PTn) T.t = 0.5; }
      else T = { k: 'vert', body: b.key, ref: F.vertexRef(s0, hit.vi) };
      c.s[s.k] = T;
    } catch (e) { /* ignore */ }
  }
  function onClick(e) {
    const b = e.target.closest('[data-a]'), c = RG.cur; if (!b || !c) return; const a = b.dataset.a, slotEl = b.closest('.slot'), k = slotEl && slotEl.dataset.k;
    if (a === 'pick') { if (c.armed === k) IK.endPick(); else arm(k); }
    else if (a === 'rm') { const arr = c.s[k]; if (arr) { arr.splice(+b.dataset.i, 1); render(); updatePreview(); } }
    else if (a === 'clear') { delete c.s[k]; render(); updatePreview(); }
    else if (a === 'setxyz') { const ins = slotEl.querySelectorAll('.xyz input'), p = [...ins].map((i) => evalNum(i.value)); if (p.some((x) => !isFinite(x))) return toast('Enter three numbers', true); const T = { k: 'xyz', p }, s = slotOf(c, k); if (s.multi) { (c.s[k] = c.s[k] || []).push(T); render(); updatePreview(); } else { c.s[k] = T; render(); updatePreview(); } }
    else if (a === 'cancel') closePanel();
    else if (a === 'ok') create();
  }
  function onChange(e) {
    const t = e.target, c = RG.cur; if (!c) return; const a = t.dataset.a, vk = t.dataset.v;
    if (a === 'mode') { disarm(); c.mode = t.value; c.s = {}; c.msg = null; render(); updatePreview(); const m = modeOf(c), next = m.slots.find((s) => !s.opt && (s.multi ? true : !c.s[s.k])); if (next && !c.edit) arm(next.k); }
    else if (a === 'quick') { const k = t.closest('.slot').dataset.k, T = t.value ? tFromQuick(t.value) : null, s = slotOf(c, k); if (!T) return; if (s.multi) { (c.s[k] = c.s[k] || []).push(T); } else c.s[k] = T; if (c.armed) IK.endPick(); render(); updatePreview(); }
    else if (vk) {
      const m = modeOf(c), def = (m.vals || []).find((v) => v.k === vk);
      if (def.type === 'chk') c.v[vk] = t.checked; else if (def.type === 'sel') c.v[vk] = t.value; else { const n = evalNum(t.value); if (isFinite(n)) c.v[vk] = n; else { t.value = c.v[vk]; return; } }
      if ((m.vals || []).some((v) => v.show)) render(); updatePreview();
    } else if (a === 'name') c.name = t.value.trim();
  }
  function onInput(e) { const t = e.target, c = RG.cur; if (!c) return; if (t.dataset.v && t.type === 'text') { const n = evalNum(t.value); if (isFinite(n)) { c.v[t.dataset.v] = n; updatePreview(); } } }
  function create() {
    const c = RG.cur; if (!c) return; const p = paramsOf(c);
    try { const H = F.H(st.doc); if (c.type.indexOf('ref') === 0) RG.computeRef(c.type, p, c.base, H); else RG.computeCurves(c.type, p, c.base, H); } catch (e) { return toast(e.message || String(e), true); }
    const type = c.type, nm = c.name, edit = c.edit && st.doc.features.find((x) => x.id === c.edit.id); closePanel();   // undo / redo rebuild the document: use the live feature
    if (c.edit && !edit) return toast('That feature no longer exists', true);
    if (edit) { if (nm && nm !== edit.name) edit.name = nm; P.updateFeature(edit, p); status((edit.name) + ' updated'); }
    else { const f = P.commitFeature({ type, params: p, name: nm || undefined }); if (type.indexOf('ref') === 0 && f && !(f._status && f._status.level === 'error')) st.refSel = f.id; }
  }
  RG.openPanel = openPanel; RG.closePanel = closePanel; RG.handlesEdit = (t) => !!SPECS[t]; RG.edit = (f) => openPanel(f.type, { edit: f });
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && RG.cur && RG.cur.armed && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) { e.preventDefault(); IK.endPick(); } if (e.key === 'Escape' && RG.cur && !RG.cur.armed && pan && pan.classList.contains('on') && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) closePanel(); }, true);
  P.hooks.afterRegen.push(() => { if (RG.cur && !RG.cur.edit) { RG.cur.base = st.state; } });

  // ------------------------------------------------------------------ manage list
  let lst = null;
  const GLY = { plane: '▱', axis: '⟋', point: '✛', cs: '⊹' };
  function openList() { if (!lst) { lst = IK.panel('rgl', 'Reference geometry', { top: '56px', left: '14px' }, 340); lst.classList.add('rgl'); lst.body.addEventListener('click', onListClick); lst.body.addEventListener('change', onListChange); } lst.show(); renderList(); }
  function renderList() {
    if (!lst || !lst.isOn()) return; const feats = st.doc.features.filter((f) => RG.REFTYPES.includes(f.type) && st.state.refs.get(f.id));
    let h = '<div class="top"><label><input type="checkbox" data-a="showall"' + (RG.show ? ' checked' : '') + '> Show in the 3D view</label><label><input type="checkbox" data-a="names"' + (RG.names ? ' checked' : '') + '> Names</label></div>';
    if (!feats.length) h += '<div class="empty">No reference geometry yet. Create a plane, axis, point or coordinate system — then sketch on a plane, mirror about it or pattern around an axis.</div>';
    feats.forEach((f) => { const r = st.state.refs.get(f.id), hid = !!f.params.hide; h += '<div class="it' + (st.refSel === f.id ? ' sel' : '') + '" data-id="' + f.id + '"><button class="eye' + (hid ? ' off' : '') + '" data-a="eye" title="' + (hid ? 'Show' : 'Hide') + '">' + (hid ? '○' : '◉') + '</button><span class="g">' + GLY[r.kind] + '</span><span class="n" data-a="sel">' + esc(f.name) + '<small>' + r.kind + '</small></span>' + (r.kind === 'plane' ? '<button data-a="sketch" title="Start a sketch on this plane">Sketch</button>' : '') + '<button data-a="edit" title="Edit">✎</button><button data-a="del" title="Delete">✕</button></div>'; });
    h += '<div class="new"><button data-a="n:refPlane">＋ Plane</button><button data-a="n:refAxis">＋ Axis</button><button data-a="n:refPoint">＋ Point</button><button data-a="n:refCS">＋ Coord. system</button></div>';
    lst.body.innerHTML = h;
  }
  function onListClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, row = b.closest('.it'), f = row && st.doc.features.find((x) => x.id === row.dataset.id);
    if (a.indexOf('n:') === 0) return openPanel(a.slice(2));
    if (!f) return;
    if (a === 'sel') { st.refSel = f.id; st.selFeature = f.id; P.refreshPanels(); P.redraw(); renderList(); }
    else if (a === 'eye') { P.updateFeature(f, Object.assign({}, f.params, { hide: !f.params.hide })); }
    else if (a === 'sketch') RG.sketchOn(f.id);
    else if (a === 'edit') RG.edit(f);
    else if (a === 'del') delFeature(f);
  }
  function onListChange(e) { const a = e.target.dataset.a; if (a === 'showall') { RG.show = e.target.checked; P.redraw(); } else if (a === 'names') { RG.names = e.target.checked; P.redraw(); } }
  function delFeature(f) {
    const users = st.doc.features.filter((g) => g !== f && JSON.stringify(g.params).includes('"' + f.id + '"'));
    if (users.length && !confirm(f.name + ' is used by ' + users.map((u) => u.name).join(', ') + '. Delete anyway? (they will show errors)')) return;
    P.pushUndo(); const i = st.doc.features.indexOf(f); st.doc.features.splice(i, 1); if (st.doc.rollback != null && st.doc.rollback > i) st.doc.rollback--;
    F.invalidate(st.doc, i); if (st.refSel === f.id) st.refSel = null; st.selFeature = null; P.regenerate(); status(f.name + ' deleted');
  }
  P.hooks.afterRegen.push(() => { try { renderList(); } catch (e) { /* ignore */ } });
  RG.openList = openList;

  // ------------------------------------------------------------------ dropdown menus
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function openMenu(anchor, items) {
    closeMenu(); const m = document.createElement('div'); m.className = 'rgmenu';
    m.innerHTML = items.map((it, i) => it === 'sep' ? '<hr>' : it.h ? '<h4>' + esc(it.h) + '</h4>' : '<button data-i="' + i + '" class="' + (it.dim ? 'dim' : '') + '" title="' + esc(it.title || '') + '"><i>' + (it.icon || '') + '</i><span class="t">' + esc(it.label) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span></button>').join('');
    document.body.appendChild(m); menuEl = m;
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight; m.style.left = Math.max(6, Math.min(window.innerWidth - mw - 6, r.left)) + 'px'; m.style.top = Math.min(window.innerHeight - mh - 6, r.bottom + 4) + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const it = items[+b.dataset.i]; closeMenu(); try { it.fn && it.fn(); } catch (err) { toast(err.message || String(err), true); } });
    setTimeout(() => { const off = (e) => { if (menuEl && !menuEl.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  }
  const legacy = (label) => { const g = (P.groups || []).find((x) => x.items.some((i) => i[1] === label)); const it = g && g.items.find((i) => i[1] === label); return it ? it[2] : null; };
  function menuRef(anchor) {
    openMenu(anchor, [{ h: 'Create' },
      { icon: '▱', label: 'Plane…', sub: 'Offset · angle · mid-plane · tangent · 3 points · normal to a curve', fn: () => openPanel('refPlane') },
      { icon: '⟋', label: 'Axis…', sub: 'Two points · edge · cylinder · plane ∩ plane · normal', fn: () => openPanel('refAxis') },
      { icon: '✛', label: 'Point…', sub: 'XYZ · vertex · on edge · face centre · projection', fn: () => openPanel('refPoint') },
      { icon: '⊹', label: 'Coordinate system…', sub: 'Origin + directions, or three points', fn: () => openPanel('refCS') }, 'sep',
      { icon: '☰', label: 'Manage / show & hide…', fn: openList },
      { icon: RG.show ? '◉' : '○', label: (RG.show ? 'Hide' : 'Show') + ' all reference geometry', fn: () => { RG.show = !RG.show; P.redraw(); renderList(); } }]);
  }
  function menuCurves(anchor) {
    const items = [{ h: 'Curves' },
      { icon: '⌇', label: 'Composite curve…', sub: 'Join edges, curves and sketches end to end', fn: () => openPanel('crvComposite') },
      { icon: '⋈', label: 'Intersection curve…', sub: 'Face / body / surface / plane ∩ the same', fn: () => openPanel('crvIntersect') },
      { icon: '∿', label: 'Curve through points…', sub: 'A spline or polyline through vertices and points', fn: () => openPanel('crvThrough') },
      { icon: '⇩', label: 'Projected curve…', sub: 'Onto a face / surface, or sketch on sketch', fn: () => openPanel('crvProject') },
      { icon: '⫽', label: 'Split line…', sub: 'A curve laid on selected faces', fn: () => openPanel('crvSplit') },
      { icon: '⥂', label: 'Offset curve…', sub: 'In its plane or along a direction', fn: () => openPanel('crvOffset') }];
    const old = [['3D sketch', '⌇'], ['Project edges', '⇩'], ['Helix', '∿'], ['Image trace', '▧'], ['Along curve', '⋰']].map(([l, ic]) => ({ l, ic, fn: legacy(l) })).filter((x) => x.fn);
    if (old.length) { items.push('sep', { h: 'Other curve tools' }); old.forEach((x) => items.push({ icon: x.ic, label: x.l, fn: x.fn })); }
    openMenu(anchor, items);
  }

  // ------------------------------------------------------------------ toolbar
  const SV_REF = '<path d="M3 17l5-7h13l-5 7z"/><path d="M12 3v7"/><circle cx="12" cy="13.5" r="1.4" fill="currentColor"/>', SV_CRV = '<path d="M3 18c4-13 8 6 12-5s4-5 6-8"/><circle cx="3" cy="18" r="1.6"/><circle cx="21" cy="5" r="1.6"/>', SV_I3D = '<path d="M12 3l7 4v7l-7 4-7-4V7z"/><path d="M12 11l7-4M12 11v7M12 11L5 7"/><path d="M17 20h4M21 20v-4"/>';
  const items = [
    ['rgGeom', 'Reference ▾', (e) => menuRef(e.currentTarget || document.getElementById('tb-rgGeom')), 'Reference geometry: planes, axes, points and coordinate systems', SV_REF],
    ['rgCurves', 'Curves ▾', (e) => menuCurves(e.currentTarget || document.getElementById('tb-rgCurves')), 'Curves: composite, intersection, through points, projected, split line, offset', SV_CRV],
    ['i3d', 'Instant3D', (e) => { if (RG.i3d) RG.i3d.toggle(); }, 'Instant3D: show a feature’s dimensions on the model and drag them', SV_I3D]
  ];
  ['model', 'part', 'partx', 'assembly', 'sheet', 'surface', 'nurbsx'].forEach((tab) => P.addGroup(tab, 'Reference', tab === 'surface' || tab === 'nurbsx' || tab === 'assembly' || tab === 'sheet' ? items.slice(0, 2) : items, tab === 'model' ? 'Combine' : '^first'));
  const syncTB = () => { const b = document.getElementById('tb-i3d'); if (b) b.classList.toggle('on', !!(RG.i3d && RG.i3d.on)); };
  RG.syncTB = syncTB; new MutationObserver(syncTB).observe(document.getElementById('toolbar'), { childList: true });
  // hovered / previewed geometry highlight (drawn by the painter in part A)
  RG.menuRef = menuRef; RG.menuCurves = menuCurves;
})(typeof window !== 'undefined' ? window : globalThis);
