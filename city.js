export const SIZE = 20;
export const TYPES = {
  road: { name: 'Estrada', cost: 10, key: '1', icon: '▦' },
  house: { name: 'Residência', cost: 50, key: '2', icon: '⌂' },
  shop: { name: 'Comércio', cost: 80, key: '3', icon: '▣' },
  park: { name: 'Parque', cost: 30, key: '4', icon: '♣' },
  erase: { name: 'Demolir', cost: 5, key: '5', icon: '×' },
};

export function newCity() {
  const cells = Array(SIZE * SIZE).fill(null);
  const put = (x, y, type) => { cells[y * SIZE + x] = type; };
  for (let x = 4; x <= 15; x++) put(x, 10, 'road');
  for (let y = 5; y <= 15; y++) put(10, y, 'road');
  for (const [x, y] of [[6,9],[7,9],[8,11],[9,7],[11,8],[13,11],[14,9]]) put(x,y,'house');
  for (const [x, y] of [[11,6],[12,9],[6,11]]) put(x,y,'shop');
  for (const [x, y] of [[9,12],[11,12],[15,9]]) put(x,y,'park');
  return { cells, cash: 1200, day: 1 };
}

export function neighbors(index) {
  const x = index % SIZE;
  const y = Math.floor(index / SIZE);
  return [y > 0 ? index - SIZE : -1, x < SIZE - 1 ? index + 1 : -1,
    y < SIZE - 1 ? index + SIZE : -1, x > 0 ? index - 1 : -1];
}

export function stats(city) {
  let population = 0, jobs = 0, parks = 0, roads = 0;
  city.cells.forEach((type, index) => {
    if (type === 'park') parks++;
    if (type === 'road') roads++;
    if (!neighbors(index).some(i => city.cells[i] === 'road')) return;
    if (type === 'house') population += 4;
    if (type === 'shop') jobs += 4;
  });
  return { population, jobs, parks, balance: population + Math.min(population, jobs) * 2 - Math.ceil(roads / 3) - parks };
}

export function build(city, index, type) {
  if (!Number.isInteger(index) || index < 0 || index >= city.cells.length || !Object.hasOwn(TYPES, type)) return 'Escolha um terreno do mapa.';
  const cost = TYPES[type].cost;
  if (type === 'erase' ? !city.cells[index] : city.cells[index]) {
    return type === 'erase' ? 'O terreno já está vazio.' : 'Este terreno já está ocupado.';
  }
  if (city.cash < cost) return 'Saldo insuficiente.';
  city.cells[index] = type === 'erase' ? null : type;
  city.cash -= cost;
  return null;
}

export function advance(city) {
  city.cash += stats(city).balance;
  city.day++;
}
