# Vila do Farol

RPG online cooperativo de navegador. A primeira aventura liga a Praça do Farol, a Estrada das Carroças e o Acampamento da Ponte. Contas, personagens e a oficina pertencem ao mesmo servidor. Uma expedição pode ser feita a sós ou em grupo de até quatro aventureiros.

## Executar com Docker Compose

Instale Docker com o plugin Compose. Execute na pasta `vila-do-farol`:

```sh
cp .env.example .env
docker compose up --build -d
docker compose logs -f game
```

No PowerShell, use `Copy-Item .env.example .env`. Assim que o servidor escutar, abra **http://localhost:3000** em duas janelas de perfis separados, por exemplo uma normal e outra anônima. Use exatamente a URL configurada em `PUBLIC_ORIGIN`. O banco fica na rede interna do Compose. Para parar, use `docker compose stop`. O volume `dados` conserva a partida.

### Desenvolvimento sem contêiner de aplicação

Use Node.js 24+, npm e um PostgreSQL disponível. Em um shell POSIX, substitua o endereço abaixo pelos dados do seu banco local:

```sh
npm ci
export DATABASE_URL=postgresql://farol:senha_local@localhost:5432/farol
npm run migrate
npm start
```

A configuração do Node é lida do ambiente. Para desenvolvimento com um arquivo próprio, também é possível rodar `node --env-file=.env.local src/server.ts` depois de executar as migrações com a mesma configuração.

## Roteiro para duas contas

1. Crie duas contas e dois personagens com aparências diferentes. Na praça, mova um com WASD ou setas. O outro deve vê-lo. Escreva no chat local e verifique que digitar WASD no campo não move o personagem. Termine de digitar e clique no mapa ou em uma região fora do campo para voltar ao teclado de jogo.
2. Convide a outra pessoa pelo painel **Grupo** e aceite na outra janela. Confirme o nome e a vida do companheiro. Caminhem para leste, até Nara, perto da carroça quebrada. Cada jogador pressiona **E** e aceita a expedição.
3. Atravessem o portão leste. Usem o caminho de cima para colher ervas com **E**, ou a ponte de baixo para encarar os lobos. O símbolo **!** e a linha pontilhada antecipam o salto. Desviem para o lado. **Espaço** usa a espada, **1** usa a investida e **2** ativa a guarda. Aponte com o mouse ou mire andando na direção do inimigo.
4. Entrem no acampamento pelo portão leste da estrada. Sigam a trilha até a caixa. O besouro avisa a área de ataque com um círculo e fica vulnerável após golpear. Enquanto um ocupa a criatura, o outro usa **E** junto à caixa. Ambos precisam estar no acampamento, no grupo e com a missão aceita no momento da coleta. Convite aceito depois da coleta não concede crédito.
5. Recarregue a aba de um participante. A caixa ainda consta no objetivo. Voltem pela rota inversa e pressionem **E** perto de Nara. A primeira entrega dá **45 XP e 3 ferros por elegível**, mesmo se o companheiro estiver desconectado. A vila recebe **uma** caixa por expedição. Pressionar **E** novamente não duplica a recompensa.
6. Aceitem uma nova expedição e repitam, ou testem com dois grupos. Cada entrega de repetição dá **20 XP e 1 ferro por elegível**. A oficina abre com duas caixas por padrão, ajustável por `WORKSHOP_GOAL`. Ao mudar a meta, reinicie o servidor e faça uma nova entrega para aplicar o limiar. Uma oficina aberta permanece aberta.
7. Falem com o ferreiro ao norte da via principal e fabriquem a Lâmina do Farol com três ferros. Pressionem **I** para equipá-la e comparem o dano. Reiniciem o serviço com `docker compose restart game` e observem a oficina aberta e o inventário restaurado.
8. Para verificar isolamento, atravesse um portão com só uma conta e confirme que o chat da área anterior deixa de aparecer. Sair encerra a sessão. Um novo login da mesma conta encerra o acesso anterior.

