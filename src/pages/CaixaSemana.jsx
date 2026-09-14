/**
 * Caixa da Semana — quanto entra, quanto sai, e quanto sobra para comprar.
 *
 * Esta tela existe porque o número que estava no lugar dela não respondia
 * pergunta nenhuma. O `saldo_disponivel` do Dashboard era:
 *
 *   repasses do MÊS − cobranças do MÊS − contas já pagas do MÊS
 *   − contas pendentes do MÊS − saldo TOTAL de fornecedores (de sempre)
 *
 * Três horizontes somados — mês, mês e sempre — e ainda subtraindo o que já
 * foi pago, dinheiro que já saiu. O resultado é um número que não serve para
 * decidir nada. Aqui a conta tem um horizonte só: a semana.
 *
 * A REGRA DA FLÁVIA. Pagamento a fornecedor neste sistema não é amarrado a
 * pedido (ver migração 005) — é um registro corrido de valores e datas. Então
 * "o que devo à Flávia" se descobre consumindo os pedidos do mais antigo para
 * o mais novo com o total já pago, e vendo onde o dinheiro acabou. O que
 * sobra descoberto e tem mais de 30 dias é o que está vencido. É assim que a
 * Cibelly já faz de cabeça: "até o dia 5 eu paguei, devo os dias 10 e 11".
 *
 * A regra dos 30 dias vale SÓ para a Flávia — os outros fornecedores não têm
 * prazo combinado assim. Por isso o apelido aparece numa constante aqui e não
 * numa configuração: uma exceção escrita como exceção é mais honesta que uma
 * generalidade que só tem um caso.
 *
 * O REPASSE PREVISTO. Não há conciliação bancária neste sistema (o Pluggy foi
 * removido em 08/09/2026), então o que vai entrar na semana é informação que
 * só a Cibelly tem — ela olha os lançamentos futuros do Mercado Pago. O campo
 * embaixo grava isso como um repasse manual. Quando o sync do Mercado Pago
 * traz o valor real (origem 'pluggy'), a tela passa a usar o real e ignora o
 * previsto, para não contar duas vezes — o previsto fica visível, riscado, em
 * vez de desaparecer sem explicação.
 */
import { useEffect, useState, useMemo } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import Indicador from '../components/Indicador'
import SecaoCard from '../components/SecaoCard'
import api from '../services/api'

const APELIDO_FORNECEDOR_COM_PRAZO = 'FL'
const DIAS_DE_PRAZO = 30

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Data do backend para Date (meia-noite local), ou null quando não dá para ler.
 *
 * O backend serializa datas pelo jsonify do Flask: "Thu, 20 Aug 2026 00:00:00
 * GMT", não ISO. A primeira versão cortava os 10 primeiros caracteres achando
 * que era "2026-08-20" — "Thu, 20 Au" é data inválida, o toISOString()
 * estourava no render e o Painel inteiro abria no aviso de 8s do index.html
 * (14/09/2026). Tratar data ilegível como null tirou o crash, mas a data
 * continuava ilegível: todo pedido virava "sem data", nada vencia, e boleto
 * da semana sumia da conta.
 *
 * Meia-noite GMT é o próprio dia do calendário, então vale a parte UTC. ISO
 * continua aceito, e null/lixo continuam virando null.
 */
