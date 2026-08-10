import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import AlertaBadge from '../components/AlertaBadge'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function ContasPagar() {
  const { finRole } = useAuth()
  const [contas, setContas] = useState([])
  const [periodo, setPeriodo] = useState('semana')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ descricao:'', categoria:'IMPOSTO_DAS', valor:'', vencimento:'', marca:'GERAL', observacao:'' })

  async function carregar() {
    const params = periodo === 'todos' ? '' : `?periodo=${periodo}`
    const r = await api.get(`/api/contas${params}`)
    setContas(r.data)
  }

  useEffect(() => { carregar() }, [periodo])

  async function handleSubmit(e) {
    e.preventDefault()
    await api.post('/api/contas', { ...form, valor: parseFloat(form.valor) })
    setShowForm(false)
    setForm({ descricao:'', categoria:'IMPOSTO_DAS', valor:'', vencimento:'', marca:'GERAL', observacao:'' })
    carregar()
  }

  async function marcarPago(id) {
    const hoje = new Date().toISOString().split('T')[0]
    await api.put(`/api/contas/${id}`, { status:'pago', data_pagamento: hoje })
    carregar()
  }

  return (
    <Layout>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:12 }}>
        <h1 style={{ margin:0 }}>Contas a Pagar</h1>
        {finRole === 'fin_admin' && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{ padding:'8px 20px', background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
              + Nova conta
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom:20, display:'flex', gap:8 }}>
        {['semana','mes','todos'].map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding:'6px 16px', borderRadius:99, border:'1px solid #ccc',
              background: periodo === p ? '#1a1a1a' : 'white',
              color: periodo === p ? 'white' : '#333', cursor:'pointer', fontSize:13 }}>
            {p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mês' : 'Todas'}
          </button>
        ))}
      </div>

      {showForm && finRole === 'fin_admin' && (
        <form onSubmit={handleSubmit} style={{ background:'white', borderRadius:12, padding:24, marginBottom:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <label>Descrição<br /><input required value={form.descricao} onChange={e => setForm({...form, descricao:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <label>Categoria<br />
            <select value={form.categoria} onChange={e => setForm({...form, categoria:e.target.value})} style={{width:'100%',padding:8}}>
              {['FORNECEDOR','CONTABILIDADE','IMPOSTO_DAS','SISTEMA','OUTRO'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Valor (R$)<br /><input required type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <label>Vencimento<br /><input required type="date" value={form.vencimento} onChange={e => setForm({...form, vencimento:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <label>Marca<br />
            <select value={form.marca} onChange={e => setForm({...form, marca:e.target.value})} style={{width:'100%',padding:8}}>
              {['YUSO','M12','GERAL'].map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Observação<br /><input value={form.observacao} onChange={e => setForm({...form, observacao:e.target.value})} style={{width:'100%',padding:8}} /></label>
          <div style={{gridColumn:'span 2', display:'flex', gap:8, justifyContent:'flex-end'}}>
            <button type="button" onClick={() => setShowForm(false)} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #ccc',cursor:'pointer'}}>Cancelar</button>
            <button type="submit" style={{padding:'8px 20px',background:'#1a1a1a',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>Salvar</button>
          </div>
        </form>
      )}

      <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden' }}>
        <thead>
          <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
            {['Descrição','Categoria','Vencimento','Valor','Marca','Status',''].map(h => (
              <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contas.map(c => (
            <tr key={c.id} style={{ borderTop:'1px solid #eee', background: c.origem === 'dda' ? '#faf5ff' : 'white' }}>
              <td style={{ padding:'10px 16px' }}>
                {c.origem === 'dda' && <span title="Importado do Sicredi via DDA" style={{ marginRight:6, fontSize:11, padding:'1px 6px', borderRadius:99, background:'#7c3aed22', color:'#7c3aed' }}>DDA</span>}
                {c.descricao}
              </td>
              <td style={{ padding:'10px 16px', fontSize:12, color:'#666' }}>{c.categoria}</td>
              <td style={{ padding:'10px 16px' }}>{new Date(c.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
              <td style={{ padding:'10px 16px', fontWeight:600 }}>{Number(c.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
              <td style={{ padding:'10px 16px' }}>{c.marca}</td>
              <td style={{ padding:'10px 16px' }}>
                <AlertaBadge
                  texto={c.status === 'a_confirmar' ? 'a confirmar' : c.status}
                  tipo={c.status === 'vencido' ? 'error' : c.status === 'pago' ? 'ok' : c.status === 'a_confirmar' ? 'info' : 'warning'}
                />
              </td>
              <td style={{ padding:'10px 16px' }}>
                {finRole === 'fin_admin' && c.status !== 'pago' && (
                  <button onClick={() => marcarPago(c.id)}
                    style={{ padding:'4px 12px', fontSize:12, background:'#22c55e', color:'white', border:'none', borderRadius:6, cursor:'pointer' }}>
                    Marcar pago
                  </button>
                )}
              </td>
            </tr>
          ))}
          {contas.length === 0 && (
            <tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'#666' }}>Nenhuma conta encontrada.</td></tr>
          )}
        </tbody>
      </table>
    </Layout>
  )
}
