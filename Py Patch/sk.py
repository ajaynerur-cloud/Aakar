import json
from lib import *
PTS=[(34,0),(46,22),(58,60),(52,100),(36,128),(30,150)]
def open_sketch(b, plane='XZ'):
    b.pg.evaluate("()=>{const W=CAD.v8.windows; W.open(W.blankDoc(),'t',{dirty:true});}")
    b.pg.click('#tb-sketch'); b.pg.wait_for_timeout(500)
    b.pg.evaluate("(pl)=>{ const m=document.querySelector('#modal'); const sel=m.querySelector('select'); if(sel){ sel.value=pl; sel.dispatchEvent(new Event('change')); } }",plane)
    b.pg.evaluate("()=>{ const m=document.querySelector('#modal'); const ok=[...m.querySelectorAll('button')].find(x=>/^ok$/i.test(x.textContent.trim())); ok.click(); }")
    b.pg.wait_for_timeout(700)
    assert b.pg.evaluate("()=>!!document.querySelector('#sketcher')"), 'sketcher did not open'
def set_view(b, scale=2.4, ox=260, oy=80):
    b.pg.evaluate("([s,ox,oy])=>{ const a=PRISM.st.skHandle.api, cv=document.querySelector('#sketcher .sk-cv'); a.view.s=s; a.view.cx=ox; a.view.cy=cv.getBoundingClientRect().height-oy; a.changed(); }",[scale,ox,oy])
def draw_spline(b, pts=PTS, finish_key='Enter'):
    set_view(b)
    b.pg.click('#sketcher .sk-btn[data-tool=spline]')
    for p in pts:
        sx,sy=b.pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",list(p)); r=b.pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}")
        b.pg.mouse.click(r[0]+sx,r[1]+sy); b.pg.wait_for_timeout(60)
    b.pg.keyboard.press(finish_key); b.pg.wait_for_timeout(200)
def state(b): return b.pg.evaluate("""()=>{ const h=PRISM.st.skHandle, sk=h.sketch; return { pts:sk.pts.filter(p=>!p.ref).map(p=>[p.id,+p.x.toFixed(3),+p.y.toFixed(3)]), ents:sk.ents.filter(e=>!e.ref).map(e=>e.type+':'+e.id), cons:sk.cons.map(c=>c.type+(c.kind?'/'+c.kind:'')+':'+c.e.join('-')+'='+(c.v==null?'':+(+c.v).toFixed(3))+(c.s?(c.s>0?'':'(-)'):'')+(c.driven?' driven':'')), dof:h.api.state.ana&&h.api.state.ana.dof, panel:!!document.querySelector('#sketcher .sk-dp'), dimBoxes:h.api.state.dimBoxes.length }; }""")
def select(b, items): b.pg.evaluate("(it)=>PRISM.st.skHandle.api.select(it)",items)
def apply_dim(b, force=None):
    return b.pg.evaluate("""(f)=>{ try{ PRISM.st.skHandle.api.applyDim(f||undefined); return {ok:true}; }catch(e){ return {ok:false,err:e.message}; } }""",force)
