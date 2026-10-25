import sys,json
from lib import *; from sk import *
skin=sys.argv[2] if len(sys.argv)>2 else 'classic'
b=B(sys.argv[1],skin); b.pg.set_default_timeout(8000); open_sketch(b); draw_spline(b); pg=b.pg; ids=[x[0] for x in state(b)['pts']]
R=[]
def check(name,cond,extra=''): R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ')+name,extra)
# (a) real mouse click on P3 + real "D" key
pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
pg.click(".sk-dp header [data-a=x]"); pg.wait_for_timeout(100)      # start from a closed panel: D must open it
sx,sy=pg.evaluate("(id)=>{const a=PRISM.st.skHandle.api, p=PRISM.st.skHandle.sketch.pts.find(q=>q.id===id); return a.toS([p.x,p.y]);}",ids[2]); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}")
pg.evaluate("()=>PRISM.st.skHandle.api.setTool('select')"); pg.mouse.click(r[0]+sx,r[1]+sy); pg.wait_for_timeout(150)
selk=pg.evaluate("()=>PRISM.st.skHandle.api.state.sel.map(s=>s.kind)"); check('mouse click selects the spline point',selk==['pt'],str(selk))
pg.keyboard.press('d'); pg.wait_for_timeout(500)
check('D on one point opens the panel',pg.evaluate("()=>!!document.querySelector('.sk-dp')"))
foc=pg.evaluate("()=>{const a=document.activeElement; return a&&a.dataset&&a.dataset.key}"); check('the X box is focused and ready for typing',bool(foc) and 'hdist' in (foc or ''),str(foc))
pg.keyboard.type('33'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
x=[p[1] for p in state(b)['pts'] if p[0]==ids[2]][0]; check('typed X = 33 moved P3',abs(x-33)<1e-3,f'x={x}')
check('the sketch is still open',pg.evaluate("()=>!!document.querySelector('#sketcher')"))
pg.click('.sk-dp [data-clearsel]'); pg.wait_for_timeout(250)
# letters typed in a box must NOT trigger tools (e.g. "e" in an expression, Backspace must not delete geometry)
n_ent=len(state(b)['ents']); pg.click(f".sk-dp tr[data-pid='{ids[3]}'] input[data-t=hdist]"); pg.keyboard.press('Control+A'); pg.keyboard.type('5e1'); pg.keyboard.press('Backspace'); pg.keyboard.press('Backspace'); pg.keyboard.type('l'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
tool=pg.evaluate("()=>PRISM.st.skHandle.api.state.tool"); check('typing letters / Backspace in a box does not switch tools or delete geometry',tool=='select' and len(state(b)['ents'])==n_ent,f'tool={tool}, entities {n_ent}->{len(state(b)["ents"])}')
# expression typed in a box
typ=lambda sel,v:(pg.click(sel),pg.keyboard.press('Control+A'),pg.keyboard.type(str(v)),pg.keyboard.press('Enter'),pg.wait_for_timeout(250))
typ(f".sk-dp tr[data-pid='{ids[4]}'] input[data-t=hdist]","20+16/2"); x=[p[1] for p in state(b)['pts'] if p[0]==ids[4]][0]; check('expression 20+16/2 = 28 accepted',abs(x-28)<1e-3,f'x={x}')
pg.screenshot(path=f'/home/claude/a/panel_{skin}.png')
# (b) finish, then edit the existing sketch: the panel opens by itself
pg.keyboard.press('Escape'); pg.click('#sketcher .sk-btn[data-tool=ok]'); pg.wait_for_timeout(700)
ok=pg.evaluate("()=>{ const P=PRISM, f=P.st.doc.features.filter(x=>x.type==='sketch').pop(); if(P.editFeature){ P.editFeature(f); return 'editFeature'; } return 'none'; }"); pg.wait_for_timeout(900); print(' edit path:',ok)
check('editing an existing sketch opens the panel by itself',pg.evaluate("()=>!!document.querySelector('#sketcher .sk-dp')"))
rows=pg.evaluate("()=>[...document.querySelectorAll('.sk-dp tr[data-pid]')].map(r=>r.querySelector('.n').textContent+' '+[...r.querySelectorAll('input')].map(i=>i.value+(i.parentNode.classList.contains('dim')?'*':'')).join('/'))"); print(' rows (* = driving dimension):',rows)
print('\n%d / %d checks passed (%s)'%(sum(R),len(R),skin),'| page errors',b.errs[:3]); b.close()
