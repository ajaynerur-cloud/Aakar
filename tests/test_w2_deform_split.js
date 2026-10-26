const P=PRISM,F=P.F,st=P.st,A=AAKAR_W1,v3=CAD.math.v3,SV=CAD.solver; const log={};
const fresh=()=>{st.doc=F.newDoc();P.regenerate();};
const box=(w,d,h,x=0,y=0,z=0)=>P.commitFeature({type:'primitive',params:{kind:'box',w,d,h,pos:[x,y,z]}},true);
const cyl=(r,h,x=0,y=0)=>P.commitFeature({type:'primitive',params:{kind:'cyl',r,h,pos:[x,y,0]}},true);
const B=(i=0)=>st.bodies[i];
const info=(b)=>({vol:Math.round(b.solid.volume()),faces:b.solid.F.length,bb:[b.solid.bbox().min.map(x=>+x.toFixed(1)),b.solid.bbox().max.map(x=>+x.toFixed(1))]});
const stat=(f)=>f._status?(f._status.msg||JSON.stringify(f._status)):null;
// ---- DEFORM
fresh(); box(20,20,100); let b=B(); const v0=b.solid.volume();
let f=P.commitFeature({type:'w2Deform',params:{target:b.key,axis:'z',bdir:'x',bend:0,twist:90,taper:0,s0:0,s1:100,seg:24}},true);
log.twist={err:stat(f),vol:+(B().solid.volume()/v0).toFixed(4),faces:B().solid.F.length,bb:info(B()).bb};
fresh(); box(20,20,100); b=B(); f=P.commitFeature({type:'w2Deform',params:{target:b.key,axis:'z',bdir:'x',bend:60,twist:0,taper:0,s0:0,s1:100,seg:24}},true);
log.bend={err:stat(f),vol:+(B().solid.volume()/v0).toFixed(4),bb:info(B()).bb,valid:SV.validate(B().solid,B().solid).ok};
fresh(); box(20,20,100); b=B(); f=P.commitFeature({type:'w2Deform',params:{target:b.key,axis:'z',bdir:'x',bend:0,twist:0,taper:-50,s0:0,s1:100,seg:8}},true);
log.taper={err:stat(f),vol:+(B().solid.volume()/v0).toFixed(4),expectVol:+(1/3*(1+0.5+0.25)).toFixed(4),bb:info(B()).bb};
fresh(); cyl(10,60); b=B(); const vc=b.solid.volume(); f=P.commitFeature({type:'w2Deform',params:{target:b.key,axis:'z',bdir:'y',bend:45,twist:30,taper:20,s0:20,s1:80,seg:20}},true);
log.flexCyl={err:stat(f),vol:+(B().solid.volume()/vc).toFixed(3),faces:B().solid.F.length};
// ---- SPLIT FACE
fresh(); box(80,50,30); b=B(); let top=b.solid.F.findIndex(q=>q.n[2]>0.99);
f=P.commitFeature({type:'w2SplitFace',params:{body:b.key,faces:[F.faceRef(b.solid,top)],axis:'x',pos:10,patch:true}},true);
const s=B().solid; log.splitFace={err:stat(f),vol:Math.round(s.volume()),faces:s.F.length,valid:SV.validate(s,s).ok,groups:[...new Set(s.F.filter(q=>q.n[2]>0.99).map(q=>q.group))],sharpEdges:SV.logicalEdges(s).filter(l=>!l.smooth).length};
// ---- SPLIT BODY by tool
fresh(); box(80,50,30,0,0,0); box(20,100,100,0,0,-30); const a=B(0),t=B(1);
f=P.commitFeature({type:'w2SplitBody',params:{body:a.key,tool:t.key,keepTool:false}},true);
log.splitBody={err:stat(f),bodies:st.bodies.map(x=>[x.name,Math.round(x.solid.volume())]),expect:[80*50*30-20*50*30,20*50*30]};
// ---- SILHOUETTE
fresh(); cyl(10,40); b=B(); f=P.commitFeature({type:'w2Silhouette',params:{body:b.key,dir:[1,0,0],mode:'x',tol:1e-3}},true);
log.silhouette={err:stat(f),groups:[...new Set(B().solid.F.filter(q=>q.group).map(q=>q.group))].length,faces:B().solid.F.length};
return log;
