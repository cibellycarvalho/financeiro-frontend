import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PixSemCompra from './PixSemCompra'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
import api from '../services/api'

const SOLTOS = [{ id: 'pg-1', valor: 49310, data_pagamento: '2026-09-14', arquivo_path: null }]
const PEDIDOS = [
  { id: 'a', data_pedido: '2026-08-10', valor_total: 30000, numero_pedido: '10', pago_em: null, amarrado: 0 },
  { id: 'b', data_pedido: '2026-08-11', valor_total: 19310, numero_pedido: '11', pago_em: null, amarrado: 0 },
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
    // Fix round 1 (item 5): o waitFor de baixo, sem esperar a promise do
    // fetch resolver antes, rodava antes de api.get terminar — o componente
    // ainda estava null por não ter montado o efeito, então o teste passava
    // mesmo que o mock devolvesse Pix solto de verdade. Aguardar a própria
    // promise garante que a resposta ([]) já foi aplicada ao estado antes
    // de afirmar a ausência.
    const resposta = Promise.resolve({ data: [] })
    api.get.mockReturnValue(resposta)
    const { container } = render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    await act(async () => { await resposta })
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

  it('preserva o valor editado à mão quando marca outra compra depois (fix round 1, item 3)', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    fireEvent.change(screen.getByLabelText(/valor amarrado ao pedido 10/), { target: { value: '20000' } })
    fireEvent.click(screen.getByLabelText(/pedido 11/))
    // O campo do pedido 10 continua com o valor digitado (20.000), não volta
    // sozinho para os 30.000 que a redistribuição automática propunha antes.
    expect(screen.getByLabelText(/valor amarrado ao pedido 10/).value).toBe('20000')
    fireEvent.click(screen.getByRole('button', { name: /Amarrar/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/fornecedores/f1/pagamentos/pg-1/pedidos',
      { itens: [{ pedido_id: 'a', valor: 20000 }, { pedido_id: 'b', valor: 19310 }] },
    ))
  })

  it('não propõe amarrar de novo o que outro Pix já cobriu (fix round 1, item 8)', async () => {
    const pedidosComAmarracao = [
      { id: 'a', data_pedido: '2026-08-10', valor_total: 30000, numero_pedido: '10', pago_em: null, amarrado: 12000 },
      { id: 'b', data_pedido: '2026-08-11', valor_total: 19310, numero_pedido: '11', pago_em: null, amarrado: 0 },
    ]
    render(<PixSemCompra fornecedorId="f1" pedidos={pedidosComAmarracao} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    // Disponível do pedido 10 é 30.000 - 12.000 = 18.000, não os 30.000 cheios.
    expect(screen.getByLabelText(/valor amarrado ao pedido 10/).value).toBe('18000')
  })

  it('trava o botão Amarrar com o motivo quando um valor marcado é apagado (fix round 1, item 4)', async () => {
    render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/pedido 10/))
    fireEvent.change(screen.getByLabelText(/valor amarrado ao pedido 10/), { target: { value: '' } })
    expect(screen.getByRole('button', { name: /Amarrar/ })).toBeDisabled()
    expect(await screen.findByText(/Preencha o valor de todas as compras marcadas/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
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

  it('busca os soltos de novo quando a lista de pedidos da tela recarrega (fix round 1, item 9)', async () => {
    const { rerender } = render(<PixSemCompra fornecedorId="f1" pedidos={PEDIDOS} aoMudar={() => {}} />)
    await screen.findByText(/49.310,00/)
    expect(api.get).toHaveBeenCalledTimes(1)
    const pedidosRecarregados = [...PEDIDOS]
    rerender(<PixSemCompra fornecedorId="f1" pedidos={pedidosRecarregados} aoMudar={() => {}} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })
})
