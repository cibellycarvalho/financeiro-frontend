# Sistema visual do Painel Financeiro, com o Finco como referência

**Data:** 2026-08-21
**Repos:** `financeiro-frontend` (principal), `financeiro-backend` (campos de apoio)

## O pedido

Ela pediu para reformular o Painel inteiro "com base no Finco, mantendo apenas
as cores". O Finco é o SaaS de gestão financeira para marketplaces que ela
assina — e a referência é dela, não uma escolha minha.

## Por que o Finco parece mais simples (medido, não impressão)

O Painel tem **2.452 linhas de tela para 382 de componente compartilhado**, e
76 `borderRadius` escritos à mão espalhados pelas páginas. Cada tela inventa o
próprio cartão, o próprio espaçamento, a própria borda. `Fornecedores.jsx`
sozinha tem 1.027 linhas e 31 bordas próprias.

O Finco não tem menos informação — a tela do Mercado Livre mostra 6 indicadores,
7 blocos de custo e uma tabela de 4.070 lançamentos, e ainda assim descansa a
vista. Ele consegue isso com **pouca variedade**: um tamanho de cartão, dois
tamanhos de fonte, um raio, um espaçamento. O que se repete, se repete igual.

O Painel tem o problema oposto: pouca informação, muita variedade.

## Anatomia que se copia do Finco

Medida ao vivo em `finco.app.br/marketplaces` (21/08/2026):

1. **Cabeçalho de página** — título grande + uma linha de subtítulo em cinza.
2. **Cartão de filtros** — seletores rotulados, ações agrupadas.
3. **Grade de indicadores** — cartões de largura igual; rótulo em cima à
   esquerda, ícone à direita, valor grande, e **a conta embaixo, em cinza**
   (`Base: R$ 11.881,48 − Ads: R$ 7.917,56 − Fixos: R$ 1.104,87`).
4. **Seções em cartão** — cabeçalho com subtítulo, conteúdo em linhas, total no
   rodapé quando faz sentido.
5. **Cor pelo significado** — verde quando é resultado bom, vermelho quando é
   perda, neutro quando é contagem.

O item 3 é o que mais importa. É a linha de baixo que faz o número deixar de
ser um oráculo.

## O que NÃO se copia

O Finco tem abas (Dashboard / Custos Fixos / Receitas Externas), barra de
sincronização e "Exportar PDF" porque tem o que pôr ali. A Visão da Semana do
Painel não tem aba nenhuma nem sincronização. Copiar essas peças deixaria a
tela **parecida com o Finco e pior de usar** — moldura vazia.

No lugar do cartão de filtros, uma faixa dizendo de quando é o dado. Mantém a
honestidade do Finco (ele sempre diz o período) sem inventar controle inerte.

## Cores: ficam as da Cravelli

Verde garrafa `#2f4a3b`, marfim, Manrope, os status. Decisão dela no rebrand de
agosto, e reformular o layout não é motivo para desfazer.

**Única exceção, aprovada por ela em 21/08:** o fundo da página escurece um
degrau dentro da mesma família marfim. Motivo: o efeito do Finco depende de o
cartão se destacar do fundo — ele usa `#F0F0F0` contra branco. O Painel usava
`#faf8f3` contra `#fffefb`, diferença de 2%, e no escuro `#18160f` contra
`#221f19`, praticamente idênticos. Com cartão e fundo da mesma cor, arredondar
canto e espaçar melhor não resolve: os blocos continuam sumindo.

Nenhuma cor de marca, status ou texto muda.

## Ordem de execução

Ela escolheu **uma tela por vez**, ciente do risco que eu levantei (o sistema
nascer torto e as telas ficarem diferentes entre si). Mitigação combinada:
**as peças compartilhadas são extraídas conforme cada tela é refeita**, como já
aconteceu no Lucro Real em 21/08 (`SecaoCard`, `LinhaValor`). Ela vê uma tela
pronta por vez e o sistema nasce por baixo.

Primeira tela: **Visão da Semana** (Dashboard) — é a porta de entrada, é a mais
parecida com a tela do Finco que ela mostrou, e é a menor (85 linhas).

Ordem sugerida depois: Fechamento, Contas a Pagar, Repasses ML, Fornecedores.

## Visão da Semana — desenho

- Cabeçalho com subtítulo: "O que vence, o que entra e o que sobra nos próximos
  7 dias."
- Faixa de período dizendo de quando são os números.
- Grade de 4 indicadores de largura igual, cada um com a composição embaixo.
- Duas seções em cartão (contas da semana, fornecedores em aberto), com o estado
  vazio DENTRO do cartão em vez de solto na página.
- Fornecedores viram linhas, não cartõezinhos de larguras diferentes.

## Defeito encontrado no caminho

`saldo_disponivel` aparece em verde mesmo quando é negativo — a cor está fixa no
código. Estava mostrando −R$ 50.314,96 em verde, que lê como boa notícia.
A cor passa a seguir o sinal. Corrigido junto, independente do redesenho.

## Apoio do backend

`/api/dashboard` calcula `saldo_disponivel` como
`repasses − cobranças − contas pagas − contas pendentes − fornecedores`, mas só
devolve o resultado. Para escrever a conta embaixo do valor faltam
`total_pago_mes` e `total_pendente_mes` — já calculados, só não retornados.
Acrescentar também as contagens que viram texto ("3 contas vencendo").

## Riscos

- **Duas caras ao mesmo tempo.** Enquanto as 9 telas não passarem, o Painel
  mistura o antigo e o novo. É consequência direta da ordem escolhida por ela;
  o jeito de encurtar é não deixar a fila parada no meio.
- **Fornecedores é maior que todo o resto somado.** Deixar por último é
  proposital, mas ela é a que mais melhora — não deixar cair no esquecimento.
