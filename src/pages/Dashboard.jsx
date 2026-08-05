import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import CardResumo from '../components/CardResumo'
import AlertaBadge from '../components/AlertaBadge'
import api from '../services/api'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    api.get('/api/dashboard')
      .then(r => setData(r.data))
      .catch(() => setErro('Erro ao carregar dados.'))
  }, [])

  if (erro) return <Layout><p style={{color:'#c00'}}>{erro}</p></Layout>
  if (!data) return <Layout><p>Carregando...</p></Layout>

  const { totais, contas_semana, alertas, fornecedores_aberto } = data

  return (
    <Layout>
      <h1 style={{ marginBottom:24 }}>Visão da Semana</h1>

      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:32 }}>
        <CardResumo titulo="A pagar esta semana" valor={Number(totais.a_pagar_semana)} cor="#ef4444" />
        <CardResumo titulo="Saldo disponível para compras" valor={Number(totais.saldo_disponivel)} cor="#22c55e" />
        <CardResumo titulo="Repasse ML (mês)" valor={Number(totais.repasses_bruto_mes)} />
        <CardResumo titulo="Fornecedores em aberto" valor={Number(totais.fornecedores_aberto)} cor="#f59e0b" />
      </div>

      {alertas.repasse_divergencia && (
        <div style={{ marginBottom:16 }}>
          <AlertaBadge texto="⚠️ Divergência de repasse detectada" tipo="error" />
        </div>
      )}

      <h2 style={{ marginBottom:12 }}>Contas vencendo em 7 dias</h2>
      {contas_semana.length === 0
        ? <p style={{ color:'#666' }}>Nenhuma conta vencendo nos próximos 7 dias 🎉</p>
        : (
          <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden' }}>
            <thead>
              <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
                {['Descrição','Categoria','Vencimento','Valor','Status'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contas_semana.map(c => (
                <tr key={c.id} style={{ borderTop:'1px solid #eee' }}>
                  <td style={{ padding:'10px 16px' }}>{c.descricao}</td>
                  <td style={{ padding:'10px 16px', fontSize:12, color:'#666' }}>{c.categoria}</td>
                  <td style={{ padding:'10px 16px' }}>{new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>
                    {Number(c.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    <AlertaBadge
                      texto={c.status}
                      tipo={c.status === 'vencido' ? 'error' : c.status === 'pago' ? 'ok' : 'warning'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }

      {fornecedores_aberto.length > 0 && (
        <>
          <h2 style={{ marginTop:32, marginBottom:12 }}>Fornecedores com saldo em aberto</h2>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {fornecedores_aberto.map(f => (
              <CardResumo key={f.nome} titulo={f.nome} valor={Number(f.saldo_aberto)} cor="#f59e0b" />
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
