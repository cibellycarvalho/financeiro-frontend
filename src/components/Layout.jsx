import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { signOut } from '../services/auth'
import { useAuth } from '../contexts/AuthContext'
import { useTelaEstreita } from '../hooks/useTelaEstreita'
import ThemeToggle from './ThemeToggle'
import Logo from './Logo'

const nav = [
  { path: '/', label: 'Visão da Semana' },
  { path: '/contas', label: 'Contas a Pagar' },
  { path: '/repasses', label: 'Repasses ML' },
  { path: '/fornecedores', label: 'Fornecedores' },
  { path: '/fechamento', label: 'Fechamento' },
  { path: '/lucro-real', label: 'Lucro Real' },
]

/**
 * O menu era um `<aside>` de 220px sempre presente.
 *
 * No computador isso está certo e continua igual. No celular ele comia 59% da
 * tela e sobravam 155px para o conteúdo — os números, que é justamente o que
 * se vem consultar aqui, ficavam cortados. Medido em produção em 10/09/2026.
 *
 * Abaixo de 768px ele vira gaveta: fechado por padrão, aberto por um botão, e
 * fechando sozinho assim que a pessoa escolhe para onde ir.
 */
export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { finRole } = useAuth()
  const estreita = useTelaEstreita()
  const [aberto, setAberto] = useState(false)

  // Escolheu para onde ir = acabou de usar a gaveta. Sem isto ela fica por
  // cima da tela recém-escolhida e a pessoa fecha na mão toda vez.
  useEffect(() => { setAberto(false) }, [pathname])

  // Se a janela cresceu (girou o celular, virou tablet deitado), o menu volta
  // a ser fixo — e uma gaveta "aberta" pendurada não faz mais sentido.
  useEffect(() => { if (!estreita) setAberto(false) }, [estreita])

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  const itemDoMenu = (path, label, extra) => (
    <Link
      key={path}
      to={path}
      style={{
        padding: '10px 20px',
        minHeight: estreita ? 44 : undefined,
        display: estreita ? 'flex' : undefined,
        alignItems: estreita ? 'center' : undefined,
        color: pathname === path ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
        background: pathname === path ? 'var(--color-accent-solid)' : 'transparent',
        textDecoration: 'none',
        fontSize: 14,
        ...extra,
      }}
    >
      {label}
    </Link>
  )

  const menu = (
    <aside
      style={{
        width: 220,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: '24px 0',
        display: 'flex',
        flexDirection: 'column',
        ...(estreita
          ? { position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50, boxShadow: '0 0 24px rgba(0,0,0,0.35)' }
          : null),
      }}
    >
      <div style={{ padding: '0 20px 24px' }}>
        <Logo titleSize={14} />
      </div>
      {nav.map(({ path, label }) => itemDoMenu(path, label))}
      {finRole === 'fin_admin' && itemDoMenu('/admin', 'Admin', { marginTop: 'auto' })}
      <div style={{ margin: '16px 20px 0', display: 'flex', gap: 8 }}>
        <ThemeToggle />
        <button
          onClick={signOut}
          style={{
            flex: 1,
            padding: '8px',
            minHeight: estreita ? 44 : undefined,
            background: 'var(--color-border)',
            color: 'var(--color-text)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Sair
        </button>
      </div>
    </aside>
  )

  const conteudo = (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--color-bg)',
        padding: estreita ? 16 : 32,
        overflowY: 'auto',
      }}
    >
      {children}
    </main>
  )

  if (!estreita) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {menu}
        {conteudo}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 12px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir o menu"
          style={{
            minWidth: 44, minHeight: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'var(--color-text)', fontSize: 20, cursor: 'pointer',
          }}
        >
          ☰
        </button>
        <Logo titleSize={13} />
      </header>

      {aberto && (
        <div
          data-testid="fundo-da-gaveta"
          onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}
      {aberto && menu}

      <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>{conteudo}</div>
    </div>
  )
}
