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
step(1);
assert.equal(results[1].score,'Saiu');
console.log('Corrida de amigos: controles remotos, classificação, tempo limite e desconexão verificados.');
