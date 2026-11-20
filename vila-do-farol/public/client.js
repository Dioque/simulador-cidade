import {MAPS} from './world.js';
import {painter} from './art.js';

const get=id=>document.getElementById(id);
const auth=get('auth'), canvas=get('map'), draw=painter(canvas), modal=get('modal');
const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
let register=false, socket, state, reconnect, online=false, notice, picker='';
let aim=null, lastArea, received=0, poses=new Map(), modalKind;
let volume=.25, reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, audio, lastHammer=0;
try {
  const settings=JSON.parse(localStorage.getItem('farol-settings'));
  if (settings) {volume=settings.volume;reduce=settings.reduce;}
} catch {}
const saveSettings=()=>{try{localStorage.setItem('farol-settings',JSON.stringify({volume,reduce}));}catch{}};
let keys=new Set();

function audioReady() {
  try { audio??=new AudioContext(); if(audio.state==='suspended') audio.resume().catch(()=>{}); } catch {}
}
function beep(frequency,shape='triangle',length=.11) {
  if (!audio || audio.state!=='running' || !volume) return;
  const osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=shape;osc.frequency.value=frequency;
  const t=audio.currentTime;
  gain.gain.setValueAtTime(volume*.1,t);
  gain.gain.exponentialRampToValueAtTime(.001,t+length);
  osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(t+length);
}
document.addEventListener('pointerdown',audioReady,{once:true});
document.addEventListener('keydown',audioReady,{once:true});

async function request(path,data) {
  const response=await fetch('/api/'+path,data===undefined?undefined:{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
  });
  const json=await response.json();
  if (!response.ok) throw Error(json.error ?? 'Falha de conexão.');
  return json;
}
function changeForm() {
  register=!register;
  get('form-title').textContent=register?'Criar conta':'Entrar na vila';
  const character=get('character');
  character.hidden=!register;character.disabled=!register;
  auth.password.minLength=register?12:1;
  auth.password.autocomplete=register?'new-password':'current-password';
  auth.querySelector('[type=submit]').textContent=register?'Criar e jogar':'Entrar';
  get('switch').textContent=register?'Já tenho conta':'Criar conta';
  get('auth-message').textContent=register?'Use uma senha com pelo menos 12 caracteres.':'';
}
get('switch').addEventListener('click',changeForm);
auth.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=auth.querySelector('[type=submit]');
  submit.disabled=true;
  try {
    const data=Object.fromEntries(new FormData(auth));
    if (register) data.appearance=Number(data.appearance);
    await request(register?'register':'login',data);
    auth.reset();connect();
  } catch(error) {get('auth-message').textContent=error.message;}
  finally {submit.disabled=false;}
});
function screen(active) {
  get('gate').hidden=active;get('game').hidden=!active;
  get('logout').hidden=!active;get('settings').hidden=!active;
}
function disconnect(message) {
  online=false;
  clearTimeout(reconnect);
  socket?.close();
  stopKeys();
  if(modal.open)modal.close();
  screen(false);
  get('connection').textContent='Desconectado';
  get('auth-message').textContent=message;
}
get('logout').addEventListener('click',async()=>{
  try {await request('logout',{});disconnect('Sessão encerrada.');}
  catch {toast('Não foi possível sair. Tente novamente.');}
});
function send(type,fields={}) {
  if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type,...fields}));
}
function connect() {
  clearTimeout(reconnect);
  online=true;
  get('connection').textContent='Conectando';
  get('auth-message').textContent='';
  const ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/game');
  socket=ws;
  ws.addEventListener('open',()=>{if(socket===ws)get('connection').textContent='Na vila';});
  ws.addEventListener('message',event=>{if(socket===ws) message(JSON.parse(event.data));});
  ws.addEventListener('close',async event=>{
    if(socket!==ws || !online)return;
    stopKeys();
    if(event.code===4001 || event.code===4003) return disconnect(event.reason || 'Sessão encerrada.');
    get('connection').textContent='Reconectando';
    try {
      const session=await request('session');
      if(!session.logged)return disconnect('Faça login para voltar à vila.');
    } catch {}
    if(online)reconnect=setTimeout(connect,2200);
  });
}
request('session').then(session=>{
  if(session.logged)connect();
  else get('connection').textContent='Desconectado';
}).catch(()=>disconnect('Servidor indisponível.'));

