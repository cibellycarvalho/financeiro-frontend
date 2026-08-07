import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/auth'
import ThemeToggle from '../components/ThemeToggle'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [sessionOk, setSessionOk] = useState(false)
  const [erro, setErro] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionOk(true)
        setChecking(false)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionOk(true)
      }
      setChecking(false)
    })

    return () => subscription?.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    if (password !== confirm) { setErro('As senhas não coincidem.'); return }
    if (password.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErro(error.message)
    } else {
      await supabase.auth.signOut()
      navigate('/login')
    }
    setLoading(false)
  }

  const inputStyle = { width:'100%', padding:8, marginTop:4, boxSizing:'border-box', background:'var(--color-bg)', color:'var(--color-text)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)' }
  const containerStyle = { display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'var(--color-bg)' }
  const cardStyle = { background:'var(--color-surface)', border:'1px solid var(--color-border)', padding:40, borderRadius:'var(--radius-md)', width:340 }

  if (checking) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ color:'var(--color-text-muted)' }}>Verificando link...</p>
      </div>
    </div>
  )

  if (!sessionOk) return (
    <div style={containerStyle}>
      <div style={{ position:'fixed', top:16, right:16 }}><ThemeToggle /></div>
      <div style={cardStyle}>
        <h2 style={{ marginBottom:12 }}>Link inválido</h2>
        <p style={{ color:'var(--color-text-muted)', fontSize:14, marginBottom:24 }}>
          Este link expirou ou já foi usado. Solicite um novo pelo login.
        </p>
        <button onClick={() => navigate('/login')}
          style={{ width:'100%', padding:10, background:'var(--color-accent-solid)', color:'var(--color-on-accent)', border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:15 }}>
          Ir para o login
        </button>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={{ position:'fixed', top:16, right:16 }}><ThemeToggle /></div>
      <div style={cardStyle}>
        <h2 style={{ marginBottom:24 }}>Definir nova senha</h2>
        {erro && <p style={{ color:'var(--color-danger)', marginBottom:12 }}>{erro}</p>}
        <form onSubmit={handleSubmit}>
          <label style={{ display:'block', marginBottom:12 }}>
            Nova senha<br />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={inputStyle} />
          </label>
          <label style={{ display:'block', marginBottom:20 }}>
            Confirmar senha<br />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required style={inputStyle} />
          </label>
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:10, background:'var(--color-accent-solid)', color:'var(--color-on-accent)', border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer', fontSize:15 }}>
            {loading ? 'Salvando...' : 'Salvar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
