import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Funcionarios, { resumoTexto } from './Funcionarios'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))
import api from '../services/api'

const JOSIE = { id: 'f-1', nome: 'Josie', cnpj: '12345678000195', valor_combinado: 2500, ativo: true,
  mes_atual: { competencia: '2026-09-01', falta: ['nf'], das_em_aberto: true, das_vencimento: '2026-10-20', completo: false, total_pago: 2500, das_valor: 75.9, nf_valor: null, nf_numero: null } }

function respostas({ funcionarios = [], linhas = [], meses = [] }) {
  api.get.mockImplementation(url => {
    if (url === '/api/funcionarios') return Promise.resolve({ data: funcionarios })
    if (url.includes('/lancamentos?competencia=')) return Promise.resolve({ data: linhas })
    if (url.includes('/meses?')) return Promise.resolve({ data: meses })
    throw new Error('URL não prevista: ' + url)
  })
}

beforeEach(() => { api.get.mockReset() })

describe('resumoTexto', () => {
  it('diz o que falta, o DAS em aberto ou que o mês está completo', () => {
    expect(resumoTexto({ falta: ['das', 'nf'], das_em_aberto: false })).toBe('falta: DAS, NF')
    expect(resumoTexto({ falta: [], das_em_aberto: true, das_vencimento: '2026-10-20' })).toBe('DAS em aberto, vence 20/10')
    expect(resumoTexto({ falta: ['nf'], das_em_aberto: true, das_vencimento: null })).toBe('falta: NF · DAS em aberto')
    expect(resumoTexto({ falta: [], das_em_aberto: false, completo: true })).toBe('mês completo ✓')
    expect(resumoTexto(null)).toBe('')
  })
})

describe('Funcionários', () => {
  it('monta sem ninguém cadastrado', async () => {
    respostas({})
    render(<MemoryRouter><Funcionarios /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Nenhum funcionário/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '+ Novo funcionário' })).toBeInTheDocument()
  })

  it('cartão mostra o resumo do mês atual e, ao clicar, abre os três blocos e a lista de meses', async () => {
    respostas({
      funcionarios: [JOSIE],
      linhas: [{ id: 'l-1', funcionario_id: 'f-1', tipo: 'pagamento', competencia: '2026-09-01', valor: 2500, pago_em: '2026-09-15' },
               { id: 'l-2', funcionario_id: 'f-1', tipo: 'das', competencia: '2026-09-01', valor: 75.9, vencimento: '2026-10-20', pago_em: null }],
      meses: [{ competencia: '2026-09-01', falta: ['nf'], das_em_aberto: true, das_vencimento: '2026-10-20', total_pago: 2500 },
              { competencia: '2026-08-01', falta: [], das_em_aberto: false, completo: true, total_pago: 2500 }],
    })
    render(<MemoryRouter><Funcionarios /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/falta: NF · DAS em aberto, vence 20\/10/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Josie'))
    await waitFor(() => expect(screen.getByText('PAGAMENTO')).toBeInTheDocument())
    expect(screen.getByText('DAS')).toBeInTheDocument()
    expect(screen.getByText('NF')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s?75,90 · vence 20\/10\/2026 · em aberto/)).toBeInTheDocument()
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
    expect(screen.getByText(/mês completo ✓/)).toBeInTheDocument()
  })

  it('trocar o mês recarrega os lançamentos daquela competência', async () => {
    respostas({ funcionarios: [JOSIE] })
    render(<MemoryRouter><Funcionarios /></MemoryRouter>)
    await waitFor(() => screen.getByText('Josie'))
    fireEvent.click(screen.getByText('Josie'))
    await waitFor(() => screen.getByText('PAGAMENTO'))
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-08' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/funcionarios/f-1/lancamentos?competencia=2026-08'))
  })

  it('resposta atrasada de um mês antigo não sobrescreve o mês atual', async () => {
    let resolve08
    const pendente08 = new Promise(resolve => { resolve08 = resolve })
    api.get.mockImplementation(url => {
      if (url === '/api/funcionarios') return Promise.resolve({ data: [JOSIE] })
      if (url.includes('/lancamentos?competencia=2026-08')) return pendente08
      if (url.includes('/lancamentos?competencia=2026-07')) {
        return Promise.resolve({ data: [{ id: 'l-07', funcionario_id: 'f-1', tipo: 'nf', competencia: '2026-07-01', valor: 10, numero_nf: '999' }] })
      }
      if (url.includes('/lancamentos?competencia=')) return Promise.resolve({ data: [] })
      if (url.includes('/meses?')) return Promise.resolve({ data: [] })
      throw new Error('URL não prevista: ' + url)
    })

    render(<MemoryRouter><Funcionarios /></MemoryRouter>)
    await waitFor(() => screen.getByText('Josie'))
    fireEvent.click(screen.getByText('Josie'))
    await waitFor(() => screen.getByText('PAGAMENTO'))

    // Troca rápido: 08 fica pendente (controlado à mão) e 07 já resolve.
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-08' } })
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-07' } })
    await waitFor(() => expect(screen.getByText(/NF nº 999/)).toBeInTheDocument())

    // A resposta atrasada do 08 chega por último — não pode aparecer.
    await act(async () => {
      resolve08({ data: [{ id: 'l-08', funcionario_id: 'f-1', tipo: 'nf', competencia: '2026-08-01', valor: 20, numero_nf: '888' }] })
      await pendente08
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText(/NF nº 888/)).not.toBeInTheDocument()
    expect(screen.getByText(/NF nº 999/)).toBeInTheDocument()
  })

  it('erro de carga some quando a carga seguinte dá certo', async () => {
    let falhouUmaVez = false
    api.get.mockImplementation(url => {
      if (url === '/api/funcionarios') return Promise.resolve({ data: [JOSIE] })
      if (url.includes('/lancamentos?competencia=')) {
        if (!falhouUmaVez) { falhouUmaVez = true; return Promise.reject(new Error('falhou')) }
        return Promise.resolve({ data: [] })
      }
      if (url.includes('/meses?')) return Promise.resolve({ data: [] })
      throw new Error('URL não prevista: ' + url)
    })

    render(<MemoryRouter><Funcionarios /></MemoryRouter>)
    await waitFor(() => screen.getByText('Josie'))
    fireEvent.click(screen.getByText('Josie'))
    await waitFor(() => expect(screen.getByText('Não consegui carregar o mês.')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-08' } })
    await waitFor(() => expect(screen.queryByText('Não consegui carregar o mês.')).not.toBeInTheDocument())
  })
})
