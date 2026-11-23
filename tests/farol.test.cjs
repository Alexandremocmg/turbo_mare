const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const simulate=require('./simulador.cjs');

const source=fs.readFileSync(path.join(__dirname,'../src/farol.js'),'utf8');
const track=vm.runInNewContext(source+'\ncreateFarol({})');
const members=[{slot:0,name:'Lua',pilot:1},{slot:1,name:'Sol',pilot:3}];
let room;
const {game,step,objects}=simulate(api=>{
  room=api;
  return {control:()=>[0,0,false,false],consume(){},finish(){}};
});
function start(host=true,slot=0){
  room.begin({host,slot,leaderSlot:0,members,track:'farol',heats:3});
  if(host)step(400);
}
function setTide(t){
  const state=room.checkpoint();
  state.obstacleTime=t;
  assert.equal(room.apply(state,true),true);
}
function driveCut(startZ,endZ){
  start();setTide(4);
  const r=game.racer;
  Object.assign(r,{x:-2.9,z:startZ});
  game.keys.add('KeyW');
  let frames=0;
  while(r.z<endZ && frames++<600){
    const probe=Math.min(endZ,r.z+1.2);
    const target=-2.9-4.5*Math.sin(Math.PI*(probe-startZ)/(endZ-startZ));
    game.keys.delete('KeyA');game.keys.delete('KeyD');
    if(Math.abs(target-r.x)>.16)game.keys.add(target<r.x?'KeyA':'KeyD');
    step(1);
  }
  assert.ok(r.z>=endZ && r.falls===0 && r.gates.size===1,'Atalho seco atravessado pelo anel');
  game.keys.clear();
  return frames/120;
}
for(const [a,b] of [[8,31],[35,62]]){
  const mid=(a+b)/2;
  assert.equal(track.floor(-7.4,mid,4),true);
  assert.ok(track.water(4)<track.world(-7.4,0,mid)[1]);
  assert.equal(track.floor(-7.4,mid,14),false);
  assert.ok(track.water(14)>track.world(-7.4,0,mid)[1]);
  assert.ok(driveCut(a,b)<(b-a)/8.7,'O atalho economiza tempo em relação à linha central.');
}
start();setTide(9.99);
Object.assign(game.racer,{x:-7.4,z:19.5});
const initial=room.checkpoint();
start(false,0);room.apply(initial,true);room.authority(true,initial,0);
assert.match(objects.get('sector').textContent,/Maré baixa/);
step(170);
assert.equal(game.racer.falls,1,'A mudança de maré retira o piso durante a corrida.');
assert.ok(Math.abs(game.racer.x)<1 && game.racer.z<5,'Retorno ao checkpoint na passagem permanente.');
const restored=room.checkpoint();room.apply(restored,true);
assert.match(objects.get('sector').textContent,/Maré alta/);
start();game.keys.add('KeyW');
for(let i=0;i<4500 && !game.racer.result;i++)step(1);
assert.equal(game.racer.result,1);
assert.equal(game.racer.cp,2);
const top=track.world(0,0,track.finish),base=track.world(0,0,62);
assert.ok(top[1]-base[1]>14 && Math.abs(track.yaw(track.finish)-track.yaw(62))>2*Math.PI);
assert.ok(Math.hypot(top[0],top[2])<Math.hypot(base[0],base[2]));
console.log('Farol: dois atalhos transitáveis e mais rápidos na baixa, inundação, troca de anfitrião e chegada pela espiral.');
