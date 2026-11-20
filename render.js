import { HEIGHT, TILE, WIDTH } from './map.js';
import { position } from './city.js';

const GRASS = ['#8baa65','#91ae6b','#89a665','#93b06e'];
const ROOFS = [
  ['#c26855','#ec9677','#a74e45'],['#467f99','#6eacc0','#37677c'],
  ['#ca924a','#edbb6b','#a16f3b'],['#745d86','#a58eaf','#564363'],
];
const COATS = ['#a44649','#39717f','#e5a64d','#825981','#45609d','#ef9a75','#f5dba4','#547549'];
const SKIN = ['#f2c19a','#d89a72','#b77e5a','#85573f'];
const noise = (x,y) => (Math.imul(x+73,34157) ^ Math.imul(y+19,72091)) >>> 0;

export function createRenderer(canvas, city) {
  canvas.width = WIDTH*TILE;
  canvas.height = HEIGHT*TILE;
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const map = base.getContext('2d');
  const fill = (color,x,y,w,h) => {
    map.fillStyle = color;
    map.fillRect(x,y,w,h);
  };
  const terrain = (x,y) => city.terrain[y]?.[x];
  const buildings = new Map(city.buildings.map(b => [b.y*WIDTH+b.x,b]));
  const local = (x,y) => (color,dx,dy,w,h) => fill(color,x*TILE+dx,y*TILE+dy,w,h);

  function tree(r,x,y,kind) {
    r('#52694599',x-3,y+8,13,5);
    r('#775c42',x+1,y+4,3,8);
    r('#42694c',x-4,y-1,13,8);
    r('#42694c',x-2,y-4,9,13);
    r(kind ? '#659253' : '#587f50',x-4,y-3,11,8);
    r(kind ? '#80a860' : '#70965b',x-2,y-5,7,7);
    r('#a0b973',x-1,y-4,4,2);
  }

  for (let y=0; y<HEIGHT; y++) {
    for (let x=0; x<WIDTH; x++) {
      const r = local(x,y), n = noise(x,y);
      const kind = terrain(x,y);
      if (kind === 'water') {
        r((x+y)%3 ? '#508e9b' : '#54939f',0,0,24,24);
        r('#6eabb0',n%15,3+n%13,6,1);
        r('#468795',n%14,17,9,1);
        if (terrain(x-1,y) !== 'water') {
          r('#b4c6a1',0,0,2,24);
          r('#76a7a3',2,0,3,24);
        }
        continue;
      }
      r(GRASS[n%4],0,0,24,24);
      r('#789857',n%18,4+n%12,3,1);
      r('#a8bc72',4+n%14,18,2,2);
      if (kind === 'shore') {
        r('#ac9d76',12,0,12,24);
        r('#dbc998',15,0,7,24);
        r('#b6aa7f',16,n%17,5,1);
        if (y%3 === 0) tree(r,5,8,n%2);
      }
      if (kind === 'park' || kind === 'path') {
        r('#7da25f',0,0,24,24);
        if (kind === 'path' || y%3 === 0) {
          if (kind === 'path') r('#c3b289',9,0,6,24);
          if (y%3 === 0) r('#c3b289',0,9,24,6);
        } else {
          tree(r,8,7,n%2);
          r('#e5c27d',17,17,2,2);
          r('#efd397',18,20,2,2);
        }
      }
      if ((x === 7 && y === 15) || (x === 23 && y === 11)) {
        r('#a4a078',3,5,18,14);
        r('#64999b',4,6,16,12);
        r('#83b1ab',6,8,8,1);
        r('#caaf71',14,14,3,2);
        r('#5a8d82',13,13,5,1);
      }
      if (kind === 'road') {
        const north = terrain(x,y-1) === 'road', south = terrain(x,y+1) === 'road';
        const west = terrain(x-1,y) === 'road', east = terrain(x+1,y) === 'road';
        const road = (color,inset) => {
          const span = 24-inset*2;
          r(color,inset,inset,span,span);
          if (north) r(color,inset,0,span,inset);
          if (south) r(color,inset,24-inset,span,inset);
          if (west) r(color,0,inset,inset,span);
          if (east) r(color,24-inset,inset,inset,span);
        };
        road('#a0957e',1);
        road('#c4b99d',2);
        road('#676d71',5);
        road('#6e7478',6);
        if (north && south && !west && !east) r('#cbbb8d',11,9,1,6);
        if (west && east && !north && !south) r('#cbbb8d',9,11,6,1);
        if (north && south && west && east) {
          for (let i=7;i<18;i+=3) {
            r('#b9b6a7',i,2,2,3);
            r('#b9b6a7',i,19,2,3);
          }
        }
        if ((x+y)%11 === 0) {
          r('#494e4a',3,2,1,6);
          r('#eee1a4',2,1,3,2);
        }
      }
      if (kind === 'grass' && !buildings.has(y*WIDTH+x) && n%5 < 2) {
        tree(r,7+n%9,7+n%5,n%2);
        if (n%9 === 0) r('#e7ca7e',17,16,2,2);
      }
    }
  }

  for (const b of city.buildings) {
    const {x,y,kind} = b;
    const r = local(x,y);
    const n = noise(x,y);
    const northDoor = b.entry[1] < y;
    r('#bdb492',2,2,20,20);
    r('#859365',20,4,3,16);
    r('#575c4960',5,18,18,3);
    if (kind === 'home') {
      const [main,light,deep] = ROOFS[n%4];
      r('#efd7a9',4,10,15,9);
      r('#bda079',17,10,3,9);
      r(deep,2,9,20,4);
      r(main,3,7,18,4); r(main,5,5,14,3); r(main,7,3,10,3);
      r(light,7,3,10,1); r(light,5,6,14,1); r(light,3,9,16,1);
      r('#4a646d',6,14,4,3); r('#aec9bb',7,14,2,1);
      r('#705245',13,14,3,5);
      r('#c19d79',13,northDoor ? 1 : 19,3,northDoor ? 2 : 4);
      if (n%3 === 0) { r('#956954',17,3,2,4); r('#c08a70',17,2,3,1); }
      if (n%4 === 0) tree(r,20,12,1);
    } else {
      const civic = kind === 'police' || kind === 'clinic';
      const color = { police:'#5b879f',clinic:'#ece2c9',market:'#ae6a65',bakery:'#c29450',cafe:'#798c62',office:'#7c7186' }[kind];
      r('#604f4c',2,3,20,16);
      r('#e1c7a4',3,7,16,12);
      r('#a9967f',19,7,2,12);
      r(color,2,3,20,7);
      r('#fff0c688',3,4,18,1);
      r('#46626a',5,12,5,4); r('#7ea1a1',6,12,2,2);
      r('#4f615d',13,12,4,7);
      if (civic) {
        r(kind === 'clinic' ? '#b55558' : '#f4dc83',10,4,4,5);
        r(kind === 'clinic' ? '#b55558' : '#f4dc83',9,5,6,3);
      } else {
        for (let i=3;i<20;i+=4) r('#fff2cc',i,9,2,2);
      }
      r('#d7ccb2',3,northDoor ? 1 : 20,17,2);
    }
  }

  let hit = [];
  return {
    draw(sim, selected, previous, alpha = 1) {
      ctx.drawImage(base,0,0);
      const clock = sim.time % 1440 / 60;
      if (clock < 6 || clock >= 19) {
        ctx.fillStyle = clock < 5 || clock >= 21 ? '#1d345882' : '#60495a42';
        ctx.fillRect(0,0,canvas.width,canvas.height);
      }
      const frame = Math.floor(performance.now()/150);
      const actors = [];
      for (const p of sim.people) {
        if (!p.path.length && ['home','work','school','clinic','detained'].includes(p.activity) && !(selected?.type === 'person' && selected.id === p.id)) continue;
        actors.push({ actor:p, dog:false });
      }
      for (const d of sim.dogs) actors.push({ actor:d, dog:true });
      hit = actors.map(({actor,dog}) => {
        const [targetX,targetY] = position(actor);
        const before = (dog ? previous?.dogs : previous?.people)?.get(actor.id);
        const x = before ? before[0] + (targetX-before[0])*alpha : targetX;
        const y = before ? before[1] + (targetY-before[1])*alpha : targetY;
        return { actor,dog,x:Math.round((x+.5)*TILE)+(actor.id%5-2)*2,y:Math.round((y+.5)*TILE)+actor.id%7-3 };
      }).sort((a,b) => a.y-b.y);
      const draw = (color,x,y,w,h) => {ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
      for (const {actor:p,dog,x,y} of hit) {
        const stride = p.path.length ? (frame+p.id)%2 : 0;
        if (dog) {
          draw('#3c493f70',x-4,y+2,10,2);
          draw('#875b3f',x-4,y-2,8,4);
          draw('#d4a077',x+2,y-4,4,4);
          draw('#674632',x-5,y-3,2,2);
          draw('#674632',x-3,y+1,2,2+stride);
          draw('#674632',x+2,y+1,2,3-stride);
        } else {
          const officer = sim.buildings[p.job]?.kind === 'police';
          const coat = officer ? '#365983' : COATS[p.coat];
          const short = p.age < 14 ? 2 : 0;
          draw('#222a3066',x-4,y+2,9,3);
          draw('#30333e',x-2,y,2,3+stride);
          draw('#30333e',x+1,y,2,4-stride);
          draw(coat,x-3,y-5+short,7,6-short);
          draw(SKIN[p.skin],x-2,y-9+short,5,4);
          draw(officer ? '#264263' : '#514140',x-3,y-10+short,7,2);
          if (officer) draw('#f0d177',x+1,y-4,1,2);
          if (p.activity === 'arrest') draw(frame%2 ? '#e97e79' : '#90bfcf',x-2,y-13,5,2);
        }
        if (selected?.type === (dog ? 'dog' : 'person') && selected.id === p.id) {
          ctx.strokeStyle = '#fff4c0';
          ctx.strokeRect(x-7,y-13,15,19);
        }
      }
      if (selected?.type === 'building') {
        const b = sim.buildings[selected.id];
        ctx.strokeStyle = '#fff4c0';
        ctx.strokeRect(b.x*TILE,b.y*TILE,TILE,TILE);
      }
    },
    pick(x,y) {
      const actor = hit.slice().reverse().find(a => Math.abs(a.x-x)<7 && y>=a.y-12 && y<=a.y+5);
      if (actor) return {type:actor.dog ? 'dog' : 'person',id:actor.actor.id};
      const b = buildings.get(Math.floor(y/TILE)*WIDTH+Math.floor(x/TILE));
      return b ? {type:'building',id:b.id} : null;
    },
  };
}
