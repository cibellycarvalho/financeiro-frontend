# Retomada — agentes de avaliação de anúncios ML

Arquivo de contexto para continuar o trabalho em outra sessão (terminal, no Mac).
A spec completa está em `spec-agentes-avaliacao-anuncios-ml.md`, nesta mesma pasta.
Este arquivo guarda só o que ficou fora dela.

## Onde estamos

Spec escrita e revisada. **Nada implementado.** Próximo passo é a Fase 0
(coletor + tabelas), que não depende de nenhuma decisão pendente.

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

## Pendências

1. **Números de volume** — visitas/dia e vendas/semana de três anúncios
   (campeão, mediano, fraco) + total de anúncios ativos. Ordem de grandeza
   basta. **Decide se a fase de avaliação estatística entra no projeto.**
2. **Hostinger** — VPS ou compartilhada? O painel tem cron job?
3. **Termos de busca** por anúncio, para a coleta de posição orgânica.

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
