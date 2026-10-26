import sys; sys.path.insert(0,'/home/claude')
from common import *
with sync_playwright() as p:
    b,pg=open_app(p,'index.html',hide_wheel=True); box_scene(pg)
    pg.evaluate("()=>PRISM.setTab('model')"); pg.wait_for_timeout(1500)
    # Ctrl+K search
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(500)
    pg.keyboard.type('scale body'); pg.wait_for_timeout(500)
    print('search hits:',pg.evaluate("()=>[...document.querySelectorAll('#x10pal .row, #x10pal [data-i], .x10pal-item, #x10palList > *')].slice(0,4).map(e=>e.textContent.trim().slice(0,70))"))
    pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
    print('tab after:',pg.evaluate("()=>PRISM.st.tab"),'| dialog:',pg.evaluate("()=>document.querySelector('#dlgTitle').textContent"),'| modal hidden:',pg.evaluate("()=>document.querySelector('#modal').classList.contains('hidden')"))
    pg.evaluate("()=>{const c=document.querySelector('#dlgCancel'); c&&c.click()}"); pg.wait_for_timeout(300)
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(400); pg.keyboard.type('tangent chain'); pg.wait_for_timeout(400); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    print('tab after chain cmd:',pg.evaluate("()=>PRISM.st.tab"),'| status:',pg.evaluate("()=>document.querySelector('#status')&&document.querySelector('#status').textContent.slice(0,80)"))
    # radial (body selected): Scale slice
    pg.mouse.move(650,420); pg.keyboard.press('m'); pg.wait_for_timeout(300)
    print('radial body labels:',pg.evaluate("()=>[...document.querySelectorAll('#w1rad .sl')].map(e=>e.textContent)"), '| cfg pill:',pg.evaluate("()=>!!document.querySelector('#w1rad .cfg')"))
    pg.mouse.click(650+106,420-106)   # slice index 1 = top-right
    pg.wait_for_timeout(600); print('radial slice1 ->',pg.evaluate("()=>document.querySelector('#dlgTitle').textContent"))
    pg.evaluate("()=>{const c=document.querySelector('#dlgCancel'); c&&c.click()}"); pg.wait_for_timeout(300)
    pg.mouse.move(650,420); pg.keyboard.press('m'); pg.wait_for_timeout(300); pg.mouse.click(650,420+150+74); pg.wait_for_timeout(500)
    print('set-up panel open:',pg.evaluate("()=>document.querySelector('#w1-radial').classList.contains('on')"))
    print(pg.errs); b.close()
