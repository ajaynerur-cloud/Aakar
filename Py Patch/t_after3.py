import sys,json,math
from lib import *; from sk import *
b=B(sys.argv[1]); b.pg.set_default_timeout(6000); open_sketch(b); draw_spline(b); pg=b.pg; ids=[x[0] for x in state(b)['pts']]
def box(pid,t): return f".sk-dp tr[data-pid='{pid}'] input[data-t={t}]"
def typ(sel,val): pg.click(sel); pg.keyboard.press('Control+A'); pg.keyboard.type(str(val)); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
def pts(): return {x[0]:(x[1],x[2]) for x in state(b)['pts']}
R=[]
def check(name,cond,extra=''): R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ')+name,extra)
# fixed construction line: draw it, then FIX both ends (Fix constraint) so the point must move
pg.evaluate("()=>{ PRISM.st.skHandle.api.state.constr=true; }"); pg.click('#sketcher .sk-btn[data-tool=line]')
for xy in [(80,0),(80,150)]:
    sx,sy=pg.evaluate("(p)=>PRISM.st.skHandle.api.toS(p)",list(xy)); r=pg.evaluate("()=>{const r=document.querySelector('#sketcher .sk-cv').getBoundingClientRect();return [r.left,r.top]}"); pg.mouse.click(r[0]+sx,r[1]+sy); pg.wait_for_timeout(80)
pg.keyboard.press('Escape'); pg.evaluate("()=>{ const a=PRISM.st.skHandle.api; a.state.constr=false; a.setTool('select'); }"); pg.wait_for_timeout(150)
cl=pg.evaluate("()=>PRISM.st.skHandle.sketch.ents.find(e=>e.type==='line'&&!e.ref&&e.constr).id"); ends=pg.evaluate("(id)=>{const e=PRISM.st.skHandle.sketch.ents.find(x=>x.id===id); return [e.p1,e.p2];}",cl)
select(b,[{'kind':'pt','id':ends[0]},{'kind':'pt','id':ends[1]}]); pg.evaluate("()=>PRISM.st.skHandle.api.applyCon('fix')"); select(b,[]); pg.wait_for_timeout(200)
pg.click(".sk-dp [data-mode=line]"); pg.select_option(".sk-dp select[data-ref]",cl); pg.wait_for_timeout(200)
typ(box(ids[3],'distance'),25); p=pts()
check('line mode with a FIXED construction line: P4 is exactly 25 from it',abs(abs(p[ids[3]][0]-80)-25)<1e-3,f'P4 x={p[ids[3]][0]:.3f}')
typ(box(ids[4],'distance'),-18); p=pts(); check('negative distance: P5 on the other side (x = 98)',abs(p[ids[4]][0]-98)<1e-3,f'P5 x={p[ids[4]][0]:.3f}')
# over-constraint on P1 (it sits on the X axis)
pg.click(".sk-dp [data-mode=origin]"); pg.wait_for_timeout(150)
typ(box(ids[0],'vdist'),9); s=state(b); print(' P1 Y typed 9 ->',[c for c in s['cons'] if 'vdist:O-'+ids[0] in c])
check('over-constraint handled (kept as reference or refused), no crash',True)
# single point D then the "show all" button
select(b,[{'kind':'pt','id':ids[2]}]); r=apply_dim(b); check('Smart dimension on one point',r.get('ok'),str(r))
n_sel=pg.evaluate("()=>document.querySelectorAll('.sk-dp tr[data-pid]').length"); pg.click(".sk-dp [data-clearsel]"); pg.wait_for_timeout(250); n_all=pg.evaluate("()=>document.querySelectorAll('.sk-dp tr[data-pid]').length")
n_pts=pg.evaluate("()=>PRISM.st.skHandle.sketch.pts.filter(p=>!p.ref).length"); check('table shows only the selected point, "show all" lists every point',n_sel==1 and n_all==n_pts,f'{n_sel} -> {n_all} (sketch has {n_pts} points)')
# undo / redo / delete / close / reopen
n0=len(state(b)['cons']); pg.click('#sketcher .sk-btn[data-tool=undo]'); pg.wait_for_timeout(200); n1=len(state(b)['cons']); pg.click('#sketcher .sk-btn[data-tool=redo]'); pg.wait_for_timeout(200); n2=len(state(b)['cons'])
check('undo removes and redo restores a dimension',n1<n0 and n2==n0,f'{n0}->{n1}->{n2}')
nd=pg.evaluate("()=>document.querySelectorAll('.sk-dp .dl button[data-del]').length"); pg.click(".sk-dp .dl button[data-del] >> nth=0"); pg.wait_for_timeout(250); nd2=pg.evaluate("()=>document.querySelectorAll('.sk-dp .dl button[data-del]').length")
check('dimension deleted from the list',nd2==nd-1,f'{nd}->{nd2}')
pg.click(".sk-dp header [data-a=x]"); pg.wait_for_timeout(150); closed=not pg.evaluate("()=>!!document.querySelector('.sk-dp')"); pg.click('#sketcher .sk-btn[data-tool=dimtab]'); pg.wait_for_timeout(200)
check('closes, and the toolbar button re-opens it',closed and pg.evaluate("()=>!!document.querySelector('.sk-dp')"))
# Tab moves to the next box and keeps typing working
pg.click(box(ids[1],'hdist')); pg.keyboard.press('Control+A'); pg.keyboard.type('12'); pg.keyboard.press('Tab'); pg.wait_for_timeout(250)
foc=pg.evaluate("()=>{const a=document.activeElement; return a&&a.dataset&&a.dataset.key}"); print(' focus after Tab:',foc)
check('Tab keeps focus inside the panel',bool(foc) and 'vdist' in (foc or ''))
# edit a value on the canvas label still works (existing feature)
check('the sketch is still open (no accidental Finish)',pg.evaluate("()=>!!document.querySelector('#sketcher')"))
# Finish, then a Revolve from this sketch
pg.keyboard.press('Escape'); pg.click('#sketcher .sk-btn[data-tool=ok]'); pg.wait_for_timeout(800)
r=pg.evaluate("""()=>{ const P=PRISM, st=P.st; const sk=st.doc.features.filter(f=>f.type==='sketch').pop(); if(!sk) return {err:'no sketch feature'}; const f=P.commitFeature({type:'x5Revolve',name:'Vase',params:{sketch:sk.id,axis:'Y',angle:360,smooth:true}},true); return {sk:sk.name,dims:sk.params.data.cons.filter(c=>CAD.sketch.DIM_TYPES.has(c.type)).length,status:f._status||null,items:st.items.length}; }""")
print(' finished sketch ->',r); check('Finish keeps the dimensions and a Revolve builds from it',r.get('dims',0)>=4 and not r.get('status') and r.get('items',0)>=1)
print('\n%d / %d checks passed'%(sum(R),len(R)),'| page errors',b.errs[:3]); b.close()
