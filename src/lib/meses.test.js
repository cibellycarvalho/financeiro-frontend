import { describe, it, expect } from 'vitest'
import { mesAtual, mesDe, rotuloMes } from './meses'

describe('meses', () => {
  it('mesAtual usa a data local', () => {
    expect(mesAtual(new Date(2026, 8, 17))).toBe('2026-09')
    expect(mesAtual(new Date(2026, 0, 1))).toBe('2026-01')
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
