import sys,json
from lib import *
b=B(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else 'classic')
r=b.ev("""async ()=>{ const P=window.PRISM,out={}; const tb=document.getElementById('toolbar'); let rebuilds=0; const mo=new MutationObserver(m=>{ m.forEach(x=>{ if(x.type==='childList'&&x.target===tb) rebuilds++; }); }); mo.observe(tb,{childList:true});
  const pal=()=>document.getElementById('x10pal'), inp=()=>pal().querySelector('input'), rows=()=>[...pal().querySelectorAll('.ls .it')];
  const t0=performance.now(); CAD.x10.ui.openPal(); await new Promise(r=>setTimeout(r,500)); out.openMs=Math.round(performance.now()-t0); mo.disconnect(); out.toolbarRebuildsOnOpen=rebuilds; out.rows=rows().length;
  out.headings=[...pal().querySelectorAll('.x10gh')].length; out.firstHeading=(pal().querySelector('.x10gh')||{}).textContent;
  // type a few queries
  const q=async(t)=>{ inp().value=t; inp().dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,80)); return rows().map(x=>((x.querySelector('b')||{}).textContent||'')); };
  out.fillet=(await q('fillet')).slice(0,6); out.revolve=(await q('revolve')).slice(0,6); out.zero=(await q('zzzzqq')).length;
  // run a tool that lives on a DIFFERENT tab (NURBS > Revolve+)
  out.tabBefore=P.st.tab; inp().value='revolve+'; inp().dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,80));
  const idx=rows().findIndex(x=>/Revolve\\+/.test(((x.querySelector('b')||{}).textContent||''))); out.revolvePlusRow=idx;
  if(idx>=0){ rows()[idx].click(); await new Promise(r=>setTimeout(r,600)); }
  out.tabAfter=P.st.tab; out.dialogOpened=!!document.querySelector('.dlg:not(.hidden), #modal:not(.hidden)')||!!document.querySelector('#modal');
  // every command must be runnable: a button (after one tab switch) or a registered function
  const bad=[]; CAD.x10.ui.openPal(); const all=window.__cmds; 
  return out; }""")
print(json.dumps(r,indent=1)); print('errors',b.errs[:3]); b.close()
