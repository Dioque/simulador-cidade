export const WIDTH = 32;
export const HEIGHT = 22;
export const TILE = 24;
const avenues = [3, 9, 15, 21, 26];
const streets = [3, 8, 13, 18];

export function createMap() {
  const terrain = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (_, x) => {
      const bank = y < 6 ? 29 : y < 15 ? 30 : 29;
      if (x >= bank || (y === 21 && x >= 23)) return 'water';
      if (x === bank - 1) return 'shore';
      if ((avenues.includes(x) && y >= 2 && y <= 19) ||
          (streets.includes(y) && x >= 2 && x <= 27)) return 'road';
      if ((x === 24 && y >= 9 && y <= 12) || (x === 6 && y >= 14 && y <= 17)) return 'path';
      if ((x >= 22 && x <= 25 && y >= 9 && y <= 12) ||
          (x >= 4 && x <= 8 && y >= 14 && y <= 17)) return 'park';
      return 'grass';
    }));
  const buildings = [];
  function add(x, y, kind, name) {
    const entry = [[x,y+1],[x,y-1],[x+1,y],[x-1,y]].find(([a,b]) => terrain[b]?.[a] === 'road');
    buildings.push({ id: buildings.length, x, y, kind, name, entry });
  }
  const homes = ['Acácias', 'Ipês', 'Andorinhas', 'Jasmim', 'Pitangas', 'Manacás'];
  let homeIndex = 0;
  for (const y of [2,4,7,9,12,14,17,19]) {
    for (const x of [5,7,11,13,17,19,23,25]) {
      if (terrain[y][x] !== 'grass' || (x * 13 + y * 7) % 11 > 8) continue;
      if (x === 13 && y === 7) add(x,y,'police','Delegacia Central');
      else if (x === 17 && y === 7) add(x,y,'clinic','Clínica do Vale');
      else if (x === 19 && y === 9) add(x,y,'market','Mercado Boa Safra');
      else if (x === 11 && y === 9) add(x,y,'bakery','Padaria Aurora');
      else if (x === 23 && y === 7) add(x,y,'cafe','Café da Margem');
      else if (x === 7 && y === 12) add(x,y,'market','Mercado do Ipê');
      else if (x === 19 && y === 14) add(x,y,'office','Oficinas da Estação');
      else if ((x+y) % 5 === 0) add(x,y,'office','Ateliê ' + homes[homeIndex++ % homes.length]);
      else add(x,y,'home','Casa ' + homes[homeIndex++ % homes.length] + ' ' + (x + y));
    }
  }
  // These public lots have street access in every generated city.
  for (const [x,y,kind,name] of [[13,7,'police','Delegacia Central'],[17,7,'clinic','Clínica do Vale'],
    [19,9,'market','Mercado Boa Safra'],[11,9,'bakery','Padaria Aurora'],[23,7,'cafe','Café da Margem'],[7,12,'market','Mercado do Ipê']]) {
    if (!buildings.some(b => b.x === x && b.y === y)) add(x,y,kind,name);
  }
  return { terrain, buildings };
}

export function route(terrain, start, end) {
  if (start[0] === end[0] && start[1] === end[1]) return [];
  const encode = (x,y) => y * WIDTH + x;
  const target = encode(...end);
  const source = encode(...start);
  const queue = [source];
  const previous = new Map([[source, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    const x = node % WIDTH, y = Math.floor(node / WIDTH);
    for (const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      const next = encode(a,b);
      if (!['road','path'].includes(terrain[b]?.[a]) || previous.has(next)) continue;
      previous.set(next,node);
      if (next === target) {
        const steps = [];
        for (let n = target; n !== source; n = previous.get(n)) steps.push([n % WIDTH,Math.floor(n / WIDTH)]);
        return steps.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}
