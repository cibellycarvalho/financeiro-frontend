# Regras da Caixa da Semana

O que a tela calcula, e por quê. Escrito aqui porque são decisões da Cibelly
sobre o dinheiro dela — não são escolhas de implementação, e ninguém deve
mudá-las sem falar com ela.

## A conta

```
   Saldo em conta hoje          (só a conta corrente — a reserva está aplicada)
 + Repasse previsto da semana
 − Boletos da semana e atrasados
 − Pagamentos a fornecedor lançados na semana
 ─────────────────────────────
 = Sobra para comprar
```

## A Flávia vencida é informativa; o que sai é o pagamento

Pedido dela em 17/09/2026: o vencido da Flávia **não** sai da sobra só por
existir. Sai quando ela paga — pelo botão "Marcar como pago" na Caixa da Semana
ou lançando o pagamento em Fornecedores › FL. Vale igual para qualquer compra
de fornecedor subida com comprovante: o pagamento dela sai da sobra.

O saldo em conta é digitado à mão, então o que foi pago **antes** de digitá-lo
já não está nele e não é descontado de novo. Pago em dia anterior ao saldo: fora.
No mesmo dia: fora se foi lançado antes de o saldo ser digitado. O caso que
escapa: pagar, digitar o saldo e só depois lançar o pagamento — sai duas vezes.

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
