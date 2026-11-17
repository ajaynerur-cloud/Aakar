// generates STEP files of freeform solids + AakarKernel's own volume/area for occt_crosscheck.py
require('../dist/aakar-kernel.js');const fs=require('fs'),path=require('path'),D=process.argv[2]||'.';const N=globalThis.AakarKernel.kernel.nurbs;const PI=Math.PI,X=[1,0,0],Y=[0,1,0],Z=[0,0,1],O=[0,0,0];
const sq=[[-5,-5,0],[5,-5,0],[5,5,0],[-5,5,0]],sqs=sq.map((a,i)=>N.line(a,sq[(i+1)%4]));
const slot=[N.line([0,-5,0],[20,-5,0]),N.arc([20,0,0],X,Y,5,-PI/2,PI/2),N.line([20,5,0],[0,5,0]),N.arc([0,0,0],X,Y,5,PI/2,3*PI/2)];
const R=7,half=[N.arc(O,X,Z,R,-PI/2,PI/2),N.line([0,0,R],[0,0,-R])];
const ell=N.interp(Array.from({length:17},(_,i)=>{const t=2*PI*i/16;return [12*Math.cos(t),6*Math.sin(t),0]}),3);
const cases={
 cyl:[()=>N.extrude(N.circle(O,X,Y,10),[0,0,25]),PI*100*25],
 frustum:[()=>N.loft([N.circle(O,X,Y,10),N.circle([0,0,25],X,Y,4)]),PI*25/3*(100+40+16)],
 sphere:[()=>N.revolve(half,O,Z),4/3*PI*R**3],
 torus:[()=>N.revolve(N.circle([20,0,0],X,Z,5),O,Z),2*PI*PI*20*25],
 halftorus:[()=>N.revolve(N.circle([20,0,0],X,Z,5),O,Z,PI),PI*PI*20*25],
 qsphere:[()=>N.revolve(half,O,Z,PI/2),PI*R**3/3],
 slot:[()=>N.extrude(slot,[0,0,8]),(2*5*20+PI*25)*8],
 box:[()=>N.extrude(sqs,[0,0,40]),4000],
 twist:[()=>N.sweep(sqs,N.line([0,0,0],[0,0,40]),{steps:16,twist:PI/2}),4000],
 sweeparc:[()=>N.sweep(N.circle([40,0,0],X,Z,5),N.arc(O,X,Y,40,0,PI/2),{steps:24}),PI*25*40*PI/2],
 ellloft:[()=>N.loft([ell,N.circle([0,0,30],X,Y,5)]),null],
 revslot:[()=>N.revolve([N.line([5,0,0],[15,0,0]),N.line([15,0,0],[15,0,6]),N.line([15,0,6],[5,0,6]),N.line([5,0,6],[5,0,0])],O,Z),PI*(225-25)*6]
};
const meta={};for(const k in cases){try{const s=cases[k][0]();fs.writeFileSync(path.join(D,k+'.step'),N.stepWrite(s,{name:k}));const m=N.massProps(s);meta[k]={vol:m.volume,area:m.area,exp:cases[k][1]}}catch(e){meta[k]={err:e.message}}}
fs.writeFileSync(path.join(D,'meta.json'),JSON.stringify(meta,null,1));console.log(Object.keys(meta).length+' cases written to '+D)
