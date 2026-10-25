import sys,json
from lib import *; from sk import *
html=sys.argv[1]
for skin in ['classic','studio','graphite','pro']:
    b=B(html,skin); b.pg.set_default_timeout(8000); open_sketch(b)
    pg=b.pg
    # draw a line with two clicks, select its two points, press D (smart dimension) -> the value box opens
    pg.click('#sketcher .sk-btn[data-tool=line]')
    for xy in [(20,10),(70,40)]:
        sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",list(xy)); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}")
        pg.mouse.click(r[0]+sx,r[1]+sy); pg.wait_for_timeout(80)
    pg.keyboard.press('Escape'); pg.evaluate("()=>PRISM.st.skHandle.api.setTool('select')")
    ln=pg.evaluate("()=>PRISM.st.skHandle.sketch.ents.find(e=>e.type==='line'&&!e.ref).id")
    select(b,[{'kind':'ent','id':ln}]); pg.keyboard.press('d'); pg.wait_for_timeout(500)
    info=pg.evaluate("""()=>{ const v=document.querySelector('#sketcher .sk-val'); if(!v) return null; const r=v.getBoundingClientRect(), cs=getComputedStyle(v); return {hidden:v.classList.contains('hidden'), w:Math.round(r.width), h:Math.round(r.height), cssWidth:cs.width, display:cs.display, minW:cs.minWidth, maxW:cs.maxWidth, flex:cs.flex, position:cs.position, parentW:Math.round(v.parentNode.getBoundingClientRect().width)}; }""")
    print(skin.ljust(9),json.dumps(info)); 
    if skin in('classic','studio'): pg.screenshot(path=f'/home/claude/a/val_{skin}.png')
    b.close()
