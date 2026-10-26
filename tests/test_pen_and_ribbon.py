import sys; sys.path.insert(0,'/home/claude')
from common import *
with sync_playwright() as p:
    b,pg=open_app(p,'index.html',hide_wheel=True); box_scene(pg,"st.sel=null;")
    pg.evaluate("()=>{PRISM.setTab('nurbsx')}"); pg.wait_for_timeout(2500)
    print('Curves+ & Curvature+ buttons:',pg.evaluate("()=>[...document.querySelectorAll('#tb-w2bridge,#tb-w2iso,#tb-w2edge,#tb-w2pen,#tb-w2cmap,#tb-w2isodisp,#tb-w2sec')].map(b=>b.textContent.trim()).join(' | ')"))
    pg.evaluate("()=>AAKAR_W1.curvesApi.penStart()"); pg.wait_for_timeout(300)
    # pen on the top face of the box: click 4 points on the model
    pos=pg.evaluate('''()=>{const s=PRISM.st.bodies[0].solid,M=PRISM.R.matrices(),r=document.querySelector('#cv').getBoundingClientRect(); const fi=s.F.findIndex(f=>f.n[2]>0.99); const c=s.faceCentroid(fi); const P=[[-25,-10],[-8,12],[10,-8],[28,10]].map(([x,y])=>{const q=PRISM.R.project([c[0]+x,c[1]+y,c[2]],M);return [q[0]+r.left,q[1]+r.top]}); return P}''')
    for i,(x,y) in enumerate(pos):
        pg.mouse.move(x,y); pg.wait_for_timeout(80); pg.mouse.click(x,y); pg.wait_for_timeout(400)
    print('pen points:',pg.evaluate("()=>AAKAR_W1.curvesApi.PEN.pts.map(p=>p.map(v=>+v.toFixed(1)).join(','))"))
    pg.screenshot(path='/home/claude/pen1.png',clip={'x':260,'y':134,'width':970,'height':690})
    pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    print('items:',pg.evaluate("()=>PRISM.st.items.map(i=>i.kind+':'+i.name).join(',')"),'| feature:',pg.evaluate("()=>PRISM.st.doc.features.map(f=>f.name).join(' | ')"))
    pg.evaluate("()=>{const it=PRISM.st.items[0]; const c=it.crv; const a=c.U[c.p],bb=c.U[c.U.length-c.p-1]; window.__z=[0,0.5,1].map(t=>+CAD.nurbs.curvePoint(c,a+(bb-a)*t)[2].toFixed(2))}"); print('curve z at 0,.5,1 (top face is z=30):',pg.evaluate("()=>window.__z"))
    print(pg.errs[:3]); b.close()
