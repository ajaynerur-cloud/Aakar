const P=PRISM,F=P.F,st=P.st,J=AAKAR_W1.jointApi,v3=CAD.math.v3;
const log={};
st.doc=F.newDoc(); P.regenerate();
const box=(w,d,h,x,y)=>{const f=P.commitFeature({type:'primitive',params:{kind:'box',w,d,h,pos:[x,y,0]}},true); return f.id;};
const A=box(40,40,10,0,0), B=box(20,10,10,100,0), C=box(20,20,5,-100,0);
const body=(id)=>st.bodies.find(b=>b.src===id);
const bb=(id)=>{const b=body(id).solid.bbox();return [b.min.map(x=>+x.toFixed(2)),b.max.map(x=>+x.toFixed(2))]};
log.start={A:bb(A),B:bb(B),C:bb(C)};
const faceHit=(id,pred)=>{const b=body(id),s=b.solid; const fi=s.F.findIndex(pred); return {kind:'face',body:b,fi,p:s.faceCentroid(fi)};};
const mkOrigin=(id,pred,name,extra)=>{const fr=J.frameFromHit(faceHit(id,pred)); const loc=J.localOf(st.state,fr.comp,fr.world); const f=P.commitFeature({type:'w1JOrigin',params:Object.assign({comp:fr.comp,o:loc.o,z:loc.z,x:loc.x,name,flip:false,rot:0,off:[0,0,0]},extra||{})},true); f.name=name; return f;};
const oA=mkOrigin(A,f=>f.n[2]>0.99,'A top'), oB=mkOrigin(B,f=>f.n[2]<-0.99,'B bottom');
log.origins={A:J.originFrame(oA.params),B:J.originFrame(oB.params),status:[oA._status,oB._status]};
// revolute joint with flip (B stands on A), angle 0
const spec=(jt,extra)=>({type:'x10Mate',params:J.mateParams(Object.assign({jt,flip:true,angle:0,pos:0},extra||{}),J.originFrame(oA.params),J.originFrame(oB.params),A,B,oA.id,oB.id)});
const j=P.commitFeature(spec('revolute',{}),true);
log.rev0={err:j._status,B:bb(B)};
// angle 90
P.updateFeature(j,Object.assign({},j.params,{angle:90}));
log.rev90={err:j._status,B:bb(B)};
// limits: angle 200 with [-45,60]
P.updateFeature(j,Object.assign({},j.params,{angle:200,limOn:true,lim0:-45,lim1:60}));
log.limit={status:j._status&&j._status.msg,B:bb(B)};
// slider joint instead
P.updateFeature(j,Object.assign({},j.params,{type:'slider',angle:0,pos:15,limOn:false}));
log.slide15={err:j._status,B:bb(B)};
// cylindrical via w1.slide
P.updateFeature(j,Object.assign({},j.params,{type:'hinge',angle:90,w1:Object.assign({},j.params.w1,{slide:7})}));
log.cyl={err:j._status,B:bb(B)};
// rigid
P.updateFeature(j,Object.assign({},j.params,{type:'lock',angle:0,w1:Object.assign({},j.params.w1,{slide:0})}));
log.rigid={err:j._status,B:bb(B)};
// editing the origin moves the joint: offset origin B by +5 in X
P.updateFeature(oB,Object.assign({},oB.params,{off:[5,0,0]}));
log.originEdit={err:j._status,B:bb(B)};
P.updateFeature(oB,Object.assign({},oB.params,{off:[0,0,0]}));
// ---- as-built: C placed with a rotation, join at A top face axis
// first make C an arbitrary pose by a directEdit move
const cb=body(C); st.sel={type:'body',bodyId:cb.key,bodyIds:[cb.key]};
const mv=P.commitFeature({type:'directEdit',params:{body:cb.key,sel:{type:'body'},frame:'world',axes:[[1,0,0],[0,1,0],[0,0,1]],n0:null,t:[150,0,30],r:[0,0,30]}},true);
log.cMoved=bb(C);
const hitA=faceHit(A,f=>f.n[2]>0.99), frA=J.frameFromHit(hitA);
const fa=J.localOf(st.state,A,frA.world), fb=J.localOf(st.state,C,frA.world);
const ab=P.commitFeature({type:'x10Mate',params:J.mateParams({jt:'revolute',flip:false,angle:0},fa,fb,A,C,null,null)},true);
log.asBuilt0={err:ab._status,C:bb(C)};
P.updateFeature(ab,Object.assign({},ab.params,{angle:45}));
log.asBuilt45={err:ab._status,C:bb(C)};
// ---- motion link: slider on another pair driven by the as-built hinge  (use j as slider driven by ab)
P.updateFeature(j,Object.assign({},j.params,{type:'slider',pos:0,angle:0}));
const lk=P.commitFeature({type:'w1Link',params:{driver:ab.id,driven:j.id,ratio:0.1,offset:0}},true);
P.updateFeature(ab,Object.assign({},ab.params,{angle:100}));
log.link100={err:lk._status||j._status,B:bb(B),expectedLift:10};
// undo sanity
return log;
