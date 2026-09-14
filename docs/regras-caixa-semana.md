# Regras da Caixa da Semana

O que a tela calcula, e por quê. Escrito aqui porque são decisões da Cibelly
sobre o dinheiro dela — não são escolhas de implementação, e ninguém deve
mudá-las sem falar com ela.

## A conta

```
   Saldo em conta hoje          (só a conta corrente — a reserva está aplicada)
 + Repasse previsto da semana
 − Flávia (FL) vencido
 − Boletos da semana e atrasados
 ─────────────────────────────
 = Sobra para comprar produto
```

A reserva **não** entra nessa conta, nem somando nem subtraindo — ver abaixo.

Horizonte único: **segunda a domingo**. O número que estava no lugar disto
somava três horizontes diferentes (mês, mês e sempre) e por isso não servia para
decidir nada.

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

Por isso a tela mostra a reserva como um número **à parte**, com a regra escrita
do lado — e nunca somada à sobra. O momento em que a reserva vira compra comum é
justamente o momento em que ninguém está lembrando para que ela existe; deixar a
regra na tela é mais confiável que deixar na cabeça.

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

## Boletos incluem os atrasados

A Cibelly pediu "quanto tenho de boleto pra pagar na semana". A tela soma os que
vencem na semana **mais** os que já passaram do vencimento e continuam abertos.
Ignorar os atrasados subestimaria o que precisa sair do caixa — e eles não
deixam de existir por terem vencido.

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
