export const ITEMS = {
  short:{name:'Espada curta',bonus:0}, forged:{name:'Lâmina do Farol',bonus:8},
  iron:{name:'Ferro recuperado',bonus:0}, herb:{name:'Erva de cura',bonus:0},
};
export const RECIPE = { item:'forged', iron:3 };
export const REWARDS = { first:{xp:45,iron:3}, repeat:{xp:20,iron:1} };
export const ACTIONS = {
  attack:{damage:17,cooldown:550,reach:1.75},
  dash:{damage:23,cooldown:3500,reach:1.8},
  guard:{cooldown:4500,duration:1050},
};
export const MOBS = {
  wolf:{name:'Lobo da estrada',hp:54,speed:2.6,damage:14,windup:600,recover:750,trigger:3.3},
  beetle:{name:'Besouro de casco',hp:82,speed:1.55,damage:23,windup:900,recover:1500,trigger:1.8},
};

export type State = {
  area:string; x:number; y:number; hp:number; xp:number; appearance:number;
  inventory:Record<string,number>; weapon:'short'|'forged'; completed:number;
  quest:'none'|'accepted'|'collected'; expedition:string|null;
  cooldowns?:Record<string,number>; herbReadyAt?:number;
};
export const level = (xp:number) => 1 + Math.floor(xp/45);
export const maxHp = (xp:number) => Math.min(150,100+(level(xp)-1)*10);
export const damage = (p:State) => ACTIONS.attack.damage + ITEMS[p.weapon].bonus + Math.min(10,level(p.xp)-1)*2;
export function initial(appearance:number):State {
  return {area:'square',x:18,y:15,hp:100,xp:0,appearance,inventory:{short:1},
    weapon:'short',completed:0,quest:'none',expedition:null};
}
