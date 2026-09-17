import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import UploadDocumentoFuncionario from './UploadDocumentoFuncionario'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
import api from '../services/api'

const JOSIE = { id: 'f-1', nome: 'Josie', cnpj: '12345678000195', valor_combinado: 2500 }
const pdf = () => new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })

beforeEach(() => {
  api.post.mockReset(); api.put.mockReset()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('UploadDocumentoFuncionario', () => {
  it('DAS lido de outro mês: avisa e já traz a competência do documento', async () => {
    api.post.mockResolvedValueOnce({ data: {
      leitura_falhou: false, arquivo_token: 'pendentes/' + 'a'.repeat(32) + '.pdf', aviso: null,
      valor: 75.9, vencimento: '2026-10-20', competencia: '2026-08-01', cnpj: '12345678000195', nome: 'JOSIE',
      cnpj_confere: true, das_existente: null,
    } })
    const onSalvo = vi.fn()
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="das_boleto" competencia="2026-09" arquivo={pdf()} existente={null} onSalvo={onSalvo} onCancelar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/O documento é de Agosto 2026/)).toBeInTheDocument())
    expect(api.post.mock.calls[0][0]).toBe('/api/funcionarios/f-1/ler/das')
    expect(screen.getByLabelText(/Competência/).value).toBe('2026-08')
    expect(screen.getByLabelText(/Vencimento/).value).toBe('2026-10-20')

    api.post.mockResolvedValueOnce({ data: { id: 'l-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith('2026-08'))
    expect(api.post.mock.calls[1][0]).toBe('/api/funcionarios/f-1/lancamentos')
    expect(api.post.mock.calls[1][1]).toEqual({ tipo: 'das', competencia: '2026-08', valor: 75.9, vencimento: '2026-10-20', boleto_token: 'pendentes/' + 'a'.repeat(32) + '.pdf' })
  })

  it('pagamento à mão vem com o valor combinado e não chama a leitura', () => {
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="pagamento" competencia="2026-09" arquivo={null} existente={null} onSalvo={() => {}} onCancelar={() => {}} />)
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Valor/).value).toBe('2500')
    expect(screen.getByLabelText(/Pago em/).value).not.toBe('')
  })

  it('NF de outro CNPJ mostra a faixa amarela', async () => {
    api.post.mockResolvedValueOnce({ data: {
      leitura_falhou: false, arquivo_token: null, aviso: null, numero: '123', valor: 2500, data_emissao: '2026-09-05',
      competencia: '2026-09-01', competencia_inferida: true, cnpj_prestador: '99999999000199', nome_prestador: 'OUTRA',
      cnpj_confere: false, nf_existente: null,
    } })
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="nf" competencia="2026-09" arquivo={pdf()} existente={null} onSalvo={() => {}} onCancelar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/CNPJ/)).toBeInTheDocument())
    expect(screen.getByText(/não diz o mês dos serviços/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nº da nota/).value).toBe('123')
  })

  it('comprovante do DAS marca o DAS existente como pago com PUT', async () => {
    api.post.mockResolvedValueOnce({ data: {
      leitura_falhou: false, arquivo_token: 'pendentes/' + 'b'.repeat(32) + '.png', aviso: null,
      valor: 75.9, data_pagamento: '2026-10-18', destinatario: 'SIMPLES NACIONAL', id_transacao: 'E81x', pagamento_existente: null,
    } })
    api.put.mockResolvedValueOnce({ data: { id: 'l-2' } })
    const onSalvo = vi.fn()
    const das = { id: 'l-2', tipo: 'das', competencia: '2026-09-01', valor: 75.9, vencimento: '2026-10-20', pago_em: null }
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="das_comprovante" competencia="2026-09" arquivo={new File(['x'], 'pix.png', { type: 'image/png' })} existente={das} onSalvo={onSalvo} onCancelar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Vai marcar o DAS de Setembro 2026 como pago/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith('2026-09'))
    expect(api.put.mock.calls[0][0]).toBe('/api/funcionarios/f-1/lancamentos/l-2')
    expect(api.put.mock.calls[0][1]).toEqual({ tipo: 'das', competencia: '2026-09', valor: 75.9, pago_em: '2026-10-18', id_transacao: 'E81x', comprovante_token: 'pendentes/' + 'b'.repeat(32) + '.png' })
  })

  it('Pix já lançado mostra a faixa vermelha', async () => {
    api.post.mockResolvedValueOnce({ data: {
      leitura_falhou: false, arquivo_token: null, aviso: null, valor: 2500, data_pagamento: '2026-09-15',
      destinatario: 'JOSIE', id_transacao: 'E81y', pagamento_existente: { id: 'x', data_pagamento: '2026-09-15', valor: 2500, onde: 'fornecedor' },
    } })
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="pagamento" competencia="2026-09" arquivo={pdf()} existente={null} onSalvo={() => {}} onCancelar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/já foi lançado em 15\/09\/2026/)).toBeInTheDocument())
  })

  it('409 com existente_id oferece Substituir', async () => {
    api.post.mockResolvedValueOnce({ data: { leitura_falhou: true, arquivo_token: null, aviso: null, numero: null, valor: null, data_emissao: null, competencia: null, competencia_inferida: false, cnpj_prestador: null, nome_prestador: null, cnpj_confere: null, nf_existente: null } })
    render(<UploadDocumentoFuncionario funcionario={JOSIE} tipo="nf" competencia="2026-09" arquivo={pdf()} existente={null} onSalvo={() => {}} onCancelar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Não consegui ler/)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Nº da nota/), { target: { value: '77' } })
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Já existe NF em 09/2026', existente_id: 'l-9' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Substituir' })).toBeInTheDocument())
    api.put.mockResolvedValueOnce({ data: { id: 'l-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Substituir' }))
    await waitFor(() => expect(api.put.mock.calls[0][0]).toBe('/api/funcionarios/f-1/lancamentos/l-9'))
  })
})
