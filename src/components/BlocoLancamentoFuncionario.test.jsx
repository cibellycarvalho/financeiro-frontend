import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BlocoLancamentoFuncionario, { descricaoDaLinha } from './BlocoLancamentoFuncionario'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
import api from '../services/api'

const DAS_ABERTO = { id: 'l-2', funcionario_id: 'f-1', tipo: 'das', competencia: '2026-09-01', valor: 75.9, vencimento: '2026-10-20', pago_em: null, boleto_path: 'x', comprovante_path: null }

beforeEach(() => { api.put.mockReset(); api.delete.mockReset() })

// formatMoeda usa toLocaleString('pt-BR', { style: 'currency' }), que no Node
// emite um espaço não separável (U+00A0) entre "R$" e o número. Normalizamos
// antes de comparar para não depender desse detalhe de locale.
const semNbsp = s => s.replace(/ /g, ' ')

describe('descricaoDaLinha', () => {
  it('descreve cada tipo', () => {
    expect(semNbsp(descricaoDaLinha({ tipo: 'pagamento', valor: 2500, pago_em: '2026-10-05' }))).toBe('R$ 2.500,00 · pago em 05/10/2026')
    expect(semNbsp(descricaoDaLinha(DAS_ABERTO))).toBe('R$ 75,90 · vence 20/10/2026 · em aberto')
    expect(semNbsp(descricaoDaLinha({ ...DAS_ABERTO, pago_em: '2026-10-18' }))).toBe('R$ 75,90 · vence 20/10/2026 · pago em 18/10/2026')
    expect(semNbsp(descricaoDaLinha({ tipo: 'nf', numero_nf: '123', valor: 2500 }))).toBe('NF nº 123 · R$ 2.500,00')
    expect(descricaoDaLinha({ tipo: 'nf', numero_nf: null, valor: null })).toBe('NF sem número')
  })
})

describe('BlocoLancamentoFuncionario', () => {
  it('vazio diz que não tem nada e oferece subir ou lançar à mão', () => {
    const onAbrir = vi.fn()
    render(<BlocoLancamentoFuncionario tipo="nf" linhas={[]} podeEditar onAbrir={onAbrir} onMudou={() => {}} onAbrirAnexo={() => {}} />)
    expect(screen.getByText('— nada ainda —')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ lançar à mão' }))
    expect(onAbrir).toHaveBeenCalledWith('nf', null)
  })

  it('DAS em aberto: mostra "em aberto", só comprovante e marcar pago (boleto já tem)', () => {
    const onAbrir = vi.fn()
    render(<BlocoLancamentoFuncionario tipo="das" linhas={[DAS_ABERTO]} podeEditar onAbrir={onAbrir} onMudou={() => {}} onAbrirAnexo={() => {}} />)
    expect(screen.getByText(/em aberto/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '📎 Subir boleto' })).toBeNull()
    expect(screen.getByRole('button', { name: '📎 Subir comprovante' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '✓ marcar pago à mão' }))
    expect(onAbrir).toHaveBeenCalledWith('das_comprovante', null)
    expect(screen.getByRole('button', { name: '📎 boleto' })).toBeInTheDocument()
  })

  it('viewer não vê botões de gravar', () => {
    render(<BlocoLancamentoFuncionario tipo="pagamento" linhas={[]} podeEditar={false} onAbrir={() => {}} onMudou={() => {}} onAbrirAnexo={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('editar manda PUT só com os campos do tipo e avisa a página', async () => {
    api.put.mockResolvedValue({ data: {} })
    const onMudou = vi.fn()
    render(<BlocoLancamentoFuncionario tipo="das" linhas={[DAS_ABERTO]} podeEditar onAbrir={() => {}} onMudou={onMudou} onAbrirAnexo={() => {}} />)
    fireEvent.click(screen.getByTitle('Editar'))
    fireEvent.change(screen.getByLabelText(/Pago em/), { target: { value: '2026-10-18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onMudou).toHaveBeenCalled())
    expect(api.put.mock.calls[0][0]).toBe('/api/funcionarios/f-1/lancamentos/l-2')
    expect(api.put.mock.calls[0][1]).toEqual({ competencia: '2026-09', valor: 75.9, vencimento: '2026-10-20', pago_em: '2026-10-18' })
  })

  it('cancelar a edição descarta o que foi digitado', () => {
    render(<BlocoLancamentoFuncionario tipo="das" linhas={[DAS_ABERTO]} podeEditar onAbrir={() => {}} onMudou={() => {}} onAbrirAnexo={() => {}} />)
    fireEvent.click(screen.getByTitle('Editar'))
    fireEvent.change(screen.getByLabelText(/Pago em/), { target: { value: '2026-10-18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByTitle('Editar'))
    expect(screen.getByLabelText(/Pago em/).value).toBe('')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('apagar pede confirmação e manda DELETE', async () => {
    api.delete.mockResolvedValue({})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onMudou = vi.fn()
    render(<BlocoLancamentoFuncionario tipo="das" linhas={[DAS_ABERTO]} podeEditar onAbrir={() => {}} onMudou={onMudou} onAbrirAnexo={() => {}} />)
    fireEvent.click(screen.getByTitle('Apagar'))
    await waitFor(() => expect(onMudou).toHaveBeenCalled())
    expect(api.delete).toHaveBeenCalledWith('/api/funcionarios/f-1/lancamentos/l-2')
  })
})
