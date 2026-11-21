'use strict';

window.createTurboRoom = function createTurboRoom(game) {
  const el = id => document.getElementById(id);
  const dialog = el('room');
  const limit = 6;
  const prefix = 'turbo-mare-v1-';
  const links = new Map();
  const controls = new Map();
  let members = [], socket = null, hostId = '', host = false, slot = -1;
  let stage = 'closed', roomKey = '', round = 0, timer = 0, standings = [];
  const nickname = text => (typeof text === 'string' ? text.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,18) : '') || 'Piloto';
  const validPilot = value => Number.isInteger(value) && value >= 0 && value < 4 ? value : 0;
  const invited = () => new URLSearchParams(location.hash.slice(1)).get('sala');
  const validKey = key => typeof key === 'string' && /^[a-f0-9]{32}\.[A-Za-z0-9_-]{4,32}$/.test(key);
  const invite = () => { const url = new URL(location.href); url.hash = 'sala=' + roomKey + '.' + hostId; return url.href; };
  function modal() { if (!dialog.open) dialog.showModal(); }
  function note(text) { el('room-status').textContent = text; }
  function send(message, target) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 32768 && message.t === 'state') return;
    // Itty's direct-message frame puts the recipient UID between two unit separators.
    const address = target ? '\u001f'+target+'\u001f' : '';
    socket.send(address + JSON.stringify(message));
  }
  function broadcast(message) { if (links.size) send(message); }
  function sync() { broadcast({t:'lobby', members}); }
  function paintList() {
    const rows = stage === 'results' ? standings : members;
    el('room-list').replaceChildren(...rows.map(m => {
      const item = document.createElement('li'), name = document.createElement('strong'), detail = document.createElement('span');
      name.textContent = m.name + (m.slot === slot ? ' (você)' : '');
      detail.textContent = stage === 'results' ? m.score : (m.slot === 0 ? 'Anfitrião' : 'Conectado');
      item.append(name,detail);
      return item;
    }));
  }
  function paint() {
    const setup = stage === 'setup' || stage === 'failed', lobby = stage === 'lobby', done = stage === 'results';
    el('room-nick-label').hidden = el('room-enter').hidden = !setup;
    el('room-invite').hidden = !(lobby || done);
    el('room-start').hidden = !host || !(lobby || done);
    el('room-start').disabled = members.length < 2;
    el('room-start').textContent = done ? 'Nova corrida' : 'Largar';
    el('room-title').textContent = done ? 'Resultado da sala' : lobby ? 'Sala de amigos' : 'Jogar com amigos';
    el('room-leave').textContent = setup ? 'Voltar' : 'Sair da sala';
    el('room-enter').textContent = roomKey && !host ? 'Entrar na sala' : 'Criar sala';
    if (lobby || done) el('room-url').value = invite();
    if (lobby) note(host ? members.length < 2 ? 'Envie o convite a um amigo para liberar a largada.' : 'Todos a bordo. Você já pode dar a largada.' : 'Você está na sala. Aguarde a largada do anfitrião.');
    if (done) note(host ? 'Convide outros pilotos ou dispute uma nova corrida.' : 'Aguarde o anfitrião iniciar uma nova corrida.');
    paintList();
  }
  function disconnect() {
    const old = socket;
    socket = null; links.clear(); controls.clear();
    clearTimeout(timer);
    if (old) old.close();
  }
  function fail(text) {
    const wasHost = host;
    disconnect(); members = []; standings = []; stage = 'failed';
    if (wasHost) roomKey = '';
    game.reset(); modal(); paint(); note(text);
  }
  function leave() {
    if (host) broadcast({t:'closed'});
    else send({t:'bye'},hostId);
    disconnect(); stage = 'closed'; host = false; slot = -1; roomKey = ''; members = []; standings = [];
    if (invited()) { const url = new URL(location.href); url.hash = ''; history.replaceState(null,'',url); }
    if (dialog.open) dialog.close();
    game.reset();
  }
  function setup(key) {
    if (stage !== 'closed') return;
    [roomKey,hostId] = validKey(key) ? key.split('.') : ['', ''];
    host = !roomKey; stage = 'setup';
    modal(); paint();
    note(roomKey ? 'Você recebeu um convite. Escolha seu apelido para entrar.' : 'Crie uma sala para até seis pessoas e compartilhe o link.');
    if (key && !roomKey) note('Convite inválido. Peça um novo link ou crie sua própria sala.');
    el('room-nick').focus();
  }
  function removeGuest(uid) {
    if (!links.has(uid)) return;
    const seat = links.get(uid);
    links.delete(uid); controls.delete(seat);
    members = members.filter(m=>m.slot !== seat);
    if (stage === 'race') game.gone(seat);
    else { sync(); paint(); }
  }
  function hostMessage(uid, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (links.has(uid)) return;
      const reason = stage === 'race' ? 'A corrida já começou. Tente de novo após a chegada.' :
        members.length >= limit ? 'A sala está cheia.' : '';
      if (reason) { send({t:'reject',reason},uid); return; }
      if (!['lobby','results'].includes(stage)) return;
      let seat = 1; while (members.some(member=>member.slot === seat)) seat++;
      links.set(uid,seat);
      members.push({slot:seat,name:nickname(m.name),pilot:validPilot(m.pilot)});
      send({t:'welcome',slot:seat,members},uid); sync(); paint();
      return;
    }
    if (!links.has(uid)) return;
    if (m.t === 'bye') { removeGuest(uid); return; }
    if (m.t === 'input' && stage === 'race' && m.round === round &&
        Array.isArray(m.v) && m.v.length === 4 && m.v.every(Number.isFinite)) {
      const seat = links.get(uid), [x,z,j,d] = m.v, previous = controls.get(seat);
      controls.set(seat,{x:Math.max(-1,Math.min(1,x)),z:Math.max(-1,Math.min(1,z)),
        jump:Math.max(previous?.jump||0,j===1?.145:0),dive:Math.max(previous?.dive||0,d===1?.14:0),at:performance.now()});
    }
  }
  function validMembers(list) {
    return Array.isArray(list) && list.length > 0 && list.length <= limit &&
      list.every(m => m && Number.isInteger(m.slot) && m.slot >= 0 && m.slot < limit && typeof m.name === 'string' && m.name.length <= 18 && validPilot(m.pilot) === m.pilot) &&
      new Set(list.map(m => m.slot)).size === list.length && list.some(m => m.slot === 0);
  }
  function begin() {
    controls.clear(); stage = 'race'; standings = [];
    if (dialog.open) dialog.close();
    game.begin({host,slot,members:members.map(m=>({...m}))});
  }
  function result(rows) {
    stage = 'results'; standings = rows;
    game.reset(); modal(); paint();
  }
  function receive(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'reject') { fail(String(m.reason).slice(0,120)); return; }
    if (m.t === 'closed') { fail('O anfitrião encerrou a sala.'); return; }
    if (m.t === 'welcome' && stage === 'connecting' && validMembers(m.members) && m.members.some(p=>p.slot===m.slot && p.slot>0)) {
      clearTimeout(timer); slot = m.slot; members = m.members; stage = 'lobby'; paint();
    } else if (m.t === 'lobby' && ['lobby','results'].includes(stage) && validMembers(m.members)) {
      members = m.members; paint();
    } else if (m.t === 'go' && ['lobby','results'].includes(stage) && validMembers(m.members) && m.members.some(p=>p.slot===slot) && Number.isInteger(m.round)) {
      members = m.members; round = m.round; begin();
    } else if (m.t === 'state' && stage === 'race' && m.round === round) {
      game.apply(m.v);
    } else if (m.t === 'end' && stage === 'race' && m.round === round && Array.isArray(m.rows) && m.rows.length<=limit && m.rows.every(r=>r && typeof r.name==='string' && typeof r.score==='string')) {
      result(m.rows);
    }
  }
  function connect() {
    if (!['setup','failed'].includes(stage)) return;
    if (!navigator.onLine) { note('Conecte-se à internet para abrir uma sala.'); return; }
    if (!/^https?:$/.test(location.protocol) || !window.WebSocket) {
      note('Abra o jogo pelo GitHub Pages em um navegador atualizado.'); return;
    }
    const name = nickname(el('room-nick').value);
    try { localStorage.setItem('mare-apelido',name); } catch {}
    if (host) roomKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('');
    slot = host ? 0 : -1; stage = 'connecting'; paint(); note('Conectando à sala…');
    let current;
    try { current = new WebSocket('wss://itty.ws/c/'+prefix+roomKey+'?announce=true&list=true'); }
    catch { fail('Não foi possível abrir a conexão. Tente novamente.'); return; }
    socket = current;
    timer = setTimeout(()=>{if(socket===current) fail('A conexão demorou. Confira o convite e tente novamente.');},25000);
    current.onmessage = event => {
      if (socket !== current || typeof event.data !== 'string' || event.data.length > 24000) return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (!packet || typeof packet !== 'object') return;
      const {uid,type,self,message} = packet;
      if (typeof uid !== 'string') return;
      if (type === 'join' && self && stage === 'connecting') {
        if (host) {
          hostId=uid; clearTimeout(timer); members=[{slot:0,name,pilot:game.pilot()}]; stage='lobby'; paint();
        } else if (Array.isArray(packet.users) && !packet.users.some(u=>u.uid===hostId)) {
          fail('Sala não encontrada. Peça um novo convite ao anfitrião.');
        } else send({t:'hello',name,pilot:game.pilot()},hostId);
      } else if (type === 'leave') {
        if (host) removeGuest(uid);
        else if (uid === hostId) fail('O anfitrião encerrou a sala.');
      } else if (message && !type) {
        if (host) hostMessage(uid,message);
        else if (uid === hostId) receive(message);
      }
    };
    current.onclose = ()=>{if(socket===current)fail('A conexão da sala terminou. Confira a rede e entre novamente.');};
    current.onerror = ()=>{if(socket===current)fail('Não foi possível conectar ao serviço de salas. Tente novamente.');};
  }
  try { el('room-nick').value=localStorage.getItem('mare-apelido')||''; } catch {}
  el('friends').addEventListener('click',()=>setup(invited()));
  el('room-form').addEventListener('submit',e=>{e.preventDefault();connect();});
  el('room-leave').addEventListener('click', leave);
  dialog.addEventListener('cancel',e=>{e.preventDefault();leave();});
  el('room-copy').addEventListener('click',async ()=>{
    try { await navigator.clipboard.writeText(invite()); note('Link copiado. Envie para seus amigos.'); }
    catch { el('room-url').select(); note('Selecione e copie o link para convidar seus amigos.'); }
  });
  el('room-start').addEventListener('click',()=>{
    if (!host || !['lobby','results'].includes(stage) || members.length < 2) return;
    round++; broadcast({t:'go',round,members}); begin();
  });
  window.addEventListener('hashchange',()=>{if(invited()) setup(invited());});
  if (invited() !== null) setup(invited());
  return {
    leave,
    input(v) { send({t:'input',round,v},hostId); },
    state(v) { broadcast({t:'state',round,v}); },
    control(seat,dt) {
      const c = controls.get(seat);
      if (!c || performance.now()-c.at > 1000) return [0,0,false,false];
      const out = [c.x,c.z,c.jump>0,c.dive>0];
      c.jump=Math.max(0,c.jump-dt); c.dive=Math.max(0,c.dive-dt);
      return out;
    },
    consume(seat,action) {const c=controls.get(seat);if(c)c[action]=0;},
    finish(rows) { broadcast({t:'end',round,rows}); result(rows); }
  };
};
