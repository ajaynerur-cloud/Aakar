import sys,json,time
from lib import *
CIDS=sys.argv[3].split(',')
STATS="""()=>{ const P=window.PRISM,st=P.st; let nb=0,vol=0; (st.bodies||[]).forEach(b=>{ if(b.solid){ nb++; try{vol+=Math.abs(b.solid.volume());}catch(e){} } });
  return {features:st.doc.features.length,bodies:nb,items:(st.items||[]).length,vol:Math.round(vol*100)/100,errs:st.doc.features.filter(f=>f._status&&f._status.level==='error').length}; }"""
def run(html):
    out={}
    for cid in CIDS:
        b=B(html); b.pg.evaluate("()=>window.AAKAR_TUTORIALS.loadBundled()")
        r=b.pg.evaluate("""async (cid)=>{ const T=window.AAKAR_TUTORIALS; const c=T.courseById(cid); const r=await T.runCourse(c,{yield:true}); return {ok:r.ok,steps:r.steps.filter(s=>s.ok).length,n:c.steps.length}; }""",cid)
        r['stats']=b.pg.evaluate(STATS); out[cid]=r; b.close()
    return out
a=run(sys.argv[1]); b=run(sys.argv[2]); bad=0
for cid in CIDS:
    same=a[cid]['stats']==b[cid]['stats'] and a[cid]['ok']==b[cid]['ok']; bad+=0 if same else 1
    print(('SAME ' if same else 'DIFF ')+cid.ljust(22),f"{b[cid]['steps']}/{b[cid]['n']} steps ok={b[cid]['ok']}",b[cid]['stats'])
print('%d / %d tutorials identical to the original app'%(len(CIDS)-bad,len(CIDS)))
