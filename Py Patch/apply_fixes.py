#!/usr/bin/env python3
"""Applies all fixes (8.18.1 - 8.18.3) to an Aakar 8.18.0 single-file HTML.
   1. Search / Ctrl+K: lists ALL tools from the tool registry (no tab switching, no 40 cap)          [patch1_search.py]
   2. Sketcher: Points & dimensions panel, D on one point, distances between points / to a line         [patch2_sketch_dimensions.py]
   3. 8.18.3: stretched dimension value box, typing in Search while sketching, push/pull symbol,
              selected-object highlight (3D red 'about to delete', sketch halo + whole-shape select)  [patch3_ux_fixes.py]
usage:  python apply_fixes.py index.html [out.html]
needs the three patch scripts and aakar-sketch-dimension-panel.js, aakar-ux-8183.js in the same folder."""
import os,sys,importlib
here=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,here)
if len(sys.argv)<2: sys.exit(__doc__)
src=sys.argv[1]; dst=sys.argv[2] if len(sys.argv)>2 else os.path.splitext(src)[0]+'_8.18.3.html'
h=open(src,encoding='utf-8').read()
if 'id="aakar-tutorial-watch"' not in h or "function harvest() {\n    const cur = st.tab" not in h: sys.exit('This does not look like an unpatched Aakar 8.18.0 file.')
for m in ('patch1_search','patch2_sketch_dimensions','patch3_ux_fixes'): h=importlib.import_module(m).apply(h)
h=h.replace('8.18.0','8.18.3'); open(dst,'w',encoding='utf-8').write(h); print('wrote',dst)
