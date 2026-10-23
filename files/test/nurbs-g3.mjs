// NURBS G3 maths (exact edge derivatives, arc-length jets, degree-7 Hermite, G3 match row), extracted from app/index.html and run in Node.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8'), i0 = html.indexOf('/* AAKAR-G3-MATH-START */'), i1 = html.indexOf('/* AAKAR-G3-MATH-END */');
if (i0 < 0 || i1 < 0) { console.error('G3 maths block not found in app/index.html'); process.exit(1); }
const src = html.slice(i0, i1); const ctx = {}; ctx.globalThis = ctx; vm.runInNewContext(src, ctx); const G = ctx.AakarG3;
const near=(a,b,t)=>Math.abs(a-b)<=t; let f=0; const ok=(c,m)=>{console.log((c?'  ok    ':'  FAIL  ')+m); if(!c)f++;};
const len=a=>Math.hypot(...a), sub=(a,b)=>a.map((x,i)=>x-b[i]), sc=(a,s)=>a.map(x=>x*s), add=(a,b)=>a.map((x,i)=>x+b[i]), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
// evaluator for tests
function ev(S,s,t){const u=S.U[0]+s*(S.U.at(-1)-S.U[0]),v=S.V[0]+t*(S.V.at(-1)-S.V[0]);const bu=G.basis(S.U,S.p,u),bv=G.basis(S.V,S.q,v);let h=[0,0,0,0];for(let a=0;a<=S.p;a++)for(let b=0;b<=S.q;b++){const i=bu.span-S.p+a,j=bv.span-S.q+b,w=(S.W?S.W[i][j]:1)*bu.N[a]*bv.N[b];const P=S.P[i][j];h[0]+=w*P[0];h[1]+=w*P[1];h[2]+=w*P[2];h[3]+=w;}return [h[0]/h[3],h[1]/h[3],h[2]/h[3]];}
// 1. rational cylinder quarter: edge u0 at (R,0,z)
const R=7,w=Math.SQRT1_2; const cyl={p:2,q:1,U:[0,0,0,1,1,1],V:[0,0,1,1],P:[[[R,0,0],[R,0,10]],[[R,R,0],[R,R,10]],[[0,R,0],[0,R,10]]],W:[[1,1],[w,w],[1,1]]};
for (const e of ['u0','u1']) { const j=G.edgeJet3(cyl,e,0.3); ok(near(len(j.kv),1/R,1e-9),'cylinder '+e+': |kv| = 1/R ('+len(j.kv).toFixed(9)+')'); ok(len(add(j.r3,sc(j.T,1/(R*R))))<1e-9,'cylinder '+e+': r3 = -T/R^2 (err '+len(add(j.r3,sc(j.T,1/(R*R)))).toExponential(2)+')'); }
// 2. random non-rational cubic x quadratic, all 4 edges: compare with finite differences of the evaluator
const rnd=(()=>{let s=7;return()=>{s=(s*16807)%2147483647;return s/2147483647;}})();
const S={p:3,q:2,U:[0,0,0,0,0.4,1,1,1,1],V:[0,0,0,0.5,1,1,1],P:[],W:null};for(let i=0;i<5;i++){S.P.push([]);for(let j=0;j<4;j++)S.P[i].push([i*2+rnd(),j*3+rnd(),rnd()*4]);}
const E={u0:[0,-1,'s'],u1:[1,1,'s'],v0:[0,-1,'t'],v1:[1,1,'t']};
for (const [e,[val,out,fx]] of Object.entries(E)) { const a=0.37, h=1e-3; const f1=x=>fx==='s'?ev(S,val+out*x,a):ev(S,a,val+out*x); // outward parameter x (beyond the edge: extrapolate? use inward with sign)
  // finite differences INSIDE the surface: g(x)=f(-x) for x>=0 ; derivatives of f at 0: f^(k) = (-1)^k g^(k)
  const g=x=>f1(-x), d=G.edgeDerivs(S,e,a);
  const g0=g(0),g1=g(h),g2=g(2*h),g3=g(3*h),g4=g(4*h);
  const G1=[0,1,2].map(k=>(-25*g0[k]+48*g1[k]-36*g2[k]+16*g3[k]-3*g4[k])/(12*h));
  const G2=[0,1,2].map(k=>(35*g0[k]-104*g1[k]+114*g2[k]-56*g3[k]+11*g4[k])/(12*h*h));
  const hh=1e-2,q=[0,1,2,3,4].map(i=>g(i*hh)); const G3=[0,1,2].map(k=>(-5*q[0][k]+18*q[1][k]-24*q[2][k]+14*q[3][k]-3*q[4][k])/(2*hh**3));
  ok(len(sub(d.p,g0))<1e-12,'edge '+e+': point'); ok(len(add(d.D1,G1))/len(G1)<1e-6,'edge '+e+': D1 vs FD ('+(len(add(d.D1,G1))/len(G1)).toExponential(1)+')');
  ok(len(sub(d.D2,G2))/(len(G2)+1)<1e-4,'edge '+e+': D2 vs FD ('+(len(sub(d.D2,G2))/(len(G2)+1)).toExponential(1)+')'); ok(len(add(d.D3,G3))/(len(G3)+1)<2e-3,'edge '+e+': D3 vs FD ('+(len(add(d.D3,G3))/(len(G3)+1)).toExponential(1)+')'); }
