import { useState } from 'react'
import { signIn, supabase } from '../services/auth'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

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
      setResetMsg(`Erro: ${err.message || err.status || 'desconhecido'}`)
    } else {
      setResetMsg('Email enviado! Verifique sua caixa de entrada.')
    }
    setResetLoading(false)
  }

  const inputStyle = { width:'100%', padding:8, marginTop:4, boxSizing:'border-box', background:'var(--color-bg)', color:'var(--color-text)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)' }
  const containerStyle = { display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'var(--color-bg)' }
  const cardStyle = { background:'var(--color-surface)', border:'1px solid var(--color-border)', padding:40, borderRadius:'var(--radius-md)', width:360 }

  if (resetMode) return (
    <div style={containerStyle}>
      <div style={{ position:'fixed', top:16, right:16 }}><ThemeToggle /></div>
      <form onSubmit={handleReset} style={cardStyle}>
        <h2 style={{ marginBottom:8 }}>Redefinir senha</h2>
        <p style={{ color:'var(--color-text-muted)', fontSize:14, marginBottom:20 }}>Digite seu e-mail e enviaremos um link.</p>
        {resetMsg && <div style={{ color: resetMsg.startsWith('Erro') ? 'var(--color-danger)' : 'var(--color-success)', marginBottom:16, fontSize:14 }}>{resetMsg}</div>}
        <label>E-mail<br />
          <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom:20 }} required />
        </label>
        <button type="submit" disabled={resetLoading}
          style={{ width:'100%', padding:10, background:'var(--color-accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:12 }}>
          {resetLoading ? 'Enviando...' : 'Enviar link'}
        </button>
        <button type="button" onClick={() => setResetMode(false)}
          style={{ width:'100%', padding:10, background:'transparent', color:'var(--color-text-muted)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', cursor:'pointer' }}>
          Voltar ao login
        </button>
      </form>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={{ position:'fixed', top:16, right:16 }}><ThemeToggle /></div>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <h2 style={{ marginBottom:24 }}>Painel Financeiro Cravelli</h2>
        {error && <div style={{ color:'var(--color-danger)', marginBottom:16 }}>{error}</div>}
        <label>E-mail<br />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom:16 }} required />
        </label>
        <label>Senha<br />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            style={{ ...inputStyle, marginBottom:24 }} required />
        </label>
        <button type="submit" style={{ width:'100%', padding:10, background:'var(--color-accent)', color:'#fff', border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer', marginBottom:12 }}>
          Entrar
        </button>
        <button type="button" onClick={() => setResetMode(true)}
          style={{ width:'100%', padding:8, background:'transparent', color:'var(--color-text-muted)', border:'none', cursor:'pointer', fontSize:13 }}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
