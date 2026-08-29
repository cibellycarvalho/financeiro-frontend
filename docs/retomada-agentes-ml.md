# Retomada — agentes de avaliação de anúncios ML

Arquivo de contexto para continuar o trabalho em outra sessão (terminal, no Mac).
A spec completa está em `spec-agentes-avaliacao-anuncios-ml.md`, nesta mesma pasta.
Este arquivo guarda só o que ficou fora dela.

## Estado: Fases 0a e 0b em produção desde 17/08/2026

Camada de retry e coletor diário estão no ar, rodando às 06:00 BRT. Primeira
execução limpa — ver "Primeira execução em produção" no fim deste arquivo.

### Histórico: o incidente de divergência (resolvido)

Antes do envio, o clone local do `ml-seller-api` estava **79 commits atrás de
`origin/main`**, e o `git log origin/main..HEAD` vazio que parecia indicar "tudo
sincronizado" era leitura de uma referência desatualizada, antes de um
`git fetch`. O push teria sido recusado. A reconciliação foi feita refazendo o
trabalho por cima da versão nova, com baseline de testes idêntico ao de
`origin/main` (18 falhas, mesma lista).

Os 79 commits vieram de **outra sessão do Claude trabalhando no mesmo
repositório**, sem que as duas soubessem uma da outra. Incluem a extração do
módulo financeiro para outro repo, correções no `ml_client.py` (cancelamentos,
taxas de ADS, preço promocional), uma função nova `buscar_pedidos_por_aprovacao`
e um `scheduler.py` bem mais enxuto.

### Regra de processo, para não repetir

1. **`git fetch && git status` antes de começar qualquer trabalho.** O estado do
   `origin/main` só é confiável depois de um fetch.
2. **Uma sessão por repositório por vez.** Duas sessões editando o mesmo projeto
   em paralelo produzem exatamente esta situação, e a segunda a chegar perde.
3. Commitar cedo e em pedaços pequenos reduz o custo quando isso acontece
   mesmo assim.

### Como reconciliar (decidido)

Não resolver conflito por hunk — **refazer por cima da versão nova.** A maior
parte do trabalho da 0a no `ml_client.py` é mecânica (trocar `requests.get` por
`ml_get` em 20 pontos), e costurar duas versões arrisca reintroduzir código que
`origin/main` removeu de propósito.

1. Preservar os arquivos que não colidem: `ml_http.py`, `services/coletor_ml.py`,
   `migrations/024_agentes_ml.sql`, `tests/test_ml_http.py`,
   `tests/test_coletor_ml.py`.
2. Descartar as alterações locais em `ml_client.py`, `scheduler.py`,
   `tests/test_ml_client.py` e `CLAUDE.md`; sincronizar com `origin/main`, que é
   a autoridade.
3. **Rodar a suíte e anotar o baseline novo de falhas.** O antigo era 26, mas
   `origin/main` acrescentou ~200 testes. Sem baseline atualizado não há como
   separar regressão nova de falha preexistente.
4. Reaplicar do zero sobre a versão nova: a troca mecânica para `ml_get`/`ml_post`
   (sem mexer no tratamento de resposta que já existe lá — `try/except` que
   `origin/main` removeu fica removido), a resiliência do `renovar_token`, o
   jitter no TTL, o registro do job às 06:00 e os testes de `renovar_token`.
5. Avaliar se `buscar_pedidos_por_aprovacao` deve substituir o que o coletor usa.
6. Rodar a suíte de novo e comparar com o baseline do passo 3.

## Onde estamos

Spec escrita e revisada. **Fase 0a concluída.** Próximo passo é a Fase 0b —
tabelas e job diário.

### Fase 0a — entregue

`ml_http.py` novo, com `ml_get`/`ml_post` centralizando retry e limitação, os 20
call sites do `ml_client.py` trocados mecanicamente, os dois `timeout` faltantes
fechados e 14 testes novos. 428 testes, 26 falhas pré-existentes (JWT
desatualizado), zero regressão.

Comportamento:

- Retry em `GET` por padrão; `POST` só com opt-in explícito (os dois
  `oauth/token` optam, `responder_pergunta` não).
- Backoff exponencial com jitter, capado em 30s. **O `Retry-After` do servidor
  é isento do cap:** se cabe no tempo restante, dorme exatamente o que ele
  mandou; se não cabe, desiste na hora com
  `RETRY_EXHAUSTED motivo=retry_after_maior_que_orcamento`, sem dormir. Aceita
  segundos e HTTP-date.
- Transitório = `{429, 500, 502, 503, 504}`. Qualquer outro status volta na hora.
- `ML_HTTP_MAX_CONCURRENCY` (10), `ML_HTTP_MAX_RETRIES` (5) e
  `ML_HTTP_MAX_ELAPSED_SECONDS` (120) por variável de ambiente. **O coletor deve
  subir o `MAX_ELAPSED`** — 120s serve ao dashboard, onde há alguém esperando na
  tela; o cron pode esperar minutos e ainda assim salvar o dado do dia.
- Semáforo global liberado antes de dormir e readquirido na tentativa seguinte.
- Ao esgotar, devolve a última `Response` (ou relança a exceção de rede) — nunca
  inventa sucesso.

### Dívida aceita conscientemente

`ml_get`/`ml_post` despacham por lookup dinâmico em `requests.get`/`requests.post`
em vez de uma `Session` própria — decisão forçada pelos 15 testes existentes que
mockam `patch("requests.get")`. Custo: sem `Session` não há keep-alive, e cada
chamada paga handshake TCP + TLS. Invisível no uso atual; perceptível no coletor,
que faz centenas de requisições em janela curta. **Medir quando a Fase 0b estiver
rodando.** Se aparecer, a correção é mover o mock dos 15 testes para o novo ponto
de costura — não desfazer a camada.

## Decisões já tomadas

- **Nenhum agente escreve na API do ML.** Tokens somente leitura. Toda alteração
  de anúncio é feita por humano.
- **Conta é código, julgamento é agente.** O veredito (melhorou / piorou /
  inconclusivo / não atribuível) sai de código determinístico. O LLM só traduz
  para português — nunca conclui.
- **"Gerente" virou "redator de briefing".** Ele monta o dossiê; a decisão é da
  operação.
- **Alerta mudo por padrão.** Sem mensagem diária de "tudo normal".
- **Concorrência antes de avaliação estatística** (fases reordenadas).
- **Rigor de medição só nos ~10 anúncios principais.** O resto do catálogo muda
  livremente, sem medição.

## Topologia de deploy — e o problema que ela cria

EasyPanel (Docker), build disparado por push na `main`. Start:
`gunicorn app:create_app() --workers 2 --worker-class gthread --threads 4`.
Não há cron nativo da plataforma. O agendamento é interno: `scheduler.py::init_scheduler(app)`
sobe um `BackgroundScheduler` (APScheduler) dentro de `create_app()`.

**`create_app()` roda uma vez por worker do Gunicorn.** O guard existente
(`if hasattr(app, "scheduler")`) só protege dentro do mesmo objeto `app` — não
impede o segundo processo de subir o próprio scheduler. Não há eleição de líder.
Consequência: todos os jobs agendados provavelmente rodam em duplicata,
incluindo `sync_ml_recente` a cada 15 min em todas as contas.

**Confirmar nos logs** antes de agir: duas execuções do mesmo job no mesmo
minuto, com PIDs diferentes. O `daily_conciliacao` (08:00) é o melhor alvo por
rodar uma vez ao dia.

### Consequências

1. **Corrida no refresh token — verificada, não corrompe.** O `refresh_token` do
   ML é de uso único, então dois workers renovando juntos garantem que um receba
   400. Mas o caminho de erro do `renovar_token` (l. 38-64) não grava nada: o
   `raise_for_status()` estoura antes do `save_ml_refresh_token`, a coluna fica
   como estava e o vencedor da corrida deixa um token válido. **O banco está
   seguro.** O que falta é o perdedor se recuperar em vez de desistir — ver
   Fase 0b.

   **Agravante:** os 2 workers sobem juntos no deploy, então os TTLs de 5h dos
   caches de token ficam alinhados e tendem a expirar quase ao mesmo tempo. A
   corrida é periódica, não aleatória. Jitter no TTL por processo resolve na
   origem.
2. **O semáforo do `ml_http` é por processo, não global.** O teto real em
   produção é `2 × ML_HTTP_MAX_CONCURRENCY`. Correção é de configuração —
   definir a variável pela metade do teto desejado. Um limitador de fato
   compartilhado exigiria estado externo (Redis ou lock no Postgres) e não se
   paga agora.
3. **Cache de token e de dados duplicado** por processo: cada worker renova seu
   próprio token e repete as mesmas chamadas.
4. **Provável causa raiz do bug de rate limit** documentado no guia de debugging
   do SPEC.md. Atenção: a camada de retry da Fase 0a vai **mascarar** esse
   sintoma — as chamadas passam a ter sucesso após esperar. Para de doer sem
   ter sido corrigido, e é exatamente por isso que fica registrado aqui.

## Ambiente

- **Código do seller ML:** `ml-seller-api` (Python), local no Mac em
  `/Users/macbookpro/ml-seller-api`. Não está no GitHub. Integração com a API
  do ML já mapeada — ver §4.5 da spec.
- **Hospedagem disponível:** Hostinger, com painel. A definir se é VPS ou
  compartilhada, e se o painel tem cron job.
- **Onde o coletor deve rodar:** na Hostinger, não no Mac. O coletor precisa
  rodar todo dia sem falhar; máquina que dorme perde o dado do dia, e o
  histórico de visitas do ML não permite buscar retroativamente.
- **Banco:** Supabase (mesmo já usado no sistema financeiro).

## Primeira tarefa (bloqueante)

**Fase 0a — camada de retry/backoff com tratamento de HTTP 429 no `ml_client.py`.**
Hoje não existe nenhum: erros não-200 são logados e a função desiste. Isso é
tolerável no uso interativo do painel e inaceitável num coletor diário sem
ninguém olhando — dado de visita perdido não se recupera. Beneficia todo o
sistema existente, não só este projeto.

