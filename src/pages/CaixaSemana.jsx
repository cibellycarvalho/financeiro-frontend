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
 * foi pago, dinheiro que já saiu. Aqui a conta tem um horizonte só: a semana,
 * de segunda a domingo.
 *
 * A REGRA DA FLÁVIA. Pagamento a fornecedor neste sistema não é amarrado a
 * pedido (migração 005) — é um registro corrido de valores e datas. Então "o
 * que devo à Flávia" se descobre consumindo os pedidos do mais antigo para o
 * mais novo com o total já pago, e vendo onde o dinheiro acabou. O que sobra
 * descoberto e passou de 30 dias é o vencido. É a conta que ela já fazia de
 * cabeça: "até o dia 5 eu paguei, devo os dias 10 e 11".
 *
 * A regra dos 30 dias vale SÓ para a Flávia. Por isso o apelido está numa
 * constante aqui e não numa configuração: exceção escrita como exceção é mais
 * honesta que generalidade com um caso só.
 *
 * PLANEJAMENTO GUARDADO NO NAVEGADOR, NÃO NO BANCO. Saldo em conta, reserva e
 * os lançamentos futuros do Mercado Pago são informação de PLANEJAMENTO, não
 * lançamento contábil: ela relê no Mercado Pago toda semana e o número muda.
 * Gravar isso em fin_repasses_ml criaria registro que ninguém consegue apagar
 * — `routes/repasses.py` não tem DELETE nem PUT (ver
 * docs/endpoints-editar-apagar-repasse.md). Um botão que soma e não desfaz é
 * pior que um campo de digitar.
 *
 * Aqui fica no navegador, por semana, livre para reescrever. A troco disso:
 * some se ela trocar de computador. Daí o "informado em" ao lado de cada valor
 * e o aviso quando envelhece — dado velho apresentado como atual é o defeito
 * que este painel mais combate.
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import Indicador from '../components/Indicador'
import SecaoCard from '../components/SecaoCard'
import api from '../services/api'

const APELIDO_FORNECEDOR_COM_PRAZO = 'FL'
const DIAS_DE_PRAZO = 30
const DIAS_ATE_ENVELHECER = 3
const CHAVE = 'caixa-semana:planejamento'

const NOMES_DIA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const valorBR = t => Number(String(t).replace(/\./g, '').replace(',', '.'))

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
const diaMes = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

function contar(n, singular, plural) {
  if (!n) return `nenhum${singular.endsWith('a') ? 'a' : ''} ${singular}`
  return `${n} ${n === 1 ? singular : plural}`
}

/** Segunda-feira da semana de `ref`. `hoje + 7 dias`, o critério antigo,
    atravessa duas semanas e muda de resposta todo dia. */
function segundaDaSemana(ref) {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function somaDias(data, n) {
  const d = new Date(data)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Lê os totais de dia da agenda de lançamentos futuros do Mercado Pago.
 *
 * Só as linhas de TOTAL DO DIA — "Segunda-feira, 14+R$5.809,88". O detalhe de
 * cada liberação dentro do dia é ignorado de propósito: o total que o Mercado
 * Pago mostra já vem líquido das cobranças daquele dia, e somar os dois
 * contaria o mesmo dinheiro duas vezes.
 */
export function lerLiberacoes(texto) {
  const re = /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[a-zç-]*\s*,\s*(\d{1,2})\s*([+\-−]?)\s*R\$\s*([\d.]*\d(?:,\d{2})?)/gi
  const porDia = {}
  let m
  while ((m = re.exec(texto)) !== null) {
    const v = valorBR(m[4])
    porDia[Number(m[2])] = (m[3] === '-' || m[3] === '−') ? -v : v
  }
  return porDia
}

/**
 * Consome os pedidos do mais antigo para o mais novo com o total já pago.
 * Devolve, por pedido, quanto falta e em que estado está.
 */
export function dividaPorPedido(pedidos, totalPago, hoje) {
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
      // Pedido sem data é o saldo de abertura — o que já se devia antes deste
      // histórico, rolando de mês em mês. É a dívida mais antiga que existe.
      estado: !data ? 'anterior' : data <= limite ? 'vencido' : 'a_vencer',
    })
  }
  return linhas
}

