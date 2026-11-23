const assert=require('node:assert/strict');
const {game,objects,step}=require('./simulador.cjs')();
const ui=id=>objects.get(id);
const heights=[126.1,109.1,169.1];
const tracks=['Baía do Kraken','Estaleiro à Deriva','Farol da Ressaca'];

ui('offline-cup').click();
for(const [leg,track] of tracks.entries()){
  assert.equal(game.racers.length,6);
  assert.match(ui('progress-name').textContent,new RegExp(track));
  step(400);
  if(leg===0){
    game.pauseRace();
    assert.equal(ui('offline-board').hidden,true);
    ui('modal-main').click();
    assert.equal(game.mode,'race');
  }
  Object.assign(game.racer,{x:0,z:heights[leg]});
  step(1);
  assert.equal(game.racer.result,1);
  for(let i=0;i<91*120&&game.mode==='race';i++)step(1);
  assert.equal(game.mode,'result');
  const bots=game.racers.filter(r=>r!==game.racer && r.result);
  assert.ok(bots.length>=3,track+' tem bots capazes de completar a prova.');
  assert.equal(ui('offline-board').hidden,false);
  const playerRow=ui('offline-rows').children[0].children.map(cell=>cell.textContent);
  assert.deepEqual(Array.from(playerRow), ['1º Você', ...tracks.map((_,i)=>i<=leg?10:'—'),(leg+1)*10]);
  assert.equal(ui('modal-main').textContent,leg<2?'Próxima prova':'Revanche');
  ui('modal-main').click();
}
assert.match(ui('progress-name').textContent,/1\/3.*Baía/);
step(400);
game.setClock(90);
step(1);
assert.deepEqual(Array.from(ui('offline-rows').children.find(row=>row.children[0].textContent.includes('Você')).children.slice(1).map(cell=>cell.textContent)),[0,'—','—',0]);
ui('modal-menu').click();
assert.equal(game.mode,'menu');
ui('play').click();
assert.equal(game.racers.length,10);
assert.equal(ui('offline-board').hidden,true);
console.log('Copa offline: três pistas, bots na chegada, placar acumulado e revanche.');
