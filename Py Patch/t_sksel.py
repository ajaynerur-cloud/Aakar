import sys,json
from lib import *; from sk import *
b=B(sys.argv[1]); b.pg.set_default_timeout(8000); open_sketch(b,'XY'); pg=b.pg; R=[]
def check(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,x)
pg.click('#sketcher .sk-btn[data-tool=rect]')
def clk(xy,**k):
    sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",list(xy)); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}"); pg.mouse.click(r[0]+sx,r[1]+sy,**k); pg.wait_for_timeout(120)
set_view(b,3.0,160,120)
clk((20,20)); clk((90,70)); pg.keyboard.press('Escape'); pg.evaluate("()=>PRISM.st.skHandle.api.setTool('select')")
# a circle too, so we can see that delete only takes the selected shape
pg.click('#sketcher .sk-btn[data-tool=circle]'); clk((-40,-30)); clk((-40,-10)); pg.keyboard.press('Escape'); pg.evaluate("()=>PRISM.st.skHandle.api.setTool('select')")
check('the panel opened by itself',pg.evaluate("()=>!!document.querySelector('.sk-dp')"))
# panel must not hide the drawing
geo=pg.evaluate("()=>{ const a=PRISM.st.skHandle.api, sk=PRISM.st.skHandle.sketch; const xs=sk.pts.filter(p=>!p.ref).map(p=>a.toS([p.x,p.y])[0]); const pl=document.querySelector('.sk-dp').getBoundingClientRect(), cv=document.querySelector('#sketcher .sk-cv').getBoundingClientRect(); return {maxGeoX:Math.max(...xs)+cv.left, panelLeft:pl.left}; }")
check('the geometry is not hidden behind the Points & dimensions panel',geo['maxGeoX']<=geo['panelLeft']-4,str(geo))
pg.screenshot(path='/home/claude/a/k0.png',clip={'x':260,'y':270,'width':970,'height':530})
# 1) single click on one edge selects that edge only
clk((55,20)); n1=pg.evaluate("()=>PRISM.st.skHandle.api.state.sel.length"); check('single click selects ONE line',n1==1,str(n1)); pg.screenshot(path='/home/claude/a/k1.png',clip={'x':260,'y':270,'width':970,'height':530})
# 2) double-click selects the whole rectangle
sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",[55,20]); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}")
pg.mouse.dblclick(r[0]+sx,r[1]+sy); pg.wait_for_timeout(250); sel=pg.evaluate("()=>PRISM.st.skHandle.api.state.sel.map(s=>s.kind)"); check('double-click selects the whole connected shape (4 lines)',len(sel)==4 and set(sel)=={'ent'},str(sel))
check('toast explains Delete',pg.evaluate("()=>/Whole shape selected/.test(document.body.innerText)"))
pg.screenshot(path='/home/claude/a/k2.png',clip={'x':260,'y':270,'width':970,'height':530})
# 3) the circle is untouched, then Delete removes exactly the rectangle
ents0=state(b)['ents']; pg.keyboard.press('Delete'); pg.wait_for_timeout(300); ents1=state(b)['ents']
check('Delete removed the whole rectangle and kept the circle',len(ents0)==5 and len(ents1)==1 and ents1[0].startswith('circle'),f'{len(ents0)} -> {len(ents1)} {ents1}')
pg.keyboard.press('Control+z'); pg.wait_for_timeout(300); check('Ctrl+Z restores it',len(state(b)['ents'])==5)
# 4) double-click a circle selects it alone; double-click a spline still inserts a point (existing behaviour)
sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",[-40+0,-10]); pg.mouse.dblclick(r[0]+sx,r[1]+sy); pg.wait_for_timeout(250); check('double-click on a circle selects just the circle',pg.evaluate("()=>PRISM.st.skHandle.api.state.sel.length")==1)
print('page errors',b.errs[:2]); print('%d / %d passed'%(sum(R),len(R))); b.close()
