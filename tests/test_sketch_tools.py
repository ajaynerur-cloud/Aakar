import sys,json; sys.path.insert(0,'/home/claude')
from common import *
SETUP='''()=>{
 const K=CAD.sketch; const sk=K.newSketch();
 const add=(id,x,y)=>sk.pts.push({id,x,y});
 // rectangle 80 x 50 from (0,0)
 add('a',0,0);add('b',80,0);add('c',80,50);add('d',0,50);
 const L=(id,p1,p2)=>sk.ents.push({id,type:'line',p1,p2});
 L('l1','a','b');L('l2','b','c');L('l3','c','d');L('l4','d','a');
 sk.cons.push({id:'h1',type:'horizontal',e:['l1']},{id:'h3',type:'horizontal',e:['l3']},{id:'v2',type:'vertical',e:['l2']},{id:'v4',type:'vertical',e:['l4']});
 // crossing lines for trim/extend  (to the right)
 add('x1',120,0);add('x2',180,40);add('x3',120,40);add('x4',180,0);
 L('t1','x1','x2');L('t2','x3','x4');
 // short line to extend toward t1/t2 region
 add('e1',100,20);add('e2',130,20);L('ex','e1','e2');
 window.__h=CAD.Sketcher.open({host:document.querySelector('#viewport'),data:sk,name:'T',getSnap:()=>0,toast:(m,e)=>{window.__toasts=(window.__toasts||[]);window.__toasts.push(m)},onFinish:()=>{},onCancel:()=>{}});
 window.__sk=window.__h.sketch; PRISM.st.sketching=true;
}'''
def sc(pg,x,y):
    return pg.evaluate('''([x,y])=>{const a=__h.api,q=a.toS([x,y]),r=document.querySelector('.sk-cv').getBoundingClientRect();return [q[0]+r.left,q[1]+r.top]}''',[x,y])
def click(pg,x,y):
    X,Y=sc(pg,x,y); pg.mouse.move(X,Y); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(120)
def snapshot(pg): return pg.evaluate('''()=>{const s=__sk; return {pts:s.pts.filter(p=>!p.ref).map(p=>p.id+':'+p.x.toFixed(2)+','+p.y.toFixed(2)), ents:s.ents.filter(e=>!e.ref).map(e=>e.id+':'+e.type+(e.p1?'['+e.p1+'>'+e.p2+']':'')+(e.c?'c='+e.c:'')+(e.r?'r='+e.r:'')), ncons:s.cons.length, toast:(window.__toasts||[]).slice(-1)[0]}}''')
with sync_playwright() as p:
    b,pg=open_app(p,'index.html'); pg.evaluate(SETUP); pg.wait_for_timeout(500)
    pg.evaluate("()=>{__h.api.view.s=3; __h.api.view.cx=80; __h.api.view.cy=420; __h.api.changed()}")
    print('toolbar buttons:', pg.evaluate("()=>[...document.querySelectorAll('.sk-btn')].map(b=>b.dataset.tool).join(',')"))
    # FILLET: click corner point b (80,0) with r=8
    pg.evaluate("()=>{document.querySelector('.skx-r').value=8; document.querySelector('.skx-r').dispatchEvent(new Event('input'))}")
    pg.evaluate("()=>__h.api.setTool('fillet')"); click(pg,80,0); s=snapshot(pg); print('FILLET',json.dumps(s)); 
    ok=pg.evaluate('''()=>{const s=__sk; const arc=s.ents.find(e=>e.type==='arc'); if(!arc) return null; const P=id=>s.pts.find(p=>p.id===id); const c=P(arc.c),a=P(arc.p1),b=P(arc.p2); return {r1:Math.hypot(a.x-c.x,a.y-c.y),r2:Math.hypot(b.x-c.x,b.y-c.y),c:[c.x,c.y],a:[a.x,a.y],b:[b.x,b.y]}}''');print('  arc',ok)
    shot(pg,'/home/claude/s1.png')
    # TRIM: click the upper part of t1 (x1(120,0)->x2(180,40)) above crossing point; crossing at (150,20)-> click at (170,33)
    pg.evaluate("()=>__h.api.setTool('trim')"); click(pg,170,33.3); print('TRIM',json.dumps(snapshot(pg)))
    # EXTEND: line ex from (100,20)->(130,20): extend right end to t2/t1 -> nearest crossing at ~(150,20)
    pg.evaluate("()=>__h.api.setTool('extend')"); click(pg,128,20); print('EXTEND',json.dumps(snapshot(pg)))
    # OFFSET the rectangle chain outward by 5: click outside near l1 bottom
    pg.evaluate("()=>{document.querySelector('.skx-d').value=5; document.querySelector('.skx-d').dispatchEvent(new Event('input'))}")
    pg.evaluate("()=>__h.api.setTool('offset')"); click(pg,40,-1); print('OFFSET',json.dumps(snapshot(pg)))
    shot(pg,'/home/claude/s2.png')
    print(pg.errs); b.close()
