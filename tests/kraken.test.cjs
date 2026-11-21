const assert = require('node:assert/strict');
const {game, objects, step} = require('./simulador.cjs')();

game.practice();
assert.equal(game.racers.length,1);
game.keys.add('KeyW');
for(const [x,z,n,tx] of [[-4.6,21.7,0,-4.6],[6.7,43.8,1,10.65],[10.65,67.8,2,5.6],[-4.8,91.9,3,-7.35]]){
  const r=game.racer;
  Object.assign(r,{x,z,y:0,vx:0,vz:8,vy:0,flight:0,ground:true,hit:0,stun:0,springLock:0,boost:0});
  step(10);
  assert.ok(r.flight>0,'Launch '+n);
  for(let i=0;i<290 && !r.ground;i++)step(1);
  assert.ok(r.ground && r.y===0 && Math.abs(r.x-tx)<1,'Land '+n);
  assert.ok(r.gates.has(n)&&r.boost>0,'Ring '+n);
  console.log('Spring '+n+' -> ('+r.x.toFixed(1)+', '+r.z.toFixed(1)+')');
}
game.keys.clear();
game.racer.x=1.6;game.racer.z=111;game.racer.vz=0;game.racer.vx=0;
let struck=false;
for(let t=0;t<540;t++){step(1);if(game.racer.hit>0){struck=true;break;}}
assert.ok(struck,'Tentacle contact');
game.setClock(100);step(3);assert.equal(game.mode,'race','Unlimited practice');
Object.assign(game.racer,{x:0,z:126.1,y:0,ground:true,wait:0,vy:0});
step(1);assert.equal(game.mode,'result');assert.equal(objects.get('modal-title').textContent,'Treino concluído!');
console.log('OK: all 4 rings and landings, shortcut, Kraken collision, practice finish and timer');
