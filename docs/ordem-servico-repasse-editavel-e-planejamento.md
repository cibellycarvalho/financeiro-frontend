# Ordem de serviço — repasse editável e planejamento da semana no banco

Duas mudanças no `financeiro-backend`. São independentes; a **parte 1 é a mais
urgente**, porque o problema dela já existe hoje.

O frontend eu faço depois que estiver no ar — não precisa mexer em
`financeiro-frontend`.

---

## Parte 1 — `PUT` e `DELETE` em Repasses

### Por que

Em Fornecedores a Cibelly tem liberdade total: cria, edita e apaga pedidos e
pagamentos. Em **Repasses ela só consegue adicionar** — `routes/repasses.py` tem
`GET`, `POST`, `/sync-mp` e `/saldo`, e nada mais.

Um repasse digitado errado fica lá para sempre e entra em todas as contas do
painel daquele mês. Isso vale hoje, independente de qualquer tela nova.

### A trava que importa

**Só repasse manual pode ser editado ou apagado.** Os que vêm do sync do Mercado
Pago (`origem = 'pluggy'`) são apagados e reinseridos a cada sincronização — ver
o `DELETE ... WHERE origem = 'pluggy'` em `sync_mp`. Deixar editar um deles
criaria um valor que a próxima sincronização sobrescreve **em silêncio**, e a
pessoa não teria como saber que a correção dela foi desfeita.

Melhor recusar com mensagem clara do que aceitar e desfazer escondido.

### Código para acrescentar em `routes/repasses.py`

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

### Testes (em `tests/test_repasses.py`)

1. `PUT` e `DELETE` em repasse manual funcionam e devolvem 200 / 204.
2. `PUT` e `DELETE` em repasse com `origem = 'pluggy'` devolvem **409**, e a
   linha continua no banco intacta.
3. `PUT` com valor zero ou negativo devolve 400.
4. `PUT` sem `data_referencia` devolve 400.
5. `DELETE` de id inexistente devolve 404.

O teste 2 é o que mais importa: ele trava a regra que impede uma correção de ser
desfeita em silêncio pela próxima sincronização.

---

## Parte 2 — Planejamento da semana no banco

### Por que

A Caixa da Semana precisa de três informações que não existem em lugar nenhum do
sistema, porque não há conciliação bancária (o Pluggy saiu em 08/09/2026):

- **saldo em conta** hoje
- **reserva aplicada** (fica fora da conta corrente)
- **agenda de lançamentos futuros do Mercado Pago**, dia a dia

Hoje elas moram no `localStorage` do navegador. Em 14/09/2026 apareceu o
problema disso na prática: **o marido da Cibelly abriu o mesmo painel e viu
números diferentes**, porque na máquina dele os três campos estavam vazios. São
duas pessoas usando o mesmo sistema; tratar esses dados como se fossem de um
navegador só estava errado desde o começo.

No banco, qualquer um que abrir vê o mesmo número — inclusive no celular.

### Migração: `supabase/migrations/20260914_planejamento_semana.sql`

```sql
-- Task: A Caixa da Semana precisa de saldo em conta, reserva aplicada e a
-- agenda de liberações futuras do Mercado Pago. Não há conciliação bancária,
-- então esses dados são informados por pessoa. Moravam no localStorage, o que
-- fazia cada navegador ver um painel diferente.
-- Criado em: 2026-09-14

CREATE TABLE fin_planejamento_semana (
  semana DATE PRIMARY KEY,                      -- sempre a SEGUNDA-FEIRA da semana
  saldo_conta NUMERIC(12,2),                    -- NULL = não informado (≠ zero)
  reserva_aplicada NUMERIC(12,2),
  agenda JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { "2026-09-14": 2280.51, ... }
  informado_por UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fin_planejamento_semana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_select" ON fin_planejamento_semana FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM fin_user_roles));

-- Sem o filtro de fin_admin que as outras tabelas usam: planejamento da semana
-- e preenchido pelos dois donos do negocio, nao so pela administradora.
CREATE POLICY "fin_write" ON fin_planejamento_semana FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM fin_user_roles));
```

