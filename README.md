# Pixelville · Vale dos Ipês

Uma cidade autônoma em pixel art, com moradores que vão ao trabalho, fazem compras, descansam, visitam parques e procuram atendimento. O Canvas 2D desenha a cidade e os personagens com sprites próprios. O projeto usa HTML, CSS e JavaScript e dispensa instalação de pacotes.

## Rodar na sua máquina

Na pasta extraída do projeto, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

No Windows, se necessário, use `py -m http.server 8000 --bind 127.0.0.1`. Abra http://127.0.0.1:8000. A cidade começa às 07:00 e avança automaticamente enquanto a aba está ativa. Em velocidade normal, um dia leva cerca de 48 segundos. Use a pausa e as opções 2× ou 5× para observar o mapa ou acompanhar vários dias.

Clique em um prédio, morador ou cão para abrir o inspetor. O seletor do inspetor também encontra moradores que estão dentro dos prédios. O diário registra nascimentos, falecimentos, atendimentos da clínica, furtos, respostas da polícia e entregas do comércio. O navegador salva o progresso por endereço. A opção **Reiniciar cidade** começa uma nova partida, com confirmação.

## Regras da cidade

- Moradores têm idade, saúde, fome, energia, comida e dinheiro. Eles ganham salário quando estão trabalhando e usam parte dele para comprar alimentos. Crianças dependem da família ou da assistência municipal. Um ano de idade corresponde a 24 dias simulados.
- Lojas têm estoque, vendas e caixa para reposição. Impostos sobre compras e trabalho financiam assistência, aposentadorias e salários de policiais e profissionais da clínica.
- Moradores podem adoecer, se recuperar e falecer. Novos moradores nascem em famílias com condições para recebê-los. Vagas aparecem com falecimentos e aposentadorias e são preenchidas durante o ciclo diário.
- Fome e falta de dinheiro aumentam a probabilidade de furto. Um agente disponível é despachado, percorre as ruas e leva o suspeito à delegacia se chegar a tempo. Cães passeiam pelos bairros e parques e podem voltar para perto dos tutores.
- A cidade é um modelo de jogo simplificado. O mapa e as condições iniciais são fixos por padrão. Não há modo de construção nesta versão.

## Reaproveitar a simulação

`city.js` contém o relógio, os moradores e as regras econômicas e sociais. `map.js` contém os terrenos, prédios e rotas. Ambos independem do DOM, de Canvas e de armazenamento. `render.js` desenha a cidade no navegador. `app.js` conecta os controles, o relógio real e o salvamento.

```js
import { newCity, advance, stats, position, STEP } from './city.js';

const city = newCity(19476); // mesma semente, mesma simulação
advance(city); // STEP minutos simulados
console.log(STEP, stats(city));
console.log(position(city.people[0])); // coordenadas em células, com fração durante o trajeto
```

O estado é serializável em JSON. Em outro jogo, use seu próprio relógio para chamar `advance`, desenhe os personagens com `position` e leia `city.events` para integrar os acontecimentos.
