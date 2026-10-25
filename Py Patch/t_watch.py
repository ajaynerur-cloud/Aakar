import sys,json
from lib import *
b=B(sys.argv[1])
r=b.ev("""async ()=>{ const T=window.AAKAR_TUTORIALS,W=window.AAKAR_WATCH; await T.loadBundled(); W.cfg.on=true; W.cfg.speed=0.02; W.log.length=0; await T.openPlayer('surface.vase','auto'); const PL=T.state().PL,n=PL.x.c.steps.length,t0=Date.now();
  while(Date.now()-t0<80000){ await new Promise(r=>setTimeout(r,300)); if(PL.err) break; if(PL.built>=n-1&&!PL.busy&&!W.playing) break; }
  const ph={}; W.log.forEach(x=>ph[x.phase]=(ph[x.phase]||0)+1); return {built:PL.built+1,n,err:PL.err,phases:ph}; }""")
print('Watch mode in 8.18.2:',r,'| page errors',b.errs[:2]); b.close()
