# Spec — Sistema de Avaliação de Anúncios (Mercado Livre)

> Status: proposta para revisão. Nada implementado.
> Contexto: conversa sobre agentes de acompanhamento de anúncios, agosto/2026.

---

## 1. Problema

Hoje uma alteração num anúncio (foto de capa, preço, título, ficha técnica) é feita e some. Não fica registro do que mudou nem quando. Não existe série histórica das métricas do anúncio. Duas semanas depois ninguém sabe dizer se a mudança ajudou, atrapalhou ou foi indiferente — e a decisão seguinte é tomada por intuição.

O prejuízo não é só não saber. É repetir mudanças que pioram e abandonar mudanças que funcionavam.

## 2. Objetivo

Três entregas, listadas em ordem decrescente de confiança:

1. **Registrar e coletar** — histórico diário de métricas por anúncio + log do que foi alterado. É contabilidade, não estatística. Funciona sempre.
2. **Alarmar** — avisar no Telegram quando um anúncio tem queda anômala. Alta confiança, valor imediato.
3. **Avaliar** — dizer se uma alteração específica teve efeito. Confiança limitada e escopo restrito (ver §4.2). Só entrega veredito quando o dado permite.

## 3. Não-objetivos

Explicitados para não virarem escopo por acidente:

- **Nenhum agente escreve na API do Mercado Livre.** Todos os tokens são somente leitura. A única alteração em anúncio é feita por humano, manualmente.
- **Não é um oráculo diário.** O sistema não vai produzir uma recomendação por anúncio por dia. Na maior parte dos dias ele fica em silêncio.
- **Não avalia conversão em janela de 7 dias.** Estatisticamente impossível no volume típico. Ver §4.2.
- **Não substitui julgamento.** O gerente monta o dossiê; quem decide é a operação.

## 4. Restrições que definem o desenho

### 4.1 O que a API entrega — e o que não entrega

| Dado | Fonte | Observação |
|---|---|---|
| Visitas/dia | `/items/{id}/visits/time_window` | Base da avaliação |
| Snapshot do anúncio | `/items/{id}` | Preço, título, fotos, atributos, frete, catálogo |
| Vendas | `/orders/search?seller={id}` | Conversão = pedidos ÷ visitas |
| Saúde do anúncio | `/items/{id}/health` | Qualidade/completude |
| Perguntas | `/questions/search?item={id}` | Objeção do cliente, em texto |
| Reviews | `/reviews/item/{id}` | Idem |

**Endpoints a validar na documentação oficial antes de implementar.** A API do ML muda; nada aqui deve ser codado de memória.

**O que não existe na API: posição orgânica na busca.** Se a pergunta é "caí de posição depois da mudança?", isso exige consulta própria a `/sites/MLB/search` guardando o rank diariamente. Sem essa coleta, o sistema vê a visita cair e não consegue distinguir "a foto ficou pior" de "perdi ranking por outro motivo".

### 4.2 O limite estatístico — a restrição mais importante

A menor variação detectável numa janela depende de quantos eventos existem nela:

```
efeito mínimo detectável ≈ 4 / √N        (N = eventos na janela de 7 dias)
```

**Visitas:**

| Visitas/dia | N (7 dias) | Efeito mínimo detectável |
|---:|---:|---:|
| 10 | 70 | ~48% |
| 50 | 350 | ~21% |
| 200 | 1.400 | ~11% |
| 500 | 3.500 | ~7% |

**Conversão** — aqui o evento raro é a venda, não a visita:

| Vendas/semana | Efeito mínimo detectável |
|---:|---:|
| 7 | ~150% |
| 30 | ~73% |
| 100 | ~40% |

Na prática multiplique por ~1,5: dado real tem efeito de dia da semana e rajadas, que ampliam o ruído acima do teórico.

**Consequências diretas no produto:**

