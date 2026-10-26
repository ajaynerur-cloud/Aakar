const P=PRISM,F=P.F,st=P.st,A=AAKAR_W1,v3=CAD.math.v3,X5=CAD.x5,NB=CAD.nurbs,C=A.curvesApi; const log={};
const fresh=()=>{st.doc=F.newDoc();P.regenerate();};
const stat=(f)=>f._status?(f._status.msg||JSON.stringify(f._status)):null;
fresh();
const arc=(r,a0,a1,cx,cy)=>{const pts=[];for(let i=0;i<=24;i++){const a=a0+(a1-a0)*i/24;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a),0]);}return X5.interpCurve(pts,3);};
const cA=arc(20,-0.5,Math.PI/2,0,0), cB=arc(30,Math.PI*1.1,Math.PI*1.9,-60,40);
const fa=P.commitFeature({type:'nbLiteralCurve',name:'A',params:{crv:cA}},true), fb=P.commitFeature({type:'nbLiteralCurve',name:'B',params:{crv:cB}},true);
const kappa=(c,u0,du)=>{const p0=NB.curvePoint(c,u0-du),p1=NB.curvePoint(c,u0),p2=NB.curvePoint(c,u0+du); const a=v3.sub(p1,p0),b=v3.sub(p2,p1); const cr=v3.cross(a,b); return v3.len(cr)/(v3.len(a)*v3.len(b)*v3.len(v3.sub(p2,p0)))*2;};
const tan=(cc,u,h)=>v3.norm(v3.sub(NB.curvePoint(cc,u+h),NB.curvePoint(cc,u-h)));
const out=[];
for(const g of [0,1,2,3]){
  const f=P.commitFeature({type:'w2Bridge',params:{a:{src:'c:'+fa.id,idx:0,end:'end'},b:{src:'c:'+fb.id,idx:0,end:'start'},g,ta:1,tb:1}},true);
  const it=st.state.items.get(f.id); if(!it){out.push({g,err:stat(f)});continue;}
  const c=it.crv, a=c.U[c.p], b=c.U[c.U.length-c.p-1];
  const aEnd=cA.U[cA.U.length-cA.p-1], bStart=cB.U[cB.p];
  const endA=NB.curvePoint(cA,aEnd), startB=NB.curvePoint(cB,bStart), pS=NB.curvePoint(c,a), pE=NB.curvePoint(c,b);
  const tA=tan(cA,aEnd-0.002,0.001), tBr=tan(c,a+1e-3,1e-3), tBb=tan(cB,bStart+0.002,0.001), tEnd=tan(c,b-1e-3,1e-3);
  const ang=(x,y)=>+(Math.acos(Math.min(1,v3.dot(x,y)))*180/Math.PI).toFixed(2);
  out.push({g,deg:c.p,gap:[+v3.dist(pS,endA).toFixed(6),+v3.dist(pE,startB).toFixed(6)],tanDeg:[ang(tA,tBr),ang(tBb,tEnd)],kappa:{A:+kappa(cA,aEnd-0.004,0.003).toFixed(4),brS:+kappa(c,a+0.006,0.005).toFixed(4),B:+kappa(cB,bStart+0.004,0.003).toFixed(4),brE:+kappa(c,b-0.006,0.005).toFixed(4)}});
}
log.bridge=out;
const Q=[];for(let i=0;i<5;i++){const r=[];for(let j=0;j<5;j++)r.push([i*10,j*10,5*Math.sin(i)+3*Math.cos(j)]);Q.push(r);}
const srf=X5.interpSurface(Q,3,3); const lit=P.commitFeature({type:'nbLiteral',name:'S',params:{srf}},true);
const fi=P.commitFeature({type:'w2Iso',params:{target:lit.id,dir:'both',mode:'count',count:3,t:0.5}},true);
const items=[...st.state.items.values()].filter(i=>i.kind==='curve'&&i.src===fi.id);
const dev=[]; items.forEach(it=>{ const d=it.name.includes(' u=')?'u':'v'; const t=parseFloat(it.name.split('=')[1]); const c=it.crv; const a=c.U[c.p],b=c.U[c.U.length-c.p-1]; let mx=0; for(let k=0;k<=10;k++){const w=a+(b-a)*k/10; const pc=NB.curvePoint(c,w); const ps=d==='u'?NB.surfPoint(srf,srf.U[srf.p]+(srf.U[srf.U.length-srf.p-1]-srf.U[srf.p])*t,w):NB.surfPoint(srf,w,srf.V[srf.q]+(srf.V[srf.V.length-srf.q-1]-srf.V[srf.q])*t); mx=Math.max(mx,v3.dist(pc,ps));} dev.push(+mx.toExponential(2)); });
log.iso={err:stat(fi),curves:items.length,maxDev:dev};
fresh(); P.commitFeature({type:'primitive',params:{kind:'cyl',r:10,h:20,pos:[0,0,0]}},true); const b=st.bodies[0],s=b.solid;
const top=s.F.findIndex(q=>q.n[2]>0.99); const les=CAD.solver.logicalEdges(s).filter(l=>l.faces.includes(top)&&!l.smooth);
const fe=P.commitFeature({type:'w2EdgeCrv',params:{body:b.key,edges:les.map(l=>F.edgeRef(s,l)),smooth:true}},true);
const ec=[...st.state.items.values()].filter(i=>i.kind==='curve'&&i.src===fe.id); const c0=ec[0]&&ec[0].crv; let rad=[];
if(c0){const a=c0.U[c0.p],bb=c0.U[c0.U.length-c0.p-1]; for(let k=0;k<=8;k++){const q=NB.curvePoint(c0,a+(bb-a)*k/8); rad.push(+Math.hypot(q[0],q[1]).toFixed(3));}}
log.edgeCurve={err:stat(fe),n:ec.length,radii:rad,z:c0?+NB.curvePoint(c0,c0.U[c0.p])[2].toFixed(2):null};
return log;
