/**
 * Papel fin_compras (Valber): sobe e edita pedido, mas não vê pagamentos,
 * devoluções nem o botão de excluir. A trava de verdade é o backend; aqui só
 * garante que a tela não chama rota que ele não pode e não mostra o que não é dele.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Fornecedores from './Fornecedores'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_compras' }) }))
import api from '../services/api'

const hoje = new Date().toISOString().slice(0, 10)
const PEDIDO = { id: 'ped-1', data_pedido: hoje, valor_total: 300, itens: [], nf_path: null }

async function abrir() {
  api.get.mockImplementation(url => {
    if (url === '/api/fornecedores') return Promise.resolve({ data: [{ id: 'f1', nome: 'Flávia', apelido: 'FL', saldo_aberto: 0 }] })
    if (url.includes('/pedidos')) return Promise.resolve({ data: [PEDIDO] })
    return Promise.resolve({ data: [] })
  })
  render(<MemoryRouter><Fornecedores /></MemoryRouter>)
  fireEvent.click(await screen.findByText('FL'))
  await screen.findByText('+ Novo pedido')
}

beforeEach(() => { api.get.mockReset() })

describe('Fornecedores para quem é só de compras', () => {
  it('pode criar pedido e fornecedor', async () => {
    await abrir()
    expect(screen.getByText('+ Novo pedido')).toBeInTheDocument()
    expect(screen.getByText('+ Novo Fornecedor')).toBeInTheDocument()
  })

  it('não busca nem mostra pagamentos e devoluções', async () => {
    await abrir()
    const urls = api.get.mock.calls.map(([url]) => url)
    expect(urls.some(u => u.includes('pagamentos'))).toBe(false)
    expect(urls.some(u => u.includes('devolucoes'))).toBe(false)
    expect(screen.queryByText(/^Pagamentos —/)).toBeNull()
    expect(screen.queryByText(/^Devoluções —/)).toBeNull()
  })

  it('não tem botão de excluir pedido nem fornecedor', async () => {
    await abrir()
    expect(screen.queryByTitle('Excluir pedido')).toBeNull()
    expect(screen.queryByTitle('Excluir fornecedor')).toBeNull()
  })
})
