import {randomUUID} from 'node:crypto';
import {MAPS,walkable} from '../public/world.js';
import {db,transaction} from './db.ts';
import {ACTIONS,ITEMS,MOBS,RECIPE,REWARDS,damage,level,maxHp,type State} from './data.ts';
import type {WebSocket} from 'ws';

type Position = {x:number;y:number};
type Player = {
  id:string; name:string; state:State; ws:WebSocket; session:string; expires:number;
  move:Position; direction:Position; lastMove:number;
  guard:number; portal:number; group:string|null;
};
type Enemy = Position & {
  id:string; kind:keyof typeof MOBS; area:string; home:Position; hp:number;
  phase:'idle'|'windup'|'recover'|'dead'; until:number; aim:Position; target:string|null;
};
const TICK = .05;
const distance = (a:Position,b:Position) => Math.hypot(a.x-b.x,a.y-b.y);
const normalized = (x:number,y:number) => {
  const length = Math.hypot(x,y);
  return length ? {x:x/length,y:y/length} : {x:0,y:0};
};
function slide(area:string,p:Position,x:number,y:number) {
  if (walkable(area,p.x+x,p.y)) p.x += x;
  if (walkable(area,p.x,p.y+y)) p.y += y;
}

export class World {
  players = new Map<string,Player>();
  groups = new Map<string,Set<string>>();
  invites = new Map<string,{from:string;until:number}>();
  workshop = {crates:0,opened:false};
  goal:number;
  enemies:Enemy[] = Object.entries(MAPS).flatMap(([area,map]) =>
    (map.mobs ?? []).map(([kind,x,y],index) => ({
      area,id:area+index,kind,x,y,home:{x,y},hp:MOBS[kind].hp,phase:'idle',until:0,aim:{x:0,y:0},target:null,
    })));

  constructor(goal:number) { this.goal = goal; }

  async initialize() {
    const {rows:[row]} = await db.query('SELECT crates, opened_at FROM workshop WHERE id=true');
    this.workshop = {crates:row.crates,opened:!!row.opened_at};
  }

  add(id:string,name:string,state:State,ws:WebSocket,session:string,expires:number) {
    const old = this.players.get(id);
    if (old) old.ws.close(4001,'Conta conectada em outra aba.');
    const player = old ?? {id,name,state,group:null,guard:0,portal:0,
      move:{x:0,y:0},direction:{x:1,y:0},lastMove:0};
    Object.assign(player,{ws,session,expires,move:{x:0,y:0}});
    this.players.set(id, player as Player);
    this.send(player as Player,{type:'hello',id});
    return player as Player;
  }

  send(p:Player,message:unknown) {
    if (p.ws.readyState !== 1) return;
    if (p.ws.bufferedAmount > 256_000) { p.ws.close(1013,'Conexão lenta.'); return; }
    p.ws.send(JSON.stringify(message));
  }

  note(p:Player,text:string) { this.send(p,{type:'note',text}); }

  async disconnect(p:Player,ws:WebSocket) {
    if (p.ws !== ws || this.players.get(p.id) !== p) return;
    this.players.delete(p.id);
    this.invites.delete(p.id);
    this.leave(p);
    await this.save(p);
  }

  async save(p:Player) {
    await db.query('UPDATE characters SET state=$1 WHERE account_id=$2',[p.state,p.id]);
  }

  async checkpoint() {
    const players = [...this.players.values()];
    if (!players.length) return;
    await db.query('UPDATE characters c SET state=s.state FROM unnest($1::bigint[], $2::jsonb[]) AS s(id,state) WHERE c.account_id=s.id',
      [players.map(p=>p.id),players.map(p=>JSON.stringify(p.state))]);
  }

  leave(p:Player) {
    if (!p.group) return;
    const group = this.groups.get(p.group);
    group?.delete(p.id);
    if (!group?.size) this.groups.delete(p.group);
    p.group = null;
  }

