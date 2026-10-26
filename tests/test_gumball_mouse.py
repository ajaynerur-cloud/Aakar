import sys; sys.path.insert(0,'/home/claude')
from common import *
with sync_playwright() as p:
    b,pg=open_app(p,'index.html'); box_scene(pg)
    pg.evaluate("()=>{AAKAR_W1.api.toggleGumball(true); PRISM.redraw()}"); pg.wait_for_timeout(300)
    JS='''(id)=>{const A=AAKAR_W1.api,L=A._layout(),M=PRISM.R.matrices(),cv=document.querySelector('#cv').getBoundingClientRect(); const it=L.items.find(i=>i.id===id); let p; if(it.kind==='p'){const q=it.quad.map(x=>PRISM.R.project(x,M)); p=[(q[0][0]+q[2][0])/2,(q[0][1]+q[2][1])/2]} else if(it.kind==='r') p=PRISM.R.project(it.pts[10],M); else if(it.kind==='t') p=PRISM.R.project(it.b,M); else p=PRISM.R.project(it.pos,M); return [p[0]+cv.left,p[1]+cv.top, A.hitTest(p[0],p[1])]}'''
    def state(): return pg.evaluate('''()=>{const st=PRISM.st; return {f:st.doc.features.map(f=>f.name), bb:st.bodies.map(b=>[b.solid.bbox().min.map(x=>+x.toFixed(1)),b.solid.bbox().max.map(x=>+x.toFixed(1))]), vol:Math.round(st.bodies[0].solid.volume()), sel:st.sel&&st.sel.type}}''')
    def drag(id,dx,dy,shift=False):
        x,y,hit=pg.evaluate(JS,id); pg.mouse.move(x,y); pg.wait_for_timeout(60); pg.mouse.down()
        if shift: pg.keyboard.down('Shift')
        for k in range(1,9): pg.mouse.move(x+dx*k/8,y+dy*k/8); pg.wait_for_timeout(25)
        mid=pg.evaluate('()=>AAKAR_W1.api.drag&&AAKAR_W1.api.drag.txt'); pg.mouse.up()
        if shift: pg.keyboard.up('Shift')
        pg.wait_for_timeout(200); print(id,'hit',hit,'| live label:',mid); print('   ',state())
    for id,dx,dy,sh in [('t0',70,0,0),('p2',40,-30,0),('r2',0,-70,0),('s1',30,0,0),('su',-40,-20,0),('free',30,20,0)]: drag(id,dx,dy,sh)
    # undo everything & check count
    pg.evaluate("()=>{for(let i=0;i<10;i++)PRISM.undo()}"); print('after undo',state())
    print(pg.errs); b.close()
