const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {setTimeout: sleep} = require('node:timers/promises');

async function signal(dir, name) {
  const file = path.join(dir, name);
  const end = Date.now()+120000;
  while (!fs.existsSync(file)) {
    if (Date.now()>end) throw Error('Tempo limite aguardando '+name);
    await sleep(180);
  }
  return fs.readFileSync(file,'utf8');
}

async function verify({send,evaluate,until,click,key,screenshot}) {
  const [role,entry,dir]=process.argv.slice(2);
  const host=role==='--host', myName=host?'Coral':'Marujo', other=host?'Marujo':'Coral';
  const notify=(name,value='ok')=>fs.writeFileSync(path.join(dir,name),value);
  const go=url=>send('Page.navigate',{url});
  await send('Emulation.setDeviceMetricsOverride',{width:760,height:480,deviceScaleFactor:.7,mobile:false});
  const join=async url=>{
    await go(url);
    await until("document.getElementById('room')?.open === true");
    await evaluate("document.getElementById('room-nick').value='Marujo'");
    await click('room-enter');
    await until("document.getElementById('room-title').textContent==='Sala de amigos'");
  };
  if(host) {
    await go(entry);
    await until("document.getElementById('cover-art')?.naturalWidth > 0");
    await click('friends');
    await evaluate("document.getElementById('room-nick').value='Coral'");
    await click('room-enter');
    await until("!document.getElementById('room-invite').hidden");
    const url=await evaluate("document.getElementById('room-url').value");
    assert.ok(url.startsWith(entry.split('#')[0]+'#sala='));
    notify('invite',url);
    await until("!document.getElementById('room-start').disabled");
    await screenshot('sala-com-amigos');
    await click('room-start');
  } else {
    await join(await signal(dir,'invite'));
  }
  await until("document.body.dataset.mode==='race'");
  await key('keyDown','KeyW','w',87);
  await until("parseInt(document.getElementById('percent').textContent)>=5");
  await key('keyUp','KeyW','w',87);
  const advanced = "Array.from(document.querySelectorAll('#race-list li')).some(row=>row.textContent.includes('"+other+"') && Number(row.textContent.match(/(\\d+)%/)?.[1])>=4)";
  await until(advanced);
  console.log(myName+' recebeu o avanço do outro piloto na corrida.');
  if(host) {
    notify('host-saw-guest');
    await until("document.getElementById('room-title').textContent==='Resultado da sala'");
    notify('room-reopened');
    await until("!document.getElementById('room-start').disabled");
    await click('room-start');
    await until("document.body.dataset.mode==='race'");
    await signal(dir,'rematch');
    await click('pause');await click('race-leave');
    assert.equal(await evaluate("document.body.dataset.mode"),'menu');
  } else {
    await signal(dir,'host-saw-guest');
    await click('pause');await click('race-leave');
    await until("document.body.dataset.mode==='menu' && !document.getElementById('room').open");
    await signal(dir,'room-reopened');
    await join(await signal(dir,'invite'));
    await until("document.body.dataset.mode==='race'");
    notify('rematch');
    await until("document.getElementById('room').open && /encerrou|terminou/.test(document.getElementById('room-status').textContent)");
  }
}
module.exports={verify};

async function run() {
  const entry=new URL(process.argv[2]).href;
  const artifacts=path.join(__dirname,'../artifacts');
  fs.mkdirSync(artifacts,{recursive:true});
  const dir=fs.mkdtempSync(path.join(artifacts,'teste-sala-'));
  const children=['--host','--guest'].map(role=>spawn(process.execPath,[path.join(__dirname,'navegador.cjs'),role,entry,dir],{stdio:'inherit',windowsHide:true}));
  const codes=await Promise.all(children.map(child=>new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('exit',code=>resolve(code));
  })));
  for(const filename of ['invite','host-saw-guest','room-reopened','rematch'])fs.rmSync(path.join(dir,filename),{force:true});
  fs.rmdirSync(dir);
  assert.deepEqual(codes,[0,0]);
  console.log('Dois perfis independentes validaram convite, posições, revanche e encerramento.');
}
if(require.main===module)run().catch(err=>{console.error(err);process.exitCode=1;});
