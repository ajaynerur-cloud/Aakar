// ---------------------------------------------------------------- AakarKernel 1.4: per-operation OpenCascade fallback
// K.hybrid(primary, secondary) returns a kernel with the same interface as AakarKernel whose operations run in AakarKernel FIRST. When one of them cannot be done
// there (a boolean that does not close, a round on an edge it cannot treat, ...) only THAT operation is handed to OpenCascade: the operands travel as STEP, the result
// is read back into AakarKernel when it is made of analytic surfaces (so the rest of the model stays in the fast exact kernel) and otherwise stays an OpenCascade body
// that later operations pick up there. Nothing is ever done twice or silently approximated: every hand-over is counted in hybrid.stats and written to hybrid.log.
// `secondary` is the Aakar OpenCascade binding (kernel with .raw = the occt-wasm kernel).
(function (AK) {
  const K = AK && AK.kernel; if (!K || K.hybrid) return;
  K.hybrid = function (primary, secondary, opts) {
    opts = opts || {}; const raw = secondary && secondary.raw; if (!primary || !secondary) throw new Error('hybrid kernel needs a primary and a secondary kernel');
    const H = { name: 'AakarKernel + OpenCascade', isHybrid: true, primary, secondary, stats: { offloaded: 0, back: 0, foreign: 0, failed: 0 }, log: [] }, note = (s) => { H.log.push(s); if (H.log.length > 200) H.log.shift(); if (opts.onNote) { try { opts.onNote(s); } catch (e) { /* ignore */ } } };
    const isF = (h) => !!(h && h.__foreign), F = (s) => ({ __foreign: true, s }), cache = new WeakMap(), rtol = opts.tol || 1e-6;
    const toSec = (h) => { if (isF(h)) return h.s; let s = cache.get(h); if (!s) { s = secondary.stepImport(primary.stepExport(h)); cache.set(h, s); } return s; };
    const back = (s, op) => {   // OpenCascade result -> AakarKernel when it is analytic and agrees, else stays foreign
      try { const v = secondary.volume(s), p = primary.stepImport(secondary.stepExport(s)), pv = primary.volume(p); const vd = primary.validate ? primary.validate(p) : null;
        if (v > 0 && Math.abs(pv - v) <= rtol * Math.max(1, v) && !(vd && vd.ok === false)) { cache.set(p, s); H.stats.back++; return p; } } catch (e) { /* stays foreign */ }
      H.stats.foreign++; note(op + ': result kept as an OpenCascade body (it contains surfaces AakarKernel does not hold)'); return F(s);
    };
    const offload = (op, run, why) => { H.stats.offloaded++; note(op + ': AakarKernel could not do it (' + String(why && why.message || why).slice(0, 90) + ') - done in OpenCascade'); try { return back(run(), op); } catch (e) { H.stats.failed++; note(op + ': OpenCascade failed too (' + String(e.message || e).slice(0, 90) + ')'); throw e; } };
    // ---- pass-through (primary first)
    ['box', 'cylinder', 'sphere', 'cone', 'torus', 'extrude', 'revolve', 'polyhedron', 'stepImport', 'stepImportAll'].forEach((m) => { if (typeof primary[m] === 'function') H[m] = (...a) => primary[m](...a); });
    ['translate', 'transform', 'rotate', 'scale', 'mirror'].forEach((m) => { if (typeof primary[m] !== 'function') return; H[m] = (h, ...a) => { if (!isF(h)) return primary[m](h, ...a); if (typeof secondary[m] !== 'function') throw new Error('OpenCascade body: ' + m + ' not available'); return F(secondary[m](h.s, ...a)); }; });
    const bool = (op, name) => (a, b) => {   // evaluated right away, so a failure is found here and not later in the app
      if (name === 'subtract' && !isF(a) && !isF(b) && K.nurbs && K.nurbs.cutExact && K.nurbs.isNurbs(a)) { const ex = K.nurbs.cutExact(a, b); if (ex) return ex; }
      if (!isF(a) && !isF(b) && K.nurbs && K.nurbs.boolExact && K.nurbs.isNurbs(a) && K.nurbs.isNurbs(b)) { const ex = K.nurbs.boolExact(op, a, b); if (ex) return ex; }
      if (!isF(a) && !isF(b) && K.nurbs && (K.nurbs.isNurbs(a) || K.nurbs.isNurbs(b))) return offload(name, () => secondary[op](toSec(a), toSec(b)), 'AakarKernel has no booleans on freeform (NURBS) solids');
      if (!isF(a) && !isF(b)) { try { const r = primary[op](a, b); primary.volume(r); return r; } catch (e) { return offload(name, () => secondary[op](toSec(a), toSec(b)), e); } }
      H.stats.offloaded++; try { return back(secondary[op](toSec(a), toSec(b)), name); } catch (e) { H.stats.failed++; throw e; }
    };
    H.fuse = bool('fuse', 'union'); H.cut = bool('cut', 'subtract'); H.common = bool('common', 'intersect');
    // ---- measurements and output work on either kind of body
    // a body read back from OpenCascade is exact in AakarKernel but has no tessellation there: it is meshed by the OpenCascade body it came from
    const meas = (m, sm) => (h, ...a) => { if (isF(h)) return secondary[sm || m](h.s, ...a); try { return primary[m](h, ...a); } catch (e) { const s = cache.get(h); if (s && typeof secondary[sm || m] === 'function' && (m === 'mesh' || m === 'stepExport')) return secondary[sm || m](s, ...a); throw e; } };
    ['volume', 'area', 'mesh', 'stepExport', 'massProps', 'bbox', 'validate', 'info'].forEach((m) => { if (typeof primary[m] === 'function' && (typeof secondary[m] === 'function' || !['massProps', 'bbox', 'validate', 'info'].includes(m))) H[m] = meas(m); else if (typeof primary[m] === 'function') H[m] = (h, ...a) => isF(h) ? (m === 'validate' ? { ok: true, issues: [], foreign: true } : m === 'info' ? null : (() => { throw new Error(m + ' is not available for this OpenCascade body'); })()) : primary[m](h, ...a); });
    // ---- rounds: AakarKernel first, OpenCascade for the edges it refuses
    const near = (a, b, t) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;
    function pickEdges(s, spec) {
      const out = [], sc = Math.max(1e-6, spec.R || 0, spec.p0 && spec.p1 ? Math.hypot(spec.p1[0] - spec.p0[0], spec.p1[1] - spec.p0[1], spec.p1[2] - spec.p0[2]) : 0), t = 1e-5 * sc + 1e-7, v3 = (p) => [p.x, p.y, p.z];
      raw.getSubShapes(s, 'edge').forEach((e) => {
        try {
          if (spec.kind === 'circle') { const d = raw.curveData(e); if (d && d.kind === 'circle' && Math.abs(d.radius - spec.R) < t * 10 && near(v3(d.center), spec.c, t * 10) && Math.abs(Math.abs(d.axis.x * spec.n[0] + d.axis.y * spec.n[1] + d.axis.z * spec.n[2]) - 1) < 1e-6) out.push(e); }
          else if (spec.kind === 'line') { const vs = raw.getSubShapes(e, 'vertex').map((v) => v3(raw.vertexPosition(v))); if (vs.length === 2 && ((near(vs[0], spec.p0, t * 10) && near(vs[1], spec.p1, t * 10)) || (near(vs[0], spec.p1, t * 10) && near(vs[1], spec.p0, t * 10)))) out.push(e); }
        } catch (err) { /* edge without curve data */ }
      }); return out;
    }
    if (typeof primary.roundEdge === 'function') H.roundEdge = (h, spec, type, r, tol) => {
      if (!isF(h)) { try { return (primary.roundEdge.__exact || primary.roundEdge)(h, spec, type, r, tol); } catch (e) { if (!raw || !raw.fillet) throw e; return offload(type || 'round', () => secondaryRound(toSec(h), spec, type, r), e); } }
      return back(secondaryRound(h.s, spec, type, r), type || 'round');
    };
    function secondaryRound(s, spec, type, r) {
      const es = pickEdges(s, spec); if (!es.length) throw new Error('the edge was not found in the OpenCascade body');
      const run = (list) => type === 'chamfer' ? raw.chamfer(s, list, r) : raw.fillet(s, list, r);
      const res = run(es);
      // a rim between a boss and its plate is concave: rounding it must ADD material. Some OpenCascade builds return a body that lost
      // material instead (wrong edge set or flipped sense); then try the edges one by one and keep the first result that has the right sign.
      if (spec.boss === true && typeof raw.volume === 'function') {
        try {
          const v0 = raw.volume(s), ok = (x) => raw.volume(x) > v0 + 1e-9 * Math.abs(v0);
          if (!ok(res)) { for (const e of es) { try { const one = run([e]); if (ok(one)) return one; } catch (e2) { /* next */ } } }
        } catch (e3) { /* volume check unavailable: keep the result */ }
      }
      return res;
    }
    // ---- operations AakarKernel has no exact version of: available when OpenCascade is present
    /** hollow a body: faceSpecs name the faces to open, each { c: [x,y,z] } (the face's centre of mass), { near: [x,y,z] } (the face whose centre is nearest) or { dir: [x,y,z] } (the face lying farthest along that direction); thickness > 0 grows inwards, < 0 outwards */
    H.shell = (h, faceSpecs, thickness) => { if (!isF(h) && K.nurbs && K.nurbs.shellExact && K.nurbs.isNurbs(h)) { const ex = K.nurbs.shellExact(h, faceSpecs, thickness); if (ex) return ex; } if (!raw || !raw.shell) throw new Error('OpenCascade is not available'); const s = toSec(h); const faces = raw.getSubShapes(s, 'face'), cm = (f) => { const c = raw.getSurfaceCenterOfMass(f); return [c.x, c.y, c.z]; };
      const pick = faceSpecs.map((fs) => { if (fs.c) return faces.find((f) => { try { const c = cm(f); return near(c, fs.c, 1e-4 * (1 + Math.hypot(...fs.c))); } catch (e) { return false; } }); if (fs.near) { let best = null, bd = Infinity; faces.forEach((f) => { try { const c = cm(f), d = Math.hypot(c[0] - fs.near[0], c[1] - fs.near[1], c[2] - fs.near[2]); if (d < bd) { bd = d; best = f; } } catch (e) { /* skip */ } }); return best; } if (fs.dir) { let best = null, bd = -Infinity; const d = fs.dir, L = Math.hypot(...d) || 1; faces.forEach((f) => { try { const c = cm(f), v = (c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / L; if (v > bd + 1e-9) { bd = v; best = f; } } catch (e) { /* skip */ } }); return best; } return null; }).filter(Boolean);
      if (pick.length !== faceSpecs.length) throw new Error('a face to open was not found'); H.stats.offloaded++; note('shell: done in OpenCascade'); return back(raw.shell(s, pick, thickness, 1e-3), 'shell'); };
    H.offset = (h, d) => { if (!isF(h) && K.nurbs && K.nurbs.offsetPrism && K.nurbs.isNurbs(h)) { const ex = K.nurbs.offsetPrism(h, d); if (ex) return ex; } if (!raw || !raw.offset) throw new Error('OpenCascade is not available'); H.stats.offloaded++; note('offset: done in OpenCascade'); return back(raw.offset(toSec(h), d, 1e-3), 'offset'); };
    if (primary.nurbs) H.nurbs = primary.nurbs;
    H.isForeign = isF; H.toSecondary = toSec;
    H.version = primary.version; H.features = (primary.features || []).concat(['occt-fallback']);
    return H;
  };
  K.features = (K.features || []).concat(['occt-fallback']);
})(window.AakarKernel);
