/**
 * A Caixa da Semana subiu e o painel abriu em branco — a mensagem "Nao foi
 * possivel carregar o Painel" do index.html aparece quando nada monta em 8
 * segundos, e é o que a pessoa vê quando a tela inicial quebra.
 *
 * Estes testes existem para que isso não volte a ser descoberto em produção.
 * O mais importante é o do pedido sem data: um `data_pedido` nulo fazia
 * `toISOString()` receber Invalid Date e lançar RangeError durante a
 * renderização, derrubando a árvore inteira.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import CaixaSemana, { lerLiberacoes, dividaPorPedido, numeroBR, pagamentosDaSemana, planoDoBanco, planoParaBanco } from './CaixaSemana'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
vi.mock('../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

import api from '../services/api'

const FORNECEDORES = [
  { id: 'f1', nome: 'Flávia', apelido: 'FL', saldo_aberto: 300 },
  { id: 'f2', nome: 'Luana', apelido: 'LUANA', saldo_aberto: 0 },
]

const SEM_PLANEJAMENTO = { saldo_conta: null, saldo_em: null, reserva_aplicada: null, agenda: {}, ajustes_pagamento: {}, updated_at: null }

function respostas({ pedidos = [], pagamentos = [], contas = [], repasses = [], pagosSemana = [], planejamento = SEM_PLANEJAMENTO }) {
  api.get.mockImplementation(url => {
    if (url.startsWith('/api/planejamento/')) return Promise.resolve({ data: planejamento })
    if (url.startsWith('/api/fornecedores/pagamentos?')) return Promise.resolve({ data: pagosSemana })
    if (url === '/api/contas') return Promise.resolve({ data: contas })
    if (url === '/api/fornecedores') return Promise.resolve({ data: FORNECEDORES })
    if (url.includes('/pedidos')) return Promise.resolve({ data: pedidos })
    if (url.includes('/pagamentos')) return Promise.resolve({ data: pagamentos })
    if (url.startsWith('/api/repasses')) return Promise.resolve({ data: repasses })
    throw new Error('URL não prevista no teste: ' + url)
  })
}

function montar() {
  return render(<MemoryRouter><CaixaSemana /></MemoryRouter>)
}

beforeEach(() => {
  api.get.mockReset()
  api.post.mockReset()
  api.put.mockReset()
  api.put.mockResolvedValue({ data: {} })
  localStorage.clear()   // só a cópia antiga do planejamento, de antes de ir pro banco
})

describe('Caixa da Semana', () => {
  it('monta sem dado nenhum, em vez de deixar a tela em branco', async () => {
    respostas({})
    montar()
    await waitFor(() => expect(screen.getByText('Sobra para comprar')).toBeInTheDocument())
  })

  it('conta o saldo sem data como dívida vencida, não como dúvida', async () => {
    // A linha sem data é o saldo de abertura — o que já se devia quando o
    // painel começou. É a dívida mais antiga que existe, não uma incógnita.
    respostas({
      pedidos: [{ id: 'p0', data_pedido: null, valor_total: 400 }],
      pagamentos: [],
    })
    montar()
    await waitFor(() => expect(screen.getByText('Saldo de meses anteriores')).toBeInTheDocument())
    // O valor aparece três vezes de propósito — no indicador, na linha e no
    // total da seção. É a mesma conta dita nos três lugares.
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThanOrEqual(2)
  })

  it('não quebra quando um pedido vem sem data', async () => {
    respostas({
      pedidos: [
        { id: 'p1', data_pedido: null, valor_total: 100 },
        { id: 'p2', data_pedido: '2026-08-10', valor_total: 200 },
      ],
      pagamentos: [],
    })
    montar()
    await waitFor(() => expect(screen.getByText('Sobra para comprar')).toBeInTheDocument())
  })

  it('consome os pedidos do mais antigo para o mais novo, e mostra onde o dinheiro entrou', async () => {
    // Pagou 150: cobre o pedido de 01/08 (100) e metade do de 10/08 (50 de 200).
    // Sobram 150 do de 10/08, que já passou dos 30 dias — é o vencido.
    respostas({
      pedidos: [
        { id: 'p1', data_pedido: '2026-08-01', valor_total: 100 },
        { id: 'p2', data_pedido: '2026-08-10', valor_total: 200 },
      ],
      pagamentos: [{ id: 'g1', valor: 150, data_pagamento: '2026-08-05' }],
    })
    montar()
    // O de 10/08 aparece duas vezes de propósito: na dívida, pelo que falta, e
    // no detalhamento, pelos R$ 50,00 que o pagamento já cobriu dele.
    await waitFor(() => expect(screen.getAllByText(/Pedido de 10\/08/).length).toBe(2))

    // O pedido coberto sai da lista de dívida, mas não some da tela: é ele que
    // explica para onde foi o que já foi pago. Sem isso, uma diferença de
    // R$ 400,00 fica sem explicação possível — foi o que aconteceu em 14/09.
    expect(screen.getByText('Coberto por inteiro')).toBeInTheDocument()
    expect(screen.getByText(/R\$ 150,00 já pagos/)).toBeInTheDocument()
    expect(screen.getByText(/Coberto em parte/)).toBeInTheDocument()
  })

  it('soma boletos atrasados junto com os da semana', async () => {
    respostas({
      contas: [
        { id: 'c1', descricao: 'DAS atrasado', valor: 500, vencimento: '2026-01-10',
          status: 'vencido', categoria: 'IMPOSTO_DAS' },
        { id: 'c2', descricao: 'Já pago', valor: 900, vencimento: '2026-01-11',
          status: 'pago', categoria: 'OUTRO' },
      ],
    })
    montar()
    await waitFor(() => expect(screen.getByText('DAS atrasado')).toBeInTheDocument())
    expect(screen.queryByText('Já pago')).not.toBeInTheDocument()
  })

  it('lê os totais de dia da agenda do Mercado Pago e ignora o detalhe', () => {
    const porDia = lerLiberacoes(`setembro
Segunda-feira, 14+R$5.809,88

* Liberação de dinheiro
+R$785,58
13h00
* Meli+
-R$98,90

Terça-feira, 15+R$16.407,92`)
    // As linhas de dentro do dia não entram: o total do dia já vem líquido, e
    // somar os dois contaria o mesmo dinheiro duas vezes.
    expect(porDia).toEqual({ 14: 5809.88, 15: 16407.92 })
  })

  it('lê valor em dinheiro do jeito que se escreve aqui', () => {
    // O campo era type="number": "5.922,92" virava campo inválido, que o
    // navegador entrega como string vazia, e o saldo virava zero calado.
    expect(numeroBR('5.922,92')).toBe(5922.92)
    expect(numeroBR('R$ 59.256,58')).toBe(59256.58)
    expect(numeroBR('5922,92')).toBe(5922.92)
    expect(numeroBR('5922.92')).toBe(5922.92)   // quem digita com ponto também acerta
    expect(numeroBR('5.922')).toBe(5922)        // ponto com 3 casas é milhar, não decimal
    expect(numeroBR('')).toBe(0)
    expect(numeroBR(null)).toBe(0)
    expect(numeroBR('abc')).toBe(0)
  })

  it('lê a agenda mesmo quando o Mercado Pago quebra o valor em várias linhas', () => {
    // Copiando da tela do Mercado Pago o valor vem picado assim. A primeira
    // versão parava no "2.280" e perdia os centavos de todo dia — o total da
    // semana saiu redondo e ninguém estranharia.
    const porDia = lerLiberacoes(`Segunda-feira, 14
+
R$
2.280
,
51
Terça-feira, 15
+
R$
16.398
,
00`)
    expect(porDia).toEqual({ 14: 2280.51, 15: 16398 })
  })

  it('o saldo de abertura conta como vencido no cálculo da dívida', () => {
    const hoje = new Date(2026, 8, 14)
    const linhas = dividaPorPedido(
      [
        { id: 'p0', data_pedido: null, valor_total: 400 },
        { id: 'p1', data_pedido: '2026-09-13', valor_total: 100 },
      ],
      0,
      hoje,
    )
    const semData = linhas.find(l => l.id === 'p0')
    const recente = linhas.find(l => l.id === 'p1')
    expect(semData.estado).toBe('anterior')
    expect(recente.estado).toBe('a_vencer')
  })

  it('a Flávia vencida é informativa: não sai da sobra para comprar', async () => {
    respostas({ pedidos: [{ id: 'p0', data_pedido: null, valor_total: 400 }] })
    montar()
    await waitFor(() => expect(screen.getByText('Sobra para comprar')).toBeInTheDocument())
    expect(screen.getByText(/R\$ 0,00 − R\$ 0,00 de boletos − R\$ 0,00 pagos/)).toBeInTheDocument()
  })

  it('pagamento a fornecedor da semana sai da sobra e aparece na lista', async () => {
    const hoje = new Date()
    const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    respostas({
      pagosSemana: [{ id: 'g9', fornecedor_nome: 'Luana', fornecedor_apelido: 'LUANA', valor: 1200,
                      data_pagamento: d, created_at: hoje.toUTCString() }],
    })
    montar()
    await waitFor(() => expect(screen.getByText('Luana (LUANA)')).toBeInTheDocument())
    expect(screen.getByText(/− R\$ 1\.200,00 pagos/)).toBeInTheDocument()
  })

  it('a caixinha Pago do pedido lança o pagamento amarrado a ele', async () => {
    respostas({ pedidos: [{ id: 'p0', data_pedido: null, valor_total: 400 }] })
    api.post.mockResolvedValue({ data: {} })
    montar()
    fireEvent.click(await screen.findByLabelText('Pago'))
    fireEvent.click(screen.getByText('Lançar pagamento de R$ 400,00'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, corpo] = api.post.mock.calls[0]
    expect(url).toBe('/api/fornecedores/f1/pedidos/p0/pago')
    expect(corpo.modo).toBe('lancar')
  })

  it('pedido marcado como pago consome o próprio valor antes do mais antigo', () => {
    // Pix de 49.310 pagou os pedidos de 10 e 11/08, não o saldo de julho.
    const hoje = new Date('2026-09-17T00:00:00')
    const linhas = dividaPorPedido([
      { id: 'jul', data_pedido: '2026-07-01', valor_total: 1000 },
      { id: 'a10', data_pedido: '2026-08-10', valor_total: 35310, pago_em: '2026-09-14' },
      { id: 'a11', data_pedido: '2026-08-11', valor_total: 14000, pago_em: '2026-09-14' },
    ], 49310, hoje)
    const por = Object.fromEntries(linhas.map(l => [l.id, l]))
    expect(por.jul.restante).toBe(1000)
    expect(por.a10.quitado && por.a11.quitado).toBe(true)
  })

  it('todo pagamento da semana sai da sobra — o saldo em conta não muda isso', () => {
    const segunda = new Date('2026-09-14T00:00:00')
    const domingo = new Date('2026-09-20T00:00:00')
    const r = pagamentosDaSemana([
      { id: 'a', valor: 1, data_pagamento: '2026-09-14', created_at: '2026-09-14T09:00:00' },
      { id: 'b', valor: 1, data_pagamento: '2026-09-16', created_at: '2026-09-16T09:00:00' },
      { id: 'e', valor: 1, data_pagamento: '2026-09-22', created_at: '2026-09-22T09:00:00' },  // outra semana
    ], segunda, domingo)
    expect(r.map(p => [p.id, p.jaFora])).toEqual([['a', false], ['b', false]])
  })

  it('a escolha na lista tira ou devolve um pagamento à sobra', () => {
    const segunda = new Date('2026-09-14T00:00:00')
    const domingo = new Date('2026-09-20T00:00:00')
    const pix = [{ id: 'pix', valor: 49310, data_pagamento: '2026-09-14', created_at: '2026-09-14T20:40:00Z' }]
    expect(pagamentosDaSemana(pix, segunda, domingo)[0].jaFora).toBe(false)
    expect(pagamentosDaSemana(pix, segunda, domingo, { pix: false })[0].jaFora).toBe(true)
    expect(pagamentosDaSemana(pix, segunda, domingo, { pix: true })[0].jaFora).toBe(false)
  })

  it('pagamento da semana é descontado mesmo com saldo digitado', async () => {
    const hoje = new Date()
    const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const seg = new Date(hoje); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
    const chave = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
    respostas({
      planejamento: { ...SEM_PLANEJAMENTO, saldo_conta: '1000.00', saldo_em: null, updated_at: new Date().toUTCString() },
      pagosSemana: [{ id: 'pix', fornecedor_nome: 'Flávia', fornecedor_apelido: 'FL', valor: 300,
                      data_pagamento: d, created_at: new Date(hoje.getTime() - 3600e3).toUTCString() }],
    })
    montar()
    await waitFor(() => expect(screen.getByText(/descontado da sobra/)).toBeInTheDocument())
  })

  it('comprovante de Pix já lançado só marca o pedido', async () => {
    respostas({ pedidos: [{ id: 'p0', data_pedido: null, valor_total: 400 }] })
    api.post.mockImplementation(url => url.endsWith('/pagamentos/ler')
      ? Promise.resolve({ data: { pagamento_existente: { id: 'g', valor: 49310, data_pagamento: 'Mon, 14 Sep 2026 00:00:00 GMT' } } })
      : Promise.resolve({ data: {} }))
    const { container } = montar()
    fireEvent.click(await screen.findByLabelText('Pago'))
    const arquivo = new File(['x'], 'pix.pdf', { type: 'application/pdf' })
    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [arquivo] } })
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1]).toEqual(['/api/fornecedores/f1/pedidos/p0/pago', { modo: 'ja_lancado', data_pagamento: '2026-09-14' }])
  })
})

describe('Card Pago a fornecedor', () => {
  it('diz de quem é cada pagamento, para não ser lido como pagamento à Flávia', async () => {
    const hoje = new Date()
    const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    respostas({
      pagosSemana: [
        { id: 'a', fornecedor_nome: 'FY', fornecedor_apelido: 'FY', valor: 34200, data_pagamento: d, created_at: hoje.toUTCString() },
        { id: 'b', fornecedor_nome: 'Flavia', fornecedor_apelido: 'FL', valor: 49310, data_pagamento: d, created_at: hoje.toUTCString() },
      ],
    })
    montar()
    await waitFor(() => expect(screen.getByText(/FY R\$\s?34\.200,00 · Flavia R\$\s?49\.310,00/)).toBeInTheDocument())
  })
})

describe('Planejamento da semana no banco', () => {
  const SEGUNDA = new Date(2026, 8, 14)   // 14/09/2026

  it('do banco para a tela: número vira texto em reais e a data vira dia do mês', () => {
    const d = planoDoBanco({
      saldo_conta: '12000.50', saldo_em: 'Tue, 15 Sep 2026 13:20:00 GMT', reserva_aplicada: null,
      retirada_reserva: '40797.00', agenda: { '2026-09-15': 2280.51 }, ajustes_pagamento: { pg1: true },
      updated_at: 'Wed, 16 Sep 2026 10:00:00 GMT',
    })
    expect(d.saldo).toBe('12.000,50')
    expect(d.reserva).toBeUndefined()           // "não informado" não vira zero
    expect(d.retirada).toBe('40.797,00')
    expect(d.agenda).toEqual({ 15: '2.280,51' })
    expect(d.ajustesPagamento).toEqual({ pg1: true })
    expect(new Date(d.saldoEm).toISOString()).toBe('2026-09-15T13:20:00.000Z')
  })

  it('da tela para o banco: texto em reais vira número e dia do mês vira data da semana', () => {
    const corpo = planoParaBanco({
      saldo: '5.922,92', saldoEm: '2026-09-15T13:20:00.000Z', reserva: '', retirada: '40.797,00',
      agenda: { 14: '2.280,51', 15: '' }, ajustesPagamento: { pg1: false },
    }, SEGUNDA)
    expect(corpo).toEqual({
      saldo_conta: 5922.92, saldo_em: '2026-09-15T13:20:00.000Z', reserva_aplicada: null, retirada_reserva: 40797,
      agenda: { '2026-09-14': 2280.51 }, ajustes_pagamento: { pg1: false },
    })
  })

  it('não aceita resposta estranha do banco como planejamento', () => {
    expect(planoDoBanco([])).toEqual({})
    expect(planoDoBanco(null)).toEqual({})
  })

  it('o saldo guardado no banco aparece, mas é só informação — não entra na sobra', async () => {
    respostas({ planejamento: { ...SEM_PLANEJAMENTO, saldo_conta: '5000.00', updated_at: new Date().toUTCString() } })
    montar()
    await waitFor(() => expect(screen.getByDisplayValue('5.000,00')).toBeInTheDocument())
    expect(screen.getByText(/R\$\s?0,00 − R\$\s?0,00 de boletos − R\$\s?0,00 pagos/)).toBeInTheDocument()
  })

  it('digitar o saldo grava no banco, para aparecer em qualquer aparelho', async () => {
    respostas({})
    montar()
    const campo = await screen.findByPlaceholderText('5.922,92')
    await waitFor(() => expect(campo).not.toBeDisabled())
    fireEvent.change(campo, { target: { value: '3.500,00' } })
    await waitFor(() => expect(api.put).toHaveBeenCalled(), { timeout: 3000 })
    const [url, corpo] = api.put.mock.calls.at(-1)
    expect(url).toMatch(/^\/api\/planejamento\/\d{4}-\d{2}-\d{2}$/)
    expect(corpo.saldo_conta).toBe(3500)
    expect(corpo.saldo_em).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('o que estava só neste navegador sobe para o banco uma vez e sai do navegador', async () => {
    const hoje = new Date()
    const seg = new Date(hoje); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
    const chave = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
    localStorage.setItem('caixa-semana:planejamento', JSON.stringify({
      [chave]: { saldo: '7.000,00', saldoEm: '2026-09-15T10:00:00.000Z' },
      '2020-01-06': { saldo: '1,00' },
    }))
    respostas({})   // banco vazio para esta semana
    montar()
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, corpo] = api.put.mock.calls[0]
    expect(url).toBe(`/api/planejamento/${chave}`)
    expect(corpo.saldo_conta).toBe(7000)
    expect(corpo.saldo_em).toBe('2026-09-15T10:00:00.000Z')   // a hora de quando ela digitou
    await waitFor(() => {
      const resto = JSON.parse(localStorage.getItem('caixa-semana:planejamento') || '{}')
      expect(resto[chave]).toBeUndefined()
      expect(resto['2020-01-06']).toBeDefined()   // outras semanas ficam onde estão
    })
  })

  it('banco com dado ganha do navegador: não sobrescreve com cópia velha', async () => {
    const hoje = new Date()
    const seg = new Date(hoje); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
    const chave = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`
    localStorage.setItem('caixa-semana:planejamento', JSON.stringify({ [chave]: { saldo: '1,00' } }))
    respostas({ planejamento: { ...SEM_PLANEJAMENTO, saldo_conta: '9000.00', updated_at: new Date().toUTCString() } })
    montar()
    await waitFor(() => expect(screen.getByDisplayValue('9.000,00')).toBeInTheDocument())
    expect(api.put).not.toHaveBeenCalled()
  })
})

describe('A conta da semana (ditada em 17/09/2026)', () => {
  const hoje = new Date()
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const seg = new Date(hoje); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7))
  const dom = new Date(seg); dom.setDate(dom.getDate() + 6)

  it('entra na semana é a agenda inteira: o que já caiu mais o que vai cair', async () => {
    respostas({ planejamento: { ...SEM_PLANEJAMENTO, agenda: { [ymd(seg)]: 1000, [ymd(dom)]: 500 }, updated_at: hoje.toUTCString() } })
    montar()
    await waitFor(() => expect(screen.getByText('Entra na semana')).toBeInTheDocument())
    expect(screen.getAllByText('R$ 1.500,00').length).toBeGreaterThan(0)
    expect(screen.getByText(/já caíram/)).toBeInTheDocument()
  })

  it('sobra = entra − boletos da semana (pagos ou não) − pagos a fornecedor; saldo não entra', async () => {
    respostas({
      planejamento: { ...SEM_PLANEJAMENTO, saldo_conta: '99999.00', agenda: { [ymd(seg)]: 1000 }, updated_at: hoje.toUTCString() },
      contas: [{ id: 'c1', descricao: 'Meli +', valor: 100, vencimento: ymd(hoje), status: 'pago',
                 data_pagamento: ymd(hoje), categoria: 'OUTRO' }],
      pagosSemana: [{ id: 'g1', fornecedor_nome: 'FY', fornecedor_apelido: 'FY', valor: 200,
                      data_pagamento: ymd(hoje), created_at: hoje.toUTCString() }],
    })
    montar()
    await waitFor(() => expect(screen.getByText(/R\$\s?1\.000,00 − R\$\s?100,00 de boletos − R\$\s?200,00 pagos/)).toBeInTheDocument())
    expect(screen.getByText('Meli +')).toBeInTheDocument()
    expect(screen.getByText(/Pago em .* vencia/)).toBeInTheDocument()
  })

  it('boleto de antes pago nesta semana entra, mas não é chamado de atrasado', async () => {
    const sab = new Date(seg); sab.setDate(sab.getDate() - 2)   // sábado anterior
    respostas({ contas: [{ id: 'c3', descricao: 'Santander', valor: 3202.57, vencimento: ymd(sab),
                           status: 'pago', data_pagamento: ymd(seg), categoria: 'OUTRO' }] })
    montar()
    await waitFor(() => expect(screen.getByText('Santander')).toBeInTheDocument())
    expect(screen.getByText(/3\.202,57 de antes, pagos na semana/)).toBeInTheDocument()
    expect(screen.queryByText(/atrasados/)).not.toBeInTheDocument()
  })

  it('retirado da reserva aparece como informação e não muda a sobra', async () => {
    respostas({
      planejamento: { ...SEM_PLANEJAMENTO, retirada_reserva: '40797.00', agenda: { [ymd(seg)]: 1000 }, updated_at: hoje.toUTCString() },
      pagosSemana: [{ id: 'g1', fornecedor_nome: 'Flavia', fornecedor_apelido: 'FL', valor: 6000,
                      data_pagamento: ymd(hoje), created_at: hoje.toUTCString() }],
    })
    montar()
    await waitFor(() => expect(screen.getByText('Retirado da reserva')).toBeInTheDocument())
    expect(screen.getAllByText('R$ 40.797,00').length).toBeGreaterThan(0)   // card + seção Reserva
    // sobra = 1.000 − 0 − 6.000 = −5.000: a reserva não entrou na conta, só explica o buraco
    expect(screen.getByText(/R\$\s?1\.000,00 − R\$\s?0,00 de boletos − R\$\s?6\.000,00 pagos · os R\$\s?5\.000,00 que faltaram saíram da reserva/)).toBeInTheDocument()
  })

  it('boleto de outra semana já pago não entra', async () => {
    respostas({ contas: [{ id: 'c2', descricao: 'Antigo pago', valor: 900, vencimento: '2026-01-11',
                           status: 'pago', data_pagamento: '2026-01-11', categoria: 'OUTRO' }] })
    montar()
    await waitFor(() => expect(screen.getByText('Sobra para comprar')).toBeInTheDocument())
    expect(screen.queryByText('Antigo pago')).not.toBeInTheDocument()
  })
})
