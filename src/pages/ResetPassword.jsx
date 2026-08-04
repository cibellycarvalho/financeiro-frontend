import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/auth'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const navigate = useNavigate()

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
      navigate('/')
    }
    setLoading(false)
  }

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', background:'#f5f5f5' }}>
      <div style={{ background:'white', padding:40, borderRadius:12, boxShadow:'0 2px 16px rgba(0,0,0,0.1)', width:340 }}>
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
