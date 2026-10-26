import sys,json; sys.path.insert(0,'/home/claude')
from common import *
html=sys.argv[1]; tabs=sys.argv[2].split(',')
with sync_playwright() as p:
    b,pg=open_app(p,html,hide_wheel=False)
    for tab in tabs:
        pg.evaluate("(t)=>PRISM.setTab(t)",tab); pg.wait_for_timeout(3500)
        r=pg.evaluate('''()=>{const tb=document.querySelector('#toolbar'); const tr=tb.getBoundingClientRect(); const gs=[...tb.querySelectorAll(':scope > .grp')]; return {tbw:Math.round(tr.width),scroll:tb.scrollWidth,vis:gs.filter(g=>getComputedStyle(g).display!=='none').map(g=>{const t=g.querySelector('.glabel'); const r=g.getBoundingClientRect(); return (t?t.textContent.trim():'?')+'@'+Math.round(r.left-tr.left)+'+'+Math.round(r.width)+(g.classList.contains('collapsed')?'(c)':'')}), hidden:gs.filter(g=>getComputedStyle(g).display==='none').length, overflowX:getComputedStyle(tb).overflowX}}''')
        print(tab,'toolbar',r['tbw'],'scrollW',r['scroll'],'hiddenGroups',r['hidden'],r['overflowX']); print('  ',' | '.join(r['vis']))
    b.close()
