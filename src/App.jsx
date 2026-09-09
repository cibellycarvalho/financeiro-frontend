import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasPagar from './pages/ContasPagar'
import RepasesML from './pages/RepasesML'
import Fornecedores from './pages/Fornecedores'
import Fechamento from './pages/Fechamento'
import LucroReal from './pages/LucroReal'
import Admin from './pages/Admin'
import ResetPassword from './pages/ResetPassword'
import AvisoNovaVersao from './components/AvisoNovaVersao'

function ProtectedRoute({ children }) {
  const { user, loading, needsPasswordReset, semAcessoConfirmado } = useAuth()
  if (loading) return <div>Carregando...</div>
  if (needsPasswordReset) return <Navigate to="/reset-password" replace />
  if (!user) return <Navigate to="/login" replace />
  // Só barra quando o servidor confirmou que a pessoa não tem acesso. Falha de
  // rede não barra ninguém — ver o comentário em SemAcesso e no AuthContext.
  if (semAcessoConfirmado) return <SemAcesso />
  return children
}

/**
 * Aviso para quem está logado mas não usa o financeiro.
 *
 * Todos os sistemas da Cravelli compartilham o mesmo login. Antes disto, quem
 * não tinha papel aqui abria o painel e via a casca vazia: nenhuma conta,
 * nenhum valor, tudo quebrado. Os dados nunca vazaram — o servidor recusa com
 * 403 quem não tem `fin_role` — mas a tela parecia defeito, e assustava (foi o
 * que aconteceu com a Bianca em 09/09/2026, no primeiro acesso dela).
 *
 * Isto é recado, NÃO é tranca: quem garante o acesso é `require_auth` no
 * backend. Não confie nisto para proteger dado nenhum.
 */
function SemAcesso() {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 32,
      background: 'var(--color-bg)', color: 'var(--color-text)',
    }}>
      <div style={{
        maxWidth: 420, textAlign: 'center', padding: 32,
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Você não tem acesso ao Financeiro</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Sua conta está certa e você entrou normalmente — este painel é que não
          faz parte do seu acesso. Se precisar dele, peça para a Cibelly liberar.
        </p>
        <a href="https://cravelli.com.br" style={{ display: 'inline-block', marginTop: 20, fontSize: 14, color: 'var(--color-accent)' }}>
          Voltar para o hub
        </a>
      </div>
    </div>
  )
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
      {/* Fora do BrowserRouter: o aviso vale em qualquer rota,
          inclusive na tela de login. */}
      <AvisoNovaVersao />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/contas" element={<ProtectedRoute><ContasPagar /></ProtectedRoute>} />
          <Route path="/repasses" element={<ProtectedRoute><RepasesML /></ProtectedRoute>} />
          <Route path="/fornecedores" element={<ProtectedRoute><Fornecedores /></ProtectedRoute>} />
          <Route path="/fechamento" element={<ProtectedRoute><Fechamento /></ProtectedRoute>} />
          <Route path="/lucro-real" element={<ProtectedRoute><LucroReal /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
