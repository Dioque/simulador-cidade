import {MAPS,W,H,contains} from './world.js';
const T=16;
const coats=['#bd684f','#5e92a7','#7e9e66','#d2a451'];
const wood='#794e3d', shadow='#24342b77';
export function painter(canvas) {
  const ctx=canvas.getContext('2d');
  const scenery=document.createElement('canvas');
  scenery.width=W*T;scenery.height=H*T;
  const ground=scenery.getContext('2d');
  const fill=(context,color,x,y,w,h)=>{
    context.fillStyle=color;context.fillRect(Math.round(x),Math.round(y),w,h);
  };
  const r=(...args)=>fill(ground,...args);
  const f=(...args)=>fill(ctx,...args);
  const label=(text,x,y,color='#f6e4b4')=>{
    ctx.font='bold 8px monospace';ctx.textAlign='center';
    const width=Math.ceil(ctx.measureText(text).width)+6;
    f('#1e2a24df',x-width/2,y-8,width,11);
    ctx.fillStyle=color;ctx.fillText(text,Math.round(x),Math.round(y));
  };
  let area;
  let office;
  function tree(x,y,n) {
    r(shadow,x-9,y+8,26,7);
    r('#6d5341',x-2,y+2,4,12);
    r('#365c46',x-12,y-7,24,13);r('#365c46',x-8,y-13,17,24);
    r(n%2 ? '#638359' : '#507759',x-11,y-9,20,13);
    r('#789267',x-7,y-12,13,8);
    r('#94a97a',x-5,y-10,7,2);
  }
  function house(b,i,open) {
    const {x,y,w,h}=b;
    const a=x*T,d=y*T,u=w*T,v=h*T;
    const roof=['#a95d4d','#627c7f','#967456','#896071'][i%4];
    r(shadow,a+5,d+v-7,u+4,13);
    r('#b28c65',a,d+12,u,v-12);r('#d7b387',a+3,d+12,u-9,v-12);
    r('#413a30',a-3,d+v*.57,u+6,3);
    r(roof,a-3,d+8,u+6,v*.44-6);
    r(roof,a+2,d+3,u-4,9);
    r(roof,a+8,d-2,u-16,7);
    r('#ecb98899',a+8,d-2,u-16,2);
    for(let py=d+10;py<d+v*.54;py+=5) r('#46343833',a+1,py,u-2,1);
    r(wood,a+u/2-5,d+v-13,10,13);
    if (open) r('#e5ae62',a+u/2-3,d+v-11,6,11);
    for(const px of [a+10,a+u-19]) {
      r('#54473f',px,d+v-16,9,9);
      r('#f0bf6f',px+1,d+v-15,7,6);
      r('#a57657',px+4,d+v-15,1,6);
    }
    r('#9d795d',a+u-15,d+3,6,12);r('#553f38',a+u-16,d+2,8,2);
  }
  function lighthouse(b) {
    const x=b.x*T,y=b.y*T;
    r(shadow,x+3,y+49,67,16);
    r('#aa9b7d',x+2,y+51,60,13);
    r('#d9c5a2',x+13,y+3,39,52);r('#f0d6a8',x+15,y+4,26,50);
    r('#a45b4b',x+13,y+20,39,10);
    r('#b58355',x+26,y+40,11,15);
    r('#68544a',x+5,y-5,54,12);
    r('#597679',x+12,y-18,40,14);
    r('#9da887',x+15,y-17,14,10);
    r('#394f51',x+28,y-18,3,14);r('#394f51',x+42,y-18,3,14);
    r('#9b5349',x+8,y-21,48,4);r('#b76150',x+14,y-25,37,5);r('#c2765d',x+22,y-29,22,5);
    r('#e5bc81',x+32,y-33,2,6);
  }
  function tent(b,i) {
    const {x,y,w,h}=b;
    const a=x*T,d=y*T,u=w*T,v=h*T;
    r(shadow,a+6,d+v-9,u,12);
    r(i%2?'#93775c':'#9f694d',a,d+v/3,u,v*.65);
    r('#bfa485',a+4,d+10,u-8,v/2);r('#d4bd93',a+9,d+5,u-18,10);
    r('#52473b',a+u/2-9,d+v-20,18,18);r('#9a8268',a+u/2+4,d+v-19,5,13);
    r('#675040',a+3,d+v-15,3,17);r('#675040',a+u-4,d+v-15,3,17);
    r('#6b6051',a+u-15,d+14,4,8);r('#6b6051',a+u-12,d+16,6,4);
  }
  function build(key,open) {
    area=key;office=open;
    const map=MAPS[key];
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
      const n=((x+29)*3719^(y+39)*5189)>>>0;
      const a=x*T,b=y*T;
      if (map.water.some(q=>contains(q,x,y))) {
        r('#416e75',a,b,T,T);r('#527e82',a+n%9,b+n%11,6,1);r('#365e67',a+2,b+13,9,1);
        if (!map.water.some(q=>contains(q,x,y+1))) r('#8b9b7b',a,b+13,T,3);
      } else if (map.roads.some(q=>contains(q,x,y))) {
        const bridge=key==='road' && x>=17 && x<21 && y>=14 && y<17;
        const palette=key==='square' ? ['#aa9978','#a29172','#b09f80'] : ['#a19373','#9a8e6c','#a99c7c'];
        r(bridge?'#a78262':palette[n%3],a,b,T,T);
        if (bridge) {r('#745643',a,b,1,T);if(y!==15)r('#694b3b',a,y===14?b+1:b+13,T,3);}
        else if (key==='square') {r('#8a7e64',a,b+7,16,1);r('#8a7e64',a+n%9,b,1,7);}
        else r('#7b755f66',a+n%12,b+n%13,3,2);
      } else {
        r(map.color,a,b,T,T);
        r('#aab48255',a+2+n%8,b+4+n%6,3,2);
        r('#405b4944',a+n%10,b+12,5,1);
        const decorated=!map.blocks.some(q=>contains(q,x,y));
        if (decorated && n%19===0 && y>3 && x>2) tree(a+8,b+8,n);
        else if (decorated && n%11===0) r(key==='camp'?'#b1aa91':'#d2bc80',a+5,b+9,2,2);
      }
    }
    for (const [i,b] of map.blocks.entries()) {
      if (key==='square') {
        if (!i) lighthouse(b);
        else if (i===5) {
          r(shadow,479,203,32,6);r(wood,477,193,34,10);r('#b88b5e',479,192,32,3);
          r('#413b35',480,201,9,7);r('#413b35',499,202,9,7);
          r('#b88b5e',508,200,9,2);
        } else house(b,i,i===2 && open);
      } else if (key==='camp' && i<4) tent(b,i);
      else {
        for(let x=b.x;x<b.x+b.w;x++) for(let y=b.y;y<b.y+b.h;y++) {
          if ((x+y)%2===0) tree(x*T+7,y*T+6,x+y);
          if (y===b.y+b.h-1) r('#567151',x*T,y*T+10,16,5);
        }
      }
    }
    if (key==='square') {
      const x=18*T,y=11*T;
      r('#776c56',x-15,y-2,32,16);r('#c1ad83',x-13,y-4,28,15);
      r('#628685',x-9,y-3,22,11);r('#a4b7a0',x-2,y-8,8,8);r('#afc9b9',x-6,y+3,8,1);
      r('#795448',26*T-8,8*T+8,19,6);r(open?'#e1ac66':'#9a7f69',26*T-6,8*T+10,15,2);
    }
    for (const [x,y] of map.herbs ?? []) {
      r('#394f36',x*T-4,y*T-1,9,4);
      r('#b3c181',x*T-3,y*T-5,3,6);r('#cee297',x*T+1,y*T-4,3,5);
    }
    if (map.crate) {
      const [x,y]=map.crate.map(v=>v*T);
      r(shadow,x-7,y+4,16,4);r('#614b3c',x-7,y-7,14,13);r('#ba895c',x-6,y-6,12,10);
      r('#e6bb79',x-4,y-5,2,8);r('#e6bb79',x+3,y-5,2,8);
    }
    for(const portal of [map.exit,map.back]) if (portal) {
      const [x,y]=portal;
      r('#534e40',x*T-7,y*T-10,14,16);
      r('#dfb97d',x*T-5,y*T-9,10,3);
      r('#dfb97d',x*T-5,y*T+3,10,2);
    }
  }
  return function draw(state,poses,aim,reduce,now) {
    const key=state.self.area;
    if (area!==key || office!==state.workshop.opened) build(key,state.workshop.opened);
    ctx.drawImage(scenery,0,0);
    const map=MAPS[key];
    const actors=[];
    for (const p of state.players) {
      const pos=poses.get(p.id) ?? p;
      actors.push({...p,x:pos.x,y:pos.y,moving:pos.moving});
    }
    for (const n of map.npcs ?? []) actors.push({...n,npc:true,appearance:n.id==='nara'?3:2});
    for (const mob of state.enemies) actors.push({...mob,mob:true});
    const allies=new Set(state.team.map(p=>p.id));
    for(const p of actors.sort((a,b)=>a.y-b.y)) {
      const x=Math.round(p.x*T),y=Math.round(p.y*T);
      const swing=reduce ? 0 : Math.floor(now/130)%2;
      if (p.mob) {
        const wolf=p.kind==='wolf';
        if (p.phase==='windup') {
          ctx.beginPath();
          ctx.strokeStyle='#ffe0a1';
          ctx.lineWidth=1;
          ctx.setLineDash([3,2]);
          if (wolf) { ctx.moveTo(x,y);ctx.lineTo(x+p.aim.x*50,y+p.aim.y*50); }
          else ctx.arc(x,y,26,0,Math.PI*2);
          ctx.stroke();ctx.setLineDash([]);
          f('#fff1bc',x-1,y-24,2,4);f('#fff1bc',x-1,y-19,2,1);
        }
        f(shadow,x-8,y+1,18,4);
        const lift=p.phase==='windup' ? 3+swing : 0;
        f(wolf?'#836c66':'#524c5f',x-7,y-7-lift,14,8);
        f(wolf?'#a08d79':'#867581',x-5,y-10-lift,11,6);
        f('#41383e',x-5,y+1,3,3);f('#41383e',x+4,y+1,3,3);
        if(wolf) {
          const direction=p.aim.x<0?-1:1;
          f('#a08d79',x+direction*7-2,y-10-lift,6,7);
          f('#dca866',x+direction*8,y-8-lift,1,1);
        } else {
          f('#ab9386',x-3,y-10-lift,2,6);f('#665660',x+2,y-10-lift,2,7);
          if (p.phase==='recover') label('ABERTO',x,y-14);
        }
        f('#2e302c',x-10,y+7,20,2);f('#c57768',x-10,y+7,Math.max(0,20*p.hp/p.max),2);
      } else {
        const stride=p.moving?swing:0;
        f(shadow,x-6,y+1,13,4);f('#33363a',x-4,y-1,3,4+stride);f('#33363a',x+1,y-1,3,5-stride);
        f(coats[p.appearance],x-5,y-9,10,8);f('#edd0a0',x-3,y-16,7,6);
        f('#534538',x-4,y-17,8,3);f('#ffdfba',x+1,y-14,2,2);
        f('#4e4640',x-4,y-4,8,1);
        if(p.guard) {ctx.strokeStyle='#a7d6be';ctx.strokeRect(x-8,y-18,16,23);}
        const self=p.id===state.self.id;
        if (self) {
          const d=aim ?? [p.dx,p.dy];
          f('#fbdb92',x+d[0]*14-1,y+d[1]*14-1,3,3);
        }
        label(p.name,x,y-21,self?'#ffe3a5':allies.has(p.id)?'#aee0a0':'#f1e6ce');
      }
    }
    if (map.crate && state.self.quest==='accepted') label('CAIXA · E',map.crate[0]*T,map.crate[1]*T-12);
    if (key==='square' && state.self.quest!=='accepted') label('!',31*T,15*T-33);
    if (key==='road') {label('ERVAS',19*T,7*T-10);label('ATALHO',19*T,15*T-11);}
    if (map.exit) label(key==='square'?'ESTRADA':'ACAMPAMENTO',map.exit[0]*T-10,map.exit[1]*T-13);
    if (map.back) label(key==='road'?'PRAÇA':'ESTRADA',map.back[0]*T+10,map.back[1]*T-13);
  };
}
