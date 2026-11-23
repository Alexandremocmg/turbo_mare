const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {setTimeout: sleep} = require('node:timers/promises');

async function signal(dir, name) {
  const file = path.join(dir, name);
  const end = Date.now()+120000;
  while (!fs.existsSync(file)) {
    if(fs.existsSync(path.join(dir,'failed'))) throw Error('Outro perfil do teste encerrou.');
    if (Date.now()>end) throw Error('Tempo limite aguardando '+name);
    await sleep(180);
  }
  return fs.readFileSync(file,'utf8');
}

async function verify({send,evaluate,until,click,key,screenshot}) {
  const [role,entry,dir,scenario]=process.argv.slice(2);
  const name={'--host':'Coral','--guest':'Marujo','--friend':'Lontra'}[role];
  const notify=(file,value='ok')=>{console.log(role,file);const dest=path.join(dir,file);fs.writeFileSync(dest+'.tmp',value);fs.renameSync(dest+'.tmp',dest);};
  const wait=file=>signal(dir,file);
  await send('Emulation.setDeviceMetricsOverride',{width:570,height:370,deviceScaleFactor:.65,mobile:false});
  // This test exercises input, physics and the relay across independent profiles.
  // The separate browser smoke test covers WebGL rendering with the full draw calls.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    try { localStorage.setItem('mare-render-quality','light'); } catch {}
    for (const method of ['drawArrays','drawElements','clear']) {
      const original=WebGLRenderingContext.prototype[method];
      WebGLRenderingContext.prototype[method]=function(...args){if(window.captureGL)return original.apply(this,args);};
    }
    const nativeFrame=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=fn=>setTimeout(()=>nativeFrame(fn),170);
  `});
  const go=url=>send('Page.navigate',{url});
  const leader=n=>"Array.from(document.querySelectorAll('#race-list li')).some(row=>row.textContent.includes("+JSON.stringify(n)+") && row.textContent.includes('Anfitrião'))";
  const advanced=n=>"Array.from(document.querySelectorAll('#race-list li')).some(row=>row.textContent.includes("+JSON.stringify(n)+") && Number(row.textContent.match(/([0-9]+)%/)?.[1])>=4)";
  const move=async()=>{
    await key('keyDown','KeyW','w',87);
    await until("parseInt(document.getElementById('percent').textContent)>=5");
    await key('keyUp','KeyW','w',87);
  };
  const {targetInfo}=await send('Target.getTargetInfo');
  async function minimize() {
    const {targetId}=await send('Target.createTarget',{url:'about:blank',background:false});
    await send('Target.activateTarget',{targetId});
    await until('document.hidden');
    await send('Page.setWebLifecycleState',{state:'frozen'});
    return async()=>{
      await send('Page.setWebLifecycleState',{state:'active'});
      await send('Target.activateTarget',{targetId:targetInfo.targetId});
      await send('Target.closeTarget',{targetId});
      await until('!document.hidden');
    };
  }
  async function join(url) {
    await go(url);
    await until("document.getElementById('room')?.open===true");
    await evaluate("document.getElementById('room-nick').value="+JSON.stringify(name));
    await click('room-enter');
  }
  const inCup=scenario==='--copa';
  async function drive(heat){
    await until("document.body.dataset.mode==='race' && document.getElementById('progress-name').textContent.startsWith('"+heat+"/3')");
    await key('keyDown','KeyW','w',87);
    if(heat===1){
      await evaluate(`window.cupDriver=setInterval(()=>{
        const p=parseInt(document.getElementById('percent').textContent);
        if([15,16,17,33,34,54,55,73,74].includes(p)){
          for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Space',key:' ',bubbles:true}));
        }
      },70)`);
    } else if(role==='--guest'){
      await evaluate('window.captureGL=true');
      await sleep(1150);
      await screenshot(heat===2?'estaleiro':'farol');
      assert.equal(await evaluate("document.querySelector('canvas').getContext('webgl').getError()"),0);
      await evaluate('window.captureGL=false');
    }
    const title=['Placar após a Baía','Placar após o Estaleiro','Pódio da Copa'][heat-1];
    await until("document.getElementById('room').open && document.getElementById('room-title').textContent==="+JSON.stringify(title),230000);
    await key('keyUp','KeyW','w',87);
    await evaluate('clearInterval(window.cupDriver)');
  }
  async function runCup(invite){
    await drive(1);
    const readTable=()=>evaluate("Array.from(document.querySelectorAll('#cup-rows tr'),r=>Array.from(r.cells,c=>c.textContent))");
    const halfway=await readTable();
    assert.equal(halfway.length,2);
    assert.ok(halfway.some(r=>Number(r[1])>0),'Pontuação da Baía');
    notify(role+'-half');
    await drive(2);
    const second=await readTable();
    assert.ok(second.some(r=>Number(r[2])>0),'Pontuação do Estaleiro');
    assert.ok(second.every(r=>r[3]==='—'));
    notify(role+'-estaleiro');
    await drive(3);
    const podium=await readTable();
    assert.equal(podium.length,2);
    assert.ok(podium.some(r=>Number(r[3])>0),'Pontuação do Farol');
    for(const row of podium){
      assert.equal(Number(row[4]),Number(row[1])+Number(row[2])+Number(row[3]));
      assert.ok(second.some(r=>r[0].slice(3)===row[0].slice(3) && r[2]===row[2]));
      assert.ok(halfway.some(r=>r[0].slice(3)===row[0].slice(3) && r[1]===row[1]));
    }
    assert.equal(await evaluate("document.getElementById('room-url').value"),invite);
    notify(role+'-podium',JSON.stringify(podium));
    await wait(role==='--host'?'--guest-podium':'--host-podium');
    if(await evaluate("!document.getElementById('room-start').hidden"))await click('room-start');
    await until("document.body.dataset.mode==='race' && document.getElementById('progress-name').textContent.startsWith('1/3')");
    notify(role+'-rematch');
    await wait(role==='--host'?'--guest-rematch':'--host-rematch');
  }
  if(scenario==='--rapida') {
    // Os três perfis procuram corrida ao mesmo tempo; o relay público forma uma única sala.
    const others=['--host','--guest','--friend'].filter(r=>r!==role);
    await go(entry);
    await until("document.readyState==='complete' && document.getElementById('cover-art')?.naturalWidth>0");
    await click('quick');
    await until("document.getElementById('room')?.open===true && document.getElementById('room-title').textContent==='Partida rápida'");
    await evaluate("document.getElementById('room-nick').value="+JSON.stringify(name));
    await click('room-enter');
    await until("['countdown','race'].includes(document.body.dataset.mode)",120000);
    const grid=await evaluate("Array.from(document.querySelectorAll('#race-list li'),li=>li.textContent)");
    console.log(role,'grid:',grid.join(' | '));
    assert.equal(grid.length,7,'Três pilotos e quatro bots');
    for(const pilot of ['Coral','Marujo','Lontra','Bot Coral','Bot Farol']) assert.ok(grid.some(row=>row.includes(pilot)),pilot);
    notify(role+'-grid');
    for(const other of others) await wait(other+'-grid');
    await move();
    await until(advanced('Bot Recife'),120000);
    for(const pilot of ['Coral','Marujo','Lontra']) await until(advanced(pilot),120000);
    notify(role+'-moved');
    for(const other of others) await wait(other+'-moved');
    await click('pause');await click('race-leave');
    assert.equal(await evaluate('document.body.dataset.mode'),'menu');
    console.log(role,'viu os outros dois pilotos e os bots avançarem na partida rápida.');
    return;
  }
  if(role==='--host') {
    await go(entry);
    await until("document.readyState==='complete' && document.getElementById('cover-art')?.naturalWidth>0");
    await click('friends');
    await until("document.getElementById('room')?.open===true");
    await evaluate("document.getElementById('room-nick').value='Coral'");
    await click('room-enter');
    await until("!document.getElementById('room-invite').hidden");
    const invite=await evaluate("document.getElementById('room-url').value");
    assert.ok(invite.startsWith(entry.split('#')[0]+'#sala='));
    notify('invite',invite);
    await until("document.querySelectorAll('#room-list li').length==="+(inCup?2:3));
    await click('room-start');
    if(inCup){await runCup(invite);return;}
    await until("document.body.dataset.mode==='race'");
    console.log('Largada:',await evaluate("document.getElementById('race-list').textContent"));
    await until(leader('Coral'));
    const resume=await minimize();
    notify('creator-frozen');
    await wait('movement-seen');
    await resume();
    await until("document.getElementById('room').open || ("+advanced('Marujo')+")");
    if(await evaluate("document.getElementById('room').open")) await click('room-leave');
    else {await click('pause');await click('race-leave');}
    assert.equal(await evaluate('document.body.dataset.mode'),'menu');
    notify('creator-left');
    await wait('friends-still-playing');
    await join(invite);
    await until("document.getElementById('room-status').textContent.includes('corrida já começou')");
    notify('invite-still-works');
    console.log('O convite original ainda encontra a sala depois da saída do criador.');
  } else if(role==='--guest') {
    const invite=await wait('invite');await join(invite);
    await until("document.getElementById('room-title').textContent==='Sala de amigos'");
    notify('first-guest');
    if(inCup){await runCup(invite);return;}
    await wait('creator-frozen');
    await until(leader('Marujo'));
    await move();
    await wait('creator-left');
    await until(leader('Marujo'));
    await until(advanced('Lontra'));
    await until("document.querySelector('#race-list').textContent.includes('Saiu')");
    assert.equal(await evaluate('document.body.dataset.mode'),'race');
    console.log('Os dois convidados continuaram a correr após a saída do criador.');
    notify('friends-still-playing');
    await wait('ready-to-leave');
    await click('pause');await click('race-leave');
    notify('last-alone');
  } else {
    await wait('first-guest');
    await join(await wait('invite'));
    await until("document.body.dataset.mode==='race'");
    await wait('creator-frozen');
    await until(leader('Marujo'));await until(advanced('Marujo'));
    notify('movement-seen');
    await wait('creator-left');
    await until(leader('Marujo'));
    await move();
    await wait('friends-still-playing');
    notify('ready-to-leave');
    await wait('last-alone');
    await until(leader('Lontra'));
    await until("Array.from(document.querySelectorAll('#race-list li')).filter(row=>row.textContent.includes('Saiu')).length===2");
    const time=await evaluate("document.getElementById('time').textContent");
    await until("document.getElementById('time').textContent!=="+JSON.stringify(time));
    assert.equal(await evaluate('document.body.dataset.mode'),'race');
    await wait('invite-still-works');
    console.log('O último piloto continuou na pista com o relógio em andamento.');
  }
}
module.exports={verify};

async function run() {
  const entry=new URL(process.argv[2]).href;
  const artifacts=path.join(__dirname,'../artifacts');
  fs.mkdirSync(artifacts,{recursive:true});
  const dir=fs.mkdtempSync(path.join(artifacts,'teste-sala-'));
  async function launch(role,ready) {
    try {
      if(ready) await signal(dir,ready);
      const child=spawn(process.execPath,[path.join(__dirname,'navegador.cjs'),role,entry,dir,...process.argv.slice(3)],{stdio:'inherit',windowsHide:true});
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      if(code!==0) fs.writeFileSync(path.join(dir,'failed'),role);
      return code;
    } catch(error) { fs.writeFileSync(path.join(dir,'failed'),role);console.error(error.message);return 1; }
  }
  const quick=process.argv.includes('--rapida');
  const jobs=[launch('--host'),launch('--guest',quick?null:'invite')];
  if(!process.argv.includes('--copa'))jobs.push(launch('--friend',quick?null:'first-guest'));
  const codes=await Promise.all(jobs);
  for(const filename of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,filename));
  fs.rmdirSync(dir);
  assert.ok(codes.every(code=>code===0),JSON.stringify(codes));
  console.log(quick?'Três perfis se encontraram na partida rápida e correram com quatro bots.':jobs.length===2?'Dois perfis disputaram a Copa, conferiram a soma e largaram na revanche.':'Três perfis verificaram troca de anfitrião, aba congelada, saída e continuidade.');
}
if(require.main===module)run().catch(err=>{console.error(err);process.exitCode=1;});
