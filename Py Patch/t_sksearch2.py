import sys,json
from lib import *; from sk import *
b=B(sys.argv[1]); b.pg.set_default_timeout(8000); open_sketch(b); pg=b.pg
R=[]
def check(n,c,x=''): R.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n,x)
def rows(): return pg.evaluate("()=>[...document.querySelectorAll('#x10pal .ls .it')].map(x=>((x.querySelector('b')||{}).textContent||'')+' | '+((x.querySelector('small,span')||{}).textContent||''))")
def tool(): return pg.evaluate("()=>PRISM.st.skHandle.api.state.tool")
pg.keyboard.press('Control+k'); pg.wait_for_timeout(400)
check('empty search lists sketch commands first',any('Circle' in r for r in rows()[:40]),str(rows()[:4]))
pg.keyboard.type('construction line',delay=30); pg.wait_for_timeout(250)
r=rows(); check('"construction line" finds the Construction line command',bool(r) and 'Construction line' in r[0],str(r[:2]))
pg.keyboard.press('Control+a'); pg.keyboard.type('circle',delay=30); pg.wait_for_timeout(250); r=rows(); check('typing "circle" shows every letter',pg.evaluate("()=>document.querySelector('#x10pal input').value")=='circle')
check('Circle is the first result',bool(r) and r[0].startswith('Circle'),str(r[:2]))
pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
check('Enter ran the Circle sketch tool (and did NOT finish the sketch)',tool()=='circle' and pg.evaluate("()=>!!document.querySelector('#sketcher')"),'tool='+tool())
check('palette closed',not pg.evaluate("()=>{const p=document.getElementById('x10pal'); return !!p && p.classList.contains('on')}"))
# letters still work as shortcuts once the palette is closed
pg.keyboard.press('Escape'); pg.wait_for_timeout(100); pg.keyboard.press('l'); pg.wait_for_timeout(100); check('shortcut L still switches to Line after the search',tool()=='line','tool='+tool())
# constr via palette toggles construction mode
pg.keyboard.press('Escape'); pg.keyboard.press('Control+k'); pg.wait_for_timeout(300); pg.keyboard.type('construction',delay=25); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
check('Construction line command toggled construction mode',pg.evaluate("()=>PRISM.st.skHandle.api.state.constr")==True)
# Esc inside the palette closes the palette only
pg.keyboard.press('Control+k'); pg.wait_for_timeout(250); pg.keyboard.type('abc'); pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
check('Esc in Search closes Search, not the sketch',pg.evaluate("()=>!!document.querySelector('#sketcher')"))
# backspace in the search box must not delete geometry
n=len(state(b)['ents']); pg.keyboard.press('Control+k'); pg.wait_for_timeout(250); pg.keyboard.type('xyz'); pg.keyboard.press('Backspace'); pg.keyboard.press('Backspace'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
check('Backspace in Search deletes nothing',len(state(b)['ents'])==n)
print('\n%d / %d passed | errors %s'%(sum(R),len(R),b.errs[:2])); b.close()