function lerPlanejamento() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}
  } catch {
    return {}
  }
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
  const [flavia, setFlavia] = useState(null)
  const [erro, setErro] = useState(null)
  const [plano, setPlano] = useState(lerPlanejamento)

  const segunda = refSemana
  const domingo = somaDias(segunda, 6)
  const chaveSemana = iso(segunda)
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const daSemana = plano[chaveSemana] || {}

  const salvar = useCallback((campos) => {
    setPlano(anterior => {
      const proximo = {
        ...anterior,
        [chaveSemana]: {
          ...(anterior[chaveSemana] || {}),
          ...campos,
          informadoEm: iso(new Date()),
        },
      }
      try { localStorage.setItem(CHAVE, JSON.stringify(proximo)) } catch { /* modo privado */ }
      return proximo
    })
  }, [chaveSemana])

  useEffect(() => {
    let vivo = true
    async function carregar() {
      setErro(null)
      try {
        const [rContas, rFornecedores] = await Promise.all([
          api.get('/api/contas'),
          api.get('/api/fornecedores'),
        ])
        if (!vivo) return
        setContas(rContas.data)

        // A semana pode atravessar a virada do mês, e o endpoint filtra por mês.
        const meses = [...new Set([segunda, domingo].map(d => iso(d).slice(0, 7)))]
        const listas = await Promise.all(meses.map(m => api.get(`/api/repasses?mes=${m}`)))
        if (!vivo) return
        setRepasses(listas.flatMap(r => r.data))

        const f = rFornecedores.data.find(
          x => (x.apelido || '').toUpperCase() === APELIDO_FORNECEDOR_COM_PRAZO
        )
        if (!f) { setFlavia({ ausente: true }); return }

        const [rPedidos, rPagamentos] = await Promise.all([
          api.get(`/api/fornecedores/${f.id}/pedidos`),
          api.get(`/api/fornecedores/${f.id}/pagamentos`),
        ])
        if (!vivo) return
        setFlavia({
          nome: f.apelido ? `${f.nome} (${f.apelido})` : f.nome,
          pedidos: rPedidos.data,
          totalPago: rPagamentos.data.reduce((s, p) => s + Number(p.valor || 0), 0),
        })
      } catch {
        if (vivo) setErro('Não consegui carregar os dados. Tente recarregar a página.')
      }
    }
    carregar()
    return () => { vivo = false }
  }, [chaveSemana])  // eslint-disable-line react-hooks/exhaustive-deps

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
  const devidos = dividas.filter(d => d.estado === 'vencido' || d.estado === 'anterior')
  const aVencer = dividas.filter(d => d.estado === 'a_vencer')
  const totalFlavia = devidos.reduce((s, d) => s + d.restante, 0)
  const totalFlaviaAVencer = aVencer.reduce((s, d) => s + d.restante, 0)

  // ---- repasse ------------------------------------------------------------
  const liberacoes = useMemo(() => lerLiberacoes(daSemana.textoMP || ''), [daSemana.textoMP])
  const totalColado = Object.values(liberacoes).reduce((s, v) => s + v, 0)
  const repassesGravados = (repasses || []).filter(r => {
    const d = iso(comoData(r.data_referencia))
    if (!d) return false
    return r.tipo === 'repasse' && d >= iso(segunda) && d <= iso(domingo)
  })
  const totalGravado = repassesGravados.reduce((s, r) => s + Number(r.valor || 0), 0)
  const colou = Object.keys(liberacoes).length > 0
  const totalRepasse = colou ? totalColado : totalGravado

  // ---- a conta ------------------------------------------------------------
  const saldo = Number(daSemana.saldo || 0)
  const reserva = Number(daSemana.reserva || 0)
  const sobra = saldo + totalRepasse - totalFlavia - totalBoletos

  // Depois de alguns dias a data do saldo aparece junto do numero, discreta.
  // Nao vira quadro de aviso: repetir de volta o que ela digitou, toda semana,
  // e a tela falando com ela sem ter nada novo a dizer.
  const informadoEm = comoData(daSemana.informadoEm)
  const envelheceu = informadoEm !== null &&
    Math.round((hoje - informadoEm) / 86400000) > DIAS_ATE_ENVELHECER

  // ---- dia a dia ----------------------------------------------------------
  const dias = useMemo(() => {
    let acumulado = saldo
    return Array.from({ length: 7 }, (_, i) => {
      const data = somaDias(segunda, i)
      const entra = liberacoes[data.getDate()] || 0
      const saiBoletos = boletosSemana.filter(
        c => iso(comoData(c.vencimento)) === iso(data)
      )
      const sai = saiBoletos.reduce((s, c) => s + Number(c.valor || 0), 0)
      acumulado += entra - sai
      return { data, nome: NOMES_DIA[i], entra, saiBoletos, acumulado }
    })
  }, [saldo, liberacoes, contas, chaveSemana])  // eslint-disable-line react-hooks/exhaustive-deps

  const diaFlavia = dias.find(d => d.acumulado >= totalFlavia)
  const indiceFlavia = diaFlavia ? dias.indexOf(diaFlavia) : -1

  const periodo = `${diaMes(segunda)} a ${diaMes(domingo)}`
  const botao = {
    background: 'var(--color-surface)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    padding: '7px 12px', fontSize: 13, cursor: 'pointer',
  }
  const entrada = {
    background: 'var(--color-row)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    padding: '9px 11px', fontSize: 14, width: '100%',
  }
  const rotulo = { display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 5 }

  return (
    <Layout>
      <PaginaHeader
        titulo="Caixa da Semana"
        subtitulo={`Segunda a domingo · ${periodo}. O que entra, o que sai, e o que sobra para comprar produto.`}
        acao={
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={botao} onClick={() => setRefSemana(somaDias(segunda, -7))}>← Anterior</button>
            <button style={botao} onClick={() => setRefSemana(segundaDaSemana(new Date()))}>Esta semana</button>
            <button style={botao} onClick={() => setRefSemana(somaDias(segunda, 7))}>Próxima →</button>
          </div>
        }
      />

      {erro && <p style={{ color: 'var(--color-danger)' }}>{erro}</p>}
      {carregando && !erro && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}

      {!carregando && (
        <>
          <div style={{
            display: 'grid', gap: 12, marginBottom: 20,
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          }}>
            <Indicador
              rotulo="Entra na semana"
              valor={saldo + totalRepasse}
              tom="neutro"
              composicao={`${brl(saldo)} em conta + ${brl(totalRepasse)} de repasse` +
                (envelheceu ? ` · saldo de ${diaMes(informadoEm)}` : '')}
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
              composicao={`${brl(totalBoletosSemana)} vencem na semana` +
                (totalBoletosAtrasados > 0 ? ` + ${brl(totalBoletosAtrasados)} atrasados` : '')}
            />
            <Indicador
              rotulo="Sobra para comprar"
              valor={sobra}
              tom="auto"
              composicao={`${brl(saldo + totalRepasse)} − ${brl(totalFlavia)} − ${brl(totalBoletos)}`}
            />
          </div>

          <SecaoCard
            titulo="Quando o dinheiro chega"
            subtitulo="Acumulado disponível dia a dia, já descontando os boletos conforme vencem."
          >
            {!colou ? (
              <Vazio>
                Cole os lançamentos futuros do Mercado Pago lá embaixo — é deles que sai o dia a dia.
              </Vazio>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 3 }}>
                  {dias.map((d, i) => {
                    const ehHoje = iso(d.data) === iso(hoje)
                    const ehMarco = i === indiceFlavia && totalFlavia > 0
                    const notas = []
                    if (d.entra) notas.push(`entra ${brl(d.entra)}`)
                    d.saiBoletos.forEach(c => notas.push(`− ${c.descricao} ${brl(c.valor)}`))
                    return (
                      <div key={iso(d.data)} style={{
                        display: 'grid', gridTemplateColumns: '6.2rem 1fr auto',
                        alignItems: 'baseline', gap: 10, padding: '9px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-row)',
                        boxShadow: ehHoje ? 'inset 0 0 0 1.5px var(--color-accent-solid)' : 'none',
                        borderLeft: ehMarco ? '3px solid var(--color-text-muted)' : '3px solid transparent',
                      }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                          {d.nome} {diaMes(d.data)}{ehHoje ? ' ·' : ''}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {notas.join(' · ') || '—'}
                        </span>
                        <span style={{
                          fontSize: 14.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}>{brl(d.acumulado)}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Fato, não conselho: onde o acumulado passa do valor da
                    Flávia. Quando pagar, e se vai mexer na reserva, é decisão
                    da Cibelly — a tela informa e para aí. */}
                {totalFlavia > 0 && (
                  <p style={{
                    margin: '13px 0 0', fontSize: 12.5, lineHeight: 1.6,
                    color: 'var(--color-text-muted)',
                  }}>
                    {diaFlavia ? (
                      <>
                        Flávia vencido: {brl(totalFlavia)}. O acumulado passa desse valor
                        em <b>{diaFlavia.nome.toLowerCase()} {diaMes(diaFlavia.data)}</b> ({brl(diaFlavia.acumulado)}).
                        {indiceFlavia > 0 && (
                          <> No dia anterior está em {brl(dias[indiceFlavia - 1].acumulado)},
                          diferença de {brl(totalFlavia - dias[indiceFlavia - 1].acumulado)}.</>
                        )}
                      </>
                    ) : (
                      <>
                        Flávia vencido: {brl(totalFlavia)}. O acumulado não passa desse valor
                        nesta semana — no domingo está em {brl(dias[6].acumulado)}.
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </SecaoCard>

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
                      : (d.descricao || `Venceu em ${dia(iso(somaDias(d.data, DIAS_DE_PRAZO)))}`)}
                    direita={brl(d.restante)}
                    tom="divida"
                  />
                ))}
                {aVencer.length > 0 && (
                  <>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Ainda dentro do prazo — {brl(totalFlaviaAVencer)} em {contar(aVencer.length, 'pedido', 'pedidos')}:
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
                  <Linha key={c.id} esquerda={c.descricao}
                         apoio={`Atrasado desde ${dia(c.vencimento)} · ${c.categoria}`}
                         direita={brl(c.valor)} tom="divida" />
                ))}
                {boletosSemana.map(c => (
                  <Linha key={c.id} esquerda={c.descricao}
                         apoio={`Vence ${dia(c.vencimento)} · ${c.categoria}`}
                         direita={brl(c.valor)} />
                ))}
              </div>
            )}
          </SecaoCard>

          <SecaoCard
            titulo="Reserva"
            subtitulo="Aplicada, fora da conta corrente. Não entra na sobra para comprar."
            total={brl(reserva)}
            totalRotulo="Aplicado"
          >
            {/* Sem recomendacao aqui. A regra de quando a reserva pode ser usada
                e da Cibelly e esta escrita em docs/regras-caixa-semana.md; na
                tela ela viraria a tela mandando nela. Pedido dela em 14/09/2026:
                "quero que o painel apenas me mostre as informacoes e eu vou
                decidir o que fazer, se vou tirar dinheiro da reserva ou nao". */}
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Não está no saldo em conta acima, e não entra na sobra para comprar.
            </p>
          </SecaoCard>

          <SecaoCard
            titulo="Planejamento da semana"
            subtitulo="Informado por você, guardado neste navegador. Não vai para o banco — é planejamento, não lançamento."
          >
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}>
              <label>
                <span style={rotulo}>Saldo em conta hoje</span>
                <input type="number" step="0.01" style={entrada}
                       value={daSemana.saldo ?? ''}
                       onChange={e => salvar({ saldo: e.target.value })}
                       placeholder="0,00" />
              </label>
              <label>
                <span style={rotulo}>Reserva aplicada</span>
                <input type="number" step="0.01" style={entrada}
                       value={daSemana.reserva ?? ''}
                       onChange={e => salvar({ reserva: e.target.value })}
                       placeholder="0,00" />
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 14 }}>
              <span style={rotulo}>Lançamentos futuros do Mercado Pago</span>
              <textarea
                style={{ ...entrada, minHeight: 130, resize: 'vertical', fontSize: 12.5, lineHeight: 1.5 }}
                value={daSemana.textoMP ?? ''}
                onChange={e => salvar({ textoMP: e.target.value })}
                spellCheck={false}
                placeholder={'Cole aqui, do jeito que o Mercado Pago mostra:\n\nSegunda-feira, 14+R$5.809,88\nTerça-feira, 15+R$16.407,92'} />
            </label>

            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              {colou
                ? `${contar(Object.keys(liberacoes).length, 'dia lido', 'dias lidos')} · ${brl(totalColado)} na semana` +
                  (informadoEm ? ` · informado em ${diaMes(informadoEm)}` : '')
                : 'Nada colado para esta semana.'}
              {!colou && totalGravado > 0 && ` Usando ${brl(totalGravado)} dos repasses já lançados.`}
            </p>
          </SecaoCard>
        </>
      )}
    </Layout>
  )
}
