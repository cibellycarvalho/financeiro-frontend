import { describe, it, expect } from 'vitest'
import { mesAtual, mesDe, rotuloMes, hojeISO } from './meses'

describe('meses', () => {
  it('mesAtual usa a data local', () => {
    expect(mesAtual(new Date(2026, 8, 17))).toBe('2026-09')
    expect(mesAtual(new Date(2026, 0, 1))).toBe('2026-01')
  })
  it('hojeISO usa a data local, não UTC (virada perto da meia-noite em BRT)', () => {
    expect(hojeISO(new Date(2026, 8, 17, 23, 30))).toBe('2026-09-17')
    expect(hojeISO(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
  })
  it('mesDe aceita AAAA-MM, AAAA-MM-DD e a data RFC que o backend manda', () => {
    expect(mesDe('2026-09')).toBe('2026-09')
    expect(mesDe('2026-09-01')).toBe('2026-09')
    expect(mesDe('Tue, 01 Sep 2026 00:00:00 GMT')).toBe('2026-09')
    expect(mesDe(null)).toBeNull()
    expect(mesDe('não é data')).toBeNull()
  })
  it('rotuloMes escreve o mês por extenso', () => {
    expect(rotuloMes('2026-09')).toBe('Setembro 2026')
    expect(rotuloMes('')).toBe('')
  })
})
