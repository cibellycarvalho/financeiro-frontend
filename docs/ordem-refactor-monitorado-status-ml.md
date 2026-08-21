# Ordem de serviço — separar `monitorado` de `status_ml`

Contexto: `ml_anuncios.ativo` responde duas perguntas com uma coluna só — "eu
quero acompanhar este anúncio?" (decisão nossa) e "o anúncio está no ar?"
(estado da plataforma). Quando o estoque zera, o ML fecha o anúncio, `ativo`
vira `false` e o coletor para de coletar exatamente quando os alertas mais
importam. As três curvas de recuperação em medição ficam com buraco no meio,
que é o trecho que interessa.

**A ordem abaixo é dividida em duas etapas de propósito.** A renomeação de
`ativo` quebra o código antigo — e tem que quebrar. Mas se ela rodar junto com
o deploy, a janela entre migração e deploy pode pegar o job das 06:00 e matar o
coletor de madrugada, sem ninguém olhando. Que é o modo de falha que este
projeto inteiro combate.

---

## ETAPA A — hoje (compatível com o código antigo)

### A1. Migração aditiva

Arquivo novo. Não editar migração já aplicada. `ativo` fica intocada.

```sql
ALTER TABLE ml_anuncios ADD COLUMN monitorado boolean NOT NULL DEFAULT false;
ALTER TABLE ml_anuncios ADD COLUMN status_ml text;
UPDATE ml_anuncios SET monitorado = ativo;
```

`DEFAULT false` é proposital: anúncio novo **não** entra em monitoramento
sozinho. Os irmãos tradicionais de catálogo ficam em zero por design (36 dos 41
"mortos" eram isso) e entrariam em massa com default `true`. O risco do
`false` é esquecer um anúncio real — coberto por A5.

`monitorado` **não é** `prioritario`. `monitorado` = coleta diária básica.
`prioritario` = ciclo de avaliação, com posição e keywords. Camadas diferentes.

### A2. Levantamento antes de mexer em código

`grep` por `ativo` em todo o projeto. Listar cada ocorrência com arquivo e
linha, classificando em:

- **(a) filtro de quais anúncios processar** → vira `monitorado`
- **(b) leitura de estado da plataforma** → vira `status_ml`

Casos ambíguos: perguntar, não adivinhar.

**Mostrar esse levantamento antes de escrever qualquer código.**

### A3. Coletor (`services/coletor_ml.py`)

- filtrar por `monitorado = true`
- em `coletar_detalhe`, gravar o status de `/items/{id}` em
  `ml_anuncios.status_ml`, além do `ml_metricas_diarias.status` que já existe
- **só escrever `status_ml` quando a chamada teve sucesso.** Falha vai para
  `fontes_falha`, que é campo de falhas — não para o campo de estado. Gravar
  `NULL` no erro faria parecer uma transição e dispararia alerta errado.
- `/items/{id}` com 404 (anúncio deletado) grava `'nao_encontrado'`. `NULL`
  significa "nunca coletado", que é outra coisa.
- anúncio `closed` ou `paused` **continua sendo coletado** enquanto
  `monitorado` for true. É o histórico do buraco que permite medir a
  recuperação depois.

### A4. Detector (`services/detector_mudancas.py`)

Transição de status vira linha em `ml_eventos`, tipo `status_ml`, com
`valor_antes` / `valor_depois`. As curvas de recuperação precisam da fronteira
do evento.

**A detecção compara o `status` de hoje com o de ontem em
`ml_metricas_diarias`** — a tabela tem histórico. Não comparar contra
`ml_anuncios.status_ml`, que é cache e pode estar velho pelo motivo de A3.

### A5. Alertas (`services/alertas.py`)

- alerta novo, severidade crítica: anúncio monitorado saiu de `active`.
  Pausar custa mais que zerar estoque — dado do próprio projeto: pausado vai a
  zero absoluto e leva mais de um mês para voltar; zerado segura tráfego
  residual.
- **um alerta por episódio**, não um por dia enquanto durar. Mensagem de volta
  quando reabrir. Reaproveitar a supressão que `checar_estoque_acabando` já
  faz — não escrever outra.
- `checar_estoque_acabando` e os demais **não** filtram por `status_ml`. Só por
  `monitorado`.
- o diagnóstico não alerta "sem coleta" para anúncio com `status_ml = closed`:
  não é falha, é estado.
- no `resumo_semanal`: seção "anúncios não monitorados com venda ou visita nos
  últimos 7 dias". É a rede de segurança do `DEFAULT false` — nada fica
  esquecido em silêncio.

### A6. Deploy e observação

Deploy do código novo. **Observar um ciclo diário completo** (06:00 coletor,
06:10 detector, 06:20 alertas) antes de seguir para a Etapa B.

---

## ETAPA B — depois de um ciclo verde, e de dia

```sql
ALTER TABLE ml_anuncios RENAME COLUMN ativo TO ativo_deprecado;
```

Qualquer query que ainda leia `ativo` quebra agora, de forma visível, com
alguém olhando. É esse o objetivo. Remover a coluna só depois de uma semana
sem incidente.

---

## Tarefas paralelas (não bloqueiam A nem B)

### R1. Reconciliação — somente leitura

Script separado que, para cada anúncio com `monitorado = false`, consulta o ML
e imprime tabela: `ml_item_id`, título, status no ML, estoque. **Nenhum
UPDATE.** O objetivo é achar anúncios vivos no ML que ficaram fora do
monitoramento por causa da coluna antiga. A decisão de religar é humana.

Usar `/items?ids=` em lotes de 20, não uma chamada por anúncio.

### R2. Preencher o buraco das curvas de recuperação

Verificar se as três medições em andamento têm falha no histórico — e, se
tiverem, **preencher**. `/items/{id}/visits/time_window` devolve histórico; foi
assim que se fez o backfill de 150 dias. Só verificar não basta: sem o
preenchimento as curvas continuam quebradas depois do refactor, que era metade
do motivo de fazer o refactor.