### Desenho aprovado

Módulo novo `ml_http.py` expondo `ml_get` / `ml_post`, com `Session`
compartilhada. Wrapper explícito em vez de `urllib3.util.retry.Retry` montada
num `HTTPAdapter`: o `Retry` roda dentro do `Session.send()` e dispararia as
tentativas por fora do limitador, furando o limite exatamente durante uma
sequência de 429. Cada tentativa: adquire vaga no limitador → envia →
classifica (definitivo / transitório / sucesso) → se transitório, espera
(`Retry-After` quando vier, senão backoff exponencial com jitter) e repete.

Limitador é semáforo global de requisições em voo, em `ml_http.py`, importado
por todos os chamadores — inclusive os dois `ThreadPoolExecutor` existentes
(`buscar_pedidos` com `max_workers=10`, `buscar_cancelamentos` com 8) e o
coletor futuro. Hoje nada limita o total quando várias contas sincronizam
juntas, o que já é bug conhecido no guia de debugging do SPEC.md.

Troca dos ~20 call sites é mecânica: `requests.get(` → `ml_get(`, mesma
assinatura e mesmo retorno. Nenhuma das funções muda sua lógica de
interpretação de resposta.

### Decisões

1. **Retry só em `GET`.** `POST` precisa optar explicitamente. `oauth/token`
   opta; `responder_pergunta` não — repetir um POST que teve sucesso no
   servidor mas estourou timeout antes da resposta duplicaria a resposta ao
   comprador.
2. **Falha nunca vira valor — vira ausência.** Gravar `0 visitas` porque a
   chamada falhou é pior do que não gravar: o zero entra na série histórica
   como dado real, contamina o grupo de controle e gera alerta falso meses
   depois, sem ninguém saber que o ponto era falso. As métricas da linha
   diária aceitam `NULL`, e a coleta registra quais fontes falharam.
3. **Não alterar a semântica das funções existentes.** Fazer os Padrões B e C
   lançarem exceção quebraria o dashboard, que hoje exibe dado parcial. O
   coletor não reusa as funções permissivas — chama `ml_get` direto (ou por
   wrappers estritos próprios) nas ~5 fontes que precisa: visitas, detalhe do
   item, pedidos, posição e ADS.
4. **Os dois `timeout` faltando entram no escopo:** `buscar_visitas_item`
   (l. 687) e `buscar_posicao_anuncio` (l. 706) — justamente as duas fontes
   mais críticas do coletor, e chamada sem timeout em cron é job pendurado.
5. **Teto de tentativas e de tempo total.** Cron insistindo por 40 minutos é
   outro modo de falha. Ao desistir, logar de forma que o alerta "não coletei
   ontem" consiga enxergar.
6. **Soltar a vaga do semáforo durante o backoff.** Dormir segurando o slot
   transforma o limitador no gargalo: adquire, envia, solta, dorme, readquire.

## Fase 0b — código concluído

Entregue: `migrations/024_agentes_ml.sql` (7 tabelas), `services/coletor_ml.py`
(fontes estritas, upserts idempotentes, advisory lock `847300010`), job às 06:00
BRT no scheduler, `max_elapsed_seconds` por chamada no `ml_http`, 25 testes
novos, zero regressão (457/483, mesmo baseline de 26 falhas pré-existentes).

Anúncio de catálogo tratado: `catalog_listing` e `catalog_product_id` gravados
pelo `sync_ml_anuncios` sem chamada extra (já vinham no payload de
`buscar_anuncios_ativos`), e o `search_id` da posição é o `catalog_product_id`
quando for catálogo. **Catálogo sem `catalog_product_id` não cai para o
`ml_item_id` como fallback** — marca `posicao` em `fontes_falha` e para.

### Schema aplicado

As 7 tabelas foram criadas no Supabase pelo SQL Editor, a partir do DDL da spec
(não pelo arquivo `024_agentes_ml.sql`, que deve ser reconciliado para refletir
o banco). Comparação com o que o `coletor_ml.py` escreve: **sem divergência** —
nomes de coluna batem, e todos os alvos de `ON CONFLICT` têm constraint
correspondente (`ml_item_id` é `unique`; as demais são PK composta).

RLS ativado nas 7 tabelas, sem policies: bloqueia a chave pública do frontend e
não afeta o backend, que conecta como dono das tabelas.

Notas: `health` fica sempre `NULL` (lacuna conhecida, marcada como opcional);
`ml_eventos`, `ml_avaliacoes` e `ml_alertas` ficam vazias até as Fases 1 e 3; o
coletor já grava `ml_concorrentes_diario`, o que adianta parte da Fase 2.

### Falta para entrar em produção — só a operação pode fazer

**Marcar `prioritario` e preencher `keywords`** (até 3 por anúncio). Sem essa
lista, a fonte de posição não coleta nada. Palpite serve — ajusta-se depois, e
cada dia sem coletar não volta.

### Atrito conhecido

A sessão local não conecta no Supabase (`tenant or user not found` — provável
formato do usuário na connection string do pooler, que exige
`postgres.<project-ref>`). Enquanto não for resolvido, toda consulta ao banco
passa pela operação manualmente, pelo SQL Editor.

### A confirmar antes da Fase 2

`buy_box_winner` em `GET /products/{catalog_product_id}` — confiança média, veio
de busca indexada e não da documentação oficial (bloqueada por proteção de bot).
Reconfirmar antes de implementar a coleta de vencedor do catálogo.

## Fase 0b — decisões de construção

Tabelas da §7 da spec + job diário, pendurado no APScheduler que já existe.
Três regras que vêm da topologia acima:

1. **Nenhuma escrita pode depender de rodar exatamente uma vez.**
   `ml_metricas_diarias` já tem chave primária `(anuncio_id, data)`, então uma
   execução em duplicata vira UPSERT na mesma linha e a correção não sofre.
   Estender essa disciplina a todas as tabelas do coletor. Isso é mais robusto
   que qualquer lock, porque continua valendo se um dia forem quatro workers.
2. **Advisory lock do Postgres em volta do job diário**, para não gastar o dobro
   de quota da API. Quem pega roda; quem não pega desiste em silêncio. ~20
   linhas, não muda deploy.
3. **`ML_HTTP_MAX_ELAPSED_SECONDS` maior para o coletor** que o padrão de 120s,
   que foi dimensionado para o dashboard.
4. **`renovar_token` resiliente à corrida.** Captura o 400 especificamente,
   relê o `refresh_token` do banco e tenta mais uma vez — se outro processo
   venceu a corrida, o token válido já está gravado e a segunda tentativa passa.
   Logar como `REFRESH_TOKEN_CONFLICT`, distinguível de um refresh token
   realmente inválido: um é normal e se resolve sozinho, o outro exige refazer
   o OAuth. Esgotadas as duas tentativas, propaga.

   **Por que entra no escopo:** o scheduler tolera perder a corrida porque tenta
   de novo em 15 min. O coletor roda uma vez por dia — perder a corrida às 6h
   mata a coleta do dia inteiro, e dado de visita não se recupera depois. É
   exatamente o modo de falha que a Fase 0a existe para eliminar.

   Junto: jitter no TTL do cache de token, por processo, para desalinhar os
   workers na origem.

O coletor não reusa as funções permissivas do `ml_client` — chama `ml_get`
direto, ou por wrappers estritos, nas cinco fontes: visitas, detalhe do item,
pedidos, posição e ADS. Falha vira `NULL` e registro de fonte falhada, nunca `0`.

## Pendências

1. **Números de volume** — visitas/dia e vendas/semana de três anúncios
   (campeão, mediano, fraco) + total de anúncios ativos. Ordem de grandeza
   basta. **Decide se a fase de avaliação estatística entra no projeto.**
2. **Termos de busca** por anúncio, para a coleta de posição orgânica.
3. **Confirmar a duplicação de jobs nos logs** e o comportamento de
   `renovar_token` em falha.

~~Hostinger~~ → não se aplica. O serviço roda em EasyPanel e o agendamento é
interno via APScheduler; o coletor entra como mais um job registrado ali.

## Fora do escopo, mas registrado

Duas dívidas pré-existentes, ambas reais, **nenhuma das duas deve ser absorvida
no escopo deste projeto** — é assim que um trabalho de três dias vira um de três
semanas.

**1. Credenciais em texto puro.** `client_secret` e `refresh_token` estão sem
cifra na tabela `ml_contas`, protegidos só por RLS. Juntos dão acesso completo
à conta ML, e uma auditoria anterior já achou credenciais vazadas no histórico
do git.

**2. `buscar_collections` engole 5xx e devolve resultado parcial** (Padrão B,
l. 243-255), assim como `buscar_cancelamentos`. Diferente de `_buscar_pedidos_dia`,
que propaga a exceção de propósito. Isso alimenta repasse — ou seja, é dinheiro
sendo calculado sobre dado silenciosamente incompleto. A camada de retry reduz a
frequência, mas não corrige a semântica.

**3. Scheduler dentro dos workers do Gunicorn.** O lugar certo é um serviço
separado, a partir da mesma imagem, com outro `CMD` — isso conserta todos os
jobs de uma vez, não só o coletor. É mudança de deploy e mexe em produção que
está funcionando, então vira tarefa própria. O advisory lock da Fase 0b resolve
o caso do coletor sem esperar por isso.

**4. `renovar_token` chamado sem `try/except` em rota HTTP** (`routes/dashboard.py:243`,
entre outros). A exceção sobe, vira 500 não tratado, o Traefik derruba os headers
de CORS e o navegador mostra "Failed to fetch" — sem diagnóstico nenhum. Candidato
forte para episódios de "o painel não abriu e depois voltou sozinho". Levantar a
lista completa de call sites expostos antes de corrigir.

