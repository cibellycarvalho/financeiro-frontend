/**
 * Fix round 1 da Task 8 (itens 1 e 2, CRITICAL): antes disto, depois de
 * amarrar um Pix a uma compra, nenhum lugar da tela mostrava a que compra
 * ele ficou amarrado, e a única forma de desfazer um erro era apagar o
 * pagamento inteiro e relançar, perdendo data e comprovante. Este teste
 * cobre o caminho inteiro: o pagamento amarrado aparece com a compra e um
 * botão Desamarrar, clicar nele chama o DELETE certo, recarrega os dados e
 * o Pix volta a aparecer em "Pix sem compra".
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

const PEDIDO = {
  id: 'ped-1', data_pedido: '2026-08-10', valor_total: 30000,
  numero_pedido: '10', itens: [], nf_path: null, pago_em: null, amarrado: 30000,
}
const PAGAMENTO_AMARRADO = {
  id: 'pg-1', valor: 30000, data_pagamento: '2026-09-14', arquivo_path: null,
  amarracoes: [{ pedido_id: 'ped-1', numero_pedido: '10', data_pedido: '2026-08-10', valor: 30000 }],
}

function mockRotas({ pagamentos, soltos }) {
  api.get.mockImplementation(url => {
    if (url === '/api/fornecedores') return Promise.resolve({ data: [{ id: 'f1', nome: 'Flávia', apelido: 'FL', saldo_aberto: 0 }] })
    if (url.includes('/pagamentos/soltos')) return Promise.resolve({ data: soltos })
    if (url.includes('/pedidos')) return Promise.resolve({ data: [PEDIDO] })
    if (url.includes('/pagamentos')) return Promise.resolve({ data: pagamentos })
    return Promise.resolve({ data: [] })
  })
}

beforeEach(() => {
  api.get.mockReset(); api.delete.mockReset()
})

describe('Desamarrar Pix de uma compra', () => {
  it('mostra a compra amarrada e um botão Desamarrar', async () => {
    mockRotas({ pagamentos: [PAGAMENTO_AMARRADO], soltos: [] })
    render(<MemoryRouter><Fornecedores /></MemoryRouter>)
    fireEvent.click(await screen.findByText('FL'))

    expect(await screen.findByText(/Amarrado a:/)).toBeInTheDocument()
    expect(screen.getByText(/pedido 10/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Desamarrar/ })).toBeInTheDocument()
  })

  it('desamarrar chama o DELETE certo, recarrega e o Pix volta a "Pix sem compra"', async () => {
    mockRotas({ pagamentos: [PAGAMENTO_AMARRADO], soltos: [] })
    api.delete.mockResolvedValue({})
    const { rerender } = render(<MemoryRouter><Fornecedores /></MemoryRouter>)
    fireEvent.click(await screen.findByText('FL'))
    await screen.findByRole('button', { name: /Desamarrar/ })

    // Depois do DELETE, a recarga passa a devolver o pagamento sem amarração
    // e o Pix solto de novo — simula o estado real pós-desamarração.
    const pagamentoSolto = { ...PAGAMENTO_AMARRADO, amarracoes: [] }
    const pixSolto = { id: 'pg-1', valor: 30000, data_pagamento: '2026-09-14', arquivo_path: null }
    mockRotas({ pagamentos: [pagamentoSolto], soltos: [pixSolto] })

    window.confirm = vi.fn(() => true)
    fireEvent.click(screen.getByRole('button', { name: /Desamarrar/ }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/fornecedores/f1/pagamentos/pg-1/pedidos'))
    await waitFor(() => expect(screen.queryByText(/Amarrado a:/)).not.toBeInTheDocument())
    expect(await screen.findByText('Pix sem compra')).toBeInTheDocument()
  })
})
