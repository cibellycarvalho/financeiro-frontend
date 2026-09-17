import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { validarArquivo, mensagemDe, Faixa, BotaoSubirArquivo, PreviewArquivo } from './comum'

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

describe('comum do upload', () => {
  it('validarArquivo recusa tipo e tamanho errados', () => {
    expect(validarArquivo(null)).toBe('Escolha um arquivo.')
    expect(validarArquivo(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('Só PDF, JPG ou PNG.')
    const grande = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: 11 * 1024 * 1024 })
    expect(validarArquivo(grande)).toBe('Arquivo maior que 10 MB.')
    expect(validarArquivo(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBeNull()
  })
  it('mensagemDe prefere o erro do servidor', () => {
    expect(mensagemDe({ response: { data: { error: 'servidor' } } }, 'padrão')).toBe('servidor')
    expect(mensagemDe(new Error('x'), 'padrão')).toBe('padrão')
  })
  it('Faixa mostra o texto', () => {
    render(<Faixa tipo="erro">deu ruim</Faixa>)
    expect(screen.getByText('deu ruim')).toBeInTheDocument()
  })
  it('BotaoSubirArquivo entrega o arquivo escolhido e muda o rótulo enquanto lê', () => {
    const onArquivo = vi.fn()
    const { container, rerender } = render(<BotaoSubirArquivo rotulo="📎 Subir NF" rotuloLendo="Lendo…" onArquivo={onArquivo} />)
    const arquivo = new File(['x'], 'nf.pdf', { type: 'application/pdf' })
    fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [arquivo] } })
    expect(onArquivo).toHaveBeenCalledWith(arquivo)
    rerender(<BotaoSubirArquivo rotulo="📎 Subir NF" rotuloLendo="Lendo…" lendo onArquivo={onArquivo} />)
    expect(screen.getByRole('button', { name: 'Lendo…' })).toBeDisabled()
  })
  it('PreviewArquivo mostra PDF como object e imagem como img', () => {
    const { container, rerender } = render(<PreviewArquivo url="blob:a" tipo="application/pdf" />)
    expect(container.querySelector('object[type="application/pdf"]')).not.toBeNull()
    rerender(<PreviewArquivo url="blob:b" tipo="image/png" alt="foto" />)
    expect(screen.getByAltText('foto')).toBeInTheDocument()
  })
})
