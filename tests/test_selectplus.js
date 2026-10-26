const P=PRISM,F=P.F,st=P.st,W=AAKAR_W1.api,v3=CAD.math.v3,SV=CAD.solver;
const log={};
st.doc=F.newDoc(); P.regenerate();
P.commitFeature({type:'primitive',params:{kind:'box',w:80,d:50,h:30,pos:[0,0,0]}},true);
let b=st.bodies[0], s=b.solid;
// fillet 4 vertical edges r=8 (chain=true follows tangent)
const les=SV.logicalEdges(s);
const vert=les.filter(l=>{const[a,c]=l.segs[0];const d=v3.sub(s.V[a],s.V[c]);return Math.abs(d[2])>1&&Math.abs(d[0])<1e-6&&Math.abs(d[1])<1e-6});
log.vertEdges=vert.length;
const fil=P.commitFeature({type:'fillet',params:{body:b.key,edges:vert.map(l=>F.edgeRef(s,l)),r:8}},true);
b=st.bodies[0]; s=b.solid; log.fillet={err:fil._status,faces:s.F.length,groups:[...new Set(s.F.map(f=>f.group).filter(Boolean))].length};
// ---- tangent chain on top outline
const T=SV.logicalEdges(s); const topF=s.F.findIndex(f=>f.n[2]>0.99);
const topEdges=T.filter(l=>!l.smooth&&l.faces.includes(topF));
log.topOutlineEdges=topEdges.length;
st.sel={type:'edge',bodyId:b.key,bodyIds:[b.key],edges:[topEdges[0]]};
W.selCmd('chain'); log.chainAfter={n:st.sel.edges.length,type:st.sel.type};
// ---- face boundary
st.sel={type:'edge',bodyId:b.key,bodyIds:[b.key],edges:[topEdges[0]]};
W.selCmd('boundary'); log.boundary={n:st.sel.edges.length};
// ---- tangent faces: pick one fillet face
const fi=s.F.findIndex(f=>f.group);
st.sel={type:'face',bodyId:b.key,bodyIds:[b.key],faces:[fi],offset:false};
W.selCmd('tangentFaces'); log.tangentFaces=st.sel.faces.length;
// ---- same radius 
st.sel={type:'face',bodyId:b.key,bodyIds:[b.key],faces:[fi],offset:false};
log.radius=W.faceRadius(s,fi);
W.selCmd('similarRadius'); log.similarRadius=st.sel.faces.length;
// ---- parallel
st.sel={type:'face',bodyId:b.key,bodyIds:[b.key],faces:[topF],offset:false};
W.selCmd('similarNormal'); log.parallel=st.sel.faces.length;
W.selCmd('similarArea'); log.area=st.sel.faces.length;
// ---- select behind: ray through centre from top
const M=PRISM.R.matrices(); const c=PRISM.R.project([0,0,30],M);
st.sel=null; const ok1=W.selectBehind(c[0],c[1]); const a=st.sel&&st.sel.faces.slice(); const ok2=W.selectBehind(c[0],c[1]); const bb=st.sel&&st.sel.faces.slice();
log.behind={ok1,ok2,a,b:bb,sameFace:JSON.stringify(a)===JSON.stringify(bb)};
return log;
