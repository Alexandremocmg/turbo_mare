'use strict';

window.createTurboRoom = function createTurboRoom(game) {
  const el = id => document.getElementById(id);
  const dialog = el('room');
  const limit = 6;
  // New rooms have a stable channel independent of the connection running the physics.
  const leaseMs = 5000;
  const uidPattern = /^[A-Za-z0-9_-]{4,32}$/;
  const active = () => ['lobby','race','interval','results'].includes(stage);
  const prizes=[10,8,6,4,2,1], intervalMs=10000;
  const tracks=['baia','estaleiro','farol'];
  let cupVersion=0, heats=0;
  let cup=false, leg=0, board=[], nextStart=0;
  const controls = new Map();
  let members = [], socket = null, hostId = '', host = false, slot = -1;
  let stage = 'closed', roomKey = '', round = 0, timer = 0, standings = [];
  let selfId='', legacy=false, term=0, monitor=0, lastLeaderStamp=0, lastSeen=0, latest=null;
  let pendingStart=false, pendingEnd=false, lastHello=0;
  const nickname = text => (typeof text === 'string' ? text.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,18) : '') || 'Piloto';
  const validPilot = value => Number.isInteger(value) && value >= 0 && value < 4 ? value : 0;
  const invited = () => new URLSearchParams(location.hash.slice(1)).get('sala');
  const validKey = key => typeof key === 'string' && /^[a-f0-9]{32}(?:\.[A-Za-z0-9_-]{4,32})?$/.test(key);
  const invite = () => { const url = new URL(location.href); url.hash = 'sala=' + roomKey + (legacy ? '.'+hostId : '') + (cup?'&copa='+cupVersion:''); return url.href; };
  function modal() { if (!dialog.open) dialog.showModal(); }
  function note(text) { el('room-status').textContent = text; }
  function send(message, target) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 32768 && message.t === 'state') return;
    // Itty's direct-message frame puts the recipient UID between two unit separators.
    const address = target ? '\u001f'+target+'\u001f' : '';
    socket.send(address + JSON.stringify(message));
  }
  function publish(message) { send({...message,term}); }
  function sync() { publish({t:'lobby',members}); }
  const member = uid => members.find(m=>m.uid===uid);
  const total=r=>r.scores.reduce((sum,v)=>sum+(v||0),0);
  const finalPoints=r=>r.scores[heats-1]||0;
  const compareScores=(a,b)=>total(b)-total(a)||finalPoints(b)-finalPoints(a);
  function rankBoard(){
    return board.slice().sort((a,b)=>compareScores(a,b)||a.slot-b.slot);
  }
  function paintBoard(){
    const visible=cup && ['interval','results'].includes(stage);
    el('cup-board').hidden=!visible;
    el('room-list').hidden=visible;
    el('cup-farol-column').hidden=heats!==3;
    if(!visible)return;
    let place=0, previous;
    el('cup-rows').replaceChildren(...rankBoard().map((r,i)=>{
      if(!previous || compareScores(r,previous)!==0)place=i+1;
      previous=r;
      const row=document.createElement('tr');
      const label=place+'º '+r.name+(r.uid===selfId?' (você)':'');
      for(const [j,text] of [label,...r.scores.map(v=>v??'—'),total(r)].entries()){
        const cell=document.createElement(j===0?'th':'td');
        if(j===0)cell.scope='row';
        cell.textContent=String(text);row.append(cell);
      }
      return row;
    }));
  }
  function updateInterval(){
    const seconds=Math.max(0,Math.ceil((nextStart-performance.now())/1000));
    note((leg===0?'Estaleiro à Deriva':'Farol da Ressaca')+' começa em '+seconds+' s.');
  }
  function paintList() {
    const rows = stage === 'results' ? standings : members;
    el('room-list').replaceChildren(...rows.map(m => {
      const item = document.createElement('li'), name = document.createElement('strong'), detail = document.createElement('span');
      name.textContent = m.name + (m.slot === slot ? ' (você)' : '');
      detail.textContent = stage === 'results' ? m.score : ((legacy ? m.slot===0 : m.uid===hostId) ? 'Anfitrião' : 'Conectado');
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
    el('room-start').textContent = done ? (cup?'Revanche':'Nova corrida') : (cup?'Largar na Baía':'Largar');
    el('room-series').textContent=cup?'Copa das Marés':'Circuito do Kraken';
    el('cup-rules').hidden=!cup || !(lobby || done || stage==='interval');
    el('room-title').textContent = stage==='interval'?(leg===0?'Placar após a Baía':'Placar após o Estaleiro'):done ? (cup?'Pódio da Copa':'Resultado da sala') : lobby ? 'Sala de amigos' : 'Jogar com amigos';
    el('room-leave').textContent = setup ? 'Voltar' : 'Sair da sala';
    el('room-enter').textContent = roomKey && !host ? 'Entrar na sala' : 'Criar sala';
    if (lobby || done) el('room-url').value = invite();
    if (lobby) note((cup?(heats===3?'Baía, Estaleiro e Farol da Ressaca. ':'Baía do Kraken e Estaleiro à Deriva. '):'')+(host ? members.length < 2 ? 'Envie o convite a um amigo para liberar a largada.' : 'Todos a bordo. Você já pode dar a largada.' : 'Você está na sala. Aguarde a largada do anfitrião.'));
    if (stage==='interval')updateInterval();
    if (done) {
      if(cup){
        const first=rankBoard()[0];
        const winners=first?board.filter(r=>compareScores(r,first)===0):[];
        const win=first && total(first)>0?(winners.length===1?first.name+' venceu a Copa':winners.map(r=>r.name).join(' e ')+' dividiram a vitória')+' com '+total(first)+' pontos. ':'Nenhum piloto marcou pontos. ';
        note(win+(host?'Dispute a revanche com o mesmo convite.':'Aguarde a revanche nesta sala.'));
      } else note(host ? 'Convide outros pilotos ou dispute uma nova corrida.' : 'Aguarde o anfitrião iniciar uma nova corrida.');
    }
    paintList();paintBoard();
  }
  function disconnect() {
    const old = socket;
    socket = null; controls.clear(); latest=null; pendingStart=pendingEnd=false;
    clearTimeout(timer); clearInterval(monitor);
    if (old) old.close();
  }
  function fail(text) {
    const retryAsGuest = active() && !legacy;
    disconnect(); members = []; standings = []; stage = 'failed';
    if(retryAsGuest) host=false;
    else if(host) roomKey='';
    game.reset(); modal(); paint(); note(text);
  }
  function leave() {
    if (active()) announceExit();
    disconnect(); stage = 'closed'; host = false; slot = -1; roomKey = ''; members = []; standings = [];
    if (invited()) { const url = new URL(location.href); url.hash = ''; history.replaceState(null,'',url); }
    if (dialog.open) dialog.close();
    game.reset();
  }
  function setup(key) {
    if (stage !== 'closed') return;
    [roomKey,hostId=''] = validKey(key) ? key.split('.') : ['', ''];
    legacy=!!hostId; host = !roomKey; stage = 'setup';
    const version=new URLSearchParams(location.hash.slice(1)).get('copa');
    cupVersion=host?2:legacy?0:version==='2'?2:version==='1'?1:0;
    cup=cupVersion>0;heats=cupVersion===2?3:cup?2:0;
    leg=0;board=[];
    modal(); paint();
    note((cup?(heats===3?'Três provas até o topo do Farol da Ressaca. ':'Dispute a Baía do Kraken e o Estaleiro à Deriva. '):'')+(roomKey ? 'Escolha seu apelido para entrar.' : 'Crie uma sala para até seis pessoas e compartilhe o link.'));
    if (key && !roomKey) note('Convite inválido. Peça um novo link ou crie sua própria sala.');
    el('room-nick').focus();
  }
  function heard(stamp) {
    lastLeaderStamp=stamp;
    lastSeen=performance.now();
  }
  function remember(state,exact=false) {
    if(stage==='race' && state && game.apply(state,exact)) latest=state;
  }
  function transfer(next,stamp) {
    if (!next || next.uid===hostId) return;
    term++;
    hostId=next.uid; host=selfId===hostId;
    pendingStart=pendingEnd=false; controls.clear(); heard(stamp);
    if(stage==='race') game.authority(host,latest,next.slot);
    else paint();
  }
  function removeMember(uid,stamp) {
    const departed=member(uid);
    if(!departed) return;
    members=members.filter(m=>m!==departed);
    controls.delete(departed.slot);
    if(stage==='race') game.gone(departed.slot);
    if(uid===hostId) {
      // Relay leave events have a common order. Slot order is stable even when a tab is suspended.
      const next=members.slice().sort((a,b)=>Number(a.hidden)-Number(b.hidden)||a.slot-b.slot)[0];
      transfer(next,stamp);
    } else if(stage!=='race') paint();
  }
  function announceExit() {
    if(legacy) {send({t:'bye'},hostId);return;}
    publish({t:'bye',round,v:host && stage==='race'?game.checkpoint():null});
  }
  function presence() {
    if(legacy || !active()) return;
    const next=host && document.hidden ? members.filter(m=>m.uid!==selfId && !m.hidden).sort((a,b)=>a.slot-b.slot)[0] : null;
    publish({t:'presence',hidden:document.hidden,to:next?.uid,round,v:next && stage==='race'?game.checkpoint():null});
  }
  function monitorRoom() {
    if(stage==='connecting' && !host && selfId && performance.now()-lastHello>1500) {hello();return;}
    if(legacy || !active()) return;
    if(stage==='interval'){
      updateInterval();
      if(host && performance.now()>=nextStart)startRound(leg+1);
    }
    if(host) {
      if(stage!=='race') publish({t:'pulse'});
      return;
    }
    if(!document.hidden && (member(hostId)?.hidden || performance.now()-lastSeen>=leaseMs))
      publish({t:'claim'});
  }
  function hello() {
    lastHello=performance.now();
    send({t:'hello',name:nickname(el('room-nick').value),pilot:game.pilot(),hidden:document.hidden},legacy?hostId:null);
  }
  function hostMessage(uid, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (stage==='race' || stage==='interval' || pendingStart) {send({t:'reject',reason:'A corrida já começou. Tente de novo após a chegada.'},uid);return;}
      if (!['lobby','results'].includes(stage)) return;
      let guest=member(uid);
      if (!guest) {
        if(members.length>=limit) {send({t:'reject',reason:'A sala está cheia.'},uid);return;}
        let seat=0; while(members.some(m=>m.slot===seat)) seat++;
        guest={uid,slot:seat,name:nickname(m.name),pilot:validPilot(m.pilot),hidden:!!m.hidden};
        members.push(guest);
      }
      sync();
      send({t:'welcome',slot:guest.slot,members,term,round,...(cup && stage==='results'?{board}: {})},uid);
      paint();return;
    }
    const guest=member(uid);
    if (!guest || guest.uid===selfId) return;
    if (m.t === 'input' && stage === 'race' && m.round === round && m.term===term &&
        Array.isArray(m.v) && m.v.length === 4 && m.v.every(Number.isFinite)) {
      const seat = guest.slot, [x,z,j,d] = m.v, previous = controls.get(seat);
      controls.set(seat,{x:Math.max(-1,Math.min(1,x)),z:Math.max(-1,Math.min(1,z)),
        jump:Math.max(previous?.jump||0,j===1?.145:0),dive:Math.max(previous?.dive||0,d===1?.14:0),at:performance.now()});
    }
  }
  function validMembers(list) {
    return Array.isArray(list) && list.length > 0 && list.length <= limit &&
      list.every(m => m && Number.isInteger(m.slot) && m.slot >= 0 && m.slot < limit && typeof m.name === 'string' && m.name.length <= 18 && validPilot(m.pilot) === m.pilot) &&
      new Set(list.map(m => m.slot)).size === list.length &&
      (legacy || (list.every(m=>typeof m.uid==='string' && uidPattern.test(m.uid)) && new Set(list.map(m=>m.uid)).size===list.length));
  }
  function startRound(index) {
    if(pendingStart)return;
    pendingStart=true;publish({t:'go',round:round+1,members,leg:index});
  }
  function begin(index) {
    leg=index;
    if(cup && leg===0)board=members.map(({uid,slot,name})=>({uid,slot,name,scores:Array(heats).fill(null)}));
    controls.clear(); latest=null; pendingStart=pendingEnd=false; stage = 'race'; standings = [];
    if (dialog.open) dialog.close();
    game.begin({host,slot,leaderSlot:legacy?0:member(hostId).slot,members:members.map(m=>({...m})),
      track:cup?tracks[leg]:null,heats});
  }
  function result(rows) {
    stage = 'results'; standings = rows; latest=null; pendingStart=pendingEnd=false;
    if(cup){
      const ranked=rows.filter(row=>row.eligible===true);
      for(const r of board){
        const i=ranked.findIndex(row=>row.slot===r.slot);
        r.scores[leg]=i>=0?prizes[i]:0;
      }
      if(leg+1<heats){stage='interval';nextStart=performance.now()+intervalMs;}
    }
    game.reset(); modal(); paint();
  }
  function receive(uid,m,stamp) {
    if(!m || typeof m!=='object') return;
    if(stage==='connecting') {
      if(host || (legacy && uid!==hostId)) return;
      if(m.t==='reject') {fail(String(m.reason).slice(0,120));return;}
      if(m.t!=='welcome' || !validMembers(m.members) || !m.members.some(p=>p.slot===m.slot && (legacy || p.uid===selfId))) return;
      if(!legacy && (!m.members.some(p=>p.uid===uid) || !Number.isSafeInteger(m.term))) return;
      clearTimeout(timer); hostId=uid;slot=m.slot;members=m.members;term=m.term||0;round=m.round||0;
      stage='lobby';
      if(cup && Array.isArray(m.board) && m.board.length<=limit && m.board.length &&
        m.board.every(r=>r && typeof r.name==='string' && uidPattern.test(r.uid) &&
          Number.isInteger(r.slot) && Array.isArray(r.scores) && r.scores.length===heats &&
          r.scores.every(v=>v===0||prizes.includes(v)))){
        board=m.board;stage='results';leg=heats-1;
      }
      heard(stamp);paint();return;
    }
    if (!active()) return;
    if (!legacy) {
      if(m.t==='hello') {if(host && uid!==selfId) hostMessage(uid,m);return;}
      const sender=member(uid);
      if(!sender) return;
      if(m.t==='bye') {
        if(uid===hostId && m.term===term && m.round===round && m.v) remember(m.v,true);
        removeMember(uid,stamp);return;
      }
      if(m.t==='presence') {
        sender.hidden=!!m.hidden;
        if(uid===hostId && m.term===term && sender.hidden && member(m.to)) {
          if(m.round===round && m.v) remember(m.v,true);
          transfer(member(m.to),stamp);
        } else if(!host && !document.hidden && member(hostId)?.hidden && uid!==selfId) monitorRoom();
        return;
      }
      if(m.term!==term) return;
      if(m.t==='claim') {
        // All replicas arbitrate using the relay timestamp and the same echoed message stream.
        if(uid!==hostId && (member(hostId)?.hidden || stamp-lastLeaderStamp>=leaseMs)) transfer(sender,stamp);
        return;
      }
      if(m.t==='input') {if(host)hostMessage(uid,m);return;}
    }
    if(uid!==hostId) return;
    if(m.t==='closed' && legacy) {fail('O anfitrião encerrou esta sala da versão anterior.');return;}
    if(['state','go','end','lobby','pulse'].includes(m.t)) heard(stamp);
    if(m.t==='lobby' && ['lobby','results'].includes(stage) && validMembers(m.members)) {
      // The host already applied join/leave locally. Older echoes must not undo a newer admission.
      if(!host) members=m.members;
      paint();
    } else if(m.t==='go' && ['lobby','interval','results'].includes(stage) && validMembers(m.members) && m.members.some(p=>p.slot===slot) && Number.isInteger(m.round) &&
      (!cup || (m.round===round+1 && m.leg===(stage==='interval'?leg+1:0)))) {
      members=cup?m.members.filter(m=>member(m.uid)):m.members;
      round=m.round;begin(cup?m.leg:0);
    } else if(m.t==='state' && stage==='race' && m.round===round && !host) {
      remember(m.v);
    } else if(m.t==='end' && stage==='race' && m.round===round && Array.isArray(m.rows) && m.rows.length<=limit && m.rows.every(r=>r && typeof r.name==='string' && typeof r.score==='string')) {
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
    selfId=''; term=0; round=0; pendingStart=pendingEnd=false;
    slot = host ? 0 : -1; stage = 'connecting'; paint(); note('Conectando à sala…');
    let current;
    try { current = new WebSocket('wss://itty.ws/c/turbo-mare-'+(cup?'copa-'+cupVersion+'-':legacy?'v1-':'v2-')+roomKey+'?announce=true&list=true'+(legacy?'':'&echo=true')); }
    catch { fail('Não foi possível abrir a conexão. Tente novamente.'); return; }
    socket = current;
    monitor=setInterval(monitorRoom,1100);
    timer = setTimeout(()=>{if(socket===current) fail('A conexão demorou. Confira o convite e tente novamente.');},25000);
    current.onmessage = event => {
      if (socket !== current || typeof event.data !== 'string' || event.data.length > 24000) return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (!packet || typeof packet !== 'object') return;
      const {uid,type,self,message} = packet;
      if (typeof uid !== 'string') return;
      const stamp=Number(packet.date);
      if(!Number.isFinite(stamp)) return;
      if (type === 'join' && self && stage === 'connecting') {
        selfId=uid;
        if (host) {
          hostId=uid;clearTimeout(timer);members=[{uid,slot:0,name,pilot:game.pilot(),hidden:document.hidden}];
          stage='lobby';heard(stamp);paint();
        } else if (Array.isArray(packet.users) && !packet.users.some(u=>legacy?u.uid===hostId:u.uid!==selfId)) {
          fail('Sala não encontrada. Peça um novo convite.');
        } else hello();
      } else if (type === 'leave') {
        if(legacy && uid===hostId) fail('O anfitrião encerrou esta sala da versão anterior.');
        else if(!legacy && active()) removeMember(uid,stamp);
      } else if (message && !type) receive(uid,message,stamp);
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
    startRound(0);
  });
  document.addEventListener('visibilitychange',presence);
  window.addEventListener('pagehide',e=>{if(!e.persisted && active()) announceExit();});
  window.addEventListener('hashchange',()=>{if(invited()) setup(invited());});
  if (invited() !== null) setup(invited());
  return {
    leave,
    input(v) { send({t:'input',round,term,v},hostId); },
    state(v) { latest=v; if(members.length>1) publish({t:'state',round,v}); },
    control(seat,dt) {
      const c = controls.get(seat);
      if (!c || performance.now()-c.at > 1000) return [0,0,false,false];
      const out = [c.x,c.z,c.jump>0,c.dive>0];
      c.jump=Math.max(0,c.jump-dt); c.dive=Math.max(0,c.dive-dt);
      return out;
    },
    consume(seat,action) {const c=controls.get(seat);if(c)c[action]=0;},
    finish(rows) {
      if(pendingEnd) return;
      pendingEnd=true;publish({t:'end',round,rows});
    }
  };
};
