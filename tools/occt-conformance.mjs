// Generated from the app's own self-test (src 89-exact-kernel.js) - the app and CI run exactly the same checks.
export function conformance(k, tol) {
  tol = tol || 1e-4; const res = [], T = (name, fn) => { try { const r = fn(); res.push({ name, ok: !!r.ok, detail: r.detail || '' }); } catch (e) { res.push({ name, ok: false, detail: 'threw: ' + ((e && e.message) || e) }); } };
  const near = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * (rel == null ? tol : rel) + 1e-9, f = (x) => (+x).toPrecision(8), txt = (s) => (typeof s === 'string' ? s : new TextDecoder().decode(s));
  T('box volume', () => { const v = k.volume(k.box(20, 30, 40)); return { ok: near(v, 24000), detail: f(v) + ' vs 24000' }; });
  T('cylinder volume', () => { const v = k.volume(k.cylinder(10, 25)), e = Math.PI * 2500; return { ok: near(v, e, 2e-3), detail: f(v) + ' vs ' + f(e) }; });
  T('sphere volume', () => { const v = k.volume(k.sphere(10)), e = 4 / 3 * Math.PI * 1000; return { ok: near(v, e, 3e-3), detail: f(v) + ' vs ' + f(e) }; });
  T('translate keeps volume', () => { const v = k.volume(k.translate(k.box(10, 10, 10), [5, -3, 2])); return { ok: near(v, 1000), detail: f(v) }; });
  T('primitive placement (corner / base at the origin)', () => { const m = k.mesh(k.box(10, 20, 30), 0.1), p = m.positions; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[i + a]); mx[a] = Math.max(mx[a], p[i + a]); } const ok = mn.every((x) => Math.abs(x) < 1e-6) && Math.abs(mx[0] - 10) < 1e-6 && Math.abs(mx[1] - 20) < 1e-6 && Math.abs(mx[2] - 30) < 1e-6; return { ok, detail: 'box spans ' + mn.map((x) => +x.toFixed(3)) + ' .. ' + mx.map((x) => +x.toFixed(3)) }; });
  T('cut (hole through a block)', () => { const v = k.volume(k.cut(k.box(40, 40, 10), k.translate(k.cylinder(5, 30), [20, 20, -10]))), e = 16000 - Math.PI * 250; return { ok: near(v, e, 2e-3), detail: f(v) + ' vs ' + f(e) }; });
  T('fuse (two blocks sharing a face)', () => { const v = k.volume(k.fuse(k.box(10, 10, 10), k.translate(k.box(10, 10, 10), [10, 0, 0]))); return { ok: near(v, 2000), detail: f(v) + ' vs 2000' }; });
  T('common (overlap of two blocks)', () => { const v = k.volume(k.common(k.box(10, 10, 10), k.translate(k.box(10, 10, 10), [5, 0, 0]))); return { ok: near(v, 500), detail: f(v) + ' vs 500' }; });
  T('surface area of a box', () => { const a = k.area(k.box(10, 20, 30)); return { ok: near(a, 2200), detail: f(a) + ' vs 2200' }; });
  T('mesh', () => { const m = k.mesh(k.box(10, 10, 10), 0.1), nt = m.indices.length / 3; return { ok: nt >= 12 && m.positions.length >= 24, detail: nt + ' triangles' }; });
  T('mesh of a cylinder is smooth enough', () => { const m = k.mesh(k.cylinder(10, 10), 0.01); let r = 0; for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i], m.positions[i + 1])); return { ok: Math.abs(r - 10) < 0.02, detail: 'max radius ' + f(r) }; });
  T('STEP export writes a true cylinder', () => { const s = txt(k.stepExport(k.cylinder(5, 10))); return { ok: /ISO-10303-21/.test(s) && /CYLINDRICAL_SURFACE/.test(s), detail: s.length + ' bytes' + (/CYLINDRICAL_SURFACE/.test(s) ? ', CYLINDRICAL_SURFACE present' : ', no CYLINDRICAL_SURFACE') }; });
  if (k.stepImport) T('STEP round trip', () => { const v = k.volume(k.stepImport(txt(k.stepExport(k.box(10, 20, 30))))); return { ok: near(v, 6000), detail: f(v) + ' vs 6000' }; });
  return res;
}
