import { useState } from 'react'
import { signIn } from '../services/auth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await signIn(email, password)
      navigate('/')
    } catch {
      setError('E-mail ou senha incorretos.')
    }
  }

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f5f5f5' }}>
      <form onSubmit={handleSubmit} style={{ background:'white', padding:40, borderRadius:12, width:360, boxShadow:'0 2px 16px rgba(0,0,0,0.08)' }}>
        <h2 style={{ marginBottom:24 }}>Painel Financeiro Cravelli</h2>
        {error && <div style={{ color:'#c00', marginBottom:16 }}>{error}</div>}
        <label>E-mail<br />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ width:'100%', padding:8, marginTop:4, marginBottom:16, boxSizing:'border-box' }} required />
        </label>
        <label>Senha<br />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ width:'100%', padding:8, marginTop:4, marginBottom:24, boxSizing:'border-box' }} required />
        </label>
        <button type="submit" style={{ width:'100%', padding:10, background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
          Entrar
        </button>
      </form>
    </div>
  )
}
