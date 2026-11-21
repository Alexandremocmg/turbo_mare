const assert = require('node:assert/strict');
const {game, objects, step} = require('./simulador.cjs')();

game.startRace();step(390);
assert.equal(game.mode,'race');
assert.ok(game.time<.2);
game.pauseRace();step(300);
assert.equal(game.mode,'paused');
game.pauseRace();
assert.equal(game.mode,'race');

game.reset();
game.keys.add('KeyW');
step(57);
const p=game.racer, z=p.z;
assert.ok(z>7);
game.jump();step(31);
assert.ok(p.y>1);
game.dive();step(8);
assert.ok(p.dive>0 && p.vz>10);
game.keys.clear();
step(150);
assert.ok(p.ground);

game.reset();
game.keys.add('KeyD');
step(300);
assert.equal(game.racer.falls,1);
assert.ok(game.racer.cp===0);
game.keys.clear();
step(100);

game.reset();
let playerFinish;
game.keys.add('KeyW');
let nextTry=0;
for(let i=0;i<66*120 && game.mode==='race';i++) {
  const p=game.racer;
  game.keys.delete('KeyA');game.keys.delete('KeyD');
  const target = p.z>37&&p.z<75 ? .55 : p.z<25&&p.z>10 ? -3.9 : 1.6;
  if(Math.abs(p.x-target)>.68) game.keys.add(p.x<target?'KeyD':'KeyA');
  const jumpEdge=[25.1,47,72,95.55].some(z=>p.z>=z && p.z<z+1.17);
  const jumpObstacle=[12,17.8,37.1,63.55,88,105.6,113.4,119.7].some(z=>p.z>=z && p.z<z+.64);
  if(p.ground && (jumpEdge || jumpObstacle) && game.time>nextTry){
    game.jump();
    nextTry=game.time+.35;
  }
  step(1);
}
playerFinish={result:game.racer.result,cp:game.racer.cp,z:game.racer.z,time:game.time,falls:game.racer.falls,results:game.finishers.map(r=>[r.i,+r.raceTime.toFixed(2),r.falls])};
console.log('Racer test',JSON.stringify(playerFinish));
assert.equal(game.racer.cp,2,'Ambos os checkpoints');
assert.ok(game.racer.result>0 && game.racer.result<=6,'Jogador conclui a pista');
assert.equal(game.mode,'result');
assert.equal(objects.get('modal-title').textContent,'Você se classificou!');

game.showMenu();assert.equal(game.mode,'menu');
game.reset();game.keys.clear();
for(let i=0;i<92*120 && game.mode==='race';i++) step(1);
console.log('Idle test',JSON.stringify({t:game.time,finishers:game.finishers.map(r=>[r.i,+r.raceTime.toFixed(2),r.falls]),racers:game.racers.map(r=>[r.i,+r.z.toFixed(2),r.falls])}));
assert.equal(game.mode,'result');
assert.ok(game.finishers.length>=6,'Seis bots completam a pista');
assert.equal(objects.get('modal-title').textContent,'Fim da corrida');
console.log('Contagem, pausa, salto, mergulho, queda, checkpoints, classificação, eliminação e menu OK');
