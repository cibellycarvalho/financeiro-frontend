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

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

function LinhaPagamento({ pagamento, onEditar, onExcluir }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(pagamento.valor)
  const [data, setData] = useState(pagamento.data_pagamento)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  async function salvar() {
    setErro(null)
    setLoading(true)
    try {
      await onEditar(pagamento.id, parseFloat(valor), data)
      setEditando(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao editar pagamento.')
    } finally {
      setLoading(false)
    }
  }

  async function excluir() {
    if (!confirm('Excluir este pagamento?')) return
    setErro(null)
    setLoading(true)
    try {
      await onExcluir(pagamento.id)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao excluir pagamento.')
      setLoading(false)
    }
  }

  if (editando) {
    return (
      <div style={{ padding: '8px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: 6 }} />
          <input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: 6 }} />
          <button onClick={salvar} disabled={loading}
            style={{ padding: '6px 10px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            ✓
          </button>
          <button onClick={() => setEditando(false)} disabled={loading}
            style={{ padding: '6px 10px', fontSize: 12, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        {erro && <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '4px 0 0' }}>{erro}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)' }}>
      <span>{new Date(pagamento.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{formatMoeda(pagamento.valor)}</span>
        <button onClick={() => setEditando(true)} title="Editar" disabled={loading}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>
          ✏️
        </button>
        <button onClick={excluir} title="Excluir" disabled={loading}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>
          🗑️
        </button>
      </div>
    </div>
  )
}

function ModalPagamento({ pedido, onSalvar, onEditarPagamento, onExcluirPagamento, onFechar }) {
  const saldoRestante = Number(pedido.valor_total) - Number(pedido.valor_pago)
  const [valor, setValor] = useState(Math.max(saldoRestante, 0).toFixed(2))
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await onSalvar(parseFloat(valor), dataPagamento)
      onFechar()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao registrar pagamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalOverlay} onClick={onFechar}>
      <div style={modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Pagamentos</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
          Saldo restante: <strong style={{ color: 'var(--color-text)' }}>{formatMoeda(saldoRestante)}</strong>
        </p>

        {pedido.pagamentos && pedido.pagamentos.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Pagamentos já registrados
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {pedido.pagamentos.map(p => (
                <LinhaPagamento key={p.id} pagamento={p} onEditar={onEditarPagamento} onExcluir={onExcluirPagamento} />
              ))}
            </div>
          </div>
        )}

        {erro && <p style={{ color: 'var(--color-danger)', margin: 0 }}>{erro}</p>}

        {saldoRestante > 0 && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Valor pago (R$) *
              <input required type="number" step="0.01" min="0.01" max={saldoRestante}
                value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} />
            </label>
            <label>
              Data do pagamento *
              <input required type="date" value={dataPagamento}
                onChange={e => setDataPagamento(e.target.value)} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={onFechar}
                style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}>
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                style={{ padding: '8px 20px', background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                {loading ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        )}

        {saldoRestante <= 0 && (
          <button type="button" onClick={onFechar}
            style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}>
            Fechar
          </button>
        )}
      </div>
    </div>
  )
}

const ITEM_VAZIO = { produto: '', quantidade: '', valor_unitario: '' }

export default function Fornecedores() {
  const { finRole } = useAuth()
  const [fornecedores, setFornecedores] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [fornecedorSel, setFornecedorSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ data_pedido: '', itens: [{ ...ITEM_VAZIO }] })
  const [erro, setErro] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalPagamento, setModalPagamento] = useState(null)

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

  function atualizarItem(index, campo, valor) {
    const itens = form.itens.map((item, i) => i === index ? { ...item, [campo]: valor } : item)
    setForm({ ...form, itens })
  }

  function adicionarItem() {
    setForm({ ...form, itens: [...form.itens, { ...ITEM_VAZIO }] })
  }

  function removerItem(index) {
    setForm({ ...form, itens: form.itens.filter((_, i) => i !== index) })
  }

  function totalDoItem(item) {
    return (parseFloat(item.quantidade) || 0) * (parseFloat(item.valor_unitario) || 0)
  }

  const totalDoPedido = form.itens.reduce((soma, item) => soma + totalDoItem(item), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    try {
      const itens = form.itens.map(item => ({
        produto: item.produto,
        quantidade: parseFloat(item.quantidade),
        valor_unitario: parseFloat(item.valor_unitario)
      }))
      await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos`, { data_pedido: form.data_pedido, itens })
      setShowForm(false)
      setForm({ data_pedido: '', itens: [{ ...ITEM_VAZIO }] })
      selecionarFornecedor(fornecedorSel)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar pedido.')
    }
  }

  async function recarregarPedidosEModal(pedidoId) {
    const r = await api.get(`/api/fornecedores/${fornecedorSel.id}/pedidos`)
    setPedidos(r.data)
    const atualizado = r.data.find(p => p.id === pedidoId)
    if (atualizado) setModalPagamento(atualizado)
  }

  async function registrarPagamento(pedidoId, valor, dataPagamento) {
    await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos`, {
      valor, data_pagamento: dataPagamento
    })
    selecionarFornecedor(fornecedorSel)
  }

  async function editarPagamento(pedidoId, pagamentoId, valor, dataPagamento) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos/${pagamentoId}`, {
      valor, data_pagamento: dataPagamento
    })
    await recarregarPedidosEModal(pedidoId)
  }

  async function excluirPagamento(pedidoId, pagamentoId) {
    await api.delete(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos/${pagamentoId}`)
    await recarregarPedidosEModal(pedidoId)
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

  async function excluirFornecedor(f) {
    if (!confirm(`Excluir fornecedor "${f.apelido || f.nome}"?`)) return
    try {
      await api.delete(`/api/fornecedores/${f.id}`)
      if (fornecedorSel?.id === f.id) { setFornecedorSel(null); setPedidos([]) }
      await carregarFornecedores()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao excluir fornecedor.')
    }
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
                {formatMoeda(f.saldo_aberto)} em aberto
              </div>
            </div>
            {finRole === 'fin_admin' && (
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 2 }}>
                <button
                  onClick={e => { e.stopPropagation(); setModalEditar(f) }}
                  title="Editar fornecedor"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 14, opacity: 0.6, padding: 4,
                    color: fornecedorSel?.id === f.id ? 'var(--color-on-accent)' : 'var(--color-text)'
                  }}>
                  ✏️
                </button>
                <button
                  onClick={e => { e.stopPropagation(); excluirFornecedor(f) }}
                  title="Excluir fornecedor"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 14, opacity: 0.6, padding: 4,
                    color: fornecedorSel?.id === f.id ? 'var(--color-on-accent)' : 'var(--color-text)'
                  }}>
                  🗑️
                </button>
              </div>
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
            <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 24, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ maxWidth: 220 }}>Data do pedido<br /><input required type="date" value={form.data_pedido} onChange={e => setForm({ ...form, data_pedido: e.target.value })} style={inputStyle} /></label>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Itens do pedido</span>
                  <button type="button" onClick={adicionarItem}
                    style={{ padding: '6px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-accent-solid)', border: '1px solid var(--color-accent-solid)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                    + Adicionar produto
                  </button>
                </div>

                {form.itens.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                    <label style={{ fontSize: 12 }}>Produto<br />
                      <input required value={item.produto} onChange={e => atualizarItem(i, 'produto', e.target.value)} style={inputStyle} />
                    </label>
                    <label style={{ fontSize: 12 }}>Quantidade<br />
                      <input required type="number" step="0.01" min="0.01" value={item.quantidade} onChange={e => atualizarItem(i, 'quantidade', e.target.value)} style={inputStyle} />
                    </label>
                    <label style={{ fontSize: 12 }}>Valor unit. (R$)<br />
                      <input required type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizarItem(i, 'valor_unitario', e.target.value)} style={inputStyle} />
                    </label>
                    <div style={{ fontSize: 12 }}>Total<br />
                      <div style={{ padding: '8px 0', fontWeight: 600 }}>{formatMoeda(totalDoItem(item))}</div>
                    </div>
                    <button type="button" onClick={() => removerItem(i)} disabled={form.itens.length === 1}
                      style={{ padding: 8, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: form.itens.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', opacity: form.itens.length === 1 ? 0.4 : 1 }}>
                      ✕
                    </button>
                  </div>
                ))}

                <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 8, fontSize: 15 }}>
                  Total do pedido: {formatMoeda(totalDoPedido)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', background: 'transparent', color: 'var(--color-text)' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Salvar</button>
              </div>
            </form>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
                {['Data', 'Produto', 'Quantidade', 'Valor unitário', 'Valor total', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => {
                const itens = p.itens && p.itens.length > 0 ? p.itens : [null]
                return itens.map((item, i) => (
                  <tr key={item ? item.id : p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    {i === 0 && (
                      <td rowSpan={itens.length} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                        {p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}
                      </td>
                    )}
                    {item ? (
                      <>
                        <td style={{ padding: '10px 16px' }}>{item.produto}</td>
                        <td style={{ padding: '10px 16px' }}>{Number(item.quantidade).toLocaleString('pt-BR')}</td>
                        <td style={{ padding: '10px 16px' }}>{formatMoeda(item.valor_unitario)}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{formatMoeda(item.valor_total)}</td>
                      </>
                    ) : (
                      <>
                        <td colSpan={3} style={{ padding: '10px 16px', color: 'var(--color-text-muted)' }}>{p.descricao_produtos || '—'}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>{formatMoeda(p.valor_total)}</td>
                      </>
                    )}
                    {i === 0 && (
                      <>
                        <td rowSpan={itens.length} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                          <span style={{
                            padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                            background: p.status === 'pago' ? 'color-mix(in srgb, var(--color-success) 18%, transparent)' : p.status === 'parcial' ? 'color-mix(in srgb, var(--color-warning) 18%, transparent)' : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                            color: p.status === 'pago' ? 'var(--color-success)' : p.status === 'parcial' ? 'var(--color-warning)' : 'var(--color-danger)'
                          }}>
                            {p.status}
                          </span>
                        </td>
                        <td rowSpan={itens.length} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                          {finRole === 'fin_admin' && p.status !== 'pago' && (
                            <button onClick={() => setModalPagamento(p)}
                              style={{ padding: '4px 12px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                              Registrar pagamento
                            </button>
                          )}
                          {finRole === 'fin_admin' && p.status === 'pago' && p.pagamentos && p.pagamentos.length > 0 && (
                            <button onClick={() => setModalPagamento(p)}
                              style={{ padding: '4px 12px', fontSize: 12, background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                              Ver pagamentos
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              })}
              {pedidos.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhum pedido cadastrado.</td></tr>
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

      {modalPagamento && (
        <ModalPagamento
          pedido={modalPagamento}
          onSalvar={(valor, data) => registrarPagamento(modalPagamento.id, valor, data)}
          onEditarPagamento={(pagamentoId, valor, data) => editarPagamento(modalPagamento.id, pagamentoId, valor, data)}
          onExcluirPagamento={(pagamentoId) => excluirPagamento(modalPagamento.id, pagamentoId)}
          onFechar={() => setModalPagamento(null)}
        />
      )}
    </Layout>
  )
}
