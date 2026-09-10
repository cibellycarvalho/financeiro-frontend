import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Layout from './Layout'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ finRole: 'fin_admin' }) }))
vi.mock('../services/auth', () => ({ signOut: vi.fn() }))

/**
 * No celular, o menu lateral ficava SEMPRE aberto e comia a tela.
 *
 * Medido em 10/09/2026, em produção, numa tela de 375px: o `<aside>` ocupava
 * 220px — 59% da largura — e sobravam 155px para o conteúdo. Até o `<h1>`
 * "Fechamento" estourava. Não havia botão de menu nenhum.
 *
 * Escondendo só o menu, 5 das 7 telas passaram de dezenas de elementos
 * cortados para ZERO. É uma causa raiz só.
 */

const PONTO_DE_CORTE = 768

function telaDe(largura) {
  window.matchMedia = (consulta) => {
    const m = consulta.match(/max-width:\s*(\d+)px/)
    return {
      matches: m ? largura <= Number(m[1]) : false,
      media: consulta,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }
  }
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout><p>conteúdo da página</p></Layout>
    </MemoryRouter>,
  )
}

const botaoDoMenu = () => screen.queryByRole('button', { name: /abrir o menu/i })
const linkFechamento = () => screen.queryByRole('link', { name: 'Fechamento' })

beforeEach(() => telaDe(1440))

describe('no computador, nada muda', () => {
  it('o menu fica visível sem precisar abrir nada', () => {
    telaDe(1440)
    montar()
    expect(linkFechamento()).toBeInTheDocument()
  })

  it('não aparece botão de menu — ele só existe onde falta espaço', () => {
    telaDe(1440)
    montar()
    expect(botaoDoMenu()).not.toBeInTheDocument()
  })

  it('logo acima do ponto de corte ainda é computador', () => {
    telaDe(PONTO_DE_CORTE + 1)
    montar()
    expect(linkFechamento()).toBeInTheDocument()
    expect(botaoDoMenu()).not.toBeInTheDocument()
  })
})

describe('no celular, o menu vira gaveta', () => {
  it('começa FECHADO — é a tela inteira para o conteúdo', () => {
    telaDe(375)
    montar()
    expect(linkFechamento()).not.toBeInTheDocument()
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument()
  })

  it('exatamente no ponto de corte já é celular', () => {
    telaDe(PONTO_DE_CORTE)
    montar()
    expect(botaoDoMenu()).toBeInTheDocument()
  })

  it('o botão abre a gaveta', async () => {
    telaDe(375)
    montar()
    await userEvent.click(botaoDoMenu())
    expect(linkFechamento()).toBeInTheDocument()
  })

  // Sem isto a gaveta fica aberta por cima da tela que a pessoa acabou de
  // escolher, e ela tem que fechar na mão toda vez.
  it('escolher uma tela fecha a gaveta', async () => {
    telaDe(375)
    montar()
    await userEvent.click(botaoDoMenu())
    await userEvent.click(linkFechamento())
    expect(linkFechamento()).not.toBeInTheDocument()
  })

  it('tocar no fundo escurecido fecha', async () => {
    telaDe(375)
    montar()
    await userEvent.click(botaoDoMenu())
    await userEvent.click(screen.getByTestId('fundo-da-gaveta'))
    expect(linkFechamento()).not.toBeInTheDocument()
  })

  it('Esc fecha', async () => {
    telaDe(375)
    montar()
    await userEvent.click(botaoDoMenu())
    await userEvent.keyboard('{Escape}')
    expect(linkFechamento()).not.toBeInTheDocument()
  })

  it('o botão de menu tem alvo de 44px', () => {
    telaDe(375)
    montar()
    const b = botaoDoMenu()
    expect(b.style.minWidth).toBe('44px')
    expect(b.style.minHeight).toBe('44px')
  })

  it('os itens do menu têm alvo de 44px', async () => {
    telaDe(375)
    montar()
    await userEvent.click(botaoDoMenu())
    expect(linkFechamento().style.minHeight).toBe('44px')
  })

  // O conteúdo tinha 32px de recuo de cada lado: 64px dos 375 iam embora só
  // em margem, e é onde os números aparecem.
  it('o recuo do conteúdo encolhe no celular', () => {
    telaDe(375)
    const { container } = montar()
    const main = container.querySelector('main')
    expect(main.style.padding).toBe('16px')
  })

  it('no computador o recuo continua o de sempre', () => {
    telaDe(1440)
    const { container } = montar()
    expect(container.querySelector('main').style.padding).toBe('32px')
  })
})
