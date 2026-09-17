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
import CaixinhaPago from '../components/CaixinhaPago'

const APELIDO_FORNECEDOR_COM_PRAZO = 'FL'
const DIAS_DE_PRAZO = 30
const DIAS_ATE_ENVELHECER = 3
const CHAVE = 'caixa-semana:planejamento'

const NOMES_DIA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/**
 * Le valor em dinheiro do jeito que a pessoa escreve, nao do jeito que o
 * Javascript gosta.
 *
 * Os campos eram type="number": digitar "5.922,92" — que e como o valor
 * aparece no Mercado Pago e como qualquer pessoa daqui escreve — dava campo
 * invalido, que o navegador entrega como string vazia. O saldo virava zero sem
 * uma mensagem, e a "Sobra para comprar" saia errada parecendo certa.
 *
 * Aceita "5.922,92", "5922,92", "5922.92", "R$ 5.922,92" e "5.922" (mil
 * novecentos e vinte e dois). O unico caso ambiguo e o ponto sozinho com tres
 * casas: "5.922" e milhar aqui, porque valor em real tem duas casas decimais,
 * nao tres.
 */
export function numeroBR(t) {
  if (t === null || t === undefined) return 0
  let s = String(t).trim().replace(/R\$/gi, '').replace(/\s/g, '')
  if (s === '') return 0
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')     // 5.922,92 -> 5922.92
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')                       // 5.922 -> 5922
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

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
  // Os \s* dentro do valor nao sao enfeite: copiando do Mercado Pago o numero
  // vem quebrado em varias linhas ("R$\n2.280\n,\n51"). Sem eles a leitura
  // parava no 2.280 e os centavos de TODO dia sumiam calados — foi o que
  // aconteceu em 14/09/2026, e o total da semana saiu redondo demais.
  const re = /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[a-zç-]*\s*,\s*(\d{1,2})\s*([+\-−]?)\s*R\$\s*([\d.]*\d(?:\s*,\s*\d{2})?)/gi
  const porDia = {}
  let m
  while ((m = re.exec(texto)) !== null) {
    const v = numeroBR(m[4])
    porDia[Number(m[2])] = (m[3] === '-' || m[3] === '−') ? -v : v
  }
  return porDia
}

/**
 * Consome os pedidos do mais antigo para o mais novo com o total já pago.
 * Devolve, por pedido, quanto falta e em que estado está.
 *
 * Pedido com a caixinha "Pago" marcada (pago_em) está quitado e consome o
 * próprio valor primeiro. Só o que sobra do total pago desce do mais antigo
 * para o mais novo. Sem isso, o Pix que pagou os pedidos de 10 e 11/08 ia
 * parar no saldo de julho (17/09/2026).
 */
export function dividaPorPedido(pedidos, totalPago, hoje) {
  const limite = somaDias(hoje, -DIAS_DE_PRAZO)
  const marcados = pedidos.filter(p => p.pago_em)
  let credito = Math.max(0, totalPago - marcados.reduce((s, p) => s + Number(p.valor_total || 0), 0))
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
    const abatido = p.pago_em ? valor : Math.min(credito, valor)
    if (!p.pago_em) credito -= abatido
    const restante = Number((valor - abatido).toFixed(2))

    const data = comoData(p.data_pedido)
    linhas.push({
      id: p.id,
      pedido: p,
      data,
      descricao: p.descricao_produtos,
      valor,
      abatido: Number(abatido.toFixed(2)),
      restante,
      // Pedido quitado continua na lista em vez de sumir: e ele que explica
      // para onde foi o dinheiro ja pago. Quem some da conta nao pode ser
      // conferido.
      quitado: restante <= 0,
      // Pedido sem data é o saldo de abertura — o que já se devia antes deste
      // histórico, rolando de mês em mês. É a dívida mais antiga que existe.
      estado: !data ? 'anterior' : data <= limite ? 'vencido' : 'a_vencer',
    })
  }
  return linhas
}

