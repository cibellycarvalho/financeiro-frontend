/**
 * Task 6 do pacote de notas de compra: o clipe de nota fiscal na compra do
 * fornecedor. O teste do brief assume o fornecedor já selecionado — mas a
 * tela real exige clicar no card do fornecedor antes dos pedidos aparecerem,
 * então o fluxo abaixo seleciona o fornecedor primeiro. O que não muda: o
 * clipe existe e o POST vai para a rota certa.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import Fornecedores from './Fornecedores'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))
import api from '../services/api'

// Data no mês atual (a tela filtra por mês, e o padrão é o mês de hoje) para
// o pedido não sumir da lista atrás do filtro.
const PEDIDO = { id: 'ped-1', data_pedido: '2026-09-17', valor_total: 30000, numero_pedido: '1234', itens: [], nf_path: null }

async function abrirComFornecedorSelecionado() {
  api.get.mockImplementation(url => {
    if (url === '/api/fornecedores') return Promise.resolve({ data: [{ id: 'f1', nome: 'Flávia', apelido: 'FL', saldo_aberto: 0 }] })
    if (url.includes('/pedidos')) return Promise.resolve({ data: [PEDIDO] })
    if (url.includes('/pagamentos')) return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })
  render(<MemoryRouter><Fornecedores /></MemoryRouter>)
  const cardFornecedor = await screen.findByText('FL')
  fireEvent.click(cardFornecedor)
}

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset()
})

describe('Nota fiscal da compra', () => {
  it('mostra o clipe de nota fiscal na compra', async () => {
    await abrirComFornecedorSelecionado()
    expect(await screen.findByText(/Nota fiscal/)).toBeInTheDocument()
  })

  it('subir a nota manda o arquivo para a rota da compra', async () => {
    await abrirComFornecedorSelecionado()
    api.post.mockResolvedValue({ data: { nf_path: 'f1/notas/ped-1.pdf' } })
    const entrada = await screen.findByTestId('nf-ped-1')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'nota.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/fornecedores/f1/pedidos/ped-1/nf', expect.any(FormData), expect.anything(),
    ))
  })

  it('nunca torna a nota obrigatória: sem nota, ainda dá pra abrir o formulário de novo pedido', async () => {
    await abrirComFornecedorSelecionado()
    const botaoNovoPedido = await screen.findByText('+ Novo pedido')
    expect(botaoNovoPedido).not.toBeDisabled()
  })
})
