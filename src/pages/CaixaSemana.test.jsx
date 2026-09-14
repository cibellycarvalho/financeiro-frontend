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
import CaixaSemana, { lerLiberacoes, dividaPorPedido } from './CaixaSemana'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../components/Layout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

import api from '../services/api'

const FORNECEDORES = [
  { id: 'f1', nome: 'Flávia', apelido: 'FL', saldo_aberto: 300 },
  { id: 'f2', nome: 'Luana', apelido: 'LUANA', saldo_aberto: 0 },
]

function respostas({ pedidos = [], pagamentos = [], contas = [], repasses = [] }) {
  api.get.mockImplementation(url => {
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
  localStorage.clear()   // o planejamento da semana mora aqui
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

  it('consome os pedidos do mais antigo para o mais novo com o total já pago', async () => {
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
    await waitFor(() => expect(screen.getByText(/Pedido de 10\/08/)).toBeInTheDocument())
    expect(screen.queryByText(/Pedido de 01\/08/)).not.toBeInTheDocument()
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
})
