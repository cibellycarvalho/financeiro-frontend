# Retomada — agentes de avaliação de anúncios ML

Arquivo de contexto para continuar o trabalho em outra sessão (terminal, no Mac).
A spec completa está em `spec-agentes-avaliacao-anuncios-ml.md`, nesta mesma pasta.
Este arquivo guarda só o que ficou fora dela.

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

## Fase 0b — implementada, com dois bloqueios antes de produção

Entregue: `migrations/024_agentes_ml.sql` (7 tabelas), `services/coletor_ml.py`
(fontes estritas, upserts idempotentes, advisory lock `847300010`), job às 06:00
BRT no scheduler, `max_elapsed_seconds` por chamada no `ml_http`, 23 testes
novos, zero regressão.

### Bloqueios

1. **Anúncio de catálogo grava posição errada em silêncio.** A busca por termo
   lista o vencedor do catálogo, não o item individual — procurar pelo
   `ml_item_id` devolve posição errada ou nenhuma. Número errado é pior que
   buraco e viola a regra do coletor. Corrigir com `catalog_listing` e
   `catalog_product_id` em `ml_anuncios`, usando o `catalog_product_id` como
   `search_id` quando for o caso. Até estar certo: `NULL` + `fontes_falha`.
2. **Aplicar a migração no Supabase.** Migrações não rodam sozinhas neste
   projeto. Enquanto não for aplicada, o job das 06:00 falha todo dia.

### Ação que só a operação pode fazer

Marcar `prioritario` e preencher `keywords` (até 3 por anúncio). Sem essa lista,
a fonte de posição não coleta nada. Palpite serve — ajusta-se depois, e cada dia
sem coletar não volta.

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
