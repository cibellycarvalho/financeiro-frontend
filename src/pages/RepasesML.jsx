import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import CardResumo from '../components/CardResumo'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function RepasesML() {
  const { finRole } = useAuth()
  const [repasses, setRepasses] = useState([])
  const [saldo, setSaldo] = useState(null)
  const [mes, setMes] = useState(new Date().toISOString().slice(0,7))
  const [contaFiltro, setContaFiltro] = useState('YUSO')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo:'repasse', valor:'', data_referencia:'', conta_ml:'YUSO', descricao:'' })
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  async function carregar() {
    const [r, s] = await Promise.all([
      api.get(`/api/repasses?mes=${mes}&conta_ml=${contaFiltro}`),
      api.get(`/api/repasses/saldo?mes=${mes}`)
    ])
    setRepasses(r.data)
    setSaldo(s.data)
  }

  useEffect(() => { carregar() }, [mes, contaFiltro])

  async function sincronizarMP() {
    setSyncLoading(true)
    setSyncMsg(null)
    try {
      const r = await api.post(`/api/repasses/sync-mp?mes=${mes}&conta_ml=${contaFiltro}`)
      setSyncMsg({ tipo: 'ok', texto: `${r.data.sincronizados} pagamentos sincronizados (${r.data.registros} registros).` })
      await carregar()
    } catch (err) {
      setSyncMsg({ tipo: 'erro', texto: err.response?.data?.error || 'Erro ao sincronizar.' })
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await api.post('/api/repasses', { ...form, valor: parseFloat(form.valor) })
    setShowForm(false)
    setForm({ tipo:'repasse', valor:'', data_referencia:'', conta_ml:'YUSO', descricao:'' })
    carregar()
  }

  return (
    <Layout>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1>Repasses ML</h1>
        {finRole === 'fin_admin' && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={sincronizarMP} disabled={syncLoading}
              style={{ padding:'8px 20px', background:'#2563eb', color:'white', border:'none', borderRadius:8, cursor:'pointer', opacity: syncLoading ? 0.6 : 1 }}>
              {syncLoading ? 'Sincronizando...' : '↻ Sincronizar MP'}
            </button>
            <button onClick={() => setShowForm(!showForm)}
              style={{ padding:'8px 20px', background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
              + Lançar repasse
            </button>
          </div>
        )}
      </div>

      {syncMsg && (
        <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:8,
          background: syncMsg.tipo === 'ok' ? '#22c55e22' : '#ef444422',
          color: syncMsg.tipo === 'ok' ? '#15803d' : '#b91c1c', fontSize:14 }}>
          {syncMsg.texto}
        </div>
      )}

      <div style={{ display:'flex', gap:16, marginBottom:20, alignItems:'center' }}>
        <label>Mês: <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={{padding:6, marginLeft:8}} /></label>
        <label>Conta ML:
          <select value={contaFiltro} onChange={e => setContaFiltro(e.target.value)} style={{padding:6, marginLeft:8}}>
            <option value="YUSO">YUSO</option>
            <option value="M12">M12</option>
          </select>
        </label>
      </div>

      {saldo && (
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:32 }}>
          <CardResumo titulo="Repasse bruto" valor={saldo.repasses_bruto} />
          <CardResumo titulo="Cobranças ML" valor={saldo['cobranças_ml']} cor="#ef4444" />
          <CardResumo titulo="Contas pagas" valor={saldo.contas_pagas} cor="#f59e0b" />
          <CardResumo titulo="Saldo disponível" valor={saldo.saldo_disponivel} cor="#22c55e" />
        </div>
      )}

      {showForm && finRole === 'fin_admin' && (
        <form onSubmit={handleSubmit} style={{ background:'white', borderRadius:12, padding:24, marginBottom:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <label>Tipo<br />
            <select value={form.tipo} onChange={e => setForm({...form, tipo:e.target.value})} style={{width:'100%',padding:8}}>
              {['repasse','cobranca','tarifa'].map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Conta ML<br />
            <select value={form.conta_ml} onChange={e => setForm({...form, conta_ml:e.target.value})} style={{width:'100%',padding:8}}>
              {['YUSO','M12'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Valor (R$)<br /><input required type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <label>Data<br /><input required type="date" value={form.data_referencia} onChange={e => setForm({...form, data_referencia:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <label style={{gridColumn:'span 2'}}>Descrição<br /><input value={form.descricao} onChange={e => setForm({...form, descricao:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <div style={{gridColumn:'span 2', display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button type="button" onClick={() => setShowForm(false)} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #ccc',cursor:'pointer'}}>Cancelar</button>
            <button type="submit" style={{padding:'8px 20px',background:'#1a1a1a',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>Salvar</button>
          </div>
        </form>
      )}

      <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden' }}>
        <thead>
          <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
            {['Data','Tipo','Conta ML','Descrição','Valor'].map(h => (
              <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {repasses.map(r => (
            <tr key={r.id} style={{ borderTop:'1px solid #eee' }}>
              <td style={{ padding:'10px 16px' }}>{new Date(String(r.data_referencia).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td style={{ padding:'10px 16px' }}>
                <span style={{ padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:600,
                  background: r.tipo === 'repasse' ? '#22c55e22' : '#ef444422',
                  color: r.tipo === 'repasse' ? '#22c55e' : '#ef4444' }}>
                  {r.tipo}
                </span>
              </td>
              <td style={{ padding:'10px 16px' }}>{r.conta_ml}</td>
              <td style={{ padding:'10px 16px', color:'#666' }}>{r.descricao || '—'}</td>
              <td style={{ padding:'10px 16px', fontWeight:600, color: r.tipo === 'repasse' ? '#22c55e' : '#ef4444' }}>
                {r.tipo === 'repasse' ? '+' : '-'}{Number(r.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
              </td>
            </tr>
          ))}
          {repasses.length === 0 && (
            <tr><td colSpan={5} style={{ padding:24, textAlign:'center', color:'#666' }}>Nenhum lançamento para este mês.</td></tr>
          )}
        </tbody>
      </table>
    </Layout>
  )
}
