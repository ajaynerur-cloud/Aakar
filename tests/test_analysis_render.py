import sys; sys.path.insert(0,'/home/claude')
from common import *
with sync_playwright() as p:
    b,pg=open_app(p,'index.html',hide_wheel=True)
    pg.evaluate('''()=>{const P=PRISM,F=P.F,st=P.st; st.doc=F.newDoc(); P.regenerate();
      // a rounded block: box with filleted top edges + a cylinder + a NURBS surface
      P.commitFeature({type:'primitive',params:{kind:'box',w:60,d:40,h:20,pos:[0,0,0]}},true);
      const b=st.bodies[0],s=b.solid,tf=s.F.findIndex(q=>q.n[2]>0.99); const les=CAD.solver.logicalEdges(s).filter(l=>l.faces.includes(tf)&&!l.smooth);
      P.commitFeature({type:'fillet',params:{body:b.key,edges:les.map(l=>CAD.feat.edgeRef(s,l)),r:6}},true);
      P.commitFeature({type:'primitive',params:{kind:'cyl',r:10,h:30,pos:[55,0,0]}},true);
      const Q=[];for(let i=0;i<6;i++){const r=[];for(let j=0;j<6;j++)r.push([-40+i*16,-80+j*16,6*Math.sin(i*0.9)+4*Math.cos(j*0.8)]);Q.push(r);}
      const srf=CAD.x5.interpSurface(Q,3,3); P.commitFeature({type:'nbLiteral',name:'Surf',params:{srf}},true);
      P.fitView(); P.redraw();}''')
    pg.wait_for_timeout(2500)
    r=pg.evaluate('''()=>{const A=AAKAR_W1.analysisApi; const st=PRISM.st; const s=st.bodies[0].solid; const c=A.solidCurv(s); const vals=c.val.filter(x=>x!==0); 
       const sg=A.surfGrid(st.items[0].srf,28); const k=sg.H.map(Math.abs); return {solidCurvFaces:vals.length,maxK:Math.max(...vals.map(Math.abs)).toFixed(4),expect:(1/6).toFixed(4),cyl:A.solidCurv(st.bodies[1].solid).val.filter(x=>x).slice(0,2).map(x=>+x.toFixed(4)),surfMaxH:Math.max(...k).toFixed(4),items:st.items.length}}''')
    print(r)
    pg.evaluate("()=>{const A=AAKAR_W1.analysisApi; A.AN.map.on=true; A.AN.iso.on=true; A.AN.sec.on=true; A.AN.sec.axis='z'; A.AN.sec.pos=70; A.openAP(); }")
    pg.wait_for_timeout(1200)
    print(pg.evaluate("()=>JSON.stringify(AAKAR_W1.analysisApi.AN.info)"))
    pg.screenshot(path='/home/claude/an1.png'); print(pg.errs[:4]); b.close()
