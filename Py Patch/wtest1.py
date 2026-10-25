import sys, json, time
from playwright.sync_api import sync_playwright
APP=sys.argv[1]; CID=sys.argv[2]; STEP=int(sys.argv[3]); TAG=sys.argv[4]; SHOTS=[float(x) for x in sys.argv[5].split(',')]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1228/chrome-linux64/chrome',args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1500,'height':900}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.add_init_script("try{localStorage.setItem('aakar.uiSkin','"+__import__('os').environ.get('SKIN','classic')+"')}catch(e){}")
    pg.goto('file://'+APP); pg.wait_for_timeout(5500)
    pg.evaluate("()=>{document.querySelectorAll('.open').forEach(x=>x.classList.remove('open')); window.AAKAR_TUTORIALS.loadBundled();}")
    # open the player on the chosen course (step mode), build earlier steps silently so this step's refs exist
    pg.evaluate("""async ([cid,step])=>{ const T=window.AAKAR_TUTORIALS; await T.openPlayer(cid,'step'); const W=window.AAKAR_WATCH; const c=T.courseById(cid); const PL=T.state().PL;
        W.cfg.on=false; for(let i=0;i<step;i++){ const r=await T.runStep(c,i,{shot:false}); if(!r.ok) throw new Error('prep '+i+': '+r.err); PL.built=i; PL.i=i+1; } W.cfg.on=true; W.cfg.speed=1; }""",[CID,STEP])
    pg.wait_for_timeout(500)
    # click the real "Build this step" button
    pg.evaluate("()=>{ const b=document.querySelector('#aakTP [data-a=build]'); b.click(); }")
    t0=time.time()
    for k,t in enumerate(SHOTS):
        while time.time()-t0<t: time.sleep(0.05)
        pg.screenshot(path=f'/home/claude/w/{TAG}_{k}.png')
    pg.wait_for_function("()=>!window.AAKAR_WATCH.playing",timeout=90000)
    pg.wait_for_timeout(1500)
    print('log:',json.dumps(pg.evaluate("()=>window.AAKAR_WATCH.log")))
    print('state:',json.dumps(pg.evaluate("()=>{const s=window.AAKAR_TUTORIALS.state().PL; return {built:s.built,i:s.i,err:s.err,busy:s.busy}}")),'| errors',errs[:3])
    b.close()
