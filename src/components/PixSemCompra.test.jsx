import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PixSemCompra from './PixSemCompra'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
import api from '../services/api'

const SOLTOS = [{ id: 'pg-1', valor: 49310, data_pagamento: '2026-09-14', arquivo_path: null }]
const PEDIDOS = [
  { id: 'a', data_pedido: '2026-08-10', valor_total: 30000, numero_pedido: '10', pago_em: null },
  { id: 'b', data_pedido: '2026-08-11', valor_total: 19310, numero_pedido: '11', pago_em: null },
]

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset()
  api.get.mockResolvedValue({ data: SOLTOS })
})

describe('Pix sem compra', () => {
  it('lista os Pix soltos do fornecedor', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    expect(await screen.findByText(/49.310,00/)).toBeInTheDocument()
  })

  it('divide o valor da mais antiga para a mais nova ao marcar duas compras', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    fireEvent.click(screen.getByLabelText(/pedido 11/))
    fireEvent.click(screen.getByRole('button', { name: /Amarrar/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/fornecedores/f1/pagamentos/pg-1/pedidos',
      { itens: [{ pedido_id: 'a', valor: 30000 }, { pedido_id: 'b', valor: 19310 }] },
    ))
  })

  it('mostra o erro que o backend devolve, sem inventar texto', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Essa compra só tem R$ 10,00 em aberto — o valor amarrado não pode passar disso.' } } })
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    fireEvent.click(screen.getByRole('button', { name: /Amarrar/ }))
    expect(await screen.findByText(/só tem R\$ 10,00 em aberto/)).toBeInTheDocument()
  })

  it('não aparece quando não há Pix solto', async () => {
    api.get.mockResolvedValue({ data: [] })
    const { container } = render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    await waitFor(() => expect(container.textContent).not.toMatch(/Amarrar/))
  })

  it('deixa editar o valor amarrado à mão', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    const campoValor = screen.getByLabelText(/valor amarrado ao pedido 10/)
    fireEvent.change(campoValor, { target: { value: '15000' } })
    fireEvent.click(screen.getByRole('button', { name: /Amarrar/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/fornecedores/f1/pagamentos/pg-1/pedidos',
      { itens: [{ pedido_id: 'a', valor: 15000 }] },
    ))
  })

  it('avisa que amarrar é opcional', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    expect(await screen.findByText(/opcional/)).toBeInTheDocument()
  })

  it('some da lista de soltos e chama aoMudar depois de amarrar com sucesso', async () => {
    api.post.mockResolvedValue({ data: { itens: [] } })
    const aoMudar = vi.fn()
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={aoMudar} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    fireEvent.click(screen.getByRole('button', { name: /Amarrar/ }))
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/49.310,00/)).not.toBeInTheDocument())
  })
})