function toast(text) {
  const node=get('toast');
  node.textContent=text;node.hidden=false;
  clearTimeout(notice);notice=setTimeout(()=>{node.hidden=true;},3200);
}
function message(data) {
  if(data.type==='world') {
    const changedArea=lastArea!==data.self.area;
    const next=new Map();
    const now=performance.now();
    for(const p of data.players) {
      const prior=changedArea?null:poses.get(p.id);
      next.set(p.id,{x:p.x,y:p.y,from:prior ? interpolate(prior,now) : p,moving:!!prior && Math.hypot(p.x-prior.x,p.y-prior.y)>.04});
    }
    poses=next;received=now;state=data;
    if(changedArea) {aim=null;get('chat').replaceChildren();lastArea=data.self.area;if(modal.open)modal.close();}
    screen(true);
    update(data);
  } else if(data.type==='note') toast(data.text);
  else if(data.type==='hurt' || data.type==='hit') {beep(data.type==='hurt'?140:430);toast(data.text);}
  else if(data.type==='dialog') dialog(data);
  else if(data.type==='invite') {
    get('invite').hidden=false;get('invite').querySelector('p').textContent=data.name+' convidou você.';
  } else if(data.type==='chat') {
    const list=get('chat');
    const line=make('li');
    line.append(make('strong',data.name),document.createTextNode(' · '+data.text));
    list.append(line);
    while(list.children.length>45)list.firstChild.remove();
    list.scrollTop=list.scrollHeight;
  }
}
function interpolate(p,now) {
  const alpha=Math.min(1,(now-received)/100);
  return {x:p.from.x+(p.x-p.from.x)*alpha,y:p.from.y+(p.y-p.from.y)*alpha,moving:p.moving};
}
function update(data) {
  const {self,team,players,workshop}=data;
  get('area').textContent=MAPS[self.area].name;
  get('population').textContent=players.length+(players.length===1?' aventureiro aqui':' aventureiros aqui');
  get('name').textContent=self.name+' · Nv. '+self.level;
  get('hp').max=self.max;get('hp').value=self.hp;
  get('health').textContent=self.hp+' / '+self.max+' de vida · '+self.xp+' XP';
  get('weapon').textContent=self.weapon+' · '+self.damage+' de dano';
  get('quest').textContent={
    none:self.completed?'Fale com Nara para sair em outra expedição.':'Fale com Nara perto do portão a leste.',
    accepted:'Siga para o leste. Recupere a caixa no Acampamento da Ponte.',
    collected:'Volte até Nara. A entrega vale uma caixa para a vila e recompensa para os elegíveis.',
  }[self.quest];
  get('workshop').textContent=workshop.opened?'Oficina aberta · Receita disponível com o ferreiro.':
    'Oficina fechada · '+workshop.crates+' de '+workshop.goal+' caixas.';
  get('team').replaceChildren(...(team.length?team.map(p=>make('p',p.name+' · '+p.hp+'/'+p.max+' PV · '+MAPS[p.area].name)):
    [make('p','Convide alguém nesta área.')]));
  get('leave').hidden=!data.grouped;
  const nearby=players.filter(p=>p.id!==self.id);
  const signature=nearby.map(p=>p.id).join(',');
  if(signature!==picker) {
    picker=signature;
    get('nearby').replaceChildren(...nearby.map(p=>new Option(p.name,p.id)));
  }
  get('invite-form').hidden=!nearby.length || team.length>=3;
  for(const button of document.querySelectorAll('[data-action]')) {
    const remaining=self.cooldown[button.dataset.action] ?? 0;
    button.disabled=remaining>0;
    const label=button.querySelector('small');
    if(label) label.textContent=remaining ? (Math.ceil(remaining/100)/10).toFixed(1)+'s' : '';
  }
  if(modal.open && modalKind==='inventory') refreshPack();
}
function openModal(title,kind) {
  stopKeys();modalKind=kind;
  get('modal-title').textContent=title;
  const content=get('modal-body');
  content.replaceChildren();
  if(!modal.open)modal.showModal();
  return content;
}
get('close-modal').addEventListener('click',()=>modal.close());
function dialog({speaker,lines,action}) {
  const body=openModal(speaker,'dialog');
  body.append(...lines.map(line=>make('p',line)));
  if(action) {
    const button=make('button',action==='quest'?'Aceitar expedição':'Forjar por 3 ferros');
    button.className='primary';
    button.addEventListener('click',()=>{send(action);modal.close();});
    body.append(button);
  }
}
const itemNames={short:'Espada curta',forged:'Lâmina do Farol · +8 de dano',iron:'Ferro recuperado',herb:'Erva de cura · +35 PV'};
let packKey='';
function refreshPack() {
  const {self}=state;
  const key=JSON.stringify([self.inventory,self.weapon]);
  if(packKey===key)return;
  packKey=key;
  const rows=[];
  for(const [item,count] of Object.entries(self.inventory)) {
    if(!count)continue;
    const row=make('div');row.className='item';
    row.append(make('span',itemNames[item]+' × '+count));
    if(item!=='iron') {
      const equipped=item!=='herb' && itemNames[item].split(' · ')[0]===self.weapon;
      const button=make('button',equipped?'Equipada':item==='herb'?'Usar':'Equipar');
      button.disabled=equipped;
      button.addEventListener('click',()=>send(item==='herb'?'use':'equip',{item}));
      row.append(button);
    }
    rows.push(row);
  }
  get('modal-body').replaceChildren(...rows);
}
function pack() {if(state){packKey='';openModal('Mochila','inventory');refreshPack();}}
get('pack').addEventListener('click',pack);
get('settings').addEventListener('click',()=>{
  const body=openModal('Configurações','settings');
  const sound=make('label','Volume');
  const slider=make('input');slider.type='range';slider.min=0;slider.max=1;slider.step=.05;slider.value=volume;
  slider.addEventListener('input',()=>{volume=Number(slider.value);saveSettings();beep(340);});
  sound.append(slider);
  const visual=make('label','Reduzir efeitos de movimento');visual.className='check';
  const check=make('input');check.type='checkbox';check.checked=reduce;
  check.addEventListener('change',()=>{reduce=check.checked;saveSettings();});
  visual.prepend(check);body.append(sound,visual);
});
get('invite-form').addEventListener('submit',event=>{event.preventDefault();send('invite',{id:get('nearby').value});});
get('accept').addEventListener('click',()=>{send('accept');get('invite').hidden=true;});
get('leave').addEventListener('click',()=>send('leave'));
get('chat-form').addEventListener('submit',event=>{
  event.preventDefault();
  const field=get('chat-text');
  if(field.value.trim()){send('chat',{text:field.value});field.value='';}
});
const movement={w:[0,-1],a:[-1,0],s:[0,1],d:[1,0],arrowup:[0,-1],arrowleft:[-1,0],arrowdown:[0,1],arrowright:[1,0]};
const shortcuts={' ':'attack','1':'dash','2':'guard',e:'interact',i:'pack'};
function move() {
  let x=0,y=0;
  for(const key of keys){x+=movement[key][0];y+=movement[key][1];}
  const length=Math.hypot(x,y)||1;
  send('move',{x:x/length,y:y/length});
}
function stopKeys() {if(keys.size){keys.clear();move();}}
function act(action) {
  if(action==='pack')return pack();
  send(action,aim?{x:aim[0],y:aim[1]}:{});
}
for(const button of document.querySelectorAll('[data-action]')) button.addEventListener('click',()=>act(button.dataset.action));
document.addEventListener('keydown',event=>{
  if(get('game').hidden||modal.open||event.target.matches('input,select,textarea')||event.ctrlKey||event.metaKey||event.altKey)return;
  const key=event.key.toLowerCase();
  if(Object.hasOwn(movement,key)) {
    event.preventDefault();
    if(!keys.has(key)){keys.add(key);aim=null;move();}
  } else if(Object.hasOwn(shortcuts,key) && !(key===' ' && event.target.matches('button'))) {
    event.preventDefault();
    if(!event.repeat)act(shortcuts[key]);
  }
});
document.addEventListener('keyup',event=>{if(keys.delete(event.key.toLowerCase()))move();});
document.addEventListener('focusin',event=>{if(event.target.matches('input,select,textarea'))stopKeys();});
addEventListener('blur',stopKeys);
setInterval(()=>{if(keys.size)move();},75);
canvas.addEventListener('pointermove',event=>{
  if(!state)return;
  const bounds=canvas.getBoundingClientRect();
  const x=(event.clientX-bounds.left)*canvas.width/bounds.width/16-state.self.x;
  const y=(event.clientY-bounds.top)*canvas.height/bounds.height/16-state.self.y;
  const length=Math.hypot(x,y);
  if(length>.15)aim=[x/length,y/length];
});
canvas.addEventListener('pointerleave',()=>{aim=null;});
canvas.addEventListener('click',()=>act('attack'));
let lastFrame=0;
function frame(now) {
  if(state && !get('game').hidden && now-lastFrame>=31) {
    draw(state,new Map([...poses].map(([id,p])=>[id,interpolate(p,now)])),aim,reduce,now);
    if(state.self.area==='square' && !state.workshop.opened && Math.hypot(state.self.x-26,state.self.y-9)<7 && now-lastHammer>2100) {
      lastHammer=now;beep(195,'triangle',.065);
    }
    lastFrame=now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
