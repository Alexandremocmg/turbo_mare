const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {pathToFileURL} = require('node:url');
const {setTimeout: sleep} = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts');
const localBins = process.platform === 'win32'
  ? [process.env.ProgramFiles, process.env.LOCALAPPDATA, process.env['ProgramFiles(x86)']]
      .filter(Boolean).map(dir => path.join(dir, 'Google/Chrome/Application/chrome.exe'))
  : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome',
     '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const executable = process.env.CHROME_PATH || localBins.find(p => fs.existsSync(p));
if (!executable) throw new Error('Defina CHROME_PATH com o caminho do executável do Chrome ou Chromium.');
fs.mkdirSync(output, {recursive: true});
const profile = fs.mkdtempSync(path.join(output, 'perfil-'));
const chrome = spawn(executable, [
  '--headless=new', '--no-first-run', '--disable-background-networking', '--disable-extensions',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1365,768',
  '--user-data-dir=' + profile, 'about:blank'
], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
const exited = once(chrome, 'close').catch(() => {});
let socket;

async function main() {
  const file = path.join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    if (chrome.exitCode !== null) throw new Error('Chrome encerrou durante a inicialização.');
    try {
      port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    } catch (error) {
      if (!['ENOENT','EBUSY','EPERM'].includes(error.code)) throw error;
    }
    if (!port) await sleep(200);
  }
  if (!port) throw new Error('Tempo limite ao abrir o navegador de teste.');
  const tabs = await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json());
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  const errors = [], pending = new Map();
  let sequence = 0;
  socket.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      const {resolve, reject} = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  };
  socket.onclose = () => {
    for (const {reject} of pending.values()) reject(new Error('Conexão com Chrome encerrada.'));
    pending.clear();
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method, params}));
    });
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async function until(expression, timeout=90000) {
    const deadline = Date.now() + timeout;
    do {
      if (await evaluate(expression)) return;
      await sleep(160);
    } while (Date.now() < deadline);
    const ui=await evaluate("[document.readyState,document.body?.dataset.mode,document.getElementById('room-status')?.textContent,document.getElementById('race-list')?.textContent]");
    throw new Error('Tempo limite: ' + expression + ' · ' + JSON.stringify(ui) + ' · ' + errors.map(e=>e.exception?.description||e.text).join(' / '));
  }
  const click = id => evaluate('document.getElementById(' + JSON.stringify(id) + ').click()');
  async function screenshot(name) {
    const {data} = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
  }
  const key = (type, code, key, keyCode) => send('Input.dispatchKeyEvent', {type, code, key, windowsVirtualKeyCode:keyCode});
  const moving = "parseInt(document.getElementById('percent').textContent) >= 6";
  const racing = "document.body.dataset.mode === 'race'";

  await send('Runtime.enable');
  await send('Page.enable');
  if(process.argv[2]==='--farol'){
    await send('Emulation.setDeviceMetricsOverride',{width:900,height:540,deviceScaleFactor:1,mobile:false});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      Object.defineProperty(window,'createTurboRoom',{set(factory){
        Object.defineProperty(window,'createTurboRoom',{value:game=>{window.qaFarol=game;return factory(game);}});
      },configurable:true});`});
    await send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});
    await until("!!window.qaFarol && document.getElementById('bay-art')?.naturalWidth>0");
    await evaluate("qaFarol.begin({host:true,slot:0,leaderSlot:0,track:'farol',heats:3,members:[{uid:'host',slot:0,name:'Coral',pilot:0}]})");
    await screenshot('farol-largada');
    await until(racing);
    await key('keyDown','KeyW','w',87);
    await until("parseInt(document.getElementById('percent').textContent)>=39");
    await key('keyUp','KeyW','w',87);
    await screenshot('farol-espiral');
    assert.equal(await evaluate("document.querySelector('canvas').getContext('webgl').getError()"),0);
    assert.deepEqual(errors,[]);
    console.log('Largada e subida do Farol renderizadas em WebGL.');
    return;
  }
  if (['--host','--guest','--friend'].includes(process.argv[2])) {
    await require('./salas.cjs').verify({send,evaluate,until,click,key,screenshot});
    assert.deepEqual(errors,[]);
    return;
  }
  if (process.argv[2] === '--pwa') {
    const entry = new URL(process.argv[3]);
    const navigations = [];
    socket.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Network.responseReceived' && msg.params.type === 'Document') {
        navigations.push(msg.params.response);
      }
    });
    await send('Network.enable');
    await send('Page.navigate', {url:entry.href});
    await until("navigator.serviceWorker?.controller && document.getElementById('offline-state')?.hidden === false");
    const manifest = await send('Page.getAppManifest');
    assert.equal(manifest.errors.length, 0, JSON.stringify(manifest.errors));
    const app = JSON.parse(manifest.data);
    const start = new URL(app.start_url, manifest.url);
    assert.equal(start.href, entry.href);
    assert.equal(app.display, 'standalone');
    assert.equal(app.name, 'Turbo Maré');
    const install = await send('Page.getInstallabilityErrors');
    assert.deepEqual(install.installabilityErrors, []);
    await send('Network.emulateNetworkConditions', {
      offline:true, latency:0, downloadThroughput:0, uploadThroughput:0
    });
    await evaluate("document.documentElement.dataset.beforeOfflineReload = 'true'");
    navigations.length = 0;
    await send('Page.reload', {ignoreCache:false});
    await until("!document.documentElement?.dataset.beforeOfflineReload && !navigator.onLine && document.getElementById('cover-art')?.naturalWidth > 0 && document.getElementById('bay-art')?.naturalWidth > 0");
    assert.ok(navigations.some(res => res.fromServiceWorker && res.status === 200), 'Entrada offline pelo service worker');
    await click('practice');
    await until(racing);
    assert.equal(await evaluate("document.querySelector('canvas').getContext('webgl').getError()"), 0);
    assert.deepEqual(errors, []);
    console.log('Manifesto instalável no Chromium e treino WebGL iniciado offline em ' + entry.href);
    return;
  }
  await send('Emulation.setDeviceMetricsOverride', {width:1365, height:768, deviceScaleFactor:1, mobile:false});
  await send('Page.navigate', {url:pathToFileURL(path.join(root,'index.html')).href});
  await until("document.getElementById('cover-art')?.naturalWidth > 0 && document.getElementById('bay-art')?.naturalWidth > 0 && !!document.querySelector('canvas').getContext('webgl')");
  await screenshot('menu');
  await click('crew-open');
  const crew = [['Lontra','lontra','idle'],['Tubarão','tubarao','run'],['Axolote','axolote','jump'],['Marujo','marujo','dive']];
  for (const [name, filename, pose] of crew) {
    await until("document.getElementById('crew-name').textContent === " + JSON.stringify(name));
    await evaluate("document.getElementById('crew-motion').value = " + JSON.stringify(pose));
    await sleep(600);
    await screenshot(filename);
    await click('crew-next');
  }
  await click('crew-use');
  assert.equal(await evaluate("localStorage.getItem('mare-pilot')"), '0');
  await click('play');
  await until(racing);
  await key('keyDown','KeyW','w',87);
  await until(moving);
  await key('keyUp','KeyW','w',87);
  await key('keyDown','Escape','Escape',27);
  await key('keyUp','Escape','Escape',27);
  await until("document.body.dataset.mode === 'paused'");
  await evaluate("const quality = document.getElementById('quality'); quality.value='high'; quality.dispatchEvent(new Event('change'))");
  await click('modal-main');
  await until(racing + " && document.querySelector('canvas').width === 1365");
  await screenshot('corrida');
  await click('pause');
  await click('modal-menu');
  await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await send('Emulation.setTouchEmulationEnabled', {enabled:true, maxTouchPoints:3});
  await click('play');
  await until(racing + " && document.getElementById('stick').getBoundingClientRect().width > 0");
  const point = await evaluate("(()=>{const r = document.getElementById('stick').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2-36};})()");
  await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
  await until(moving);
  await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await screenshot('celular');
  assert.equal(await evaluate("document.querySelector('canvas').getContext('webgl').getError()"), 0);
  assert.deepEqual(errors, []);
  console.log('Verificados quatro pilotos, corrida, teclado, pausa, retomada, toque emulado e renderização WebGL. Capturas em artifacts/.');
}

const deadline = setTimeout(() => chrome.kill(), 8 * 60 * 1000);
chrome.stderr.resume();
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  clearTimeout(deadline);
  socket?.close();
  chrome.kill();
  await exited;
  if (path.dirname(profile) === output && path.basename(profile).startsWith('perfil-')) {
    fs.rmSync(profile, {recursive:true, force:true, maxRetries:6, retryDelay:250});
  }
});
