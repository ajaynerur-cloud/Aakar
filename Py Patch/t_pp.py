import sys,json
from lib import *
b=B(sys.argv[1]); b.pg.set_default_timeout(8000); pg=b.pg
pg.evaluate("()=>{const W=CAD.v8.windows; W.open(W.blankDoc(),'t',{dirty:true}); const P=PRISM; P.commitFeature({type:'primitive',name:'Box A',params:{kind:'box',w:60,d:40,h:30,pos:[0,0,0]}},true); P.fitView(); P.setTab('model'); document.querySelectorAll('#navwheel,.navwheel,[id*=navWheel]').forEach(x=>x.style.display='none'); }")
pg.wait_for_timeout(700); clip={'x':260,'y':130,'width':820,'height':680}; R=[]
def check(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,x)
vis=lambda sel: pg.evaluate("(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); const v=document.getElementById('viewport').getBoundingClientRect(); return {shown:getComputedStyle(e).display!=='none', inside:r.left>=v.left&&r.right<=v.right&&r.top>=v.top&&r.bottom<=v.bottom, text:e.textContent}}",sel)
pg.mouse.click(650,450); pg.wait_for_timeout(250)
check('Move mode: no push/pull badges',not vis('.aakPP.pull')['shown'])
pg.evaluate("()=>{const b=[...document.querySelectorAll('#segPull button')].find(x=>x.dataset.v==='extrude'); b.click();}"); pg.wait_for_timeout(500)
a=vis('.aakPP.pull'); c=vis('.aakPP.push'); print(' pull:',a,'\n push:',c)
check('Extrude mode: PULL + badge at the arrow tip',a['shown'] and 'PULL' in a['text'] and a['inside']); check('Extrude mode: PUSH - badge on the other side',c['shown'] and 'PUSH' in c['text'] and c['inside'])
pg.screenshot(path='/home/claude/a/pp1.png',clip=clip)
# really drag the green arrow: find the tip on screen and drag outwards -> faceExtrude feature
tip=pg.evaluate("()=>{const P=PRISM, M=P.R.matrices(), Gz=P.gizmoHandles(), h=Gz.handles[0], g=P.handleGeom(h,Gz.pivot,M); const a=P.R.project(g.a,M), bb=P.R.project(g.b,M); const r=document.querySelector('#viewport canvas').getBoundingClientRect(); return {x:r.left+(a[0]+bb[0])/2, y:r.top+(a[1]+bb[1])/2, dx:bb[0]-a[0], dy:bb[1]-a[1]}}")
pg.mouse.move(tip['x'],tip['y']); pg.mouse.down(); pg.mouse.move(tip['x']+tip['dx']*0.8,tip['y']+tip['dy']*0.8,steps=8); pg.wait_for_timeout(300); lab=pg.evaluate("()=>{const e=document.getElementById('dimLabel'); return e&&!e.classList.contains('hidden')?e.textContent:null}"); pg.screenshot(path='/home/claude/a/pp2.png',clip=clip)
pg.mouse.up(); pg.wait_for_timeout(700)
feat=pg.evaluate("()=>PRISM.st.doc.features.map(f=>f.type)"); check('dragging the arrow shows a live distance and creates a push/pull feature',lab is not None and 'faceExtrude' in feat,f'label={lab} features={feat}')
print('page errors',b.errs[:2]); print('%d / %d passed'%(sum(R),len(R))); b.close()
