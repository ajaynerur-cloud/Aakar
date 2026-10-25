"""8.18.3: four UX fixes.
   1. sketch dimension value box was as wide as the whole sketch (global input{width:100%} beat .sk-val)
   2. keys typed in Search while sketching no longer trigger sketch shortcuts; the palette also lists sketch commands
   3. push / pull symbol: Instant3D turns on after Extrude with a push/pull handle; press-pull gets PULL+/PUSH- badges
   4. selected objects: whole-body outline + red 'about to delete', sketch halo, whole-shape select (double-click)"""
import os
def S(h,old,new,count=1):
    assert h.count(old)==count,(old[:110],h.count(old)); return h.replace(old,new)
def apply(h):
    here=os.path.dirname(os.path.abspath(__file__))
    ux=open(os.path.join(here,'aakar-ux-8183.js'),encoding='utf-8').read(); assert '</script' not in ux.lower()
    # ---- 1. value box width
    h=S(h,".sk-val{position:absolute;width:90px;z-index:35;",".sk-val,#sketcher .sk-val,#sketcher input.sk-val{position:absolute;width:90px;max-width:140px;min-width:0;box-sizing:border-box;z-index:35;")
    # ---- 2. keys in any text box belong to the text box
    h=S(h,"(typeof dpS !== 'undefined' && dpS && dpS.el && dpS.el.contains(e.target))) return;",
         "(typeof dpS !== 'undefined' && dpS && dpS.el && dpS.el.contains(e.target)) || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable))) return;")
    h=S(h,"    CMDS = [...seen.values()].concat(extra.map(",
         "    const skc = (st.skHandle && st.skHandle.api && st.skHandle.api.commands) ? st.skHandle.api.commands().map(c => ({ id: 'sk:' + c.id, label: c.label, title: c.title, tab: null, group: c.group, fn: c.fn })) : [];\n    CMDS = [...skc, ...seen.values()].concat(extra.map(")
    h=S(h,"dim: 'Smart dimension'","dim: 'Smart dimension'",0) if False else h
    h=S(h,"changed, editDim, dp: {","changed, editDim, commands: skCommands, dp: {")
    # ---- 4. sketch: selected shapes are impossible to miss, whole-shape select
    h=S(h,"        ctx.stroke(); ctx.setLineDash([]);\n      });\n      sk.pts.forEach(p => {",
         "        if (isSel(it)) { ctx.save(); ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,138,61,0.32)'; ctx.stroke(); ctx.restore(); }\n        ctx.stroke(); ctx.setLineDash([]);\n      });\n      const selPts = new Set(); st.sel.forEach(s2 => { if (s2.kind === 'ent') { const e2 = I.E.get(s2.id); if (e2) entPts(e2).forEach(q => selPts.add(q)); } });\n      sk.pts.forEach(p => {")
    h=S(h,"if (isSel(it)) col = COL.sel; else if (st.hover && st.hover.kind === 'pt'","if (isSel(it) || selPts.has(p.id)) col = COL.sel; else if (st.hover && st.hover.kind === 'pt'")
    h=S(h,"insertCurvePt(en, en.type === 'spline' && h.q ? h.q : toW([x, y]));\n    });","insertCurvePt(en, en.type === 'spline' && h.q ? h.q : toW([x, y]));\n      else if (en && !en.ref) selectChain(en.id);\n    });")
    h=S(h,"click a dimension value to edit', line:","click a dimension value to edit · double-click a line or arc to select the whole connected shape · Del deletes the selection', line:")
    h=S(h,"      const w = cv.clientWidth, h = cv.clientHeight;\n      view.s = Math.min(","      const w0 = cv.clientWidth, h = cv.clientHeight, w = w0 - (typeof dpAvoidW === 'function' ? dpAvoidW() : 0);\n      view.s = Math.min(")
    h=S(h,"      dpS.on = true; dpS.sigs = null; dpRender(true);\n    }","      dpS.on = true; dpS.sigs = null; dpRender(true);\n      if (auto) dpAvoid();\n    }")
    # ---- 3. Instant3D: push / pull handle for extrude features, switched on after Extrude
    h=S(h,"function chipText(h) { return '<span class=\"l\">'","const ppHandle = (h) => !!(I.f && (I.f.type === 'extrude' || I.f.type === 'faceExtrude') && (h.key === 'dist' || h.key === 'dist2'));\n  function chipText(h) { return (ppHandle(h) ? '<b class=\"pp\">⇅ PUSH / PULL</b>' : '') + '<span class=\"l\">'")
    h=S(h,"g.innerHTML = '<svg viewBox=\"0 0 24 24\"><path d=\"M5 12h12M12 6l6 6-6 6\"/></svg>'; layer.appendChild(g); h.grip = g;",
         "const pp = ppHandle(h); g.innerHTML = pp ? '<svg viewBox=\"0 0 24 24\"><path d=\"M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4\"/></svg>' : '<svg viewBox=\"0 0 24 24\"><path d=\"M5 12h12M12 6l6 6-6 6\"/></svg>'; if (pp) { g.classList.add('pp'); g.title = 'Push / Pull: drag to add or remove material (Shift = no snap)'; } layer.appendChild(g); h.grip = g;")
    h=S(h,"'Drag an arrow or click a value'","(f.type === 'extrude' || f.type === 'faceExtrude' ? 'Drag the ⇅ push / pull arrow, or click the value to type a distance' : 'Drag an arrow or click a value')")
    h=S(h,"const extrudeCmd = () => profileFeature('extrude', 'Extrude', { dist: 10, region: 'all' });",
         "const extrudeCmd = async () => {\n    const f = await profileFeature('extrude', 'Extrude', { dist: 10, region: 'all' });\n    try { const I3 = window.CAD && CAD.ref && CAD.ref.i3d; if (f && f.id && I3) { I3.set(true); I3.select(f.id); } } catch (e) { /* Instant3D not available */ }\n    return f;\n  };")
    # ---- 4. 3D: Delete on a face marks the whole body (red) before the second Delete removes it
    h=S(h,"if (st.sel.type !== 'body') { st.sel = { type: 'body', bodyId: st.sel.bodyId, bodyIds: [st.sel.bodyId] }; refreshPanels(); redraw(); return toast('Body selected — press Delete again to remove it'); }",
         "if (st.sel.type !== 'body') { st.sel = { type: 'body', bodyId: st.sel.bodyId, bodyIds: [st.sel.bodyId] }; st.delArm = st.sel.bodyId; refreshPanels(); redraw(); return toast('Whole body “' + ((bodyByKey(st.sel.bodyId) || {}).name || 'Body') + '” marked in red'); }")
    # ---- the 3D module, after the Tutorial Watch module
    blk='\n<!--AAKAR-UX-8183-START-->\n<script id="aakar-ux-8183">\n'+ux.rstrip()+'\n</script>\n<!--AAKAR-UX-8183-END-->\n'
    i=h.rfind('</body>'); assert i>0; h=h[:i]+blk+h[i:]
    return h
