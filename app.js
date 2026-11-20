import { advance, KINDS, LABELS, newCity, position, stats } from './city.js';
import { createRenderer } from './render.js';

const get = id => document.getElementById(id);
const canvas = get('map');
const storageKey = 'pixelville-observatorio-v1';
const number = new Intl.NumberFormat('pt-BR');
const money = value => '₡ ' + number.format(value);
const speedButtons = [...get('speeds').querySelectorAll('button')];
const clockText = time => [Math.floor(time % 1440 / 60), time % 60]
  .map(n => String(n).padStart(2,'0')).join(':');
const dayNumber = time => Math.floor(time / 1440) + 1;

let city = load();
let renderer = createRenderer(canvas,city);
let selected = null;
let speed = 1;
let paused = false;
let lastEvent;
let roster;
let lastDetails = '';
let tick = 0;
let lastPositions;
let savedAt = 0;
let previous = performance.now();

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value?.version === 1 && value.terrain?.length === 22 && value.buildings?.length &&
        Array.isArray(value.people) && Array.isArray(value.dogs) && Number.isFinite(value.time)) return value;
  } catch {}
  return newCity();
}

function save() {
  try {
    localStorage.setItem(storageKey,JSON.stringify(city));
    savedAt = city.time;
    get('save').textContent = 'Salvo neste navegador';
  } catch {
    get('save').textContent = 'Salvamento indisponível';
  }
}