- Uma melhora real e boa de conversão mexe 10–20%. Isso é **invisível** em 7 dias em praticamente qualquer anúncio. Avaliação de conversão exige janela de 21–28 dias e só detecta efeito grande.
- Troca de foto de capa age principalmente no CTR da busca, que aparece em **visitas**. Sorte boa: para o caso de uso mais frequente, a métrica mensurável é a métrica certa.
- Mudanças de ficha técnica, descrição e preço agem na conversão. Para essas, o sistema deve declarar inconclusivo com honestidade em vez de inventar veredito.
- Anúncio abaixo de ~30 visitas/dia entra só no alarme de desastre. Avaliação de mudança nele é ruído.

### 4.3 Confundidores e o grupo de controle

Comparar 7 dias antes contra 7 dias depois, sem controle, produz conclusão errada com frequência alta: sazonalidade, dia da semana, campanha do ML, ruptura de estoque, concorrente mexendo no preço.

**Correção:** usar como controle os demais anúncios da conta que **não** sofreram alteração na janela. Se a conta inteira caiu 18% e o anúncio caiu 20%, a mudança não fez nada. Se a conta caiu 18% e o anúncio subiu 15%, há sinal.

Limite honesto: o controle resolve **choque comum**. Não resolve o que é específico daquele anúncio — concorrente baixou preço, faltou estoque dois dias, entrou review ruim, o ML mexeu no ranking. Esses continuam contaminando, e é por isso que o vigia de concorrência (§6) importa.

### 4.4 Disciplina operacional (pré-requisito, não feature)

**Uma alteração por vez, por anúncio.** Se foto e título mudam no mesmo dia, nenhum método separa os dois efeitos. Isso é processo, não código, e é o fator que mais determina se o sistema vai prestar.

O sistema deve **detectar violação disso** e marcar a avaliação como não-atribuível.

## 5. Modelo de dados

```sql
-- Anúncios monitorados
ml_anuncios (
  id              uuid pk,
  ml_item_id      text unique,        -- MLB...
  conta_ml        text,               -- YUSO, etc.
  titulo          text,
  categoria_id    text,
  ativo           boolean,
  criado_em       timestamptz
)

-- Snapshot diário. Uma linha por anúncio por dia.
ml_metricas_diarias (
  anuncio_id      uuid fk,
  data            date,
  visitas         int,
  pedidos         int,
  unidades        int,
  receita         numeric,
  preco           numeric,
  estoque         int,
  status          text,               -- active, paused, closed
  health          numeric,
  posicao_busca   int null,           -- coleta própria; null se não coletado
  primary key (anuncio_id, data)
)

-- O que mudou, quando. Alimentado por detecção automática + registro manual.
ml_eventos (
  id              uuid pk,
  anuncio_id      uuid fk,
  data            date,
  tipo            text,               -- foto_capa | fotos | titulo | preco
                                      -- | ficha | descricao | frete | outro
  valor_antes     jsonb,
  valor_depois    jsonb,
  origem          text,               -- detectado | manual
  observacao      text
)

-- Concorrência: top N da categoria/termo, snapshot diário
ml_concorrentes_diario (
  anuncio_id      uuid fk,            -- nosso anúncio de referência
  data            date,
  ml_item_id      text,               -- do concorrente
  posicao         int,
  preco           numeric,
  titulo          text,
  foto_url        text,
  vendidos        int
)

-- Veredito do avaliador
ml_avaliacoes (
  id              uuid pk,
  evento_id       uuid fk,
  janela          text,               -- D+7 | D+21
  metrica         text,               -- visitas | conversao
  variacao_pct    numeric,
  controle_pct    numeric,
  efeito_liquido  numeric,            -- variacao - controle
  mde_pct         numeric,            -- menor efeito detectável (§4.2)
  veredito        text,               -- melhorou | piorou | inconclusivo
                                      -- | nao_atribuivel
  atribuivel      boolean,            -- false se houve mudança concorrente
  criado_em       timestamptz
)

-- Log do que foi enviado (evita repetir alerta)
ml_alertas (
  id              uuid pk,
  anuncio_id      uuid fk,
  tipo            text,
  severidade      text,               -- critico | atencao | informativo
  mensagem        text,
  enviado_em      timestamptz
)
```

