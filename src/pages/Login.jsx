import { useState } from 'react'
import { signIn, supabase } from '../services/auth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
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

  async function handleReset(e) {
    e.preventDefault()
    setResetLoading(true)
    setResetMsg('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (err) {
      setResetMsg('Erro ao enviar email. Tente novamente.')
    } else {
      setResetMsg('Email enviado! Verifique sua caixa de entrada.')
    }
    setResetLoading(false)
  }

  const containerStyle = { display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f5f5f5' }
  const cardStyle = { background:'white', padding:40, borderRadius:12, width:360, boxShadow:'0 2px 16px rgba(0,0,0,0.08)' }

  if (resetMode) return (
    <div style={containerStyle}>
      <form onSubmit={handleReset} style={cardStyle}>
        <h2 style={{ marginBottom:8 }}>Redefinir senha</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:20 }}>Digite seu e-mail e enviaremos um link.</p>
        {resetMsg && <div style={{ color: resetMsg.startsWith('Erro') ? '#c00' : '#080', marginBottom:16, fontSize:14 }}>{resetMsg}</div>}
        <label>E-mail<br />
          <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
            style={{ width:'100%', padding:8, marginTop:4, marginBottom:20, boxSizing:'border-box' }} required />
        </label>
        <button type="submit" disabled={resetLoading}
          style={{ width:'100%', padding:10, background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer', marginBottom:12 }}>
          {resetLoading ? 'Enviando...' : 'Enviar link'}
        </button>
        <button type="button" onClick={() => setResetMode(false)}
          style={{ width:'100%', padding:10, background:'transparent', color:'#666', border:'1px solid #ddd', borderRadius:8, cursor:'pointer' }}>
          Voltar ao login
        </button>
      </form>
    </div>
  )

  return (
    <div style={containerStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
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
        <button type="submit" style={{ width:'100%', padding:10, background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer', marginBottom:12 }}>
          Entrar
        </button>
        <button type="button" onClick={() => setResetMode(true)}
          style={{ width:'100%', padding:8, background:'transparent', color:'#888', border:'none', cursor:'pointer', fontSize:13 }}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
