require('../dist/aakar-kernel.js'); const AK=globalThis.AakarKernel; const {V,Xf}=AK; const {Node,evaluate,RES_EXACT,soupVolume}=AK._t; AK.guard=false;
const prim=(p)=>new Node('prim',{prim:p}); const xf=(c,T)=>new Node('xf',{child:c,T}); const bool=(op,a,b)=>new Node('bool',{op,a,b});
const pi=Math.PI; const sph=(r)=>prim(AK.prim.sphere(r));
function lens(r1,r2,d){ if(d>=r1+r2) return 0; if(d<=Math.abs(r1-r2)) return 4/3*pi*Math.min(r1,r2)**3; return pi*(r1+r2-d)**2*(d*d+2*d*(r1+r2)-3*(r1-r2)**2)/(12*d); }
let seed=5; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;}; const R=(a,b)=>a+(b-a)*rnd();
let bad=0,tot=0;
for(let i=0;i<40;i++){
  const r1=R(5,9), r2=R(5,9), d=R(1,14); const dir=V.norm([rnd()-.5,rnd()-.5,rnd()-.5]);
  const a=xf(sph(r1),Xf.rotate([rnd()-.5,rnd()-.5,rnd()-.5],R(0,3))), b=xf(xf(sph(r2),Xf.rotate([rnd()-.5,rnd()-.5,rnd()-.5],R(0,3))),Xf.translate(V.mul(dir,d)));
  for(const op of ['intersect','union','subtract']){
    const ex=op==='intersect'?lens(r1,r2,d):op==='union'?4/3*pi*(r1**3+r2**3)-lens(r1,r2,d):4/3*pi*r1**3-lens(r1,r2,d);
    try{ const ev=evaluate(bool(op,a,b),RES_EXACT); const v=ev.mp.volume; tot++; if(Math.abs(v-ex)>1e-6*ex+1e-6){bad++; if(bad<6)console.log(op,'r1',r1.toFixed(2),'r2',r2.toFixed(2),'d',d.toFixed(2),'exact',v.toFixed(4),'expected',ex.toFixed(4),'faces',ev.body.faces.length);} }catch(e){ if(!/empty|no volume/.test(e.message)) console.log(op,'threw',e.message.slice(0,80)); }
  }
}
console.log('bad',bad,'of',tot);
