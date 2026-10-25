"""Fixes 2 and 3: Points & dimensions panel (opens by itself), single-point dimensions from the origin."""
def S(h,old,new):
    assert h.count(old)==1,(old[:100],h.count(old)); return h.replace(old,new)
def apply(h):
    import os; js=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'aakar-sketch-dimension-panel.js'),encoding='utf-8').read()
    assert '</script' not in js.lower()
    # toolbar icon + button
    h=S(h,"    const TB = [\n      ['Draw', [","    ICON.dimtab = '<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18 M3 14h18 M11 4v16\"/>';\n    const TB = [\n      ['Draw', [")
    h=S(h,"() => autoDim()]]],","() => autoDim()], ['dimtab', 'Points & dimensions table: edit every point (X, Y from the origin), distances between points, or distances to a reference line. Opens by itself after you draw.', () => dpToggle()]]],")
    # live refresh + auto-open
    h=S(h,"d.className = 'sk-dof' + (st.conflict ? ' bad' : dof === 0 ? ' full' : '');\n      draw();\n    }","d.className = 'sk-dof' + (st.conflict ? ' bad' : dof === 0 ? ' full' : '');\n      draw();\n      if (typeof dpSync === 'function') dpSync();\n    }")
    # single point = X and Y from the origin
    h=S(h,"if (force) { if (pts.length === 2) c = { type: force, e: pts };","if (force) { if (pts.length === 2) c = { type: force, e: pts }; else if (pts.length === 1 && !ents.length) c = { type: force, e: ['O', pts[0]] };")
    h=S(h,"      else if (pts.length === 2 && !ents.length) c = { type: 'distance', e: pts };","      else if (pts.length === 1 && !ents.length) { dpDimPoint(pts[0]); return; }\n      else if (pts.length === 2 && !ents.length) c = { type: 'distance', e: pts };")
    h=S(h,"throw new Error('Dimension: select a line, a circle/arc, 2 points, a point + line, or 2 lines');","throw new Error('Dimension: select a point, a line, a circle/arc, 2 points, a point + line, or 2 lines');")
    # the sketcher's window-level key handler must ignore typing inside the panel (Enter = Finish, Backspace = delete, letters = tools)
    h=S(h,"if (e.target === valIn || !root.isConnected) return;","if (e.target === valIn || !root.isConnected || (typeof dpS !== 'undefined' && dpS && dpS.el && dpS.el.contains(e.target))) return;")
    # the panel itself + guard + api
    h=S(h,"    K.solve(sk); setTool('select'); resize(); changed(); fit(); setTimeout(() => cv.focus(), 30);\n    return { finish, cancel, sketch: sk, api: { commitCurve, autoDim, insertCurvePt, splineDegree, splineClose, setTool, applyCon, applyDim, toW, toS, pick, select: (items) => { st.sel = items; draw(); }, state: st, view, changed, editDim } };",
        js.replace("function dpSync() {\n      if (!dpS.init) return;","function dpSync() {\n      if (typeof dpS === 'undefined' || !dpS || !dpS.init) return;")+
        "    K.solve(sk); setTool('select'); resize(); changed(); fit(); setTimeout(() => cv.focus(), 30);\n    return { finish, cancel, sketch: sk, api: { commitCurve, autoDim, insertCurvePt, splineDegree, splineClose, setTool, applyCon, applyDim, toW, toS, pick, select: (items) => { st.sel = items; draw(); }, state: st, view, changed, editDim, dp: { state: dpS, open: () => dpOpen(false), close: () => dpClose(false), render: () => dpRender(true), set: dpSet, dimPoint: dpDimPoint } } };")
    return h
