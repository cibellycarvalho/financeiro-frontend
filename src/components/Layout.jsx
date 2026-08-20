import { Link, useLocation } from 'react-router-dom'
import { signOut } from '../services/auth'
import { useAuth } from '../contexts/AuthContext'
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

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { finRole } = useAuth()

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{
        width:220, background:'var(--color-surface)', borderRight:'1px solid var(--color-border)',
        padding:'24px 0', display:'flex', flexDirection:'column'
      }}>
        <div style={{ padding:'0 20px 24px' }}>
          <Logo titleSize={14} />
        </div>
        {nav.map(({ path, label }) => (
          <Link key={path} to={path} style={{
            padding:'10px 20px', color: pathname === path ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
            background: pathname === path ? 'var(--color-accent-solid)' : 'transparent',
            textDecoration:'none', fontSize:14
          }}>
            {label}
          </Link>
        ))}
        {finRole === 'fin_admin' && (
          <Link to="/admin" style={{ padding:'10px 20px', color:'var(--color-text-muted)', textDecoration:'none', fontSize:14, marginTop:'auto' }}>
            Admin
          </Link>
        )}
        <div style={{ margin:'16px 20px 0', display:'flex', gap:8 }}>
          <ThemeToggle />
          <button onClick={signOut} style={{
            flex:1, padding:'8px', background:'var(--color-border)',
            color:'var(--color-text)', border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:13
          }}>
            Sair
          </button>
        </div>
      </aside>
      <main style={{ flex:1, background:'var(--color-bg)', padding:32, overflowY:'auto' }}>
        {children}
      </main>
    </div>
  )
}