**5. Duplicação do advertiser_id/ADS no coletor.** O `coletor_ml.py` reimplementou
essas duas chamadas em vez de reusar `ml_client.buscar_advertiser_id` e
`buscar_ads_por_item`. A regra original era sobre não reusar as funções
*permissivas*, e essas duas são estritas — mas o motivo real é melhor que a
regra: desacoplar do cache em memória do dashboard, que tem TTL longo para
`advertiser_id`, e o coletor precisa do dado de hoje. **Decisão: mantém.** Mas é
duplicação e duplicação apodrece — se o ML mudar o endpoint de advertising,
viram dois lugares para corrigir e o do coletor é o que ninguém lembra.
Resolução preferida quando houver tempo: parâmetro de bypass de cache nas duas
funções originais, e o coletor volta a reusá-las.

**6. Os 26 testes que já falham** (JWT desatualizado). Enquanto existirem, a
suíte tem ruído de fundo que pode esconder uma regressão nova — hoje só foi
possível isolar comparando baseline à mão, e isso não escala.

## Como retomar

Na pasta do seller ML, no terminal:

```
claude
```

E colar:

> Vamos construir o sistema de agentes de avaliação de anúncios do Mercado Livre.
> A spec está em SPEC-AGENTES-ML.md e o contexto em RETOMADA-AGENTES-ML.md.
> Lê os dois e me diz por onde começamos a Fase 0.

Vale rodar `/init` uma vez nessa pasta para gerar um `CLAUDE.md` — assim as
próximas sessões já carregam o contexto do projeto sozinhas.

## Primeira execução em produção — 17/08/2026

O coletor rodou às 06:00 e gravou **133 anúncios, 133 com visitas, zero falhas**.
Execução limpa. O catálogo tem 133 anúncios ativos somando as quatro contas
(YUSO, M12, J12, LOCITECH) — número que faltava desde o início para dimensionar
o limite de detecção.

### Em aberto: semântica da coluna `data`

A execução de 17/08 gravou 133 linhas **com data de 17/08** (as 3 linhas de
16/08 são de teste anterior). Precisa confirmar:

1. A coluna `data` recebe a data da execução ou a do dia anterior?
2. O `buscar_visitas_item` é chamado para o dia corrente ou para o dia anterior
   fechado?

**O correto é coletar o dia anterior completo e gravar com a data dele.** Se
estiver capturando o dia corrente às 06:00, cada linha é um dia pela metade — e
uma série inteira de dias incompletos não serve para comparação, sem que nada
avise.

### Acoplamento implícito na coleta de visitas — corrigir

`coletar_visitas` chama o endpoint com `last=1&unit=day` e **não recebe
`data_alvo` nem passa `ending`** — pede "o último dia" relativo ao momento da
chamada. A coluna `data` recebe corretamente `date.today() - 1`, calculado em
`run_coletor_diario`, mas os dois valores só coincidem porque o job roda às
06:00 BRT.

**Isso é hábito, não garantia.** Disparo manual fora do horário, atraso do
scheduler ou mudança de fuso gravam a visita de um dia com a data de outro —
em silêncio, com `falhou=False`. É exatamente a falha que o projeto existe para
evitar, e o caso não é hipotético: um disparo manual foi tentado em 17/08 fora
das 06:00.

**Correção:** `coletar_visitas` recebe `data_alvo` e envia `ending` derivado
dele. Vale independentemente de o valor bater hoje — remove a dependência de
horário.

**Validação separada:** comparar `total_visits` com e sem `ending` para um item
real responde outra pergunta — se as 133 linhas de 17/08 são confiáveis ou
precisam ser recoletadas. Também define a convenção de borda do `ending` (fim
do dia alvo ou início do dia seguinte), que a doc deixa ambígua.

### Correção de premissa: visita perdida é recuperável em 48h

A documentação do ML indica que as visitas ficam disponíveis por **48 horas**.
Ao longo do projeto foi assumido que dado de visita não coletado nunca volta —
isso é verdade só depois de dois dias.

Consequência prática: o alerta "não coletei ontem" (Fase 1) deixa de ser apenas
um aviso e passa a ter conserto. **Construir a recoleta junto com o alerta** —
detectou, recoleta dentro da janela, salva o dia.

## Bug confirmado nas visitas — e o que ele revelou

### O bug (corrigido)

`last=1&unit=day` **nunca devolve 1 dia**: devolve sempre `last+1` buckets
diários, e `total_visits` é a soma de todos. Confirmado empiricamente (17 sem
`ending` contra 33 com `ending=ontem`; o padrão se repete com `last=5`).

Rodando às 06:00 sem `ending`, o valor gravado sempre misturava "hoje parcial"
com "ontem completo". **Não era risco futuro — era bug ativo desde a primeira
execução.** As 136 linhas já coletadas (133 de 17/08 + 3 de 16/08) estão
contaminadas.

`ending=<data>` inclui essa própria data como último bucket, e ainda assim vem
acompanhada de um bucket extra. Correção aplicada: `coletar_visitas` recebe
`data_alvo`, envia `ending` e **lê o bucket exato de `results[]` por data**,
nunca `total_visits`. Teste novo trava explicitamente contra voltar a somar.

### A premissa que caiu

A API aceita `ending` retroativo — pelo relato, até ~150 dias. Se `last=N`
devolve `N+1` buckets numa chamada, **uma chamada por anúncio traz o histórico
inteiro**: 133 chamadas para meses de série.

Isso derruba a premissa que orientou o projeto desde o início — a de que visita
não coletada nunca volta, e por isso a Fase 0 tinha pressa. **A verificar antes
de contar com isso:**

1. `last=149&unit=day` num item real: quantos buckets voltam, qual a data mais
   antiga, existe teto?
2. Reconciliar as duas leituras da documentação: "disponível por 48 horas"
   (provavelmente tempo até o dado consolidar) contra "150 dias" (alcance do
   histórico). São coisas diferentes e importa saber qual é qual.

Se confirmar, o backfill **substitui o descarte**: as linhas contaminadas têm PK
`(anuncio_id, data)` e são sobrescritas por UPSERT. Uma operação resolve as duas
coisas — não precisa `DELETE`.

E muda o calendário do projeto: em vez de esperar meses acumulando linha de
base, haveria histórico suficiente para a fase de avaliação quase imediatamente,
inclusive para avaliar retroativamente alterações já feitas — desde que estejam
registradas em `ml_eventos`.

### Buckets em UTC — documentado, não corrigido

Os buckets fecham em dia-calendário UTC, não BRT: desvio sistemático de ~3h que
o endpoint não permite eliminar por parâmetro.

Não vale corrigir. O limite do bucket é estável, então comparar um dia contra
outro continua consistente — que é o que a avaliação faz. Onde incomoda é na
conversão, porque visitas vêm em dia UTC e pedidos em dia BRT; mas numa janela
de 7 dias isso afeta só as bordas, menos de 2% da janela, contra um limite de
detecção de 20 a 30%. Some no ruído.

## Backfill concluído — e o volume real do catálogo

**14.117 linhas** em `ml_metricas_diarias`, cobrindo 150 dias × 133 anúncios
(menos os dias anteriores à criação de cada anúncio, corretamente não gravados).

Verificação de integridade: `dias_zero = 5.711`, `dias_com_visita = 8.406`,
`dias_nulos = 0`. **Os dias sem visita foram gravados como zero, não pulados** —
se tivessem sumido, todas as médias viriam infladas em silêncio.

Nota: quatro lotes duplicados disparados por outro fork bateram em
`ON CONFLICT` sem efeito. A regra de escrita idempotente definida na Fase 0b
pagou na primeira vez que foi exercitada de verdade.

### Volume real e limite de detecção

Topo do catálogo (visitas/dia médias em 150 dias): 266, 249, 233, 226, 208,
198, 197, 182, 180, 144, 144, 119, 114 — depois cai para a faixa de 60 a 100.

| Visitas/dia | Menor variação detectável em 7 dias |
|---:|---:|
| 250 | ~14% |
| 180 | ~17% |
| 120 | ~21% |
| 80 | ~25% |
| 40 | ~36% |

### Decisão: a fase de avaliação estatística entra no projeto

Ela estava marcada como opcional, condicionada a este número. Com 266
visitas/dia no anúncio campeão e doze anúncios acima de 114, uma troca de foto
que mexa 15% no CTR é detectável em uma semana — e melhora boa de foto costuma
mexer entre 10% e 30%.

**Ganho extra do histórico:** não é mais preciso usar janelas simétricas de 7
contra 7. Com cinco meses de linha de base, o "antes" pode ser de 28 dias e fica
muito preciso, o que derruba o limite de detecção do campeão para perto de 11%.

### A lista de prioritários deixa de ser palpite

O corte natural fica em torno de 100 visitas/dia — os **doze primeiros** da
consulta de distribuição. Abaixo disso o dado não sustenta avaliação em janela
curta, e esses anúncios ficam só na vigilância de desastre, como já combinado.

### Conversão continua fora de alcance

Mesmo com 150 dias, avaliar mudança de conversão por anúncio exigiria centenas
de vendas semanais num único anúncio. Confirma o que estava previsto: **visitas
se mede, conversão não.** A saída é agregar mudanças semelhantes ao longo do
tempo — Fase 4.

## Fonte de posição nunca funcionou — e falhou em silêncio

`/sites/MLB/search` está **bloqueado pelo ML (403)**. As 39 chamadas de teste
(13 prioritários × 3 keywords) voltaram todas 403. `ml_posicao_diaria` e
`ml_concorrentes_diario` têm zero linha desde sempre.

O bloqueio já era conhecido no repositório: `routes/estudio.py:280` migrou para
`/products/search`. **Essa migração nunca chegou ao coletor de posição.**

### O bug grave é o silêncio, não o 403

A falha **não apareceu em `fontes_falha`**. Uma fonte falhou todos os dias desde
a primeira execução, duas tabelas ficaram vazias, e nada avisou. Isso viola a
regra central do coletor — falha vira ausência registrada, nunca sumiço.

**Prioridade 1:** entender por que o 403 escapou e verificar se as outras quatro
fontes (visitas, detalhe, ADS, concorrentes) têm o mesmo buraco. Se o problema
for estrutural e não específico da posição, qualquer coluna pode estar vazia sem
aviso.

**Isso sobe a prioridade da Fase 1.** O alerta de "não coletei ontem" existe
exatamente para este modo de falha, que agora deixou de ser hipotético.

