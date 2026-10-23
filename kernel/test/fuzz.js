require('../dist/aakar-kernel.js'); const AK=globalThis.AakarKernel; const {V,Xf}=AK; const {Node,evaluate,RES_EXACT,containsPoint}=AK._t;
const prim=(p)=>new Node('prim',{prim:p}); const xf=(c,T)=>new Node('xf',{child:c,T}); const bool=(op,a,b)=>new Node('bool',{op,a,b});
let seed=+process.argv[2]||1; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0; return seed/4294967296;}; const R=(a,b)=>a+(b-a)*rnd();
let s2=987654321; const rnd2=()=>{s2=(s2*1664525+1013904223)>>>0; return s2/4294967296;};
const mk=()=>{ const k=Math.floor(rnd()*5); let n,d;
  if(k===0) {const w=R(8,30),dd=R(8,30),h=R(8,30);n=prim(AK.prim.box(w,dd,h));n.desc='box '+[w,dd,h].map(x=>x.toFixed(1));}
  else if(k===1) {const r=R(3,12),rt=R(3,12),h=R(8,30);n=prim(AK.prim.cone(r,rt,h));n.desc='frustum '+[r,rt,h].map(x=>x.toFixed(1));}
  else if(k===2) {const r=R(5,14);n=prim(AK.prim.sphere(r));n.desc='sphere '+r.toFixed(1);}
  else if(k===3) {const r=R(4,12),rt=rnd()<0.5?0:R(1,3),h=R(10,30);n=prim(AK.prim.cone(r,rt,h));n.desc='cone '+[r,rt,h].map(x=>x.toFixed(1));}
  else {const Rr=R(10,16),r=R(2.5,5);n=prim(AK.prim.torus(Rr,r));n.desc='torus '+Rr.toFixed(1)+' '+r.toFixed(1);}
  const dd=n.desc; n=xf(n,Xf.rotate([rnd()-.5,rnd()-.5,rnd()-.5],R(0,3.1)));
  const o=xf(n,Xf.translate([R(-8,8),R(-8,8),R(-8,8)])); o.desc=dd; return o; };
const desc=(n)=>n.kind==='bool'?'('+desc(n.a)+' '+n.op+' '+desc(n.b)+')':n.desc||(n.child?desc(n.child):'?');
const N=+process.argv[3]||40; let ok=0,thrown=0,bad=0; const errs={};
for(let i=0;i<N;i++){
  const op=['union','subtract','intersect'][Math.floor(rnd()*3)]; let node=bool(op,mk(),mk());
  if(rnd()<0.4) node=bool(['union','subtract','intersect'][Math.floor(rnd()*3)],node,mk());
  const t0=Date.now(); if(process.argv[4]!==undefined && i!==+process.argv[4]) continue;
  if(process.argv[5]==='parts' && node.kind==='bool'){ const mcv=(nd)=>{const ev=evaluate(nd,RES_EXACT); const bb=AK.kernel.bbox(node); let c=0,M=200000; const ext=[0,1,2].map(k=>bb.max[k]-bb.min[k]); for(let j=0;j<M;j++){const p=[bb.min[0]-1+rnd2()*(ext[0]+2),bb.min[1]-1+rnd2()*(ext[1]+2),bb.min[2]-1+rnd2()*(ext[2]+2)]; if(containsPoint(nd,p))c++;} return [AK.massProps(ev.body).volume, c/M*(ext[0]+2)*(ext[1]+2)*(ext[2]+2), bb]}; const A=node.a.kind==='bool'?null:mcv(node.a), B=mcv(node.b); console.log('A',desc(node.a),A&&A.slice(0,2),'\nB',desc(node.b),B.slice(0,2)); }
  try{
    const ev=evaluate(node,RES_EXACT), v=AK.validate(ev.body), mp=ev.mp||AK.massProps(ev.body);
    // Monte Carlo
    const bb=AK.kernel.bbox(node); let cnt=0,M=30000; const ext=[0,1,2].map(k=>bb.max[k]-bb.min[k]);
    for(let j=0;j<M;j++){ const p=[bb.min[0]-1+rnd2()*(ext[0]+2),bb.min[1]-1+rnd2()*(ext[1]+2),bb.min[2]-1+rnd2()*(ext[2]+2)]; if(containsPoint(node,p))cnt++; }
    const vol=(ext[0]+2)*(ext[1]+2)*(ext[2]+2), est=cnt/M*vol, se=Math.sqrt(cnt/M*(1-cnt/M)/M)*vol;
    const good = v.ok && Math.abs(est-mp.volume) < 4*se+0.02*mp.volume;
    if(process.argv[4]!==undefined){ const {soupVolume}=AK._t; console.log(desc(node),'\n exact',mp.volume,'facet',soupVolume(ev.soup),'mc',est,'±',se,'bbox',bb.min.map(x=>x.toFixed(1)),bb.max.map(x=>x.toFixed(1)),'faces',ev.body.faces.map(f=>f.surf.kind[0]+(f.rev?'r':'')).join(''),'edges',JSON.stringify(ev.body.edges().map(e=>e.kind[0]).join('')));}
    if(good) ok++; else { bad++; console.log('BAD',i,op,desc(node),'valid',v.ok,JSON.stringify(v.issues.slice(0,2)),'exact',mp.volume.toFixed(2),'mc',est.toFixed(2),'±',se.toFixed(2)); }
  }catch(e){ thrown++; if(/disagree|not closed|duplicate|no volume/.test(e.message)) console.log('THROWN',i,desc(node),'::',e.message.slice(0,140)); const m=e.message.replace(/[0-9.\-]+/g,'#').slice(0,70); errs[m]=(errs[m]||0)+1; }
}
console.log('ok',ok,'fallback(thrown)',thrown,'WRONG',bad); console.log(errs);