## 6. Componentes

A separação central: **conta é código, julgamento é agente.** Um LLM calculando razão e intervalo de confiança erra às vezes e ninguém percebe. Código dá o mesmo número toda vez e é auditável.

### Camada determinística (código — sem LLM)

| Componente | Frequência | Faz |
|---|---|---|
| **Coletor de métricas** | diário, 1×/dia | Puxa API do ML, grava `ml_metricas_diarias` |
| **Detector de mudanças** | diário | Compara snapshot de hoje com ontem, grava `ml_eventos` automaticamente |
| **Coletor de posição** | diário | Busca em `/sites/MLB/search`, grava rank e top N concorrentes |
| **Calculadora** | diário | Variação vs. controle, MDE, veredito. Preenche `ml_avaliacoes` |
| **Motor de regras** | diário | Aplica limiares (§8), decide o que vira alerta |

### Camada de julgamento (agentes LLM)

Cada agente traz **dado diferente**. Nenhum agente opina sobre dado que outro agente já viu — isso só fabricaria confiança.

| Agente | Entrada | Saída |
|---|---|---|
| **Leitor de objeções** | perguntas + reviews recentes | Objeções recorrentes, em texto |
| **Avaliador de imagem** | foto de capa nossa + dos top 3 | Comparação visual, pontos fracos |
| **Analista de concorrência** | `ml_concorrentes_diario` | O que mudou no topo da categoria |
| **Agente de margem** | custo + repasse (sistema financeiro) | Piso de preço viável |
| **Redator do briefing** | saída de todos acima + números da calculadora | Mensagem do Telegram |

**Sobre o nome "gerente":** proposta de trocar para **redator de briefing**. Gerente-que-decide escreve "troque a foto". Redator de briefing escreve o dossiê e deixa a decisão com quem tem contexto de negócio. A diferença de nome muda o comportamento do prompt.

## 7. Fluxo diário

```
06:00  Coletor de métricas      → grava snapshot de ontem
06:15  Coletor de posição       → rank + concorrentes
06:30  Detector de mudanças     → registra eventos automáticos
06:45  Calculadora              → avaliações D+7 e D+21 vencidas
07:00  Motor de regras          → decide: tem algo a dizer?
       ├── não → fim. Silêncio.
       └── sim → aciona agentes especialistas pertinentes
07:15  Redator                  → monta mensagem
07:20  Telegram                 → envia
```

Agentes LLM só rodam quando o motor de regras já decidiu que há algo. Isso segura custo e latência: em dia normal, zero chamadas de LLM.

## 8. Regra de alerta — quando fala e quando cala

**Mudo por padrão.** Mensagem diária de "está tudo normal" é como se treina a ignorar o canal. O sistema morre de fadiga de alerta muito antes de morrer de matemática ruim.

| Gatilho | Severidade | Envia |
|---|---|---|
| Anúncio pausado / sem estoque | crítico | imediato |
| Queda de visitas > MDE **e** controle estável | crítico | imediato |
| Avaliação D+7 concluiu "piorou" | atenção | no briefing |
| Avaliação D+7 concluiu "melhorou" | informativo | no briefing |
| Concorrente top 3 mudou preço > 5% | informativo | agrupado, 1×/dia |
| Avaliação inconclusiva | — | **não envia** |
| Nada cruzou limiar | — | **silêncio** |

Teto: no máximo uma mensagem de briefing por dia, mais os críticos. Alerta repetido sobre o mesmo anúncio é suprimido por 72h (consulta `ml_alertas`).

## 9. Formato da mensagem

**Alerta crítico:**

