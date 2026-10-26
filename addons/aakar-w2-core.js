/* Aakar 8.20.0 · Wave 2 · CORE
 *   Command registry for all Wave-2 tools + the "More tools" palette (opened from the Direct dock's ⋯ button, from Ctrl+K,
 *   from the radial menu, or with Alt+M).  Keeps the ribbon short: every new tool is one click away without a new ribbon group.
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM, W1 = G.AAKAR_W1;
  if (!CAD || !P || !CAD.ik || !W1) { if (G.console) console.warn('Aakar Wave 2 core: Wave 1 not found'); return; }
  if (W1.core2) return; W1.core2 = true; W1.version2 = '8.20.0';
  const IK = CAD.ik, { $, esc, toast } = IK;
  const cmds = [], ORDER = ['Shape', 'Curves', 'Analyse', 'Sketch'];
  W1.cmds = cmds;
  /** reg({ id, label, group, title, fn, icon }) — icon = inner SVG for a 24×24 viewBox (optional) */
  W1.reg = (c) => { if (!c || !c.id || cmds.some((x) => x.id === c.id)) return; cmds.push(c); if (W1.moreApi && W1.moreApi.isOpen()) W1.moreApi.render(); };
  // also list them in Ctrl+K (a search-only "tab"; the guard in Wave 1 keeps it from switching tabs)
  W1.searchItems = () => cmds.map((c) => [c.id, c.label, c.fn, c.title || c.label, c.icon || '<circle cx="12" cy="12" r="3"/>']);
  W1.publishSearch = () => {
    try {
      const g = (P.groups || []).find((x) => x.tab === 'Direct+' && x.title === 'Wave 2 tools');
      const items = W1.searchItems(); if (g) { g.items.length = 0; items.forEach((i) => g.items.push(i)); } else P.addGroup('Direct+', 'Wave 2 tools', items);
    } catch (e) { /* ignore */ }
  };

  // ------------------------------------------------------------------ palette
  const css = document.createElement('style');
  css.textContent = '#w2more{position:absolute;z-index:38;width:330px;max-height:calc(100% - 24px);display:none;flex-direction:column;background:#161c27f7;border:1px solid #2b3648;border-radius:12px;box-shadow:0 14px 40px #000c;font:12.5px system-ui,sans-serif;color:#e6ecf5}' +
    '#w2more.on{display:flex}#w2more header{display:flex;align-items:center;gap:8px;padding:8px 11px;border-bottom:1px solid #2b3648;cursor:move;user-select:none}#w2more header b{flex:1;font-size:13px}#w2more header b i{color:#ff8a3d;font-style:normal}' +
    '#w2more header button{background:none;border:none;color:#9fb0c8;cursor:pointer;font-size:14px}#w2more header button:hover{color:#ff8a3d}' +
    '#w2more .bd{overflow:auto;padding:6px 10px 10px}#w2more input.q{width:100%;box-sizing:border-box;margin:4px 0 6px;background:#11161f;border:1px solid #2b3648;color:#e6ecf5;border-radius:6px;padding:5px 8px;font:inherit}' +
    '#w2more h5{margin:10px 0 4px;font-size:10.5px;color:#8fa0ba;text-transform:uppercase;letter-spacing:.8px}#w2more .g{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}' +
    '#w2more .g button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:58px;padding:5px 3px;background:#1d2533;border:1px solid #2b3648;border-radius:8px;color:#c9d3e3;cursor:pointer;font:600 10.5px/1.15 system-ui,sans-serif;text-align:center}' +
    '#w2more .g button:hover{background:#26314a;border-color:#ff8a3d;color:#ff9a52}#w2more .g svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
  document.head.appendChild(css);
  const vp = $('#viewport'); if (!vp) return;
  const el = document.createElement('div'); el.id = 'w2more';
  el.innerHTML = '<header><b>⋯ <i>More tools</i></b><button data-x title="Close">✕</button></header><div class="bd"><input class="q" placeholder="Filter tools…"><div class="lst"></div></div>';
  vp.appendChild(el);
  const pos = { x: 72, y: 96 }; el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
  const hd = el.querySelector('header');
  hd.onpointerdown = (e) => { if (e.target.tagName === 'BUTTON') return; hd.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(), v = vp.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; hd.onpointermove = (ev) => { el.style.left = Math.max(0, Math.min(v.width - 120, ev.clientX - v.left - dx)) + 'px'; el.style.top = Math.max(0, Math.min(v.height - 40, ev.clientY - v.top - dy)) + 'px'; }; hd.onpointerup = () => { hd.onpointermove = null; }; };
  el.querySelector('[data-x]').onclick = () => el.classList.remove('on');
  const q = el.querySelector('.q'), lst = el.querySelector('.lst');
  function render() {
    const f = q.value.trim().toLowerCase(); lst.innerHTML = '';
    ORDER.concat([...new Set(cmds.map((c) => c.group))].filter((g) => !ORDER.includes(g))).forEach((g) => {
      const items = cmds.filter((c) => c.group === g && !c.searchOnly && (!f || (c.label + ' ' + (c.title || '') + ' ' + g).toLowerCase().includes(f))); if (!items.length) return;
      const h = document.createElement('h5'); h.textContent = g; lst.appendChild(h); const gr = document.createElement('div'); gr.className = 'g'; lst.appendChild(gr);
      items.forEach((c) => { const b = document.createElement('button'); b.title = c.title || c.label; b.innerHTML = '<svg viewBox="0 0 24 24">' + (c.icon || '<circle cx="12" cy="12" r="3"/>') + '</svg>' + esc(c.label); b.onclick = () => { if (!c.keepOpen) el.classList.remove('on'); try { const r = c.fn(); if (r && r.catch) r.catch((e) => toast(e.message || String(e), true)); } catch (e) { toast(e.message || String(e), true); } }; gr.appendChild(b); });
    });
    if (!lst.children.length) lst.innerHTML = '<p style="color:#8fa0ba">No tool matches “' + esc(q.value) + '”.</p>';
  }
  q.oninput = render;
  const open = () => { el.classList.add('on'); render(); setTimeout(() => q.focus(), 30); };
  const toggle = () => (el.classList.contains('on') ? el.classList.remove('on') : open());
  W1.moreApi = { open, toggle, render, isOpen: () => el.classList.contains('on'), el };
  // ⋯ button in the Direct dock + Alt+M
  const dock = $('#w1dock');
  if (dock) { const b = document.createElement('button'); b.dataset.a = 'more'; b.title = 'More tools (Alt+M): deformers, split, wizards, patterns, curves, curvature analysis…'; b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>More'; b.onclick = toggle; dock.appendChild(b); }
  window.addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') { const t = e.target; if (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return; e.preventDefault(); toggle(); } }, true);
  // radial-menu: add the palette as a general command
  if (W1.radialApi && W1.radialApi.DEF) { /* (the radial menu resolves '@more' through SPECIAL — registered below if available) */ }
  if (G.console) console.info('Aakar Wave 2 · core loaded (More tools palette, Alt+M)');
})(typeof window !== 'undefined' ? window : globalThis);
