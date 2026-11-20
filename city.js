import { createMap, route } from './map.js';

export const STEP = 5;
export const LABELS = {
  home:'Em casa', work:'Trabalhando', shop:'Comprando comida', park:'Passeando',
  clinic:'Em atendimento', police:'Em patrulha', arrest:'Atendendo ocorrência',
  detained:'Em custódia', school:'Aprendendo em casa',
};
export const KINDS = {
  home:'Residência', police:'Delegacia', clinic:'Clínica', market:'Mercado',
  bakery:'Padaria', cafe:'Café', office:'Oficina',
};
const FIRST = ['Lia','Noah','Sofia','Bento','Maia','Davi','Iara','Caio','Alice','Ana','Luca','Nina','Ravi','Júlia','Leo','Cora','Bia','Tom','Liz','Íris','Rosa','Téo','Luna','Bruno'];
const LAST = ['Silva','Rocha','Lima','Costa','Melo','Alves','Santos','Dias','Reis','Ramos','Nunes','Oliveira'];
const DOGS = ['Pingo','Joca','Teca','Nuvem','Pipoca','Biscoito','Caju','Fubá'];
const SHOPS = ['market','bakery','cafe'];
const PARK = [[24,10],[24,12],[18,18],[6,15],[6,17],[26,11]];
const PATROL = [[23,8],[24,13],[18,18],[6,13],[7,18],[26,11]];
const DAY = 1440;

function random(city) {
  city.seed = (Math.imul(city.seed,1664525) + 1013904223) >>> 0;
  return city.seed / 4294967296;
}
function pick(city, array) {
  return array[Math.floor(random(city) * array.length)];
}
function event(city, type, title, detail) {
  city.events.unshift({ type, title, detail, time:city.time });
  city.events.length = Math.min(city.events.length, 50);
}
function resident(city, home, age, parent, forcedJob) {
  const id = city.nextId++;
  const workplace = city.buildings.filter(b => b.kind !== 'home' &&
    b.kind !== 'police' && b.kind !== 'clinic' && b.workers < (SHOPS.includes(b.kind) ? 5 : 7));
  const job = forcedJob ?? (age >= 18 && age < 70 && random(city) > 0.12 ? pick(city,workplace) : undefined);
  if (job) job.workers++;
  return {
    id, name: pick(city,FIRST) + ' ' + (parent ? parent.name.split(' ').at(-1) : pick(city,LAST)),
    home: home.id, job: job?.id ?? null, age, health: age >= 80 ? 65 + random(city)*32 : 92 + random(city)*8,
    money: age < 18 ? 0 : 16 + Math.floor(random(city)*135), food: 1 + random(city)*3,
    hunger: 12 + random(city)*42, energy: 75 + random(city)*25, skin: Math.floor(random(city)*4),
    coat: Math.floor(random(city)*8), shift: Math.floor(random(city)*13)*STEP,
    at: home.entry, path: [], progress:0, activity:'home', destination:null,
    sick: false, lastMeal: city.time, detainedUntil: 0, lastBirth: -DAY*5, lastPark: -DAY, lastCrime: -DAY,
  };
}

export function newCity(seed = 19476) {
  const { terrain, buildings } = createMap();
  const city = {
    version:1, time:420, seed:seed >>> 0, nextId:0, terrain,
    buildings:buildings.map(b => ({ ...b, stock:SHOPS.includes(b.kind) ? 50 : 0, reserve:SHOPS.includes(b.kind) ? 135 : 0, workers:0, sales:0 })),
    people:[], dogs:[], cases:[], events:[], treasury:2480, births:0, deaths:0,
    crime:0, solved:0, sales:0, dailySales:0,
  };
  const station = city.buildings.find(b => b.kind === 'police');
  const clinic = city.buildings.find(b => b.kind === 'clinic');
  const homes = city.buildings.filter(b => b.kind === 'home');
  for (let i = 0; i < 66; i++) {
    const age = i < 6 ? 22 + i * 4 : i < 17 ? 5 + i % 11 : i > 61 ? 80 + i % 9 : 20 + Math.floor(random(city)*48);
    const job = i < 3 ? station : i < 6 ? clinic : undefined;
    const person = resident(city,homes[i % homes.length],age,null,job);
    city.people.push(person);
    if (i % 8 === 0 && city.dogs.length < DOGS.length) {
      city.dogs.push({ id: city.dogs.length, name:DOGS[city.dogs.length], owner:person.id, at:person.at,
        path:[], progress:0, nextWalk:city.time + i * 5 });
    }
  }
  event(city,'city','A cidade acordou','O primeiro turno começa no Vale dos Ipês.');
  planCity(city);
  return city;
}

