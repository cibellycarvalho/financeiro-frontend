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

CREATE TABLE ml_sold_quantity_diario (
  anuncio_id     uuid NOT NULL REFERENCES ml_anuncios(id) ON DELETE CASCADE,
  data           date NOT NULL,
  sold_quantity  int  NOT NULL,
  PRIMARY KEY (anuncio_id, data)
);
```

**Atenção ao `UPDATE monitorado = ativo`:** `ativo` já está errada hoje pelo
próprio bug — anúncio que esgotou, o ML fechou e sumiu da varredura antiga
está com `ativo = false`. Esses herdam `monitorado = false`, ou seja, o
refactor entraria em produção carregando adiante a cegueira que ele existe
para corrigir. Corrigido por R1, que virou bloqueante da Etapa B.

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

**A varredura passa a incluir `paused` e `closed`.** `buscar_anuncios_ativos`
filtrava `status=("active",)` por default — então "sumiu da varredura" e "saiu
de active" eram a mesma coisa, e o `UPDATE ativo = false` de L298–299 era
literalmente o bug desta OS. Alargar o filtro faz o anúncio pausado ou fechado
voltar a aparecer, com o status real, sem nenhuma chamada extra.

O caminho `/items/{id}` por anúncio ausente continua existindo, mas só para
quem está no banco e não aparece nem na varredura alargada — caso raro. Como
fluxo diário permanente ele custaria 1 chamada por anúncio fechado por dia,
para sempre.

**Risco a verificar:** `/users/{id}/items/search` tem teto de offset (1000;
além disso exige `search_type=scan`). Com o filtro alargado uma conta grande
pode passar do teto, e o sintoma é a varredura devolver os primeiros N e parar
**sem erro**. Registrar o total devolvido no log de cada varredura; total que
bate em múltiplo redondo é truncamento, não coincidência.

**Guarda contra 404 em massa:** se um token perder escopo de uma conta, é
plausível que o ML devolva 404 em vez de 403 — e a conta inteira viraria
`nao_encontrado` de uma vez. Se mais de 30% dos anúncios de uma conta derem
404 na mesma execução, não gravar `nao_encontrado`: registrar em
`fontes_falha` e alertar.

- os dois laços ficam separados: `sync_ml_anuncios` varre **todos** os
  anúncios da conta (active/paused/closed) para upsert e `sold_quantity`;
  a coleta de métricas roda só sobre `monitorado = true`
- filtrar a coleta de métricas por `monitorado = true`
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
- no `resumo_semanal`: seção "anúncios não monitorados cujo `sold_quantity`
  subiu nos últimos 7 dias", lida de `ml_sold_quantity_diario`. É a rede de
  segurança do `DEFAULT false`.

  A primeira versão deste critério era circular e não funcionaria: dizia
  "não monitorados com visita nos últimos 7 dias", mas não se coleta visita
  de anúncio não monitorado. `sold_quantity` vem da varredura, que passa por
  todos — custo zero de API. Como é valor cumulativo, precisa de série
  histórica, daí a tabela própria em vez de uma coluna.
- `status_ml = 'nao_encontrado'` por 7 dias seguidos entra no resumo como
  "candidato a desmonitorar". A decisão continua humana.

### A6. Deploy e observação

Deploy do código novo. **Observar um ciclo diário completo** (06:00 coletor,
06:10 detector, 06:20 alertas) antes de seguir para a Etapa B.

---

### A7. Decisão sobre `ativo` durante a janela

O coletor **para de escrever em `ativo` já no A3**, em vez de manter as duas
semânticas em paralelo até a Etapa B. Manter `ativo` fresca exigiria uma
segunda varredura com o filtro antigo, só para alimentar uma coluna que o A2
confirmou não ter nenhum leitor fora desta OS.

O custo da decisão: entre o A6 e a Etapa B, `ativo` fica **desatualizada em
silêncio**. Se existir um leitor que o A2 não viu, ele passa a receber dado
velho em vez de erro — que é pior que quebrar. Duas condições compensam isso:

- **(a)** antes da Etapa B, procurar `SELECT *` sobre `ml_anuncios` nos **dois**
  repositórios — `ml-seller-api` e `ml-seller-app`. O A2 grepou só o backend.
  Verificar também se existe VIEW no banco sobre a tabela.
- **(b)** a Etapa B roda no dia seguinte ao ciclo verde, não "quando der". A
  janela de dado velho tem que ser curta e conhecida.

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

### R1. Reconciliação — **bloqueante da Etapa B**

Com a varredura alargada isso deixou de precisar de API. Depois do primeiro
ciclo verde:

```sql
SELECT ml_item_id, titulo, status_ml, conta_ml
FROM ml_anuncios
WHERE monitorado = false AND status_ml = 'active'
ORDER BY conta_ml;
```

É a lista dos anúncios que estão **vivos no Mercado Livre e que o sistema
parou de olhar** — provavelmente explica parte dos 16 episódios de ruptura
encontrados em 90 dias. A decisão de religar cada um é humana. O script com
`/items?ids=` que estava planejado aqui foi descartado.

### R2. Preencher o buraco das curvas de recuperação

Verificar se as três medições em andamento têm falha no histórico — e, se
tiverem, **preencher**. `/items/{id}/visits/time_window` devolve histórico; foi
assim que se fez o backfill de 150 dias. Só verificar não basta: sem o
preenchimento as curvas continuam quebradas depois do refactor, que era metade
do motivo de fazer o refactor.
