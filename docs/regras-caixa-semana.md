# Regras da Caixa da Semana

O que a tela calcula, e por quê. Escrito aqui porque são decisões da Cibelly
sobre o dinheiro dela — não são escolhas de implementação, e ninguém deve
mudá-las sem falar com ela.

## A conta

```
   Entra na semana              repasses do Mercado Pago, segunda a domingo —
                                o que já caiu e o que ainda vai cair
 − Boletos da semana            os de Contas a Pagar que vencem na semana,
                                pagos ou não, mais atrasados em aberto
 − Pagamentos a fornecedor      todos os lançados na semana
 − Pagamentos a funcionários    pagamento do mês e DAS pagos na semana
 ─────────────────────────────
 = Sobra para comprar
```

Ditada por ela em 17/09/2026, depois de uma tarde em que a tela tentou partir do
saldo em conta: *"o que sobra para comprar é o que entra na semana menos os
boletos a pagar menos o que foi pago a fornecedor"*. É **fluxo da semana**, não
saldo: o que as vendas trouxeram menos o que a semana levou. O que sobra é o que
dá para comprar produto novo **sem mexer na reserva**.

O saldo em conta (Sicredi) fica na tela **só como informação**. Ele carrega
resgate de reserva e sobra de semanas anteriores; entrando na conta, a tela
dizia "tem 98 mil para gastar" numa semana em que as vendas mal cobriram a
Flávia. Por isso também não existe mais a regra do "pago antes de digitar o
saldo": sem saldo na conta, não há o que descontar duas vezes. Todo pagamento
da semana sai; o botão "Não descontar" continua, por escolha dela.

Horizonte único: **segunda a domingo**. A agenda do Mercado Pago é colada
inteira, os sete dias; o que já caiu conta tanto quanto o que vai cair.

## A Flávia vencida é informativa; o que sai é o pagamento

Pedido dela em 17/09/2026: o vencido da Flávia **não entra em nada** — nem
soma, nem subtrai. O que sai da sobra é o pagamento, quando ela paga: pelo
botão "Pago" no pedido ou lançando em Fornecedores › FL. Vale igual para
qualquer fornecedor.

A reserva **não** entra nessa conta, nem somando nem subtraindo — ver abaixo.

## A caixinha "Pago" do pedido

Pedido dela em 17/09/2026. Ela paga pedido específico — o Pix de 49.310 de 14/09
foi os pedidos de 10 e 11/08 —, mas a tela distribuía todo pagamento do mais
antigo para o mais novo, começando pelo saldo de julho. O vencido saía errado.

Cada pedido tem a caixinha "Pago" (em Fornecedores e na Caixa da Semana):
- **Lançar pagamento**: cria o pagamento do valor do pedido, amarrado a ele. É o
  que sai da sobra da semana.
- **Pix já lançado**: só marca, para pedido antigo cujo Pix já está em
  Fornecedores. O backend recusa se os pagamentos soltos não cobrem o pedido.
- Pedido subido com comprovante ("já foi pago") nasce marcado.
- Desmarcar apaga o pagamento amarrado ao pedido.

Pedido marcado consome o próprio valor do total pago; só o que sobra desce do mais
antigo para o mais novo.

## A reserva não é dinheiro disponível

A reserva está **aplicada**, fora da conta corrente. Então ela não é subtraída:
não há o que subtrair, porque o saldo em conta que a Cibelly informa já não a
contém. Subtrair de novo diminuiria duas vezes o mesmo dinheiro.

E ela não é para uso geral. Regra da Cibelly, nas palavras dela:

> O valor da reserva não é pra ser usado em qualquer situação. É pra ser usado
> só em emergência. E emergência é quando a gente precisa comprar um produto,
> acha um fornecedor que tem pra repor nosso estoque, e não pode perder a
> oportunidade de fazer a compra. Aí sim usa esse dinheiro. Caso contrário não
> vai ficar utilizando durante as compras mensais, as semanais, sem necessidade.

Ou seja: **reposição que não pode esperar**, não compra de rotina.

