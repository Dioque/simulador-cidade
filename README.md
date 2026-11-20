# Pixelville

Simulador de cidade em pixel art com mapa 20 × 20, construções, orçamento e avanço de dias. Os sprites são desenhados no Canvas 2D. O jogo usa HTML, CSS e JavaScript e dispensa instalação de pacotes.

## Executar localmente

Na pasta do projeto, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra http://127.0.0.1:8000 no navegador. O tabuleiro começa com um bairro de exemplo. Use as teclas 1 a 5 para escolher uma ferramenta. Com o mapa em foco, as setas selecionam um terreno e Enter aplica a ferramenta. O progresso é salvo no navegador.

## Reaproveitar em outro jogo

Importe `city.js` como módulo ES. O módulo é independente do Canvas, do navegador e do armazenamento da interface. O jogo que o integra define quando avançar os dias e como desenhar ou salvar o estado.

```js
import { SIZE, newCity, build, advance, stats } from './city.js';

const city = newCity();
const x = 4;
const y = 9;
const error = build(city, y * SIZE + x, 'house');

if (error === null) {
  advance(city);
  console.log(stats(city));
}
```

O estado tem `cells` (terrenos em ordem de linha), `cash` (tesouro) e `day` (dia atual). Os tipos aceitos são `road`, `house`, `shop`, `park` e `erase`. Residências e comércios só geram moradores e empregos quando têm uma estrada imediatamente ao lado. A receita diária vem dos moradores e dos empregos preenchidos, com custos de manutenção para estradas e parques.
