require('../dist/aakar-kernel.js'); const AK=globalThis.AakarKernel; const {V}=AK;
const near=(a,b,t)=>Math.abs(a-b)<=Math.abs(b)*(t||1e-9)+1e-12;
let pass=0,fail=0; const T=(n,ok,d)=>{ok?pass++:fail++; console.log((ok?'ok  ':'FAIL')+' '+n+(d?'  '+d:''));};
const P=AK.prim;
let b=P.box(20,30,40).body, m=AK.massProps(b); T('box V',near(m.volume,24000),m.volume); T('box A',near(m.area,2*(600+800+1200)),m.area); T('box centroid',V.dist(m.centroid,[10,15,20])<1e-9);
T('box validate',AK.validate(b).ok, JSON.stringify(AK.validate(b).counts)+' euler '+AK.validate(b).euler);
// inertia of box about centroid: Ixx = m/12 (b²+c²) with unit density
T('box Ixx',near(m.inertia[0][0],24000/12*(900+1600),1e-9),m.inertia[0][0]);
b=P.cone(10,10,25).body; m=AK.massProps(b); T('cylinder V',near(m.volume,Math.PI*100*25),m.volume); T('cylinder A',near(m.area,2*Math.PI*10*25+2*Math.PI*100),m.area);
T('cylinder validate',AK.validate(b).ok,JSON.stringify(AK.validate(b).issues));
T('cylinder centroid',V.dist(m.centroid,[0,0,12.5])<1e-9);
b=P.cone(10,4,25).body; m=AK.massProps(b); const Vf=Math.PI*25/3*(100+40+16); T('frustum V',near(m.volume,Vf),m.volume+' vs '+Vf);
const sl=Math.hypot(6,25); T('frustum A',near(m.area,Math.PI*(10+4)*sl+Math.PI*(100+16)),m.area);
b=P.cone(10,0,25).body; m=AK.massProps(b); T('cone V',near(m.volume,Math.PI*100*25/3),m.volume); T('cone A',near(m.area,Math.PI*10*Math.hypot(10,25)+Math.PI*100),m.area);
T('cone validate',AK.validate(b).ok,JSON.stringify(AK.validate(b).issues)); T('cone centroid z',near(m.centroid[2],25/4),m.centroid[2]);
b=P.sphere(10).body; m=AK.massProps(b); T('sphere V',near(m.volume,4/3*Math.PI*1000),m.volume); T('sphere A',near(m.area,4*Math.PI*100),m.area);
b=P.torus(20,5).body; m=AK.massProps(b); T('torus V',near(m.volume,2*Math.PI*Math.PI*20*25),m.volume); T('torus A',near(m.area,4*Math.PI*Math.PI*20*5),m.area);
console.log(pass+' passed, '+fail+' failed');