/**
 * Separa os pagamentos a fornecedor da semana entre os que saem da sobra e os
 * que já estavam fora do saldo em conta que ela digitou.
 *
 * Pedido dela em 17/09/2026: a dívida da Flávia não sai da sobra por existir
 * — sai quando é paga. Vale igual para compra de outro fornecedor lançada com
 * comprovante. Mas o saldo em conta é digitado à mão: o que foi pago ANTES de
 * digitá-lo já não está nele, e descontar de novo tiraria o mesmo dinheiro
 * duas vezes.
 *
 * Pago em dia anterior ao do saldo: já fora. No mesmo dia: já fora se foi
 * lançado antes de ela digitar o saldo. O que escapa: pagar, digitar o saldo e
 * só lançar o pagamento depois — esse sai duas vezes.
 */
export function pagamentosDaSemana(pagamentos, segunda, domingo, saldoEm, ajustes = {}) {
  const de = iso(segunda)
  const ate = iso(domingo)
  const diaSaldo = saldoEm ? iso(saldoEm) : null
  return (pagamentos || [])
    .map(p => ({ ...p, data: comoData(p.data_pagamento), valor: Number(p.valor || 0) }))
    .filter(p => p.data && iso(p.data) >= de && iso(p.data) <= ate)
    .map(p => {
      const d = iso(p.data)
      const lancado = p.created_at ? new Date(p.created_at) : null
      const jaFora = diaSaldo !== null && (
        d < diaSaldo ||
        (d === diaSaldo && lancado !== null && !Number.isNaN(lancado.getTime()) && lancado <= saldoEm)
      )
      // A escolha dela vale mais que a regra: o botão na lista grava aqui.
      const escolhido = ajustes[p.id]
      return { ...p, jaFora: escolhido === undefined ? jaFora : !escolhido, ajustado: escolhido !== undefined }
    })
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

function Linha({ esquerda, direita, apoio, tom, extra }) {
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
        {extra && <div style={{ marginTop: 6 }}>{extra}</div>}
      </div>
      <span style={{
        fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        color: tom === 'divida' ? 'var(--color-warning)' : 'var(--color-text)',
      }}>{direita}</span>
    </div>
  )
}

/**
 * Devolve em voz alta o valor que a tela entendeu do que foi digitado.
 *
 * Sem isto, "5.922,92" lido como 5,92 seria indistinguivel de 5.922,92 lido
 * certo: os dois parecem iguais no campo. O eco custa uma linha e transforma
 * um erro silencioso em erro obvio.
 */
function Lido({ valor }) {
  const cru = String(valor ?? '').trim()
  if (cru === '') return null
  return (
    <span style={{
      display: 'block', marginTop: 5, fontSize: 11.5,
      color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums',
    }}>
      = {brl(numeroBR(cru))}
    </span>
  )
}