function node(tag,text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function updateRoster() {
  const ids = city.people.map(p => p.id).join(',');
  if (ids === roster) return;
  roster = ids;
  const people = node('optgroup');
  people.label = 'Moradores';
  for (const p of city.people.slice().sort((a,b) => a.name.localeCompare(b.name,'pt-BR'))) {
    people.append(new Option(p.name,'person:' + p.id));
  }
  const pets = node('optgroup');
  pets.label = 'Cães';
  for (const dog of city.dogs) pets.append(new Option(dog.name,'dog:' + dog.id));
  get('find').replaceChildren(new Option('Escolher morador ou cão',''),people,pets);
}

function updateDetails() {
  let title, subtitle, rows = [];
  if (selected?.type === 'person') {
    const p = city.people.find(person => person.id === selected.id);
    if (p) {
      title = p.name;
      subtitle = p.path.length ? 'A caminho · ' + LABELS[p.activity] : LABELS[p.activity];
      rows = [['Idade',p.age + ' anos'],['Saúde',Math.ceil(p.health) + '%'],
        ['Fome',Math.round(p.hunger) + '%'],['Dinheiro',money(p.money)],
        ['Trabalho',city.buildings[p.job]?.name ?? '—']];
    } else {
      title = 'Morador falecido';
      subtitle = 'O diário registra o falecimento.';
    }
  } else if (selected?.type === 'dog') {
    const dog = city.dogs.find(d => d.id === selected.id);
    title = dog.name;
    subtitle = dog.path.length ? 'Cão · Passeando' : 'Cão · Descansando';
    rows = [['Tutor',city.people.find(p => p.id === dog.owner)?.name ?? 'Sem tutor']];
  } else if (selected?.type === 'building') {
    const b = city.buildings[selected.id];
    title = b.name;
    subtitle = KINDS[b.kind];
    if (b.kind === 'home') rows = [['Moradores',city.people.filter(p => p.home === b.id).length]];
    else rows = [['Trabalhadores',b.workers]];
    if (['market','bakery','cafe'].includes(b.kind)) rows.push(['Estoque',b.stock],['Itens vendidos',b.sales],['Caixa',money(b.reserve)]);
  }
  get('find').value = selected && selected.type !== 'building' ? selected.type + ':' + selected.id : '';
  get('clear').hidden = !selected;
  const signature = JSON.stringify([title,subtitle,rows]);
  if (signature === lastDetails) return;
  lastDetails = signature;
  const el = get('details');
  el.replaceChildren();
  if (!title) {
    el.append(node('p','Selecione um morador para acompanhar sua rotina ou escolha um prédio no mapa.'));
    return;
  }
  el.append(node('strong',title),node('p',subtitle));
  const list = node('dl');
  for (const [key,value] of rows) list.append(node('dt',key),node('dd',String(value)));
  if (rows.length) el.append(list);
}

function updateFeed() {
  if (lastEvent === city.events[0]) return;
  lastEvent = city.events[0];
  const feed = city.events.map(event => {
    const item = node('li');
    item.dataset.type = event.type;
    item.append(node('strong',event.title),node('p',event.detail),
      node('time','Dia ' + dayNumber(event.time) + ' · ' + clockText(event.time)));
    return item;
  });
  get('feed').replaceChildren(...feed);
}

function updatePanel() {
  const s = stats(city);
  for (const id of ['residents','employed','active']) get(id).textContent = number.format(s[id]);
  get('treasury').textContent = money(s.treasury);
  get('day').textContent = 'Dia ' + dayNumber(city.time);
  get('hour').textContent = clockText(city.time);
  const hour = city.time % 1440 / 60;
  get('period').textContent = hour < 6 ? 'Madrugada' : hour < 12 ? 'Manhã' : hour < 18 ? 'Tarde' : 'Noite';
  get('summary').textContent = `${s.pets} cães · ${city.births} nascimentos · ${city.deaths} mortes · ${city.solved}/${city.crime} furtos atendidos · ${city.sales} itens vendidos`;
  updateRoster();
  updateDetails();
  updateFeed();
}

function controls() {
  get('pause').classList.toggle('play',paused);
  get('pause').setAttribute('aria-label',paused ? 'Retomar' : 'Pausar');
  get('running').classList.toggle('paused',paused);
  get('running').lastElementChild.textContent = paused ? 'Simulação pausada' : 'Simulação ativa';
  for (const button of speedButtons) button.setAttribute('aria-pressed',Number(button.dataset.speed) === speed);
}

get('pause').addEventListener('click',() => { paused = !paused; controls(); save(); });
for (const button of speedButtons) button.addEventListener('click',() => { speed = Number(button.dataset.speed); controls(); });
get('clear').addEventListener('click',() => { selected = null; updateDetails(); });
get('find').addEventListener('change',event => {
  const [type,id] = event.target.value.split(':');
  selected = type ? {type,id:Number(id)} : null;
  updateDetails();
});
canvas.addEventListener('click',event => {
  const r = canvas.getBoundingClientRect();
  selected = renderer.pick((event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height);
  updateDetails();
});
get('reset').addEventListener('click',() => {
  if (!confirm('Reiniciar a cidade e substituir o progresso salvo?')) return;
  city = newCity();
  renderer = createRenderer(canvas,city);
  selected = null;
  tick = 0;
  lastPositions = undefined;
  updatePanel();
  renderer.draw(city,selected);
  save();
});
addEventListener('pagehide',save);
document.addEventListener('visibilitychange',() => { if (document.hidden) save(); });

const interval = 165;
let lastDraw = 0;
function frame(now) {
  const elapsed = Math.min(now-previous,250);
  previous = now;
  if (!paused) tick += elapsed*speed;
  if (tick >= interval) {
    while (tick >= interval) {
      lastPositions = {
        people:new Map(city.people.map(p => [p.id,position(p)])),
        dogs:new Map(city.dogs.map(d => [d.id,position(d)])),
      };
      advance(city);
      tick -= interval;
    }
    updatePanel();
    if (city.time - savedAt >= 30) save();
  }
  if (now - lastDraw >= 1000/30) {
    renderer.draw(city,selected,lastPositions,tick / interval);
    lastDraw = now;
  }
  requestAnimationFrame(frame);
}

controls();
updatePanel();
renderer.draw(city,selected);
save();
requestAnimationFrame(frame);
