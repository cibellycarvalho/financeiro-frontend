import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))
vi.mock('../services/auth', () => ({ signOut: vi.fn() }))

const respostas = {}
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(url => Promise.resolve({ data: respostas[url.split('?')[0]] ?? [] })),
    post: vi.fn(),
  },
}))

import CaixaSemana from './CaixaSemana'

/**
 * A Caixa da Semana virou a tela inicial do Painel em 14/09/2026 e o Painel
 * inteiro passou a abrir no aviso de "versão antiga" — que não era versão
 * antiga: é o alarme do index.html pra raiz vazia depois de 8s.
 *
 * O backend manda as datas pelo jsonify do Flask, no formato
 * "Thu, 20 Aug 2026 00:00:00 GMT". A tela cortava os 10 primeiros caracteres
 * achando que era "2026-08-20", e "Thu, 20 Au" + "T00:00:00" é data inválida.
 */
const HOJE = new Date()
const rfc = d => d.toUTCString()          // o formato que o jsonify produz
const diasAtras = n => { const d = new Date(HOJE); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d }

beforeEach(() => {
  // jsdom não tem matchMedia e o Layout usa pra decidir menu lateral x gaveta.
  window.matchMedia = consulta => ({
    matches: false, media: consulta, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  })
  respostas['/api/contas'] = [
    { id: 1, descricao: 'DAS', categoria: 'IMPOSTO_DAS', valor: 900, status: 'pendente', vencimento: rfc(diasAtras(0)) },
  ]
  respostas['/api/fornecedores'] = [{ id: 7, nome: 'Flávia', apelido: 'FL' }]
  respostas['/api/fornecedores/7/pedidos'] = [
    { id: 1, data_pedido: rfc(diasAtras(40)), valor_total: 1000, descricao_produtos: 'antigo' },
    { id: 2, data_pedido: rfc(diasAtras(5)),  valor_total: 500,  descricao_produtos: 'recente' },
  ]
  respostas['/api/fornecedores/7/pagamentos'] = []
  respostas['/api/repasses'] = []
})

describe('Caixa da Semana — datas no formato que o backend manda', () => {
  it('abre sem quebrar com datas do jsonify do Flask', async () => {
    render(<MemoryRouter><CaixaSemana /></MemoryRouter>)
    expect(await screen.findByText('Sobra para comprar')).toBeInTheDocument()
  })

  it('boleto que vence hoje entra na semana — o filtro não compara texto cortado', async () => {
    // Antes o crash escondia outro erro: "Tue, 15 Se" >= "2026-09-14" compara
    // letra com número, e o boleto sumia da semana sem aviso.
    render(<MemoryRouter><CaixaSemana /></MemoryRouter>)
    await screen.findByText('Sobra para comprar')
    expect(screen.getByText(/900,00 vencem na semana/)).toBeInTheDocument()
  })

  it('pedido com mais de 30 dias conta como vencido', async () => {
    render(<MemoryRouter><CaixaSemana /></MemoryRouter>)
    await screen.findByText('Sobra para comprar')
    expect(screen.getByText('1 dia com mais de 30 dias')).toBeInTheDocument()
  })
})
