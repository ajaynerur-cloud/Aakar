/* ======================================================================
 * Aakar 8.18.3 · selection you can see + push / pull you can see
 *
 *  1. A selected WHOLE BODY gets a thick outline (orange) and a banner naming it.
 *     Delete on a face first promotes it to the whole body: that body is then marked RED (thick red outline, red tint)
 *     with the banner "Delete "Box A"? Press Delete again to remove it, Esc cancels".
 *  2. Press-pull (Extrude mode, face selected): the arrow now carries a "PULL +" badge at the tip (adds material)
 *     and a "PUSH -" badge on the other side (removes material), so the symbol is unmistakable.
 *  Everything is drawn through the existing draw hooks; no change to geometry or the document.
 * ====================================================================== */
(function () {
  'use strict';
  var P = window.PRISM, CAD = window.CAD; if (!P || !CAD || !P.hooks || !P.R || !CAD.math) return;
  var st = P.st, R = P.R, v3 = CAD.math.v3, ORANGE = [1, 0.54, 0.24], RED = [1, 0.18, 0.26];
  var vp = document.getElementById('viewport'); if (!vp) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var css = document.createElement('style');
  css.textContent = '#aakSelBanner{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);z-index:14;display:none;pointer-events:none;padding:7px 16px;border-radius:20px;background:rgba(24,28,38,.95);border:1.5px solid #ff8a3d;color:#ffd1a1;font:600 13px "Segoe UI",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}' +
    '#aakSelBanner.on{display:block}#aakSelBanner.armed{background:#7a1420;border-color:#ff4a5a;color:#fff;animation:aakSelPulse 1.1s ease-in-out infinite}#aakSelBanner b{color:#fff}' +
    '@keyframes aakSelPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,74,90,.55),0 6px 20px rgba(0,0,0,.5)}50%{box-shadow:0 0 0 9px rgba(255,74,90,0),0 6px 20px rgba(0,0,0,.5)}}' +
    '.aakPP{position:absolute;left:0;top:0;z-index:13;display:none;pointer-events:none;padding:3px 10px;border-radius:14px;font:800 11.5px "Segoe UI",system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.5);transform:translate(-50%,-50%)}' +
    '.aakPP.on{display:flex;align-items:center;gap:5px}.aakPP.pull{background:#2fd98a;color:#06251a;border:1.5px solid #b8ffe0}.aakPP.push{background:#ff5d6c;color:#fff;border:1.5px solid #ffc2c8}.aakPP i{font-style:normal;font-size:14px;line-height:1}' +
    '.aakPP small{font:600 10px "Segoe UI",system-ui,sans-serif;opacity:.85;letter-spacing:0;text-transform:none}' +
    /* Instant3D push / pull handle (extrude features) */
    '#i3dLayer .i3d-grip.pp{width:34px;height:34px;background:#2fd98a;border:2.5px solid #fff;box-shadow:0 0 0 4px rgba(47,217,138,.28),0 4px 12px rgba(0,0,0,.55)}#i3dLayer .i3d-grip.pp svg{width:22px;height:22px;stroke:#06251a;stroke-width:2.6}' +
    '#i3dLayer .i3d-grip.pp:hover{background:#7dffc3}#i3dLayer .i3d-grip.pp.drag{background:#ffe27a}#i3dLayer .i3d-chip b.pp{background:#2fd98a;color:#06251a;border-radius:9px;padding:1px 7px;font-size:10.5px;letter-spacing:.05em;margin-right:4px}';
  document.head.appendChild(css);

  var banner = document.createElement('div'); banner.id = 'aakSelBanner'; vp.appendChild(banner);
  var pull = document.createElement('div'); pull.className = 'aakPP pull'; pull.innerHTML = '<i>⇅</i>PULL +<small>adds material</small>'; vp.appendChild(pull);
  var push = document.createElement('div'); push.className = 'aakPP push'; push.innerHTML = 'PUSH −<small>removes material</small>'; vp.appendChild(push);

  // ---------------------------------------------------------------- feature edges + triangles of a solid (cached per solid)
  var cache = new WeakMap();
  function derive(s) {
    var c = cache.get(s); if (c) return c; var map = new Map(), edges = [], tris = [];
    s.F.forEach(function (f, fi) {
      (f.loops || []).forEach(function (l) { for (var i = 0; i < l.length; i++) { var a = l[i], b = l[(i + 1) % l.length], k = a < b ? a + ':' + b : b + ':' + a, e = map.get(k); if (e) e.f.push(fi); else map.set(k, { a: a, b: b, f: [fi] }); } });
      try { CAD.solid.triangulateFace(s, fi).forEach(function (t) { tris.push([t[0], t[1], t[2], fi]); }); } catch (e0) { /* skip a face that cannot be triangulated */ }
    });
    map.forEach(function (e) {
      if (e.f.length < 2) { edges.push([e.a, e.b]); return; }
      var f0 = s.F[e.f[0]], f1 = s.F[e.f[1]]; if (!f0 || !f1) { edges.push([e.a, e.b]); return; }
      if (f0.group && f0.group === f1.group) return;                       // inside one smooth patch: not a visible edge
      var d = f0.n[0] * f1.n[0] + f0.n[1] * f1.n[1] + f0.n[2] * f1.n[2]; if (d < 0.966) edges.push([e.a, e.b]);
    });
    c = { edges: edges, tris: tris }; cache.set(s, c); return c;
  }

  // ---------------------------------------------------------------- 1. whole-body selection
  P.hooks.draw.push(function (M, h) {
    var sel = st.sel, keys = (sel && sel.type === 'body' && !st.sketching) ? (sel.bodyIds && sel.bodyIds.length ? sel.bodyIds : [sel.bodyId]) : [];
    if (st.delArm && keys.indexOf(st.delArm) < 0) st.delArm = null;
    var L = [], T = [], names = [], armedName = null;
    keys.forEach(function (k) {
      var b = st.bodies.find(function (x) { return x.key === k; }); if (!b || b.visible === false || !b.solid || !b.solid.F) return;
      var s = b.solid, armed = st.delArm === k, col = armed ? RED : ORANGE, d = derive(s); names.push(b.name || 'Body'); if (armed) armedName = b.name || 'Body';
      d.edges.forEach(function (e) { if (s.V[e[0]] && s.V[e[1]]) h.quad(L, s.V[e[0]], s.V[e[1]], armed ? 5 : 3.5, col, 1, M); });
      if (armed) d.tris.forEach(function (t) {
        var f = s.F[t[3]], n = f.n, px = R.pixelSize(s.V[t[0]], M) * 1.4;
        t.slice(0, 3).forEach(function (vi) { var p = s.V[vi]; h.pushL(T, [p[0] + n[0] * px, p[1] + n[1] * px, p[2] + n[2] * px], RED, 0.42); });
      });
    });
    if (T.length) R.overlayTris(new Float32Array(T), { depth: true });
    if (L.length) R.overlayTris(new Float32Array(L), { depth: true });
    var show = names.length && document.getElementById('modal').classList.contains('hidden');
    if (show) {
      var nm = names.length > 2 ? names.length + ' bodies' : names.map(function (n) { return '“' + esc(n) + '”'; }).join(' and ');
      banner.innerHTML = armedName ? '🗑 Delete <b>' + nm + '</b>? Press <b>Delete</b> again to remove it · <b>Esc</b> cancels' : 'Selected: <b>' + nm + '</b> · Delete removes the whole body · Esc deselects';
      banner.className = 'on' + (armedName ? ' armed' : '');
    } else banner.className = '';
  });

  // ---------------------------------------------------------------- 2. press-pull badges
  P.hooks.draw.push(function (M) {
    var show = false;
    try {
      var Gz = (st.sel && st.sel.type === 'face' && st.pull === 'extrude' && !st.previewState && !st.sketching && !document.body.classList.contains('i3d-on')) ? P.gizmoHandles() : null;
      if (Gz && Gz.handles.length) {
        var hd = Gz.handles[0], g = P.handleGeom(hd, Gz.pivot, M), tip = v3.madd(g.b, hd.dir, 30 * g.px), back = v3.madd(Gz.pivot, hd.dir, -34 * g.px), a = R.project(tip, M), b = R.project(back, M);
        pull.style.left = a[0] + 'px'; pull.style.top = (a[1] - 12) + 'px'; push.style.left = b[0] + 'px'; push.style.top = (b[1] + 14) + 'px'; show = true;
      }
    } catch (e) { show = false; }
    pull.classList.toggle('on', show); push.classList.toggle('on', show);
  });
})();
