const P=PRISM,F=P.F,st=P.st,A=AAKAR_W1,v3=CAD.math.v3,SV=CAD.solver; const log={};
const fresh=()=>{st.doc=F.newDoc();P.regenerate();};
const box=(w,d,h,x=0,y=0,z=0)=>P.commitFeature({type:'primitive',params:{kind:'box',w,d,h,pos:[x,y,z]}},true);
const B=(i=0)=>st.bodies[i];
const stat=(f)=>f._status?(f._status.msg||JSON.stringify(f._status)):null;
const topFace=(b)=>b.solid.F.findIndex(q=>q.n[2]>0.99);
// ---- convex edges rule
fresh(); box(60,40,20); let b=B(); const sh=A.shapeApi;
log.rules={convex:sh.ruleEdges(b.solid,'convex',{}).length,concave:sh.ruleEdges(b.solid,'concave',{}).length,all:sh.ruleEdges(b.solid,'all',{}).length};
// rule fillet pass 1: 4 vertical convex edges only (use top face edges rule: selfaces)
const tf=topFace(b); const les=sh.ruleEdges(b.solid,'selfaces',{faces:[tf]}); log.selfacesTop=les.length;
let f=P.commitFeature({type:'fillet',params:{body:b.key,edges:les.map(le=>F.edgeRef(b.solid,le)),r:3}},true); log.filletTop={err:stat(f),faces:B().solid.F.length,vol:Math.round(B().solid.volume())};
const l2=sh.ruleEdges(B().solid,'convex',{}); log.convexAfter=l2.length;
// pass 2 on remaining convex
const b2=B(); f=P.commitFeature({type:'fillet',params:{body:b2.key,edges:l2.map(le=>F.edgeRef(b2.solid,le)),r:1}},true); log.fillet2={err:stat(f),faces:B().solid.F.length,vol:Math.round(B().solid.volume())};
// concave: L-shape
fresh(); box(60,40,20); box(20,40,20,20,0,20); 
const u=P.commitFeature({type:'primitive',params:{kind:'box',w:1,d:1,h:1,pos:[500,0,0]}},true);
// ---- WIZARDS
fresh(); box(60,40,20); b=B(); let fr=F.faceRef(b.solid,topFace(b)); const v0=b.solid.volume();
const wiz=(p)=>{ const bb=B(); const q=P.commitFeature({type:'w2Wiz',params:Object.assign({body:bb.key,face:F.faceRef(bb.solid,bb.solid.F.findIndex(x=>x.n[2]>0.99)),type:'boss',shape:'round',size:12,h:5,draft:0,hole:0,hdepth:8,du:0,dv:0,inset:1,wall:1.5,clear:0.2},p)},true); return q;};
f=wiz({type:'boss',size:12,h:5}); log.boss={err:stat(f),dv:Math.round(B().solid.volume()-v0),expect:Math.round(Math.PI*36*5*0.99)};
fresh(); box(60,40,20); f=wiz({type:'boss',shape:'square',size:10,h:6,draft:5,hole:4,hdepth:10}); log.bossSquareDraftHole={err:stat(f),faces:B().solid.F.length,vol:Math.round(B().solid.volume()),bb:B().solid.bbox().max[2]};
fresh(); box(60,40,20); const v1=B().solid.volume(); f=wiz({type:'dome',size:20,h:5}); log.dome={err:stat(f),dv:Math.round(B().solid.volume()-v1),expect:Math.round(Math.PI*5/6*(3*100+25)),top:+B().solid.bbox().max[2].toFixed(2)};
fresh(); box(60,40,20); f=wiz({type:'dimple',size:20,h:4}); log.dimple={err:stat(f),dv:Math.round(B().solid.volume()-v1)};
fresh(); box(60,40,20); f=wiz({type:'lip',inset:2,wall:1.5,h:3}); log.lip={err:stat(f),dv:Math.round(B().solid.volume()-v1),expectApprox:Math.round((56*36-53*33)*3)};
fresh(); box(60,40,20); f=wiz({type:'groove',inset:2,wall:1.5,h:3,clear:0.2}); log.groove={err:stat(f),dv:Math.round(B().solid.volume()-v1)};
// ---- FACE PATTERN
fresh(); box(60,40,20); const tgt=B(); const cut=P.commitFeature({type:'primitive',params:{kind:'cyl',r:3,h:30,pos:[-20,-10,-5]}},true);
const tb=B(0), sb=B(1); const vt=tb.solid.volume();
f=P.commitFeature({type:'w2FPat',params:{src:sb.key,face:{body:tb.key,ref:F.faceRef(tb.solid,topFace(tb))},kind:'grid',nu:3,nv:2,du:20,dv:20,mode:'cut'}},true);
log.facePatCut={err:stat(f),bodies:st.bodies.length,dv:Math.round(B().solid.volume()-vt),expectApprox:-Math.round(6*Math.PI*9*20)};
fresh(); box(60,40,20); const cyl2=P.commitFeature({type:'primitive',params:{kind:'cyl',r:3,h:8,pos:[-20,0,20]}},true);
const tb2=B(0),sb2=B(1); f=P.commitFeature({type:'w2FPat',params:{src:sb2.key,face:{body:tb2.key,ref:F.faceRef(tb2.solid,topFace(tb2))},kind:'circular',count:6,angle:360,cu:0,cv:0,mode:'new'}},true);
log.facePatNew={err:stat(f),bodies:st.bodies.length};
return log;
