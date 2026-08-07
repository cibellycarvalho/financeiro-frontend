import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
}
const modalBox = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 32, width: 400, maxWidth: '90vw',
  display: 'flex', flexDirection: 'column', gap: 16
}

function ModalFornecedor({ titulo, inicial, onSalvar, onFechar }) {
  const [nome, setNome] = useState(inicial?.nome || '')
  const [apelido, setApelido] = useState(inicial?.apelido || '')
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await onSalvar({ nome, apelido })
      onFechar()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalOverlay} onClick={onFechar}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        {erro && <p style={{ color: 'var(--color-danger)', margin: 0 }}>{erro}</p>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            Nome *
            <input required value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Apelido (exibido nos cards)
            <input value={apelido} onChange={e => setApelido(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onFechar}
              style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Fornecedores() {
  const { finRole } = useAuth()
  const [fornecedores, setFornecedores] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [fornecedorSel, setFornecedorSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data_pedido: '', valor_total: '', prazo_combinado: '', descricao_produtos: '' })
  const [erro, setErro] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)

  async function carregarFornecedores() {
    const r = await api.get('/api/fornecedores')
    setFornecedores(r.data)
  }

  useEffect(() => { carregarFornecedores() }, [])

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
      setForm({ data_pedido: '', valor_total: '', prazo_combinado: '', descricao_produtos: '' })
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

  async function salvarNovoFornecedor(dados) {
    await api.post('/api/fornecedores', dados)
    await carregarFornecedores()
  }

  async function salvarEdicaoFornecedor(dados) {
    const r = await api.put(`/api/fornecedores/${modalEditar.id}`, dados)
    await carregarFornecedores()
    if (fornecedorSel?.id === modalEditar.id) setFornecedorSel(r.data)
  }

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Fornecedores</h1>
        {finRole === 'fin_admin' && (
          <button onClick={() => setModalNovo(true)}
            style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            + Novo Fornecedor
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        {fornecedores.map(f => (
          <div key={f.id}
            style={{ position: 'relative', cursor: 'pointer', background: fornecedorSel?.id === f.id ? 'var(--color-accent-solid)' : 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: fornecedorSel?.id === f.id ? 'var(--color-on-accent)' : 'var(--color-text)',
              borderRadius: 'var(--radius-md)', padding: '16px 20px', minWidth: 160 }}>
            <div onClick={() => selecionarFornecedor(f)}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{f.apelido || f.nome}</div>
              <div style={{ fontSize: 13, opacity: fornecedorSel?.id === f.id ? 0.95 : 0.8 }}>
                {Number(f.saldo_aberto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em aberto
              </div>
            </div>
            {finRole === 'fin_admin' && (
              <button
                onClick={e => { e.stopPropagation(); setModalEditar(f) }}
                title="Editar fornecedor"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 14, opacity: 0.6, padding: 4,
                  color: fornecedorSel?.id === f.id ? 'var(--color-on-accent)' : 'var(--color-text)'
                }}>
                ✏️
              </button>
            )}
          </div>
        ))}
      </div>

      {fornecedorSel && (
        <>
          {erro && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{erro}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2>Pedidos — {fornecedorSel.nome}</h2>
            {finRole === 'fin_admin' && (
              <button onClick={() => setShowForm(!showForm)}
                style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                + Novo pedido
              </button>
            )}
          </div>

          {showForm && finRole === 'fin_admin' && (
            <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label>Data do pedido<br /><input required type="date" value={form.data_pedido} onChange={e => setForm({ ...form, data_pedido: e.target.value })} style={inputStyle} /></label>
              <label>Valor total (R$)<br /><input required type="number" step="0.01" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} style={inputStyle} /></label>
              <label>Prazo combinado<br /><input type="date" value={form.prazo_combinado} onChange={e => setForm({ ...form, prazo_combinado: e.target.value })} style={inputStyle} /></label>
              <label>Produtos<br /><input value={form.descricao_produtos} onChange={e => setForm({ ...form, descricao_produtos: e.target.value })} style={inputStyle} /></label>
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Salvar</button>
              </div>
            </form>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
                {['Data', 'Produtos', 'Valor', 'Prazo', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 16px' }}>{p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : '—'}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-text-muted)', maxWidth: 200 }}>{p.descricao_produtos || '—'}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{Number(p.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td style={{ padding: '10px 16px' }}>{p.prazo_combinado ? new Date(p.prazo_combinado).toLocaleDateString('pt-BR', {timeZone:'UTC'}) : '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                      background: p.status === 'pago' ? 'color-mix(in srgb, var(--color-success) 18%, transparent)' : p.status === 'parcial' ? 'color-mix(in srgb, var(--color-warning) 18%, transparent)' : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                      color: p.status === 'pago' ? 'var(--color-success)' : p.status === 'parcial' ? 'var(--color-warning)' : 'var(--color-danger)'
                    }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {finRole === 'fin_admin' && p.status !== 'pago' && (
                      <button onClick={() => marcarPago(p.id)}
                        style={{ padding: '4px 12px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                        Marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pedidos.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhum pedido cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {modalNovo && (
        <ModalFornecedor
          titulo="Novo Fornecedor"
          inicial={{ nome: '', apelido: '' }}
          onSalvar={salvarNovoFornecedor}
          onFechar={() => setModalNovo(false)}
        />
      )}

      {modalEditar && (
        <ModalFornecedor
          titulo={`Editar — ${modalEditar.nome}`}
          inicial={modalEditar}
          onSalvar={salvarEdicaoFornecedor}
          onFechar={() => setModalEditar(null)}
        />
      )}
    </Layout>
  )
}
