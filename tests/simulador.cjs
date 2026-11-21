const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function criarSimulador(createTurboRoom) {
  const objects = new Map();
  const gl = new Proxy({}, {
    get: (_, key) => /^[A-Z0-9_]+$/.test(key) ? 1 : () => 1
  });
  const document = {
    body: {dataset: {}},
    createElement: () => ({getContext: () => null}),
    getElementById(id) {
      if (!objects.has(id)) {
        objects.set(id, {getContext: () => gl, style: {}, previousElementSibling: {}, replaceChildren() {}, addEventListener() {}, focus() {}, classList: {add() {}, remove() {}, contains: () => false}, append() {}});
      }
      return objects.get(id);
    }
  };
  const bridge = `
    expose({
      startRace, showMenu, pauseRace, step, keys,
      reset() { freshRace(); setMode('race'); },
      jump() { jumpPressed = .14; },
      dive() { divePressed = .14; },
      practice() { training = true; freshRace(); setMode('race'); },
      setClock(t) { elapsed = t; },
      get racer() { return player; },
      get racers() { return racers; },
      get time() { return elapsed; },
      get mode() { return mode; },
      get finishers() { return finishers; }
    });
  `;
  const script = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
  const frameStart = /  requestAnimationFrame\(frame\);\s*\}\s*$/;
  if (!frameStart.test(script)) throw new Error('O simulador não encontrou o início do loop principal.');
  let game;
  vm.runInNewContext(script.replace(frameStart, () => bridge + '\n}'), {
    document, window: {addEventListener() {}, createTurboRoom}, matchMedia: () => ({matches: false}),
    innerWidth: 1365, innerHeight: 768, devicePixelRatio: 1,
    localStorage: {getItem: () => null, setItem() {}}, expose: api => { game = api; }
  });
  return {game, objects, step(frames) {
    for (let i = 0; i < frames; i++) game.step(1 / 120);
  }};
};
