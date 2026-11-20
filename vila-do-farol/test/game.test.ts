import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {MAPS,walkable} from '../public/world.js';
import {initial,maxHp} from '../src/data.ts';
import pg from 'pg';
import {readFile} from 'node:fs/promises';

test('geometria oferece duas rotas e todos os pontos interativos têm acesso',()=>{
  function line(area:string,x1:number,y1:number,x2:number,y2:number) {
    for (let n=0;n<=100;n++) assert.ok(walkable(area,x1+(x2-x1)*n/100,y1+(y2-y1)*n/100));
  }
  line('square',...MAPS.square.spawn,34,15);
  line('road',2,15,34,15);
  line('road',8,15,8,7);
  line('road',8,7,31,7);
  line('road',31,7,31,15);
  line('camp',2,15,17,15);
  line('camp',17,15,17,9);
  line('camp',17,9,26,9);
  line('camp',26,9,26,13);
  assert.equal(walkable('road',19,11),false);
});

const url=process.env.TEST_DATABASE_URL;
test('elegibilidade, entrega repetida e concorrente, oficina persistente e fabricação', {skip:!url},async()=>{
  const admin=new pg.Client({connectionString:url});
  await admin.connect();
  const schema='farol_test_'+randomBytes(5).toString('hex');
  await admin.query('CREATE SCHEMA '+schema);
  const config=new URL(url!);
  config.searchParams.set('options','-c search_path='+schema);
  process.env.DATABASE_URL=config.href;
  const {db}=await import('../src/db.ts');
  try {
    await db.query(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
    const {World}=await import('../src/game.ts');
    const world=new World(2);
    await world.initialize();
    const socket=()=>({readyState:1,bufferedAmount:0,send(){},close(){}});
    const make=async (name:string)=>{
      const {rows:[account]}=await db.query('INSERT INTO accounts(username,password_hash) VALUES ($1,$2) RETURNING id',[name,'isolado']);
      const state={...initial(0),area:'camp',x:26,y:13,quest:'accepted' as const};
      await db.query('INSERT INTO characters(account_id,name,state) VALUES ($1,$2,$3)',[account.id,name,state]);
      return world.add(account.id,name,state,socket(),'test',Infinity);
    };
    const a=await make('Luz'),b=await make('Onda'),c=await make('Mar'),late=await make('Vento');
    world.invite(a,b.id);world.accept(b);
    await world.interact(a);
    assert.equal(a.state.quest,'collected');
    assert.equal(b.state.expedition,a.state.expedition);
    world.invite(a,late.id);world.accept(late);
    assert.equal(late.state.quest,'accepted');
    await world.disconnect(b,b.ws);
    const {rows:[reconnected]}=await db.query('SELECT state FROM characters WHERE account_id=$1',[b.id]);
    const b2=world.add(b.id,b.name,reconnected.state,socket(),'test',Infinity);
    assert.equal(b2.state.expedition,a.state.expedition);
    await world.interact(c);
    for(const p of [a,b2,c]) Object.assign(p.state,{area:'square',x:31,y:15});
    await Promise.all([world.deliver(a),world.deliver(b2),world.deliver(c)]);
    assert.equal(a.state.inventory.iron,3);
    assert.equal(b2.state.inventory.iron,3);
    assert.equal(c.state.inventory.iron,3);
    assert.equal(late.state.inventory.iron,undefined);
    const restarted=new World(2);
    await restarted.initialize();
    assert.deepEqual(restarted.workshop,{crates:2,opened:true});
    const {rows:[before]}=await db.query('SELECT opened_at FROM workshop WHERE id=true');
    await world.interact(a);
    const {rows:[after]}=await db.query('SELECT crates,opened_at FROM workshop WHERE id=true');
    assert.equal(after.crates,2);
    assert.equal(+after.opened_at,+before.opened_at);
    Object.assign(late.state,{area:'square',x:26,y:9.5});
    await world.item(late,'craft');
    assert.equal(late.state.inventory.forged,undefined);
    Object.assign(a.state,{x:26,y:9.5});
    await world.item(a,'craft');await world.item(a,'craft');
    assert.equal(a.state.inventory.forged,1);
    assert.equal(a.state.inventory.iron,0);
    await world.item(a,'equip','forged');
    const {rows:[saved]}=await db.query('SELECT state FROM characters WHERE account_id=$1',[a.id]);
    assert.equal(saved.state.weapon,'forged');
    assert.equal(saved.state.completed,1);
    const e=world.enemies.find(e=>e.area==='road')!;
    Object.assign(a.state,{area:'road',x:2,y:15});
    world.combat(a,'attack',{x:1,y:0});
    assert.equal(e.hp,54);
    a.state.cooldowns!.attack=0;
    Object.assign(a.state,{x:e.x-1,y:e.y});
    world.combat(a,'attack',{x:1,y:0});
    assert.ok(e.hp<54);
    a.state.hp=1;
    world.hurt(a,30,Date.now());
    assert.equal(a.state.area,'square');
    assert.equal(a.state.hp,maxHp(a.state.xp));
    assert.equal(a.state.weapon,'forged');
  } finally {
    await db.end();
    await admin.query('DROP SCHEMA '+schema+' CASCADE');
    await admin.end();
  }
});
