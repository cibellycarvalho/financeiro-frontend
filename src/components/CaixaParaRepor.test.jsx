import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('../services/crmApi', () => ({ default: { get: vi.fn() }, crmConfigurado: () => true }))
import crmApi from '../services/crmApi'
import CaixaParaRepor, { resumoSemana } from './CaixaParaRepor'

const DADOS = {
  lead_time_dias: 10, sem_custo: [{ sku: 'ZZ' }],
  semanas: [{ semana: '2026-10-19', total: 750, skus: [
    { sku: 'FV0073', quantidade_repor: 50, valor: 750, ruptura_em: '2026-11-03', pagar_ate: '2026-10-24', atrasado: false },
  ] }],
}

describe('CaixaParaRepor', () => {
  it('mostra o valor da semana, o SKU e quanto falta da sobra', async () => {
    crmApi.get.mockResolvedValue({ data: DADOS })
    render(<CaixaParaRepor sobra={500} semanaAtual="2026-10-19" />)
    await waitFor(() => expect(screen.getByText(/ter R\$\s*750,00 em caixa/)).toBeTruthy())
    expect(screen.getByText(/FV0073/)).toBeTruthy()
    expect(screen.getByText(/faltam R\$\s*250,00/)).toBeTruthy()
    expect(screen.getByText(/Sem custo cadastrado.*ZZ/)).toBeTruthy()
  })

  it('erro da API vira aviso, não quebra a tela', async () => {
    crmApi.get.mockRejectedValue(new Error('x'))
    render(<CaixaParaRepor sobra={0} semanaAtual="2026-10-19" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })

  it('resumoSemana', () => {
    expect(resumoSemana({ total: 100 }, 150)).toEqual({ falta: 0, cobre: true })
    expect(resumoSemana({ total: 100 }, 40)).toEqual({ falta: 60, cobre: false })
    expect(resumoSemana({ total: 100 }, null)).toEqual({ falta: 0, cobre: false })
  })
})
