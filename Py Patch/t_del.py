import sys,json
from lib import *
b=B(sys.argv[1]); b.pg.set_default_timeout(8000); pg=b.pg
pg.evaluate("()=>{const W=CAD.v8.windows; W.open(W.blankDoc(),'t',{dirty:true}); const P=PRISM; P.commitFeature({type:'primitive',name:'Box A',params:{kind:'box',w:60,d:40,h:30,pos:[0,0,0]}},true); P.commitFeature({type:'primitive',name:'Cyl B',params:{kind:'cyl',r:12,h:50,pos:[70,0,0],s:32}},true); P.fitView(); P.setTab('model'); document.querySelectorAll('#navwheel,.navwheel,[id*=navWheel]').forEach(x=>x.style.display='none'); }")
pg.wait_for_timeout(700); clip={'x':260,'y':130,'width':820,'height':680}
R=[]
def check(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,x)
ban=lambda: pg.evaluate("()=>{const e=document.getElementById('aakSelBanner'); return {cls:e.className,text:e.textContent}}")
arm=lambda: pg.evaluate("()=>PRISM.st.delArm||null")
ok=lambda: pg.evaluate("()=>{const c=document.querySelector('#viewport canvas'); const g=c.getContext('webgl2')||c.getContext('webgl'); return !g.isContextLost()}")
pg.screenshot(path='/home/claude/a/d0.png',clip=clip)
pg.mouse.click(650,450); pg.wait_for_timeout(300)                      # click the top face of the box
check('click selects a face',pg.evaluate("()=>PRISM.st.sel&&PRISM.st.sel.type")=='face'); check('no banner for a face',ban()['cls']=='')
pg.keyboard.press('Delete'); pg.wait_for_timeout(500)                    # first Delete: whole body, armed
check('first Delete marks the WHOLE body (armed)',bool(arm()),str(arm())); bn=ban(); check('red "Delete ...? Press Delete again" banner',('armed' in bn['cls']) and 'Press' in bn['text'] and 'Box A' in bn['text'],bn['text'])
check('nothing deleted yet',pg.evaluate("()=>PRISM.st.bodies.length")==2); pg.screenshot(path='/home/claude/a/d1.png',clip=clip)
pg.keyboard.press('Escape'); pg.wait_for_timeout(400); check('Esc cancels: arm cleared, banner hidden, body kept',arm() is None and ban()['cls']=='' and pg.evaluate("()=>PRISM.st.bodies.length")==2)
# Body filter select -> orange outline + plain banner
pg.evaluate("()=>{const b=[...document.querySelectorAll('#filterbar button')].find(x=>x.textContent.trim()==='Body'); b.click();}"); pg.mouse.click(600,470); pg.wait_for_timeout(400)
bn=ban(); check('Body-filter selection shows the orange banner (not red)',bn['cls']=='on' and 'Selected' in bn['text'] and 'Box A' in bn['text'],bn['text']); pg.screenshot(path='/home/claude/a/d2.png',clip=clip)
# select, delete -> arm path again then confirm
pg.keyboard.press('Escape'); pg.evaluate("()=>{const b=[...document.querySelectorAll('#filterbar button')].find(x=>x.textContent.trim()==='Auto'); b.click();}"); pg.mouse.click(650,450); pg.wait_for_timeout(250); pg.keyboard.press('Delete'); pg.wait_for_timeout(300); pg.keyboard.press('Delete'); pg.wait_for_timeout(600)
names=pg.evaluate("()=>PRISM.st.bodies.map(b=>b.name)"); check('second Delete removes only the marked body',names==['Cyl B'] or (len(names)==1 and 'Box' not in names[0]),str(names)); check('banner gone after delete',ban()['cls']==''); pg.keyboard.press('Control+z'); pg.wait_for_timeout(500)
check('Ctrl+Z brings it back',pg.evaluate("()=>PRISM.st.bodies.length")==2)
print('webgl context ok:',ok(),'| page errors',b.errs[:2]); print('%d / %d passed'%(sum(R),len(R))); b.close()