  team(p:Player) {
    return [...(this.groups.get(p.group ?? '') ?? [p.id])].map(id=>this.players.get(id)).filter(Boolean) as Player[];
  }

  invite(p:Player,target:string) {
    const friend = this.players.get(target);
    if (!friend || friend === p || friend.state.area !== p.state.area ||
        friend.group || this.team(p).length >= 4) return this.note(p,'Convite indisponível.');
    this.invites.set(target,{from:p.id,until:Date.now()+30_000});
    this.send(friend,{type:'invite',name:p.name});
    this.note(p,'Convite enviado.');
  }

  accept(p:Player) {
    const invite = this.invites.get(p.id);
    this.invites.delete(p.id);
    const inviter = invite && this.players.get(invite.from);
    if (!inviter || p.group || Date.now() >= invite.until || this.team(inviter).length >= 4 ||
        inviter.state.area !== p.state.area) return this.note(p,'O convite expirou ou o grupo está cheio.');
    inviter.group ??= randomUUID();
    const team = this.groups.get(inviter.group) ?? new Set([inviter.id]);
    team.add(p.id);
    this.groups.set(inviter.group,team);
    p.group = inviter.group;
  }

  async mutate(p:Player,change:(state:State)=>void) {
    const state = structuredClone(p.state);
    change(state);
    await db.query('UPDATE characters SET state=$1 WHERE account_id=$2',[state,p.id]);
    p.state = state;
  }

  async collect(p:Player) {
    if (p.state.quest !== 'accepted') return this.note(p,'Aceite a missão com Nara primeiro.');
    const eligible = this.team(p).filter(member => member.state.area === 'camp' && member.state.quest === 'accepted');
    const expedition = randomUUID();
    const next = eligible.map(member => ({...member.state,quest:'collected' as const,expedition}));
    await transaction(async client => {
      await client.query('INSERT INTO expeditions (id,eligible) VALUES ($1,$2)',[expedition,eligible.map(m=>m.id)]);
      for (const [i,member] of eligible.entries()) {
        await client.query('UPDATE characters SET state=$1 WHERE account_id=$2',[next[i],member.id]);
      }
    });
    for (const [i,member] of eligible.entries()) {
      member.state = next[i];
      this.note(member,'Caixa recuperada. Voltem até Nara. Esta expedição soma uma caixa à oficina.');
    }
  }

  async deliver(p:Player) {
    const expedition = p.state.expedition;
    const result = await transaction(async client => {
      const {rows:[row]} = await client.query('SELECT eligible,delivered_at FROM expeditions WHERE id=$1 FOR UPDATE',[expedition]);
      if (!row || row.delivered_at || !row.eligible.includes(p.id)) return null;
      const updates = new Map<string,State>();
      for (const id of row.eligible) {
        const {rows:[stored]} = await client.query('SELECT state FROM characters WHERE account_id=$1 FOR UPDATE',[id]);
        const next:State = structuredClone(this.players.get(id)?.state ?? stored.state);
        const rewards = next.completed ? REWARDS.repeat : REWARDS.first;
        next.quest = 'none';
        next.expedition = null;
        next.completed++;
        next.xp += rewards.xp;
        next.inventory.iron = (next.inventory.iron ?? 0) + rewards.iron;
        updates.set(id,next);
        await client.query('UPDATE characters SET state=$1 WHERE account_id=$2',[next,id]);
      }
      await client.query('UPDATE expeditions SET delivered_at=NOW() WHERE id=$1',[expedition]);
      const {rows:[workshop]} = await client.query(`UPDATE workshop SET crates=crates+1,
        opened_at=COALESCE(opened_at,CASE WHEN crates+1 >= $1 THEN NOW() END) WHERE id=true RETURNING crates,opened_at`,[this.goal]);
      return {updates,workshop};
    });
    if (!result) return this.note(p,'Esta expedição já foi entregue.');
    const newlyOpened = !this.workshop.opened && !!result.workshop.opened_at;
    this.workshop = {crates:result.workshop.crates,opened:!!result.workshop.opened_at};
    for (const [id,state] of result.updates) {
      const member = this.players.get(id);
      if (member) {
        member.state = state;
        this.note(member,'Expedição entregue. Recompensa recebida!');
      }
    }
    if (newlyOpened) for (const member of this.players.values()) this.note(member,'A oficina reabriu! Visite o ferreiro na praça.');
  }

