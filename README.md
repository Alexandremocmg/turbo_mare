# Turbo Maré

Uma corrida 3D pelo Circuito do Kraken. Dez pilotos largam em um píer tropical. Os seis primeiros a cruzar a linha de chegada em até 90 segundos se classificam. O navegador simula os nove adversários, os trampolins, as hélices e os tentáculos.

![Corrida no píer com a lontra e os caranguejos mecânicos](docs/imagens/corrida.png)

## Jogar

[**Abrir o Turbo Maré no navegador**](https://alexandremocmg.github.io/turbo_mare/)

Para instalar, abra o link no Chrome ou Edge e use **Instalar jogo** quando aparecer. No iPhone ou iPad, abra no Safari e escolha **Compartilhar → Adicionar à Tela de Início**. Se aparecer **Abrir como App**, deixe essa opção ativada. No primeiro acesso com internet, espere o menu mostrar **Pronto para jogar offline** antes de desconectar.

[Baixe o jogo em um único arquivo HTML](https://raw.githubusercontent.com/Alexandremocmg/turbo_mare/main/index.html). Se o navegador exibir o código, salve a página como `index.html` e abra o arquivo baixado. Você também pode clonar o repositório e abrir o `index.html` da raiz. A arte e o áudio funcionam offline em um navegador com WebGL.

- **Jogar com amigos** abre uma sala online para 2 a 6 pessoas. Digite seu apelido, clique em **Criar sala** e envie o **link do convite**. Cada amigo abre o link e escolhe **Entrar na sala**. O anfitrião dá a largada quando todos estiverem conectados. Se ele minimizar o jogo ou sair, outro piloto assume a mesma corrida. Até o último piloto pode terminar sozinho. O convite continua válido para a revanche enquanto a sala estiver aberta.
- **Disputar corrida** coloca você no grid com mais nove pilotos. Os quatro anéis dão impulso e os checkpoints encurtam o retorno após uma queda.
- **Treino livre** abre a pista para uma volta solo, sem limite de tempo.
- **Pilotos** permite girar o modelo por arraste, experimentar quatro animações e escolher Lontra, Tubarão, Axolote ou Marujo.

### Copa das Marés

Em **Jogar com amigos**, crie uma sala, compartilhe o convite e selecione **Largar na Baía**. A Copa começa na Baía do Kraken. No Estaleiro à Deriva, desvie das cargas em movimento e escolha entre o cais e o contêiner suspenso. Há dez segundos de placar entre cada prova.

O **Farol da Ressaca** fecha a Copa. No sopé do farol, duas passagens de pedra pelo lado de dentro ficam expostas na maré baixa. As luzes verdes e o contador indicam quando dá para cortar caminho pelos anéis. Na maré alta, siga pela pista principal. Depois das pedras, a rampa faz uma volta completa em subida até a galeria da lanterna.

Cada prova distribui **10, 8, 6, 4, 2 e 1 ponto** por colocação. Quem cruza a linha fica à frente. Ao fim dos 90 segundos, os pilotos que ainda correm e alcançaram um checkpoint também pontuam, em ordem de progresso. A maior soma vence. Em caso de empate, vale a pontuação do Farol. Se o empate persistir, a colocação é compartilhada. No pódio, **Revanche** inicia outra copa com o mesmo convite e o placar zerado.

| Ação | Computador | Tela de toque |
| --- | --- | --- |
| Mover | WASD ou setas | Controle direcional à esquerda |
| Pular | Espaço | Pulo |
| Mergulhar | Shift | Mergulho |
| Pausar no solo ou abrir o menu de saída online | Esc | Botão de pausa |
| Reiniciar no solo | R durante a corrida | Pausa → Reiniciar |

## Desenvolver

Os fontes editáveis ficam em [src](src/). Para ver uma alteração imediatamente, sirva essa pasta por HTTP. Com Python 3 instalado, execute o comando abaixo na raiz e abra `http://localhost:8000`. Em um Codespace, abra a prévia da porta 8000.

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory src
```

Para atualizar a versão distribuída e testar a física, use Node.js 24. Os scripts usam apenas módulos nativos.

```sh
node scripts/build.cjs
node scripts/build.cjs --check
node --test tests/corrida.test.cjs tests/kraken.test.cjs
```

O [guia de desenvolvimento](docs/DESENVOLVIMENTO.md) mostra onde mudar a pista, os modelos e as animações, e como repetir o teste no navegador. A [galeria](docs/GALERIA.md) reúne os quatro pilotos, o menu e a corrida em tela de toque.