### Migração para `/products/search` — critério de aceitação

A pergunta não é "consigo extrair um número de posição". É: **esse número é a
mesma ordenação que o comprador vê ao buscar no app?** `/products/search` é
busca de produtos de catálogo, que não necessariamente reproduz a ordenação da
busca de anúncios.

Se não reproduzir, **não migrar**: `ml_posicao_diaria` vazia e honesta é melhor
que uma coluna com número que parece posição e não é.

### Falta guardar `paging.total`

Hoje "não achei nas 5 páginas varridas" (`max_paginas=5 × 50 = 250 resultados`)
e "a keyword não retorna nada" são indistinguíveis no banco. Com o total, o
primeiro caso vira diagnóstico de mau posicionamento e o segundo, de keyword
errada.

## Posição por busca: abandonada. A Fase 2 muda de desenho.

### Correções aplicadas

**Silêncio corrigido.** Causa raiz: `fontes_falha` era montado e gravado por
`upsert_metrica_diaria` **antes** do loop de keywords. Visitas, detalhe e ADS
escrevem na mesma linha da mesma tabela, então cabem no padrão "calcula falhou →
append → uma escrita". Posição e concorrentes escrevem em tabelas separadas, com
N linhas por anúncio/dia e sem coluna própria de falha — só existem quando dão
certo. Não é descuido, é descompasso estrutural, e afeta **apenas esse par**
(as outras três fontes estão limpas). A coleta de posição passou a rodar antes
do upsert, acumulando `posicao_falhou` e anexando a `fontes_falha`.

**`paging.total` implementado** (`ml_posicao_diaria.total_resultados`, migração
027). Distingue "mal posicionado além das 5 páginas varridas" de "keyword sem
resultado relevante".

### `/products/search` reprovado no critério de aceitação

Testado contra keyword real: a busca que o comprador vê traz o item por volta da
posição 26-32, com 1.256 resultados; o `/products/search` não traz o
`catalog_product_id` nos primeiros 1.000 e devolve `paging.total = 10000`, valor
genérico que se repete entre buscas. **Não é a mesma ordenação nem o mesmo
universo.** Migrar produziria um número que parece posição e não é.
`ml_posicao_diaria` fica vazia e honesta.

### Scraping: decidido que não

O dado é obtível pelo navegador — foi assim que a verificação acima foi feita.
**Automatizar isso não vale.** Raspagem da busca viola os termos da plataforma, e
o que fica em risco é a conta que gera todo o faturamento. O prejuízo possível é
o negócio; o ganho é uma coluna. Caminho legítimo, se um dia a posição for
mesmo necessária: ferramenta de terceiro licenciada (Nubimetrics, Real Trends).

### Fase 2 redesenhada: concorrentes por lista, não por busca

Em vez de "quem está acima de mim na busca", passa a ser **"estes concorrentes
específicos"**. Os MLBs dos concorrentes diretos são cadastrados à mão — a
operação já os conhece — e o coletor busca `/items/{id}` de cada um por dia:
preço, título, foto, vendidos. Esse endpoint **não está bloqueado**.

Entrega o alerta que mais importa ("o concorrente X baixou 12% ontem") e perde
só a descoberta automática de concorrente novo, que vira manutenção manual de
meia hora por trimestre para dez anúncios.

### A testar: buy box sem passar pela busca

`GET /products/{catalog_product_id}` pode devolver o vencedor do buy box sem
tocar no endpoint bloqueado. Se funcionar, vale mais que a posição para anúncios
de catálogo — quem perde o buy box perde a venda mesmo bem colocado na busca.
Preencheria o `ganhador_catalogo` que já existe. Verificar também se identifica
**quem** venceu e a que preço.

## SKU: a unidade de avaliação deixa de ser o anúncio

Levantamento sobre os 133 anúncios: **100% têm `SELLER_SKU` preenchido**
(`seller_custom_field` está vazio em todos — campo morto, ignorar). São **73 SKUs
distintos**, e **89% dos anúncios têm irmão** — 58 pares, todos na composição
"um de catálogo + um tradicional".

O catálogo real tem ~73 produtos, não 133 anúncios. Os dois números vinham sendo
usados como se fossem o mesmo.

### Por que isso muda o desenho, não só a arrumação

Anúncios do mesmo SKU **disputam o mesmo cliente**. Quem entra por um não entra
pelo outro. Isso quebra duas coisas:

- **Grupo de controle:** o irmão absorve exatamente o tráfego que saiu, então se
  move na direção contrária e exagera o efeito medido. **Irmão nunca entra no
  controle do outro.**
- **Unidade de avaliação:** trocar a foto do tradicional pode só migrar tráfego
  para o de catálogo — um mostra queda, o outro alta, e as duas leituras estão
  erradas isoladas. **Quando o SKU tem mais de um anúncio, avalia-se a soma.**
  É o que responde a pergunta de negócio: o produto ganhou gente?

### Colisão de SKU: regra, não lista de exceção

Um SKU (FV0020) agrupava três anúncios, um deles produto completamente diferente
— SKU reaproveitado por engano. Lista de exceção manual apodrece, então vale uma
**regra de validação**: um grupo só é válido com exatamente um
`catalog_listing=true` e no máximo um `false`. Grupo inválido → membros tratados
como anúncios isolados (conservador) e o SKU entra na lista de qualidade de dado
do resumo semanal, porque o conserto é humano — corrigir o SKU no anúncio.

### Prioritários redefinidos por volume real, em duas faixas

Somando irmãos, o volume por produto sobe e mais unidades passam a ser
mensuráveis. 75 unidades no total (58 SKUs + 3 do grupo inválido + 14 sem par).

| Faixa | Unidades | Detectável | Janela |
|---|---:|---:|---|
| ≥ 150/dia | 9 | ~9-12% | 7 dias |
| 70-150/dia | 14 | 12-20% | **14 dias** |
| 20-70/dia | 26 | 20-35% | só alarme |
| < 20/dia | 26 | — | fora do ranking |

**23 unidades prioritárias** (43 anúncios marcados), com `janela_deteccao_dias`
explícito em `ml_anuncios` — a calculadora precisa saber qual janela usar por
unidade. O argumento anterior para limitar a ~10 era operacional, mas a
disciplina de "uma mudança por vez" é **por produto**, não global: dá para mexer
em 23 produtos na mesma semana sem atrapalhar medição nenhuma.

Keywords passam a ser compartilhadas entre irmãos (mesmo produto, mesma busca).

## Keywords estão inertes até existir fonte de posição

As keywords só alimentam a coleta de posição, que depende do `/sites/MLB/search`
bloqueado. **Não vale cadastrar as 19 faltantes** — as 13 já cadastradas também
não fazem nada hoje. Pendência condicional: se aparecer fonte de posição
(ferramenta de terceiro ou desbloqueio do ML), preencher o resto.

## Fase 1 — decisões de desenho

- **O alerta do sistema tenta recoletar antes de avisar.** Visitas ficam
  disponíveis por 48h, então falha recuperável não deve virar notificação. Só
  alerta se a segunda tentativa também falhar — e aí a mensagem vira prazo
  ("fora da janela de recuperação em DD/MM"), não informação.
- **Queda de visitas usa 3 dias contra a média dos 14 anteriores**, não um dia
  contra a média. Dia isolado é ruído — o projeto inteiro assume isso, e o
  alarme não deveria ser exceção. Os casos onde velocidade importa (pausado, sem
  estoque) são checagem de status, exatos e imediatos, então a queda de visitas
  pode se dar ao luxo de ser mais lenta e mais precisa.
- **Limiar pelo desvio-padrão histórico do próprio anúncio**, não pela fórmula
  teórica — a fórmula subestima o ruído real (dia da semana, rajadas) e vinha
  sendo corrigida por um fator de 1,5 no olho. Com 150 dias de histórico, o
  desvio empírico mede isso de verdade.
- **Piso de 20 visitas/dia** no ranking e no alarme: abaixo disso a variação
  percentual é dominada por ruído e o alerta vira falso positivo.
- **Supressão de 72h por (unidade, tipo), mas não esconde agravamento.** Alertou
  queda de 30% e no dia seguinte está em 80% — é situação nova.
- **"Última alteração registrada: X"** no alerta de queda. É a informação mais
  acionável da mensagem: separa "eu mexi e estraguei" de "aconteceu algo fora".

### Resumo semanal — resolve a ambiguidade do silêncio

Mudo por padrão tem um problema não tratado: **silêncio é ambíguo** entre "tudo
bem" e "o bot morreu" — desconfiança justificada depois de uma fonte parada em
silêncio por dias. Um resumo semanal fixo resolve sem virar ruído diário.

Conteúdo: linha de saúde (✅ / 🟡 com detalhe), maiores altas e quedas entre as
**75 unidades** (3 a 5 de cada, não a lista inteira — 133 linhas viram três
mensagens e ninguém lê na segunda semana), variação da conta como referência,
contagem dos que ficaram abaixo do piso, e a **tabela completa em anexo (CSV)**
para quem quiser o detalhe.

Consulta sob demanda por anúncio (mandar o MLB e receber relatório) fica para
depois — exige o bot receber mensagens, que é outra peça de infraestrutura.

## Fase 1 e detector de mudanças em produção — 18/08/2026

Cadeia completa no ar: **coletor 06:00 → detector de mudanças 06:10 → alertas
06:20**, mais o resumo semanal segunda 08:30 BRT. 577 testes passando, as 18
falhas pré-existentes de mock de auth intactas.

Entregue: `alertas.py` (diagnóstico com recoleta antes de avisar, alarme de
desastre por SKU, detector de concorrência com estado em `ml_concorrencia_estado`,
resumo semanal com CSV anexo), `sku_grupos.py`, `telegram.py`,
`detector_mudancas.py`, e as correções do coletor (SKU, bug do silêncio, data das
visitas).

**O detector de mudanças destrava a Fase 3.** `ml_eventos` passa a ter escritor —
sem ele não havia o que avaliar, porque avaliação é sobre eventos.

### Primeiro achado real do sistema

