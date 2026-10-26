/* Aakar 8.20.0 · Wave 1 · DIRECT EDIT
 *   Gumball (move / plane-move / free-move / rotate / scale on-model handles + numeric panel)
 *   Offset Face (+ tangent chain)        Move / rotate face with auto-heal (numeric)
 *   Scale body (uniform / non-uniform, about centre / origin / base, optional copy)
 *   Select+ : tangent chain, face boundary, tangent faces, select-similar, Ctrl+click select-behind
 * Standalone add-on: load AFTER the Aakar app scripts (the build already inlines it).
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM;
  if (!CAD || !P || !CAD.ik || !CAD.solver) { if (G.console) console.warn('Aakar Wave 1: base app not found — add-on not loaded'); return; }
  if (G.AAKAR_W1 && G.AAKAR_W1.edit) return;
  const IK = CAD.ik, { st, F, R, v3, $, $$, esc, num, clamp, fmt, toast, status } = IK, SV = CAD.solver, SOL = CAD.solid, AD = IK.adv || {};
  const W1 = G.AAKAR_W1 = G.AAKAR_W1 || { version: '8.20.0' };
  W1.edit = true; W1.gumballOn = !!W1.gumballOn;
  const D2R = Math.PI / 180;

  // ================================================================= helpers
  const bodyOf = (k) => P.bodyByKey(k);
  const topoCache = new WeakMap();
  function topo(s) {
    let t = topoCache.get(s);
    if (!t) {
      const les = SV.logicalEdges(s), nb = s.F.map(() => []);
      les.forEach((le) => { const a = le.faces[0], b = le.faces[1]; nb[a].push({ f: b, le }); nb[b].push({ f: a, le }); });
      t = { les, nb }; topoCache.set(s, t);
    }
    return t;
  }
  function leEnds(s, le) {
    const cnt = new Map(); le.segs.forEach(([a, b]) => { cnt.set(a, (cnt.get(a) || 0) + 1); cnt.set(b, (cnt.get(b) || 0) + 1); });
    const ends = [];
    le.segs.forEach(([a, b]) => {
      if (cnt.get(a) === 1) ends.push({ v: a, d: v3.norm(v3.sub(s.V[b], s.V[a])) });
      if (cnt.get(b) === 1) ends.push({ v: b, d: v3.norm(v3.sub(s.V[a], s.V[b])) });
    });
    return ends;
  }
  const TAN_COS = 0.975;           // ~13° : faceted arcs are tangent within half a facet
  function expandFaces(s, idx, mode) {
    const set = new Set(idx);
    if (mode === 'single') return [...set];
    s.F.forEach((f, i) => { if (f.group && idx.some((k) => s.F[k].group === f.group)) set.add(i); });
    if (mode === 'tangent') {
      const T = topo(s), q = [...set];
      while (q.length) {
        const a = q.pop();
        T.nb[a].forEach(({ f }) => {
          if (set.has(f)) return;
          const na = s.F[a].n, nf = s.F[f].n, ga = s.F[a].group, gf = s.F[f].group;
          if (v3.dot(na, nf) > TAN_COS || (ga && ga === gf)) { set.add(f); q.push(f); }
        });
      }
    }
    return [...set];
  }
  function reselectAfter(sel, oldS, newS, xf) {
    const bid = sel.bodyId, body = { type: 'body', bodyId: bid, bodyIds: [bid] };
    if (!sel || sel.type === 'body') return body;
    try {
      const tol = newS.scale() * 1e-4;
      if (sel.type === 'face') {
        const faces = [];
        sel.faces.forEach((fi) => {
          const f = oldS.F[fi]; if (!f) return;
          const c = xf ? xf(oldS.faceCentroid(fi)) : oldS.faceCentroid(fi);
          let best = -1, bd = Infinity;
          newS.F.forEach((g, k) => { const d = v3.dist(c, newS.faceCentroid(k)); if (d < bd && v3.dot(g.n, f.n) > 0.5) { bd = d; best = k; } });
          if (best >= 0 && bd < newS.scale() * 0.6 && !faces.includes(best)) faces.push(best);
        });
        return faces.length ? { type: 'face', bodyId: bid, bodyIds: [bid], faces, offset: false } : body;
      }
      if (sel.type === 'vertex') {
        const verts = [];
        sel.verts.forEach((vi) => { const p = xf ? xf(oldS.V[vi]) : oldS.V[vi]; const k = newS.V.findIndex((q) => v3.dist(p, q) < tol * 20); if (k >= 0) verts.push(k); });
        return verts.length ? { type: 'vertex', bodyId: bid, bodyIds: [bid], verts } : body;
      }
      if (sel.type === 'edge') {
        const les = SV.logicalEdges(newS), edges = [];
        sel.edges.forEach((e) => {
          const a = oldS.V[e.segs[0][0]], b = oldS.V[e.segs[0][1]], m = v3.scale(v3.add(a, b), 0.5), pm = xf ? xf(m) : m;
          let best = null, bd = Infinity;
          les.forEach((l) => l.segs.forEach(([x, y]) => { const d = v3.dist(pm, v3.scale(v3.add(newS.V[x], newS.V[y]), 0.5)); if (d < bd) { bd = d; best = l; } }));
          if (best && bd < newS.scale() * 0.3 && !edges.includes(best)) edges.push(best);
        });
        return edges.length ? { type: 'edge', bodyId: bid, bodyIds: [bid], edges } : body;
      }
    } catch (e) { /* fall through */ }
    return body;
  }

  // ================================================================= FEATURE: Scale body
  function scaleXf(s, k, c) {
    const inv = k.map((x) => 1 / x);
    return F.transformSolid(s, (q) => [c[0] + (q[0] - c[0]) * k[0], c[1] + (q[1] - c[1]) * k[1], c[2] + (q[2] - c[2]) * k[2]], (n) => [n[0] * inv[0], n[1] * inv[1], n[2] * inv[2]], k[0] * k[1] * k[2] < 0);
  }
  function scaleCentre(s, p) {
    const mode = p.cm || (p.c ? 'point' : 'center');
    if (mode === 'origin') return [0, 0, 0];
    if (mode === 'point' && p.c) return p.c.slice();
    const bb = s.bbox(), mn = bb.min || bb[0], mx = bb.max || bb[1];
    if (mode === 'base') return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
    return s.center();
  }
  CAD.featNames = Object.assign(CAD.featNames || {}, { w1Scale: 'Scale body', w1Offset: 'Offset face' });
  CAD.featExt.w1Scale = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found');
    const k = (p.f || [1, 1, 1]).map((x) => +x);
    if (k.some((x) => !isFinite(x) || Math.abs(x) < 1e-4)) throw new Error('Scale factors must be non-zero numbers');
    const out = scaleXf(b.solid, k, scaleCentre(b.solid, p));
    if (p.copy) h.putBodies(s2, f.id, b.name + ' (scaled)', [out], f.id, b.bim); else h.setSolid(s2, b, out);
    return s2;
  };
  P.FUI.w1Scale = (f, stt) => {
    const p = f.params, k = (p.f || [1, 1, 1]).map((x) => +(x * 100).toFixed(4)), uni = Math.abs(k[0] - k[1]) < 1e-9 && Math.abs(k[1] - k[2]) < 1e-9;
    return {
      fields: [
        { key: 'body', label: 'Solid', value: p.body, optionsFn: () => AD.bodyOpts(stt) },
        { key: 'uni', label: 'Uniform scale (same % on X, Y, Z)', type: 'checkbox', value: p.uni != null ? !!p.uni : uni },
        { key: 'sx', label: 'Scale X (%)', value: k[0] },
        { key: 'sy', label: 'Scale Y (%)', value: k[1], show: (v) => !v.uni },
        { key: 'sz', label: 'Scale Z (%)', value: k[2], show: (v) => !v.uni },
        { key: 'cm', label: 'Scale about', value: p.cm || 'center', options: [['center', 'Centre of the solid'], ['base', 'Centre of the base (lowest point)'], ['origin', 'Model origin (0,0,0)']] },
        { key: 'copy', label: 'Keep the original (scale a copy)', type: 'checkbox', value: !!p.copy }
      ],
      note: 'Non-uniform scale stretches planar faces correctly; curved faces stay smooth. A negative percentage mirrors the solid. Scaling is recorded as a feature, so you can edit the percentages later.',
      apply: (v) => { const x = (isFinite(v.sx) ? v.sx : 100) / 100, y = v.uni ? x : (isFinite(v.sy) ? v.sy : 100) / 100, z = v.uni ? x : (isFinite(v.sz) ? v.sz : 100) / 100; return { body: v.body, f: [x, y, z], uni: !!v.uni, cm: v.cm, copy: !!v.copy }; }
    };
  };
  async function cmdScale() {
    const sel = st.sel, b = sel && sel.bodyId ? bodyOf(sel.bodyId) : (st.bodies.filter((x) => x.visible).length === 1 ? st.bodies.find((x) => x.visible) : null);
    if (!b) return toast('Select the solid to scale first', true);
    const f = await P.createViaFUI('w1Scale', 'Scale body', { body: b.key, f: [1.5, 1.5, 1.5], uni: true, cm: 'center', copy: false });
    if (f) { f.name = 'Scale ' + f.params.f.map((x) => fmt(x * 100, 0)).join('/') + '%'; P.refreshPanels(); }
  }

  // ================================================================= FEATURE: Offset face
  CAD.featExt.w1Offset = (f, s2, h) => {
    const p = f.params, b = s2.bodies.get(p.body); if (!b) throw new Error('Body not found');
    const s = b.solid, idx = [];
    (p.faces || []).forEach((r) => { const i = F.resolveFace(s, r); if (i >= 0 && !idx.includes(i)) idx.push(i); });
    if (!idx.length) throw new Error('The faces to offset were not found');
    const dist = +p.dist; if (!isFinite(dist)) throw new Error('Offset distance is not a number');
    if (Math.abs(dist) < 1e-9) { h.setSolid(s2, b, s); return s2; }
    const set = expandFaces(s, idx, p.chain || 'group'), ov = new Map();
    set.forEach((fi) => { const fc = s.F[fi]; ov.set(fi, { n: fc.n.slice(), d: fc.d + dist }); });
    let out = SV.relax(s, ov, new Map()); const v = SV.validate(out, s);
    if (!v.ok) throw new Error('Offset not possible here: ' + String(v.reason).replace('would ', 'it would '));
    out = SV.planarize(out).solid; out = SV.heal(out);
    h.setSolid(s2, b, out); return s2;
  };
  P.FUI.w1Offset = (f, stt) => {
    const p = f.params;
    return {
      fields: [
        { key: 'body', label: 'Solid', value: p.body, optionsFn: () => AD.bodyOpts(stt) },
        { key: 'dist', label: 'Offset distance (mm)  + adds material · − removes', value: p.dist == null ? 2 : p.dist },
        { key: 'chain', label: 'Which faces move', value: p.chain || 'group', options: [['single', 'Only the picked faces'], ['group', 'Whole curved patch (a full hole wall, boss, fillet…)'], ['tangent', 'Tangent chain (also faces that flow smoothly into them)']] }
      ],
      note: 'Offset Face pushes or pulls faces along their normals and heals the neighbours: planar neighbours extend or trim, curved patches grow or shrink their radius. The picked faces are remembered, so the offset stays editable.',
      apply: (v) => Object.assign({}, p, { body: v.body, dist: isFinite(v.dist) ? v.dist : 0, chain: v.chain })
    };
  };
  async function cmdOffsetFace() {
    const sel = st.sel; if (!sel || sel.type !== 'face') return toast('Select one or more faces first (click a face; Shift-click adds). Use Select+ to grab a tangent chain or similar faces.', true);
    const b = bodyOf(sel.bodyId); if (!b) return;
    const refs = sel.faces.map((fi) => F.faceRef(b.solid, fi));
    const f = await P.createViaFUI('w1Offset', 'Offset face', { body: b.key, faces: refs, dist: 2, chain: sel.offset ? 'group' : 'single' });
    if (f) { f.name = 'Offset face ' + fmt(f.params.dist, 2) + ' mm'; P.refreshPanels(); }
  }

  // ================================================================= commit helpers (directEdit / scale)
  function selRefOf(b, sel) { return sel.type === 'body' ? { type: 'body' } : F.selToRef(b.solid, sel); }
  function commitDirect(sel, fr, t, r, label) {
    const ids = sel.type === 'body' && sel.bodyIds && sel.bodyIds.length > 1 ? sel.bodyIds.slice() : [sel.bodyId], made = [];
    ids.forEach((id, n) => {
      const b = bodyOf(id); if (!b) return;
      const s1 = sel.type === 'body' ? { type: 'body', bodyId: id, bodyIds: [id] } : sel;
      const params = { body: id, sel: selRefOf(b, s1), frame: sel.type === 'body' ? 'world' : st.frame, axes: fr.axes.map((a) => a.slice()), n0: fr.primary ? fr.primary.slice() : null, t, r, adaptive: st.adaptive };
      const f = P.commitFeature({ type: 'directEdit', params }, true); f.name = label; made.push(f);
    });
    return made;
  }
  function commitScale(sel, k, c, copy) {
    const ids = sel.bodyIds && sel.bodyIds.length > 1 ? sel.bodyIds.slice() : [sel.bodyId];
    ids.forEach((id) => { const f = P.commitFeature({ type: 'w1Scale', params: { body: id, f: k.slice(), uni: Math.abs(k[0] - k[1]) < 1e-12 && Math.abs(k[1] - k[2]) < 1e-12, cm: 'point', c: c.slice(), copy: !!copy } }, true); f.name = 'Scale ' + k.map((x) => fmt(x * 100, 0)).join('/') + '%'; });
  }

  // ================================================================= GUMBALL
  const GZ = { arrow: 130, start: 30, ring: 84, plane0: 30, plane1: 58, cube: 7.5, scaleAt: 78, uniAt: 56, free: 8 };
  const COL = [[1, 0.33, 0.36], [0.4, 0.86, 0.45], [0.3, 0.6, 1]], COLU = [[0.24, 0.72, 1], [1, 0.33, 0.36], [0.4, 0.86, 0.45]];
  const HOT = [1, 0.92, 0.35];
  let hover = null, GD = null;
  const frameNow = () => {
    const sel = st.sel; if (!sel || !sel.bodyId) return null;
    const b = bodyOf(sel.bodyId); if (!b) return null;
    let fr; try { fr = F.selFrame(b.solid, sel.type === 'body' ? { type: 'body' } : sel, st.frame); } catch (e) { return null; }
    return fr ? { b, fr, sel } : null;
  };
  const active = () => W1.gumballOn && !st.sketching && !document.body.classList.contains('overlay') && !document.body.classList.contains('ik-picking') && !document.body.classList.contains('x10-picking') && !st.previewState;
  function layout(M, ctx) {
    const pv = (GD && GD.pivotNow) || ctx.fr.pivot, px = R.pixelSize(pv, M), ax = ctx.fr.axes, cols = ctx.fr.labels[0] === 'X' ? COL : COLU, items = [];
    items.push({ id: 'free', kind: 'free', pos: pv, r: GZ.free });
    [[0, 1, 2], [0, 2, 1], [1, 2, 0]].forEach(([i, j, k]) => {
      const a = v3.scale(ax[i], px), b = v3.scale(ax[j], px), o = pv, c = (m, n) => v3.add(o, v3.add(v3.scale(a, m), v3.scale(b, n)));
      items.push({ id: 'p' + k, kind: 'p', k, i, j, col: cols[k], quad: [c(GZ.plane0, GZ.plane0), c(GZ.plane1, GZ.plane0), c(GZ.plane1, GZ.plane1), c(GZ.plane0, GZ.plane1)], normal: ax[k] });
    });
    ax.forEach((a, i) => items.push({ id: 't' + i, kind: 't', i, dir: a, col: cols[i], a: v3.madd(pv, a, GZ.start * px), b: v3.madd(pv, a, GZ.arrow * px), px }));
    if (ctx.sel.type === 'body') {
      ax.forEach((a, i) => items.push({ id: 's' + i, kind: 's', i, dir: a, col: cols[i], pos: v3.madd(pv, a, -GZ.scaleAt * px), px }));
      const diag = v3.norm(v3.add(v3.add(ax[0], ax[1]), ax[2]));
      items.push({ id: 'su', kind: 'u', pos: v3.madd(pv, diag, -GZ.uniAt * px), px, col: [1, 0.72, 0.2] });
    }
    if (ctx.fr.rot !== false) ax.forEach((a, i) => {
      const { u, v } = CAD.math.basis(a), pts = [], rr = GZ.ring * px;
      for (let k = 0; k <= 64; k++) { const t = 2 * Math.PI * k / 64; pts.push(v3.add(pv, v3.add(v3.scale(u, Math.cos(t) * rr), v3.scale(v, Math.sin(t) * rr)))); }
      items.push({ id: 'r' + i, kind: 'r', i, dir: a, col: cols[i], pts, px });
    });
    return { pivot: pv, px, items, axes: ax };
  }
  function ribbon(arr, p, q, w, c, al, M) {
    const mid = v3.lerp(p, q, 0.5), px = R.pixelSize(mid, M), view = R.cam.ortho ? v3.sub(M.eye, R.cam.target) : v3.sub(M.eye, mid);
    let side = v3.norm(v3.cross(v3.sub(q, p), view)); if (v3.len(side) < 0.5) side = [0, 0, 1];
    side = v3.scale(side, w * px / 2);
    const A = v3.sub(p, side), B = v3.add(p, side), C = v3.add(q, side), D = v3.sub(q, side);
    [A, B, C, A, C, D].forEach((x) => arr.push(x[0], x[1], x[2], c[0], c[1], c[2], al));
  }
  const tri3 = (arr, a, b, c, col, al) => [a, b, c].forEach((x) => arr.push(x[0], x[1], x[2], col[0], col[1], col[2], al));
  function cube(arr, c0, half, ax, col, al) {
    const s = (a, b, c) => v3.add(c0, v3.add(v3.scale(ax[0], a * half), v3.add(v3.scale(ax[1], b * half), v3.scale(ax[2], c * half))));
    const P8 = [s(-1, -1, -1), s(1, -1, -1), s(1, 1, -1), s(-1, 1, -1), s(-1, -1, 1), s(1, -1, 1), s(1, 1, 1), s(-1, 1, 1)];
    [[0, 1, 2, 3, 0.55], [4, 5, 6, 7, 1], [0, 1, 5, 4, 0.75], [2, 3, 7, 6, 0.65], [1, 2, 6, 5, 0.85], [3, 0, 4, 7, 0.7]].forEach(([a, b, c, d, k]) => {
      const cc = col.map((x) => x * k); tri3(arr, P8[a], P8[b], P8[c], cc, al); tri3(arr, P8[a], P8[c], P8[d], cc, al);
    });
  }
  P.hooks.draw.push((M) => {
    if (!active()) return; const ctx = frameNow(); if (!ctx) return;
    const L = layout(M, ctx), tri = [], isHot = (id) => (GD && GD.id === id) || (!GD && hover === id);
    L.items.forEach((it) => {
      const hot = isHot(it.id), c = hot ? HOT : it.col;
      if (it.kind === 't') {
        ribbon(tri, it.a, it.b, hot ? 5 : 3.5, c, 1, M);
        const tip = v3.madd(it.b, it.dir, 20 * it.px), { u, v } = CAD.math.basis(it.dir), r = 7.5 * it.px;
        for (let k = 0; k < 12; k++) {
          const a0 = 2 * Math.PI * k / 12, a1 = 2 * Math.PI * (k + 1) / 12, p0 = v3.add(it.b, v3.add(v3.scale(u, Math.cos(a0) * r), v3.scale(v, Math.sin(a0) * r))), p1 = v3.add(it.b, v3.add(v3.scale(u, Math.cos(a1) * r), v3.scale(v, Math.sin(a1) * r)));
          tri3(tri, p0, p1, tip, c, 1); tri3(tri, p0, p1, it.b, c.map((x) => x * 0.7), 1);
        }
      } else if (it.kind === 'p') {
        const q = it.quad; tri3(tri, q[0], q[1], q[2], c, hot ? 0.85 : 0.5); tri3(tri, q[0], q[2], q[3], c, hot ? 0.85 : 0.5);
        for (let k = 0; k < 4; k++) ribbon(tri, q[k], q[(k + 1) % 4], 1.6, c, 1, M);
      } else if (it.kind === 'r') {
        for (let k = 0; k < it.pts.length - 1; k++) ribbon(tri, it.pts[k], it.pts[k + 1], hot ? 4.5 : 2.4, c, hot ? 1 : 0.85, M);
      } else if (it.kind === 's') {
        ribbon(tri, v3.madd(L.pivot, it.dir, -GZ.start * L.px * 0.6), it.pos, 1.6, c, 0.8, M);
        cube(tri, it.pos, (hot ? GZ.cube + 1.5 : GZ.cube) * L.px / 1.2, L.axes, c, 1);
      } else if (it.kind === 'u') {
        cube(tri, it.pos, (hot ? GZ.cube + 2.5 : GZ.cube + 1) * L.px / 1.2, L.axes, hot ? HOT : [1, 0.72, 0.2], 1);
      }
    });
    if (tri.length) R.overlayTris(new Float32Array(tri));
    const fr = isHot('free');
    R.points(new Float32Array([L.pivot[0], L.pivot[1], L.pivot[2], fr ? 1 : 0.98, fr ? 0.92 : 0.98, fr ? 0.35 : 0.98, 1]), fr ? 13 : 10, { overlay: true });
  });
  // ----- hit testing
  const sd2 = P.distSeg2;
  function inQuad(pt, q) { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], cr = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); if (cr !== 0) { if (s === 0) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false; } } return true; }
  function hitTest(x, y) {
    if (!active()) return null; const ctx = frameNow(); if (!ctx) return null;
    const M = R.matrices(), L = layout(M, ctx), pr = (p) => R.project(p, M); let best = null;
    const consider = (it, d, pri) => { const sc = d - pri; if (!best || sc < best.sc) best = { it, sc, ctx, L }; };
    L.items.forEach((it) => {
      if (it.kind === 'free') { const q = pr(it.pos); if (q[3] > 0) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < 10) consider(it, d, 6); } }
      else if (it.kind === 'p') { const q = it.quad.map(pr); if (q.every((z) => z[3] > 0) && inQuad([x, y], q)) consider(it, 0, 3); }
      else if (it.kind === 't') { const a = pr(it.a), b = pr(v3.madd(it.b, it.dir, 20 * it.px)); if (a[3] > 0 && b[3] > 0) { const d = sd2([x, y], a, b).d; if (d < 8) consider(it, d, 2); } }
      else if (it.kind === 's' || it.kind === 'u') { const q = pr(it.pos); if (q[3] > 0) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < 11) consider(it, d, 4); } }
      else if (it.kind === 'r') { let d = Infinity; for (let k = 0; k < it.pts.length - 1; k++) { const a = pr(it.pts[k]), b = pr(it.pts[k + 1]); if (a[3] > 0 && b[3] > 0) d = Math.min(d, sd2([x, y], a, b).d); } if (d < 7) consider(it, d, 0); }
    });
    return best;
  }
  // ----- drag maths
  function axisParam(ray, p, a) { const w0 = v3.sub(p, ray.o), b = v3.dot(a, ray.d), d = v3.dot(a, w0), e = v3.dot(ray.d, w0), den = 1 - b * b; if (den < 1e-6) return null; return (b * e - d) / den; }
  function rayPlane(ray, p, n) { const den = v3.dot(ray.d, n); if (Math.abs(den) < 1e-9) return null; const t = v3.dot(v3.sub(p, ray.o), n) / den; return v3.madd(ray.o, ray.d, t); }
  function screenAngle(x, y, pivot, axis, M) { const p = R.project(pivot, M), a = Math.atan2(-(y - p[1]), x - p[0]), toEye = R.cam.ortho ? v3.sub(M.eye, R.cam.target) : v3.sub(M.eye, pivot); return v3.dot(axis, toEye) >= 0 ? a : -a; }
  const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
  function startDrag(h, x, y) {
    const { it, ctx, L } = h, M = R.matrices(), ray = R.ray(x, y, M), pv = L.pivot;
    GD = { id: it.id, it, ctx, pivot: pv, pivotNow: pv, axes: L.axes, base: ctx.b.solid, sel: ctx.sel, fr: ctx.fr, bodyId: ctx.sel.bodyId, x0: x, y0: y, tv: [0, 0, 0], rotI: -1, rotA: 0, k: [1, 1, 1], moved: false, ok: true };
    if (it.kind === 't') { GD.p0 = axisParam(ray, pv, it.dir); if (GD.p0 == null) GD.screen = true; }
    else if (it.kind === 'p') { GD.h0 = rayPlane(ray, pv, it.normal); }
    else if (it.kind === 'free') { GD.vn = v3.norm(R.cam.ortho ? v3.sub(M.eye, R.cam.target) : v3.sub(M.eye, pv)); GD.h0 = rayPlane(ray, pv, GD.vn); }
    else if (it.kind === 'r') { GD.aPrev = screenAngle(x, y, pv, it.dir, M); GD.acc = 0; }
    else if (it.kind === 's') { GD.p0 = axisParam(ray, pv, v3.neg(it.dir)); if (GD.p0 == null || Math.abs(GD.p0) < 1e-9) GD.p0 = it.px * GZ.scaleAt; }
    else if (it.kind === 'u') { const q = R.project(pv, M); GD.d0 = Math.max(8, Math.hypot(x - q[0], y - q[1])); }
    st.drag = null; st.sel && (st.preview = null);
    P.redraw();
  }
  function updateDrag(x, y, shift) {
    const d = GD, it = d.it, M = R.matrices(), ray = R.ray(x, y, M), snapOn = st.snapOn && !shift; let label = '', tv = null, txt = '';
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 3) return; d.moved = true;
    const step = st.snapStep;
    if (it.kind === 't') {
      let s; if (d.screen) { const pp = R.project(d.pivot, M), pq = R.project(v3.add(d.pivot, it.dir), M), dir = [pq[0] - pp[0], pq[1] - pp[1]], Ln = Math.hypot(dir[0], dir[1]) || 1; s = ((x - d.x0) * dir[0] + (y - d.y0) * dir[1]) / (Ln * Ln); }
      else { const p = axisParam(ray, d.pivot, it.dir); if (p == null) return; s = p - d.p0; }
      if (snapOn) s = snapTo(s, step); tv = v3.scale(it.dir, s); txt = (s >= 0 ? '+' : '') + fmt(s) + ' mm';
    } else if (it.kind === 'p' || it.kind === 'free') {
      const n = it.kind === 'p' ? it.normal : d.vn, h = rayPlane(ray, d.pivot, n); if (!h || !d.h0) return;
      let dv = v3.sub(h, d.h0);
      if (snapOn && step > 0 && it.kind === 'p') dv = v3.add(v3.scale(d.axes[it.i], snapTo(v3.dot(dv, d.axes[it.i]), step)), v3.scale(d.axes[it.j], snapTo(v3.dot(dv, d.axes[it.j]), step)));
      else if (snapOn && step > 0) dv = v3.add(v3.scale(d.axes[0], snapTo(v3.dot(dv, d.axes[0]), step)), v3.add(v3.scale(d.axes[1], snapTo(v3.dot(dv, d.axes[1]), step)), v3.scale(d.axes[2], snapTo(v3.dot(dv, d.axes[2]), step))));
      tv = dv; txt = 'Δ ' + fmt(v3.dot(dv, d.axes[0])) + ', ' + fmt(v3.dot(dv, d.axes[1])) + ', ' + fmt(v3.dot(dv, d.axes[2]));
    } else if (it.kind === 'r') {
      const a = screenAngle(x, y, d.pivot, it.dir, M); let da = a - d.aPrev; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      d.acc += da; d.aPrev = a; let s = d.acc; if (snapOn && st.angStep > 0) s = snapTo(s, st.angStep * D2R);
      d.rotI = it.i; d.rotA = s; txt = fmt(s / D2R, 1) + '°';
    } else if (it.kind === 's') {
      const p = axisParam(ray, d.pivot, v3.neg(it.dir)); if (p == null) return; let f = p / d.p0; if (snapOn) f = snapTo(f, 0.05); if (Math.abs(f) < 0.01) f = f < 0 ? -0.01 : 0.01;
      d.k = [1, 1, 1]; if (shift || (ray && false)) d.k = [f, f, f]; else d.k[it.i] = f; txt = d.k.map((q) => fmt(q * 100, 0)).join(' / ') + ' %';
    } else if (it.kind === 'u') {
      const q = R.project(d.pivot, M); let f = Math.hypot(x - q[0], y - q[1]) / d.d0; if (snapOn) f = snapTo(f, 0.05); if (f < 0.01) f = 0.01; d.k = [f, f, f]; txt = fmt(f * 100, 0) + ' %';
    }
    if (tv) d.tv = tv;
    // ---- preview
    let res = null, warn = '';
    try {
      const sel = d.sel.type === 'body' ? { type: 'body' } : d.sel;
      if (it.kind === 's' || it.kind === 'u') { res = { solid: scaleXf(d.base, d.k, d.pivot), mode: 'rigid-body' }; }
      else if (it.kind === 'r') { res = SV.guardedEdit(d.base, sel, () => ({ axis: it.dir, angle: d.rotA, pivot: d.pivot }), 1, 0, { adaptive: st.adaptive }); }
      else { res = SV.guardedEdit(d.base, sel, () => ({ t: d.tv, pivot: d.pivot }), 1, 0, { adaptive: st.adaptive }); }
      if (res.clamped) warn = '  ⚠ ' + res.reason;
      d.ok = !(res.s != null && res.s < 1e-9 && res.clamped);
    } catch (e) { d.ok = false; warn = '  ⚠ ' + e.message; }
    if (res && d.ok) { st.preview = { bodyId: d.bodyId, solid: res.solid, mode: res.mode }; d.last = res; }
    else st.preview = d.last ? { bodyId: d.bodyId, solid: d.last.solid, mode: d.last.mode } : null;
    d.txt = txt;
    P.setDim(txt + warn, !!warn, d.pivot); P.redraw();
  }
  function endDrag() {
    const d = GD; GD = null; $('#dimLabel') && $('#dimLabel').classList.add('hidden');
    const pv = st.preview; st.preview = null;
    if (!d || !d.moved || !pv || !d.last) { P.redraw(); return; }
    const it = d.it, sel = d.sel, oldS = d.base;
    let xf = null;
    if (it.kind === 's' || it.kind === 'u') { commitScale(sel, d.k, d.pivot, false); status('Scaled ' + d.txt + ' — recorded as a feature'); }
    else {
      const t = [0, 0, 0], r = [0, 0, 0];
      if (it.kind === 'r') { r[it.i] = +(d.rotA / D2R).toFixed(6); xf = SV.makeXf({ axis: it.dir, angle: d.rotA, pivot: d.pivot }).p; }
      else { [0, 1, 2].forEach((i) => { t[i] = +v3.dot(d.tv, d.axes[i]).toFixed(6); }); xf = (q) => v3.add(q, d.tv); }
      const what = sel.type === 'face' ? 'Face' : sel.type === 'edge' ? 'Edge' : sel.type === 'vertex' ? 'Vertex' : 'Body';
      commitDirect(sel, d.fr, t, r, (it.kind === 'r' ? 'Rotate ' : 'Move ') + what.toLowerCase());
      status((it.kind === 'r' ? 'Rotate ' : 'Move ') + what.toLowerCase() + ' ' + d.txt + ' — recorded');
    }
    const nb = bodyOf(sel.bodyId); st.sel = nb ? reselectAfter(sel, oldS, nb.solid, xf) : null;
    P.refreshPanels(); P.redraw(); renderGP();
  }
  // ----- hooks (chained)
  const prevDown = P.hooks.pointerDown, prevMove = P.hooks.pointerMove, prevUp = P.hooks.pointerUp, prevKey = P.hooks.keydown;
  P.hooks.pointerDown = (x, y, e) => {
    if (e.button === 0 && e.ctrlKey && !e.shiftKey && !e.altKey && !st.sketching && !document.body.classList.contains('ik-picking') && !document.body.classList.contains('x10-picking')) { if (selectBehind(x, y)) return true; }
    if (e.button === 0 && active()) { const h = hitTest(x, y); if (h) { startDrag(h, x, y); return true; } }
    return prevDown ? prevDown(x, y, e) : false;
  };
  P.hooks.pointerMove = (x, y, e) => {
    if (GD) { updateDrag(x, y, e.shiftKey); return true; }
    if (active()) { const h = hitTest(x, y), id = h ? h.it.id : null; if (id !== hover) { hover = id; P.redraw(); } IK.cv && (IK.cv.style.cursor = h ? 'grab' : IK.cv.style.cursor); if (h) return true; }
    else if (hover) { hover = null; }
    return prevMove ? prevMove(x, y, e) : false;
  };
  P.hooks.pointerUp = (x, y, e) => { if (GD) { endDrag(); return true; } return prevUp ? prevUp(x, y, e) : false; };
  P.hooks.keydown = (e) => {
    if (GD && e.key === 'Escape') { GD = null; st.preview = null; $('#dimLabel') && $('#dimLabel').classList.add('hidden'); P.redraw(); return true; }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase(), run = (f) => { e.preventDefault(); f(); return true; };
      if (k === 'g') return run(toggleGumball); if (k === 't') return run(() => selCmd('chain')); if (k === 'l') return run(() => selCmd('boundary'));
      if (k === 'f') return run(() => selCmd('tangentFaces')); if (k === 's') return run(() => selCmd('similarNormal')); if (k === 'o') return run(cmdOffsetFace);
    }
    return prevKey ? prevKey(e) : false;
  };
  // gizmo suppression (the base app's own handles are replaced while the Gumball is on)
  const g0 = P.gizmoHandles; // eslint-disable-line no-unused-vars
  function toggleGumball(on) {
    W1.gumballOn = on == null || typeof on === 'object' ? !W1.gumballOn : !!on;
    const b = $('#tb-w1g'); if (b) b.classList.toggle('on', W1.gumballOn); $$('.w1dk-g').forEach((x) => x.classList.toggle('on', W1.gumballOn));
    hover = null; P.redraw(); status(W1.gumballOn ? 'Gumball ON — drag arrows (move), squares (plane move), rings (rotate), cubes (scale; Shift = uniform). Alt+G toggles · “Move ▸ numeric” for exact values.' : 'Gumball OFF — standard handles');
  }

  // ----- numeric Gumball panel (precise move / rotate / scale for the current selection)
  const gp = IK.panel('w1-gumball', '✥ <i>Gumball</i> · numeric', { top: '96px', right: '84px' });
  const GV = { t: [0, 0, 0], r: [0, 0, 0], s: [100, 100, 100], uni: true, copy: false };
  function renderGP() {
    if (!gp.isConnected) return;
    const ctx = frameNow(), kind = ctx ? ctx.sel.type : null, ax = ctx ? ctx.fr.labels : ['X', 'Y', 'Z'];
    const row = (lab, k, arr) => '<div class="row"><label>' + lab + '</label>' + [0, 1, 2].map((i) => '<input type="number" step="any" data-g="' + k + i + '" value="' + arr[i] + '" style="width:62px" title="' + ax[i] + '">').join(' ') + '</div>';
    gp.body.innerHTML = '<p class="note" style="margin:0 0 6px">' + (ctx ? 'Acting on the selected <b>' + kind + '</b> in its ' + (st.frame === 'local' && kind !== 'body' ? 'local' : 'world') + ' frame (axes ' + ax.join(' / ') + ').' : 'Select a body, face, edge or vertex.') + '</p>' +
      row('Move (mm)', 't', GV.t) + '<div class="row"><button class="btn" data-gb="move">Apply move</button></div>' +
      row('Rotate (°)', 'r', GV.r) + '<div class="row"><button class="btn" data-gb="rot">Apply rotate</button></div>' +
      (kind === 'body' ? '<div class="row"><label>Scale (%)</label>' + [0, 1, 2].map((i) => '<input type="number" step="any" data-g="s' + i + '" value="' + GV.s[i] + '" style="width:62px">').join(' ') + '</div><div class="row"><label><input type="checkbox" data-g="uni" ' + (GV.uni ? 'checked' : '') + '> uniform (X drives all)</label> <label><input type="checkbox" data-g="copy" ' + (GV.copy ? 'checked' : '') + '> copy</label></div><div class="row"><button class="btn" data-gb="scale">Apply scale</button></div>' : '') +
      '<p class="note">Move and rotate are stored as a <b>Move</b> feature with auto-heal (neighbouring faces extend, trim or tilt). Alt+G toggles the on-model gumball.</p>';
    $$('[data-g]', gp.body).forEach((el) => { el.onchange = () => { const k = el.dataset.g; if (k === 'uni' || k === 'copy') GV[k] = el.checked; else GV[k[0]][+k[1]] = num(el.value, k[0] === 's' ? 100 : 0); }; });
    $$('[data-gb]', gp.body).forEach((b) => { b.onclick = () => applyNumeric(b.dataset.gb); });
  }
  function applyNumeric(kind) {
    if (kind === 'scaledlg') return cmdScale();
    const ctx = frameNow(); if (!ctx) return toast('Select something first', true);
    const { sel, fr, b } = ctx, oldS = b.solid; let xf = null;
    try {
      if (kind === 'scale') {
        const k = GV.uni ? [GV.s[0] / 100, GV.s[0] / 100, GV.s[0] / 100] : GV.s.map((x) => x / 100);
        commitScale(sel, k, fr.pivot, GV.copy);
      } else {
        const t = GV.t.slice(), r = GV.r.slice(), z = (a) => a.every((x) => !x);
        if (kind === 'move') { if (z(t)) return toast('Enter a move distance', true); r[0] = r[1] = r[2] = 0; xf = (q) => v3.add(q, [0, 1, 2].reduce((a, i) => v3.madd(a, fr.axes[i], t[i]), [0, 0, 0])); }
        else { if (z(r)) return toast('Enter a rotation angle', true); t[0] = t[1] = t[2] = 0; }
        commitDirect(sel, fr, t, r, (kind === 'move' ? 'Move ' : 'Rotate ') + sel.type);
      }
    } catch (e) { return toast(e.message, true); }
    const nb = bodyOf(sel.bodyId); st.sel = nb ? reselectAfter(sel, oldS, nb.solid, xf) : null; P.refreshPanels(); P.redraw(); renderGP();
  }
  gp.onclose = () => { renderGP(); };
  P.hooks.afterRegen.push(() => { if (gp.classList.contains('on')) setTimeout(renderGP, 60); });
  P.hooks.clearSel.push(() => { if (gp.classList.contains('on')) setTimeout(renderGP, 60); });

  // ================================================================= SELECT+
  function setSel(s) { st.sel = s; P.refreshPanels(); P.redraw(); }
  function faceRadius(s, fi) {
    const g = s.F[fi].group; if (!g) return null;
    const fs = s.F.map((f, i) => [f, i]).filter(([f]) => f.group === g); if (fs.length < 3) return null;
    let ax = null, bm = 0; for (let i = 1; i < fs.length; i++) { const c = v3.cross(fs[0][0].n, fs[i][0].n), l = v3.len(c); if (l > bm) { bm = l; ax = c; } }
    if (!ax || bm < 0.05) return null; ax = v3.norm(ax);
    if (fs.some(([f]) => Math.abs(v3.dot(f.n, ax)) > 0.06)) return null;          // not a cylinder
    const { u, v } = CAD.math.basis(ax), pts = []; const seen = new Set();
    fs.forEach(([f]) => f.loops.forEach((l) => l.forEach((vi) => { if (!seen.has(vi)) { seen.add(vi); const p = s.V[vi]; pts.push([v3.dot(p, u), v3.dot(p, v)]); } })));
    // Kasa circle fit
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0; const n = pts.length;
    pts.forEach(([x, y]) => { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; });
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxz, syz, sz];
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]), D0 = det(A); if (Math.abs(D0) < 1e-12) return null;
    const rep = (c) => A.map((r, i) => r.map((x, j) => (j === c ? B[i] : x))), a = det(rep(0)) / D0, b = det(rep(1)) / D0, c = det(rep(2)) / D0;
    const cx = a / 2, cy = b / 2, r2 = c + cx * cx + cy * cy; return r2 > 0 ? Math.sqrt(r2) : null;
  }
  function selCmd(cmd) {
    const sel = st.sel; if (!sel || !sel.bodyId || sel.type === 'body') return toast('Select an edge or a face first, then choose a Select+ command', true);
    const b = bodyOf(sel.bodyId), s = b.solid, T = topo(s), bid = b.key;
    if (cmd === 'chain') {
      if (sel.type !== 'edge') return toast('Tangent chain works on edges — click an edge first', true);
      const byKey = new Map(T.les.map((l) => [l.key, l])), ends = new Map(); T.les.forEach((l) => ends.set(l.key, leEnds(s, l)));
      const vmap = new Map(); T.les.forEach((l) => { if (l.smooth) return; ends.get(l.key).forEach((e) => { (vmap.get(e.v) || vmap.set(e.v, []).get(e.v)).push({ l, d: e.d }); }); });
      const got = new Set(sel.edges.map((e) => e.key)), q = sel.edges.map((e) => e.key);
      while (q.length) {
        const k = q.pop(), l = byKey.get(k); if (!l) continue;
        ends.get(k).forEach((e) => { (vmap.get(e.v) || []).forEach((o) => { if (o.l.key === k || got.has(o.l.key)) return; if (v3.dot(e.d, o.d) < -TAN_COS) { got.add(o.l.key); q.push(o.l.key); } }); });
      }
      const edges = [...got].map((k) => byKey.get(k)).filter(Boolean); setSel({ type: 'edge', bodyId: bid, bodyIds: [bid], edges }); return status('Tangent chain: ' + edges.length + ' edge' + (edges.length > 1 ? 's' : ''));
    }
    if (cmd === 'boundary') {
      if (sel.type !== 'edge') return toast('Face boundary works from an edge — click an edge first', true);
      const e0 = sel.edges[0], fa = W1._bf && W1._bf.key === e0.key && e0.faces.length > 1 ? e0.faces[(e0.faces.indexOf(W1._bf.f) + 1) % e0.faces.length] : e0.faces[0];
      W1._bf = { key: e0.key, f: fa };
      const edges = T.les.filter((l) => !l.smooth && l.faces.includes(fa)); if (!edges.length) return toast('That face has no sharp boundary', true);
      setSel({ type: 'edge', bodyId: bid, bodyIds: [bid], edges }); return status('Face boundary: ' + edges.length + ' edges (press again to switch to the face on the other side)');
    }
    if (sel.type !== 'face') return toast('This command works on faces — click a face first', true);
    const cur = sel.faces.slice(); let faces = null, msg = '';
    if (cmd === 'tangentFaces') { faces = expandFaces(s, cur, 'tangent'); msg = 'Tangent faces'; }
    else {
      const f0 = s.F[cur[0]], set = new Set(cur);
      if (cmd === 'similarNormal') { s.F.forEach((f, i) => { if (Math.abs(v3.dot(f.n, f0.n)) > 0.9999) set.add(i); }); msg = 'Parallel faces'; }
      else if (cmd === 'similarPlane') { const tol = s.scale() * 1e-5; s.F.forEach((f, i) => { if (v3.dot(f.n, f0.n) > 0.9999 && Math.abs(f.d - f0.d) < tol) set.add(i); }); msg = 'Coplanar faces'; }
      else if (cmd === 'similarArea') { const a0 = Math.abs(s.faceArea(cur[0])); s.F.forEach((f, i) => { if (Math.abs(Math.abs(s.faceArea(i)) - a0) <= a0 * 0.02 + 1e-9) set.add(i); }); msg = 'Faces of the same area'; }
      else if (cmd === 'similarRadius') {
        const r0 = faceRadius(s, cur[0]); if (r0 == null) return toast('Pick a cylindrical (rounded) face first — radius matching needs a curved face', true);
        s.F.forEach((f, i) => { const r = faceRadius(s, i); if (r != null && Math.abs(r - r0) <= r0 * 0.01) set.add(i); }); msg = 'Faces with radius ' + fmt(r0, 2) + ' mm';
      }
      faces = [...set];
    }
    setSel({ type: 'face', bodyId: bid, bodyIds: [bid], faces, offset: false }); status(msg + ': ' + faces.length + ' face' + (faces.length > 1 ? 's' : ''));
  }
  // ----- Ctrl+click : pick the next face BEHIND the current one (select-through)
  function selectBehind(x, y) {
    const M = R.matrices(), ray = R.ray(x, y, M), hits = [];
    st.bodies.forEach((b) => { if (!b.visible) return; const s = b.solid; s.F.forEach((f, fi) => { let best = null; SOL.triangulateFace(s, fi).forEach((t) => { const h = P.rayTri(ray.o, ray.d, s.V[t[0]], s.V[t[1]], s.V[t[2]]); if (h != null && (best == null || h < best)) best = h; }); if (best != null) hits.push({ b, fi, t: best }); }); });
    if (!hits.length) return false; hits.sort((a, b) => a.t - b.t);
    const cur = st.sel && st.sel.type === 'face' ? st.sel : null; let at = -1;
    if (cur) at = hits.findIndex((h) => h.b.key === cur.bodyId && cur.faces.includes(h.fi));
    const h = hits[(at + 1) % hits.length], s = h.b.solid, g = s.F[h.fi].group;
    const faces = g ? s.F.map((_, i) => i).filter((i) => s.F[i].group === g) : [h.fi];
    st.itemSel = null; setSel({ type: 'face', bodyId: h.b.key, bodyIds: [h.b.key], faces, offset: faces.length > 1 });
    status('Select-behind: face ' + ((at + 1) % hits.length + 1) + ' of ' + hits.length + ' under the cursor (Ctrl+click again for the next)'); return true;
  }
  // ----- Select+ panel
  const sp = IK.panel('w1-select', '◈ <i>Select+</i>', { top: '96px', left: '72px' });
  function renderSP() {
    const k = st.sel ? st.sel.type : null;
    sp.body.innerHTML = '<p class="note" style="margin:0 0 6px">' + (k === 'edge' ? 'Edge selected' : k === 'face' ? 'Face selected' : 'Click an edge or a face, then pick a command.') + '</p>' +
      '<h5>Edges</h5><div class="row"><button class="btn" data-sc="chain" title="Alt+T">Tangent chain</button> <button class="btn" data-sc="boundary" title="Alt+L">Face boundary loop</button></div>' +
      '<h5>Faces</h5><div class="row"><button class="btn" data-sc="tangentFaces" title="Alt+F">Tangent faces</button></div>' +
      '<div class="row"><button class="btn" data-sc="similarNormal" title="Alt+S">Parallel</button> <button class="btn" data-sc="similarPlane">Coplanar</button> <button class="btn" data-sc="similarArea">Same area</button> <button class="btn" data-sc="similarRadius">Same radius</button></div>' +
      '<p class="note"><b>Ctrl+click</b> on the model selects the face behind the one on top (click again to go deeper).<br>Hotkeys: Alt+T chain · Alt+L loop · Alt+F tangent faces · Alt+S parallel · Alt+O offset face · Alt+G gumball.</p>';
    $$('[data-sc]', sp.body).forEach((b) => { b.onclick = () => selCmd(b.dataset.sc); });
  }
  sp.onclose = () => {}; P.hooks.clearSel.push(() => { if (sp.classList.contains('on')) setTimeout(renderSP, 60); }); P.hooks.afterRegen.push(() => { if (sp.classList.contains('on')) setTimeout(renderSP, 60); });
  const openSelectPlus = () => { sp.show(); renderSP(); };

  // ================================================================= toolbar  (8.20.0 layout: ONE compact group, right after Modify)
  const ICN = {
    gb: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3 M10 5l2-2 2 2 M14 12h7 M19 10l2 2-2 2 M10.5 13.5L5 19"/><ellipse cx="12" cy="12" rx="8" ry="3.2" stroke-dasharray="2 2"/>',
    off: '<path d="M4 20V9h9v11z M16 4v16 M13 8l3-4 3 4"/>', mv: '<path d="M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3"/>',
    sc: '<rect x="4" y="12" width="8" height="8"/><rect x="4" y="4" width="16" height="16" stroke-dasharray="2 2"/><path d="M14 10l6-6 M15 4h5v5"/>', sel: '<path d="M4 4h6M4 4v6 M20 4h-6M20 4v6 M4 20h6M4 20v-6 M20 20h-6M20 20v-6"/><path d="M9 9l6 3-2.5 1-1 2.5z"/>',
    rad: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1"/>'
  };
  const openRadial = () => { if (W1.radialApi) W1.radialApi.open([innerWidth / 2, innerHeight / 2]); else toast('Radial menu is not loaded', true); };
  const DIRECT_ITEMS = [
    ['w1g', 'Gumball', () => toggleGumball(), 'Gumball (Alt+G): on-model handles — arrows move, squares move in a plane, centre dot moves freely, rings rotate, cubes scale (Shift = uniform)', ICN.gb],
    ['w1o', 'Offset face', () => cmdOffsetFace(), 'Offset Face (Alt+O): push / pull the selected faces by a distance and heal the neighbours', ICN.off],
    ['w1m', 'Transform', () => { gp.show(); renderGP(); }, 'Transform: type exact Move / Rotate / Scale values for the selection (auto-heal). Scale options: Scale… button inside.', ICN.mv],
    ['w1x', 'Select+', () => openSelectPlus(), 'Select+: tangent chain, face boundary, tangent faces, select-similar (Ctrl+click = select behind)', ICN.sel]
  ];
  P.addGroup('model', 'Direct+', DIRECT_ITEMS, 'Modify');          // Model: right after Modify (inside the first screen)
  P.addGroup('part', 'Direct+', DIRECT_ITEMS, 'Face tools');       // Part: after Face tools, so it stays inside the first screen too
  // extra commands that have no ribbon button: they live ONLY in Ctrl+K search (assign shortcuts there) and in the radial menu
  const SEARCH_TAB = 'Direct+';
  P.addGroup(SEARCH_TAB, 'Scale, select & radial', [
    ['w1s', 'Scale body…', () => cmdScale(), 'Scale body: uniform or non-uniform, about centre / base / origin, optional copy', ICN.sc],
    ['w1sc1', 'Select tangent chain', () => selCmd('chain'), 'Select+ · Alt+T', ICN.sel], ['w1sc2', 'Select face boundary loop', () => selCmd('boundary'), 'Select+ · Alt+L', ICN.sel],
    ['w1sc3', 'Select tangent faces', () => selCmd('tangentFaces'), 'Select+ · Alt+F', ICN.sel], ['w1sc4', 'Select parallel faces', () => selCmd('similarNormal'), 'Select+ · Alt+S', ICN.sel],
    ['w1sc5', 'Select coplanar faces', () => selCmd('similarPlane'), 'Select+', ICN.sel], ['w1sc6', 'Select same-area faces', () => selCmd('similarArea'), 'Select+', ICN.sel], ['w1sc7', 'Select same-radius faces', () => selCmd('similarRadius'), 'Select+', ICN.sel],
    ['w1rm', 'Radial menu (M)', () => openRadial(), 'Context-sensitive 8-way quick menu', ICN.rad],
    ['w1dk', 'Show / hide the Direct dock', () => { if (W1.dockApi) W1.dockApi.toggle(); }, 'The small tool strip inside the 3D view', ICN.gb],
    ['w1rc', 'Radial menu — set up slices', () => { if (W1.radialApi) W1.radialApi.openCustomise(); }, 'Choose which tool sits on each radial slice', ICN.rad]
  ]);
  if (!P.setTab.__w1) { const st0 = P.setTab; P.setTab = function (t) { if (t === SEARCH_TAB) return undefined; return st0.apply(this, arguments); }; P.setTab.__w1 = true; }   // Ctrl+K must not switch to the (empty) search-only tab
  W1.api = { SEARCH_TAB, toggleGumball, cmdOffsetFace, cmdScale, selCmd, openSelectPlus, selectBehind, scaleXf, expandFaces, faceRadius, hitTest: (x, y) => { const h = hitTest(x, y); return h ? h.it.id : null; }, _layout: () => { const c = frameNow(); return c ? layout(R.matrices(), c) : null; }, startDrag, updateDrag, endDrag, get drag() { return GD; } };
  if (G.console) console.info('Aakar Wave 1 · Direct edit loaded (Gumball, Offset face, Scale, Select+)');
})(typeof window !== 'undefined' ? window : globalThis);
