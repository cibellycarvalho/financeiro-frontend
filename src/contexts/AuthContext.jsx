import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/auth'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [finRole, setFinRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false)

  async function loadUser(session) {
    if (!session) { setUser(null); setFinRole(null); return }
    setUser(session.user)
    try {
      const resp = await api.get('/api/usuarios')
      const me = resp.data.find(u => u.user_id === session.user.id)
      setFinRole(me?.role ?? null)
    } catch {
      setFinRole(null)
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
    <AuthContext.Provider value={{ user, finRole, loading, needsPasswordReset }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
