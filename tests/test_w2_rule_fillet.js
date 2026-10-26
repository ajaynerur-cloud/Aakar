const P=PRISM,F=P.F,st=P.st,A=AAKAR_W1,SV=CAD.solver; const log={};
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const settle=async()=>{for(let i=0;i<20;i++){await wait(500); const bad=st.doc.features.some(f=>f._status&&/background/i.test(f._status.msg||'')); if(!bad)return i;} return -1;};
const fresh=()=>{st.doc=F.newDoc();P.regenerate();};
const box=(w,d,h,x=0,y=0,z=0)=>P.commitFeature({type:'primitive',params:{kind:'box',w,d,h,pos:[x,y,z]}},true);
const B=(i=0)=>st.bodies[i]; const stat=(f)=>f._status?(f._status.msg||JSON.stringify(f._status)):null;
fresh(); box(60,40,20); let b=B(); const sh=A.shapeApi;
// pass 1: top face edges r=3
const les=sh.ruleEdges(b.solid,'selfaces',{faces:[b.solid.F.findIndex(q=>q.n[2]>0.99)]});
P.commitFeature({type:'fillet',params:{body:b.key,edges:les.map(le=>F.edgeRef(b.solid,le)),r:3}},true); await settle();
const l2=sh.ruleEdges(B().solid,'convex',{}); log.remainingConvexRule=l2.length;
const b2=B(); const f=P.commitFeature({type:'fillet',params:{body:b2.key,edges:l2.map(le=>F.edgeRef(b2.solid,le)),r:1}},true); const w=await settle();
log.pass2={err:stat(f),faces:B().solid.F.length,vol:Math.round(B().solid.volume()),settle:w};
return log;
