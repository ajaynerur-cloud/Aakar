require('../dist/aakar-kernel.js'); const AK=globalThis.AakarKernel; const k=AK.kernel; const {V}=AK;
const near=(a,b,t)=>Math.abs(a-b)<=Math.abs(b)*(t||1e-9)+1e-12;
let pass=0,fail=0; const T=(n,ok,d)=>{ok?pass++:fail++; console.log((ok?'ok  ':'FAIL')+' '+n+(d?'  '+d:''));};
const pi=Math.PI;
// ---------- mirror of Aakar 8.10.0 CAD.exact.conformance (tol 1e-4)
const tol=1e-4, f=(x)=>(+x).toPrecision(8), txt=(s)=>typeof s==='string'?s:new TextDecoder().decode(s);
const C=(name,fn)=>{ try{ const r=fn(); T('conformance: '+name,!!r.ok,r.detail);}catch(e){T('conformance: '+name,false,'threw '+e.message);} };
C('box volume',()=>{const v=k.volume(k.box(20,30,40));return{ok:near(v,24000,tol),detail:f(v)}});
C('cylinder volume',()=>{const v=k.volume(k.cylinder(10,25)),e=pi*2500;return{ok:near(v,e,2e-3),detail:f(v)+' vs '+f(e)}});
C('sphere volume',()=>{const v=k.volume(k.sphere(10)),e=4/3*pi*1000;return{ok:near(v,e,3e-3),detail:f(v)}});
C('translate keeps volume',()=>{const v=k.volume(k.translate(k.box(10,10,10),[5,-3,2]));return{ok:near(v,1000,tol),detail:f(v)}});
C('primitive placement',()=>{const m=k.mesh(k.box(10,20,30),0.1),p=m.positions;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<p.length;i+=3)for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],p[i+a]);mx[a]=Math.max(mx[a],p[i+a]);}const ok=mn.every(x=>Math.abs(x)<1e-6)&&Math.abs(mx[0]-10)<1e-6&&Math.abs(mx[1]-20)<1e-6&&Math.abs(mx[2]-30)<1e-6;return{ok,detail:mn+' .. '+mx}});
C('cut (hole through a block)',()=>{const v=k.volume(k.cut(k.box(40,40,10),k.translate(k.cylinder(5,30),[20,20,-10]))),e=16000-pi*250;return{ok:near(v,e,2e-3),detail:f(v)+' vs '+f(e)}});
C('fuse (two blocks sharing a face)',()=>{const v=k.volume(k.fuse(k.box(10,10,10),k.translate(k.box(10,10,10),[10,0,0])));return{ok:near(v,2000,tol),detail:f(v)}});
C('common (overlap of two blocks)',()=>{const v=k.volume(k.common(k.box(10,10,10),k.translate(k.box(10,10,10),[5,0,0])));return{ok:near(v,500,tol),detail:f(v)}});
C('surface area of a box',()=>{const a=k.area(k.box(10,20,30));return{ok:near(a,2200,tol),detail:f(a)}});
C('mesh',()=>{const m=k.mesh(k.box(10,10,10),0.1),nt=m.indices.length/3;return{ok:nt>=12&&m.positions.length>=24,detail:nt+' triangles'}});
C('mesh of a cylinder is smooth enough',()=>{const m=k.mesh(k.cylinder(10,10),0.01);let r=0;for(let i=0;i<m.positions.length;i+=3)r=Math.max(r,Math.hypot(m.positions[i],m.positions[i+1]));return{ok:Math.abs(r-10)<0.02,detail:'max radius '+f(r)}});
C('STEP export writes a true cylinder',()=>{const s=txt(k.stepExport(k.cylinder(5,10)));return{ok:/ISO-10303-21/.test(s)&&/CYLINDRICAL_SURFACE/.test(s),detail:s.length+' bytes'}});
C('STEP round trip',()=>{const v=k.volume(k.stepImport(txt(k.stepExport(k.box(10,20,30)))));return{ok:near(v,6000,tol),detail:f(v)}});
// ---------- STEP round trips of real boolean results
const cases={
  'block-hole':k.cut(k.box(40,40,10),k.translate(k.cylinder(5,30),[20,20,-10])),
  'boss':k.fuse(k.box(40,40,10),k.translate(k.cylinder(5,10),[20,20,10])),
  'napkin ring':k.cut(k.sphere(10),k.translate(k.cylinder(4,40),[0,0,-20])),
  'cone':k.cone(10,0,25),'frustum':k.cone(10,4,25),'torus':k.torus(20,5),
  'steinmetz':k.common(k.translate(k.cylinder(5,30),[0,0,-15]),k.rotate(k.translate(k.cylinder(5,30),[0,0,-15]),[0,1,0],pi/2)),
  'rotated block-hole':k.rotate(k.cut(k.box(40,40,10),k.translate(k.cylinder(5,30),[20,20,-10])),[1,1,0.3],0.8),
  'octant':k.common(k.sphere(10),k.box(20,20,20)),'hemisphere':k.common(k.sphere(10),k.translate(k.box(30,30,15),[-15,-15,0])),
  'cone cut':k.common(k.cone(10,0,30),k.translate(k.box(40,40,20),[-20,-20,0]))
};
for(const [n,h] of Object.entries(cases)){
  try{ const v0=k.volume(h), a0=k.area(h), s=txt(k.stepExport(h,{name:n})); const h2=k.stepImport(s), v1=k.volume(h2), a1=k.area(h2), vv=k.validate(h2);
    T('step round trip: '+n,near(v1,v0,n==='steinmetz'?2e-6:1e-9)&&near(a1,a0,n==='steinmetz'?2e-6:1e-9)&&vv.ok,'V '+f(v0)+' -> '+f(v1)+'  A '+f(a0)+' -> '+f(a1)+' valid='+vv.ok+(vv.ok?'':JSON.stringify(vv.issues.slice(0,2)))+' '+(s.length/1024).toFixed(1)+' kB');
  }catch(e){ T('step round trip: '+n,false,'threw '+e.message.split('\n')[0]); }
}
// the file really contains true analytic entities
const s1=txt(k.stepExport(cases['block-hole'])); T('STEP contains PLANE/CYLINDRICAL_SURFACE/CIRCLE/LINE',['PLANE(','CYLINDRICAL_SURFACE(','CIRCLE(','LINE(','MANIFOLD_SOLID_BREP(','ADVANCED_FACE('].every(x=>s1.includes(x)), (s1.match(/ADVANCED_FACE/g)||[]).length+' faces');
const s2=txt(k.stepExport(cases['cone'])); T('STEP cone: CONICAL_SURFACE',s2.includes('CONICAL_SURFACE('));
const s3=txt(k.stepExport(cases['torus'])); T('STEP torus: TOROIDAL_SURFACE',s3.includes('TOROIDAL_SURFACE('));
const info=k.info(cases['block-hole']); T('info()',info.faces.cylinder===1&&info.faces.plane===6&&info.edges.circle===2,JSON.stringify(info));
// mass properties extras
const mp=k.massProps(k.box(20,30,40)); T('inertia tensor (box)',near(mp.inertia[2][2],24000/12*(400+900),1e-9)&&Math.abs(mp.inertia[0][1])<1e-6,mp.inertia[2][2]);
// validation catches broken bodies
{ const h=k.box(10,10,10); const ev=AK._t.evaluate(h,AK._t.RES_EXACT); const body=new AK.Body(ev.body.faces.slice(0,5)); const v=AK.validate(body); T('validate detects an open shell',!v.ok&&v.issues.some(i=>i.code==='EDGE_USE'),v.issues.length+' issues'); }
console.log(pass+' passed, '+fail+' failed');
