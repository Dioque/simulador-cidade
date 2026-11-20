import {createHash,randomBytes} from 'node:crypto';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import argon2 from 'argon2';
import {WebSocketServer} from 'ws';
import {db,transaction} from './db.ts';
import {initial} from './data.ts';
import {World} from './game.ts';

const PORT = Number(process.env.PORT || 3000);
const origin = new URL(process.env.PUBLIC_ORIGIN || 'http://localhost:'+PORT);
const secure = origin.protocol === 'https:';
const goal = Number(process.env.WORKSHOP_GOAL || 2);
if (process.env.NODE_ENV === 'production' && !secure) throw Error('Produção exige PUBLIC_ORIGIN com HTTPS.');
if (!Number.isSafeInteger(goal) || goal < 1 || goal > 100) throw Error('WORKSHOP_GOAL deve ser de 1 a 100.');
const world = new World(goal);
const owner = await db.connect();
const lock = await owner.query('SELECT pg_try_advisory_lock(188007) AS acquired');
if (!lock.rows[0].acquired) throw Error('Já existe um processo do jogo conectado a este banco.');
owner.on('error',()=>process.exit(1));
await world.initialize();

const argon = {type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1};
const dummyHash = await argon2.hash(randomBytes(24),argon);
const sessionHours = 12;
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
function token(req:IncomingMessage) {
  return req.headers.cookie?.match(/(?:^|;\s*)farol=([a-f0-9]{64})(?:;|$)/)?.[1];
}
async function session(req:IncomingMessage) {
  const value = token(req);
  if (!value) return null;
  const sessionHash = hash(value);
  const {rows:[row]} = await db.query(`SELECT s.account_id AS id,s.expires_at,c.name,c.state
    FROM sessions s JOIN characters c ON c.account_id=s.account_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[sessionHash]);
  return row ? {...row,hash:sessionHash} : null;
}
function cookie(value:string,maxAge:number) {
  return `farol=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function headers(res:ServerResponse) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${secure ? 'wss:' : origin.origin.replace('http:','ws:')}; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  if (secure) res.setHeader('Strict-Transport-Security','max-age=31536000');
}
function json(res:ServerResponse,status:number,value:unknown) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
async function body(req:IncomingMessage) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new Error('body');
  let size=0;
  const chunks:Buffer[]=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>4096) throw Error('body');
    chunks.push(chunk);
  }
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('body');
  return data;
}
const buckets = new Map<string,{count:number;until:number}>();
function limit(key:string,count:number,ms:number) {
  const now=Date.now();
  const old=buckets.get(key);
  if (!old || old.until<=now) {
    if (!old && buckets.size>=20_000) return false;
    buckets.set(key,{count:1,until:now+ms});
    return true;
  }
  return ++old.count<=count;
}
function address(req:IncomingMessage) {
  const forwarded=req.headers['x-real-ip'];
  const direct=req.socket.remoteAddress ?? 'unknown';
  return process.env.TRUST_PROXY === '1' && typeof forwarded==='string' ? forwarded : direct;
}
const cleanup=setInterval(()=>{
  const now=Date.now();
  for (const [key,record] of buckets) if (record.until<=now) buckets.delete(key);
  db.query('DELETE FROM sessions WHERE expires_at<=NOW()').catch(()=>console.error('Falha ao limpar sessões expiradas.'));
},60_000);
cleanup.unref();

