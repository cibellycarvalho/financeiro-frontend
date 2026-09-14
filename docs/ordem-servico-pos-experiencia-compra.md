# Ordem de serviço — pós-crise de experiência de compra

## Contexto

A conta YUSO teve **experiência de compra em 30%**. A Cibelly contestou as
reclamações contestáveis; onde a contestação não saiu, precisou **pausar o
anúncio e subir um novo com outro SKU**. É essa a origem dos 47 pausados e dos
"anúncios duplicados" — controle de danos no último mês, não rotina.

Ela vai **excluir** os pausados com reputação ruim. Quando saírem da API, o
`sold_quantity` acumulado some junto, e a comparação entre o anúncio antigo e o
que o substituiu fica impossível para sempre.

**Consequência para o critério de alerta:** volume histórico não mede urgência.
Anúncio aposentado tem volume alto por definição — acumulou a vida inteira e
parou ontem. O sinal certo é a **velocidade nos dias antes da pausa**.

---

## A — Captura antes das exclusões · URGENTE · só leitura

Criar `ml_anuncios_encerrados` e congelar, para todo anúncio com
`status_ml <> 'active'`:

```
conta_ml, sku, ml_item_id, titulo,
sold_quantity_total,
vendas_dia_pre_pausa      (média diária nos 14 dias antes de pausar),
data_pausa                (primeiro dia com status <> 'active'),
estoque_ultimo_conhecido,
primeira_data_metrica, ultima_data_metrica,
capturado_em
```

Reportar ordenado por `vendas_dia_pre_pausa` **decrescente** — candidatos reais
a ruptura no topo, aposentados no fim.

## B — Pares antigo → novo · só leitura

Para cada pausado com volume relevante, identificar o anúncio **ativo** que o
substituiu (mesmo produto, título semelhante, mesma conta).

| antigo | vendas/dia antes da pausa | data_pausa | novo | vendas/dia hoje | dias desde a troca | recuperou? |

Caso conhecido para validar o método: **FV0027** (3.899 vendidos, pausado) →
**FV0080** (889 vendidos, ativo, 2.394 em estoque).

Acrescentar `ml_anuncios.substituido_por` (text, nullable). Onde houver dúvida,
`NULL` e listar para a Cibelly — **não adivinhar**.

Responde a pergunta que originou o projeto: quando um anúncio é substituído, o
novo recupera o volume do antigo, e em quanto tempo?

## C — Corrigir o critério de urgência

Trocar volume histórico por velocidade pré-pausa em tudo que classifique
gravidade de anúncio parado, inclusive o modo `sem_base`.

`motivo_nao_monitorado` ganha três valores: `'descontinuado'`, `'substituido'`,
`NULL`. Anúncio com motivo preenchido não gera alerta de estoque. **Quem
preenche é a Cibelly**, a partir da tabela de A.

## D — Escopo YUSO

```sql
ALTER TABLE ml_contas ADD COLUMN alertas_anuncios_ativo boolean NOT NULL
  DEFAULT false;
UPDATE ml_contas SET alertas_anuncios_ativo = true WHERE conta_ml = 'YUSO';
```

J12, LOCITECH e M12 **seguem sendo coletadas** — o dado é usado para acompanhar
essas lojas — mas não recebem o fluxo novo. Nada de `'YUSO'` dentro de função:
ligar outra conta tem que ser **um UPDATE**.

**Não mexer** em `catalog_watch`, `catalog_report_manha/tarde` nem
`resumo_vendas`. São anteriores a este projeto, mandam para J12 e LOCITECH
desde junho, e a Cibelly quer assim.

## E — Camada de reclamações · só viabilidade

1. **Conseguimos ler reclamações com o token atual?** Testar
   `/post-purchase/v1/claims/search`. Escopo dá acesso? Que campos vêm? Dá para
   saber se está aberta ou encerrada — pré-requisito da contestação.
2. **A experiência de compra por anúncio existe na API ou só no painel?**
   `ml_metricas_diarias.health` é qualidade de **cadastro**, não experiência do
   comprador. Verificar, não assumir.
3. **Quantas reclamações a YUSO teve em 90 dias, por motivo?** Separar
   irreversíveis (não despachou, fora do prazo, falta de estoque, defeito, item
   faltando) de contestáveis (expectativa, incompatibilidade, troca de tamanho,
   canal de contato, atraso dentro do prazo).

O item 3 mede o custo real das rupturas e diz quanto ainda há a ganhar com
contestação.

## F — Eleição do scheduler · infra · deploy sozinho · por último

De 14 jobs, só 3 têm advisory lock. Os outros 11 rodam em duplicata nos 2
workers do Gunicorn — 8 mandando Telegram.

Eleição por `pg_try_advisory_lock` de **sessão**, em conexão dedicada de vida
longa (não do pool). Quem obtém instancia o scheduler. **Não usar env var nem
PID** — os workers são idênticos e sem índice estável.

**O modo de falha novo é pior que o antigo:** hoje o problema é rodar duas
vezes; com isso, é não rodar nenhuma. Duplicata incomoda, silêncio some. Então:
log no boot dizendo qual PID assumiu, heartbeat consultável, diagnóstico do dia
seguinte acusando ciclo que não rodou, e os 3 locks existentes mantidos como
rede.

---

**Ordem:** A (hoje) → B → C → D → E → F. Parar e reportar entre cada uma. Uma
mudança por vez. Migração antes do deploy do código que a usa.
