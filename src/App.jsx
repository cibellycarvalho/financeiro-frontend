import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasPagar from './pages/ContasPagar'
import RepasesML from './pages/RepasesML'
import Fornecedores from './pages/Fornecedores'
import Admin from './pages/Admin'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div>Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { finRole, loading } = useAuth()
  if (loading) return <div>Carregando...</div>
  if (finRole !== 'fin_admin') return <div style={{padding:32}}>Acesso restrito a administradores.</div>
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/contas" element={<ProtectedRoute><ContasPagar /></ProtectedRoute>} />
          <Route path="/repasses" element={<ProtectedRoute><RepasesML /></ProtectedRoute>} />
          <Route path="/fornecedores" element={<ProtectedRoute><Fornecedores /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