function send(city, actor, point) {
  if (actor.progress && actor.path.length) actor.at = actor.path[0];
  actor.path = route(city.terrain,actor.at,point);
  actor.progress = 0;
}

function go(city, person, activity, building, point) {
  const destination = building?.id ?? null;
  if (person.activity === activity && person.destination === destination) return;
  person.activity = activity;
  person.destination = destination;
  send(city,person,point ?? building.entry);
}

function move(actor, speed) {
  actor.progress += actor.path.length ? speed : 0;
  while (actor.progress >= 1 && actor.path.length) {
    actor.at = actor.path.shift();
    actor.progress -= 1;
  }
  if (!actor.path.length) actor.progress = 0;
}

function buy(city, person) {
  const shop = city.buildings[person.destination];
  if (shop.stock <= 0 || person.money < 7) return;
  const amount = Math.min(shop.stock,2,Math.floor(person.money / 7));
  shop.stock -= amount;
  shop.sales += amount;
  person.money -= amount * 7;
  person.food += amount;
  shop.reserve += amount * 5;
  city.treasury += amount * 2;
  city.sales += amount;
  city.dailySales += amount;
}

function reportCrime(city, person, shop) {
  person.lastCrime = city.time;
  city.crime++;
  const police = city.people.filter(p => city.buildings[p.job]?.kind === 'police' &&
    !city.cases.some(c => c.officer === p.id));
  const distance = p => Math.abs(p.at[0]-shop.entry[0]) + Math.abs(p.at[1]-shop.entry[1]);
  police.sort((a,b) => distance(a)-distance(b));
  const officer = police[0];
  if (officer) city.cases.push({ suspect:person.id, officer:officer.id, shop:shop.id, expires:city.time+85 });
  else {
    shop.stock--;
    person.food++;
  }
  event(city,'crime','Furto em ' + shop.name, officer ? officer.name + ' está a caminho.' : 'Polícia indisponível no momento.');
}

function patrolCases(city) {
  city.cases = city.cases.filter(incident => {
    const suspect = city.people.find(p => p.id === incident.suspect);
    const officer = city.people.find(p => p.id === incident.officer);
    const shop = city.buildings[incident.shop];
    if (!suspect) return false;
    if (officer && officer.activity === 'arrest' && !officer.path.length) {
      city.solved++;
      suspect.detainedUntil = city.time + 180;
      event(city,'police','Ocorrência atendida',officer.name + ' encaminhou ' + suspect.name + ' à delegacia.');
      return false;
    }
    if (!officer || city.time >= incident.expires) {
      if (shop.stock > 0) {
        shop.stock--;
        suspect.food++;
      }
      event(city,'crime','Ocorrência encerrada','A patrulha não chegou a tempo.');
      return false;
    }
    return true;
  });
}