No primeiro dia, o alarme pegou o SKU FV0019 (Cabo HDMI 2 metros) caindo de 133,9
para 38,7 visitas/dia com a conta YUSO estável. Olhando a série, não é queda
súbita: amolecimento gradual desde 05/08 e **um degrau discreto em 14/08**
(95 → 52 visitas, -45% em um dia).

Hipótese principal — campanha de ADS desligada — **não é testável ainda**: o
backfill trouxe só visitas, então `ads_*` e `preco` estão nulos em todo o
histórico. O único dia com ADS (17/08) mostra 3 cliques, irrelevante.

Nota de lado: o irmão desse SKU (`MLB4449875867`) faz **zero visitas** há cinco
meses. Vale medir quantos dos 58 pares têm irmão morto.

### Colisão de migrations é sintoma recorrente

Duas sessões numeraram 027/028 simultaneamente — mesma classe de problema dos 79
commits. Correção definitiva: **nomear migrations por timestamp**
(`20260818_1430_nome.sql`) em vez de sequência. Duas sessões em paralelo nunca
colidem, porque o timestamp é único por construção.

### Pendências, em ordem de valor

1. **Backfill de ADS, 90 dias** — testa a hipótese do FV0019 e é pré-requisito
   para separar pago de orgânico em qualquer avaliação.
2. **Preço histórico**, se alguma API permitir recuperar — sem ele metade das
   explicações de queda fica invisível.
3. **Fase 2** — concorrentes por lista curada de MLBs, via `/items/{id}`.
4. **Fase 3** — a calculadora, agora destravada pelo detector de mudanças.

## Caso FV0019 resolvido pela metade — e o que ele provou

Backfill de ADS completo (90/90 dias nas 4 contas, conferido por contagem direta
em `ml_metricas_diarias`, não pela tabela de estado). O job foi removido do
scheduler; `ads_backfill.py` fica no repositório, chamável à mão.

### São dois eventos, não um

| Período | Visitas/dia | Cliques ADS | Gasto/dia |
|---|---:|---:|---:|
| 20/07 a 05/08 | ~175 | ~120 | R$ 40 |
| 06 a 09/08 | ~120 | ~57 | R$ 25 |
| 10 a 13/08 | ~120 | ~12 | R$ 5 |
| 14 a 17/08 | ~42 | ~5 | R$ 1,75 |

**1. A campanha morreu entre 06 e 12/08** — cliques de ~120/dia para ~8, gasto de
R$40 para R$2. É o maior pedaço da perda.

**2. O degrau de 14/08 não é ADS.** No dia 13 a campanha já estava em 8 cliques;
no dia 14, em 3. **Cinco cliques a menos não explicam 43 visitas a menos**
(95 → 52). Essa conclusão não depende de nenhuma hipótese sobre como cliques e
visitas se sobrepõem. O que caiu foi orgânico, e segue sem explicação.

Ambos gravados em `ml_eventos` — os primeiros registros da tabela, origem manual.

### O que o caso provou sobre o desenho

Sem separar pago de orgânico, este anúncio seria lido como "despencou 78%" e a
operação iria caçar problema de foto, título ou preço — quando a maior parte era
verba de publicidade que parou. Era exatamente o risco que justificou tratar ADS
como requisito da calculadora, e não como detalhe.

### Correções que saíram daí

- **O alarme passou a disparar sobre a série orgânica** (visitas − cliques
  pagos), não sobre visitas brutas, com tipo próprio `queda_ads` quando só a
  verba caiu. Quando a queda orgânica dispara, o texto diz se ADS caiu junto ou
  está estável.
- **Dia sem campanha ativa gravava `None`** no coletor, indistinguível de falha
  de coleta. Passou a gravar `0` — mesma regra do resto: nulo é "não sei", zero
  é "não houve".

## Ruído de alerta: o primeiro caso veio de dentro

O diagnóstico do dia 18 alertou `posicao: falhou em 22 anúncios` — condição
**conhecida e aceita** (endpoint bloqueado, decidido não substituir). Alerta
diário sobre algo que ninguém vai consertar é fadiga de alerta pura, e desta vez
a fonte do ruído era o próprio sistema.

Corrigido com `COLETOR_POSICAO_ATIVA` (default `false`): nenhuma chamada ao
endpoint bloqueado, `posicao` não entra em `fontes_falha`, e a limitação vira
**uma linha fixa no resumo semanal** em vez de alerta diário. Religa só pela
variável de ambiente quando existir fonte de posição. Além do ruído, eram 22
chamadas por dia contra um 403 — desperdício e risco extra de bloqueio de IP.

### Defeito herdado, fora de escopo

O resumo diário de vendas (job pré-existente) tem um comentário gerado por LLM
que chega **truncado no meio da frase** em todas as contas: "O destaque do dia
foi", "O Kit 10 Pratos", "performando muito bem, com". Frase pela metade é pior
que frase nenhuma. Arrumar ou remover — não é deste projeto.

## Correção de premissa: conversão talvez seja mensurável

Ficou registrado ao longo do projeto que avaliar conversão por anúncio seria
inviável. Isso foi baseado em volume **estimado**. O resumo de vendas de 18/08
mostra a YUSO com **703 pedidos/dia** — bem acima do que foi suposto.

Nesse patamar, os anúncios do topo podem chegar perto de 100 vendas por semana,
que é onde a conversão começa a sair do ruído. **A medir antes de fechar o
escopo da Fase 3:** pedidos por anúncio nos últimos 30 dias, ordenado por
quantidade.

## Roteamento de alerta — princípio adotado

**Alerta vai para quem consegue agir.** Os alertas da Fase 1 passam a ser
roteados por conta, reusando o `telegram_destinatarios` que já roteia os cards
de pergunta. Duas exceções ficam com a dona do sistema: o **diagnóstico do
coletor** (é sobre a infraestrutura, não sobre loja) e o resumo semanal, cujo
escopo depende de ela acompanhar ou não a operação das outras três lojas.

Bug encontrado no caminho: o lembrete de pergunta pendente ignorava roteamento e
mandava pendências das **outras lojas** para o chat dela, de hora em hora.

## O achado mais valioso do projeto: 16 rupturas de estoque em 90 dias

Descoberto sem coletar nada novo — só olhando o histórico de ADS que já estava
no banco.

**O sinal:** quando o estoque zera, o Mercado Livre **para de exibir a
publicidade paga na mesma hora** (não se anuncia o que não existe). `ads_cliques`
cai a exatamente 0 e volta no dia em que o estoque volta. É um corte seco, muito
mais limpo que a degradação gradual do tráfego orgânico.

**O valor é retroativo.** Não existe histórico de estoque anterior a 17/08, mas
existem 90 dias de ADS — então esse sinal reconstrói rupturas passadas que de
outro modo seriam invisíveis.

### O resultado

**16 episódios, 13 itens, 162 dias-item parados, ~19.755 visitas perdidas.**
Convertendo pela conversão e ticket da própria operação: da ordem de
**R$ 100 mil a R$ 150 mil de faturamento** em 90 dias, ~R$ 16 mil a R$ 25 mil de
lucro. É teto (parte dos clientes voltaria ou compraria o irmão) e ao mesmo tempo
subestima, porque **não inclui a recuperação de posição depois do restock** — que
os casos FV0019 e FV0026 mostram ser real e demorada.

Dois padrões acima do total:

- **`MLB6807816618` (J12): 45 dias parado**, ~7.236 visitas — sozinho, 37% do
  prejuízo de 90 dias. Isso não é atraso de reposição, é anúncio abandonado.
  Marcado no evento como prioridade de investigação humana.
- **`MLB6527556396` (J12): três rupturas em cinco semanas.** Reposição reativa,
  não acidente. Precisa de ponto de pedido, não de reposição mais rápida.

Os dois piores casos são da **J12, que não é a loja da dona do sistema** — o que
sozinho justifica o roteamento por conta.

### Por que os 16 foram registrados em `ml_eventos`

Não pelo histórico — **pela calculadora.** Sem essas janelas marcadas, a Fase 3
avaliaria mudanças feitas durante rupturas e concluiria que a foto nova destruiu
o anúncio. É o veredito "não atribuível" desenhado no início, agora com 16 casos
reais esperando para estragar avaliação.

### Roteamento: pronto, testado e desligado de propósito

O código de roteamento por conta ia entrar em vigor às 06:20 do dia seguinte e
mandar alerta automático para donos de loja que **não sabem que este sistema
existe**. Travado a tempo por `ml_contas.roteamento_alertas_ativo` (default
`false` nas 4 contas).

**Regra:** ligar conta por conta, e só depois de a operação conversar com cada
dono. A primeira coisa que essas pessoas recebem não pode ser um robô apontando
erro na loja delas.

### Conversão: premissa corrigida contra a fonte oficial

O benchmark de "2% a 8% normal" era de e-commerce genérico e não vale aqui.
Conferido direto no painel do Mercado Livre: **14,5% na conta inteira, 20,2% no
maior item** — e o banco bate com o painel (9.834 contra 9.920 visitas, ~1% de
diferença de fronteira de dia).

Consequência para a Fase 3: **a avaliação de conversão entra no escopo**. O
numerador oficial é **unidades vendidas** (é o que o ML usa e o que a operação vê
no painel), mas vale gravar as duas — `conversao` (unidades/visitas) e
`decisao_compra` (pedidos/visitas). São perguntas diferentes: a segunda mede
quantas pessoas decidiram comprar, a primeira inclui o efeito de levar mais de
uma unidade.

## Refinamentos que saíram da investigação das rupturas

### ADS zerado não é sinal de ruptura — é sinal de anúncio fora do ar

O que separa as causas é o **tráfego residual**:

- **Ruptura de estoque:** visitas caem muito mas **não zeram** — o anúncio continua
  na busca mostrando o aviso (FV0019 foi a ~38/dia, FV0026 a ~25/dia).
- **Anúncio pausado ou encerrado:** visitas vão a **zero absoluto** por dias
  seguidos (`MLB6807816618`: 22 dias corridos em zero).

Reclassificação dos 16 episódios: **14 rupturas de estoque, 2 anúncios fora do
ar.** O remédio é diferente — um é compra, o outro é alguém ter desligado e
esquecido.

