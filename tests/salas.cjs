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
  const [role,entry,dir]=process.argv.slice(2);
  const name={'--host':'Coral','--guest':'Marujo','--friend':'Lontra'}[role];
  const notify=(file,value='ok')=>{console.log(role,file);const dest=path.join(dir,file);fs.writeFileSync(dest+'.tmp',value);fs.renameSync(dest+'.tmp',dest);};
  const wait=file=>signal(dir,file);
  await send('Emulation.setDeviceMetricsOverride',{width:570,height:370,deviceScaleFactor:.65,mobile:false});
  // This test exercises input, physics and the relay across independent profiles.
  // The separate browser smoke test covers WebGL rendering with the full draw calls.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    try { localStorage.setItem('mare-render-quality','light'); } catch {}
    for (const method of ['drawArrays','drawElements','clear']) WebGLRenderingContext.prototype[method]=()=>{};
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
    await until("document.querySelectorAll('#room-list li').length===3");
    await click('room-start');
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
    await join(await wait('invite'));
    await until("document.getElementById('room-title').textContent==='Sala de amigos'");
    notify('first-guest');
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
      const child=spawn(process.execPath,[path.join(__dirname,'navegador.cjs'),role,entry,dir],{stdio:'inherit',windowsHide:true});
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
      if(code!==0) fs.writeFileSync(path.join(dir,'failed'),role);
      return code;
    } catch(error) { fs.writeFileSync(path.join(dir,'failed'),role);console.error(error.message);return 1; }
  }
  const codes=await Promise.all([launch('--host'),launch('--guest','invite'),launch('--friend','first-guest')]);
  for(const filename of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir,filename));
  fs.rmdirSync(dir);
  assert.deepEqual(codes,[0,0,0]);
  console.log('Três perfis verificaram troca de anfitrião, aba congelada, saída e continuidade.');
}
if(require.main===module)run().catch(err=>{console.error(err);process.exitCode=1;});