let queue=Promise.resolve();
let queued=0;
function serial<T>(task:()=>T | Promise<T>) {
  queued++;
  const result=queue.then(task);
  queue=result.then(()=>{},()=>{}).finally(()=>{queued--;});
  return result;
}
let hashing=0;
async function authenticate(req:IncomingMessage,res:ServerResponse,register:boolean) {
  if (!limit('auth-ip:'+address(req),register ? 8 : 18,60_000) || hashing>=4) return json(res,429,{error:'Muitas tentativas. Tente em instantes.'});
  let data;
  try { data=await body(req); }
  catch { return json(res,400,{error:'Dados inválidos.'}); }
  const {username,password,name,appearance}=data;
  if (typeof username!=='string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username) ||
      typeof password!=='string' || password.length<(register?12:1) || Buffer.byteLength(password)>128 ||
      (register && (typeof name!=='string' || !/^[\p{L}0-9][\p{L}0-9 -]{2,19}$/u.test(name) ||
        !Number.isInteger(appearance) || appearance<0 || appearance>3))) {
    return json(res,400,{error:'Revise o usuário, a senha e o nome do personagem.'});
  }
  const user=username.toLowerCase();
  if (hashing>=4 || !limit('auth-user:'+user,10,60_000)) return json(res,429,{error:'Muitas tentativas. Tente em instantes.'});
  hashing++;
  try {
    let id;
    if (register) {
      const passwordHash=await argon2.hash(password,argon);
      try {
        id=await transaction(async client=>{
          const {rows:[account]}=await client.query('INSERT INTO accounts(username,password_hash) VALUES ($1,$2) RETURNING id',[user,passwordHash]);
          await client.query('INSERT INTO characters(account_id,name,state) VALUES ($1,$2,$3)',[account.id,name,initial(appearance)]);
          return account.id;
        });
      } catch (error) {
        if (error.code==='23505') return json(res,409,{error:'Usuário ou personagem já cadastrado.'});
        throw error;
      }
    } else {
      const {rows:[account]}=await db.query('SELECT id,password_hash FROM accounts WHERE username=$1',[user]);
      const matches=await argon2.verify(account?.password_hash ?? dummyHash,password);
      if (!account || !matches) return json(res,401,{error:'Usuário ou senha inválidos.'});
      id=account.id;
    }
    const value=randomBytes(32).toString('hex');
    await serial(async()=>{
      await transaction(async client=>{
        await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[id]);
        await client.query('DELETE FROM sessions WHERE account_id=$1',[id]);
        await client.query("INSERT INTO sessions VALUES ($1,$2,NOW()+interval '12 hours')",[hash(value),id]);
      });
      const active=world.players.get(id);
      if (active) {
        active.ws.close(4001,'Conta conectada em outra sessão.');
        await world.disconnect(active,active.ws);
      }
    });
    res.setHeader('Set-Cookie',cookie(value,sessionHours*3600));
    json(res,200,{ok:true});
  } finally { hashing--; }
}

const staticFiles=new Map([
  ['/', ['index.html','text/html']], ['/style.css',['style.css','text/css']],
  ['/client.js',['client.js','text/javascript']],['/world.js',['world.js','text/javascript']],
  ['/art.js',['art.js','text/javascript']],
]);
const assets=new Map();
for (const [route,[file,type]] of staticFiles) assets.set(route,
  {bytes:await readFile(new URL('../public/'+file,import.meta.url)),type});
