const P=PRISM,F=P.F,st=P.st,W=AAKAR_W1.api,v3=CAD.math.v3;
const log={};
st.doc=F.newDoc(); P.regenerate();
P.commitFeature({type:'primitive',params:{kind:'box',w:80,d:50,h:30,pos:[0,0,0]}},true);
let b=st.bodies[0]; log.box={bbox:b.solid.bbox(),vol:b.solid.volume(),faces:b.solid.F.length};
// --- scale feature
const sf=P.commitFeature({type:'w1Scale',params:{body:b.key,f:[2,1,0.5],cm:'base',copy:false}},true);
b=st.bodies[0]; log.scaled={err:sf._status,vol:b.solid.volume(),bb:b.solid.bbox(),expectVol:80*50*30*2*1*0.5};
// negative scale (mirror) must stay valid
const sm=P.commitFeature({type:'w1Scale',params:{body:b.key,f:[-1,1,1],cm:'center'}},true);
b=st.bodies[0]; log.mirror={err:sm._status,vol:b.solid.volume()};
// copy
const sc=P.commitFeature({type:'w1Scale',params:{body:b.key,f:[0.5,0.5,0.5],cm:'origin',copy:true}},true);
log.copy={err:sc._status,bodies:st.bodies.length,vols:st.bodies.map(x=>+x.solid.volume().toFixed(1))};
// --- offset face
st.doc=F.newDoc(); P.regenerate();
P.commitFeature({type:'primitive',params:{kind:'box',w:80,d:50,h:30,pos:[0,0,0]}},true);
b=st.bodies[0]; const s=b.solid;
const top=s.F.findIndex(f=>f.n[2]>0.99); const topD0=s.F[top].d;
const of=P.commitFeature({type:'w1Offset',params:{body:b.key,faces:[F.faceRef(s,top)],dist:5,chain:'single'}},true);
b=st.bodies[0]; log.offset={err:of._status,vol:b.solid.volume(),expect:80*50*35};
const of2=P.commitFeature({type:'w1Offset',params:{body:b.key,faces:[F.faceRef(b.solid,b.solid.F.findIndex(f=>f.n[0]>0.99))],dist:-10,chain:'single'}},true);
b=st.bodies[0]; log.offsetNeg={err:of2._status,vol:b.solid.volume(),expect:70*50*35};
// --- cylinder hole offset (curved patch grows)
st.doc=F.newDoc(); P.regenerate();
P.commitFeature({type:'primitive',params:{kind:'cyl',r:10,h:30,pos:[0,0,0]}},true);
b=st.bodies[0]; const cs=b.solid; const side=cs.F.findIndex(f=>f.group);
const oc=P.commitFeature({type:'w1Offset',params:{body:b.key,faces:[F.faceRef(cs,side)],dist:2,chain:'group'}},true);
b=st.bodies[0]; log.cylOffset={err:oc._status,vol:b.solid.volume(),r0vol:cs.volume(),ratio:b.solid.volume()/cs.volume(),expectRatio:(12*12)/(10*10)};
return log;
