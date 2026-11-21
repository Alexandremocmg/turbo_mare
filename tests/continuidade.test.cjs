const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/rooms.js'),'utf8');

// Model the ordered, echoed relay stream. A suspended tab queues incoming messages.
function relay() {
  const sockets=new Set(), queue=[];
  let clock=1000, serial=0;
  function deliver(sock, packet) {
    const event={data:JSON.stringify({...packet,date:clock})};
    queue.push(()=>{
      if(sock.readyState!==1) return;
      if(sock.frozen) sock.mail.push(event);
      else sock.onmessage(event);
    });
  }
  class Socket {
    static OPEN=1;
    constructor(channel) {
      this.uid='user'+(++serial);this.channel=channel;this.readyState=1;this.mail=[];
      sockets.add(this);
      deliver(this,{type:'join',self:true,uid:this.uid,users:this.peers().map(s=>({uid:s.uid}))});
    }
    peers() {return [...sockets].filter(s=>s.channel===this.channel);}
    send(frame) {
      let recipient;
      if(frame.startsWith('\u001f')) [,recipient,frame]=frame.split('\u001f');
      const message=JSON.parse(frame);
      for(const peer of this.peers()) if(!recipient || peer.uid===recipient) deliver(peer,{uid:this.uid,message});
    }
    close() {
      sockets.delete(this);this.readyState=3;
      for(const peer of this.peers()) deliver(peer,{type:'leave',uid:this.uid});
    }
    thaw() {this.frozen=false;for(const event of this.mail.splice(0))this.onmessage(event);}
  }
  return {Socket,flush(){while(queue.length)queue.shift()();},advance(ms){clock+=ms;},now:()=>clock};
}

function browser(bus,name,invite='https://example.test/') {
  const listeners=new Map(), timers=new Map(), elements=new Map();
  const location=new URL(invite);
  let socket;
  function element() {
    const events=new Map();
    return {events,children:[],open:false,hidden:false,value:'',showModal(){this.open=true;},close(){this.open=false;},
      focus(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener:(k,f)=>events.set(k,f),
      fire:k=>events.get(k)({preventDefault(){}})};
  }
  function el(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}
  const document={getElementById:el,createElement:element,hidden:false,addEventListener:(k,f)=>listeners.set(k,f)};
  class WebSocket extends bus.Socket {constructor(channel){super(channel);socket=this;}}
  const window={WebSocket,addEventListener(){}};
  vm.runInNewContext(source,{window,document,location,URL,URLSearchParams,WebSocket,crypto:webcrypto,
    history:{replaceState(){}},navigator:{onLine:true},localStorage:{getItem(){},setItem(){}},performance:{now:bus.now},
    setTimeout(){},clearTimeout(){},setInterval(f){timers.set(f,f);return f;},clearInterval:f=>timers.delete(f)});
  const view={begins:0,resets:0,departed:[],state:null};
  const api=window.createTurboRoom({pilot:()=>0,begin(session){Object.assign(view,session);view.begins++;},
    apply(state){view.state=state;return true;},checkpoint:()=>view.state,
    authority(host,state,seat){Object.assign(view,{host,state,leaderSlot:seat});},
    gone(seat){view.departed.push(seat);},reset(){view.resets++;}});
  if(!location.hash)el('friends').fire('click');
  el('room-nick').value=name;el('room-form').fire('submit');bus.flush();
  return {el,socket,api,view,invite:el('room-url').value,start:()=>el('room-start').fire('click'),
    tick(){for(const f of timers.values())f();},
    hide(){document.hidden=true;listeners.get('visibilitychange')();},
    publish(state){view.state=state;api.state(state);bus.flush();}};
}

test('um único sucessor assume o estado da aba congelada e mantém o convite após duas saídas',()=>{
  const bus=relay(), a=browser(bus,'Coral'), b=browser(bus,'Marujo',a.invite), c=browser(bus,'Lontra',a.invite);
  a.start();bus.flush();
  a.publish({time:20});
  a.socket.frozen=true;bus.advance(12000);
  b.tick();c.tick();bus.flush();
  assert.equal(b.view.host,true);assert.equal(c.view.leaderSlot,1);
  assert.equal(b.view.state.time,20);
  b.publish({time:21});a.socket.thaw();
  assert.equal(a.view.host,false);assert.equal(a.view.state.time,21);
  a.socket.send(JSON.stringify({t:'state',term:0,round:1,v:{time:1}}));bus.flush();
  assert.equal(c.view.state.time,21);
  b.socket.close();bus.flush();
  assert.equal(a.view.host,true);assert.equal(a.view.state.time,21);
  a.view.state={time:22};a.hide();bus.flush();
  assert.equal(c.view.host,true);assert.equal(c.view.state.time,22);
  a.api.leave();bus.flush();
  assert.deepEqual(c.view.departed,[1,0]);assert.equal(c.view.begins,1);assert.equal(c.view.resets,0);
  const victory=[{name:'Lontra',slot:2,score:'1º',eligible:true}];
  c.api.finish(victory);bus.flush();
  assert.equal(c.el('room-title').textContent,'Placar após a Baía');
  bus.advance(11000);c.tick();bus.flush();assert.equal(c.view.track,'estaleiro');
  c.api.finish(victory);bus.flush();
  assert.equal(c.el('room-title').textContent,'Pódio da Copa');
  const d=browser(bus,'Brisa',a.invite);
  assert.equal(d.el('room-title').textContent,'Pódio da Copa');
  c.start();bus.flush();assert.equal(c.view.begins,3);assert.equal(d.view.begins,1);assert.equal(d.view.leaderSlot,2);
});

test('a Copa soma as duas provas uma vez, desempata no Estaleiro e zera a revanche',()=>{
  const bus=relay(), a=browser(bus,'Sol'), b=browser(bus,'Lua',a.invite), c=browser(bus,'Sal',a.invite);
  const table=p=>p.el('cup-rows').children.map(row=>row.children.map(cell=>cell.textContent));
  const results=(order)=>order.map((slot,i)=>({name:['Sol','Lua','Sal'][slot],slot,score:String(i+1),eligible:slot!==2}));
  a.start();bus.flush();
  a.api.finish(results([0,1,2]));a.api.finish(results([0,1,2]));bus.flush();
  assert.deepEqual(table(a)[0],['1º Sol (você)','10','—','10']);
  assert.deepEqual(table(b)[2],['3º Sal','0','—','0']);
  a.hide();bus.flush();bus.advance(11000);b.tick();bus.flush();
  assert.equal(b.view.track,'estaleiro');assert.equal(b.view.host,true);
  b.api.finish(results([1,0,2]));bus.flush();
  assert.deepEqual(table(a)[0],['1º Lua','8','10','18']);
  assert.deepEqual(table(c)[1],['2º Sol','10','8','18']);
  assert.equal(a.el('room-url').value,b.invite);assert.equal(b.el('room-start').textContent,'Revanche');
  b.start();bus.flush();assert.equal(a.view.track,'baia');
  b.api.finish(results([1,0,2]));bus.flush();assert.deepEqual(table(b)[0],['1º Lua (você)','10','—','10']);
});

test('uma saída voluntária envia o estado final mesmo antes do próximo snapshot',()=>{
  const bus=relay(), a=browser(bus,'Coral'), b=browser(bus,'Marujo',a.invite);
  a.start();bus.flush();a.publish({time:31});a.view.state={time:32};a.api.leave();bus.flush();
  assert.equal(b.view.state.time,32);assert.equal(b.view.host,true);
  assert.deepEqual(b.view.departed,[0]);assert.equal(b.view.begins,1);assert.equal(b.view.resets,0);
});
