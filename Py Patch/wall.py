import sys, json, time, os
from playwright.sync_api import sync_playwright
APP, OUT, PART, NPART = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
STATS = """()=>{ const P=window.PRISM,st=P.st; let nb=0,vol=0; (st.bodies||[]).forEach(b=>{ if(b.solid){ nb++; try{vol+=Math.abs(b.solid.volume());}catch(e){} } });
  return {features:st.doc.features.length,bodies:nb,items:(st.items||[]).length,vol:Math.round(vol*100)/100,errs:st.doc.features.filter(f=>f._status&&f._status.level==='error').map(f=>f.name+': '+f._status.msg)}; }"""
res={'courses':[]}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1228/chrome-linux64/chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    def page():
        pg=b.new_page(viewport={'width':1500,'height':900}); pg.set_default_timeout(200000); pg.add_init_script("try{localStorage.setItem('aakar.uiSkin','classic')}catch(e){}")
        pg.on('pageerror',lambda e: res.setdefault('pageerrors',[]).append(str(e)[:200])); pg.goto('file://'+APP); pg.wait_for_timeout(4500)
        pg.evaluate("()=>{document.querySelectorAll('.open').forEach(x=>x.classList.remove('open')); window.AAKAR_TUTORIALS.loadBundled();}"); return pg
    pg=page(); ids=pg.evaluate("()=>window.AAKAR_TUTORIALS.packs().flatMap(p=>p.courses.map(c=>c.id))"); pg.close(); ids=[x for i,x in enumerate(ids) if i%NPART==PART]
    for cid in ids:
        rec={'id':cid}
        # A) Watch ON (tiny delays so every code path runs), Build-all through the real player
        pg=page(); t0=time.time()
        try:
            r=pg.evaluate("""async (cid)=>{ const T=window.AAKAR_TUTORIALS,W=window.AAKAR_WATCH; W.cfg.on=true; W.cfg.speed=0.01; W.cfg.cursor=true; W.log.length=0; await T.openPlayer(cid,'auto'); const PL=T.state().PL, n=PL.x.c.steps.length, t0=Date.now();
               while(Date.now()-t0<170000){ await new Promise(r=>setTimeout(r,300)); if(PL.err) break; if(PL.built>=n-1 && !PL.busy && !W.playing) break; }
               return {built:PL.built,n,err:PL.err,log:W.log.slice(),playing:W.playing}; }""",cid)
            rec['on']=dict(r,stats=pg.evaluate(STATS))
        except Exception as e: rec['on']={'exc':str(e)[:200]}
        pg.close()
        # B) Watch OFF: headless run
        pg=page()
        try:
            r=pg.evaluate("""async (cid)=>{ const T=window.AAKAR_TUTORIALS; const c=T.courseById(cid); const r=await T.runCourse(c,{yield:true}); return {ok:r.ok}; }""",cid); rec['off']=dict(r,stats=pg.evaluate(STATS))
        except Exception as e: rec['off']={'exc':str(e)[:200]}
        pg.close(); rec['secs']=round(time.time()-t0); res['courses'].append(rec); json.dump(res,open(OUT,'w'))
        on,off=rec['on'],rec['off']; same = on.get('stats') and off.get('stats') and all(on['stats'][k]==off['stats'][k] for k in ('features','bodies','items','vol'))
        ph={}; [ph.__setitem__(x['phase'],ph.get(x['phase'],0)+1) for x in on.get('log',[])]
        print(cid.ljust(24),'built',on.get('built',-1)+1,'/',on.get('n'),'| identical to Watch-off:',bool(same),'| phases',ph,'| err',on.get('err') or on.get('exc') or '', f'{rec["secs"]}s',flush=True)
    res['done']=True; json.dump(res,open(OUT,'w')); b.close()
print('DONE')
