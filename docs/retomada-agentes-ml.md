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

## Pendências

1. **Números de volume** — visitas/dia e vendas/semana de três anúncios
   (campeão, mediano, fraco) + total de anúncios ativos. Ordem de grandeza
   basta. **Decide se a fase de avaliação estatística entra no projeto.**
2. **Hostinger** — VPS ou compartilhada? O painel tem cron job?
3. **Termos de busca** por anúncio, para a coleta de posição orgânica.

## Fora do escopo, mas registrado

`client_secret` e `refresh_token` estão em texto puro na tabela `ml_contas`,
protegidos só por RLS. Juntos dão acesso completo à conta ML, e uma auditoria
anterior já achou credenciais vazadas no histórico do git. Cifrar essas colunas
merece tarefa própria — **não absorver no escopo deste projeto.**

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
