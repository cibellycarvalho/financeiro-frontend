import { describe, it, expect, vi } from 'vitest'
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../services/crmApi', () => ({ default: { get: vi.fn() }, crmConfigurado: () => true }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => children }))
import { montarAPagar, situacaoPessoa, quando } from './Equipe'
import { resumoVendas } from './Hoje'

const hoje = '2026-10-27'

describe('montarAPagar', () => {
  it('junta conta, DAS e fornecedor; tira paga e a de longe', () => {
    const l = montarAPagar({
      hoje,
      contas: [
        { id: 1, descricao: 'Aluguel', valor: 3200, vencimento: '2026-10-28', status: 'pendente' },
        { id: 2, descricao: 'Luz', valor: 300, vencimento: '2026-10-20', status: 'pendente' },
        { id: 3, descricao: 'Paga', valor: 10, vencimento: '2026-10-27', status: 'pago' },
        { id: 4, descricao: 'Longe', valor: 10, vencimento: '2026-11-20', status: 'pendente' },
      ],
      funcionarios: [{ id: 'b', nome: 'Bianca', mes_atual: { das_em_aberto: true, das_vencimento: '2026-10-27', das_valor: 86.05 } }],
      fornecedores: [{ id: 'f', nome: 'FL', saldo_aberto: 1000 }, { id: 'g', nome: 'Zerado', saldo_aberto: 0 }],
    })
    expect(l.map(x => x.nome)).toEqual(['Luz', 'DAS · Bianca', 'Aluguel', 'FL'])
    expect(l.map(x => x.situacao)).toEqual(['vencida', 'hoje', 'aberto', 'aberto'])
  })
})

describe('situacaoPessoa', () => {
  it('parcial, pago e a pagar', () => {
    expect(situacaoPessoa({ valor_combinado: 2300, mes_atual: { total_pago: 1150 } })).toMatchObject({ falta: 1150, pct: 50, tipo: 'parcial' })
    expect(situacaoPessoa({ valor_combinado: 2300, mes_atual: { total_pago: 2300 } }).tipo).toBe('pago')
    expect(situacaoPessoa({ valor_combinado: 2300, mes_atual: { total_pago: 0 } }).status).toBe('A pagar')
    expect(situacaoPessoa({ valor_combinado: null }).falta).toBeNull()
  })
})

describe('quando', () => {
  it('hoje, dia da semana e sem data', () => {
    expect(quando('2026-10-27', hoje)).toBe('Hoje')
    expect(quando('2026-10-28', hoje)).toBe('Qua 28')
    expect(quando(null, hoje)).toBe('Sem data')
  })
})

describe('resumoVendas', () => {
  it('lucro depois de ads, margem e anúncios no prejuízo', () => {
    const r = resumoVendas({
      kpis: { faturamento: 1000, n_vendas: 10, ticket_medio: 100, lucro_pos_ads: 250, valor_ads: 40, tacos: 4 },
      top_produtos: [
        { ml_item_id: 'a', titulo: 'A', unidades: 5, total_faturado: 500, lucro_pos_ads: 100 },
        { ml_item_id: 'b', titulo: 'B', unidades: 1, total_faturado: 100, lucro_pos_ads: -5 },
      ],
    })
    expect(r.margem).toBe(25)
    expect(r.prejuizo).toBe(1)
    expect(r.top[0].margem).toBe(20)
    expect(resumoVendas(null)).toBeNull()
  })
})

import { textoStatus } from './Conciliacao'
import { linhaAnuncio } from './Lucro'

describe('textoStatus', () => {
  it('fala o que é cada movimento', () => {
    expect(textoStatus({ status: 'sugerido', casado_texto: 'Conta: DAS' })).toBe('Parece: Conta: DAS')
    expect(textoStatus({ status: 'novo', valor: 320 })).toBe('Novo: entrada sem origem')
    expect(textoStatus({ status: 'casado', casado_texto: 'Repasse do Mercado Pago' })).toBe('Casado: Repasse do Mercado Pago')
  })
})

describe('linhaAnuncio', () => {
  it('divide por unidade e classifica', () => {
    const l = linhaAnuncio({ ml_item_id: 'x', unidades: 4, total_faturado: 400, comissao: 40, frete: 20, lucro_pos_ads: -8 })
    expect(l).toMatchObject({ comissao: 10, frete: 5, lucro: -2, grupo: 'pr' })
    expect(linhaAnuncio({ unidades: 1, total_faturado: 100, lucro_pos_ads: 5 }).grupo).toBe('at')
    expect(linhaAnuncio({ unidades: 1, total_faturado: 100, lucro_pos_ads: 30 }).grupo).toBe('ok')
  })
})
