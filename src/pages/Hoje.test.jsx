import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Hoje, { calcularPodeGastar, hojeSP } from './Hoje'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../services/crmApi', () => ({ default: { get: vi.fn() }, crmConfigurado: () => true }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
import api from '../services/api'
import crmApi from '../services/crmApi'

const HOJE = '2026-10-26'
const CONTAS = [
  { id: 1, descricao: 'Fornecedor', valor: 1754, vencimento: '2026-10-26', status: 'pendente' },
  { id: 2, descricao: 'DAS', valor: 86.05, vencimento: '2026-10-20', status: 'pendente' },
  { id: 3, descricao: 'Já pago', valor: 999, vencimento: '2026-10-21', status: 'pago' },
  { id: 4, descricao: 'Aluguel', valor: 3200, vencimento: '2026-10-28', status: 'pendente' },
]

describe('calcularPodeGastar', () => {
  it('banco + MP − o que vence hoje ou já venceu e está em aberto', () => {
    const r = calcularPodeGastar({ saldoBanco: 9870, mpDisponivel: 12390, contas: CONTAS, hoje: HOJE })
    expect(r.totalVencendo).toBe(1840.05)
    expect(r.total).toBe(20419.95)
    expect(r.vencendo.map(c => c.id)).toEqual([1, 2])
  })
  it('sem uma das partes não inventa total', () => {
    const r = calcularPodeGastar({ saldoBanco: null, mpDisponivel: 100, contas: [], hoje: HOJE })
    expect(r.total).toBeNull()
    expect(r.falta).toEqual(['saldo do banco principal'])
  })
})

describe('hojeSP', () => {
  it('usa o fuso de São Paulo, não o do navegador', () => {
    expect(hojeSP(new Date('2026-10-27T01:30:00Z'))).toBe('2026-10-26')
  })
})

describe('tela Hoje', () => {
  beforeEach(() => {
    api.get.mockReset(); crmApi.get.mockReset()
    api.get.mockImplementation(url => {
      if (url === '/api/bancos') return Promise.resolve({ data: [{ id: 'b1', nome: 'Itaú', principal: true, saldo: 1000, saldo_em: new Date().toISOString() }] })
      if (url === '/api/contas') return Promise.resolve({ data: [] })
      if (url === '/api/repasses/a-liberar') return Promise.resolve({ data: { por_dia: {}, total: 500 } })
      throw new Error('URL não prevista: ' + url)
    })
    crmApi.get.mockResolvedValue({ data: { disponivel: 250, a_liberar: 400, lojas_indisponiveis: [] } })
  })
  it('mostra o total com banco principal e Mercado Pago', async () => {
    render(<MemoryRouter><Hoje /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/1\.250,00/)).toBeInTheDocument())
    expect(screen.getByText(/Banco principal · Itaú/)).toBeInTheDocument()
  })
  it('sem Mercado Pago avisa e não mostra total', async () => {
    crmApi.get.mockRejectedValue(new Error('caiu'))
    render(<MemoryRouter><Hoje /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Falta: saldo do Mercado Pago/)).toBeInTheDocument())
  })
})
