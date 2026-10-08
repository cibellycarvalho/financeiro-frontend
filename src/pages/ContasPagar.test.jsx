/**
 * O Flask manda data como "Mon, 14 Sep 2026 00:00:00 GMT". A lista montava
 * `d + 'T00:00:00'` e mostrava "Invalid Date" — ficou escondido enquanto o
 * filtro "Esta semana" escondia os boletos que já tinham vencido (17/09/2026).
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ContasPagar, { lerValor } from './ContasPagar'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))

import api from '../services/api'

const conta = (vencimento, extra = {}) => ({
  id: 'c1', descricao: 'Meli +', categoria: 'OUTRO', valor: '98.90', vencimento,
  marca: 'YUSO', status: 'pago', data_pagamento: null, observacao: null,
  nf_path: null, comprovante_path: null, ...extra,
})

beforeEach(() => { api.get.mockReset(); api.post.mockReset() })

describe('Contas a Pagar — datas', () => {
  it('mostra a data no formato que o backend manda de verdade', async () => {
    api.get.mockResolvedValue({ data: [conta('Mon, 14 Sep 2026 00:00:00 GMT')] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Meli +')).toBeInTheDocument())
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    expect(screen.getByText('14/09/2026')).toBeInTheDocument()
  })

  it('também lê data já no formato ano-mês-dia, sem voltar um dia', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14')] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('14/09/2026')).toBeInTheDocument())
  })
})

describe('Contas a Pagar — anexos de nota fiscal e comprovante', () => {
  it('mostra os dois clipes em cada conta', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14')] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    expect(await screen.findByTestId('nf-c1')).toBeInTheDocument()
    expect(screen.getByTestId('comprovante-c1')).toBeInTheDocument()
  })

  it('subir comprovante manda para a rota da conta', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14')] })
    api.post.mockResolvedValue({ data: { comprovante_path: 'contas/comprovante/c1.pdf' } })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    const entrada = await screen.findByTestId('comprovante-c1')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'pix.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/contas/c1/anexo/comprovante', expect.any(FormData), expect.anything(),
    ))
  })

  it('subir nota fiscal manda para a rota da conta, separada do comprovante', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14')] })
    api.post.mockResolvedValue({ data: { nf_path: 'contas/nf/c1.pdf' } })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    const entrada = await screen.findByTestId('nf-c1')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'nota.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/contas/c1/anexo/nf', expect.any(FormData), expect.anything(),
    ))
  })

  it('pede confirmação antes de substituir um anexo que já existe, e não sobe nada se ela recusar', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { nf_path: 'contas/nf/c1.pdf' })] })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    const entrada = await screen.findByTestId('nf-c1')
    fireEvent.change(entrada, { target: { files: [new File(['x'], 'nota-nova.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(api.post).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('mostra o botão de ver o anexo só quando já existe arquivo', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { nf_path: 'contas/nf/c1.pdf' })] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    await screen.findByTestId('nf-c1')
    expect(screen.getByTitle('Ver nota fiscal')).toBeInTheDocument()
    expect(screen.queryByTitle('Ver comprovante')).not.toBeInTheDocument()
  })

  it('nunca torna nota fiscal ou comprovante obrigatórios: sem nenhum dos dois, ainda dá pra marcar a conta como paga', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { status: 'a_confirmar' })] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    const botaoMarcarPago = await screen.findByText('Marcar pago')
    expect(botaoMarcarPago).not.toBeDisabled()
  })
})

describe('Contas a Pagar — editar conta', () => {
  beforeEach(() => { api.put.mockReset(); window.scrollTo = vi.fn() })

  it('Editar abre o formulário já preenchido, com a data no formato do campo', async () => {
    api.get.mockResolvedValue({ data: [conta('Mon, 14 Sep 2026 00:00:00 GMT', { status: 'pendente', observacao: 'boleto' })] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(screen.getByDisplayValue('Meli +')).toBeInTheDocument()
    expect(screen.getByDisplayValue('98,90')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-09-14')).toBeInTheDocument()
    expect(screen.getByDisplayValue('boleto')).toBeInTheDocument()
  })

  it('salvar manda um PUT para a conta (e nunca cria outra)', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { status: 'pendente' })] })
    api.put.mockResolvedValue({ data: {} })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByDisplayValue('98,90'), { target: { value: '54.520,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/contas/c1', expect.objectContaining({ descricao: 'Meli +', valor: 54520, vencimento: '2026-09-14' }),
    ))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('mostra o erro do servidor e mantém o formulário aberto se não salvar', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { status: 'pendente' })] })
    api.put.mockRejectedValue({ response: { data: { error: 'valor inválido' } } })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/valor inválido|Não consegui salvar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
  })
})

describe('Contas a Pagar — valor no formato brasileiro', () => {
  beforeEach(() => { api.put.mockReset(); window.scrollTo = vi.fn() })
  it('lê ponto de milhar e vírgula decimal', () => {
    expect(lerValor('54.520,00')).toBe(54520)
    expect(lerValor('1.234,5')).toBe(1234.5)
    expect(lerValor('54,52')).toBe(54.52)
    expect(lerValor('R$ 1.000,00')).toBe(1000)
  })
  it('continua lendo o formato com ponto decimal e inteiros', () => {
    expect(lerValor('54.52')).toBe(54.52)
    expect(lerValor('54520')).toBe(54520)
    expect(lerValor('54.520')).toBe(54520)
  })
  it('recusa o que não é número', () => {
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeNull()
    expect(lerValor('1,2,3')).toBeNull()
  })
  it('valor inválido mostra aviso e não envia nada', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14', { status: 'pendente' })] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByDisplayValue('98,90'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/Valor inválido/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })
})