function comoData(v) {
  if (!v) return null
  const s = String(v)
  let ymd = null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    ymd = s.slice(0, 10)
  } else {
    const g = new Date(s)
    if (!Number.isNaN(g.getTime())) ymd = g.toISOString().slice(0, 10)
  }
  if (!ymd) return null
  const d = new Date(ymd + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

const dia = v => {
  const d = comoData(v)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'sem data'
}
const iso = d => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`
}

function contar(n, singular, plural) {
  if (!n) return `nenhum${singular.endsWith('a') ? 'a' : ''} ${singular}`
  return `${n} ${n === 1 ? singular : plural}`
}

/** Segunda-feira da semana de `ref`. A Cibelly conta a semana de segunda a
    domingo — `hoje + 7 dias`, que era o critério antigo, atravessa duas
    semanas e muda de resposta todo dia. */
function segundaDaSemana(ref) {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  const diasDesdeSegunda = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diasDesdeSegunda)
  return d
}

function somaDias(data, n) {
  const d = new Date(data)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Consome os pedidos do mais antigo para o mais novo com o total já pago.
 * Devolve, para cada pedido, quanto ainda falta — e se já passou do prazo.
 */
function dividaPorPedido(pedidos, totalPago, hoje) {
  const limite = somaDias(hoje, -DIAS_DE_PRAZO)
  let credito = totalPago
  const linhas = []

  // Pedido sem data vai para o fim da fila: não se sabe onde ele entra na
  // ordem, e os pagamentos consomem primeiro o que tem data conhecida.
  const ordenados = [...pedidos].sort((a, b) => {
    const da = iso(comoData(a.data_pedido)) || '9999-12-31'
    const db = iso(comoData(b.data_pedido)) || '9999-12-31'
    return da.localeCompare(db)
  })

  for (const p of ordenados) {
    const valor = Number(p.valor_total || 0)
    const abatido = Math.min(credito, valor)
    credito -= abatido
    const restante = Number((valor - abatido).toFixed(2))
    if (restante <= 0) continue

    const data = comoData(p.data_pedido)
    linhas.push({
      id: p.id,
      data,
      descricao: p.descricao_produtos,
      valor,
      restante,
      // Pedido sem data é o saldo de abertura — o que já se devia quando o
      // painel começou a ser usado. Não é um pedido de um dia; é tudo o que
      // veio antes, rolando de mês em mês. Em qualquer leitura é a dívida mais
      // antiga que existe, então conta como devida.
      estado: !data ? 'anterior' : data <= limite ? 'vencido' : 'a_vencer',
    })
  }
  return linhas
}

function Vazio({ children }) {
  return (
    <p style={{
      margin: 0, padding: '18px 4px', textAlign: 'center',
      fontSize: 13, color: 'var(--color-text-muted)',
    }}>{children}</p>
  )
}

function Linha({ esquerda, direita, apoio, tom }) {
  return (
    <div style={{
      background: 'var(--color-row)', borderRadius: 'var(--radius-sm)',
      padding: '10px 14px', display: 'flex', alignItems: 'baseline',
      justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>{esquerda}</div>
        {apoio && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {apoio}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        color: tom === 'divida' ? 'var(--color-warning)' : 'var(--color-text)',
      }}>{direita}</span>
    </div>
  )
}

export default function CaixaSemana() {
  const [refSemana, setRefSemana] = useState(() => segundaDaSemana(new Date()))
  const [contas, setContas] = useState(null)
  const [repasses, setRepasses] = useState(null)
  const [flavia, setFlavia] = useState(null)  // { nome, pedidos, totalPago }
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ valor: '', data: '' })

  const segunda = refSemana
  const domingo = somaDias(segunda, 6)
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  async function carregar() {
    setErro(null)
    try {
      const [rContas, rFornecedores] = await Promise.all([
        api.get('/api/contas'),
        api.get('/api/fornecedores'),
      ])
      setContas(rContas.data)

      // A semana pode atravessar a virada do mês, e o endpoint de repasses
      // filtra por mês. Busca os dois e junta.
      const meses = [...new Set([segunda, domingo].map(d => iso(d).slice(0, 7)))]
      const listas = await Promise.all(meses.map(m => api.get(`/api/repasses?mes=${m}`)))
      setRepasses(listas.flatMap(r => r.data))

      const f = rFornecedores.data.find(
        x => (x.apelido || '').toUpperCase() === APELIDO_FORNECEDOR_COM_PRAZO
      )
      if (!f) {
        setFlavia({ ausente: true })
      } else {
        const [rPedidos, rPagamentos] = await Promise.all([
          api.get(`/api/fornecedores/${f.id}/pedidos`),
          api.get(`/api/fornecedores/${f.id}/pagamentos`),
        ])
        setFlavia({
          nome: f.apelido ? `${f.nome} (${f.apelido})` : f.nome,
          pedidos: rPedidos.data,
          totalPago: rPagamentos.data.reduce((s, p) => s + Number(p.valor || 0), 0),
        })
      }
    } catch {
      setErro('Não consegui carregar os dados. Tente recarregar a página.')
    }
  }

  useEffect(() => { carregar() }, [iso(segunda)])  // eslint-disable-line react-hooks/exhaustive-deps

  const carregando = !contas || !repasses || !flavia

  // ---- boletos ------------------------------------------------------------
  const naSemana = c => {
    const v = iso(comoData(c.vencimento))
    if (!v) return false
    return v >= iso(segunda) && v <= iso(domingo)
  }
  const abertas = (contas || []).filter(c => c.status !== 'pago')
  const boletosSemana = abertas.filter(naSemana)
  const boletosAtrasados = abertas.filter(c => {
    const v = iso(comoData(c.vencimento))
    return v !== null && v < iso(segunda)
  })
  const totalBoletosSemana = boletosSemana.reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBoletosAtrasados = boletosAtrasados.reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalBoletos = totalBoletosSemana + totalBoletosAtrasados

  // ---- Flávia -------------------------------------------------------------
  const dividas = flavia && !flavia.ausente
    ? dividaPorPedido(flavia.pedidos, flavia.totalPago, hoje)
    : []
  // Saldo de abertura e pedidos passados dos 30 dias formam a mesma coisa para
  // quem vai pagar: dívida vencida. Ficam juntos no total e separados apenas no
  // rótulo, para ela reconhecer de onde cada linha vem.
  const devidos = dividas.filter(d => d.estado === 'vencido' || d.estado === 'anterior')
  const aVencer = dividas.filter(d => d.estado === 'a_vencer')
  const totalFlavia = devidos.reduce((s, d) => s + d.restante, 0)
  const totalFlaviaAVencer = aVencer.reduce((s, d) => s + d.restante, 0)

  // ---- repasse ------------------------------------------------------------
  const repassesDaSemana = (repasses || []).filter(r => {
    const d = iso(comoData(r.data_referencia))
    if (!d) return false
    return r.tipo === 'repasse' && d >= iso(segunda) && d <= iso(domingo)
  })
  const realizado = repassesDaSemana.filter(r => r.origem === 'pluggy')
  const previsto = repassesDaSemana.filter(r => r.origem !== 'pluggy')
  const totalRealizado = realizado.reduce((s, r) => s + Number(r.valor || 0), 0)
  const totalPrevisto = previsto.reduce((s, r) => s + Number(r.valor || 0), 0)
  const usandoRealizado = realizado.length > 0
  const totalRepasse = usandoRealizado ? totalRealizado : totalPrevisto

  const sobra = totalRepasse - totalFlavia - totalBoletos

  async function lancarPrevisto(e) {
    e.preventDefault()
    setSalvando(true)
    try {
      await api.post('/api/repasses', {
        tipo: 'repasse',
        valor: parseFloat(form.valor),
        data_referencia: form.data || iso(segunda),
        conta_ml: 'YUSO',
        descricao: 'Repasse previsto da semana',
      })
      setForm({ valor: '', data: '' })
      await carregar()
    } catch {
      setErro('Não consegui lançar o repasse previsto.')
    } finally {
      setSalvando(false)
    }
  }

  const periodo = `${dia(iso(segunda))} a ${dia(iso(domingo))}`
  const botao = {
    background: 'var(--color-surface)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    padding: '7px 12px', fontSize: 13, cursor: 'pointer',
  }
  const entrada = {
    background: 'var(--color-row)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    padding: '8px 10px', fontSize: 14, width: '100%',
  }

  return (
    <Layout>
      <PaginaHeader
        titulo="Caixa da Semana"
        subtitulo={`Segunda a domingo · ${periodo}. O que entra, o que precisa sair, e o que sobra para comprar produto.`}
        acao={
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={botao} onClick={() => setRefSemana(somaDias(segunda, -7))}>
              ← Semana anterior
            </button>
            <button style={botao} onClick={() => setRefSemana(segundaDaSemana(new Date()))}>
              Esta semana
            </button>
            <button style={botao} onClick={() => setRefSemana(somaDias(segunda, 7))}>
              Próxima →
            </button>
          </div>
        }
      />

      {erro && <p style={{ color: 'var(--color-danger)' }}>{erro}</p>}
      {carregando && !erro && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}

      {!carregando && (
        <>
          <div style={{
            display: 'grid', gap: 12, marginBottom: 20,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}>
            <Indicador
              rotulo={usandoRealizado ? 'Repasse recebido' : 'Repasse previsto'}
              valor={totalRepasse}
              tom="neutro"
              composicao={usandoRealizado
                ? `${contar(realizado.length, 'lançamento', 'lançamentos')} do Mercado Pago`
                : previsto.length
                  ? `Informado por você · ${contar(previsto.length, 'lançamento', 'lançamentos')}`
                  : 'Nada informado para esta semana'}
            />
            <Indicador
              rotulo="Flávia (FL) — vencido"
              valor={totalFlavia}
              tom="divida"
              composicao={devidos.length
                ? `${contar(devidos.length, 'lançamento', 'lançamentos')} passados dos ${DIAS_DE_PRAZO} dias`
                : `Nada passou dos ${DIAS_DE_PRAZO} dias`}
            />
            <Indicador
              rotulo="Boletos a pagar"
              valor={totalBoletos}
              tom="divida"
              composicao={
                `${brl(totalBoletosSemana)} vencem na semana` +
                (totalBoletosAtrasados > 0 ? ` + ${brl(totalBoletosAtrasados)} atrasados` : '')
              }
            />
            <Indicador
              rotulo="Sobra para comprar"
              valor={sobra}
              tom="auto"
              composicao={`${brl(totalRepasse)} − ${brl(totalFlavia)} − ${brl(totalBoletos)}`}
            />
          </div>

          <SecaoCard
            titulo={flavia.ausente ? 'Flávia (FL)' : flavia.nome}
            subtitulo={`O que os pagamentos ainda não cobriram, do mais antigo para o mais novo. Vencido = passou de ${DIAS_DE_PRAZO} dias.`}
            total={brl(totalFlavia)}
            totalRotulo="Vencido"
          >
            {flavia.ausente ? (
              <Vazio>Não achei fornecedor com apelido “{APELIDO_FORNECEDOR_COM_PRAZO}”. Cadastre em Fornecedores.</Vazio>
            ) : dividas.length === 0 ? (
              <Vazio>Nada em aberto — os pagamentos cobrem todos os pedidos.</Vazio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {devidos.map(d => (
                  <Linha
                    key={d.id}
                    esquerda={d.estado === 'anterior'
                      ? 'Saldo de meses anteriores'
                      : `Pedido de ${dia(iso(d.data))}`}
                    apoio={d.estado === 'anterior'
                      ? (d.descricao || 'O que já era devido antes deste histórico')
                      : (d.descricao || 'Vencido — pagar nesta semana')}
                    direita={brl(d.restante)}
                    tom="divida"
                  />
                ))}
                {aVencer.length > 0 && (
                  <>
                    <p style={{
                      margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)',
                    }}>
                      Ainda dentro do prazo — {brl(totalFlaviaAVencer)} em {contar(aVencer.length, 'dia', 'dias')}:
                    </p>
                    {aVencer.map(d => (
                      <Linha
                        key={d.id}
                        esquerda={`Pedido de ${dia(iso(d.data))}`}
                        apoio={`Vence em ${dia(iso(somaDias(d.data, DIAS_DE_PRAZO)))}`}
                        direita={brl(d.restante)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </SecaoCard>

          <SecaoCard
            titulo="Boletos"
            subtitulo="Vencendo nesta semana, mais o que já passou do vencimento e continua aberto."
            total={brl(totalBoletos)}
          >
            {boletosSemana.length === 0 && boletosAtrasados.length === 0 ? (
              <Vazio>Nenhuma conta aberta para esta semana.</Vazio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {boletosAtrasados.map(c => (
                  <Linha
                    key={c.id}
                    esquerda={c.descricao}
                    apoio={`Atrasado desde ${dia(c.vencimento)} · ${c.categoria}`}
                    direita={brl(c.valor)}
                    tom="divida"
                  />
                ))}
                {boletosSemana.map(c => (
                  <Linha
                    key={c.id}
                    esquerda={c.descricao}
                    apoio={`Vence ${dia(c.vencimento)} · ${c.categoria}`}
                    direita={brl(c.valor)}
                  />
                ))}
              </div>
            )}
          </SecaoCard>

          <SecaoCard
            titulo="Repasse da semana"
            subtitulo="Enquanto não há conciliação bancária, o previsto vem de você — dos lançamentos futuros do Mercado Pago."
            total={brl(totalRepasse)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {realizado.map(r => (
                <Linha key={r.id} esquerda={r.descricao || 'Repasse'}
                       apoio={`Recebido ${dia(r.data_referencia)} · ${r.conta_ml}`}
                       direita={brl(r.valor)} />
              ))}
              {previsto.map(r => (
                <Linha
                  key={r.id}
                  esquerda={usandoRealizado
                    ? <s style={{ opacity: 0.6 }}>{r.descricao || 'Previsto'}</s>
                    : (r.descricao || 'Previsto')}
                  apoio={usandoRealizado
                    ? 'Ignorado — o valor real já chegou do Mercado Pago'
                    : `Previsto para ${dia(r.data_referencia)} · ${r.conta_ml}`}
                  direita={brl(r.valor)}
                />
              ))}
              {repassesDaSemana.length === 0 && (
                <Vazio>Nada informado. Lance abaixo o que você espera receber nesta semana.</Vazio>
              )}

              <form onSubmit={lancarPrevisto} style={{
                display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
                marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--color-border)',
              }}>
                <label style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 140px' }}>
                  Valor previsto
                  <input required type="number" step="0.01" min="0.01" value={form.valor}
                         onChange={e => setForm({ ...form, valor: e.target.value })}
                         style={entrada} placeholder="0,00" />
                </label>
                <label style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 140px' }}>
                  Data prevista
                  <input type="date" value={form.data} min={iso(segunda)} max={iso(domingo)}
                         onChange={e => setForm({ ...form, data: e.target.value })}
                         style={entrada} />
                </label>
                <button type="submit" disabled={salvando} style={{
                  ...botao, cursor: salvando ? 'default' : 'pointer',
                  opacity: salvando ? 0.6 : 1,
                }}>
                  {salvando ? 'Lançando…' : 'Lançar previsto'}
                </button>
              </form>
            </div>
          </SecaoCard>
        </>
      )}
    </Layout>
  )
}
