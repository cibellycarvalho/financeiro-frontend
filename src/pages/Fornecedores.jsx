import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import CardResumo from '../components/CardResumo'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function Fornecedores() {
  const { finRole } = useAuth()
  const [fornecedores, setFornecedores] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [fornecedorSel, setFornecedorSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data_pedido:'', valor_total:'', prazo_combinado:'', descricao_produtos:'' })
  const [erro, setErro] = useState(null)

  useEffect(() => {
    api.get('/api/fornecedores').then(r => setFornecedores(r.data))
  }, [])

  async function selecionarFornecedor(f) {
    setFornecedorSel(f)
    const r = await api.get(`/api/fornecedores/${f.id}/pedidos`)
    setPedidos(r.data)
    setShowForm(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    try {
      await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos`, { ...form, valor_total: parseFloat(form.valor_total) })
      setShowForm(false)
      setForm({ data_pedido:'', valor_total:'', prazo_combinado:'', descricao_produtos:'' })
      selecionarFornecedor(fornecedorSel)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar pedido.')
    }
  }

  async function marcarPago(pedidoId) {
    setErro(null)
    try {
      const hoje = new Date().toISOString().split('T')[0]
      const pedido = pedidos.find(p => p.id === pedidoId)
      await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}`, {
        status: 'pago',
        valor_pago: pedido.valor_total,
        data_pagamento: hoje
      })
      selecionarFornecedor(fornecedorSel)
    } catch {
      setErro('Erro ao marcar pedido como pago.')
    }
  }

  return (
    <Layout>
      <h1 style={{ marginBottom:24 }}>Fornecedores</h1>

      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:32 }}>
        {fornecedores.map(f => (
          <div key={f.id} onClick={() => selecionarFornecedor(f)}
            style={{ cursor:'pointer', background: fornecedorSel?.id === f.id ? '#1a1a1a' : 'white',
              color: fornecedorSel?.id === f.id ? 'white' : '#1a1a1a',
              borderRadius:12, padding:'16px 20px', boxShadow:'0 1px 8px rgba(0,0,0,0.06)', minWidth:160 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{f.apelido || f.nome}</div>
            <div style={{ fontSize:13, opacity:0.7 }}>
              {Number(f.saldo_aberto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em aberto
            </div>
          </div>
        ))}
      </div>

      {fornecedorSel && (
        <>
          {erro && <p style={{ color:'#c00', marginBottom:12 }}>{erro}</p>}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h2>Pedidos — {fornecedorSel.nome}</h2>
            {finRole === 'fin_admin' && (
              <button onClick={() => setShowForm(!showForm)}
                style={{ padding:'8px 20px', background:'#1a1a1a', color:'white', border:'none', borderRadius:8, cursor:'pointer' }}>
                + Novo pedido
              </button>
            )}
          </div>

          {showForm && finRole === 'fin_admin' && (
            <form onSubmit={handleSubmit} style={{ background:'white', borderRadius:12, padding:24, marginBottom:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <label>Data do pedido<br /><input required type="date" value={form.data_pedido} onChange={e => setForm({...form, data_pedido:e.target.value})} style={{width:'100%',padding:8}} /></label>
              <label>Valor total (R$)<br /><input required type="number" step="0.01" value={form.valor_total} onChange={e => setForm({...form, valor_total:e.target.value})} style={{width:'100%',padding:8}} /></label>
              <label>Prazo combinado<br /><input type="date" value={form.prazo_combinado} onChange={e => setForm({...form, prazo_combinado:e.target.value})} style={{width:'100%',padding:8}} /></label>
              <label>Produtos<br /><input value={form.descricao_produtos} onChange={e => setForm({...form, descricao_produtos:e.target.value})} style={{width:'100%',padding:8}} /></label>
              <div style={{gridColumn:'span 2', display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button type="button" onClick={() => setShowForm(false)} style={{padding:'8px 20px',borderRadius:8,border:'1px solid #ccc',cursor:'pointer'}}>Cancelar</button>
                <button type="submit" style={{padding:'8px 20px',background:'#1a1a1a',color:'white',border:'none',borderRadius:8,cursor:'pointer'}}>Salvar</button>
              </div>
            </form>
          )}

          <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden' }}>
            <thead>
              <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
                {['Data','Produtos','Valor','Prazo','Status',''].map(h => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} style={{ borderTop:'1px solid #eee' }}>
                  <td style={{ padding:'10px 16px' }}>{new Date(p.data_pedido + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style={{ padding:'10px 16px', color:'#666', maxWidth:200 }}>{p.descricao_produtos || '—'}</td>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>{Number(p.valor_total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                  <td style={{ padding:'10px 16px' }}>{p.prazo_combinado ? new Date(p.prazo_combinado + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ padding:'2px 10px', borderRadius:99, fontSize:12, fontWeight:600,
                      background: p.status === 'pago' ? '#22c55e22' : p.status === 'parcial' ? '#f59e0b22' : '#ef444422',
                      color: p.status === 'pago' ? '#22c55e' : p.status === 'parcial' ? '#f59e0b' : '#ef4444' }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    {finRole === 'fin_admin' && p.status !== 'pago' && (
                      <button onClick={() => marcarPago(p.id)}
                        style={{ padding:'4px 12px', fontSize:12, background:'#22c55e', color:'white', border:'none', borderRadius:6, cursor:'pointer' }}>
                        Marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pedidos.length === 0 && (
                <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:'#666' }}>Nenhum pedido cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </Layout>
  )
}