Três decisões que valem explicação:

**A chave primária é a própria semana.** Uma linha por semana, sempre. Com `id`
próprio, dois `POST` criariam duas linhas para a mesma semana e o painel teria
que escolher uma — que é exatamente o tipo de erro que ninguém percebe.

**`saldo_conta` e `reserva_aplicada` aceitam NULL.** "Ainda não informei" é
diferente de "é zero". O painel precisa distinguir para não mostrar
`Sobra para comprar` calculada em cima de um saldo que ninguém digitou.

**`agenda` tem data completa na chave**, não o número do dia. Semana que
atravessa o mês (29/09 a 05/10) fica sem ambiguidade.

### Rota nova: `routes/planejamento.py`

```python
from flask import Blueprint, request, jsonify, g
from datetime import date, datetime, timedelta
import db
from auth import require_auth

bp = Blueprint("planejamento", __name__)


def _segunda(texto):
    """Valida a semana e devolve o date. (None, erro) se não servir.

    Exige segunda-feira em vez de "arrumar" sozinho: com a semana na chave
    primária, aceitar uma terça criaria uma segunda linha para a mesma semana,
    e o painel passaria a ler ora uma, ora outra.
    """
    try:
        d = datetime.strptime(texto, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None, (jsonify({"error": "semana deve ser uma data YYYY-MM-DD"}), 400)
    if d.weekday() != 0:
        return None, (jsonify({
            "error": f"semana deve ser uma segunda-feira; {texto} é "
                     f"{['segunda','terça','quarta','quinta','sexta','sábado','domingo'][d.weekday()]}"
        }), 400)
    return d, None


def _agenda_valida(agenda, semana):
    """A agenda é JSONB — o banco aceita qualquer coisa, então a checagem é aqui."""
    if not isinstance(agenda, dict):
        return "agenda deve ser um objeto de data para valor"
    dias = {(semana + timedelta(days=i)).isoformat() for i in range(7)}
    for chave, valor in agenda.items():
        if chave not in dias:
            return f"{chave} não está na semana de {semana.isoformat()}"
        if not isinstance(valor, (int, float)) or isinstance(valor, bool):
            return f"valor de {chave} deve ser número"
    return None


@bp.get("/<semana>")
@require_auth
def ler(semana):
    d, erro = _segunda(semana)
    if erro:
        return erro

    rows = db.query(
        "SELECT * FROM fin_planejamento_semana WHERE semana = %s", (d,)
    )
    if not rows:
        # Semana nunca informada não é erro: é o estado normal de toda segunda
        # de manhã. Devolver 404 obrigaria a tela a tratar o caso comum como
        # exceção.
        return jsonify({
            "semana": d.isoformat(),
            "saldo_conta": None,
            "reserva_aplicada": None,
            "agenda": {},
            "updated_at": None,
        })
    return jsonify(rows[0])


@bp.put("/<semana>")
@require_auth                 # de proposito sem @require_admin — ver abaixo
def gravar(semana):
    d, erro = _segunda(semana)
    if erro:
        return erro

    data = request.get_json() or {}

    def numero(campo):
        v = data.get(campo)
        if v is None or v == "":
            return None, None
        try:
            return float(v), None
        except (TypeError, ValueError):
            return None, f"{campo} inválido"

    saldo, e1 = numero("saldo_conta")
    reserva, e2 = numero("reserva_aplicada")
    if e1 or e2:
        return jsonify({"error": e1 or e2}), 400
    if reserva is not None and reserva < 0:
        return jsonify({"error": "reserva_aplicada não pode ser negativa"}), 400

    agenda = data.get("agenda", {})
    problema = _agenda_valida(agenda, d)
    if problema:
        return jsonify({"error": problema}), 400

    row = db.execute(
        """INSERT INTO fin_planejamento_semana
               (semana, saldo_conta, reserva_aplicada, agenda, informado_por, updated_at)
           VALUES (%s, %s, %s, %s, %s, now())
           ON CONFLICT (semana) DO UPDATE
               SET saldo_conta = EXCLUDED.saldo_conta,
                   reserva_aplicada = EXCLUDED.reserva_aplicada,
                   agenda = EXCLUDED.agenda,
                   informado_por = EXCLUDED.informado_por,
                   updated_at = now()
        RETURNING *""",
        (d, saldo, reserva, psycopg2.extras.Json(agenda), g.user["user_id"])
    )
    return jsonify(row)
```

