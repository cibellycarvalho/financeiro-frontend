import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/auth'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [finRole, setFinRole] = useState(null)
  const [loading, setLoading] = useState(true)

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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, finRole, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
