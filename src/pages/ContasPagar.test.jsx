/**
 * O Flask manda data como "Mon, 14 Sep 2026 00:00:00 GMT". A lista montava
 * `d + 'T00:00:00'` e mostrava "Invalid Date" — ficou escondido enquanto o
 * filtro "Esta semana" escondia os boletos que já tinham vencido (17/09/2026).
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ContasPagar from './ContasPagar'

vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/Layout', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))

import api from '../services/api'

const conta = vencimento => ({
  id: 'c1', descricao: 'Meli +', categoria: 'OUTRO', valor: '98.90', vencimento,
  marca: 'YUSO', status: 'pago', data_pagamento: null, observacao: null,
})

beforeEach(() => api.get.mockReset())

describe('Contas a Pagar — datas', () => {
  it('mostra a data no formato que o backend manda de verdade', async () => {
    api.get.mockResolvedValue({ data: [conta('Mon, 14 Sep 2026 00:00:00 GMT')] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Meli +')).toBeInTheDocument())
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
    expect(screen.getByText('14/09/2026')).toBeInTheDocument()
  })

  it('também lê data já no formato ano-mês-dia, sem voltar um dia', async () => {
    api.get.mockResolvedValue({ data: [conta('2026-09-14')] })
    render(<MemoryRouter><ContasPagar /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('14/09/2026')).toBeInTheDocument())
  })
})