```
🔴 MLB1234567890 — Cinta Modeladora Preta

Visitas caíram 34% (312 → 206/dia, últimos 3 dias).
Controle da conta: -3%. A queda é do anúncio, não do mercado.

Contexto:
• Posição na busca "cinta modeladora": 4º → 11º (dia 12/08)
• Concorrente MLB987... entrou a R$ 79,90 (12% abaixo do nosso)
• Nenhuma alteração nossa registrada nos últimos 21 dias

Piso de margem: R$ 74,50.
```

**Briefing de avaliação:**

```
📊 Avaliação D+7 — foto de capa trocada em 01/08

MLB1234567890 — Cinta Modeladora Preta
Visitas: +19% | Controle: +2% | Efeito líquido: +17%
Detectável a partir de 12% → CONCLUSIVO. A foto ajudou.

MLB5555555555 — Kit 3 peças
Visitas: +6% | Controle: +4% | Efeito líquido: +2%
Detectável a partir de 31% → INCONCLUSIVO.
Volume baixo demais para julgar em 7 dias. Reavalio em D+21.

MLB7777777777 — Modelador Cirúrgico
NÃO ATRIBUÍVEL: foto e preço mudaram no mesmo dia (03/08).
Não é possível separar os efeitos.
```

O terceiro caso é o mais importante do desenho: o sistema precisa saber dizer que não sabe.

## 10. Segurança

- **Tokens do ML somente leitura**, em todos os agentes. Um agente com escrita pode gravar preço errado na vitrine ao vivo e custar dinheiro em minutos.
- Segredos (token ML, token do bot Telegram, chave Supabase) em variável de ambiente. Nunca no repositório.
- Bot do Telegram restrito a um `chat_id` fixo.
- Automação de escrita, se um dia for desejada, é **projeto separado**, com trava de faixa de preço e confirmação humana.

## 11. Fases

| Fase | Entrega | Duração | Depende de |
|---|---|---|---|
| **0** | Coletor + tabelas. Só acumula dado. | 1 semana | — |
| **1** | Alarme de desastre no Telegram | 1 semana | Fase 0 rodando |
| **2** | Vigia de concorrência + leitor de objeções | 2 semanas | Fase 1 estável |
| **3** | Calculadora + avaliação D+7/D+21 | 2 semanas | ~4 semanas de linha de base |
| **4** | Agregado: o que funciona no nosso catálogo | contínuo | ~50 eventos registrados |

**Por que concorrência vem antes de avaliação.** O dado de concorrência é determinístico: não depende de volume, não depende de linha de base acumulada e é acionável no mesmo dia em que chega. A avaliação estatística precisa de um mês de histórico, precisa de volume e vai devolver "inconclusivo" boa parte do tempo. Colocar a avaliação antes faz a operação esperar dois meses para chegar na parte mais frustrante, e só depois na parte imediatamente útil.

**A Fase 0 precisa começar antes de qualquer alteração de anúncio.** Sem linha de base anterior à mudança, não há o que comparar. Cada semana de atraso é uma semana de avaliação perdida, e ela não volta.

**A Fase 3 é opcional e depende do volume.** Se os anúncios tiverem tráfego baixo (ver §4.2), a avaliação estatística não se paga e o sistema fica sendo vigilância + concorrência. Isso já é bom negócio, e é um projeto bem menor.

**A Fase 4 é onde está o maior retorno** e é a mais subestimada. Cada teste individual é ruidoso, mas a média de 50 testes ruidosos é sinal. Em 6 meses isso vira dado próprio sobre o que funciona neste catálogo — algo que quase nenhum vendedor tem.

## 12. Expectativas realistas

### 12.1 O que aparece, mês a mês

