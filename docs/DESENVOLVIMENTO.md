# Desenvolvimento

## Arquivos do projeto

| Caminho | Conteúdo |
| --- | --- |
| [src/index.html](../src/index.html) | Menus, seleção de piloto, HUD, comandos de toque e diálogos. |
| [src/game.css](../src/game.css) | Aparência da interface, disposição em celular e estados visuais. |
| [src/game.js](../src/game.js) | Simulação da corrida, controles, bots, som sintetizado via Web Audio, renderização e modelos. |
| [src/art](../src/art) | `capa.png` é a ilustração do menu. `baia.png` é o panorama usado no horizonte e nos reflexos. |
| [scripts/build.cjs](../scripts/build.cjs) | Empacota as duas imagens, o CSS e o JavaScript no HTML da raiz. |
| [tests](../tests) | Testes de simulação e verificação do jogo no Chrome ou Chromium. |
| [docs/imagens](imagens) | Capturas de referência para comparar alterações na interface e na direção de arte. |

Edite os arquivos em `src/`. Durante o desenvolvimento, sirva essa pasta por HTTP para que o WebGL possa carregar a textura da baía. Antes de enviar uma alteração, execute `node scripts/build.cjs` e inclua o `index.html` atualizado no commit. Esse arquivo também é a versão portátil para jogar offline.

## Como a corrida funciona

A pista avança no eixo **Z**, o movimento lateral usa **X** e a altura usa **Y**. A largada, a chegada em `COURSE_END`, os checkpoints e as plataformas de `course` compartilham esse sistema de coordenadas. `frame` acumula o tempo entre imagens e chama `step` em incrementos de 1/120 de segundo. `setMode` controla menu, seleção de piloto, contagem regressiva, corrida, pausa e resultado.

| Alteração | Por onde começar em game.js |
| --- | --- |
| Abrir uma bifurcação ou mudar um vão | Edite `course` e `gaps`. `floor` consulta as plataformas. Confira a trajetória dos bots em `botInput` e os dois checkpoints de retorno em `checkpoints`. |
| Ajustar salto, mergulho ou impacto | `playerInput` e `botInput` alimentam `moveRacer`. `knock` aplica o impacto e `respawn` recoloca o piloto no último checkpoint. |
| Mover um obstáculo | `bumpers` descreve os caranguejos e `spinners`, as hélices. `updateObstacles` atualiza posição e ângulo. `drawObstacles` desenha e `collideObstacles` calcula o contato. Ao mudar alcance ou largura, confira o modelo e a colisão. |
| Alterar um trampolim | `springs` define posição, impulso e alvo. `moveRacer` inicia o voo e registra `firedAt`, usado por `drawSpring` para animar a mola. O teste do Kraken cobre as quatro aterrissagens e os anéis. |
| Ajustar um golpe do Kraken | `attacks` posiciona o ataque. `tentacleEnd` é consultada pela animação e pela colisão. |
| Modelar ou animar um piloto | `sculpt` constrói malhas a partir de seções e `assemble` agrupa peças. `crewHead` cria as cabeças dos animais e `drawRacer` posa braços, pernas, tronco e acessórios. `previewPilot` permite inspecionar a pose no menu Pilotos. |
| Ajustar o visual ou o desempenho | `vertexSource` e `fragmentSource` contêm os shaders. `bakeStatic` agrupa cenário e pista, `render` desenha sombras, reflexos e a cena final. O seletor de qualidade fica no menu de pausa. |

Recorde, som, qualidade gráfica e piloto escolhido são preferências locais do navegador. A corrida funciona em uma única aba.

## Salas online

`src/rooms.js` cria um canal com identificador aleatório de 128 bits no relay WSS. O convite contém o canal e o identificador que o relay atribuiu ao anfitrião. A conexão só é aberta quando a pessoa cria ou entra em uma sala. O relay transporta os apelidos, comandos, posições e eventos da partida. O site e o PWA continuam hospedados no GitHub Pages. [Serviço Itty Sockets](https://ittysockets.com/docs/getting-started)

A simulação de `src/game.js` roda no navegador do anfitrião. Os convidados enviam direção, salto e mergulho. O anfitrião calcula impactos, checkpoints e chegadas, e transmite o estado até 20 vezes por segundo. Os convidados interpolam as posições para a câmera e as animações. Cada conexão controla apenas o piloto atribuído a ela. O host precisa manter o jogo em primeiro plano, especialmente no celular.

O teste abaixo usa dois perfis isolados do Chrome e um convite novo no relay real. Ele verifica que cada jogador vê o outro avançar, que o convidado pode sair e voltar à sala para a revanche e que a saída do anfitrião encerra a sessão. Para testar localmente, sirva a raiz por HTTP e substitua a URL por `http://localhost:8000/`.

```sh
node tests/salas.cjs https://alexandremocmg.github.io/turbo_mare/
```

## Validação

### Aplicativo instalável e GitHub Pages

O Pages publica a raiz de `main`. O manifesto e os ícones estão em `manifest.webmanifest` e `icons/`. A interface de instalação fica em `src/install.js`. O build gera `index.html` e `sw.js`, com uma versão do cache calculada a partir do jogo, do manifesto, dos ícones e do código do service worker. Inclua os dois arquivos gerados no commit. Uma atualização entra em uso após o fechamento das abas e janelas da versão anterior.

Para testar instalação e cache localmente, sirva **a raiz do repositório** em `localhost` depois de gerar os arquivos. O teste abaixo verifica o manifesto, os critérios de instalação do Chromium e a largada de uma corrida com a rede desativada. Ele aceita também o endereço HTTPS publicado.

```sh
node tests/navegador.cjs --pwa http://localhost:8000/
```

### Simulação e controles

Execute os comandos a partir da raiz.

```sh
node scripts/build.cjs --check
node --test tests/corrida.test.cjs tests/kraken.test.cjs
node tests/navegador.cjs
```

Os dois primeiros comandos precisam de Node.js 24. O último também requer Google Chrome ou Chromium. Se estiver em um local personalizado, indique o executável na variável `CHROME_PATH`. O teste abre uma janela oculta com perfil temporário e grava PNGs em `artifacts/`.

| Verificação | O que cobre |
| --- | --- |
| `build.cjs --check` | Confere se o HTML distribuído corresponde aos fontes e às duas imagens. |
| `corrida.test.cjs` | Largada, pausa, salto, mergulho, queda, checkpoints, classificação, eliminação e retorno ao menu. |
| `kraken.test.cjs` | Quatro lançamentos, coleta de anéis, rota alternativa, colisão com o tentáculo e conclusão de treino sem limite de tempo. |
| `navegador.cjs` | Carregamento do HTML portátil e das imagens, quatro pilotos, escolha persistida, progresso com teclado e toque emulado, pausa, qualidade alta e erros do JavaScript e do WebGL. |

Os testes de física exercitam o código do jogo com DOM e WebGL simulados. Para avaliar a fluidez em um aparelho específico, abra uma corrida no dispositivo e compare os modos **Automático**, **Alto** e **Leve** no menu de pausa. As imagens do teste de navegador usam renderização por software e servem de referência visual.
