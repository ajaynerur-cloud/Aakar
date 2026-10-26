/* Aakar 8.20.0 · Wave 1 · JOINTS (Fusion-style)
 *   Joint origins  : named frames on a face / edge / vertex of a component (flip · rotate · offset), drawn as triads
 *   Joint          : connect two joint origins — Rigid · Revolute · Slider · Cylindrical · Ball — zero position = origins coincide
 *   As-built joint : join two components exactly where they already are (no movement), at a picked face / edge / vertex
 *   Motion link    : drive one joint from another (value = ratio × driver + offset), works with the Motion study
 * Joints are real "Mate" features underneath, so the existing Motion study, angle / position limits, drag and BOM keep working.
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM;
  if (!CAD || !P || !CAD.ik || !CAD.ik.X10 || !CAD.ik.x813) { if (G.console) console.warn('Aakar Wave 1 joints: assembly module not found — add-on not loaded'); return; }
  const W1 = G.AAKAR_W1 = G.AAKAR_W1 || { version: '8.20.0' };
  if (W1.joints) return; W1.joints = true;
  const IK = CAD.ik, { st, F, R, v3, $, toast, status, fmt, num, panel } = IK, X10 = IK.X10, X = IK.x813, TT = X10.T, SV = CAD.solver;
  const { tApply, tDir, tInv, tMul, tRotAbout, tMove, rotAxis } = TT;
  const D2R = Math.PI / 180;

  // ================================================================= frame helpers
  const nrm = (a) => v3.norm(a);
  function orthoX(z, x) { z = nrm(z); let xx = v3.sub(x, v3.scale(z, v3.dot(x, z))); if (v3.len(xx) < 1e-6) xx = CAD.math.basis(z).u; return { z, x: nrm(xx) }; }
  const worldOf = (stt, comp, l) => { const T = X10.compT(stt, comp); return { o: tApply(T, l.o), z: nrm(tDir(T, l.z)), x: nrm(tDir(T, l.x)) }; };
  const localOf = (stt, comp, w) => { const Ti = tInv(X10.compT(stt, comp)); return { o: tApply(Ti, w.o), z: nrm(tDir(Ti, w.z)), x: nrm(tDir(Ti, w.x)) }; };
  const yOf = (f) => v3.cross(f.z, f.x);
  const mat = (f) => { const y = yOf(f); return [[f.x[0], y[0], f.z[0]], [f.x[1], y[1], f.z[1]], [f.x[2], y[2], f.z[2]]]; };
  const tpose = (M) => [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
  /** final local frame of a joint-origin feature (flip · rotate about Z · offset in its own axes) */
  function originFrame(p) {
    let o = p.o.slice(), { z, x } = orthoX(p.z, p.x), y = v3.cross(z, x);
    if (p.flip) { z = v3.neg(z); y = v3.neg(y); }
    if (p.rot) { const R2 = rotAxis(z, p.rot * D2R), ap = (v) => TT.mv(R2, v); x = ap(x); y = ap(y); }
    const off = p.off || [0, 0, 0]; o = v3.add(o, v3.add(v3.scale(x, off[0] || 0), v3.add(v3.scale(y, off[1] || 0), v3.scale(z, off[2] || 0))));
    return { o, z: nrm(z), x: nrm(x) };
  }
  const originFeats = () => st.doc.features.slice(0, F.activeCount(st.doc)).filter((f) => f.type === 'w1JOrigin' && !f.suppressed);
  const originById = (id) => originFeats().find((f) => f.id === id) || null;
  const comps = () => (CAD.x10.ui.components ? CAD.x10.ui.components() : []);
  const compName = (src) => { const c = comps().find((k) => k.src === src); return c ? c.name : src; };
  const asmFixed = () => { const m = P.meta(); return (m.asm && m.asm.fixed) || {}; };

  // ================================================================= features (data only) + the mate wrapper
  CAD.featNames = Object.assign(CAD.featNames || {}, { w1JOrigin: 'Joint origin', w1Link: 'Motion link' });
  CAD.featExt.w1JOrigin = (f, s2) => { const p = f.params; if (!X10.compOf(s2, p.comp).bodies.length && !X10.compOf(s2, p.comp).items.length) throw new Error('The component of this joint origin was not found (deleted, or after this step)'); return s2; };
  CAD.featExt.w1Link = (f, s2) => s2;

  const prevMate = CAD.featExt.x10Mate;
  if (prevMate && !prevMate.__w1) {
    CAD.featExt.x10Mate = function (f, s2, h) {
      let ff = f; const p0 = f.params;
      // ---- motion link: this mate's driven value follows another mate
      const doc = st.doc, links = doc.features.filter((g) => g.type === 'w1Link' && !g.suppressed && g.params.driven === f.id);
      if (links.length) {
        const lk = links[0].params, drv = doc.features.find((g) => g.id === lk.driver);
        if (drv && drv.params && X.DRIVER[drv.params.type] && X.DRIVER[p0.type]) {
          const val = num(drv.params[X.DRIVER[drv.params.type]], 0) * num(lk.ratio, 1) + num(lk.offset, 0);
          ff = Object.assign({}, f, { params: Object.assign({}, p0, { [X.DRIVER[p0.type]]: val }) });
        }
      }
      const p = ff.params, w = p.w1;
      if (!w) { const o2 = prevMate(ff, s2, h); if (ff !== f && ff._status) f._status = ff._status; return o2; }
      // ---- joint (origins): refresh the frames from the joint-origin features, then bring B onto A before the stock mate runs
      let cA = p.compA, cB = p.compB, a = p.a, b = p.b, xa = w.xa, xb = w.xb;
      const oa = w.oa && originById(w.oa), ob = w.ob && originById(w.ob);
      if (oa) { const fr = originFrame(oa.params); cA = oa.params.comp; a = { kind: 'axis', n: fr.z, p: fr.o }; xa = fr.x; }
      if (ob) { const fr = originFrame(ob.params); cB = ob.params.comp; b = { kind: 'axis', n: fr.z, p: fr.o }; xb = fr.x; }
      if (!cA || !cB || cA === cB) throw new Error('A joint needs two different components');
      if (!X10.compOf(s2, cA).bodies.length || !X10.compOf(s2, cB).bodies.length) throw new Error('Joint component not found (deleted or after this step)');
      const fx = asmFixed(); let sw = false;
      if (fx[cA] && fx[cB]) throw new Error('Both components are fixed — float one of them (lock icon in the Assembly panel)');
      if (fx[cB] && !fx[cA]) { [cA, cB] = [cB, cA]; [a, b] = [b, a]; [xa, xb] = [xb, xa]; sw = true; }
      const FA = worldOf(s2, cA, { o: a.p, z: a.n, x: xa || CAD.math.basis(a.n).u }), FB = worldOf(s2, cB, { o: b.p, z: b.n, x: xb || CAD.math.basis(b.n).u });
      const A = Object.assign({}, FA), flip = !!w.flip;
      let Ma = mat(A); if (flip) { const y = yOf(A); Ma = [[A.x[0], -y[0], -A.z[0]], [A.x[1], -y[1], -A.z[1]], [A.x[2], -y[2], -A.z[2]]]; }
      const Rm = TT.mm(Ma, tpose(mat(FB)));
      const D0 = tMul(tMove(v3.sub(FA.o, FB.o)), tRotAbout(Rm, FB.o));
      X10.moveComp(s2, cB, D0);
      const params = Object.assign({}, p, { compA: cA, compB: cB, a, b, flip, axial: true });
      if (p.type === 'lock') { const TA = X10.compT(s2, cA), TB = X10.compT(s2, cB); params.rel = tMul(tInv(TA), TB); }
      const f2 = Object.assign({}, ff, { params });
      const out = prevMate(f2, s2, h); if (f2._status) f._status = f2._status;
      if (num(w.slide, 0)) { const FA2 = worldOf(s2, cA, { o: a.p, z: a.n, x: xa || CAD.math.basis(a.n).u }); X10.moveComp(s2, cB, tMove(v3.scale(FA2.z, num(w.slide, 0)))); }
      void sw; return out;
    };
    CAD.featExt.x10Mate.__w1 = true; CAD.featExt.x10Mate.__ik = prevMate.__ik;
  }

  // a driven mate may sit EARLIER in the history than its driver: when the driver changes, regenerate from the driven mate too
  if (F.invalidate && !F.invalidate.__w1) {
    const inv0 = F.invalidate;
    F.invalidate = function (doc, idx) {
      let i = idx;
      try {
        doc.features.forEach((g) => {
          if (g.type !== 'w1Link' || !g.params) return;
          const di = doc.features.findIndex((x) => x.id === g.params.driver), dn = doc.features.findIndex((x) => x.id === g.params.driven);
          if (di >= 0 && dn >= 0 && di >= idx && dn < i) i = dn;
          if (g === doc.features[idx] && dn >= 0 && dn < i) i = dn;
        });
      } catch (e) { /* ignore */ }
      return inv0(doc, i);
    };
    F.invalidate.__w1 = true;
  }

  // ================================================================= picking → world frame
  function frameFromHit(h) {
    const b = h.body, s = b.solid; let o, z, x;
    if (h.kind === 'face') {
      const g = X.faceGeomX(s, h.fi, h.p), c = s.faceCentroid(h.fi);
      if (g.kind === 'axis') { z = nrm(g.n); const t = v3.dot(v3.sub(c, g.p), z); o = v3.madd(g.p, z, t); x = CAD.math.basis(z).u; }
      else if (g.kind === 'plane') { const fr = F.selFrame(s, { type: 'face', faces: [h.fi] }, 'local'); o = c; z = nrm(g.n); x = fr.axes[1]; }
      else { o = g.p; z = [0, 0, 1]; x = [1, 0, 0]; }
    } else if (h.kind === 'edge') {
      const le = h.le, verts = new Map(), cnt = new Map();
      le.segs.forEach(([a, c]) => { verts.set(a, s.V[a]); verts.set(c, s.V[c]); cnt.set(a, (cnt.get(a) || 0) + 1); cnt.set(c, (cnt.get(c) || 0) + 1); });
      const closed = [...cnt.values()].every((n) => n === 2) && verts.size >= 6;
      if (closed) {
        const pts = [...verts.values()]; o = v3.scale(pts.reduce((a, q) => v3.add(a, q), [0, 0, 0]), 1 / pts.length);
        let best = 0, nn = [0, 0, 1]; for (let i = 1; i < pts.length; i++) for (let j = i + 1; j < pts.length; j += Math.max(1, (pts.length / 8) | 0)) { const c = v3.cross(v3.sub(pts[i], o), v3.sub(pts[j], o)), l = v3.len(c); if (l > best) { best = l; nn = c; } }
        z = nrm(nn); const f0 = s.F[le.faces[0]]; if (f0 && Math.abs(v3.dot(f0.n, z)) > 0.9) z = v3.dot(f0.n, z) < 0 ? v3.neg(z) : z; x = CAD.math.basis(z).u;
      } else { const a = s.V[le.segs[0][0]], c = s.V[le.segs[le.segs.length - 1][1]]; o = v3.scale(v3.add(a, c), 0.5); z = nrm(v3.sub(c, a)); x = CAD.math.basis(z).u; }
    } else if (h.kind === 'vertex') {
      o = s.V[h.vi].slice(); const vf = s.vertexFaces()[h.vi] || []; z = vf.length ? nrm(vf.reduce((a, fi) => v3.add(a, s.F[fi].n), [0, 0, 0])) : [0, 0, 1]; if (v3.len(z) < 1e-6) z = [0, 0, 1]; x = CAD.math.basis(z).u;
    } else return null;
    const ox = orthoX(z, x); return { comp: b.src, body: b, world: { o, z: ox.z, x: ox.x } };
  }
  function pickFrame(msg, cb) {
    IK.pickMode(msg, {
      click: (e) => {
        const h = P.pickAt(e.x, e.y); if (!h || !h.body) throw new Error('Click a face, an edge or a vertex of a solid part');
        const fr = frameFromHit(h); if (!fr) throw new Error('Click a face, an edge or a vertex'); IK.endPick(); P.redraw(); cb(fr);
      }
    });
  }

  // ================================================================= commands
  async function cmdOrigin() {
    if (!comps().filter((c) => c.bodies).length) return toast('Create or insert a part first', true);
    pickFrame('JOINT ORIGIN: click a face (flat = its normal · round = its axis), a circular edge (its centre) or a vertex', async (fr) => {
      const loc = localOf(st.state, fr.comp, fr.world), n0 = originFeats().length + 1;
      const base = { comp: fr.comp, o: loc.o, z: loc.z, x: loc.x, name: 'Origin ' + n0 + ' · ' + compName(fr.comp), flip: false, rot: 0, off: [0, 0, 0] };
      const v = await P.dialog('Joint origin — ' + compName(fr.comp), originFields(base), { preview: (vals) => { previewOrigin = Object.assign({}, base, applyOrigin(vals, base)); P.redraw(); return ''; }, onClose: () => { previewOrigin = null; P.redraw(); }, note: 'The blue arrow is the joint axis (Z). Flip reverses it, Rotate turns the X/Y reference about Z, the offsets move the origin in its own axes.' });
      previewOrigin = null; if (!v) return P.redraw();
      const f = P.commitFeature({ type: 'w1JOrigin', params: Object.assign({}, base, applyOrigin(v, base)) }); f.name = f.params.name; P.refreshPanels(); status('Joint origin added'); P.redraw();
    });
  }
  const originFields = (p) => [
    { key: 'name', label: 'Name', type: 'text', value: p.name }, { key: 'flip', label: 'Flip the axis (Z)', type: 'checkbox', value: !!p.flip },
    { key: 'rot', label: 'Rotate about Z (°)', value: p.rot || 0 }, { key: 'ox', label: 'Offset X (mm)', value: (p.off || [])[0] || 0 }, { key: 'oy', label: 'Offset Y (mm)', value: (p.off || [])[1] || 0 }, { key: 'oz', label: 'Offset Z (mm)', value: (p.off || [])[2] || 0 }
  ];
  const applyOrigin = (v, base) => ({ name: v.name || base.name, flip: !!v.flip, rot: isFinite(v.rot) ? v.rot : 0, off: [isFinite(v.ox) ? v.ox : 0, isFinite(v.oy) ? v.oy : 0, isFinite(v.oz) ? v.oz : 0] });
  P.FUI.w1JOrigin = (f) => ({ fields: originFields(f.params), note: 'Edit the joint origin. Joints that use it follow the change.', apply: (v) => Object.assign({}, f.params, applyOrigin(v, f.params)) });

  const JT = [['revolute', 'Revolute (hinge — turns about Z)'], ['slider', 'Slider (slides along Z)'], ['cylindrical', 'Cylindrical (turns and slides along Z)'], ['rigid', 'Rigid (no motion)'], ['ball', 'Ball (rotates about the origin)']];
  const MT = { revolute: 'hinge', slider: 'slider', cylindrical: 'hinge', rigid: 'lock', ball: 'ball' };
  function jointFields(def, originsOpt) {
    const showAng = (v) => v.jt === 'revolute' || v.jt === 'cylindrical', showPos = (v) => v.jt === 'slider' || v.jt === 'cylindrical', lim = (v) => (v.jt === 'revolute' || v.jt === 'slider' || v.jt === 'ball') && v.limOn;
    const out = [{ key: 'name', label: 'Name', type: 'text', value: def.name }];
    if (originsOpt) out.push({ key: 'oa', label: 'Origin A — stays (parent)', value: def.oa, options: originsOpt }, { key: 'ob', label: 'Origin B — moves (child)', value: def.ob, options: originsOpt });
    out.push(
      { key: 'jt', label: 'Joint type', value: def.jt, options: JT },
      { key: 'flip', label: 'Flip (B’s Z points against A’s Z — e.g. a part standing on a face)', type: 'checkbox', value: !!def.flip },
      { key: 'angle', label: 'Angle (°)', value: def.angle || 0, show: showAng }, { key: 'pos', label: 'Slide position (mm)', value: def.pos || 0, show: showPos },
      { key: 'limOn', label: 'Limit the motion', type: 'checkbox', value: !!def.limOn, show: (v) => v.jt === 'revolute' || v.jt === 'slider' || v.jt === 'ball' },
      { key: 'lim0', label: 'Minimum (° or mm)', value: def.lim0 == null ? -90 : def.lim0, show: (v) => lim(v) && v.jt !== 'ball' }, { key: 'lim1', label: 'Maximum (° or mm · cone half-angle for a ball)', value: def.lim1 == null ? 90 : def.lim1, show: lim });
    return out;
  }
  function mateParams(v, fa, fb, compA, compB, oa, ob) {
    const jt = v.jt, mt = MT[jt] || 'hinge', ok = (x) => (isFinite(x) ? +x : 0), kind = jt === 'ball' ? 'point' : 'axis';
    const p = {
      type: mt, compA, compB, a: { kind, n: fa.z, p: fa.o }, b: { kind, n: fb.z, p: fb.o }, offset: 0, flip: !!v.flip, align: false, axial: true, angleDeg: 90, ratio: 1, angle: jt === 'revolute' || jt === 'cylindrical' ? ok(v.angle) : 0, pos: jt === 'slider' ? ok(v.pos) : 0, pitch: 1.5, lift: 10, rx: 0, ry: 0, rz: 0,
      limOn: !!v.limOn && (jt === 'revolute' || jt === 'slider' || jt === 'ball'), lim0: ok(v.lim0), lim1: ok(v.lim1),
      w1: { oa: oa || null, ob: ob || null, xa: fa.x, xb: fb.x, flip: !!v.flip, slide: jt === 'cylindrical' ? ok(v.pos) : 0, jt, name: v.name }
    };
    return p;
  }
  const jointName = (v, cA, cB) => ({ revolute: 'Revolute', slider: 'Slider', cylindrical: 'Cylindrical', rigid: 'Rigid', ball: 'Ball' }[v.jt] || 'Joint') + ': ' + compName(cB) + ' → ' + compName(cA);
  async function cmdJoint() {
    const os = originFeats(); if (os.length < 2) return toast('A joint needs two joint origins on two different parts — use “Joint origin” first (or “As-built joint” to join parts where they are)', true);
    const opt = os.map((o) => [o.id, o.params.name || o.name]), def = { name: '', oa: os[0].id, ob: (os.find((o) => o.params.comp !== os[0].params.comp) || os[1]).id, jt: 'revolute', flip: false, angle: 0, pos: 0, limOn: false, lim0: -90, lim1: 90 };
    const build = (v) => { const A = originById(v.oa), B = originById(v.ob); if (!A || !B) throw new Error('Origin not found'); if (A.params.comp === B.params.comp) throw new Error('The two origins belong to the same part — pick origins on two different parts'); const fa = originFrame(A.params), fb = originFrame(B.params); return { type: 'x10Mate', params: mateParams(v, fa, fb, A.params.comp, B.params.comp, A.id, B.id) }; };
    const v = await P.dialog('Joint', jointFields(def, opt), { preview: (vals) => { try { return P.showPreview(build(vals)); } catch (e) { return e.message; } }, onClose: P.clearPreview, note: 'Part B moves so that origin B lands on origin A (their X axes line up too). The joint then turns / slides from that zero position. It is stored as a Mate, so the Motion study can drive it.' });
    P.clearPreview(); if (!v) return;
    let spec; try { spec = build(v); } catch (e) { return toast(e.message, true); }
    const f = P.commitFeature(spec); f.name = v.name || jointName(v, f.params.compA, f.params.compB); P.refreshPanels();
  }
  function cmdAsBuilt() {
    if (comps().filter((c) => c.bodies).length < 2) return toast('An as-built joint needs two parts', true);
    pickFrame('AS-BUILT JOINT 1/2: click the part that will MOVE (anywhere on it)', (frB) => {
      pickFrame('AS-BUILT JOINT 2/2: click the joint location on the part that STAYS (a round face = its axis, a flat face = its normal, a circular edge = its centre)', async (frA) => {
        if (frA.comp === frB.comp) return toast('Pick a DIFFERENT part for the second click', true);
        const stt = st.state, fa = localOf(stt, frA.comp, frA.world), fb = localOf(stt, frB.comp, frA.world);
        const def = { name: '', jt: 'revolute', flip: false, angle: 0, pos: 0, limOn: false, lim0: -90, lim1: 90 };
        const build = (v) => ({ type: 'x10Mate', params: mateParams(v, fa, fb, frA.comp, frB.comp, null, null) });
        const v = await P.dialog('As-built joint — ' + compName(frB.comp) + ' → ' + compName(frA.comp), jointFields(def, null), { preview: (vals) => { try { return P.showPreview(build(vals)); } catch (e) { return e.message; } }, onClose: P.clearPreview, note: 'Nothing moves when you create the joint: its zero position is the current position of the parts. The axis / point is the one you clicked.' });
        P.clearPreview(); if (!v) return;
        const f = P.commitFeature(build(v)); f.name = 'As-built ' + (v.name || jointName(v, frA.comp, frB.comp)); P.refreshPanels();
      });
    });
  }
  async function cmdLink() {
    const ms = st.doc.features.slice(0, F.activeCount(st.doc)).filter((f) => f.type === 'x10Mate' && X.DRIVER[f.params.type] && !f.suppressed);
    if (ms.length < 2) return toast('A motion link needs two joints / mates that can be driven (hinge, slider, gear, screw…) — create them first', true);
    const opt = ms.map((m) => [m.id, m.name]);
    const v = await P.dialog('Motion link', [
      { key: 'driver', label: 'Driver joint (you move this one)', value: ms[0].id, options: opt }, { key: 'driven', label: 'Driven joint (follows)', value: ms[1].id, options: opt },
      { key: 'ratio', label: 'Ratio  (driven value = ratio × driver value + offset)', value: 1 }, { key: 'offset', label: 'Offset (° or mm)', value: 0 }
    ], { note: 'Example: a hinge (°) driving a slider (mm) with ratio 0.1 → every 10° of the hinge slides the slider 1 mm. The driven joint’s own value is ignored while the link is active; switch the link off (suppress it) to move that joint by hand again. The Motion study drives the driver.' });
    if (!v) return; if (v.driver === v.driven) return toast('Pick two different joints', true);
    if (st.doc.features.some((g) => g.type === 'w1Link' && g.params.driven === v.driver && g.params.driver === v.driven)) return toast('That would make a loop (the other joint already follows this one)', true);
    const f = P.commitFeature({ type: 'w1Link', params: { driver: v.driver, driven: v.driven, ratio: isFinite(v.ratio) ? v.ratio : 1, offset: isFinite(v.offset) ? v.offset : 0 } });
    const nm = (id) => (st.doc.features.find((g) => g.id === id) || {}).name || id; f.name = 'Link: ' + nm(v.driven) + ' = ' + fmt(f.params.ratio, 3) + ' × ' + nm(v.driver); P.refreshPanels();
  }
  P.FUI.w1Link = (f, stt) => {
    const ms = st.doc.features.filter((g) => g.type === 'x10Mate'), opt = ms.length ? ms.map((m) => [m.id, m.name]) : [['', '(no joints)']];
    return { fields: [{ key: 'driver', label: 'Driver joint', value: f.params.driver, options: opt }, { key: 'driven', label: 'Driven joint', value: f.params.driven, options: opt }, { key: 'ratio', label: 'Ratio', value: f.params.ratio }, { key: 'offset', label: 'Offset', value: f.params.offset || 0 }], note: 'driven value = ratio × driver value + offset', apply: (v) => ({ driver: v.driver, driven: v.driven, ratio: isFinite(v.ratio) ? v.ratio : 1, offset: isFinite(v.offset) ? v.offset : 0 }) };
  };

  // ================================================================= viewport: joint-origin triads
  let previewOrigin = null; W1.showOrigins = true;
  function ribbon(arr, p, q, w, c, al, M) {
    const mid = v3.lerp(p, q, 0.5), px = R.pixelSize(mid, M), view = R.cam.ortho ? v3.sub(M.eye, R.cam.target) : v3.sub(M.eye, mid);
    let side = v3.norm(v3.cross(v3.sub(q, p), view)); if (v3.len(side) < 0.5) side = [0, 0, 1]; side = v3.scale(side, w * px / 2);
    const A = v3.sub(p, side), B = v3.add(p, side), C = v3.add(q, side), D = v3.sub(q, side);
    [A, B, C, A, C, D].forEach((x) => arr.push(x[0], x[1], x[2], c[0], c[1], c[2], al));
  }
  function triad(arr, fr, M, hot) {
    const px = R.pixelSize(fr.o, M), L = (hot ? 44 : 34) * px, y = yOf(fr), a = hot ? 4 : 2.6;
    ribbon(arr, fr.o, v3.madd(fr.o, fr.x, L), a, [1, 0.33, 0.36], 1, M); ribbon(arr, fr.o, v3.madd(fr.o, y, L), a, [0.4, 0.86, 0.45], 1, M); ribbon(arr, fr.o, v3.madd(fr.o, fr.z, L * 1.25), a + 0.6, [0.3, 0.6, 1], 1, M);
    const tip = v3.madd(fr.o, fr.z, L * 1.25), { u, v } = CAD.math.basis(fr.z), r = 5 * px;
    for (let k = 0; k < 10; k++) { const a0 = 2 * Math.PI * k / 10, a1 = 2 * Math.PI * (k + 1) / 10, p0 = v3.add(tip, v3.add(v3.scale(u, Math.cos(a0) * r), v3.scale(v, Math.sin(a0) * r))), p1 = v3.add(tip, v3.add(v3.scale(u, Math.cos(a1) * r), v3.scale(v, Math.sin(a1) * r))), ap = v3.madd(tip, fr.z, 11 * px); [p0, p1, ap].forEach((q) => arr.push(q[0], q[1], q[2], 0.3, 0.6, 1, 1)); }
  }
  P.hooks.draw.push((M) => {
    if (st.sketching || !st.state) return; const tri = [], pts = [];
    if (W1.showOrigins) originFeats().forEach((o) => {
      try { if (!X10.compOf(st.state, o.params.comp).bodies.length) return; const fr = worldOf(st.state, o.params.comp, originFrame(o.params)); triad(tri, fr, M, st.selFeature === o.id); pts.push(fr.o[0], fr.o[1], fr.o[2], 1, 0.85, 0.3, 1); } catch (e) { /* ignore */ }
    });
    if (previewOrigin) { try { const fr = worldOf(st.state, previewOrigin.comp, originFrame(previewOrigin)); triad(tri, fr, M, true); pts.push(fr.o[0], fr.o[1], fr.o[2], 1, 1, 1, 1); } catch (e) { /* ignore */ } }
    if (tri.length) R.overlayTris(new Float32Array(tri)); if (pts.length) R.points(new Float32Array(pts), 8, { overlay: true });
  });

  // ================================================================= toolbar
  const IC = {
    jo: '<path d="M12 12V3 M9 6l3-3 3 3 M12 12l7 4 M12 12L5 16"/><circle cx="12" cy="12" r="2.2"/>', jt: '<circle cx="8" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M11 12h3"/>',
    ab: '<rect x="3" y="12" width="8" height="8"/><rect x="13" y="4" width="8" height="8"/><path d="M11 12l2-2" stroke-dasharray="1.5 1.5"/><circle cx="12" cy="11" r="1.5"/>', lk: '<path d="M9 15l6-6 M7 17a3 3 0 0 1 0-4l2-2 M17 7a3 3 0 0 1 0 4l-2 2"/>', eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'
  };
  P.addGroup('assembly', 'Joints', [
    ['w1jo', 'Joint origin', () => cmdOrigin(), 'Joint origin: put a named frame on a face / circular edge / vertex of a part (flip · rotate · offset)', IC.jo],
    ['w1jt', 'Joint', () => cmdJoint(), 'Joint: connect two joint origins — rigid, revolute, slider, cylindrical, ball — with optional limits', IC.jt],
    ['w1ab', 'As-built joint', () => cmdAsBuilt(), 'As-built joint: join two parts exactly where they are now (nothing moves) at a picked axis / point', IC.ab],
    ['w1lk', 'Motion link', () => cmdLink(), 'Motion link: drive one joint from another (ratio × driver + offset)', IC.lk]
  ], 'Mates');
  // no ribbon button (keeps the ribbon short): searchable in Ctrl+K as “Show / hide joint origins”
  P.addGroup('Direct+', 'Joint display', [['w1sh', 'Show / hide joint origins', () => { W1.showOrigins = !W1.showOrigins; P.redraw(); status('Joint origins ' + (W1.showOrigins ? 'shown' : 'hidden')); }, 'Show / hide the joint-origin triads in the 3D view', IC.eye]]);
  W1.jointApi = { cmdOrigin, cmdJoint, cmdAsBuilt, cmdLink, originFrame, worldOf, localOf, mateParams, frameFromHit, originFeats };
  if (G.console) console.info('Aakar Wave 1 · Joints loaded (joint origins, joints, as-built, motion links)');
})(typeof window !== 'undefined' ? window : globalThis);
