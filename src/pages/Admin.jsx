import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'

export default function Admin() {
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState({ email:'', role:'fin_viewer' })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/api/usuarios').then(r => setUsuarios(r.data))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg('')
    try {
      await api.post('/api/usuarios', form)
      setMsg('Usuário adicionado com sucesso!')
      setForm({ email:'', role:'fin_viewer' })
      const r = await api.get('/api/usuarios')
      setUsuarios(r.data)
    } catch (err) {
      setMsg(err.response?.data?.error || 'Erro ao adicionar usuário.')
    }
  }

  return (
    <Layout>
      <h1 style={{ marginBottom:24 }}>Gerenciar Usuários</h1>

      <div style={{ background:'white', borderRadius:12, padding:24, marginBottom:32, maxWidth:480 }}>
        <h3 style={{ marginBottom:16 }}>Adicionar acesso</h3>
        {msg && <p style={{ color: msg.includes('sucesso') ? '#22c55e' : '#c00', marginBottom:12 }}>{msg}</p>}
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <label>E-mail do usuário Supabase<br />
            <input required type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} style={{width:'100%',padding:8,marginTop:4}} />
          </label>
          <label>Permissão<br />
            <select value={form.role} onChange={e => setForm({...form, role:e.target.value})} style={{width:'100%',padding:8,marginTop:4}}>
              <option value="fin_viewer">Visualizador (sócio)</option>
              <option value="fin_admin">Administrador</option>
            </select>
          </label>
          <button type="submit" style={{padding:'10px',background:'#1a1a1a',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>
            Adicionar
          </button>
        </form>
      </div>

      <h2 style={{ marginBottom:12 }}>Usuários com acesso</h2>
      <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden', maxWidth:600 }}>
        <thead>
          <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
            {['User ID','Permissão','Desde'].map(h => (
              <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.user_id} style={{ borderTop:'1px solid #eee' }}>
              <td style={{ padding:'10px 16px', fontSize:12, color:'#666', fontFamily:'monospace' }}>{u.user_id.slice(0,8)}...</td>
              <td style={{ padding:'10px 16px' }}>
                <span style={{ padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:600,
                  background: u.role === 'fin_admin' ? '#1a1a1a22' : '#f0f0f0',
                  color: u.role === 'fin_admin' ? '#1a1a1a' : '#666' }}>
                  {u.role === 'fin_admin' ? 'Admin' : 'Visualizador'}
                </span>
              </td>
              <td style={{ padding:'10px 16px', fontSize:12, color:'#666' }}>
                {new Date(u.created_at).toLocaleDateString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}
