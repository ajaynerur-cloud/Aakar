import os
frag=open(os.path.join(ROOT,'patches','aakar-w1-sketch-tools.fragment.js'),encoding='utf8').read()
assert '</script' not in frag
anchor="    const TB = [\n      ['Draw',"
assert s.count(anchor)==1,'TB anchor'
s=s.replace(anchor,frag+"\n"+anchor,1)
a2="      ['Edit', [['del', 'Delete (Del)'"
assert s.count(a2)==1,'Edit group anchor'
s=s.replace(a2,"      ['Modify', SKX.buttons],\n      ['Pattern & blocks', SKX.buttons2],\n"+a2,1)
a3="    function refreshBar() { bar.querySelectorAll('.sk-btn')"
assert s.count(a3)==1,'refreshBar anchor'
s=s.replace(a3,"    SKX.mountInputs(bar);\n"+a3,1)
a4="    function clickDraw(sx, sy) {\n      if (CURVE_TOOLS.has(st.tool)) {"
assert s.count(a4)==1,'clickDraw anchor'
s=s.replace(a4,"    function clickDraw(sx, sy) {\n      if (SKX.is(st.tool)) { SKX.click(sx, sy); return; }\n      if (CURVE_TOOLS.has(st.tool)) {",1)
a5="root.querySelector('.sk-hint').textContent = H[st.tool] || '';"
assert s.count(a5)==1,'hint anchor'
s=s.replace(a5,"root.querySelector('.sk-hint').textContent = H[st.tool] || SKX.hint(st.tool) || '';",1)

a6="      drawDraft();\n      if (st.snap && st.tool !== 'select')"
assert s.count(a6)==1,'draw anchor'
s=s.replace(a6,"      drawDraft();\n      try { SKX.drawComb(ctx); } catch (e) { /* comb is cosmetic */ }\n      if (st.snap && st.tool !== 'select')",1)
