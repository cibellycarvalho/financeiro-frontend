import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('../services/crmApi', () => ({ default: { get: vi.fn() }, crmConfigurado: () => true }))
import crmApi from '../services/crmApi'
import CaixaParaRepor, { resumoSemana, periodoDaSemana } from './CaixaParaRepor'

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
    // fechada: só o resumo da semana; os produtos aparecem no clique
    expect(screen.queryByText(/FV0073/)).toBeNull()
    expect(screen.getByText(/1 produto/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Semana 19\/10 a 25\/10/ }))
    // sem conta_ml o CRM responde 400 (visto em produção 20/10/2026)
    expect(crmApi.get.mock.calls[0][0]).toContain('conta_ml=YUSO,M12')
    expect(screen.getByText(/FV0073/)).toBeTruthy()
    expect(screen.getByText(/faltam R\$\s*250,00/)).toBeTruthy()
    expect(screen.getByText(/Sem custo cadastrado.*ZZ/)).toBeTruthy()
  })

  it('erro da API vira aviso, não quebra a tela', async () => {
    crmApi.get.mockRejectedValue(new Error('x'))
    render(<CaixaParaRepor sobra={0} semanaAtual="2026-10-19" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })

  it('semana com atrasado mostra quantos, e abrir mostra o que está a caminho', async () => {
    const dados = { lead_time_dias: 10, sem_custo: [], semanas: [{ semana: '2026-10-19', total: 100, skus: [
      { sku: 'A', quantidade_repor: 5, valor: 100, ruptura_em: '2026-10-20', pagar_ate: '2026-10-10', atrasado: true, em_transito: 30, comprado_nao_enviado: 120 },
    ] }] }
    crmApi.get.mockResolvedValue({ data: dados })
    render(<CaixaParaRepor sobra={0} semanaAtual="2026-10-26" />)
    await waitFor(() => expect(screen.getByText(/1 atrasado/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/ATRASADO, comprar já/)).toBeTruthy()
    expect(screen.getByText(/30 un a caminho/)).toBeTruthy()
    expect(screen.getByText(/120 un já compradas, falta enviar/)).toBeTruthy()
  })

  it('periodoDaSemana vai de segunda a domingo', () => {
    expect(periodoDaSemana('2026-10-19')).toBe('19/10 a 25/10')
    expect(periodoDaSemana('2026-10-26')).toBe('26/10 a 01/11')
  })

  it('resumoSemana', () => {
    expect(resumoSemana({ total: 100 }, 150)).toEqual({ falta: 0, cobre: true })
    expect(resumoSemana({ total: 100 }, 40)).toEqual({ falta: 60, cobre: false })
    expect(resumoSemana({ total: 100 }, null)).toEqual({ falta: 0, cobre: false })
  })
})
