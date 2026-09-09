import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/auth'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [finRole, setFinRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false)
  // Só vira true quando o servidor DIZ que a pessoa não tem acesso (403).
  // Erro de rede não conta: nesse caso não dá pra saber, e mostrar "sem acesso"
  // pra quem tem seria pior do que deixar entrar — quem protege o dado é o
  // backend, que recusa de novo na próxima chamada.
  const [semAcessoConfirmado, setSemAcessoConfirmado] = useState(false)

  async function loadUser(session) {
    if (!session) { setUser(null); setFinRole(null); setSemAcessoConfirmado(false); return }
    setUser(session.user)
    try {
      const resp = await api.get('/api/usuarios')
      const me = resp.data.find(u => u.user_id === session.user.id)
      setFinRole(me?.role ?? null)
      setSemAcessoConfirmado(false)
    } catch (e) {
      setFinRole(null)
      // 403 é o backend dizendo "você não usa o financeiro". Qualquer outro
      // erro (rede, servidor fora, 500) é desconhecimento, não negativa.
      setSemAcessoConfirmado(e?.response?.status === 403)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      loadUser(data.session).finally(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordReset(true)
        setLoading(false)
        return
      }
      setNeedsPasswordReset(false)
      loadUser(session).finally(() => setLoading(false))
    })
    return () => subscription?.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, finRole, loading, needsPasswordReset, semAcessoConfirmado }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