### Anúncio irmão em zero é normal, não é abandono

Varredura de "anúncios mortos" achou 41 — mas **36 são o irmão tradicional de um
par de catálogo saudável**. Quando existe vencedor de catálogo, todo o tráfego
vai para ele e o tradicional fica em zero **por desenho da plataforma**.

Isso derruba uma leitura anterior deste documento: o irmão do FV0019 tinha sido
apontado como "anúncio morto ocupando lugar" e não é. Sobram **3 pares
genuinamente mortos dos dois lados** (M0012, M0013 em M12; FV0013 em YUSO), todos
de volume baixo — registrados como `sku_sem_trafego_catalogo`, prioridade baixa.

**Lição de método:** cruzar contra o irmão antes de reportar. Zero sozinho não
significa nada.

### Três contas ficaram sem estoque na mesma semana

Entre 10 e 11/08: `MLB6207973114` e `MLB6292603960` (YUSO) e `MLB4700723079`
(LOCITECH) — todos entre os mais vendidos de suas lojas. Registrado como
`investigacao_ruptura_simultanea`.

O cruzamento com `fechamento_compras` **não conclui**, e o motivo é um buraco de
fonte, não ausência de correlação:

- **LOCITECH não existe nessa tabela** — a compra daquela loja não é registrada.
- **As compras não têm SKU.** A empresa compra de fornecedores rotativos (FL,
  LUANA, FLAVIA, MXT, FY) sem vincular ao item, então não há como isolar o
  fornecedor de cada produto no histórico.
- O único sinal concreto: **nenhum pedido de compra registrado para FV0019 e
  FV0026 entre 25/07 e 19/08** — quase duas semanas antes da ruptura. Sugestivo,
  não conclusivo.

**A correção durável é de processo, não de análise: marcar SKU nas compras.**
Sem isso não há como ligar ruptura a fornecedor, calcular prazo de reposição por
produto, nem definir ponto de pedido com base em dado real. É o mesmo padrão do
resto do projeto — a resposta não estava na análise, estava no que ninguém
registrava.

E há um atalho humano que dispensa o banco: a operação sabe de quem compra cada
um dos três itens. Se for o mesmo fornecedor, a pergunta se responde em dois
minutos.

## Relatórios por loja (artefatos)

Dois relatórios de uma página, um por loja, para a operação enviar a cada dono —
**não** como alerta automático. Privados por padrão; cada dono vê só a própria
loja, sem visão consolidada.

- **J12:** cinco paradas, 69 dias, ~9.431 visitas. Caso principal reclassificado
  como anúncio fora do ar, não ruptura.
- **LOCITECH:** uma parada de 3 dias, ~741 visitas. Escrito com enquadramento
  diferente — **começa elogiando**, porque uma interrupção em 90 dias é resultado
  bom e um relatório que dramatiza R$ 700 perde credibilidade. O valor ali é o
  padrão da semana de 10/08, não o prejuízo.

## O achado que fecha o projeto: não falta capital, falta alocação

Construído o **alerta de estoque acabando** (`checar_estoque_acabando`, dentro do
job das 06:20). Dias de cobertura = estoque ÷ média de unidades/dia dos últimos
14 dias **limpos** (excluindo janelas de ruptura e de anúncio fora do ar
registradas em `ml_eventos`). Limiares de 10 e 5 dias, escopo prioritário +
acima de 20 visitas/dia, severidade invertida na supressão (menos dias = mais
grave, então de 9 para 4 reenvia).

**Os limiares saíram do dado, não de palpite.** A hipótese inicial — "os
campeões rodam com 5 dias de cobertura" — **não se confirmou**: a maioria dos
itens com venda real está entre 22 e 90 dias. Há um salto natural na
distribuição de 10,7 para 22,6, e o limiar de 10 cai exatamente nessa lacuna.

### A relação está invertida

| Item | Vende/dia | Cobertura |
|---|---:|---:|
| MLB7320219336 | 51,8 | **0,7 dia** |
| MLB6292603960 | 65,9 | 10,7 dias |
| MLB4510736543 | 39,1 | 6,8 dias |
| MLB7145000214 | 31,3 | 8,8 dias |
| 12 itens de giro baixo | — | 23 a 88 dias |

**Quanto mais o produto vende, menos estoque ele tem.** É o inverso do correto e
explica as rupturas melhor que qualquer hipótese de fornecedor.

### O número

**R$ 179.120,35 imobilizados em itens com cobertura acima de 30 dias.**
**R$ 8.408,06 para levar os três críticos a 15 dias de cobertura.**
Razão de 21 para 1 — menos de 5% do capital já parado resolve o problema inteiro.

Contra o prejuízo medido: R$ 100 a 150 mil de faturamento perdido em 90 dias,
algo entre R$ 400 e 600 mil anualizados.

**Enquadramento honesto:** os R$ 179 mil não são desperdício. Parte é compra
mínima de fornecedor, parte é item sazonal, parte é escolha legítima. O ponto
não é liquidar estoque parado — é que **a próxima compra pode ser 5% diferente**
e o problema desaparece. Registrado em `ml_eventos` como `estoque_desalocado`.

### Uma ruptura ao vivo

O `MLB7320219336` (YUSO) **rompeu em 19/08** — a primeira que o sistema vê
acontecendo, em vez de reconstruir depois. Custo de ~52 unidades/dia,
aproximadamente R$ 2.200 de faturamento e R$ 350 de lucro por dia.

É o pior caso possível: o anúncio tinha **~15 dias de vida e já fazia 144
visitas/dia** — estava em rampa, ainda construindo posição. Ruptura em anúncio
novo não derruba de um patamar consolidado, **interrompe a construção**. A curva
de recuperação dele pode ser bem diferente das outras três, e está sendo
acompanhada desde o primeiro dia.

**Orientação dada à operação:** com estoque zero, **não pausar o anúncio**.
Sem estoque ele continua na busca e segura tráfego residual (~38 visitas/dia no
caso do Cabo HDMI); pausado, vai a zero absoluto e leva mais de um mês para
voltar. Zero estoque machuca, pausar mata.

## A terceira falha silenciosa, e o que a encerrou

`checar_estoque_acabando` **nunca disparou desde que foi implantado** — zero linhas
em `ml_alertas` para esse tipo. A causa não era supressão (a tabela estava vazia
para o dia inteiro) e não era o envio manual (aquele usou `curl` direto, sem
passar por `registrar_alerta`).

O job inteiro morria antes de chegar no item 5, e um `except` genérico engolia
tudo logando só `type(e).__name__`.

### O erro real: `operator does not exist: uuid = text`

`anuncio_ids` chega como lista de `str` (o driver não sabe que são UUID), e **só
1 das 4 queries** tinha `::uuid[]`. As outras três comparavam `uuid` contra o
`text[]` que o psycopg2 manda por padrão.

**Nem a hipótese da operação (date/timestamp) nem a da sessão (exceção na etapa
anterior).** Ninguém adivinharia. O que resolveu foi a blindagem: `try/except`
por etapa, exceção completa na mensagem, e o job avisando sobre a própria morte.

**Correção de classe, não de instância:** `psycopg2.extras.register_uuid()` na
inicialização faz o driver mandar UUID nativo e nenhuma query precisa de cast. O
cast presente em 1 de 4 mostra que esquecer é fácil, e a próxima query nova
reintroduziria o mesmo erro.

### A regra que ficou

**Nenhum `except` pode engolir e seguir.** Ou relança, ou registra em lugar
visível no banco, ou avisa. `except Exception: print(...)` foi a causa das três
falhas silenciosas deste projeto:

1. A coleta de posição, morta por semanas sem registro em `fontes_falha`.
2. O `fontes_falha` que não registrava a falha da posição, por escrever depois do
   commit da linha.
3. O job de alertas inteiro, morrendo no item 5 desde a implantação.

**E há um ponto cego que a blindagem revelou:** o diagnóstico que avisa quando
algo falha **é o item 1 do mesmo job**. Ele rodava, não achava falha de coleta,
ficava calado — e não tinha como avisar que o job onde ele mora morria logo
depois. Auto-diagnóstico não cobre a própria morte, a menos que seja construído
para isso.

### Alarme falso de contabilidade própria

A captura manual do `MLB7320219336` foi marcada dentro de `fontes_falha`, e o
diagnóstico lê tudo naquele campo como fonte que falhou — então o sistema passou
a alertar sobre algo que ele mesmo fez de propósito e deu certo. Corrigido com
uma coluna `origem` (`coletor` / `manual`) em `ml_metricas_diarias`.
`fontes_falha` é lista de falhas, não campo de anotação.

### Primeira detecção de concorrente

O detector de catálogo disparou de verdade: **CASA LX entrou no catálogo do Kit
10 Pratos (J12)** a R$ 25,50 contra os R$ 19,00 da casa. Sem ameaça imediata —
mas é o mesmo produto que ficou 45 dias fora do ar, e uma ausência longa convida
exatamente isso.

## Push bloqueado (commit `4e7d0db`) — resolvido

`git ls-remote origin` e `git push` retornam `Repository not found` (exit 128)
contra `https://github.com/acessoriosm12compras-droid/ml-seller-api-.git`, depois
de pushes terem funcionado no mesmo dia.

Hipótese testada e **descartada**: conflito de credential helper. `credential.
useHttpPath true` foi aplicado e a entrada do Keychain foi apagada — continua
falhando.

Duas hipóteses restantes, e uma delas é constrangedora:

1. **O nome do repositório no remote tem um hífen sobrando** — `ml-seller-api-`
   em vez de `ml-seller-api`. GitHub responde `Repository not found` para repo
   privado inexistente *e* para repo privado sem autorização: a mensagem não
   distingue os dois casos.
2. **O token morreu ou perdeu escopo.** Ontem chegou e-mail de autorização do Git
   Credential Manager na conta; se ele reemitiu credencial, a anterior pode ter
   sido invalidada.

