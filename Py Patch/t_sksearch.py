import sys,json
from lib import *; from sk import *
b=B(sys.argv[1]); b.pg.set_default_timeout(8000); open_sketch(b); pg=b.pg
pg.click('#sketcher .sk-btn[data-tool=select]'); pg.wait_for_timeout(100)
pg.keyboard.press('Control+k'); pg.wait_for_timeout(500)
opened=pg.evaluate("()=>{const p=document.getElementById('x10pal'); return !!p && getComputedStyle(p).display!=='none'}")
print('palette opened with Ctrl+K in sketch mode:',opened)
pg.keyboard.type('construction line',delay=40); pg.wait_for_timeout(300)
val=pg.evaluate("()=>document.querySelector('#x10pal input').value"); tool=pg.evaluate("()=>PRISM.st.skHandle&&PRISM.st.skHandle.api.state.tool"); constr=pg.evaluate("()=>PRISM.st.skHandle&&PRISM.st.skHandle.api.state.constr")
print(' typed "construction line" -> search box shows:',repr(val),'| sketch tool is now:',tool,'| construction mode:',constr)
pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
print(' sketch still open after Esc:',pg.evaluate("()=>!!document.querySelector('#sketcher')"))
b.close()