  near(p:Player,area:string,x:number,y:number,reach=1.6) {
    return p.state.area === area && distance(p.state,{x,y}) <= reach;
  }

  async interact(p:Player) {
    if (this.near(p,'square',31,15)) {
      if (p.state.quest === 'collected') return this.deliver(p);
      return this.send(p,{type:'dialog',speaker:'Nara',lines:[
        'Minha carroça quebrou e as ferramentas ficaram no acampamento.',
        'Na bifurcação, procure ervas pelo norte ou atravesse a ponte curta, onde os lobos rondam.',
        'Cada expedição entrega uma caixa à oficina. Todos do grupo com a missão ativa no acampamento durante a coleta ganham a recompensa.',
      ], action:p.state.quest === 'none' ? 'quest' : null});
    }
    if (this.near(p,'square',26,9.5)) {
      return this.send(p,{type:'dialog',speaker:'Ferreiro',lines:this.workshop.opened ?
        ['Com 3 ferros recuperados, posso ensinar a forjar a Lâmina do Farol.','Equipada, ela soma 8 de dano ao ataque básico.'] :
        ['Ainda faltam ferramentas. Fale com Nara perto do portão.'],action:this.workshop.opened ? 'craft' : null});
    }
    if (this.near(p,'camp',26,13)) return this.collect(p);
    if (MAPS[p.state.area].herbs?.some(([x,y]) => this.near(p,'road',x,y,1.1))) {
      if (Date.now() < (p.state.herbReadyAt ?? 0)) return this.note(p,'As ervas ainda estão rebrotando.');
      if ((p.state.inventory.herb ?? 0) >= 10) return this.note(p,'Inventário cheio para ervas (10).');
      await this.mutate(p,state => {
        state.inventory.herb = (state.inventory.herb ?? 0)+1;
        state.herbReadyAt = Date.now()+20_000;
      });
      return this.note(p,'Erva coletada. Use pelo inventário.');
    }
    this.note(p,'Aproxime-se de alguém, das ervas ou da caixa.');
  }

  async item(p:Player,action:string,item?:string) {
    if (action === 'craft') {
      if (!this.near(p,'square',26,9.5) || !this.workshop.opened) return this.note(p,'Visite a oficina aberta para fabricar.');
      if (p.state.inventory.forged) return this.note(p,'Você já possui esta arma.');
      if ((p.state.inventory.iron ?? 0) < RECIPE.iron) return this.note(p,'Você precisa de 3 ferros.');
      await this.mutate(p,state => {state.inventory.iron -= RECIPE.iron;state.inventory.forged=1;});
      return this.note(p,'Lâmina do Farol fabricada. Equipe-a no inventário.');
    }
    if (action === 'equip' && (item === 'short' || item === 'forged') && p.state.inventory[item] > 0) {
      await this.mutate(p,state=>{state.weapon=item;});
    }
    if (action === 'use' && item === 'herb' && p.state.inventory.herb > 0 && p.state.hp < maxHp(p.state.xp)) {
      await this.mutate(p,state=>{state.inventory.herb--;state.hp=Math.min(maxHp(state.xp),state.hp+35);});
    }
  }

