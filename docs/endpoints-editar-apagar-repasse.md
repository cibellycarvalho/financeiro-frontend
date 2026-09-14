# Editar e apagar repasse — o que falta no backend

## Por que

Em Fornecedores a Cibelly tem liberdade total: cria, edita e apaga pedidos e
pagamentos. Em **Repasses ela só consegue adicionar** — `routes/repasses.py` tem
`GET`, `POST`, `sync-mp` e `saldo`, e nada mais. Nem a tela nem o backend têm
como corrigir.

Isso já a afeta hoje, independente de qualquer funcionalidade nova: **um repasse
digitado errado fica lá para sempre**, e entra em todas as contas do painel
daquele mês. Foi o que apareceu quando ela pediu para colar os lançamentos
futuros do Mercado Pago — um botão que soma e não desfaz é pior que um campo de
digitar.

## A trava que importa

**Só repasse manual pode ser editado ou apagado.** Os que vêm do sync do Mercado
Pago (`origem = 'pluggy'`) são apagados e reinseridos a cada sincronização — ver
o `DELETE ... WHERE origem = 'pluggy'` em `sync_mp`. Deixar editar um deles
criaria um valor que a próxima sincronização sobrescreve **em silêncio**, e a
pessoa não teria como saber que a correção dela foi desfeita.

Melhor recusar com uma mensagem clara do que aceitar e desfazer escondido.

## Código para acrescentar em `routes/repasses.py`

```python
def _repasse_manual(repasse_id):
    """Devolve o repasse se ele existir E for manual; senão, (None, resposta de erro).

    A distinção não é burocracia: repasse de origem 'pluggy' é reescrito pelo
    sync do Mercado Pago a cada execução. Editar um deles daria à pessoa a
    impressão de ter corrigido algo que a próxima sincronização vai desfazer sem
    avisar.
    """
    rows = db.query(
        "SELECT id, origem FROM fin_repasses_ml WHERE id = %s",
        (repasse_id,)
    )
    if not rows:
        return None, (jsonify({"error": "Repasse não encontrado"}), 404)
    if rows[0]["origem"] == "pluggy":
        return None, (jsonify({
            "error": "Este lançamento vem da sincronização do Mercado Pago e é "
                     "reescrito a cada sincronização. Para corrigir, sincronize "
                     "o mês de novo."
        }), 409)
    return rows[0], None


@bp.put("/<repasse_id>")
@require_auth
@require_admin
def editar(repasse_id):
    atual, erro = _repasse_manual(repasse_id)
    if erro:
        return erro

    data = request.get_json() or {}

    try:
        valor = float(data.get("valor"))
    except (TypeError, ValueError):
        return jsonify({"error": "valor inválido"}), 400
    if valor <= 0:
        return jsonify({"error": "valor deve ser maior que zero"}), 400

    data_ref = data.get("data_referencia")
    if not data_ref:
        return jsonify({"error": "data_referencia obrigatória"}), 400

    tipo = data.get("tipo", "repasse")
    if tipo not in TIPOS_VALIDOS:
        return jsonify({"error": f"tipo inválido. Valores: {sorted(TIPOS_VALIDOS)}"}), 400

    conta_ml = data.get("conta_ml", "")
    if conta_ml not in CONTAS_VALIDAS:
        return jsonify({"error": f"conta_ml inválida. Valores: {sorted(CONTAS_VALIDAS)}"}), 400

    row = db.execute(
        """UPDATE fin_repasses_ml
              SET tipo = %s, valor = %s, data_referencia = %s,
                  descricao = %s, conta_ml = %s
            WHERE id = %s
        RETURNING *""",
        (tipo, valor, data_ref, data.get("descricao"), conta_ml, repasse_id)
    )
    return jsonify(row)


@bp.delete("/<repasse_id>")
@require_auth
@require_admin
def excluir(repasse_id):
    _, erro = _repasse_manual(repasse_id)
    if erro:
        return erro

    db.execute("DELETE FROM fin_repasses_ml WHERE id = %s", (repasse_id,))
    return "", 204
```

## Testes que valem a pena

1. `PUT` e `DELETE` em repasse manual funcionam e devolvem 200 / 204.
2. `PUT` e `DELETE` em repasse com `origem = 'pluggy'` devolvem **409**, e a
   linha continua no banco intacta.
3. `PUT` com valor zero ou negativo devolve 400.
4. `PUT` sem `data_referencia` devolve 400.
5. `DELETE` de id inexistente devolve 404.

O teste 2 é o que importa mais: ele trava a regra que impede uma correção de ser
desfeita em silêncio pela próxima sincronização.

## Depois disso

Com os dois endpoints no ar, a tela de Repasses ganha editar e apagar (mesmo
padrão de Fornecedores), e a caixa de colar os lançamentos futuros do Mercado
Pago deixa de precisar de travamento — colar errado passa a ser corrigível, em
vez de definitivo.
