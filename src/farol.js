'use strict';

// Racers use metres along the spiral (s) and across it (lane). The simulation,
// camera and meshes share this map so a metre on an inside line costs less time.
function createFarol({mesh,drum,cube,soft,ball,cliff,beam,add,bakeStatic,draw}){
  const radius=16, finish=169, halfWidth=3.8, tau=2*Math.PI;
  const cuts=[[8,31],[35,62]];
  const checkpoints=[3.5,57,112];
  const phase=t=>((t+2)%16+16)%16;
  const water=t=>-1.05+.76*Math.cos(phase(t)*tau/16);
  const low=t=>phase(t)>=4 && phase(t)<12;
  const yaw=s=>-s/radius;
  const cutLane=(s,a,b)=>-2.9-4.5*Math.sin(Math.PI*(s-a)/(b-a));
  const rise=s=>Math.max(0,s-62);
  const radiusAt=s=>radius-.048*rise(s);
  const height=(x,s)=>rise(s)*.139-Math.min(1,Math.max(0,(-x-halfWidth)/3.5))*1.05*Math.max(0,1-rise(s)/6);
  function world(x,y,s){
    const a=s/radius;
    return [(radiusAt(s)+x)*Math.cos(a),height(x,s)+y,(radiusAt(s)+x)*Math.sin(a)];
  }
  const breaks=[[96,100,1.1,halfWidth],[135,139,-halfWidth,-.9]];
  function floor(x,s,t){
    if(s<0 || s>finish+4)return false;
    if(Math.abs(x)<=halfWidth+.08 && !breaks.some(([a,b,l,r])=>s>a && s<b && x>=l && x<=r))return true;
    return low(t) && cuts.some(([a,b])=>s>=a && s<=b && Math.abs(x-cutLane(s,a,b))<=1.52);
  }
  const gates=cuts.map(([a,b])=>({x:cutLane((a+b)/2,a,b),y:1.25,z:(a+b)/2,tidal:true}));
  gates.push({x:-1.35,y:1.55,z:98},{x:1.45,y:1.55,z:137});
  let shoals, lightCone;
  function build(){
    const fixed=[], rocks=[];
    function place(list,model,x,y,s,w,h,d,color,turn=0){
      add(list,model,...world(x,y,s),w,h,d,color,yaw(s)+turn);
    }
    // A strip is a continuous curved slab. Top, sides and markings follow the
    // same cross-section used by the floor query, including the two broken edges.
    function strip(list,a,b,left,right,depth,color,offset=0){
      const form=mesh((tri,quad)=>{
        const n=Math.ceil((b-a)/1.6);
        for(let i=0;i<n;i++){
          const ends=[a+(b-a)*i/n,a+(b-a)*(i+1)/n];
          const corners=ends.flatMap(s=>[left(s),right(s)].map(x=>world(x,offset,s)));
          const top=corners.map(p=>[...p,0,1,0]);
          quad(top[0],top[2],top[3],top[1]);
          if(depth<=0)continue;
          for(const [j,k] of [[0,2],[3,1],...(i===0?[[1,0]]:[]),...(i===n-1?[[2,3]]:[])]){
            const p=corners[j],q=corners[k],len=Math.hypot(q[0]-p[0],q[2]-p[2])||1;
            const normal=[(p[2]-q[2])/len,0,(q[0]-p[0])/len];
            quad([...p,...normal],[p[0],p[1]-depth,p[2],...normal],
              [q[0],q[1]-depth,q[2],...normal],[...q,...normal]);
          }
        }
      });
      add(list,form,0,0,0,1,1,1,color,0,0,depth>0?6:0);
    }
    for(const [a,b,l,r] of [[0,96,-halfWidth,halfWidth],[96,100,-halfWidth,1.1],
      [100,135,-halfWidth,halfWidth],[135,139,-.9,halfWidth],[139,finish+4,-halfWidth,halfWidth]]){
      strip(fixed,a,b,()=>l,()=>r,.74,'sand');
      for(const x of [l+.13,r-.19])strip(fixed,a,b,()=>x,()=>x+.09,0,'cream',.027);
    }
    for(let s=2;s<finish+3;s+=3.4){
      place(fixed,cube,0,.025,s,.13,.035,1.32,'brass');
      if(s<63 || breaks.some(([a,b])=>s>a-1 && s<b+1))continue;
      place(fixed,drum,halfWidth-.08,.57,s,.15,1.15,.15,'indigo');
      place(fixed,ball,halfWidth-.08,1.16,s,.23,.23,.23,'brass');
      if(s+3.4<finish)beam(fixed,world(halfWidth-.08,.97,s),world(halfWidth-.08,.97,s+3.4),.075,'brass');
    }
    for(const s of [6, ...checkpoints.slice(1),finish]){
      for(let j=0;j<14;j++)for(let k=0;k<2;k++)
        place(fixed,cube,-3.48+j*.53,.035,s+k*.42,.53,.055,.46,
          s===finish||s===6?(j+k)%2?'ink':'cream':(j+k)%2?'teal':'mint');
    }
    for(const [a,b] of cuts){
      const middle=s=>cutLane(s,a,b);
      strip(rocks,a,b,s=>middle(s)-1.5,s=>middle(s)+1.5,.95,'rock');
      for(let s=a+1;s<b-1;s+=2.2){
        place(rocks,cube,middle(s),.026,s,.25,.04,.91,'mint');
        place(rocks,cliff,middle(s)-1.14,-.19,s,.94,.51,1.46,'moss');
      }
      for(const s of [a,b])place(fixed,drum,-3.55,.62,s,.17,1.32,.17,'brass');
    }
    shoals=bakeStatic(rocks);
    lightCone=mesh((tri,quad)=>{
      function rim(d,i){
        const a=i*tau/16,r=.31+d*.11;
        return [d,r*Math.sin(a),r*Math.cos(a),0,Math.sin(a),Math.cos(a)];
      }
      for(let i=0;i<16;i++)quad(rim(0,i),rim(18,i),rim(18,i+1),rim(0,i+1));
    });
    // Stone feet, masonry bands, salt-stained window frames and the lantern gallery.
    add(fixed,cliff,0,-3,0,17,6.8,16,'rock');
    for(let i=0;i<10;i++){
      const w=10-i*.33,y=.8+i*1.93;
      add(fixed,drum,0,y,0,w,1.96,w,i%4<2?'cream':'rust',0,0,6);
      add(fixed,drum,0,y-.9,0,w+.12,.12,w+.12,'sand');
      if(i%2===0){
        const a=.8*i;
        add(fixed,soft,Math.sin(a)*w*.49,y+.1,Math.cos(a)*w*.49,.86,1.05,.24,'brass',a);
        add(fixed,cube,Math.sin(a)*(w*.49+.15),y+.12,Math.cos(a)*(w*.49+.15),.58,.78,.1,'ink',a);
      }
    }
    for(const [y,w,h,c] of [[19.5,8.9,.68,'indigo'],[20,9.15,.26,'cream'],[21.4,5.3,2.7,'lensBlue'],
      [22.91,7.2,.43,'rust'],[23.3,6.2,.45,'rust'],[23.69,4.8,.38,'brass'],[24.06,2.95,.44,'rust'],[24.55,.26,.9,'brass']])
      add(fixed,drum,0,y,0,w,h,w,c);
    for(let i=0;i<16;i++){
      const a=i*tau/16, b=(i+1)*tau/16;
      add(fixed,drum,4.15*Math.cos(a),20.48,4.15*Math.sin(a),.10,.94,.10,'indigo');
      beam(fixed,[4.15*Math.cos(a),20.9,4.15*Math.sin(a)],[4.15*Math.cos(b),20.9,4.15*Math.sin(b)],.10,'indigo');
      if(i%2===0)add(fixed,drum,2.7*Math.cos(a),21.47,2.7*Math.sin(a),.2,2.65,.2,'brass');
    }
    for(let s=67;s<finish+2;s+=13){
      const x=-2.6, pos=world(x,0,s), h=pos[1]+3;
      add(fixed,drum,pos[0],pos[1]-h/2-.6,pos[2],.76,h,.76,'rock');
      beam(fixed,world(-2.6,-1.72,s),world(2.9,-.68,s),.26,'brass');
    }
    for(const s of [6,finish]){
      for(const x of [-3.55,3.55]){
        place(fixed,drum,x,1.9,s,.38,3.8,.38,'rust');
        place(fixed,drum,x,2.85,s,.4,.46,.4,'cream');
      }
      place(fixed,soft,0,3.94,s,7.55,.47,.53,'teal');
      for(let i=-5;i<=5;i++)place(fixed,cube,i*.61,3.96,s-.23,.32,.23,.14,i%2?'cream':'ink');
    }
    for(let i=0;i<27;i++){
      const a=i*2.399,r=26+(i%4)*4.1;
      add(fixed,cliff,Math.cos(a)*r,-2.8,Math.sin(a)*r,3+i%4,4+i%3,4.7,'rock',a);
    }
    return bakeStatic(fixed);
  }
  function drawSignals(t){
    if(low(t))for(const batch of shoals)draw(...batch);
    for(const [a,b] of cuts)for(const s of [a,b])
      draw(ball,...world(-3.55,1.34,s),.42,.42,.42,low(t)?'mint':'orange',0,0,2);
    const a=t*.82;
    for(const sign of [-1,1]){
      draw(ball,2.68*Math.cos(a)*sign,21.42,2.68*Math.sin(a)*sign,.94,1.43,.94,'gold',0,0,2);
    }
  }
  function drawLight(t){
    const a=t*.82;
    for(const angle of [a,a+Math.PI])
      draw(lightCone,2.7*Math.cos(angle),21.42,2.7*Math.sin(angle),1,1,1,'gold',-angle,0,2,.085);
  }
  return {course:[],attacks:[],bumpers:[],spinners:[],springs:[],gates,checkpoints,finish,
    world,yaw,height,water,low,floor,build,drawSignals,drawLight,
    distanceScale:(x,s)=>1/Math.hypot(Math.max(6,radiusAt(s)+x)/radius,s>62?.147:0),
    tideLabel(t){const p=phase(t),seconds=Math.ceil(p<4?4-p:p<12?12-p:20-p);
      return (low(t)?'Maré baixa · atalhos abertos':'Maré alta · siga a rampa')+' · '+seconds+' s';}
  };
}