  async action(p:Player,message:Record<string,unknown>) {
    switch (message.type) {
      case 'move': {
        const {x,y} = message;
        if (typeof x !== 'number' || typeof y !== 'number' || Math.abs(x)>1 || Math.abs(y)>1) return;
        p.move = normalized(x,y);
        if (x || y) p.direction = p.move;
        p.lastMove = Date.now();
        break;
      }
      case 'attack': case 'dash': case 'guard':
        this.combat(p,message.type,message);
        break;
      case 'interact': await this.interact(p); break;
      case 'quest':
        if (this.near(p,'square',31,15) && p.state.quest === 'none') {
          await this.mutate(p,state=>{state.quest='accepted';});
          this.note(p,'Procure a caixa no Acampamento da Ponte, ao leste.');
        }
        break;
      case 'craft': case 'equip': case 'use':
        await this.item(p,message.type,typeof message.item === 'string' ? message.item : undefined);
        break;
      case 'invite':
        if (typeof message.id === 'string') this.invite(p,message.id);
        break;
      case 'accept': this.accept(p); break;
      case 'leave': this.leave(p); break;
      case 'chat':
        if (typeof message.text !== 'string') break;
        const text = message.text.trim();
        if (!text || text.length > 170 || /[\x00-\x1f\x7f]/.test(text)) break;
        for (const friend of this.players.values()) if (friend.state.area === p.state.area) {
          this.send(friend,{type:'chat',name:p.name,text});
        }
        break;
    }
  }

  combat(p:Player,kind:'attack'|'dash'|'guard',message:Record<string,unknown>) {
    const now = Date.now();
    const cooldowns = p.state.cooldowns ??= {};
    if (now < (cooldowns[kind] ?? 0) || now < p.portal) return;
    cooldowns[kind] = now + ACTIONS[kind].cooldown;
    if (kind === 'guard') { p.guard=now+ACTIONS.guard.duration; return; }
    if (typeof message.x === 'number' && typeof message.y === 'number' &&
        Math.abs(message.x)<=1 && Math.abs(message.y)<=1 && (message.x || message.y)) {
      p.direction=normalized(message.x,message.y);
    }
    if (kind === 'dash') for (let step=0;step<9;step++) {
      slide(p.state.area,p.state,p.direction.x*.24,p.direction.y*.24);
    }
    const target = this.enemies.filter(e => {
      if (e.area !== p.state.area || e.phase === 'dead' || distance(e,p.state)>ACTIONS[kind].reach) return false;
      const toward = normalized(e.x-p.state.x,e.y-p.state.y);
      if ((toward.x || toward.y) && toward.x*p.direction.x+toward.y*p.direction.y < .25) return false;
      const span = distance(e,p.state);
      for (let offset=.25;offset<span;offset+=.25) {
        if (!walkable(e.area,p.state.x+toward.x*offset,p.state.y+toward.y*offset)) return false;
      }
      return true;
    }).sort((a,b)=>distance(a,p.state)-distance(b,p.state))[0];
    if (!target) return;
    const amount = damage(p.state)+(kind==='dash' ? 6 : 0)+(target.kind==='beetle' && target.phase==='recover' ? 9 : 0);
    target.hp -= amount;
    this.send(p,{type:'hit',text:'−'+amount+' · '+MOBS[target.kind].name});
    if (target.hp <= 0) {
      target.phase='dead';
      target.until=now+17_000;
      p.state.xp += 8;
    }
  }

  step(now:number) {
    for (const p of this.players.values()) {
      if (p.expires <= now) { p.ws.close(4003,'Sessão expirada.'); continue; }
      const s=p.state;
      if (now-p.lastMove < 350) slide(s.area,s,p.move.x*TICK*4.4,p.move.y*TICK*4.4);
      if (now < p.portal) continue;
      const map = MAPS[s.area];
      for (const portal of [map.exit,map.back]) {
        if (!portal) continue;
        const [x,y,area,nextX,nextY] = portal;
        if (distance(s,{x,y}) < .75) {
          Object.assign(s,{area,x:nextX,y:nextY});
          p.portal = now+450;
          break;
        }
      }
    }
    for (const enemy of this.enemies) this.enemyStep(enemy,now);
  }