| Período | O que a operação recebe |
|---|---|
| **Mês 1** | Quase nada. Duas ou três mensagens no mês inteiro, todas do tipo "anúncio pausado" ou "visitas caíram 40%". Parece pouco. É justamente o que hoje passa despercebido por uma semana. |
| **Mês 2–3** | Concorrência e objeções. "O 2º colocado baixou 12% ontem", "quatro pessoas perguntaram sobre voltagem". Acionável no mesmo dia. |
| **Mês 4–5** | Avaliação de alterações. **A maior parte vai voltar `inconclusivo`.** Não é defeito: é o dado sendo honesto sobre o próprio volume. |
| **Mês 6+** | Agregado. "Das 23 trocas de foto de capa, 14 subiram visita, média +11%." |

### 12.2 O que o sistema nunca faz

- **Não escolhe a foto.** Diz se a que foi trocada mudou alguma coisa. Criação continua humana.
- **Não prevê.** Nada de "se baixar 5% você vende 20% mais".
- **Não explica o porquê na maioria dos casos.** Diz *que* caiu e lista o que mudou em volta. Correlação com contexto, não causa.
- **Não entende o algoritmo do ML.** Vai haver queda sem explicação alcançável por dado nenhum do vendedor. O sistema levanta a mão e não tem resposta.

### 12.3 Onde ficar com o pé atrás

1. **O número parece mais firme do que é.** "+17%" tem margem em volta; repetindo o teste podia dar +9% ou +25%. Serve para decidir direção, não para calcular retorno.
2. **Não é ligar e esquecer.** API muda, token expira, endpoint some. Precisa de dono.
3. **O risco principal é comportamental, não técnico.** Se o bot falar demais, a operação para de ler e o sistema morre sem ninguém perceber. A regra de silêncio (§8) é mais importante que a matemática.
4. **Medir pode reduzir a velocidade de teste.** Uma mudança por vez, com janela de 7 a 21 dias, significa poucos testes por anúncio por ano.

### 12.4 Recomendação de aplicação

**Aplicar o rigor de medição apenas nos ~10 anúncios principais.** No restante do catálogo, alterar livremente e sem medir. Coletar métricas de todos (é barato e alimenta o grupo de controle), mas só rodar o ciclo de avaliação nos que têm volume para sustentá-lo. Medir tudo leva à paralisia e não produz mais informação.

## 13. Como isso falha

Riscos reais, em ordem de probabilidade:

1. **Fadiga de alerta.** Bot fala demais, operação para de ler, sistema morre sem ninguém perceber. Mitigação: §8, mudo por padrão.
2. **Coletor quebra em silêncio.** API muda, token expira, dado para de entrar e ninguém nota por semanas. Mitigação: alerta de "não coletei ontem" — o único aviso que o sistema dá sobre si mesmo.
3. **Falso positivo por comparação múltipla.** Monitorando 40 anúncios, testar tudo a 5% gera ~2 alarmes falsos por semana. Mitigação: limiar por MDE do próprio anúncio, não por p-valor genérico.
4. **Agente confiante demais.** LLM escreve "a foto melhorou 12%" onde o dado não permite. Mitigação: o veredito vem da calculadora (código); o redator só tem permissão de traduzir, nunca de concluir.
5. **Violação da disciplina de uma-mudança-por-vez.** Mitigação: detectar e marcar `nao_atribuivel`.

## 14. Perguntas em aberto

1. **Volume:** visitas/dia e vendas/semana de um anúncio típico, e quantos anúncios entram no monitoramento. Define o MDE real e calibra os limiares de §8.
2. **Onde vive o código:** o "seller ML" é o repositório `ml-sync-worker`, o `sales-stream-pulse`, ou outro? Se já existe autenticação com a API do ML lá, ela deve ser reaproveitada.
3. **Contas ML:** só YUSO ou mais de uma? O controle sintético é por conta.
4. **Mercado Livre Ads:** há investimento em publicidade? Se sim, tráfego pago precisa ser separado do orgânico, senão contamina toda a análise de visitas.
5. **Termos de busca:** para a coleta de posição, quais termos importam por anúncio? Precisa de uma lista curada.
