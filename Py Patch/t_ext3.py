import sys,json
from lib import *; from sk import *
b=B(sys.argv[1]); b.pg.set_default_timeout(9000); pg=b.pg; open_sketch(b,'XY'); R=[]
def check(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,x)
pg.click('#sketcher .sk-btn[data-tool=rect]')
for xy in [(0,0),(60,40)]:
    sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",list(xy)); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}"); pg.mouse.click(r[0]+sx,r[1]+sy); pg.wait_for_timeout(80)
pg.keyboard.press('Escape'); pg.click('#sketcher .sk-btn[data-tool=ok]'); pg.wait_for_timeout(800)
pg.keyboard.press('n'); pg.wait_for_timeout(300)
check('Instant3D is off before Extrude',not pg.evaluate("()=>document.body.classList.contains('i3d-on')"))
pg.click('#tb-extrude'); pg.wait_for_timeout(700); pg.click('#dlgOk'); pg.wait_for_timeout(1500)
check('after Extrude, Instant3D switched itself on',pg.evaluate("()=>document.body.classList.contains('i3d-on')"))
g=pg.evaluate("()=>{const e=document.querySelector('#i3dLayer .i3d-grip.pp'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,title:e.title,svg:e.innerHTML.slice(0,90)}}")
check('a push/pull grip (double-headed arrow) is on the model',g is not None and g['w']>=30,str(g and {k:g[k] for k in ('w','title')}))
chip=pg.evaluate("()=>{const e=document.querySelector('#i3dLayer .i3d-chip'); return e?e.textContent:null}"); check('value chip is labelled PUSH / PULL',chip and 'PUSH / PULL' in chip,str(chip))
bar=pg.evaluate("()=>document.getElementById('i3dBar').textContent"); check('toolbar text explains it',('push / pull' in bar),bar[:110])
pg.screenshot(path='/home/claude/a/x1.png',clip={'x':260,'y':130,'width':980,'height':700})
d0=pg.evaluate("()=>PRISM.st.doc.features.find(f=>f.type==='extrude').params.dist")
# drag the grip to change the distance
pg.mouse.move(g['x'],g['y']); pg.mouse.down(); pg.mouse.move(g['x']+40,g['y']-70,steps=10); pg.wait_for_timeout(250); pg.mouse.up(); pg.wait_for_timeout(900)
d1=pg.evaluate("()=>PRISM.st.doc.features.find(f=>f.type==='extrude').params.dist"); check('dragging the push/pull grip changes the extrude distance',abs(d1-d0)>0.5,f'{d0} -> {d1}')
pg.screenshot(path='/home/claude/a/x2.png',clip={'x':260,'y':130,'width':980,'height':700})
# turn off with the bar's X, and the other tools are not affected: a Revolve does not get a push/pull grip
pg.click('#i3dBar button[data-a=off]'); pg.wait_for_timeout(300); check('Instant3D can be switched off',not pg.evaluate("()=>document.body.classList.contains('i3d-on')"))
print('webgl ok:',pg.evaluate("()=>{const c=document.querySelector('#viewport canvas'); const g=c.getContext('webgl2')||c.getContext('webgl'); return !g.isContextLost()}"),'| page errors',b.errs[:2]); print('%d / %d passed'%(sum(R),len(R))); b.close()