Por isso a tela mostra a reserva como um número **à parte**, e nunca somada à
sobra. A regra de quando usá-la fica aqui, **não na tela** — ver a seção
seguinte.

## A tela informa; quem decide é a Cibelly

Pedido dela, em 14/09/2026:

> Quero que o painel financeiro apenas me mostre as informações e eu vou decidir
> o que fazer. Se vou tirar dinheiro da reserva ou não, e etc.

Então a tela **não recomenda, não aprova e não reprova**. Ela diz o que entrou,
o que sai, quanto tem em cada lugar e em que dia o acumulado passa de tal valor.
Nenhuma frase do tipo "pagar nesta semana", "cabe", "não fecha" ou "a reserva é
só para emergência".

Isto não é preciosismo de texto: um painel que opina vira um painel que se
discute em vez de se consultar, e quando ele erra a premissa — como já errou com
data e com boleto — o conselho errado tem mais força que o número errado.

A regra da reserva **continua valendo** e continua escrita acima. A diferença é
que ela é um acordo dela com ela mesma, guardado aqui, e não um aviso que a tela
repete toda semana.

## A regra dos 30 dias é só da Flávia

Pagamento a fornecedor neste sistema não é amarrado a pedido (migração 005): é
um registro corrido de valores e datas. Então a dívida por data se descobre
consumindo os pedidos do mais antigo para o mais novo com o total já pago.

O que sobra descoberto **e passou de 30 dias** é o que está vencido. É a conta
que a Cibelly já fazia de cabeça: *"até o dia 5 eu paguei, devo os dias 10 e
11"*.

Os outros fornecedores não têm esse prazo combinado. A exceção está escrita como
exceção no código (`APELIDO_FORNECEDOR_COM_PRAZO`), não como configuração
genérica que só tem um caso.

### O saldo sem data é dívida, não incógnita

Existe uma linha de pedido sem data: é o saldo devedor que vinha rolando de mês
em mês antes do painel — o saldo de abertura. É a dívida mais antiga que existe,
então conta como vencida, com o rótulo "Saldo de meses anteriores".

Deixá-la de fora subestimava justamente a parte que precisa ser paga primeiro.

## Boletos: os da semana, pagos ou não, mais os atrasados

Boleto que vence na semana é dinheiro que a semana leva — pago ou não. Ela
lançou Meli+ e Merke em Contas a Pagar, pagou, e o card mostrou R$ 0
(17/09/2026): "o boletos a pagar tem que informar os boletos que eu coloquei".
Atrasado em aberto entra também (e atrasado pago nesta semana, pela mesma
razão). Boleto antigo já pago fica de fora.

## Funcionários: pagamento e DAS saem da sobra

Decisão dela em 17/09/2026, ao criar a aba Funcionários: o que foi pago a
prestador (MEI) na semana — o pagamento dos serviços e o DAS, que a empresa
paga — **sai da sobra**, como linha própria. O DAS em aberto não sai de lugar
nenhum até ser pago. O mês de competência (o do serviço) é só organização da
aba; a Caixa desconta cada valor na semana em que foi pago.

## O repasse previsto vem dela, não do banco

Não há conciliação bancária (o Pluggy foi removido em 08/09/2026), e ela decidiu
não pagar por isso. O previsto sai dos lançamentos futuros do Mercado Pago, que
ela cola na tela.

Quando o sync do Mercado Pago traz o valor real (`origem = 'pluggy'`), a tela usa
o real e mostra o previsto riscado, em vez de fazê-lo desaparecer sem explicação.

## Pendência que bloqueia a caixa de colar

`routes/repasses.py` não tem `PUT` nem `DELETE` — em Repasses só dá para
adicionar. Um lançamento errado é definitivo, e isso já vale hoje.

Enquanto não existir, qualquer botão que lance repasse de uma vez precisa travar
depois do primeiro uso da semana, porque colar duas vezes somaria sem ter como
desfazer. Código dos endpoints em `docs/endpoints-editar-apagar-repasse.md`.