  enemyStep(e:Enemy,now:number) {
    const rule=MOBS[e.kind];
    if (e.phase==='dead') {
      if (now >= e.until) Object.assign(e,e.home,{phase:'idle',hp:rule.hp});
      return;
    }
    if (e.phase==='windup') {
      if (now < e.until) return;
      const start={x:e.x,y:e.y};
      if (e.kind==='wolf') for (let i=0;i<12;i++) slide(e.area,e,e.aim.x*.27,e.aim.y*.27);
      const length=distance(e,start);
      for (const p of this.players.values()) {
        if (p.state.area !== e.area || now < p.portal) continue;
        const progress = Math.max(0,Math.min(length,(p.state.x-start.x)*e.aim.x+(p.state.y-start.y)*e.aim.y));
        const impact={x:start.x+progress*e.aim.x,y:start.y+progress*e.aim.y};
        if (distance(p.state,impact) <= (e.kind==='wolf' ? .8 : 1.75)) this.hurt(p,rule.damage,now);
      }
      e.phase='recover';e.until=now+rule.recover;
      return;
    }
    if (e.phase==='recover' && now<e.until) return;
    e.phase='idle';
    const target=[...this.players.values()].filter(p => p.state.area===e.area &&
      distance(e.home,p.state)<6 && distance(e,p.state)<5.4).sort((a,b)=>distance(e,a.state)-distance(e,b.state))[0];
    const goal=target && distance(e,e.home)<6.8 ? target.state : e.home;
    const direction=normalized(goal.x-e.x,goal.y-e.y);
    if (target && goal===target.state && distance(e,goal)<rule.trigger) {
      if (e.kind==='wolf') slide(e.area,e,-direction.x*.44,-direction.y*.44);
      e.aim=direction;e.phase='windup';e.until=now+rule.windup;
    } else if (distance(e,goal)>.17) {
      slide(e.area,e,direction.x*TICK*rule.speed,direction.y*TICK*rule.speed);
    } else if (!target) e.hp=rule.hp;
  }

  hurt(p:Player,raw:number,now:number) {
    const amount=now<p.guard ? Math.ceil(raw*.22) : raw;
    p.state.hp -= amount;
    this.send(p,{type:'hurt',text:'−'+amount+' de vida'+(now<p.guard ? ' · Guarda' : '')});
    if (p.state.hp <= 0) {
      Object.assign(p.state,{area:'square',x:18,y:15,hp:maxHp(p.state.xp)});
      p.portal=now+1200;
      this.note(p,'Você caiu e acordou na praça. Seus itens foram preservados.');
    }
  }

  broadcast(now:number) {
    for (const p of this.players.values()) {
      const area=p.state.area;
      const team=this.team(p).filter(member=>member!==p);
      const show=(member:Player)=>({id:member.id,name:member.name,x:member.state.x,y:member.state.y,
        appearance:member.state.appearance,hp:member.state.hp,max:maxHp(member.state.xp),area:member.state.area,
        dx:member.direction.x,dy:member.direction.y,guard:member.guard>now});
      this.send(p,{type:'world', players:[...this.players.values()].filter(m=>m.state.area===area).map(show),
        self:{...show(p),level:level(p.state.xp),xp:p.state.xp,weapon:ITEMS[p.state.weapon].name,
          inventory:p.state.inventory,damage:damage(p.state),quest:p.state.quest,completed:p.state.completed,
          cooldown:Object.fromEntries(Object.entries(p.state.cooldowns ?? {}).map(([key,value])=>[key,Math.max(0,value-now)]))},
        enemies:this.enemies.filter(e=>e.area===area && e.phase!=='dead').map(e=>({...e,max:MOBS[e.kind].hp})),
        team:team.map(show),grouped:!!p.group,workshop:{...this.workshop,goal:this.goal}});
    }
  }
}
