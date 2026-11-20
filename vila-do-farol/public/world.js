// Coordenadas em tiles. A mesma geometria é usada pelo servidor e pelo desenho.
export const W = 36, H = 24;
const rect = (x,y,w,h) => ({x,y,w,h});
export const MAPS = {
  square:{
    name:'Praça do Farol', spawn:[18,15], color:'#6c9470',
    roads:[rect(0,14,36,3),rect(13,9,10,9),rect(17,5,3,17),rect(6,12,3,5),rect(26,9,3,8)],
    water:[rect(0,0,36,4),rect(0,0,5,24)],
    blocks:[rect(15,5,4,4),rect(7,7,5,4),rect(24,5,6,4),rect(9,18,5,4),rect(24,18,6,4),rect(30,12,2,1)],
    exit:[34,15,'road',2,15],
    npcs:[{id:'nara',name:'Nara',x:31,y:15},{id:'smith',name:'Ferreiro',x:26,y:9.5}],
  },
  road:{
    name:'Estrada das Carroças', spawn:[2,15], color:'#718860',
    roads:[rect(0,14,9,3),rect(7,6,3,11),rect(7,6,26,3),rect(30,6,3,12),rect(7,14,29,3)],
    water:[rect(17,9,4,5),rect(17,17,4,7)],
    blocks:[rect(4,4,3,5),rect(11,10,4,3),rect(10,18,4,3),rect(22,10,5,3),rect(23,19,4,3),rect(29,2,4,3)],
    exit:[34,15,'camp',2,15], back:[1,15,'square',32,15],
    herbs:[[12,7],[25,7]], mobs:[['wolf',25,15],['wolf',13,15]],
  },
  camp:{
    name:'Acampamento da Ponte', spawn:[2,15], color:'#898266',
    roads:[rect(0,14,19,3),rect(16,7,3,14),rect(16,8,14,3),rect(25,10,3,8)],
    water:[rect(0,0,36,3),rect(30,0,6,24)],
    blocks:[rect(7,6,5,4),rect(21,5,6,3),rect(8,18,6,4),rect(22,18,6,4),rect(4,6,3,4)],
    back:[1,15,'road',32,15], crate:[26,13], mobs:[['beetle',23,13],['beetle',16,11]],
  },
};
export const contains = (r,x,y) => x >= r.x && y >= r.y && x < r.x+r.w && y < r.y+r.h;
export function walkable(area,x,y) {
  const map = MAPS[area];
  if (!map || x < .4 || x > W-.4 || y < .4 || y > H-.4) return false;
  return [...map.water,...map.blocks].every(r => !contains(r,x-.23,y-.23) &&
    !contains(r,x+.23,y-.23) && !contains(r,x+.23,y+.23) && !contains(r,x-.23,y+.23));
}
