import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/auth'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [sessionOk, setSessionOk] = useState(false)
  const [erro, setErro] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Catch PASSWORD_RECOVERY if it fires after this page mounts
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionOk(true)
        setChecking(false)
      }
    })

    // Check if session already exists (set by AuthContext before redirect)
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

  const containerStyle = { display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f5f5f5' }
  const cardStyle = { background:'white', padding:40, borderRadius:12, boxShadow:'0 2px 16px rgba(0,0,0,0.1)', width:340 }

  if (checking) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ color:'#666' }}>Verificando link...</p>
      </div>
    </div>
  )

  if (!sessionOk) return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginBottom:12 }}>Link inválido</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:24 }}>
          Este link expirou ou já foi usado. Solicite um novo pelo login.
        </p>
        <button onClick={() => navigate('/login')}
          style={{ width:'100%', padding:10, background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:15 }}>
          Ir para o login
        </button>
      </div>
    </div>
  )

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginBottom:24 }}>Definir nova senha</h2>
        {erro && <p style={{ color:'#c00', marginBottom:12 }}>{erro}</p>}
        <form onSubmit={handleSubmit}>
          <label style={{ display:'block', marginBottom:12 }}>
            Nova senha<br />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={{ width:'100%', padding:8, marginTop:4, boxSizing:'border-box' }} />
          </label>
          <label style={{ display:'block', marginBottom:20 }}>
            Confirmar senha<br />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required style={{ width:'100%', padding:8, marginTop:4, boxSizing:'border-box' }} />
          </label>
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:10, background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer', fontSize:15 }}>
            {loading ? 'Salvando...' : 'Salvar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
