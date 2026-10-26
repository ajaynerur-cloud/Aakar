/* Aakar 8.19.1 · Wave 1 · LAYOUT helper
 *  - marks the new groups (Direct+, Joints) with an orange “NEW” tag until you use one of their tools
 *  - the matching default (demo / rarely-used groups start collapsed) is applied by the tiny seed script that build.py puts at the top of <head>
 *    (you can always expand any group again: click its ▸ or right-click the group label)
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM; if (!CAD || !P) return;
  const W1 = G.AAKAR_W1 = G.AAKAR_W1 || { version: '8.19.1' }; if (W1.layout) return; W1.layout = true;
  const KEY = 'aakar.w1.seen', NEW = ['Direct+', 'Joints'];
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const css = document.createElement('style');
  css.textContent = '.grp.w1new .glabel{color:#ff9a52!important}.grp.w1new .glabel::after{content:"NEW";margin-left:5px;padding:0 4px;border-radius:7px;background:#ff8a3d;color:#1a1208;font-size:8px;font-weight:800;letter-spacing:.4px;vertical-align:middle}' +
    '.grp.w1new{box-shadow:inset 0 0 0 1px #ff8a3d55;border-radius:8px}';
  document.head.appendChild(css);
  const labelOf = (g) => { const l = g.querySelector('.glabel'); return l ? (l.dataset.t || l.textContent.replace(/[▸▾]/g, '').trim()) : ''; };
  function mark() {
    const tb = document.querySelector('#toolbar'); if (!tb) return;
    tb.querySelectorAll(':scope > .grp').forEach((g) => { const t = labelOf(g); g.classList.toggle('w1new', NEW.includes(t) && !seen[t]); });
  }
  const tb = document.querySelector('#toolbar');
  if (tb) {
    new MutationObserver(() => mark()).observe(tb, { childList: true, subtree: false });
    tb.addEventListener('click', (e) => { const g = e.target.closest && e.target.closest('.grp'); if (!g || !e.target.closest('.tbtn')) return; const t = labelOf(g); if (NEW.includes(t) && !seen[t]) { seen[t] = 1; try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (x) { /* ignore */ } mark(); } }, true);
    mark();
  }
  W1.layoutApi = { mark };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---------------------------------------------------------------------------------------------------------------
 * DIRECT DOCK — a small always-visible tool strip inside the 3D view (works in every UI style, no ribbon scrolling)
 *   ✥ Gumball (toggle) · ⇲ Offset face · ◈ Select+ · ◔ Radial menu.   Drag the grip to move it, double-click the grip to fold it.
 * --------------------------------------------------------------------------------------------------------------- */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, W1 = G.AAKAR_W1; if (!CAD || !P || !W1 || W1.dock) return; W1.dock = true;
  const vp = document.querySelector('#viewport'); if (!vp) return;
  const KEY = 'aakar.w1.dock'; let cfg = { x: 10, y: 96, min: false, hidden: false }; try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
  const css = document.createElement('style');
  css.textContent = '#w1dock{position:absolute;z-index:36;display:flex;flex-direction:column;gap:2px;padding:3px;width:52px;box-sizing:border-box;background:#161c27ef;border:1px solid #2b3648;border-radius:11px;box-shadow:0 8px 24px #0009;font-family:system-ui,sans-serif}' +
    '#w1dock .gr{height:13px;cursor:move;text-align:center;color:#6b7a90;font-size:10px;line-height:13px;user-select:none;touch-action:none;letter-spacing:2px}#w1dock .gr:hover{color:#ff8a3d}' +
    '#w1dock button{width:44px;height:44px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:1px solid transparent;border-radius:8px;color:#c9d3e3;cursor:pointer;font:600 8.5px/1 system-ui,sans-serif;padding:0}' +
    '#w1dock button svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}#w1dock button:hover{background:#212938;color:#ff9a52}' +
    '#w1dock button.on{background:#ff8a3d26;border-color:#ff8a3d;color:#ff9a52}#w1dock.min button{display:none}#w1dock.min{width:52px}#w1dock.hid{display:none}' +
    'body.sketching #w1dock,body.overlay #w1dock,body.x855-focus #w1dock{display:none}';
  document.head.appendChild(css);
  const SV = (d) => '<svg viewBox="0 0 24 24">' + d + '</svg>';
  const ic = { g: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3 M10 5l2-2 2 2 M14 12h7 M19 10l2 2-2 2 M10.5 13.5L5 19"/><ellipse cx="12" cy="12" rx="8" ry="3.2" stroke-dasharray="2 2"/>', o: '<path d="M4 20V9h9v11z M16 4v16 M13 8l3-4 3 4"/>', s: '<path d="M4 4h6M4 4v6 M20 4h-6M20 4v6 M4 20h6M4 20v-6 M20 20h-6M20 20v-6"/><path d="M9 9l6 3-2.5 1-1 2.5z"/>', r: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1"/>' };
  const el = document.createElement('div'); el.id = 'w1dock';
  el.innerHTML = '<div class="gr" title="Drag to move · double-click to fold">⋮⋮⋮</div>' +
    '<button class="w1dk-g" data-a="g" title="Gumball (Alt+G): on-model move / rotate / scale handles for the selection">' + SV(ic.g) + 'Gumball</button>' +
    '<button data-a="o" title="Offset face (Alt+O): push / pull the selected faces">' + SV(ic.o) + 'Offset</button>' +
    '<button data-a="s" title="Select+: tangent chain, face loop, select-similar (Ctrl+click = select behind)">' + SV(ic.s) + 'Select+</button>' +
    '<button data-a="r" title="Radial menu (M): quick tools for what is selected">' + SV(ic.r) + 'Radial</button>';
  vp.appendChild(el);
  const A = () => W1.api || {};
  el.querySelector('[data-a=g]').onclick = () => (A().toggleGumball ? A().toggleGumball() : null);
  el.querySelector('[data-a=o]').onclick = () => (A().cmdOffsetFace ? A().cmdOffsetFace() : null);
  el.querySelector('[data-a=s]').onclick = () => (A().openSelectPlus ? A().openSelectPlus() : null);
  el.querySelector('[data-a=r]').onclick = () => { const r = W1.radialApi; if (r) { const b = el.getBoundingClientRect(); r.open([b.right + 130, b.top + 120]); } };
  const place = () => { const r = vp.getBoundingClientRect(); cfg.x = Math.max(0, Math.min(cfg.x, r.width - 60)); cfg.y = Math.max(0, Math.min(cfg.y, r.height - 30)); el.style.left = cfg.x + 'px'; el.style.top = cfg.y + 'px'; el.classList.toggle('min', !!cfg.min); el.classList.toggle('hid', !!cfg.hidden); };
  const gr = el.querySelector('.gr');
  gr.onpointerdown = (e) => { gr.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; gr.onpointermove = (ev) => { const v = vp.getBoundingClientRect(); cfg.x = ev.clientX - v.left - dx; cfg.y = ev.clientY - v.top - dy; place(); }; gr.onpointerup = () => { gr.onpointermove = null; save(); }; };
  gr.ondblclick = () => { cfg.min = !cfg.min; place(); save(); };
  window.addEventListener('resize', place);
  W1.dockApi = { toggle: () => { cfg.hidden = !cfg.hidden; place(); save(); }, el, place };
  place();
  if (G.console) console.info('Aakar Wave 1 · Direct dock loaded');
})(typeof window !== 'undefined' ? window : globalThis);