export default function CaixaSemana() {
  const [refSemana, setRefSemana] = useState(() => segundaDaSemana(new Date()))
  const [contas, setContas] = useState(null)
  const [repasses, setRepasses] = useState(null)
  const [flavia, setFlavia] = useState(null)
  const [erro, setErro] = useState(null)
  const [plano, setPlano] = useState(lerPlanejamento)
  const [colando, setColando] = useState(false)
  const [rascunho, setRascunho] = useState('')
  const [avisoColagem, setAvisoColagem] = useState(null)
  const [pagamentos, setPagamentos] = useState(null)
  const [recarga, setRecarga] = useState(0)

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
          ...('saldo' in campos ? { saldoEm: new Date().toISOString() } : {}),
        },
      }
      try { localStorage.setItem(CHAVE, JSON.stringify(proximo)) } catch { /* modo privado */ }
      return proximo
    })
  }, [chaveSemana])

  const diasDaSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => somaDias(segunda, i)),
    [chaveSemana],  // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** Le o texto colado e guarda como lista de dias. Devolve quantos entraram. */
  const guardarColagem = useCallback((texto) => {
    const lidos = lerLiberacoes(texto)
    const numeros = diasDaSemana.map(d => d.getDate())
    const nova = { ...(plano[chaveSemana]?.agenda || {}) }
    let n = 0
    Object.entries(lidos).forEach(([d, v]) => {
      // Dia que nao cai nesta semana e descartado: guardado, ficaria orfao —
      // sem linha na tela, e portanto sem como apagar.
      if (!numeros.includes(Number(d))) return
      nova[d] = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      n += 1
    })
    if (n > 0) salvar({ agenda: nova, textoMP: undefined })
    return n
  }, [chaveSemana, diasDaSemana, plano, salvar])

  // Quem ja tinha colado antes desta mudanca nao perde a semana: o texto
  // guardado vira lista de dias uma vez, e some.
  useEffect(() => {
    const d = plano[chaveSemana] || {}
    if (d.textoMP && !d.agenda) guardarColagem(d.textoMP)
  }, [chaveSemana, plano, guardarColagem])

  useEffect(() => {
    let vivo = true
    async function carregar() {
      setErro(null)
      try {
        const [rContas, rFornecedores, rPagosSemana] = await Promise.all([
          api.get('/api/contas'),
          api.get('/api/fornecedores'),
          api.get(`/api/fornecedores/pagamentos?de=${iso(segunda)}&ate=${iso(domingo)}`),
        ])
        if (!vivo) return
        setContas(rContas.data)
        setPagamentos(rPagosSemana.data)

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
          id: f.id,
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
  }, [chaveSemana, recarga])  // eslint-disable-line react-hooks/exhaustive-deps

  const carregando = !contas || !repasses || !flavia || !pagamentos

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
  const pendentes = dividas.filter(d => !d.quitado)
  const devidos = pendentes.filter(d => d.estado === 'vencido' || d.estado === 'anterior')
  const aVencer = pendentes.filter(d => d.estado === 'a_vencer')
  const quitados = dividas.filter(d => d.quitado)
  // O pedido que o pagamento cobriu so pela metade: e nele que mora a
  // diferenca entre o que a tela calcula e o que ela tem na cabeca.
  const partido = pendentes.find(d => d.abatido > 0)
  const totalPagoFL = flavia && !flavia.ausente ? Number(flavia.totalPago || 0) : 0
  const totalFlavia = devidos.reduce((s, d) => s + d.restante, 0)
  const totalFlaviaAVencer = aVencer.reduce((s, d) => s + d.restante, 0)

  // ---- repasse ------------------------------------------------------------
  // A agenda fica guardada como lista de dias, nao como o texto colado. O
  // texto era a unica copia do dado: apagar a caixa sem querer levava a semana
  // inteira junto. Pedido dela em 14/09/2026 — "se eu apagar algo, apaga de
  // todo meu controle".
  const agenda = daSemana.agenda || {}
  const liberacoes = useMemo(() => {
    const o = {}
    Object.entries(agenda).forEach(([d, v]) => { o[Number(d)] = numeroBR(v) })
    return o
  }, [agenda])
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
  const saldo = numeroBR(daSemana.saldo)
  const reserva = numeroBR(daSemana.reserva)

  // Saldo digitado antes do saldoEm existir: nao se sabe quando foi. O
  // informadoEm nao serve — muda a cada edicao da agenda — e foi ele que tirou
  // da sobra o Pix de 49.310 de 14/09 (17/09/2026). Na duvida, desconta; o
  // botao da lista desfaz.
  const saldoEm = daSemana.saldo && daSemana.saldoEm ? new Date(daSemana.saldoEm) : null
  const ajustesPagamento = daSemana.ajustesPagamento || {}
  const pagosSemana = pagamentosDaSemana(pagamentos, segunda, domingo, saldoEm, ajustesPagamento)
  const pagosDescontados = pagosSemana.filter(p => !p.jaFora)
  const totalPagoFornecedor = pagosDescontados.reduce((s, p) => s + p.valor, 0)

  // A Flavia vencida NAO sai daqui: e informativo. Sai o que foi pago a ela
  // (e a qualquer fornecedor) — pedido dela em 17/09/2026.
  const sobra = saldo + totalRepasse - totalBoletos - totalPagoFornecedor

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
      const saiPagos = pagosDescontados.filter(p => iso(p.data) === iso(data))
      const sai = saiBoletos.reduce((s, c) => s + Number(c.valor || 0), 0) +
        saiPagos.reduce((s, p) => s + p.valor, 0)
      acumulado += entra - sai
      return { data, nome: NOMES_DIA[i], entra, saiBoletos, saiPagos, acumulado }
    })
  }, [saldo, liberacoes, contas, pagamentos, daSemana.saldoEm, daSemana.ajustesPagamento, chaveSemana])  // eslint-disable-line react-hooks/exhaustive-deps

  const diaFlavia = dias.find(d => d.acumulado >= totalFlavia)
  const indiceFlavia = diaFlavia ? dias.indexOf(diaFlavia) : -1

  const salvarAjuste = ajustes => salvar({ ajustesPagamento: ajustes })

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
              composicao={(devidos.length
                ? `${contar(devidos.length, 'lançamento', 'lançamentos')} passados dos ${DIAS_DE_PRAZO} dias`
                : `Nada passou dos ${DIAS_DE_PRAZO} dias`) + ' · informativo, não sai da sobra'}
            />
            <Indicador
              rotulo="Boletos a pagar"
              valor={totalBoletos}
              tom="divida"
              composicao={`${brl(totalBoletosSemana)} vencem na semana` +
                (totalBoletosAtrasados > 0 ? ` + ${brl(totalBoletosAtrasados)} atrasados` : '')}
            />
            <Indicador
              rotulo="Pago a fornecedor"
              valor={totalPagoFornecedor}
              tom="divida"
              composicao={`${contar(pagosDescontados.length, 'pagamento', 'pagamentos')} na semana`}
            />
            <Indicador
              rotulo="Sobra para comprar"
              valor={sobra}
              tom="auto"
              composicao={`${brl(saldo + totalRepasse)} − ${brl(totalBoletos)} de boletos − ${brl(totalPagoFornecedor)} pagos`}
            />
          </div>

          {/* Aqui em cima de proposito: estes campos sao a ENTRADA de tudo que
              a tela mostra. Estavam no fim da pagina, depois de Flavia e
              Boletos, e em 14/09/2026 ela simplesmente nao os encontrou. Pedir
              o dado depois de mostrar as contas que dependem dele e ao
              contrario. */}
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
                <input type="text" inputMode="decimal" style={entrada}
                       value={daSemana.saldo ?? ''}
                       onChange={e => salvar({ saldo: e.target.value })}
                       placeholder="5.922,92" />
                <Lido valor={daSemana.saldo} />
              </label>
              <label>
                <span style={rotulo}>Reserva aplicada</span>
                <input type="text" inputMode="decimal" style={entrada}
                       value={daSemana.reserva ?? ''}
                       onChange={e => salvar({ reserva: e.target.value })}
                       placeholder="59.256,58" />
                <Lido valor={daSemana.reserva} />
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <span style={rotulo}>Lançamentos futuros do Mercado Pago</span>

              {colou ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {diasDaSemana.map(data => {
                    const n = data.getDate()
                    if (agenda[n] === undefined) return null
                    return (
                      <div key={n} style={{
                        display: 'grid', gridTemplateColumns: '7.5rem 1fr auto',
                        gap: 8, alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 13 }}>
                          {NOMES_DIA[(data.getDay() + 6) % 7]} {diaMes(data)}
                        </span>
                        <input type="text" inputMode="decimal" style={entrada}
                               value={agenda[n]}
                               onChange={e => salvar({ agenda: { ...agenda, [n]: e.target.value } })} />
                        <button
                          type="button"
                          onClick={() => {
                            const nova = { ...agenda }
                            delete nova[n]
                            salvar({ agenda: nova })
                          }}
                          aria-label={`Apagar ${diaMes(data)}`}
                          title="Apagar este dia"
                          style={{ ...botao, padding: '7px 11px', lineHeight: 1 }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
                  Nada informado para esta semana.
                  {totalGravado > 0 && ` Usando ${brl(totalGravado)} dos repasses já lançados.`}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 11 }}>
                <button type="button" style={botao}
                        onClick={() => { setColando(v => !v); setAvisoColagem(null) }}>
                  {colando ? 'Cancelar' : colou ? 'Colar agenda de novo' : 'Colar agenda do Mercado Pago'}
                </button>
                {colou && (
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                    {contar(Object.keys(liberacoes).length, 'dia', 'dias')} · {brl(totalColado)} na semana
                    {informadoEm ? ` · informado em ${diaMes(informadoEm)}` : ''}
                  </span>
                )}
              </div>

              {colando && (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    style={{ ...entrada, minHeight: 120, resize: 'vertical', fontSize: 12.5, lineHeight: 1.5 }}
                    value={rascunho}
                    onChange={e => setRascunho(e.target.value)}
                    spellCheck={false}
                    autoFocus
                    placeholder={'Cole aqui, do jeito que o Mercado Pago mostra:\n\nSegunda-feira, 14+R$2.280,51\nTerça-feira, 15+R$16.398,00'} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <button type="button" style={botao} onClick={() => {
                      const n = guardarColagem(rascunho)
                      if (n === 0) {
                        setAvisoColagem('Não achei nenhum dia desta semana nesse texto. Confira se copiou as linhas com o nome do dia.')
                        return
                      }
                      setRascunho('')
                      setColando(false)
                      setAvisoColagem(null)
                    }}>Ler e guardar</button>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Os dias que já estão na lista são substituídos; o resto fica.
                    </span>
                  </div>
                  {avisoColagem && (
                    <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-warning)' }}>
                      {avisoColagem}
                    </p>
                  )}
                </div>
              )}
            </div>
          </SecaoCard>

          <SecaoCard
            titulo="Quando o dinheiro chega"
            subtitulo="Acumulado disponível dia a dia, já descontando boletos e pagamentos a fornecedor."
          >
            {!colou ? (
              <Vazio>
                Informe os lançamentos futuros do Mercado Pago no card acima — é deles que sai o dia a dia.
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
                    d.saiPagos.forEach(p => notas.push(`− ${p.fornecedor_apelido || p.fornecedor_nome} ${brl(p.valor)}`))
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
            subtitulo={`Marque "Pago" no pedido que você pagou. O resto dos pagamentos desce do mais antigo para o mais novo. Vencido = passou de ${DIAS_DE_PRAZO} dias.`}
            total={brl(totalFlavia)}
            totalRotulo="Vencido"
          >
            {flavia.ausente ? (
              <Vazio>Não achei fornecedor com apelido “{APELIDO_FORNECEDOR_COM_PRAZO}”. Cadastre em Fornecedores.</Vazio>
            ) : pendentes.length === 0 ? (
              <Vazio>Nada em aberto — os pagamentos cobrem todos os pedidos.</Vazio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {devidos.map(d => (
                  <Linha
                    key={d.id}
                    esquerda={d.estado === 'anterior'
                      ? 'Saldo de meses anteriores'
                      : `Pedido de ${dia(iso(d.data))}`}
                    apoio={[
                      d.estado === 'anterior'
                        ? (d.descricao || 'O que já era devido antes deste histórico')
                        : (d.descricao || `Venceu em ${dia(iso(somaDias(d.data, DIAS_DE_PRAZO)))}`),
                      // Um pedido pode estar parcialmente coberto porque os
                      // pagamentos nao sao amarrados a pedido: sobra do
                      // anterior desce para o seguinte. Sem dizer isso aqui, o
                      // pedido aparece com valor menor que o real e ninguem
                      // sabe por que.
                      d.abatido > 0
                        ? `${brl(d.valor)} − ${brl(d.abatido)} já abatidos por pagamentos`
                        : null,
                    ].filter(Boolean).join(' · ')}
                    direita={brl(d.restante)}
                    tom="divida"
                    extra={<CaixinhaPago fornecedorId={flavia.id} pedido={d.pedido}
                                         onMudou={() => setRecarga(n => n + 1)} />}
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
                        extra={<CaixinhaPago fornecedorId={flavia.id} pedido={d.pedido}
                                             onMudou={() => setRecarga(n => n + 1)} />}
                      />
                    ))}
                  </>
                )}

                {/* Para onde foi o que ja foi pago.
                    Pagamento aqui nao e amarrado a pedido (migracao 005): e um
                    registro corrido de valores e datas. A tela entao consome os
                    pedidos do mais antigo para o mais novo. Essa alocacao ficava
                    invisivel, e foi o que deixou uma diferenca de R$ 400,00
                    inexplicavel em 14/09/2026: nao dava para ver em qual pedido
                    o dinheiro tinha entrado. */}
                {totalPagoFL > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{
                      fontSize: 12.5, color: 'var(--color-text-muted)', cursor: 'pointer',
                    }}>
                      {brl(totalPagoFL)} já pagos — ver em que pedidos entraram
                    </summary>
                    <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                      {quitados.map(d => (
                        <Linha
                          key={d.id}
                          esquerda={d.data ? `Pedido de ${dia(iso(d.data))}` : 'Saldo de meses anteriores'}
                          apoio={d.pedido.pago_em ? `Marcado como pago em ${dia(d.pedido.pago_em)}` : 'Coberto por inteiro'}
                          direita={brl(d.valor)}
                        />
                      ))}
                      {partido && (
                        <Linha
                          esquerda={partido.data ? `Pedido de ${dia(iso(partido.data))}` : 'Saldo de meses anteriores'}
                          apoio={`Coberto em parte — sobra ${brl(partido.restante)} em aberto`}
                          direita={brl(partido.abatido)}
                        />
                      )}
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                        Os pagamentos não são amarrados a pedido: entram do mais
                        antigo para o mais novo, e o que sobra de um desce para o
                        seguinte. Se algum pedido aqui não deveria estar coberto,
                        é sinal de pagamento lançado a mais ou de pedido faltando.
                      </p>
                    </div>
                  </details>
                )}
              </div>
            )}
          </SecaoCard>

          <SecaoCard
            titulo="Pagamentos a fornecedor"
            subtitulo="Lançados nesta semana — pela Flávia aqui em cima ou em Fornecedores. Saem da sobra para comprar."
            total={brl(totalPagoFornecedor)}
          >
            {pagosSemana.length === 0 ? (
              <Vazio>Nenhum pagamento a fornecedor nesta semana.</Vazio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pagosSemana.map(p => (
                  <Linha key={p.id}
                         esquerda={p.fornecedor_apelido ? `${p.fornecedor_nome} (${p.fornecedor_apelido})` : p.fornecedor_nome}
                         apoio={p.jaFora
                           ? `Pago em ${dia(iso(p.data))} · não descontado — já estava fora do saldo em conta`
                           : `Pago em ${dia(iso(p.data))} · descontado da sobra`}
                         direita={brl(p.valor)}
                         extra={
                           <button type="button" style={{ ...botao, padding: '4px 9px', fontSize: 12 }}
                                   onClick={() => salvarAjuste({ ...ajustesPagamento, [p.id]: p.jaFora })}>
                             {p.jaFora ? 'Descontar da sobra' : 'Não descontar'}
                           </button>
                         } />
                ))}
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

        </>
      )}
    </Layout>
  )
}
