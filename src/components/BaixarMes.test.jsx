import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import BaixarMes from './BaixarMes'

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../services/api'

let cliques
let revokesNoMomentoDoClique

beforeEach(() => {
  api.get.mockReset()
  global.URL.createObjectURL = vi.fn(() => 'blob:x')
  global.URL.revokeObjectURL = vi.fn()
  cliques = []
  revokesNoMomentoDoClique = []
  // O componente cria um <a> e chama .click() nele para disparar o download.
  // jsdom não implementa navegação por link, então grava quem foi clicado —
  // e, no instante exato do clique, se já estava no DOM e quantas vezes o
  // revoke já tinha rodado (para provar a ordem, sem depender de quanto
  // tempo waitFor deixa passar).
  HTMLAnchorElement.prototype.click = vi.fn(function () {
    revokesNoMomentoDoClique.push(global.URL.revokeObjectURL.mock.calls.length)
    cliques.push({ el: this, conectadoNoClique: this.isConnected })
  })
})

function blobDeErro(objeto) {
  return new Blob([JSON.stringify(objeto)], { type: 'application/json' })
}

describe('Baixar mês', () => {
  it('pede o zip do mês escolhido e dispara o download com o nome certo', async () => {
    api.get.mockResolvedValue({ data: new Blob(['zip']) })
    render(<BaixarMes />)
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-08' } })
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/pacote/compras/2026-08', { responseType: 'blob' },
    ))
    await waitFor(() => expect(cliques).toHaveLength(1))
    expect(cliques[0].el.download).toBe('compras-2026-08.zip')
    await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'))
  })

  it('anexa o link ao DOM antes de clicar e o remove logo depois (navegador antigo exige isso para o .click() disparar)', async () => {
    api.get.mockResolvedValue({ data: new Blob(['zip']) })
    render(<BaixarMes />)
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))

    await waitFor(() => expect(cliques).toHaveLength(1))
    // No momento do clique, o link precisa estar na árvore do documento —
    // gravado dentro do próprio .click(), não depois (waitFor deixa tempo
    // real passar e o link já teria sido removido).
    expect(cliques[0].conectadoNoClique).toBe(true)
    // E depois de usado, não deve sobrar pendurado na página.
    await waitFor(() => expect(document.body.contains(cliques[0].el)).toBe(false))
  })

  it('não revoga a URL do blob no mesmo tick do clique (revoke síncrono corrompe o download no Firefox/Safari antigos)', async () => {
    api.get.mockResolvedValue({ data: new Blob(['zip']) })
    render(<BaixarMes />)
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))

    await waitFor(() => expect(cliques).toHaveLength(1))
    // Contado no instante exato do .click(): o revoke ainda não podia ter
    // rodado (senão o download corromperia no Firefox/Safari antigos).
    expect(revokesNoMomentoDoClique[0]).toBe(0)

    await waitFor(() => expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'))
  })

  it('mês sem compra mostra o aviso do backend quando o erro já vem como JSON', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Nenhuma compra em 2026-08.' } } })
    render(<BaixarMes />)
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-08' } })
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))
    expect(await screen.findByText(/Nenhuma compra em 2026-08/)).toBeInTheDocument()
  })

  it('mostra a mensagem do backend mesmo quando o erro chega como Blob (responseType: blob)', async () => {
    // Com responseType: 'blob', o axios também transforma o corpo de uma
    // resposta de erro em Blob — é o caso real do 404/400 do backend.
    api.get.mockRejectedValue({
      response: { data: blobDeErro({ error: 'Nenhuma compra em 2026-07.' }) },
    })
    render(<BaixarMes />)
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-07' } })
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))
    expect(await screen.findByText('Nenhuma compra em 2026-07.')).toBeInTheDocument()
    // e não deve cair no aviso genérico
    expect(screen.queryByText(/Não consegui montar/)).not.toBeInTheDocument()
  })

  it('mês inválido também mostra a mensagem do backend (erro 400, corpo em Blob)', async () => {
    api.get.mockRejectedValue({
      response: { data: blobDeErro({ error: 'Mês inválido.' }) },
    })
    render(<BaixarMes />)
    fireEvent.change(screen.getByLabelText(/Mês/), { target: { value: '2026-13' } })
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))
    expect(await screen.findByText('Mês inválido.')).toBeInTheDocument()
  })

  it('quando o Blob de erro não é um JSON válido, mostra o aviso genérico em vez de quebrar', async () => {
    api.get.mockRejectedValue({
      response: { data: new Blob(['não é json'], { type: 'text/plain' }) },
    })
    render(<BaixarMes />)
    fireEvent.click(screen.getByRole('button', { name: /Baixar mês/ }))
    expect(await screen.findByText('Não consegui montar o arquivo. Tente de novo.')).toBeInTheDocument()
  })

  it('desabilita o botão e mostra "Montando…" enquanto a chamada está em voo, e não deixa clicar de novo', async () => {
    let resolver
    api.get.mockReturnValue(new Promise(resolve => { resolver = resolve }))
    render(<BaixarMes />)
    const botao = screen.getByRole('button', { name: /Baixar mês/ })

    fireEvent.click(botao)
    fireEvent.click(botao) // clique duplo enquanto ainda está em voo

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Montando…'))
    expect(screen.getByRole('button')).toBeDisabled()
    expect(api.get).toHaveBeenCalledTimes(1) // o segundo clique não disparou outra chamada

    resolver({ data: new Blob(['zip']) })
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Baixar mês'))
    expect(screen.getByRole('button')).not.toBeDisabled()
  })
})