// 3. hermite7 end derivatives
{ const B=G.hermite7([0,0,0],[1,2,3],[4,-1,2],[3,3,-5],[9,1,1],[2,-1,0],[1,1,1],[-2,4,1]); const U=[0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1];
  const s=G.startDerivs(B,U,7,3); ok(len(sub(s[1],[1,2,3]))<1e-12&&len(sub(s[2],[4,-1,2]))<1e-12&&len(sub(s[3],[3,3,-5]))<1e-12,'hermite7 start derivatives');
  const Ur=U, Br=B.slice().reverse(), e=G.startDerivs(Br,Ur,7,3); ok(len(add(e[1],[2,-1,0]))<1e-12&&len(sub(e[2],[1,1,1]))<1e-12&&len(add(e[3],[-2,4,1]))<1e-12,'hermite7 end derivatives'); }
// 4. matchRow3: a column must continue a circle (reference) to third order
{ const ref=G.edgeJet3(cyl,'u1',0.5); // outward from the cylinder's u1 edge
  const U=[0,0,0,0,0.3,0.6,1,1,1,1], p=3; const rows=[ref.p, add(ref.p,sc(ref.T,2)), add(add(ref.p,sc(ref.T,4)),[0.3,0,0]), add(ref.p,sc(ref.T,6)), add(ref.p,sc(ref.T,8)), add(ref.p,sc(ref.T,10))];
  // make rows 0..2 G2 by solving rows[2] for the curvature (simple: use startDerivs linearity)
  const D=G.startDerivs(rows,U,p,3), mag=len(D[1]); const tgt2=add(sc(ref.kv,mag*mag),sc(ref.T,dot(D[2],ref.T))); const u2=G.startDerivs([[0,0,0],[0,0,0],[1,1,1]],U,p,2)[2][0]; rows[2]=add(rows[2],sc(sub(tgt2,D[2]),1/u2));
  rows[3]=G.matchRow3(rows,U,p,ref); const d=G.startDerivs(rows,U,p,3), j=G.arcJet(d[1],d[2],d[3]);
  ok(len(sub(j.kv,ref.kv))<1e-9,'matchRow3 keeps G2 (kv err '+len(sub(j.kv,ref.kv)).toExponential(1)+')'); ok(len(sub(j.r3,ref.r3))<1e-9,'matchRow3 gives G3 (r3 err '+len(sub(j.r3,ref.r3)).toExponential(1)+')'); }
console.log('\nNURBS G3: ' + (f ? f + ' FAILED' : 'all checks passed')); process.exit(f?1:0);