Dois detalhes de implementação:

- `psycopg2.extras.Json(agenda)` é o que faz o dict virar JSONB. Precisa do
  `import psycopg2.extras` no topo. Passar o dict cru dá erro de adaptação.
- `g.user["user_id"]` é o id do usuário — conferido em `auth.py:35`, onde
  `verify_jwt` devolve `{"user_id": payload["sub"], ...}`. O campo
  `informado_por` existe para responder "quem digitou esse saldo", que numa
  conta usada por duas pessoas é pergunta que vai aparecer.

**Saldo negativo é aceito de propósito** (conta no vermelho acontece). Reserva
negativa não existe.

### Registrar em `app.py`

```python
    from routes.planejamento import bp as planejamento_bp
    app.register_blueprint(planejamento_bp, url_prefix="/api/planejamento")
```

### Testes (em `tests/test_planejamento.py`, novo)

1. `GET` de semana nunca informada devolve **200** com os campos nulos e
   `agenda: {}` — não 404.
2. `PUT` cria; `PUT` de novo na mesma semana **atualiza** e continua existindo
   **uma linha só** (é o que o `ON CONFLICT` garante — vale conferir com um
   `SELECT COUNT(*)`).
3. `PUT` com semana que não é segunda-feira devolve 400.
4. `PUT` com `agenda` contendo data fora da semana devolve 400.
5. `PUT` com `agenda` que não é objeto (lista, string, número) devolve 400.
6. `PUT` com `saldo_conta` negativo é **aceito**; `reserva_aplicada` negativa
   devolve 400.
7. `PUT` de usuário **não admin** (mas com papel em `fin_user_roles`)
   **funciona** — os dois donos preenchem. É o teste que trava a diferença
   proposital em relação a Repasses e Fornecedores; sem ele, alguém "padroniza"
   a rota mais tarde e o marido dela perde o acesso sem ninguém notar.
8. `PUT` de quem não tem papel nenhum continua barrado pelo `require_auth`.

O teste 2 é o que importa mais: é ele que garante que a semana não se
duplica.

### Por que esta rota não exige admin

Decisão da Cibelly em 14/09/2026: **"os dois vão poder mexer"**. Ela e o marido
tocam o negócio juntos e usam o mesmo painel; quem estiver com o número do banco
na mão na segunda-feira preenche.

Por isso `gravar` leva só `@require_auth`, e a policy da tabela não filtra por
`fin_admin` — diferente de Repasses e Fornecedores, onde escrever mexe em
lançamento contábil. Aqui é planejamento: informar saldo errado se conserta
digitando de novo, e `informado_por` registra quem foi.

Isso é exceção consciente, não descuido. Está no teste 7 para não ser
"padronizado" de volta por engano.

---

## Ordem sugerida

1. Parte 1 (repasses) — já é um problema hoje, e é pequena.
2. Parte 2 (planejamento) — desbloqueia o painel funcionar igual em qualquer
   máquina.

Quando as duas estiverem no ar, me avisa que eu ligo o frontend: a tela de
Repasses ganha editar e apagar, e a Caixa da Semana passa a ler e gravar o
planejamento no banco em vez do navegador. Os valores que já estão no navegador
dela eu subo na primeira vez que a tela abrir, para ela não ter que digitar de
novo.