function planCity(city) {
  const hour = city.time % DAY / 60;
  const clinic = city.buildings.find(b => b.kind === 'clinic');
  const station = city.buildings.find(b => b.kind === 'police');
  const shops = city.buildings.filter(b => SHOPS.includes(b.kind) && b.stock > 0);
  for (const person of city.people) {
    const home = city.buildings[person.home];
    const job = city.buildings[person.job];
    const incident = city.cases.find(c => c.officer === person.id || c.suspect === person.id);
    if (incident) {
      go(city,person,incident.officer === person.id ? 'arrest' : 'shop',city.buildings[incident.shop]);
    } else if (person.detainedUntil > city.time) {
      go(city,person,'detained',station);
    } else if (person.sick || person.health < 55) {
      go(city,person,'clinic',clinic);
    } else if (hour >= 22 || hour < 6 || person.energy < 12) {
      go(city,person,'home',home);
    } else if (person.age >= 18 && person.hunger > 40 && person.food < 1 && shops.length &&
        hour >= 7 && hour < 21 && (person.money >= 7 || person.hunger >= 76)) {
      const shop = person.activity === 'shop' && city.buildings[person.destination].stock > 0 ?
        city.buildings[person.destination] : pick(city,shops);
      go(city,person,'shop',shop);
    } else if (job && hour >= 7 + person.shift/60 && hour < 16 + person.shift/60) {
      if (job.kind === 'police') {
        if (person.activity !== 'police') go(city,person,'police',job,pick(city,PATROL));
        else if (!person.path.length) send(city,person,pick(city,PATROL));
      } else go(city,person,'work',job);
    } else if (hour >= 10 && hour < 21 && person.hunger < 66 && city.time - person.lastPark >= 180 &&
        (person.activity === 'park' || random(city) < 0.18)) {
      go(city,person,'park',null,pick(city,PARK));
      if (!person.path.length) person.lastPark = city.time;
    } else {
      go(city,person,person.age < 18 && hour >= 8 && hour < 14 ? 'school' : 'home',home);
    }
  }
}

function upkeep(city, person) {
  const settled = person.path.length === 0;
  const home = settled && ['home','school'].includes(person.activity);
  const hour = city.time % DAY / 60;
  const age = person.age;
  person.hunger = Math.min(100, person.hunger + (home && (hour < 6 || hour >= 22) ? .38 : .65));
  person.energy = Math.max(0,Math.min(100,person.energy + (home ? hour < 7 || hour >= 21 ? 2.6 : .65 : -.38)));
  if (person.hunger >= 43 && city.time - person.lastMeal >= 125) {
    if (person.food < 1 && age < 18) {
      const adult = city.people.find(p => p.home === person.home && p.age >= 18 && p.food >= 1);
      if (adult) { adult.food--; person.food++; }
    }
    const inCustody = settled && person.activity === 'detained';
    if (person.food < 1 && age < 18 && city.treasury >= 4) {
      city.treasury -= 4;
      person.food++;
    }
    if (person.food >= 1 || inCustody) {
      person.food = Math.max(0,person.food - 1);
      person.hunger = Math.max(0,person.hunger - 49);
      person.lastMeal = city.time;
    }
  }
  if (settled && person.activity === 'shop' && !city.cases.some(c => c.suspect === person.id)) {
    const shop = city.buildings[person.destination];
    if (person.food < 1) buy(city,person);
    if (shop.stock > 0 && person.money < 7 && person.hunger >= 76 && city.time - person.lastCrime >= DAY && random(city) < .25) {
      reportCrime(city,person,shop);
    }
  }
  if (person.hunger >= 85) person.health -= age >= 70 ? .21 : .1;
  if (person.sick) person.health -= .2;
  if (settled && person.activity === 'clinic') {
    const staffed = city.people.some(p => p.activity === 'work' && p.job === person.destination && !p.path.length);
    person.health += staffed ? 2.2 : .65;
    if (person.health >= 83 && person.sick) {
      person.sick = false;
      event(city,'health','Alta na clínica',person.name + ' se recuperou.');
    }
  } else if (!person.sick && home && person.hunger < 65) person.health += .14;
  person.health = Math.min(person.health,100);
  if (city.time % 60 === 0 && settled && ['work','police','arrest'].includes(person.activity)) {
    const publicJob = ['police','clinic'].includes(city.buildings[person.job]?.kind);
    if (!publicJob || city.treasury >= 5) {
      person.money += publicJob ? 5 : 8;
      city.treasury += publicJob ? -5 : 1;
    }
  }
}