const server=createServer(async(req,res)=>{
  headers(res);
  try {
    const path=req.url?.split('?')[0] ?? '';
    const asset=assets.get(path);
    if (asset && (req.method==='GET' || req.method==='HEAD')) {
      res.writeHead(200,{'Content-Type':asset.type+'; charset=utf-8','Cache-Control':'no-cache'});
      return res.end(req.method==='HEAD' ? undefined : asset.bytes);
    }
    if (req.method==='GET' && path==='/api/session') {
      if (!limit('session:'+address(req),40,60_000)) return json(res,429,{error:'Muitas consultas de sessão.'});
      const info=await session(req);
      return json(res,200,{logged:!!info});
    }
    if (req.method!=='POST' || !['/api/register','/api/login','/api/logout'].includes(path)) return json(res,404,{error:'Página não encontrada.'});
    if (req.headers.origin!==origin.origin) return json(res,403,{error:'Origem não permitida.'});
    if (path!=='/api/logout') return await authenticate(req,res,path==='/api/register');
    if (!limit('logout:'+address(req),15,60_000)) return json(res,429,{error:'Muitas tentativas.'});
    const value=token(req);
    if (value) await serial(async()=>{
      const sessionHash=hash(value);
      await db.query('DELETE FROM sessions WHERE token_hash=$1',[sessionHash]);
      for (const p of world.players.values()) if (p.session===sessionHash) {
        p.ws.close(4003,'Sessão encerrada.');
        await world.disconnect(p,p.ws);
      }
    });
    res.setHeader('Set-Cookie',cookie('',0));
    return json(res,200,{ok:true});
  } catch (error) {
    console.error('Falha HTTP.',error.code ?? error.name);
    if (!res.headersSent) json(res,500,{error:'Falha temporária do servidor.'});
  }
});
server.requestTimeout=10_000;
server.headersTimeout=8000;
const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
const rates:Record<string,[number,number]>={
  move:[32,1000],attack:[5,1000],dash:[3,1000],guard:[3,1000],interact:[4,2000],
  quest:[4,3000],craft:[4,3000],equip:[5,2000],use:[4,2000],
  invite:[3,10_000],accept:[5,5000],leave:[4,5000],chat:[5,5000],
};
server.on('upgrade',(req,socket,head)=>{
  socket.on('error',()=>{});
  if (req.url!=='/game' || req.headers.origin!==origin.origin || queued>120 ||
      !limit('upgrade:'+address(req),18,60_000)) return socket.destroy();
  socket.setTimeout(5000,()=>socket.destroy());
  serial(async()=>{
    const info=await session(req);
    if (!info || socket.destroyed || world.players.size>=100 && !world.players.has(info.id)) return socket.destroy();
    wss.handleUpgrade(req,socket,head,ws=>{
      socket.setTimeout(0);
      const p=world.add(info.id,info.name,info.state,ws,info.hash,new Date(info.expires_at).getTime());
      let pending=0;
      ws.on('error',()=>{});
      ws.on('message',(bytes,binary)=>{
        if (binary || pending>=12 || queued>=140 || !limit('ws:'+p.id,65,1000)) { ws.close(1008,'Limite de mensagens excedido.'); return; }
        let message;
        try { message=JSON.parse(bytes.toString()); } catch { ws.close(1007,'Mensagem inválida.'); return; }
        if (!message || Array.isArray(message) || typeof message!=='object' || typeof message.type!=='string' ||
            !Object.hasOwn(rates,message.type)) return;
        if (!limit('action:'+p.id+':'+message.type,...rates[message.type])) return;
        pending++;
        serial(async()=>{
          if (world.players.get(p.id)===p && p.ws===ws && ws.readyState===1 && p.expires>Date.now()) {
            await world.action(p,message);
          }
        }).catch(error=>{ console.error('Falha na ação.',error.code ?? error.name); world.note(p,'Ação indisponível.'); })
          .finally(()=>{pending--;});
      });
      ws.on('close',()=>{ serial(()=>world.disconnect(p,ws)).catch(()=>console.error('Falha ao salvar na desconexão.')); });
    });
  }).catch(()=>socket.destroy());
});
let ticking=false;
let frame=0;
const timer=setInterval(()=>{
  if (ticking) return;
  ticking=true;
  serial(async()=>{
    world.step(Date.now());
    if (++frame%2===0) world.broadcast(Date.now());
    if (frame%60===0) await world.checkpoint();
  }).catch(error=>console.error('Falha na atualização do mundo.',error.code ?? error.name)).finally(()=>{ticking=false;});
},50);
server.listen(PORT,process.env.BIND_HOST || '127.0.0.1',()=>console.log('Vila do Farol escutando na porta '+PORT+'.'));
let stopping=false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{
  if (stopping) return;
  stopping=true;
  clearInterval(timer);
  for (const ws of wss.clients) ws.terminate();
  server.close();
  try {
    await serial(()=>world.checkpoint());
    owner.release();
    await db.end();
  } catch { process.exitCode=1; }
});
