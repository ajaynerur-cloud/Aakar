require('../dist/aakar-kernel.js'); const AK=globalThis.AakarKernel; const {V,Xf}=AK; const {Node,evaluate,toMesh,RES_EXACT}=AK._t;
const near=(a,b,t)=>Math.abs(a-b)<=Math.abs(b)*(t||1e-9)+1e-12;
let pass=0,fail=0; const T=(n,ok,d)=>{ok?pass++:fail++; console.log((ok?'ok  ':'FAIL')+' '+n+(d?'  '+d:''));};
const prim=(p)=>new Node('prim',{prim:p}); const xf=(c,T)=>new Node('xf',{child:c,T}); const bool=(op,a,b)=>new Node('bool',{op,a,b});
const tr=(c,v)=>xf(c,Xf.translate(v));
const box=(w,d,h)=>prim(AK.prim.box(w,d,h)), cyl=(r,h)=>prim(AK.prim.cone(r,r,h)), sph=(r)=>prim(AK.prim.sphere(r)), cone=(r,rt,h)=>prim(AK.prim.cone(r,rt,h)), tor=(R,r)=>prim(AK.prim.torus(R,r));
function run(name, node, expV, tol, expA){
  const t0=Date.now();
  try{
    const ev=evaluate(node,RES_EXACT); const v=AK.validate(ev.body); const mp=AK.massProps(ev.body);
    const kinds={}; ev.body.edges().forEach(e=>kinds[e.kind]=(kinds[e.kind]||0)+1);
    T(name+' valid',v.ok,JSON.stringify(v.counts)+' euler='+v.euler+' edges='+JSON.stringify(kinds)+(v.ok?'':' '+JSON.stringify(v.issues.slice(0,3))));
    if(expV!=null)T(name+' volume',near(mp.volume,expV,tol||1e-6),mp.volume+' vs '+expV+' rel '+((mp.volume-expV)/expV).toExponential(2));
    if(expA!=null)T(name+' area',near(mp.area,expA,tol||1e-6),mp.area+' vs '+expA);
    console.log('     '+(Date.now()-t0)+' ms, '+ev.soup.length+' tris');
    return ev;
  }catch(e){T(name+' threw',false,e.stack.split('\n').slice(0,3).join(' | '));}
}
const pi=Math.PI;
// 1. through hole
run('block - hole', bool('subtract',box(40,40,10),tr(cyl(5,30),[20,20,-10])), 16000-pi*25*10, 1e-8, 2*1600+4*400+2*pi*5*10-2*pi*25);
// 2. boss
run('block + boss', bool('union',box(40,40,10),tr(cyl(5,10),[20,20,10])), 16000+pi*25*10, 1e-8);

run('fuse blocks', bool('union',box(10,10,10),tr(box(10,10,10),[10,0,0])), 2000, 1e-9, 1000);
// sphere / box
run('octant of sphere', bool('intersect',sph(10),box(20,20,20)), 4/3*pi*1000/8, 1e-7, 3*pi*100/4+4*pi*100/8);
run('hemisphere', bool('intersect',sph(10),tr(box(30,30,15),[-15,-15,0])), 2/3*pi*1000, 1e-7, 3*pi*100);
// napkin ring: sphere with a coaxial hole
const R=10,a=4; run('sphere - coaxial cylinder', bool('subtract',sph(R),tr(cyl(a,40),[0,0,-20])), 4/3*pi*Math.pow(R*R-a*a,1.5), 1e-7);
// steinmetz: two perpendicular cylinders of equal radius
const cx=xf(tr(cyl(5,30),[0,0,-15]), Xf.rotate([0,1,0],pi/2));
run('steinmetz bicylinder', bool('intersect',tr(cyl(5,30),[0,0,-15]),cx), 16*125/3, 5e-5, null);
// ---- more
const sq=Math.sqrt;
run('cone cut by plane', bool('intersect',cone(10,0,30),box(40,40,20)), null);
{ const e=evaluate(bool('intersect',cone(10,0,30),tr(box(40,40,20),[-20,-20,0])),RES_EXACT); const m=AK.massProps(e.body); const ex=pi/3*(100*30-Math.pow(10/3,2)*10); T('cone cut volume',near(m.volume,ex,1e-9),m.volume+' vs '+ex); T('cone cut valid',AK.validate(e.body).ok, JSON.stringify(AK.validate(e.body).counts)); }
// tilted plane through a cylinder (ellipse edge)
{ const cutter=xf(tr(box(100,100,50),[-50,-50,10]), Xf.rotate([1,0,0],pi/6,[0,0,10])); run('tilted cut of cylinder', bool('intersect',cyl(10,20),cutter), pi*100*20/2, 1e-5); }
// lens of two parallel cylinders
{ const r=5,d=6,h=10, ar=2*r*r*Math.acos(d/(2*r))-(d/2)*sq(4*r*r-d*d); const e=run('parallel cylinder lens', bool('intersect',cyl(r,h),tr(cyl(r,h),[d,0,0])), ar*h, 1e-9); }
// coaxial union merges the two side faces
{ const e=run('stacked cylinders', bool('union',cyl(5,10),tr(cyl(5,10),[0,0,10])), pi*25*20, 1e-9); T('stacked cylinders merge to 3 faces', e && e.body.faces.length===3, e&&e.body.faces.length); }
// two spheres: lens
{ const d=12,r=10, lens=pi*(4*r+d)*Math.pow(2*r-d,2)/12; run('sphere/sphere lens', bool('intersect',sph(r),tr(sph(r),[d,0,0])), lens, 1e-8); run('sphere/sphere union', bool('union',sph(r),tr(sph(r),[d,0,0])), 2*4/3*pi*1000-lens, 1e-8); }
// nested
{ const a=bool('subtract',box(40,40,10),tr(cyl(5,30),[20,20,-10])), b=bool('union',a,tr(cyl(3,10),[8,8,10])), c=bool('subtract',b,tr(cyl(2,40),[32,32,-10]));
  run('nested (hole + boss + hole)', c, 16000-pi*25*10+pi*9*10-pi*4*10, 1e-8); }
// lollipop
run('sphere + rod', bool('union',tr(sph(10),[0,0,0]),cyl(3,30)), 4/3*pi*1000+9*pi*30-2*pi/3*(1000-Math.pow(91,1.5)), 1e-8);
// rotation keeps volume
run('rotated box', xf(box(10,20,30),Xf.rotate([1,1,0],0.7)), 6000, 1e-9);
// cylinder cut by box through axis, edges on generatrices
run('half cylinder', bool('intersect',cyl(10,20),tr(box(40,40,30),[0,-20,-5])), pi*100*20/2, 1e-9);
console.log(pass+' passed, '+fail+' failed');
