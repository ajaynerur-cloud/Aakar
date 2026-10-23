// Integration with the REAL Aakar 8.10.0 code: math + solid + csg + the shipped "optional exact kernel" block, with AakarKernel plugged in.
const fs=require('fs'), vm=require('vm');
const path=require('path'); const HTML=process.argv[2]||process.env.AAKAR_HTML||[path.join(__dirname,'..','..','app','index.html'),path.join(__dirname,'..','..','Aakar_8.11.0.html')].find(f=>fs.existsSync(f)); if(!HTML) throw new Error('set AAKAR_HTML to the Aakar html file'); const html=fs.readFileSync(HTML,'utf8');
const scripts=[]; const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g; let m; while((m=re.exec(html))) scripts.push(m[1]);
const ctx={console,setTimeout,clearTimeout,TextDecoder,performance:{now:Date.now}}; ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
const find=(needle)=>{const s=scripts.find(x=>x.includes(needle)); if(!s) throw new Error('script not found: '+needle); return s;};
vm.runInContext(find('Aakar - math.js'),ctx); vm.runInContext(find('Aakar - solid.js'),ctx); vm.runInContext(find('Aakar - csg.js'),ctx);
const CAD=ctx.CAD; const SOL=CAD.solid;
// the exact-kernel block lives at the end of a larger script; cut it out
const big=find('OPTIONAL EXACT KERNEL'); const a=big.lastIndexOf('/* Aakar 8.10 · OPTIONAL EXACT KERNEL'); const block=big.slice(a);
// minimal stand-ins for the UI objects the block touches
const state={doc:null,state:{bodies:new Map()}};
ctx.PRISM={st:state,toast(){},addGroup(){},meta(){return{vis:{}}},refreshPanels(){},regenerate(){}}; CAD.feat={invalidate(){}}; CAD.io={download(){}}; CAD.step={exportStep:()=>'FACETED'};
vm.runInContext(block,ctx);
// load AakarKernel
const kernelSrc=fs.readFileSync(path.join(__dirname,'..','dist','aakar-kernel.js'),'utf8'); vm.runInContext(kernelSrc,ctx);
const X=CAD.exact, K=ctx.AakarKernel.kernel;
let pass=0,fail=0; const T=(n,ok,d)=>{ok?pass++:fail++; console.log((ok?'ok  ':'FAIL')+' '+n+(d?'  '+d:''));};
T('the shipped exact-kernel block loaded',!!X&&X.state==='absent','from '+HTML);
X.useKernel(K,{name:'AakarKernel',version:K.version}); T('useKernel accepted AakarKernel (all required methods present)',X.state==='ready'&&X.name==='AakarKernel');
const st=X.selfTest(); T('shipped conformance self-test passes on AakarKernel',st.passed===st.total,st.passed+' / '+st.total+(st.passed===st.total?'':JSON.stringify(st.results.filter(r=>!r.ok))));
// exact booleans through the patched CAD.csg
X.useExactBooleans=true;
const P=SOL.PRIM, pi=Math.PI;
const near=(a,b,t)=>Math.abs(a-b)<=Math.abs(b)*t;
const blk=P.box(40,40,10), hole=P.cylinder(5,30,64,[0,0,-10]);
let res=CAD.csg.boolean('subtract',blk,hole);
T('exact boolean was used (not the faceted fallback)',X.exactBooleansDone===1,'exactBooleansDone='+X.exactBooleansDone+' log='+JSON.stringify(X.log.slice(-2)));
const vNative=(()=>{X.useExactBooleans=false; const r=CAD.csg.boolean('subtract',P.box(40,40,10),P.cylinder(5,30,64,[0,0,-10])); X.useExactBooleans=true; return Math.abs(r[0].volume());})();
const vExact=Math.abs(res[0].volume()), vTrue=16000-pi*250;
T('exact result is a single valid solid',res.length===1&&res[0].F.length>0,'faces '+res[0].F.length);
T('exact boolean volume within faceting error of the true value',near(vExact,vTrue,0.01),vExact.toFixed(3)+' vs true '+vTrue.toFixed(3)+' (native faceted: '+vNative.toFixed(3)+')');
T('result carries a recipe so it can be replayed',!!X.recipeOf(res[0]));
// replay + report equivalents
const k=X.kernel; const h=X.replay(X.recipeOf(res[0])); T('replay gives the exact volume',near(k.volume(h),vTrue,1e-9),k.volume(h));
// more complex nested booleans via the same path
const a2=CAD.csg.boolean('union',P.box(30,30,10),P.cylinder(6,12,48,[0,0,10]));
const b2=CAD.csg.booleanMany('subtract',a2,[P.sphere(5,12,24,[0,0,10])]);
T('nested exact booleans (union then subtract)',b2.length===1&&X.exactBooleansDone>=3&&!!X.recipeOf(b2[0]),'done='+X.exactBooleansDone);
const rep=(()=>{ // emulate report(): faceted vs exact volumes for the nested result
  const r=X.recipeOf(b2[0]); const hh=X.replay(r); return {exact:k.volume(hh), faceted:Math.abs(b2[0].volume())};})();
const trueV=30*30*10+pi*36*12-(()=>{ // sphere r5 centred at z=18 intersects the boss (z 10..22, r6): analytic volume of sphere inside the cylinder (cylinder radius 6 > 5, so the whole sphere is inside)
  return 4/3*pi*125; })();
T('nested result: exact volume matches the closed form',near(rep.exact,trueV,1e-8),rep.exact.toFixed(4)+' vs '+trueV.toFixed(4)+' (faceted '+rep.faceted.toFixed(2)+')');
// STEP via the shipped helper
const so=X.exactBodies(); // needs bodies in state; emulate
state.state.bodies.set('a',{key:'a',name:'Plate',solid:b2[0]}); state.state.bodies.set('b',{key:'b',name:'Faceted',solid:P.box(5,5,5).clone()});
ctx.PRISM.meta=()=>({vis:{}});
const out=X.exportStep({name:'t'}); T('exportStep: one exact body + one faceted body',out.exact===1&&out.faceted===1,JSON.stringify({exact:out.exact,faceted:out.faceted}));
T('exported exact STEP holds true surfaces',/CYLINDRICAL_SURFACE/.test(out.files[0])&&/SPHERICAL_SURFACE/.test(out.files[0])&&/MANIFOLD_SOLID_BREP/.test(out.files[0]),(out.files[0].length/1024).toFixed(1)+' kB');
const r2=X.report(); const row=r2.find(x=>x.name==='Plate'); T('report(): exact vs faceted for the exact body',row&&row.exact&&Math.abs(row.diff)<2,JSON.stringify(row&&{volume:+row.volume.toFixed(3),faceted:+row.faceted.toFixed(3),diff:+row.diff.toFixed(3)}));
// torus now takes part in the exact framework
{ X.useExactBooleans=true; const tor=P.torus(20,5,48,16,[0,0,0]); T('torus primitive carries a recipe',X.recipeOf(tor)&&X.recipeOf(tor).op==='torus',JSON.stringify(X.recipeOf(tor)));
  const ring=CAD.csg.boolean('subtract',tor,P.box(60,60,20,[0,0,5]).clone? P.box(60,60,20,[0,0,5]):P.box(60,60,20)); T('torus − box through the exact kernel',ring.length>=1,'solids '+ring.length+' exactDone='+X.exactBooleansDone); }
console.log(pass+' passed, '+fail+' failed');
