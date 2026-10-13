import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import DevolucoesFornecedor from './DevolucoesFornecedor'

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
import api from '../services/api'

const LISTA = [
  { id: 'd1', valor: 300, data_devolucao: '2026-10-13', forma: 'dinheiro', descricao: 'Peças em falta', numero_pedido: null },
  { id: 'd2', valor: 100, data_devolucao: '2026-10-05', forma: 'credito', descricao: null, numero_pedido: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: LISTA })
  api.post.mockResolvedValue({ data: {} })
  api.put.mockResolvedValue({ data: {} })
})

const montar = () => render(<DevolucoesFornecedor fornecedorId="f1" pedidos={[]} podeEditar aoMudar={vi.fn()} />)

describe('Devoluções ao fornecedor', () => {
  it('mostra o selo de cada forma e separa os totais', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/Peças em falta/)).toBeInTheDocument())
    expect(screen.getByText(/Dinheiro de volta/, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Voltou em dinheiro:/)).toHaveTextContent('300,00')
    expect(screen.getByText(/Virou crédito:/)).toHaveTextContent('100,00')
  })

  it('registra em dinheiro, lendo o valor no formato brasileiro', async () => {
    montar()
    await waitFor(() => screen.getByText('+ Registrar devolução'))
    fireEvent.click(screen.getByText('+ Registrar devolução'))
    fireEvent.change(screen.getByLabelText(/Valor devolvido/), { target: { value: '1.250,50' } })
    fireEvent.change(screen.getByLabelText(/Como voltou/), { target: { value: 'dinheiro' } })
    fireEvent.click(screen.getByText('Salvar'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, corpo] = api.post.mock.calls[0]
    expect(url).toBe('/api/fornecedores/f1/devolucoes')
    expect(corpo.valor).toBe(1250.5)
    expect(corpo.forma).toBe('dinheiro')
  })

  it('o padrão é crédito, como sempre funcionou', async () => {
    montar()
    await waitFor(() => screen.getByText('+ Registrar devolução'))
    fireEvent.click(screen.getByText('+ Registrar devolução'))
    expect(screen.getByLabelText(/Como voltou/).value).toBe('credito')
  })

  it('edita uma devolução trocando crédito por dinheiro', async () => {
    montar()
    await waitFor(() => screen.getAllByTitle('Editar'))
    fireEvent.click(screen.getAllByTitle('Editar')[1])   // a de crédito, R$ 100
    expect(screen.getByLabelText(/Valor devolvido/).value).toBe('100,00')
    fireEvent.change(screen.getByLabelText(/Como voltou/), { target: { value: 'dinheiro' } })
    fireEvent.click(screen.getByText('Salvar'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, corpo] = api.put.mock.calls[0]
    expect(url).toBe('/api/fornecedores/f1/devolucoes/d2')
    expect(corpo.forma).toBe('dinheiro')
    expect(corpo.valor).toBe(100)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('recusa valor vazio sem chamar a API', async () => {
    montar()
    await waitFor(() => screen.getByText('+ Registrar devolução'))
    fireEvent.click(screen.getByText('+ Registrar devolução'))
    fireEvent.click(screen.getByText('Salvar'))
    expect(await screen.findByText('Informe o valor da devolução.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
