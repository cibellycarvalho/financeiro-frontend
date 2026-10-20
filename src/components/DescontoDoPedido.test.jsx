import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../services/api', () => ({ default: { post: vi.fn(), delete: vi.fn() } }))
import api from '../services/api'
import DescontoDoPedido, { faltaDoPedido } from './DescontoDoPedido'

// Caso real de 20/10/2026: pedido 7.050, Pix 6.556,50.
const PEDIDO = { id: 'p1', valor_total: '7050.00', desconto: '0', amarrado: '6556.50' }

describe('DescontoDoPedido', () => {
  beforeEach(() => { api.post.mockReset(); api.delete.mockReset() })

  it('faltaDoPedido considera desconto e pagamento', () => {
    expect(faltaDoPedido(PEDIDO)).toBe(493.5)
    expect(faltaDoPedido({ ...PEDIDO, desconto: '493.50' })).toBe(0)
  })

  it('pergunta quando o Pix ficou menor e o "Sim" grava o desconto e recarrega', async () => {
    api.post.mockResolvedValue({ data: {} })
    const onMudou = vi.fn()
    render(<DescontoDoPedido fornecedorId="f1" pedido={PEDIDO} podeEditar onMudou={onMudou} />)
    expect(screen.getByText(/Faltam R\$\s?493,50\. Foi desconto\?/)).toBeTruthy()
    fireEvent.click(screen.getByText('Sim, foi desconto'))
    await waitFor(() => expect(onMudou).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/fornecedores/f1/pedidos/p1/desconto', {})
  })

  it('"Não, ainda devo" esconde a pergunta sem gravar nada', () => {
    render(<DescontoDoPedido fornecedorId="f1" pedido={PEDIDO} podeEditar onMudou={() => {}} />)
    fireEvent.click(screen.getByText('Não, ainda devo'))
    expect(screen.queryByText(/Foi desconto\?/)).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('com desconto mostra o valor e permite desfazer', async () => {
    api.delete.mockResolvedValue({})
    const onMudou = vi.fn()
    render(<DescontoDoPedido fornecedorId="f1" pedido={{ ...PEDIDO, desconto: '493.50' }} podeEditar onMudou={onMudou} />)
    expect(screen.getByText(/Desconto R\$\s?493,50/)).toBeTruthy()
    fireEvent.click(screen.getByText('Desfazer'))
    await waitFor(() => expect(onMudou).toHaveBeenCalled())
    expect(api.delete).toHaveBeenCalledWith('/api/fornecedores/f1/pedidos/p1/desconto')
  })

  it('não pergunta sem pagamento amarrado, com pedido coberto ou para quem não edita', () => {
    const { container, rerender } = render(<DescontoDoPedido fornecedorId="f1" pedido={{ ...PEDIDO, amarrado: '0' }} podeEditar />)
    expect(container.textContent).toBe('')
    rerender(<DescontoDoPedido fornecedorId="f1" pedido={{ ...PEDIDO, amarrado: '7050' }} podeEditar />)
    expect(container.textContent).toBe('')
    rerender(<DescontoDoPedido fornecedorId="f1" pedido={PEDIDO} podeEditar={false} />)
    expect(container.textContent).toBe('')
  })
})
