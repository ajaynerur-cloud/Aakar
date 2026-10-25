    // ------------------------------------------------------------------ 8.18.1 · POINTS & DIMENSIONS PANEL
    // Opens by itself as soon as a shape exists. Edit every point's X / Y from the origin, chain distances between points,
    // or distances to a reference line (X / Y axis or any construction line). Every box creates or changes a real dimension.
    function dpCss() {
      if (document.getElementById('sk-dp-css')) return;
      const s = document.createElement('style'); s.id = 'sk-dp-css';
      s.textContent = '.sk-dp{position:absolute;right:10px;top:84px;width:336px;max-height:calc(100% - 132px);display:flex;flex-direction:column;background:#161c28;border:1px solid var(--line,#2c3547);border-radius:10px;box-shadow:0 14px 40px #000a;z-index:34;font-size:12.5px;color:var(--txt,#dfe6f2)}' +
        '.sk-dp header{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--line,#2c3547);cursor:move;user-select:none}.sk-dp header b{flex:1;font-size:13px}' +
        '.sk-dp header button{background:none;border:1px solid transparent;color:var(--mut,#8a97ad);border-radius:5px;cursor:pointer;padding:1px 7px;font-size:12px}.sk-dp header button:hover{color:var(--acc,#ff8a3d);border-color:var(--line,#2c3547)}' +
        '.sk-dp .bd{overflow:auto;padding:8px 9px;display:flex;flex-direction:column;gap:8px}.sk-dp.min .bd{display:none}' +
        '.sk-dp .modes{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.sk-dp .modes button{background:#1d2534;border:1px solid var(--line,#2c3547);color:var(--txt,#dfe6f2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}' +
        '.sk-dp .modes button.on{background:#2c2015;border-color:var(--acc,#ff8a3d);color:var(--acc,#ff8a3d);font-weight:700}.sk-dp .modes select{background:#0d1118;color:var(--txt,#dfe6f2);border:1px solid var(--line,#2c3547);border-radius:5px;padding:2px 4px;font:inherit;max-width:150px}' +
        '.sk-dp table{border-collapse:collapse;width:100%}.sk-dp td{padding:2px 3px;vertical-align:middle}.sk-dp td.n{width:34px;color:var(--mut,#8a97ad);font-weight:700;cursor:default}.sk-dp tr:hover td.n{color:var(--acc,#ff8a3d)}' +
        '.sk-dp label.c{display:flex;align-items:center;gap:3px;background:#0d1118;border:1px solid var(--line,#2c3547);border-radius:6px;padding:0 4px}.sk-dp label.c i{font-style:normal;font-size:10.5px;color:var(--mut,#8a97ad);min-width:15px}' +
        '.sk-dp label.c input{width:100%;min-width:42px;background:none;border:0;color:var(--txt,#dfe6f2);padding:4px 2px;font:inherit;font-variant-numeric:tabular-nums}.sk-dp label.c input:focus{outline:none}' +
        '.sk-dp label.c:focus-within{border-color:var(--acc,#ff8a3d)}.sk-dp label.c.dim{border-color:#2f6b9c;background:#0e1a28}.sk-dp label.c.dim i{color:#6bb8ff}.sk-dp label.c.drv input{color:var(--mut,#8a97ad);font-style:italic}.sk-dp label.c.fx{opacity:.55}' +
        '.sk-dp h5{margin:2px 0 0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--acc,#ff8a3d)}.sk-dp .dl{display:flex;align-items:center;gap:6px}.sk-dp .dl span{flex:1;color:#c7d0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sk-dp .dl label.c{width:104px}' +
        '.sk-dp .dl button{background:none;border:0;color:var(--mut,#8a97ad);cursor:pointer;font-size:13px}.sk-dp .dl button:hover{color:var(--bad,#ff6b6b)}.sk-dp .note{color:var(--mut,#8a97ad);font-size:11.5px;line-height:1.4;margin:0}.sk-dp .ft{display:flex;gap:6px;align-items:center;color:var(--mut,#8a97ad);font-size:11.5px}.sk-dp .ft button{background:#1d2534;border:1px solid var(--line,#2c3547);color:var(--txt,#dfe6f2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}';
      document.head.appendChild(s);
    }
    var dpS = { on: false, mode: 'origin', ref: 'AX', last: 0, pref: true, el: null, sig: '', init: false };
    try { dpS.pref = localStorage.getItem('aakar.sk.dimpanel') !== '0'; } catch (e0) { /* storage blocked */ }
    const dpEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const dpFx = (x) => { const r = Math.round(x * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };
    const dpOrder = () => sk.pts.filter((p) => !p.ref).map((p) => p.id);
    const dpName = (id) => id === 'O' ? 'O' : 'P' + (dpOrder().indexOf(id) + 1);
    function dpLineName(id) {
      if (id === 'AX') return 'X axis'; if (id === 'AY') return 'Y axis';
      const L = sk.ents.filter((e) => e.type === 'line' && !e.ref), e = I.E.get(id), n = L.findIndex((x) => x.id === id) + 1;
      return (e && e.constr ? 'construction line ' : 'line ') + (n || '?');
    }
    function dpIds() {
      const selP = st.sel.filter((s) => s.kind === 'pt').map((s) => s.id), selE = st.sel.filter((s) => s.kind === 'ent').map((s) => I.E.get(s.id)).filter((e) => e && !e.ref);
      let ids = [];
      if (selP.length || selE.length) { selE.forEach((e) => entPts(e).forEach((p) => ids.push(p))); selP.forEach((p) => ids.push(p)); } else ids = dpOrder();
      return [...new Set(ids)].filter((id) => { const p = I.P.get(id); return p && !p.ref; });
    }
    const dpSame = (c, spec) => c.type === spec.type && (c.kind || '') === (spec.kind || '') && c.e.length === spec.e.length && c.e.every((x, i) => x === spec.e[i]);
    const dpFind = (spec) => sk.cons.find((c) => dpSame(c, spec));
    const dpSigned = (spec) => spec.type === 'hdist' || spec.type === 'vdist' || (spec.type === 'distance' && spec.kind === 'pl');
    function dpVal(spec) {
      try {
        let c = dpFind(spec);
        if (c) return (dpSigned(c) ? (c.s || 1) : 1) * K.measure(sk, c);
        c = { type: spec.type, e: spec.e.slice() }; if (spec.kind) c.kind = spec.kind; K.initSign(sk, c);
        return (dpSigned(c) ? (c.s || 1) : 1) * K.measure(sk, c);
      } catch (e) { return NaN; }
    }
    function dpSet(spec, raw) {
      let v; try { v = evalExpr(String(raw).trim().replace(/,/g, '.')); } catch (e1) { toast('Invalid value', true); return false; }
      if (!isFinite(v)) { toast('Invalid value', true); return false; }
      const signed = dpSigned(spec);
      if (!signed && !(v > 0)) { toast('Value must be positive', true); return false; }
      let c = dpFind(spec);
      if (c && c.driven) { toast('That distance is a reference (measured) dimension: delete it in the list below to drive it', true); return false; }
      const before = snap(); push();
      if (!c) {
        const rank0 = st.ana ? st.ana.rank : K.analyze(sk).rank;
        c = { type: spec.type, e: spec.e.slice() }; if (spec.kind) c.kind = spec.kind; addCon(c); c.v = K.measure(sk, c);
        if (K.analyze(sk).rank <= rank0) { c.driven = true; changed(); toast('Already fixed by other constraints: added as a reference (measured) dimension', true); return false; }
      }
      if (signed) { c.s = v >= 0 ? 1 : -1; c.v = Math.abs(v); } else c.v = v;
      if (!solveOrRevert(before, 'That value cannot be satisfied with the other constraints')) return false;
      changed(); return true;
    }
    function dpDimPoint(pid) {
      const p = I.P.get(pid); if (!p || p.ref) throw new Error('Select a sketch point');
      dpS.mode = 'origin'; dpS.pref = true; try { localStorage.setItem('aakar.sk.dimpanel', '1'); } catch (e0) { /* ignore */ }
      push(); let added = 0;
      ['hdist', 'vdist'].forEach((type) => {
        if (dpFind({ type, e: ['O', pid] })) return;
        const rank0 = K.analyze(sk).rank, c = { type, e: ['O', pid] }; addCon(c); c.v = K.measure(sk, c);
        if (K.analyze(sk).rank <= rank0) sk.cons.pop(); else added++;
      });
      K.solve(sk); st.sel = [{ kind: 'pt', id: pid }]; changed(); dpOpen(false); dpRender(true);
      toast(added ? 'X and Y of ' + dpName(pid) + ' are now dimensions: type the values in the table' : dpName(pid) + ' is already fully defined by other constraints');
      setTimeout(() => { const i = dpS.el && dpS.el.querySelector('input[data-t=hdist]'); if (i) { i.focus(); i.select(); } }, 30);
    }
    function dpSpecs(mode, ids, i) {
      const id = ids[i], prev = ids[i - 1];
      if (mode === 'origin' || (mode === 'chain' && i === 0)) return [{ l: 'X', t: 'hdist', e: ['O', id] }, { l: 'Y', t: 'vdist', e: ['O', id] }];
      if (mode === 'chain') return [{ l: 'ΔX', t: 'hdist', e: [prev, id] }, { l: 'ΔY', t: 'vdist', e: [prev, id] }, { l: 'L', t: 'distance', e: [prev, id] }];
      return [{ l: 'd', t: 'distance', k: 'pl', e: [id, dpS.ref] }];
    }
    function dpCell(sp, p) {
      const spec = { type: sp.t, kind: sp.k, e: sp.e }, c = dpFind(spec), val = dpVal(spec), key = sp.t + '/' + (sp.k || '') + '/' + sp.e.join(',');
      return '<label class="c' + (c ? (c.driven ? ' dim drv' : ' dim') : '') + (p && p.fixed ? ' fx' : '') + '" title="' + (c ? (c.driven ? 'Reference (measured) dimension' : 'Driving dimension') : 'No dimension yet: type a value and press Enter to create one') + '"><i>' + sp.l + '</i><input data-t="' + sp.t + '" data-k="' + (sp.k || '') + '" data-e="' + sp.e.join(',') + '" data-key="' + key + '" value="' + (isFinite(val) ? dpFx(val) : '') + '"' + ((p && p.fixed) || (c && c.driven) ? ' disabled' : '') + '></label>';
    }
    function dpDesc(c) {
      const n = dpName;
      if (c.type === 'hdist') return 'Horizontal ' + n(c.e[0]) + ' → ' + n(c.e[1]);
      if (c.type === 'vdist') return 'Vertical ' + n(c.e[0]) + ' → ' + n(c.e[1]);
      if (c.type === 'distance' && c.kind === 'pl') return 'Distance ' + n(c.e[0]) + ' to ' + dpLineName(c.e[1]);
      if (c.type === 'distance') return 'Distance ' + n(c.e[0]) + ' – ' + n(c.e[1]);
      if (c.type === 'length') return 'Length of ' + dpLineName(c.e[0]);
      if (c.type === 'radius') return 'Radius'; if (c.type === 'diameter') return 'Diameter'; if (c.type === 'angle') return 'Angle (°)';
      return c.type;
    }
    function dpParts() {
      const ids = dpIds(), dims = sk.cons.filter((c) => K.DIM_TYPES.has(c.type)), M = dpS.mode;
      const lines = sk.ents.filter((e) => e.type === 'line');
      if (!lines.some((e) => e.id === dpS.ref)) dpS.ref = 'AX';
      const selLine = st.sel.filter((s) => s.kind === 'ent').map((s) => I.E.get(s.id)).find((e) => e && e.type === 'line');
      const shown = ids.slice(0, 80);
      let h = '<div class="modes"><span style="color:var(--mut,#8a97ad)">Measure</span><button data-mode="origin"' + (M === 'origin' ? ' class="on"' : '') + ' title="X and Y of every point from the origin">from origin</button><button data-mode="chain"' + (M === 'chain' ? ' class="on"' : '') + ' title="Each point from the previous one: ΔX, ΔY and straight distance">between points</button><button data-mode="line"' + (M === 'line' ? ' class="on"' : '') + ' title="Perpendicular distance from each point to a reference line">to a line</button></div>';
      if (M === 'line') h += '<div class="modes"><span style="color:var(--mut,#8a97ad)">Reference</span><select data-ref>' + lines.map((e) => '<option value="' + e.id + '"' + (e.id === dpS.ref ? ' selected' : '') + '>' + dpEsc(dpLineName(e.id)) + '</option>').join('') + '</select>' + (selLine && selLine.id !== dpS.ref ? '<button data-usesel="' + selLine.id + '">use selected</button>' : '') + '</div>';
      h += '<h5>' + (st.sel.length ? 'Selected points' : 'All points') + ' (' + ids.length + ')' + (ids.length > shown.length ? ', first ' + shown.length : '') + (st.sel.length ? ' <button data-clearsel title="Clear the selection and list every point" style="background:none;border:1px solid var(--line,#2c3547);color:var(--txt,#dfe6f2);border-radius:5px;padding:0 6px;margin-left:6px;cursor:pointer;font-size:11px;text-transform:none;letter-spacing:0">show all</button>' : '') + '</h5><table>' + shown.map((id, i) => { const p = I.P.get(id), cells = dpSpecs(M, ids, i); return '<tr data-pid="' + id + '"><td class="n" title="Hover to highlight on the sketch">' + dpName(id) + '</td>' + cells.map((sp) => '<td>' + dpCell(sp, p) + '</td>').join('') + '</tr>'; }).join('') + '</table>' + (ids.length ? '' : '<p class="note">Draw something: its points appear here.</p>');
      const t1 = { h, sig: [M, dpS.ref, ids.join(','), st.sel.length ? 's' : 'a', selLine ? selLine.id : ''].join('|') };
      const t2 = { h: '<h5>Dimensions (' + dims.length + ')</h5>' + (dims.length ? dims.map((c) => { const val = dpVal({ type: c.type, kind: c.kind, e: c.e }); return '<div class="dl"><span title="' + dpEsc(dpDesc(c)) + '">' + dpEsc(dpDesc(c)) + '</span><label class="c' + (c.driven ? ' dim drv' : ' dim') + '"><i>' + (c.driven ? '(ref)' : '=') + '</i><input data-cid="' + c.id + '" data-key="c:' + c.id + '" value="' + (isFinite(val) ? dpFx(val) : '') + '"' + (c.driven ? ' disabled' : '') + '></label><button data-del="' + c.id + '" title="Delete this dimension">✕</button></div>'; }).join('') : '<p class="note">None yet. Type a value in a box above and press Enter: that creates the dimension.</p>'), sig: dims.map((c) => c.id + (c.driven ? 'd' : '')).join(',') };
      const dof = st.ana ? st.ana.dof : '?', st3 = st.conflict ? 'Conflicting constraints' : dof === 0 ? 'Fully constrained' : dof + ' DOF left';
      const t3 = { h: '<div class="ft"><span>' + st3 + '</span><span style="flex:1"></span><button data-a="auto" title="Add every missing size and position, until fully defined">Auto-dimension</button></div><p class="note">Type a value, then Enter (↑ ↓ move between rows, Tab goes to the next box). A negative X / Y / distance puts the point on the other side.</p>', sig: st3 };
      return [t1, t2, t3];
    }
    function dpRender(force) {
      const el = dpS.el; if (!el || !dpS.on) return;
      const bd = el.querySelector('.bd'); if (bd.children.length !== 3) { bd.innerHTML = '<div class="p1"></div><div class="p2"></div><div class="p3"></div>'; dpS.sigs = null; }
      if (!dpS.sigs) dpS.sigs = ['', '', ''];
      const act = el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' ? document.activeElement : null, key = act ? act.dataset.key : null, selS = act ? [act.selectionStart, act.selectionEnd] : null;
      const parts = dpParts();
      parts.forEach((p, i) => { if (force || dpS.sigs[i] !== p.sig) { dpS.sigs[i] = p.sig; bd.children[i].innerHTML = p.h; } });
      // refresh values and states in place (never touches the box being typed in)
      el.querySelectorAll('input[data-key]').forEach((i) => {
        let spec, c, fixed = false;
        if (i.dataset.cid) { c = sk.cons.find((x) => x.id === i.dataset.cid); if (!c) return; spec = { type: c.type, kind: c.kind, e: c.e }; }
        else { spec = { type: i.dataset.t, kind: i.dataset.k || undefined, e: i.dataset.e.split(',') }; c = dpFind(spec); const p = I.P.get(spec.e[spec.e.length - 1]); fixed = !!(p && p.fixed); }
        const lab = i.parentNode; if (lab && lab.classList) { lab.classList.toggle('dim', !!c); lab.classList.toggle('drv', !!(c && c.driven)); }
        if (!i.dataset.cid) i.disabled = fixed || !!(c && c.driven);
        if (i === act) return; const v = dpVal(spec); if (isFinite(v)) i.value = dpFx(v);
      });
      if (key && !el.contains(document.activeElement)) { const n = [...el.querySelectorAll('input[data-key]')].find((i) => i.dataset.key === key); if (n && !n.disabled) { n.focus(); if (selS) try { n.setSelectionRange(selS[0], selS[1]); } catch (e2) { /* ignore */ } } }
      const tb = bar.querySelector('[data-tool=dimtab]'); if (tb) tb.classList.toggle('on', dpS.on);
    }
    function dpWire(el) {
      const stop = (e) => e.stopPropagation();
      ['keydown', 'keyup', 'keypress', 'wheel', 'dblclick', 'contextmenu'].forEach((ev) => el.addEventListener(ev, stop));
      el.addEventListener('pointerdown', stop);
      el.addEventListener('change', (e) => {
        const i = e.target; if (i.tagName !== 'INPUT') return; let spec;
        if (i.dataset.cid) { const c = sk.cons.find((x) => x.id === i.dataset.cid); if (!c) return; spec = { type: c.type, kind: c.kind, e: c.e }; } else spec = { type: i.dataset.t, kind: i.dataset.k || undefined, e: i.dataset.e.split(',') };
        if (i.dataset.cid) { const c = sk.cons.find((x) => x.id === i.dataset.cid); let v; try { v = evalExpr(String(i.value).trim().replace(/,/g, '.')); } catch (e1) { toast('Invalid value', true); dpRender(true); return; } if (!isFinite(v) || (!dpSigned(c) && c.type !== 'angle' && !(v > 0))) { toast('Value must be positive', true); dpRender(true); return; } const before = snap(); push(); if (dpSigned(c)) { c.s = v >= 0 ? 1 : -1; c.v = Math.abs(v); } else c.v = c.type === 'angle' ? Math.abs(v) : v; if (solveOrRevert(before, 'That value cannot be satisfied with the other constraints')) changed(); else dpRender(true); return; }
        if (!dpSet(spec, i.value)) dpRender(true);
      });
      el.addEventListener('keydown', (e) => {
        const i = e.target; if (i.tagName !== 'INPUT') return;
        if (e.key === 'Enter') { e.preventDefault(); const k = i.dataset.key; i.blur(); setTimeout(() => { const n = [...el.querySelectorAll('input[data-key]')].find((x) => x.dataset.key === k); if (n && !n.disabled) { n.focus(); n.select(); } }, 0); }
        else if (e.key === 'Escape') { e.preventDefault(); dpRender(true); i.blur(); cv.focus(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const all = [...el.querySelectorAll('tr[data-pid] input:not([disabled])')], col = [...i.closest('tr').querySelectorAll('input')].indexOf(i), rows = [...el.querySelectorAll('tr[data-pid]')], r = rows.indexOf(i.closest('tr'));
          if (r < 0) return; e.preventDefault(); const tgt = rows[r + (e.key === 'ArrowDown' ? 1 : -1)]; if (tgt) { const n = tgt.querySelectorAll('input')[col] || tgt.querySelector('input'); if (n && !n.disabled) { i.blur(); setTimeout(() => { n.focus(); n.select(); }, 0); } } void all;
        }
      });
      el.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT' && e.target.select) setTimeout(() => { try { e.target.select(); } catch (x) { /* ignore */ } }, 0); const tr = e.target.closest && e.target.closest('tr[data-pid]'); if (tr) { st.hover = { kind: 'pt', id: tr.dataset.pid }; draw(); } });
      el.addEventListener('mouseover', (e) => { const tr = e.target.closest && e.target.closest('tr[data-pid]'); if (tr && (!st.hover || st.hover.id !== tr.dataset.pid)) { st.hover = { kind: 'pt', id: tr.dataset.pid }; draw(); } });
      el.addEventListener('mouseleave', () => { if (st.hover && st.hover.kind === 'pt') { st.hover = null; draw(); } });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mode) { dpS.mode = b.dataset.mode; dpRender(true); }
        else if ('clearsel' in b.dataset) { st.sel = []; draw(); changed(); }
        else if (b.dataset.usesel) { dpS.ref = b.dataset.usesel; dpRender(true); }
        else if (b.dataset.del) { const before = snap(); push(); const k = sk.cons.findIndex((c) => c.id === b.dataset.del); if (k >= 0) sk.cons.splice(k, 1); K.solve(sk); void before; changed(); }
        else if (b.dataset.a === 'auto') { try { autoDim(); } catch (err) { toast(err.message, true); } }
        else if (b.dataset.a === 'min') el.classList.toggle('min');
        else if (b.dataset.a === 'x') dpClose(true);
      });
      el.addEventListener('change', (e) => { const s = e.target.closest && e.target.closest('select[data-ref]'); if (s) { dpS.ref = s.value; dpRender(true); } });
      const hd = el.querySelector('header');
      hd.onpointerdown = (e) => { if (e.target.tagName === 'BUTTON') return; hd.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; hd.onpointermove = (ev) => { el.style.left = Math.max(0, Math.min(rr.width - 120, ev.clientX - rr.left - dx)) + 'px'; el.style.top = Math.max(0, Math.min(rr.height - 40, ev.clientY - rr.top - dy)) + 'px'; el.style.right = 'auto'; }; hd.onpointerup = () => { hd.onpointermove = null; }; };
    }
    function dpOpen(auto) {
      dpCss();
      if (!dpS.el) {
        const el = document.createElement('div'); el.className = 'sk-dp';
        el.innerHTML = '<header><b>Points &amp; dimensions</b><button data-a="min" title="Collapse">▾</button><button data-a="x" title="Close (the table button in the Dimension group opens it again)">✕</button></header><div class="bd"></div>';
        root.appendChild(el); dpS.el = el; dpWire(el);
      } else if (!dpS.el.isConnected) root.appendChild(dpS.el);
      dpS.el.style.top = (bar.offsetHeight + 8) + 'px';
      dpS.on = true; dpS.sigs = null; dpRender(true);
    }
    function dpClose(user) {
      if (dpS.el && dpS.el.isConnected) dpS.el.remove(); dpS.on = false; st.hover = null;
      const tb = bar.querySelector('[data-tool=dimtab]'); if (tb) tb.classList.remove('on');
      if (user) { dpS.pref = false; try { localStorage.setItem('aakar.sk.dimpanel', '0'); } catch (e0) { /* ignore */ } toast('Points & dimensions closed. The table button in the Dimension group opens it again.'); }
      draw();
    }
    function dpToggle() { if (dpS.on) dpClose(true); else { dpS.pref = true; try { localStorage.setItem('aakar.sk.dimpanel', '1'); } catch (e0) { /* ignore */ } dpOpen(false); } }
    function dpSync() {
      if (!dpS.init) return;
      const n = sk.ents.filter((e) => !e.ref).length;
      if (!dpS.on && dpS.pref && n > dpS.last) dpOpen(true);
      dpS.last = n;
      if (dpS.on) dpRender();
    }
    dpS.last = sk.ents.filter((e) => !e.ref).length;
    dpS.init = true; if (dpS.pref && dpS.last > 0) dpOpen(true);

    // ------------------------------------------------------------------ 8.18.3 · whole-shape selection, palette commands, keep the panel off the drawing
    function selectChain(id) {
      const ends = (e) => e.type === 'line' || e.type === 'arc' ? [e.p1, e.p2] : K.CURVE_T.has(e.type) ? (() => { const c = K.curveIds(e); return [c[0], c[c.length - 1]]; })() : [];
      const first = I.E.get(id); if (!first) return;
      const ents = sk.ents.filter((e) => !e.ref), seen = new Set([id]), pts = new Set(ends(first)); let grow = true;
      while (grow) { grow = false; ents.forEach((e) => { if (seen.has(e.id)) return; const en = ends(e); if (en.length && en.some((p) => pts.has(p))) { seen.add(e.id); en.forEach((p) => pts.add(p)); grow = true; } }); }
      st.sel = [...seen].map((i) => ({ kind: 'ent', id: i })); draw();
      toast(seen.size > 1 ? 'Whole shape selected (' + seen.size + ' objects): Delete removes it, Esc deselects' : 'Object selected: Delete removes it, Esc deselects');
    }
    function dpAvoidW() { return (typeof dpS !== 'undefined' && dpS && dpS.on && dpS.el && dpS.el.isConnected && !dpS.el.classList.contains('min')) ? Math.min(dpS.el.offsetWidth + 24, cv.clientWidth * 0.5) : 0; }
    function dpAvoid() {
      const el = dpS.el; if (!el || !el.isConnected) return;
      const xs = sk.pts.filter((p) => !p.ref).map((p) => toS([p.x, p.y])[0]); if (!xs.length) return;
      const left = cv.clientWidth - el.offsetWidth - 22, mx = Math.max(...xs) + 8, mn = Math.min(...xs) - 8;
      if (mx > left) { const shift = Math.min(mx - left, mn - 14); if (shift > 1) { view.cx -= shift; draw(); } }
    }
    const SK_LABEL = { select: 'Select', line: 'Line', rect: 'Rectangle', circle: 'Circle', arc: 'Arc (centre, start, end)', point: 'Point', constr: 'Construction line (toggle)', project: 'Project face outline', spline: 'Spline (fit points)', bspline: 'NURBS spline (control points)', bezier: 'Bézier curve', conic: 'Conic', ellipse: 'Ellipse', splinedeg: 'Spline degree', splineclose: 'Open / close spline', splinerho: 'Conic ρ / ellipse ratio', coincident: 'Constraint: coincident', horizontal: 'Constraint: horizontal', vertical: 'Constraint: vertical', parallel: 'Constraint: parallel', perpendicular: 'Constraint: perpendicular', tangent: 'Constraint: tangent', equal: 'Constraint: equal', midpoint: 'Constraint: midpoint', symmetric: 'Constraint: symmetric', fix: 'Constraint: fix', dim: 'Smart dimension', hdim: 'Horizontal dimension', vdim: 'Vertical dimension', autodim: 'Auto-dimension', dimtab: 'Points & dimensions table', del: 'Delete selection', undo: 'Undo (sketch)', redo: 'Redo (sketch)', fit: 'Fit sketch to window', ok: 'Finish sketch', cancel: 'Cancel sketch' };
    function skCommands() {
      const out = [];
      TB.forEach(([g, items]) => items.forEach(([ic, title, fn]) => out.push({ id: ic, label: SK_LABEL[ic] || title.split(/\s*[(:·]/)[0], title: title + (ic === 'constr' ? ' · construction line, dashed, not part of the profile' : ''), group: 'Sketch' + (g ? ' › ' + g : ''), fn: () => { try { fn(); } catch (e) { toast(e.message, true); } cv.focus(); } })));
      return out;
    }
