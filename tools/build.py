#!/usr/bin/env python3
"""Rebuild Aakar 8.20.0 (Waves 1 + 2) from a stock Aakar 8.18.4 index.html.
usage:  python tools/build.py  path/to/index_8.18.4.html  [output.html]
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'index.html')
SEED = "<script id=\"aakar-w1-seed\">(function(){try{var K='prism.v7.layout',o=JSON.parse(localStorage.getItem(K)||'{}')||{};if(o.w1layout)return;o.collapsed=o.collapsed||{};['Sketch+ examples','Examples','Kernel','Macros','Mesh','Export 3D'].forEach(function(t){if(o.collapsed[t]===undefined)o.collapsed[t]=true;});o.w1layout=1;localStorage.setItem(K,JSON.stringify(o));}catch(e){}})();(function(){try{var K='prism.v7.layout',o=JSON.parse(localStorage.getItem(K)||'{}')||{};if(o.w2layout)return;o.collapsed=o.collapsed||{};if(o.collapsed['Curves & curvature']===undefined)o.collapsed['Curves & curvature']=true;o.w2layout=1;localStorage.setItem(K,JSON.stringify(o));}catch(e){}})();</script>"
s = open(src, encoding='utf8').read()
assert '8.18.4' in s, 'This build script expects an Aakar 8.18.4 index.html as input'
s = s.replace('8.18.4', '8.20.0')
i0 = s.find('<head>'); assert i0 >= 0, 'head not found'
s = s[:i0 + 6] + SEED + s[i0 + 6:]                       # ribbon defaults: demo / rarely used groups start collapsed (once)
a = "function gizmoHandles() {\n    if (!st.sel || st.sketching || document.body.classList.contains('i3d-on')) return null;"
assert a in s, 'gizmo anchor not found'
s = s.replace(a, "function gizmoHandles() {\n    if (window.AAKAR_W1 && window.AAKAR_W1.gumballOn) return null;\n    if (!st.sel || st.sketching || document.body.classList.contains('i3d-on')) return null;", 1)
exec(open(os.path.join(ROOT, 'patches', '10_sketch.py'), encoding='utf8').read())      # sketch Fillet / Trim / Extend / Offset / Mirror
inj = ''
import glob
ORDER = ['aakar-w1-edit.js', 'aakar-w1-joints.js', 'aakar-w1-radial.js', 'aakar-w1-layout.js', 'aakar-w2-core.js', 'aakar-w2-shape.js', 'aakar-w2-curves.js', 'aakar-w2-analysis.js']
for m in [x for x in ORDER if os.path.exists(os.path.join(ROOT, 'addons', x))]:
    code = open(os.path.join(ROOT, 'addons', m), encoding='utf8').read(); assert '</script' not in code
    inj += '\n<!--AAKAR-W1-%s-->\n<script id="aakar-%s">\n%s\n</script>\n' % (m, m[:-3], code)
i = s.rfind('</body>'); s = s[:i] + inj + s[i:]
open(out, 'w', encoding='utf8').write(s); print('built', out, len(s), 'bytes')
