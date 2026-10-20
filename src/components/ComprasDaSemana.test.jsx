import { describe, it, expect } from 'vitest'
import { montarCards } from './ComprasDaSemana'

describe('montarCards (regra de 20/10/2026)', () => {
  it('disponível = caiu semana passada + reserva − pago e a pagar desta semana', () => {
    const c = montarCards({ caiu: 149938.49, retirada: 15776.38, reposicao: 0, pendentes: 0, concluidos: 13087.5 })
    expect(c.disponivel).toBeCloseTo(152627.37, 2)
    expect(c.pagamentosSemana).toBeCloseTo(13087.5, 2)
  })

  it('sobra no caixa desconta a reposição, e mostra quanto falta quando não cobre', () => {
    const c = montarCards({ caiu: 1000, retirada: 0, reposicao: 1500, pendentes: 200, concluidos: 100 })
    expect(c.disponivel).toBe(700)
    expect(c.sobraNoCaixa).toBe(-800)
    expect(c.reposicaoFalta).toBe(800)
  })

  it('reposição coberta não deixa falta', () => {
    expect(montarCards({ caiu: 1000, retirada: 0, reposicao: 300, pendentes: 0, concluidos: 0 }).reposicaoFalta).toBe(0)
  })
})