## Hospedar para os amigos

Escolha um domínio, faça o DNS apontar para a máquina e instale Caddy no host. Use [Caddyfile.example](Caddyfile.example) como base e substitua o domínio. Configure o Caddy para atender nas portas 80 e 443 e encaminhar para a porta local do Compose. O Caddy termina TLS e repassa conexões WebSocket automaticamente.

No `.env` da máquina, defina `PUBLIC_ORIGIN=https://seu-dominio`, `NODE_ENV=production`, `TRUST_PROXY=1` e um `POSTGRES_PASSWORD` aleatório hexadecimal (por exemplo, gere com `openssl rand -hex 24`). Proteja o arquivo com permissão restrita e mantenha somente o proxy acessível pela Internet. Use `TRUST_PROXY=1` somente quando o app estiver atrás do proxy configurado para substituir `X-Real-IP`. Para manter a partida, preserve a senha e o volume do banco. Este desenho usa um processo do jogo por banco e dispensa Redis e servidores separados de assets.

### Backup e restauração

Gere um backup do PostgreSQL e guarde-o fora da máquina, com acesso restrito. O arquivo contém contas e hashes de senha.

```sh
docker compose exec -T db pg_dump -U farol -d farol -Fc > farol.backup
```

Para restaurar, escolha uma instalação com banco vazio. Pare o jogo e restaure antes de iniciar:

```sh
docker compose stop game
docker compose up -d --wait db
docker compose exec -T db pg_restore --exit-on-error -U farol -d farol < farol.backup
docker compose up -d game
```

Valide a restauração em ambiente separado, incluindo login, inventário e progresso da oficina.

## Implementação e segurança

- Cliente Canvas 2D com sprites procedurais de 16 px e áudio sintetizado. Os desenhos e sons foram criados no projeto e não usam assets externos. Canvas nativo mantém o download inicial e o número de dependências pequenos.
- Regras no servidor TypeScript, executado pelo Node 24. WebSocket envia intenções e recebe estados. O navegador interpola visualmente o movimento. O servidor aplica colisão, alcance, recarga, dano, posse de itens e transições de área.
- PostgreSQL mantém migrações, contas, sessões, personagens, expedições e oficina. A coleta congela os elegíveis, e a entrega, itens, XP e contribuição são gravados numa transação. O mundo atualiza posição e combate periodicamente, além de salvar na desconexão. Uma queda abrupta pode perder alguns segundos de posição, vida ou XP de combate. Inventário, expedições e entregas confirmados são persistidos antes da confirmação.
- Após reconectar, o jogador retoma o personagem e pode concluir a missão. Grupos, convites e inimigos em combate são transitórios. Uma segunda conexão da mesma conta assume a sessão ativa, e um novo login revoga o token anterior. A sessão expira em 12 horas.
- Argon2id, cookies de sessão HttpOnly e SameSite, Secure em HTTPS, tokens aleatórios armazenados como hashes, exigência de origem nas ações HTTP e no WebSocket, limites de payload e frequência, consultas parametrizadas e chat renderizado como texto. O servidor limita o número de conexões, mas esse teto não representa uma capacidade medida.
- Antes de abrir cadastro público, valide TLS e a regra de proxy no host real, restaure um backup, configure observabilidade e proteção contra abuso no proxy e revise moderação, recuperação de conta, capacidade e latência. A meta de 15 a 25 minutos de aventura precisa ser validada com pessoas jogando.

## Testes automatizados

```sh
npm test
TEST_DATABASE_URL=postgresql://farol:senha_local@localhost:5432/farol npm test
```

O primeiro comando valida a geometria. O segundo também usa um schema descartável no banco de teste para validar elegibilidade e reconexão, concorrência de entregas, oficina persistente, combate fora de alcance e fabricação sem material. Configure `TEST_DATABASE_URL` para um banco sob seu controle com permissão para criar schemas.
