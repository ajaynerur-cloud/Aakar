import sys; sys.path.insert(0,'/home/claude')
from common import *
with sync_playwright() as p:
    b,pg=open_app(p,'index.html'); box_scene(pg, "st.sel=null;")
    pg.mouse.move(700,450); pg.keyboard.press('m'); pg.wait_for_timeout(300)
    print('open:',pg.evaluate("()=>document.querySelector('#w1rad').classList.contains('open')"), 'ctx',pg.evaluate("()=>AAKAR_W1.radialApi.context()"))
    print('labels:',pg.evaluate("()=>[...document.querySelectorAll('#w1rad .sl')].map(e=>e.textContent)"))
    shot(pg,'/home/claude/r1.png')
    # sector 3 (index 3) = Gumball: bottom-right. hover then press Q
    pg.mouse.move(700+150*0.707,450+150*0.707); pg.wait_for_timeout(150)
    print('hot:',pg.evaluate("()=>document.querySelector('#w1rad .sl.hot')&&document.querySelector('#w1rad .sl.hot').textContent"))
    pg.keyboard.press('m'); pg.wait_for_timeout(300)
    print('gumball on:',pg.evaluate("()=>AAKAR_W1.gumballOn"), 'menu closed:',pg.evaluate("()=>!document.querySelector('#w1rad').classList.contains('open')"))
    # face context
    pg.evaluate("()=>{const b=PRISM.st.bodies[0],s=b.solid;const fi=s.F.findIndex(f=>f.n[2]>0.99);PRISM.st.sel={type:'face',bodyId:b.key,bodyIds:[b.key],faces:[fi],offset:false};PRISM.redraw()}")
    pg.mouse.move(650,420); pg.keyboard.press('m'); pg.wait_for_timeout(300)
    print('face labels:',pg.evaluate("()=>[...document.querySelectorAll('#w1rad .sl')].map(e=>e.textContent)"))
    # click top slice (Offset face)
    pg.mouse.click(650,420-150); pg.wait_for_timeout(600)
    print('dialog:',pg.evaluate("()=>document.querySelector('#dlgTitle').textContent"))
    pg.click('#dlgCancel'); pg.wait_for_timeout(200)
    # customise panel
    pg.evaluate("()=>AAKAR_W1.radialApi.openCustomise()"); pg.wait_for_timeout(300)
    pg.select_option('#w1-radial [data-s="0"]','@fit'); pg.wait_for_timeout(100)
    print('saved:',pg.evaluate("()=>localStorage.getItem('aakar.w1.radial')"))
    shot(pg,'/home/claude/r2.png'); print(pg.errs); b.close()