E há um risco novo introduzido pela própria tentativa de correção: com
`useHttpPath true`, a credencial salva em `~/.git-credentials` (gravada sem
path) deixa de casar com a chave procurada, e o git passa a tentar o push sem
autenticação — o que produz exatamente o mesmo 404. **Desfazer o `useHttpPath`
é o primeiro passo**, não o último.

**Regra em vigor enquanto isso:** nenhum commit local novo. `4e7d0db` é correção
defensiva (`register_uuid()`), a produção roda correta sem ela, e commits
empilhados sem push foi exatamente o que gerou a divergência de 79 commits.

### O que era, de fato

**Não existia credencial da conta `acessoriosm12compras-droid` na máquina.** O
que fez o diagnóstico demorar foi o próprio comando de diagnóstico:

```
printf "protocol=https\nhost=github.com\n\n" | git credential fill
```

Sem `username=`, o helper devolve **a primeira** linha de `github.com` do
`~/.git-credentials` — que era da `cibellycarvalho`. O teste respondeu com
sinceridade sobre a conta errada, e a leitura virou "o token não enxerga o
repo" quando o correto era "esse não é o token que se queria perguntar".

**Regra:** todo diagnóstico de credencial precisa mandar `username=`. Sem isso a
resposta é sobre outra conta, e parece uma resposta válida.

E o `Repository not found` do GitHub não distingue *repo inexistente* de *repo
sem autorização* — os dois dão 404. Foi só depois que a URL passou a carregar a
conta explícita que o erro virou `403 Write access not granted`, e aí o
diagnóstico ficou trivial.

### O conserto

1. Usuário explícito no remote: `https://acessoriosm12compras-droid@github.com/...`
2. PAT fine-grained novo na conta dona, com `Contents: Read and write`
3. `git config --local credential.helper store` — o helper não estava declarado
   no config que o repositório enxergava, então o git pulava direto pro prompt
   de senha em vez de usar a credencial gravada

O nome do repositório **com hífen final** (`ml-seller-api-`) está correto.

### Custos

- **Apagar a entrada do Keychain foi orientação minha, e provavelmente destruiu a
  única cópia viva da credencial.** A hipótese do conflito de helpers estava
  certa na direção e errada no autor: não era o Keychain atropelando o store, era
  o store devolvendo a linha errada por falta de `username`.
- O token entrou 3× em texto puro no `~/.zsh_history` durante as tentativas.
  Limpo e verificado (`grep -c` → 0). Sequência de passos parecidos, colados de
  madrugada em duas abas diferentes, produz exatamente esse tipo de vazamento —
  o roteiro era ruim, não a execução.

### Dívida registrada

O PAT fine-grained tem validade máxima de 1 ano. **Quando vencer, o push volta a
falhar sem aviso** — e, se o deploy do EasyPanel usar a mesma credencial, o
deploy morre junto. Anotar a data de expiração e criar lembrete antes dela.

### Estado final

`4e7d0db` empurrado, deploy automático do EasyPanel verde. `register_uuid()` em
produção — nenhuma query nova precisa mais de `::uuid[]`, que era a correção de
classe da terceira falha silenciosa. Regra de não commitar localmente,
suspensa.

## Etapa A do refactor `monitorado`/`status_ml` — em produção

Executada e validada em 21/08/2026, com o ciclo completo rodado manualmente de
dia, observado, em vez de estrear às 06:00 sem ninguém acordado.

**Sequência que funcionou, e cuja ordem não é opcional:** commit local →
backup → migração aditiva (compatível com o código velho, então nada quebra na
janela) → push (o EasyPanel faz deploy automático) → deploy verde → execução
manual dos três jobs em ordem.

### O que a varredura alargada revelou

Filtrar `status=("active",)` era o bug: "sumiu da varredura" e "saiu de active"
eram a mesma coisa, e o `UPDATE ativo = false` fechava o ciclo. Incluindo
`paused` e `closed`:

| Conta | active | paused | closed | total | coletados |
|---|---|---|---|---|---|
| YUSO | 111 | 37 | 6 | 154 | 110 |
| M12 | 8 | 8 | 0 | 16 | 9 |
| LOCITECH | 8 | 1 | 0 | 9 | 8 |
| J12 | 5 | 1 | 0 | 6 | 5 |

**A YUSO tem 37 anúncios pausados e coleta 110 de 154.** Sob o código antigo
esses 44 eram invisíveis — não apareciam em lugar nenhum do sistema.

Ciclo completo: 89,8s para as quatro contas, contra orçamento de 600s. Nenhuma
conta perto do teto de offset. Nenhum `fontes_falha` novo. Nenhum 404 em massa.

### Zero eventos de status não é validação

O `ml_eventos` de tipo `status_ml` veio vazio, e isso é esperado — mas **não
prova que o alerta funciona**. Para nascer um evento, o anúncio precisa de
linha em `ml_metricas_diarias` nos dois dias, e só anúncio monitorado tem
linha. Os 37 pausados da YUSO estão com `monitorado = false`, herdado do
`ativo` que o próprio bug corrompeu. A transição que o refactor existe para
pegar continua invisível até o R1 religar esses anúncios.

Registrar isso importa: "zero eventos" lido sem contexto vira "está tudo bem".

### Fronteira de segredo, de novo

O job de alertas só roda onde o `TELEGRAM_BOT_TOKEN` existe — dentro do
container. A sessão local ofereceu ler o token do painel para rodar na máquina;
recusado, pela mesma regra que valeu para `ML_CLIENT_SECRET`, `DATABASE_URL` e
o token do GitHub. O comando foi colado por mão humana no Console do EasyPanel.

`roteamento_alertas_ativo` verificado **no banco**, não no código: false nas
quatro contas. Os donos de J12, LOCITECH e M12 continuam sem saber que o
sistema existe, que é o combinado.

## A quarta e a quinta falha silenciosa — e a primeira que nós causamos

### Quarta: entrega de Telegram que nunca foi verificada

`enviar_mensagem` checava só o `status_code`. A API do Telegram devolve `200`
com `{"ok": false, "description": ...}` em vários casos de erro — e todos eles
passavam como sucesso. `ml_alertas` guardava `enviado_em`, o timestamp da
**gravação**, e nenhuma coluna guardava o resultado do **envio**.

O sistema registrava entregas que não aconteceram, e não havia como distinguir.

Corrigido com `envio_ok` / `envio_detalhe` em `ml_alertas`, verificação do
campo `ok` do corpo, e resultado por destinatário (antes, 1 falha em 3 sumia
num `print`).

**Gap fechado junto, e ele importava mais que o resto:** quando *todos* os
destinatários falhavam, `registrar_alerta` nem era chamado — o único caso em
que o registro é imprescindível era o único que não registrava. Agora a linha
é sempre gravada e `deve_enviar` ignora linhas com `envio_ok = false`, para que
um alerta que nunca saiu possa ser retentado.

### Quinta: o vocabulário de eventos divergiu da própria refatoração

O alerta de estoque dizia, no texto, que "dias de ruptura ou anúncio fora do ar
não contam". O código que fazia isso existia — e filtrava
`ml_eventos.tipo IN ('ruptura_estoque', 'anuncio_pausado_ou_encerrado')`.

**A Etapa A trocou o gerador de eventos** por `detector_mudancas.py`, que grava
`tipo = 'status_ml'`. Ninguém atualizou o consumidor. Os dois tipos antigos
pararam de ser escritos em 19/08 e 26/06; o filtro seguiu perguntando por eles
e nunca excluiu nada.

Havia ainda um terceiro nome para o mesmo conceito — `'ruptura de estoque'`,
com espaço — de um escritor mais antigo. Nenhum dos três era escrito por código
vivo.

**Esta é a primeira falha silenciosa que este projeto causou em si mesmo.** Duas
peças concordando por string literal, sem nada que force a concordância.

### O efeito, medido no caso real

`MLB6507025790` (DisplayPort→HDMI, SKU FV0027, **3.899 unidades vendidas**)
recebeu em 21/08 um alerta dizendo *"vendendo 1.2/dia"*. A média caiu porque o
anúncio passou quase toda a janela em ruptura — e a exclusão que deveria
descontar esses dias não descontava nada. `dias_limpos = 14` quando o correto
era ~0.

**O anúncio que mais precisava de reposição foi o que pareceu menos urgente.**

Dos 5 anúncios alertados naquele dia, 4 se resolveram sozinhos ou foram
repostos. O único que continuava zerado e pausado 7 dias depois é exatamente
esse. O sistema errou uma vez, e errou onde o acerto valia mais.

### As correções, e a regra que fica

- a exclusão passa a ler `ml_metricas_diarias` (`estoque = 0 OR status <>
  'active'`) — a mesma tabela que a query já lê. **Sem acoplamento por nome de
  evento não há vocabulário para divergir.**
- `TIPO_STATUS_ML` vira constante única, definida por quem escreve e importada
  por quem lê
- modo `sem_base`: quando a janela não sustenta uma estimativa **e** o anúncio
  está zerado ou fora do ar, o alerta sai assim mesmo, dizendo que não há base
  e mostrando o histórico total. **Falta de dado é informação, não motivo para
  calar** — o piso de amostra teria transformado um alerta errado em nenhum
  alerta.
- dia **sem linha nenhuma** deixa de contar como limpo. Ausência de dado estava
  sendo lida como evidência de normalidade — o mesmo defeito numa segunda
  forma, e sem corrigi-lo o caso do FV0027 daria `dias_limpos ≈ 12`, não 0.

**Regra:** nenhuma medição pode tratar ausência de dado como valor. E vocabulário
compartilhado entre módulos não vive em string literal.

## Sexta falha silenciosa: dois agendadores, e um dedup que era aparência

O alerta "✅ voltou a ficar ativo" do `M0016` saiu **duas vezes**, com 3
segundos de diferença e texto idêntico. A causa não estava no alerta.

`ml_eventos` tinha **44 pares duplicados**, quase um por dia desde 20/08 — ou
seja, desde o primeiro dia em que a Etapa A pôs o detector para escrever
eventos. Estava duplicando desde sempre.

### A cadeia

