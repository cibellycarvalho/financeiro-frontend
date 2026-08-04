import { Link, useLocation } from 'react-router-dom'
import { signOut } from '../services/auth'
import { useAuth } from '../contexts/AuthContext'

const nav = [
  { path: '/', label: 'Visão da Semana' },
  { path: '/contas', label: 'Contas a Pagar' },
  { path: '/repasses', label: 'Repasses ML' },
  { path: '/fornecedores', label: 'Fornecedores' },
]

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { finRole } = useAuth()

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'system-ui,sans-serif' }}>
      <aside style={{ width:220, background:'#1a1a1a', padding:'24px 0', display:'flex', flexDirection:'column' }}>
        <div style={{ color:'white', fontWeight:700, fontSize:16, padding:'0 20px 24px' }}>
          Cravelli Financeiro
        </div>
        {nav.map(({ path, label }) => (
          <Link key={path} to={path} style={{
            padding:'10px 20px', color: pathname === path ? '#fff' : '#aaa',
            background: pathname === path ? '#333' : 'transparent',
            textDecoration:'none', fontSize:14
          }}>
            {label}
          </Link>
        ))}
        {finRole === 'fin_admin' && (
          <Link to="/admin" style={{ padding:'10px 20px', color:'#aaa', textDecoration:'none', fontSize:14, marginTop:'auto' }}>
            Admin
          </Link>
        )}
        <button onClick={signOut} style={{
          margin:'16px 20px 0', padding:'8px', background:'#333',
          color:'#aaa', border:'none', borderRadius:8, cursor:'pointer', fontSize:13
        }}>
          Sair
        </button>
      </aside>
      <main style={{ flex:1, background:'#f8f8f8', padding:32, overflowY:'auto' }}>
        {children}
      </main>
    </div>
  )
}
