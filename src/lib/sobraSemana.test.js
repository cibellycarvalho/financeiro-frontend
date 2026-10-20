import { describe, it, expect } from 'vitest'
import { sobraDaSemana } from './sobraSemana'

const DE = '2026-10-12', ATE = '2026-10-18'
const base = { de: DE, ate: ATE, contas: [], repasses: [], agenda: {}, pagamentos: [], funcionarios: [], devolucoes: [], ajustes: {} }

describe('sobraDaSemana', () => {
  it('usa a agenda da semana quando existe, ignorando dias fora dela', () => {
    const r = sobraDaSemana({ ...base, agenda: { '2026-10-12': 100, '2026-10-13': 50.5, '2026-10-20': 999 },
      repasses: [{ tipo: 'repasse', valor: 1, data_referencia: '2026-10-14' }] })
    expect(r.entra).toBe(150.5)
  })

  it('sem agenda usa os repasses gravados (só tipo repasse, na semana)', () => {
    const r = sobraDaSemana({ ...base, repasses: [
      { tipo: 'repasse', valor: 200, data_referencia: '2026-10-14' },
      { tipo: 'tarifa', valor: 30, data_referencia: '2026-10-14' },
      { tipo: 'repasse', valor: 77, data_referencia: '2026-10-25' },
    ] })
    expect(r.entra).toBe(200)
  })

  it('subtrai boletos, fornecedor, funcionários e soma devolução em dinheiro', () => {
    const r = sobraDaSemana({ ...base,
      agenda: { '2026-10-13': 1000 },
      contas: [
        { valor: 100, vencimento: '2026-10-15', status: 'pendente', categoria: 'SISTEMA' },
        { valor: 50, vencimento: '2026-10-30', status: 'pago', data_pagamento: '2026-10-16', categoria: 'OUTRO' },
        { valor: 70, vencimento: '2026-10-16', status: 'pago', data_pagamento: '2026-10-16', categoria: 'FORNECEDOR' },
        { valor: 999, vencimento: '2026-10-01', status: 'pendente', categoria: 'OUTRO' },
      ],
      pagamentos: [{ id: 'a', valor: 200, data_pagamento: '2026-10-14' }, { id: 'b', valor: 40, data_pagamento: '2026-10-14' }],
      ajustes: { b: false },
      funcionarios: [{ id: 'f', valor: 60, data_pagamento: '2026-10-17' }],
      devolucoes: [{ valor: 25, data_devolucao: '2026-10-15' }, { valor: 5, data_devolucao: '2026-11-01' }],
    })
    // 1000 + 25 − (100 + 50) − (200 + 70) − 60
    expect(r).toMatchObject({ boletos: 150, fornecedor: 270, funcionarios: 60, reembolsos: 25, sobra: 545 })
  })

  it('lê datas no formato HTTP que o backend devolve', () => {
    const r = sobraDaSemana({ ...base,
      agenda: { '2026-10-13': 1000 },
      contas: [{ valor: '3202.57', vencimento: 'Sat, 10 Oct 2026 00:00:00 GMT', status: 'pago',
        data_pagamento: 'Wed, 14 Oct 2026 00:00:00 GMT', categoria: 'OUTRO' }],
      pagamentos: [{ id: 'a', valor: '100', data_pagamento: 'Thu, 15 Oct 2026 00:00:00 GMT' }],
    })
    expect(r).toMatchObject({ boletos: 3202.57, fornecedor: 100, sobra: 1000 - 3202.57 - 100 })
  })

  it('semana vazia dá zero', () => {
    expect(sobraDaSemana(base).sobra).toBe(0)
  })
})