- o `BackgroundScheduler` é instanciado dentro de `create_app()`, e o Gunicorn
  roda `--workers 2`: **cada worker sobe o próprio agendador** e os dois
  disparam o mesmo cron no mesmo segundo (2,2 ms de diferença é assinatura de
  dois processos, não de retry)
- coletor (`847300010`) e alertas (`847300030`) tinham advisory lock. **O
  detector não tinha nenhum** — por isso só ele duplicava
- `_ja_registrado` era um `SELECT` seguido de `INSERT`, sem lock nem
  constraint: *check-then-insert*, a corrida clássica. **Parecia proteção e não
  era**
- e como o dedup de envio é por `evento_id`, dois eventos para o mesmo episódio
  real furavam a supressão: cada um disparava seu próprio alerta

### Correção em duas camadas, as duas

1. advisory lock no detector (`847300020`), no padrão dos outros dois
2. `UNIQUE (anuncio_id, data, tipo)` em `ml_eventos` + `ON CONFLICT DO NOTHING`

O lock evita a corrida; a constraint torna o invariante impossível de violar
mesmo que alguém rode o job de outro jeito depois. **A lição das falhas
anteriores é não confiar em duas peças de código concordarem** — e
check-then-insert é exatamente isso, em forma de corrida.

Limpeza: as linhas de `ml_alertas` dos eventos perdedores foram repontadas
para o sobrevivente antes do delete, então nenhum alerta ficou órfão.

### A janela que a ordem criou

A constraint entrou no banco antes do `ON CONFLICT` entrar em produção. Nesse
intervalo, a corrida deixaria de gerar duplicata e passaria a gerar
`IntegrityError` — trocando um bug barulhento por um possivelmente fatal.
Deploy no mesmo dia fechou a janela. **Migração antes do código é a ordem certa
para mudança aditiva; para constraint, ela inverte o risco.**

### Dívida registrada

O scheduler continua subindo em cada worker. Os locks resolvem o sintoma nos
três jobs do projeto de anúncios; a causa segue lá, e **qualquer job novo
nasce com o mesmo bug**. A correção estrutural é o scheduler subir uma vez só.

## Etapa B concluída

`ativo` → `ativo_deprecado`. Nenhuma query quebrou, ciclo manual rodou limpo.
Junto: `motivo_nao_monitorado`, com `'descontinuado'` no Kit de Tigelas Bambu
(SKU 1367) e nos cabos Cat8 (FV0053, FV0054) — decisão da Cibelly de não
vender mais esses produtos, registrada para não ser redescoberta como
"parados precisando de decisão" daqui a um mês.

Os 3 anúncios do R1 foram religados, incluindo o `MLB7320219336`.

**Efeito colateral não previsto:** o ciclo manual disparou 6 alertas reais
fora de horário. A supressão é por `(unidade_id, tipo)` em 72h e não cobria
essas condições. Não eram duplicatas — eram alertas legítimos chegando sem
contexto. Rodar o ciclo à mão nunca é neutro do lado do Telegram, só do lado
da API do ML.

## Correção de premissa: 07h e 17h são deste mesmo scheduler

Eu afirmei que as mensagens das 07:00 e 17:00 vinham de outro serviço. Vêm de
`_resumo_vendas_job` e `_catalog_report_tarde_job`, no mesmo `scheduler.py` —
eu tinha só os três jobs do projeto de anúncios em vista e generalizei para o
arquivo inteiro.

Consequência aberta: **se esses dois jobs também não têm advisory lock, estão
duplicando mensagem desde sempre** — e ninguém notaria, porque mensagem
repetida no Telegram passa por defeito de aplicativo.

## Escopo definido: só a YUSO, por interruptor

Decisão da Cibelly. J12 e LOCITECH são lojas de possíveis sócios que ela
acompanha — a J12 devagar, a LOCITECH caminhando mas com pouca verba. O fluxo
novo de agentes de anúncio fica só na YUSO até ela decidir estender.

Implementado como flag, não como exclusão no código:

```sql
ALTER TABLE ml_contas ADD COLUMN alertas_anuncios_ativo boolean NOT NULL
  DEFAULT false;
UPDATE ml_contas SET alertas_anuncios_ativo = true WHERE conta_ml = 'YUSO';
```

Ligar outra conta depois é **um UPDATE**. Nenhum `'YUSO'` escrito dentro de
função nenhuma.

**A coleta continua nas 4 contas** — é ela que produz o dado com que a Cibelly
acompanha as outras lojas, e foi ela que gerou os relatórios de J12 e LOCITECH.
O escopo é de alerta, não de coleta.

### Correção de premissa: os terceiros já recebiam mensagem desde junho

Eu venho repetindo há semanas que "os donos das lojas não sabem que o sistema
existe". Estava errado. `telegram_destinatarios` tem chat_id próprio para J12
(desde 15/06) e LOCITECH (desde 23/06), e `catalog_watch` e `resumo_vendas`
enviam para eles por um caminho de roteamento próprio, que **nunca passou por
`roteamento_alertas_ativo`** — esse flag foi criado em 19/08 só para o fluxo de
alertas de anúncio.

Ou seja: a trava que a gente manteve desligada com tanto cuidado guardava uma
porta numa parede que tinha outra porta aberta há dois meses.

Confirmado com a Cibelly que isso é intencional e desejado — são lojas que ela
acompanha. Nada foi quebrado; a premissa é que estava errada. **`catalog_watch`,
`catalog_report_manha/tarde` e `resumo_vendas` ficam exatamente como estão.**

### O agravante que a correção do scheduler resolve de lambuja

Esses dois jobs estão entre os 11 sem advisory lock. De 14 jobs em
`scheduler.py`, só 3 têm — e **8 dos 9 que mandam Telegram não têm nenhum**.
Com dois workers do Gunicorn, é provável que J12 e LOCITECH venham recebendo
cada mensagem em duplicata, todo dia, desde junho. Ninguém notaria: mensagem
repetida no Telegram passa por defeito de aplicativo.

## Sétima forma do mesmo defeito: o portão de entrada

`_anuncios_para_estoque` filtrava por `prioritario = true OR AVG(visitas) > 20`.
Visitas desabam quando o anúncio pausa ou zera — então **a ruptura empurrava o
anúncio para baixo do piso e o tirava da lista antes de qualquer avaliação**.

O `MLB6507025790` (3.899 unidades vendidas, zerado e pausado há 8 dias) tinha
média de 10,1 visitas. Excluído no portão, nunca chegava na lógica de alerta.

**É a terceira vez no mesmo dia que encontramos esta forma:** a ruptura destrói
o sinal que serviria para detectá-la. Média de vendas, contagem de dias limpos,
e agora o portão.

Corrigido com a **mesma** definição de dia limpo usada em todo o resto, mais
teto de 3 alertas por episódio — a Cibelly já foi avisada; insistir vira ruído
sobre algo que ela decidiu não resolver.

**Regra:** todo filtro que decide *o que merece atenção* precisa ser checado
contra a pergunta "este critério sobrevive à condição que ele deveria detectar?"

## A origem real dos 47 pausados — e por que o critério de urgência estava errado

A conta teve **experiência de compra em 30%**. A Cibelly contestou as
reclamações que dava para contestar, e nos anúncios onde a contestação **não
saiu**, o jeito de escapar foi pausar o anúncio e subir um novo com outro SKU.

É essa a origem dos "duplicados". Não é rotina de operação — foi controle de
danos, concentrado no último mês.

### O que eu li errado

Tratei `MLB6507025790` (3.899 unidades vendidas, zerado, pausado) como
emergência de ruptura por horas. Era um anúncio **aposentado de propósito**,
substituído pelo `FV0080`, que está ativo com 2.394 unidades. As unidades que
eu apontei como "estoque no anúncio errado" estavam exatamente onde deviam.

O erro de critério: usei **volume histórico** para medir urgência. Volume
histórico é justamente o que um anúncio aposentado tem de sobra — acumulou a
vida inteira e parou ontem. Não distingue nada.

> **Um anúncio aposentado já vendia pouco quando parou. Um anúncio em ruptura
> vendia bem até o dia em que parou.**

O sinal é a **velocidade nos dias antes da pausa**, não o total acumulado.

### O custo real das rupturas, revisto para cima

Os relatórios de J12 e LOCITECH estimaram o custo de uma ruptura em visitas
perdidas e faturamento de alguns dias. **A conta era maior.**

A cadeia é direta: ruptura → "não despachou / faltou estoque" → e esse motivo
está na lista que o próprio ML classifica como **irreversível** → experiência
de compra ruim que não sai → o anúncio precisa morrer.

Um anúncio com 3.899 vendas acumuladas não vale a soma das vendas de um mês.
Vale posição, histórico, avaliação e giro — e o substituto começa do zero numa
vitrine pior. **O custo de uma ruptura não é o dia parado. É o anúncio.**

### Captura antes das exclusões

A Cibelly vai excluir os pausados com reputação ruim. Quando saírem da API, o
`sold_quantity` acumulado some junto — e com ele a possibilidade de comparar o
anúncio antigo com o que o substituiu. O histórico diário permanece no nosso
banco; o total acumulado, não.

Daí `ml_anuncios_encerrados`: congelar sold_quantity total, velocidade
pré-pausa, data da pausa e janela de métricas, **antes** das exclusões. É
leitura, não muda nada, e é irrecuperável se ficar para depois.

### O agente de contestação do Lucas

Material bem construído — regra de ouro contra inventar fatos, recusa
contestação sem fundamento, para depois de duas recusas, não promete
resultado. E não escreve nada na API: é conversacional, o humano copia e cola.

Eu o classifiquei como "a jusante do problema". É — mas a ferida está aberta
agora, e prevenção não cura o que já aconteceu.

O que este sistema pode somar a ele: **classificar a reclamação contra as duas
listas do ML** (irreversível × contestável) antes de a Cibelly gastar esforço,
**checar a janela de 60 dias** (reclamação fora dela não está impactando, e
contestar é trabalho perdido), e **avisar no dia** em que uma reclamação nova
aparece, enquanto a memória do caso está fresca.

A ordem de serviço completa está em
`docs/ordem-servico-pos-experiencia-compra.md`.
