import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../services/crmApi', () => ({ default: { get: vi.fn(), post: vi.fn() }, crmConfigurado: () => true }))
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


describe('marcas de compra (Comprado / Adiar)', () => {
  beforeEach(() => { crmApi.get.mockReset(); crmApi.post.mockReset() })

  const dados = (decisao = null) => ({ lead_time_dias: 10, sem_custo: [], semanas: [{ semana: '2026-10-19', total: 500, skus: [
    { sku: 'FV0073', loja: 'YUSO', quantidade_repor: 359, valor: 500, ruptura_em: '2026-11-03', pagar_ate: '2026-10-24', atrasado: false, decisao },
  ] }] })

  async function abrir() {
    render(<CaixaParaRepor sobra={0} semanaAtual="2026-10-26" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Semana 19\/10/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Semana 19\/10/ }))
  }

  it('Comprado pergunta a quantidade (sugerida já preenchida) e grava na loja do produto', async () => {
    crmApi.get.mockResolvedValue({ data: dados() })
    crmApi.post.mockResolvedValue({ data: {} })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Comprado' }))
    const caixa = screen.getByLabelText('Quantidade comprada FV0073')
    expect(caixa.value).toBe('359')
    fireEvent.change(caixa, { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(crmApi.post).toHaveBeenCalled())
    expect(crmApi.post).toHaveBeenCalledWith('/api/reposicao/decisoes?conta_ml=YUSO',
      { sku: 'FV0073', sugerido: 359, status: 'comprado', quantidade: 300 })
    await waitFor(() => expect(crmApi.get).toHaveBeenCalledTimes(2))   // recalcula a lista
  })

  it('Adiar grava o motivo escolhido', async () => {
    crmApi.get.mockResolvedValue({ data: dados() })
    crmApi.post.mockResolvedValue({ data: {} })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
    fireEvent.change(screen.getByLabelText('Motivo FV0073'), { target: { value: 'sem verba' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await waitFor(() => expect(crmApi.post).toHaveBeenCalled())
    expect(crmApi.post.mock.calls[0][1]).toEqual({ sku: 'FV0073', sugerido: 359, status: 'adiado', motivo: 'sem verba' })
  })

  it('produto com decisão aparece riscado com o status e permite desfazer', async () => {
    crmApi.get.mockResolvedValue({ data: dados({ status: 'comprado', quantidade: 300, motivo: null }) })
    crmApi.post.mockResolvedValue({ data: {} })
    await abrir()
    expect(screen.getByText('Comprado 300 un')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Adiar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(crmApi.post).toHaveBeenCalled())
    expect(crmApi.post.mock.calls[0][1]).toMatchObject({ sku: 'FV0073', status: 'limpar' })
  })

  it('erro do servidor aparece na linha, sem perder a lista', async () => {
    crmApi.get.mockResolvedValue({ data: dados() })
    crmApi.post.mockRejectedValue({ response: { data: { erro: 'Informe a quantidade comprada.' } } })
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Adiar' }))
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a quantidade comprada.')
    expect(screen.getByText(/FV0073/)).toBeTruthy()
  })
})
