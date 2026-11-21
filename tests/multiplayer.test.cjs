const assert = require('node:assert/strict');
const simulate = require('./simulador.cjs');

let callbacks, results;
const controls = [0,0,false,false];
const {game, step} = simulate(actions => {
  callbacks = actions;
  return {
    control: () => controls,
    consume() {},
    finish(rows) { results = Array.from(rows, r=>({...r})); callbacks.reset(); }
  };
});
const members = [{slot:0,name:'Coral',pilot:0},{slot:2,name:'Marujo',pilot:3}];
function start() {
  results = null;
  callbacks.begin({host:true,slot:0,members});
  step(390);
  assert.equal(game.mode,'race');
}
function cross(r) { Object.assign(r,{x:0,y:0,z:126.1,ground:true,vy:0,wait:0});step(1); }
start();
assert.equal(game.racers.length,2);
assert.equal(game.racers[1].pilot,3);
controls[1]=1;
step(35);
assert.ok(game.racers[1].z>4.6);
controls[1]=0;
cross(game.racer);
assert.equal(game.mode,'race','A chegada do anfitrião mantém a corrida do convidado.');
cross(game.racers[1]);
assert.deepEqual(results.map(r=>r.name),['Coral','Marujo']);
assert.match(results[1].score,/2º/);

start();
cross(game.racers[1]);
game.setClock(90);
step(1);
assert.equal(results[0].name,'Marujo');
assert.match(results[1].score,/%/);

start();
callbacks.gone(2);
step(30);
assert.equal(game.mode,'race','O piloto que ficou pode terminar a volta.');
cross(game.racer);
assert.equal(results[1].score,'Saiu');

start();
const guest=game.racers[1];
Object.assign(guest,{x:2,y:1.2,z:55.5,vy:2.53,flight:.37,springLock:.88,nextJump:.22,
  coyote:.07,dove:true,ground:false,cp:1,falls:2});
guest.gates.add(0);
game.setClock(34.4);
const state=callbacks.checkpoint();
callbacks.begin({host:false,slot:2,leaderSlot:0,members});
assert.equal(callbacks.apply(state),true);
callbacks.gone(0);
callbacks.authority(true,state,2);
const promoted=game.racer;
assert.equal(promoted.z,55.5);
assert.equal(promoted.springLock,.88);
assert.equal(promoted.coyote,.07);
assert.equal(promoted.flight,.37);
assert.ok(promoted.dove && promoted.gates.has(0));
assert.equal(promoted.cp,1);
assert.equal(promoted.falls,2);
assert.ok(game.racers[0].left,'Um snapshot anterior não traz um desistente de volta.');
step(12);
assert.ok(game.time>34.4 && game.time<35);
assert.equal(game.mode,'race');
cross(Object.assign(promoted,{flight:0,vy:0,vz:0}));
assert.equal(results[0].name,'Marujo');
console.log('Corrida de amigos: controles remotos, classificação, tempo limite e desconexão verificados.');

callbacks.begin({host:true,slot:0,leaderSlot:0,members,track:'estaleiro'});
step(390);
// Drive the fixed quay and jump from the last barge with the regular controls.
game.keys.add('KeyW');
for(let i=0;i<75*120 && !game.racer.result;i++){
  const r=game.racer, target=r.z<25?0:r.z<54?-6:r.z<72?0:2.8;
  game.keys.delete('KeyA');game.keys.delete('KeyD');
  if(Math.abs(r.x-target)>.28)game.keys.add(r.x<target?'KeyD':'KeyA');
  if(r.ground && r.z>87 && r.z<89.1)game.jump();
  step(1);
}
assert.equal(game.racer.result,1,'O cais leva da largada à chegada do Estaleiro.');
assert.equal(game.racer.cp,2);
assert.ok(game.racer.z<112,'A segunda prova tem uma chegada própria.');
game.keys.clear();
const shipState=callbacks.checkpoint();
callbacks.begin({host:false,slot:2,leaderSlot:0,members,track:'estaleiro'});
assert.equal(callbacks.apply(shipState),true);
callbacks.authority(true,shipState,2);
const bridgeTime=shipState.obstacleTime;
Object.assign(game.racer,{x:1.4+3.4*Math.sin(bridgeTime*.77),z:46,y:0,ground:true,wait:0,vx:0,vy:0,vz:0});
const startX=game.racer.x;step(120);
assert.ok(game.racer.ground && game.racer.y===0,'O teto do contêiner é uma plataforma física.');
assert.ok(Math.abs(game.racer.x-startX)>.05,'O contêiner transporta o piloto.');
console.log('Estaleiro: os dois checkpoints, chegada, contêiner móvel e troca de anfitrião verificados.');
