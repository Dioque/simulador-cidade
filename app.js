import { SIZE, TYPES, newCity, neighbors, stats, build, advance } from './city.js';

const get = id => document.getElementById(id);
const canvas = get('map');
const ctx = canvas.getContext('2d');
const tile = canvas.width / SIZE;
const storageKey = 'pixelville-v1';
const number = new Intl.NumberFormat('pt-BR');
const money = value => '₡ ' + number.format(value);
let city = load();
let selected = 'road';
let cursor = -1;
let timer;
const buttons = {};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.cells?.length === SIZE * SIZE && Array.isArray(saved.cells) &&
        saved.cells.every(type => type === null || ['road','house','shop','park'].includes(type)) &&
        Number.isSafeInteger(saved.cash) && Number.isSafeInteger(saved.day) && saved.day >= 1) return saved;
  } catch {}
  return newCity();
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(city));
    get('save-state').textContent = 'Salvo neste navegador';
  } catch {
    get('save-state').textContent = 'Salvamento indisponível';
  }
}

function drawTile(type, index) {
  const x = index % SIZE * tile;
  const y = Math.floor(index / SIZE) * tile;
  const rect = (color, dx, dy, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  const grain = (index * 73 + 19) % 97;
  rect(['#50794d','#537d50','#4d764a','#517b4b'][grain % 4],0,0,24,24);
  rect('#486e45',0,23,24,1);
  rect('#486e45',23,0,1,24);
  rect('#618653',3 + grain % 13,4 + grain % 11,3,2);
  rect('#436b44',4 + grain % 9,18,4,1);
  if (!type) return;

  if (type === 'road') {
    const connected = neighbors(index).map(i => city.cells[i] === 'road');
    const segments = [[5,0,14,12],[12,5,12,14],[5,12,14,12],[0,5,12,14]];
    rect('#a4a28a',5,5,14,14);
    connected.forEach((on, side) => { if (on) rect('#a4a28a',...segments[side]); });
    rect('#46505b',7,7,10,10);
    const lanes = [[7,0,10,12],[12,7,12,10],[7,12,10,12],[0,7,12,10]];
    const stripes = [[11,2,2,4],[18,11,4,2],[11,18,2,4],[2,11,4,2]];
    connected.forEach((on, side) => { if (on) rect('#46505b',...lanes[side]); });
    connected.forEach((on, side) => { if (on) rect('#d1be81',...stripes[side]); });
  }

  if (type === 'house') {
    rect('#365939',4,18,18,4);
    rect('#d9bf92',5,10,14,10);
    rect('#a88a69',17,10,2,10);
    const roof = ['#bc634b','#5c89a6','#c58b4d'][grain % 3];
    rect(roof,8,4,8,3); rect(roof,6,7,12,3); rect(roof,3,10,18,3);
    rect('#5b4d45',3,12,18,1);
    rect('#49646d',7,15,3,3); rect('#785645',13,15,3,5);
    rect('#a69b78',13,20,3,3);
  }

  if (type === 'shop') {
    rect('#385642',3,18,19,4);
    rect('#dbc6a5',4,8,16,12);
    rect('#4c5361',3,4,18,5);
    rect('#7b8b96',5,4,13,2);
    rect('#f0cf88',3,9,18,4);
    for (let offset = 4; offset < 21; offset += 4) rect('#b65b53',offset,9,2,4);
    rect('#4f7583',6,14,5,4); rect('#4f7583',14,14,4,6);
    rect('#bac3a8',4,20,16,2);
  }

  if (type === 'park') {
    rect('#90a270',2,2,20,20);
    rect('#cab48a',10,2,4,20);
    for (const [tx, ty] of [[3,3],[14,9],[3,13]]) {
      rect('#5b4d38',tx + 3,ty + 6,2,4);
      rect('#326342',tx,ty + 2,8,5);
      rect('#478454',tx + 1,ty,6,5);
      rect('#6ca561',tx + 2,ty + 1,3,2);
    }
  }
}

function draw() {
  city.cells.forEach(drawTile);
  if (cursor >= 0) {
    ctx.strokeStyle = '#e9f9b6';
    ctx.lineWidth = 2;
    ctx.strokeRect(cursor % SIZE * tile + 1, Math.floor(cursor / SIZE) * tile + 1, tile - 2, tile - 2);
  }
  get('coords').textContent = cursor < 0 ? '' : `${cursor % SIZE + 1}, ${Math.floor(cursor / SIZE) + 1}`;
}

function refresh() {
  const { population, jobs, balance } = stats(city);
  get('day').textContent = `DIA ${city.day}`;
  get('cash').textContent = money(city.cash);
  get('population').textContent = number.format(population);
  get('jobs').textContent = number.format(jobs);
  get('balance').textContent = (balance > 0 ? '+' : '') + money(balance);
  get('play').textContent = timer ? 'Ⅱ Pausar' : '▶ Iniciar';
  draw();
  save();
}

function select(type) {
  selected = type;
  for (const [name, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', name === selected);
}

for (const [type, info] of Object.entries(TYPES)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool';
  button.innerHTML = `<span aria-hidden="true">${info.icon}</span><span><b>${info.name}</b><small>${money(info.cost)}</small></span><kbd aria-hidden="true">${info.key}</kbd>`;
  button.addEventListener('click', () => select(type));
  buttons[type] = button;
  get('tools').append(button);
}

function place() {
  const error = build(city, cursor, selected);
  get('status').textContent = error ?? (selected === 'erase' ? 'Terreno liberado.' : TYPES[selected].name + ' adicionado ao mapa.');
  if (!error) refresh();
}

function point(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) * SIZE / bounds.width);
  const y = Math.floor((event.clientY - bounds.top) * SIZE / bounds.height);
  cursor = x >= 0 && x < SIZE && y >= 0 && y < SIZE ? y * SIZE + x : -1;
  draw();
}

canvas.addEventListener('pointermove', point);
canvas.addEventListener('pointerleave', () => { cursor = -1; draw(); });
canvas.addEventListener('click', event => { point(event); place(); });
canvas.addEventListener('keydown', event => {
  const movement = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  if (!Object.hasOwn(movement, event.key) && event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (cursor < 0) {
    cursor = 0;
    draw();
  } else if (Object.hasOwn(movement, event.key)) {
    const next = neighbors(cursor)[movement[event.key]];
    if (next >= 0) cursor = next;
    draw();
  } else {
    place();
  }
});

document.addEventListener('keydown', event => {
  const type = Object.keys(TYPES).find(name => TYPES[name].key === event.key);
  if (type && !event.ctrlKey && !event.metaKey && !event.altKey) select(type);
});

function nextDay() { advance(city); refresh(); }

get('next').addEventListener('click', nextDay);
get('play').addEventListener('click', () => {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  } else {
    timer = setInterval(nextDay, 1500);
  }
  refresh();
});

get('reset').addEventListener('click', () => {
  if (!confirm('Substituir a cidade salva por uma nova?')) return;
  clearInterval(timer);
  timer = undefined;
  city = newCity();
  select('road');
  get('status').textContent = 'Nova cidade criada.';
  refresh();
});

select(selected);
refresh();