function hire(city) {
  const vacancies = city.buildings.filter(b => b.kind !== 'home');
  for (const p of city.people) {
    const workplace = city.buildings[p.job];
    if (p.age >= 70 && workplace) {
      workplace.workers--;
      p.job = null;
    } else if (p.job === null && p.age >= 18 && p.age < 70 && random(city) < .2) {
      const choices = vacancies.filter(b => b.workers < (['police','clinic'].includes(b.kind) ? 3 : 5));
      if (choices.length) {
        const job = pick(city,choices);
        p.job = job.id;
        job.workers++;
      }

    }
  }
}

function morning(city) {
  hire(city);
  for (const p of city.people) {
    if (p.age >= 70 && city.treasury >= 14) {
      p.money += 14;
      city.treasury -= 14;
    }
  }
  let delivered = 0;
  for (const shop of city.buildings.filter(b => SHOPS.includes(b.kind))) {
    const delivery = Math.max(0,Math.min(48-shop.stock,30,Math.floor(shop.reserve / 3)));
    shop.stock += delivery;
    shop.reserve -= delivery * 3;
    delivered += delivery;
  }
  event(city,'city','Um novo dia no vale',city.dailySales + ' itens vendidos ontem · ' + delivered + ' repostos hoje.');
  city.dailySales = 0;
  for (const p of city.people) {
    if (!p.sick && random(city) < .04 + (p.age >= 70 ? .07 : 0)) {
      p.sick = true;
      p.health -= 16;
      event(city,'health','Atendimento solicitado',p.name + ' ficou doente e procurou a clínica.');
    }
  }
  if (city.people.length < 112) {
    const eligible = city.people.filter(p => p.age >= 21 && p.age < 42 && p.health > 80 &&
      p.money >= 30 && city.time - p.lastBirth >= DAY * 8 &&
      city.people.filter(h => h.home === p.home).length < 4);
    if (eligible.length && random(city) < .75) {
      const parent = pick(city,eligible);
      parent.lastBirth = city.time;
      parent.money -= 10;
      const baby = resident(city,city.buildings[parent.home],0,parent);
      city.people.push(baby);
      city.births++;
      event(city,'life','Nasceu ' + baby.name,'A família recebeu um novo morador.');
    }
  }
}

function updateDogs(city) {
  for (const dog of city.dogs) {
    move(dog,.54);
    if (dog.path.length || city.time < dog.nextWalk) continue;
    const owner = city.people.find(p => p.id === dog.owner);
    const hour = city.time % DAY / 60;
    const exploring = !owner || (hour > 7 && hour < 20 &&
      (owner.activity === 'park' || random(city) < .4));
    const point = exploring ? pick(city,PARK) : owner.at;
    send(city,dog,point);
    dog.nextWalk = city.time + 30 + Math.floor(random(city)*50);
  }
}

export function advance(city) {
  city.time += STEP;
  if (city.time % DAY === 360) morning(city);
  const anniversary = city.time % (DAY * 24) === 0;
  for (const person of city.people) {
    move(person,person.activity === 'arrest' ? 1.1 : .59 + person.shift / 360);
    upkeep(city,person);
    if (anniversary) person.age++;
    if (city.time % DAY === 0 && person.age >= 78 && random(city) < (person.age - 76) * .003) person.health = 0;
  }
  city.people = city.people.filter(person => {
    if (person.health > 0) return true;
    city.deaths++;
    if (person.job !== null) city.buildings[person.job].workers--;
    const cause = person.age >= 78 ? 'velhice ou fragilidade' : person.sick ? 'complicações de saúde' : 'falta de alimentação';
    event(city,'death','Faleceu ' + person.name,'Aos ' + person.age + ' anos, por ' + cause + '.');
    return false;
  });
  patrolCases(city);
  planCity(city);
  updateDogs(city);
}

export function stats(city) {
  return {
    residents:city.people.length,
    employed:city.people.filter(p => p.job !== null).length,
    treasury:city.treasury,
    active:city.cases.length,
    pets:city.dogs.length,
  };
}

export function position(actor) {
  const next = actor.path[0] ?? actor.at;
  return actor.at.map((value,i) => value + (next[i]-value) * actor.progress);
}
