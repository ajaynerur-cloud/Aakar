/* Aakar 8.19.1 · Wave 1 · RADIAL MARKING MENU (all UI styles)
 *   Press M (or the “Radial” button) — an 8-way menu opens at the cursor and changes with what is selected:
 *   nothing · body · face · edge · vertex · inside a sketch.  Move toward a slice and click (or press M again) to run it.
 *   Every slice can be re-assigned to ANY tool (Radial ▸ Customise…), saved in this browser.
 *   All Wave-1 tools are also in the Ctrl+K command search, where the existing “assign shortcut” feature gives them hotkeys.
 */
(function (G) {
  'use strict';
  const CAD = G.CAD, P = G.PRISM;
  if (!CAD || !P || !CAD.ik) { if (G.console) console.warn('Aakar Wave 1 radial: base app not found'); return; }
  const W1 = G.AAKAR_W1 = G.AAKAR_W1 || { version: '8.19.1' };
  if (W1.radial) return; W1.radial = true;
  const IK = CAD.ik, { st, $, toast, status, esc, panel } = IK, LS = 'aakar.w1.radial';

  // ------------------------------------------------------------------ command resolution
  const SPECIAL = {
    '@fit': ['Fit view', () => P.fitView()], '@search': ['Search tools…', () => { try { CAD.x10.ui.openPal(); } catch (e) { toast('Press Ctrl+K', true); } }],
    '@measure': ['Measure', () => { try { CAD.x10.ui.measPanel(); CAD.x10.ui.startMeasure && CAD.x10.ui.startMeasure('dist'); } catch (e) { toast('Measure is not available here', true); } }],
    '@pull': ['Press-pull ⇄ Move', () => { st.pull = st.pull === 'move' ? 'extrude' : 'move'; const s = $('#segPull'); if (s) [...s.querySelectorAll('button')].forEach((b) => { if (b.textContent.trim().toLowerCase() === st.pull) b.click(); }); status('Face drag mode: ' + (st.pull === 'extrude' ? 'Press-pull (adds / removes material)' : 'Move')); P.redraw(); }],
    '@undo': ['Undo', () => P.undo()], '@redo': ['Redo', () => P.redo()], '@esc': ['Deselect', () => { st.sel = null; P.refreshPanels(); P.redraw(); }]
  };
  ['chain|Tangent chain', 'boundary|Face boundary', 'tangentFaces|Tangent faces', 'similarNormal|Parallel faces', 'similarPlane|Coplanar faces', 'similarArea|Same-area faces', 'similarRadius|Same-radius faces'].forEach((s) => { const [k, l] = s.split('|'); SPECIAL['@sc:' + k] = [l, () => (W1.api ? W1.api.selCmd(k) : toast('Select+ not loaded', true))]; });
  [['line', 'Line'], ['rect', 'Rectangle'], ['circle', 'Circle'], ['arc', 'Arc'], ['spline', 'Spline'], ['trim', 'Trim'], ['extend', 'Extend'], ['fillet', 'Sketch fillet'], ['offset', 'Offset'], ['mirror', 'Mirror'], ['select', 'Select'], ['dim', 'Dimension'], ['construct', 'Construction']].forEach(([k, l]) => { SPECIAL['@sk:' + k] = [l, () => { if (st.skHandle && st.skHandle.api) st.skHandle.api.setTool(k === 'construct' ? 'select' : k); else toast('Open a sketch first (K)', true); }]; });
  function toolbarItem(id) { const key = id.replace(/^tb-/, ''); for (const g of (P.groups || [])) { const it = g.items.find((x) => x[0] === key); if (it) return { it, g }; } return null; }
  function resolve(id) {
    if (!id) return null; if (SPECIAL[id]) return { label: SPECIAL[id][0], run: SPECIAL[id][1] };
    const f = toolbarItem(id); if (!f) return null;
    return { label: String(f.it[1] == null ? f.it[0] : f.it[1]).trim(), run: () => { if (st.sketching) return toast('Finish or cancel the sketch first (Enter / Esc)', true); if (f.g.tab && f.g.tab !== 'all' && st.tab !== f.g.tab) P.setTab(f.g.tab); const b = document.getElementById(id); if (b) b.click(); else if (typeof f.it[2] === 'function') f.it[2](); } };
  }
  const allCommands = () => {
    const out = [['', '— empty —']]; Object.keys(SPECIAL).forEach((k) => out.push([k, SPECIAL[k][0] + '  (' + (k.startsWith('@sk:') ? 'sketch' : k.startsWith('@sc:') ? 'select+' : 'general') + ')']));
    const seen = new Set(); (P.groups || []).forEach((g) => g.items.forEach((it) => { const id = 'tb-' + it[0]; if (seen.has(id)) return; seen.add(id); out.push([id, String(it[1] == null ? it[0] : it[1]).trim() + '  (' + g.title + ')']); }));
    return out;
  };
  // ------------------------------------------------------------------ defaults per context (clockwise from the top)
  const DEF = {
    none: ['tb-sketch', 'tb-box', 'tb-cyl', 'tb-w1g', 'tb-w1x', '@search', '@fit', '@measure'],
    body: ['tb-w1g', 'tb-w1s', 'tb-w1m', 'tb-shell', 'tb-fillet', 'tb-uni', 'tb-dup', 'tb-del'],
    face: ['tb-w1o', '@pull', 'tb-w1m', '@sc:tangentFaces', '@sc:similarNormal', 'tb-shell', 'tb-sketch', 'tb-del'],
    edge: ['tb-fillet', 'tb-chamfer', '@sc:chain', '@sc:boundary', 'tb-w1g', 'tb-w1m', 'tb-del', '@fit'],
    vertex: ['tb-w1m', 'tb-w1g', '@fit', '@search', '', '', '', ''],
    sketch: ['@sk:line', '@sk:rect', '@sk:circle', '@sk:arc', '@sk:trim', '@sk:fillet', '@sk:offset', '@sk:mirror']
  };
  const CTXN = { none: 'Nothing selected', body: 'Body selected', face: 'Face selected', edge: 'Edge selected', vertex: 'Vertex selected', sketch: 'Inside a sketch' };
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { saved = {}; }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(saved)); } catch (e) { /* ignore */ } };
  const slots = (c) => { const a = (saved[c] || DEF[c] || DEF.none).slice(0, 8); while (a.length < 8) a.push(''); return a; };
  const context = () => (st.sketching ? 'sketch' : !st.sel ? 'none' : st.sel.type === 'body' ? 'body' : st.sel.type);

  // ------------------------------------------------------------------ the menu
  const css = document.createElement('style');
  css.textContent = '#w1rad{position:fixed;inset:0;z-index:9800;display:none}#w1rad.open{display:block}#w1rad .rb{position:absolute;inset:0;background:rgba(5,8,14,.28)}' +
    '#w1rad .ring{position:absolute;width:0;height:0}#w1rad .sl{position:absolute;transform:translate(-50%,-50%);min-width:92px;max-width:118px;padding:7px 9px;text-align:center;font:600 12px system-ui,sans-serif;color:#e6ecf5;background:#161c27f2;border:1px solid #2b3648;border-radius:10px;box-shadow:0 6px 18px #000a;cursor:pointer;line-height:1.2;user-select:none}' +
    '#w1rad .sl.empty{opacity:.3;pointer-events:none}#w1rad .sl.hot{background:#ff8a3d;color:#1a1208;border-color:#ffb27a}#w1rad .sl small{display:block;font-weight:400;opacity:.6;font-size:10px;margin-top:2px}' +
    '#w1rad .ctr{position:absolute;transform:translate(-50%,-50%);width:74px;height:74px;border-radius:50%;background:#0f141d;border:2px solid #3a475c;color:#9fb0c8;font:600 10px system-ui;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;box-sizing:border-box;user-select:none;cursor:pointer}' +
    '#w1rad .ctr.hot{border-color:#ff8a3d;color:#ff8a3d}#w1rad .cfg{position:absolute;transform:translate(-50%,-50%);padding:5px 12px;border-radius:14px;background:#0f141d;border:1px solid #3a475c;color:#9fb0c8;font:600 11px system-ui;cursor:pointer;user-select:none;white-space:nowrap}#w1rad .cfg:hover{color:#ff8a3d;border-color:#ff8a3d}';
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'w1rad'; root.innerHTML = '<div class="rb"></div><div class="ring"></div>'; document.body.appendChild(root);
  const R0 = 150; let mouse = [innerWidth / 2, innerHeight / 2], O = null, hot = -1, cur = [];
  window.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; if (O) hover(e.clientX, e.clientY); }, true);
  function openMenu(at) {
    if (O) return closeMenu(); const c = context(), sl = slots(c); cur = sl.map(resolve);
    let x = (at || mouse)[0], y = (at || mouse)[1]; x = Math.max(R0 + 70, Math.min(innerWidth - R0 - 70, x)); y = Math.max(R0 + 30, Math.min(innerHeight - R0 - 30, y)); O = [x, y]; hot = -1;
    const ring = root.querySelector('.ring'); ring.style.left = x + 'px'; ring.style.top = y + 'px';
    ring.innerHTML = '<div class="cfg" style="left:0;top:' + (R0 + 74) + 'px">⚙ Set up slices</div><div class="ctr" data-i="-1">' + esc(CTXN[c]) + '<br>Esc / M = close</div>' + cur.map((r, i) => { const a = -Math.PI / 2 + i * Math.PI / 4; return '<div class="sl' + (r ? '' : ' empty') + '" data-i="' + i + '" style="left:' + (Math.cos(a) * R0).toFixed(1) + 'px;top:' + (Math.sin(a) * R0).toFixed(1) + 'px">' + (r ? esc(r.label) : '—') + '</div>'; }).join('');
    const cfgEl = ring.querySelector('.cfg'); if (cfgEl) cfgEl.onpointerdown = (ev) => { ev.preventDefault(); ev.stopPropagation(); closeMenu(); openCustomise(); };
    ring.querySelectorAll('.sl,.ctr').forEach((el) => { el.onpointerdown = (ev) => { ev.preventDefault(); ev.stopPropagation(); choose(+el.dataset.i); }; });
    root.querySelector('.rb').onpointerdown = (ev) => { ev.preventDefault(); closeMenu(); };
    root.classList.add('open');
  }
  function closeMenu() { O = null; hot = -1; root.classList.remove('open'); }
  function hover(mx, my) {
    const dx = mx - O[0], dy = my - O[1], d = Math.hypot(dx, dy); let i = -1;
    if (d > 38) { let a = Math.atan2(dy, dx) + Math.PI / 2; a = (a + 2 * Math.PI) % (2 * Math.PI); i = Math.round(a / (Math.PI / 4)) % 8; if (!cur[i]) i = -1; }
    if (i === hot) return; hot = i; root.querySelectorAll('.sl').forEach((el) => el.classList.toggle('hot', +el.dataset.i === i)); root.querySelector('.ctr').classList.toggle('hot', i === -1 && d <= 38);
  }
  function choose(i) { const r = cur[i]; closeMenu(); if (!r) return; try { r.run(); } catch (e) { toast(e.message || String(e), true); } }
  window.addEventListener('keydown', (e) => {
    if (O && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return; const md = $('#modal'); if (md && !md.classList.contains('hidden')) return;
    if (e.key.toLowerCase() === 'm' && !e.repeat) { e.preventDefault(); e.stopPropagation(); if (O && hot >= 0) choose(hot); else if (O) closeMenu(); else openMenu(); }
  }, true);
  root.addEventListener('pointerup', (e) => { if (!O) return; if (hot >= 0 && e.target === root.querySelector('.rb')) choose(hot); });

  // ------------------------------------------------------------------ customise panel
  const cp = panel('w1-radial', '◔ <i>Radial menu</i> · customise', { top: '96px', right: '84px' });
  let cc = 'none';
  function renderCP() {
    const opts = allCommands(), sl = slots(cc), names = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];
    cp.body.innerHTML = '<div class="row"><label>Menu for</label><select data-c>' + Object.keys(CTXN).map((k) => '<option value="' + k + '"' + (k === cc ? ' selected' : '') + '>' + CTXN[k] + '</option>').join('') + '</select></div>' +
      sl.map((v, i) => '<div class="row"><label>' + (i + 1) + ' · ' + names[i] + '</label><select data-s="' + i + '" style="max-width:190px">' + opts.map(([id, l]) => '<option value="' + esc(id) + '"' + (id === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>').join('') +
      '<div class="row"><button class="btn" data-a="reset">Reset this menu</button> <button class="btn" data-a="test">Open it</button></div><p class="note">Press <b>M</b> to open the menu at the cursor. Slices run any tool; the choice is saved in this browser.</p>';
    cp.body.querySelector('[data-c]').onchange = (e) => { cc = e.target.value; renderCP(); };
    cp.body.querySelectorAll('[data-s]').forEach((s) => { s.onchange = () => { const a = slots(cc); a[+s.dataset.s] = s.value; saved[cc] = a; persist(); }; });
    cp.body.querySelector('[data-a=reset]').onclick = () => { delete saved[cc]; persist(); renderCP(); };
    cp.body.querySelector('[data-a=test]').onclick = () => { cp.classList.remove('on'); setTimeout(() => openMenu([innerWidth / 2, innerHeight / 2]), 50); };
  }
  const openCustomise = () => { cp.show(); renderCP(); };
    W1.radialApi = { open: openMenu, close: closeMenu, context, slots, DEF, resolve, openCustomise, choose };
  if (G.console) console.info('Aakar Wave 1 · Radial menu loaded (M)');
})(typeof window !== 'undefined' ? window : globalThis);
