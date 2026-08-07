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

function PainelPagamentos({ pedido, podeEditar, onRegistrar, onEditar, onExcluir }) {
  const saldoRestante = Number(pedido.valor_total) - Number(pedido.valor_pago)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [valor, setValor] = useState('')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await onRegistrar(parseFloat(valor), dataPagamento)
      setValor('')
      setMostrarForm(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao registrar pagamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
          Pagamentos{pedido.pagamentos?.length ? ` (${pedido.pagamentos.length})` : ''}
        </span>
        <span style={{ fontSize: 13 }}>
          Saldo restante: <strong>{formatMoeda(saldoRestante)}</strong>
        </span>
      </div>

      {pedido.pagamentos && pedido.pagamentos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {pedido.pagamentos.map(pg => (
            <LinhaPagamento key={pg.id} pagamento={pg} onEditar={onEditar} onExcluir={onExcluir} />
          ))}
        </div>
      )}

      {(!pedido.pagamentos || pedido.pagamentos.length === 0) && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-muted)' }}>Nenhum pagamento registrado ainda.</p>
      )}

      {podeEditar && saldoRestante > 0 && !mostrarForm && (
        <button onClick={() => setMostrarForm(true)}
          style={{ padding: '4px 12px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
          + Registrar pagamento
        </button>
      )}

      {podeEditar && saldoRestante > 0 && mostrarForm && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Valor (R$)<br />
            <input required type="number" step="0.01" min="0.01" max={saldoRestante}
              value={valor} onChange={e => setValor(e.target.value)}
              style={{ ...inputStyle, marginTop: 4, width: 130 }} />
          </label>
          <label style={{ fontSize: 12 }}>Data<br />
            <input required type="date" value={dataPagamento}
              onChange={e => setDataPagamento(e.target.value)}
              style={{ ...inputStyle, marginTop: 4, width: 150 }} />
          </label>
          <button type="submit" disabled={loading}
            style={{ padding: '8px 16px', background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            {loading ? 'Salvando...' : 'Registrar'}
          </button>
          <button type="button" onClick={() => setMostrarForm(false)}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text)' }}>
            Cancelar
          </button>
        </form>
      )}

      {erro && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '6px 0 0' }}>{erro}</p>}
    </div>
  )
}

function ItemCells({ item, onEditar }) {
  const [editando, setEditando] = useState(false)
  const [produto, setProduto] = useState(item.produto)
  const [quantidade, setQuantidade] = useState(item.quantidade)
  const [valorUnitario, setValorUnitario] = useState(item.valor_unitario)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  async function salvar() {
    setErro(null)
    setLoading(true)
    try {
      await onEditar(produto, parseFloat(quantidade), parseFloat(valorUnitario))
      setEditando(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao editar produto.')
    } finally {
      setLoading(false)
    }
  }

  if (editando) {
    return (
      <>
        <td style={{ padding: '10px 16px' }}>
          <input value={produto} onChange={e => setProduto(e.target.value)} style={{ ...inputStyle, marginTop: 0 }} />
        </td>
        <td style={{ padding: '10px 16px' }}>
          <input type="number" step="0.01" min="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={{ ...inputStyle, marginTop: 0 }} />
        </td>
        <td style={{ padding: '10px 16px' }}>
          <input type="number" step="0.01" min="0" value={valorUnitario} onChange={e => setValorUnitario(e.target.value)} style={{ ...inputStyle, marginTop: 0 }} />
        </td>
        <td style={{ padding: '10px 16px', fontWeight: 600 }}>
          {formatMoeda((parseFloat(quantidade) || 0) * (parseFloat(valorUnitario) || 0))}
        </td>
        <td style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={salvar} disabled={loading}
              style={{ padding: '4px 8px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              ✓
            </button>
            <button onClick={() => setEditando(false)} disabled={loading}
              style={{ padding: '4px 8px', fontSize: 12, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
          {erro && <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '4px 0 0' }}>{erro}</p>}
        </td>
      </>
    )
  }

  return (
    <>
      <td style={{ padding: '10px 16px' }}>{item.produto}</td>
      <td style={{ padding: '10px 16px' }}>{Number(item.quantidade).toLocaleString('pt-BR')}</td>
      <td style={{ padding: '10px 16px' }}>{formatMoeda(item.valor_unitario)}</td>
      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{formatMoeda(item.valor_total)}</td>
      <td style={{ padding: '10px 16px' }}>
        {onEditar && (
          <button onClick={() => setEditando(true)} title="Editar produto"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.6, padding: 2 }}>
            ✏️
          </button>
        )}
      </td>
    </>
  )
}

function ValorTotalEditavel({ pedido, onEditar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(pedido.valor_total)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  async function salvar() {
    setErro(null)
    setLoading(true)
    try {
      await onEditar(parseFloat(valor))
      setEditando(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao editar valor.')
    } finally {
      setLoading(false)
    }
  }

  if (editando) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, width: 130 }} />
          <button onClick={salvar} disabled={loading}
            style={{ padding: '4px 8px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            ✓
          </button>
          <button onClick={() => setEditando(false)} disabled={loading}
            style={{ padding: '4px 8px', fontSize: 12, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        {erro && <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '4px 0 0' }}>{erro}</p>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 600 }}>{formatMoeda(pedido.valor_total)}</span>
      {onEditar && (
        <button onClick={() => setEditando(true)} title="Editar valor"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.6, padding: 2 }}>
          ✏️
        </button>
      )}
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

  async function recarregarPedidos() {
    const r = await api.get(`/api/fornecedores/${fornecedorSel.id}/pedidos`)
    setPedidos(r.data)
  }

  async function registrarPagamento(pedidoId, valor, dataPagamento) {
    await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos`, {
      valor, data_pagamento: dataPagamento
    })
    await recarregarPedidos()
  }

  async function editarPagamento(pedidoId, pagamentoId, valor, dataPagamento) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos/${pagamentoId}`, {
      valor, data_pagamento: dataPagamento
    })
    await recarregarPedidos()
  }

  async function excluirPagamento(pedidoId, pagamentoId) {
    await api.delete(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/pagamentos/${pagamentoId}`)
    await recarregarPedidos()
  }

  async function editarItem(pedidoId, itemId, produto, quantidade, valorUnitario) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/itens/${itemId}`, {
      produto, quantidade, valor_unitario: valorUnitario
    })
    await recarregarPedidos()
  }

  async function editarValorTotal(pedidoId, valorTotal) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}`, { valor_total: valorTotal })
    await recarregarPedidos()
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
                {['Data', 'Produto', 'Quantidade', 'Valor unitário', 'Valor total', '', 'Status'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 16px', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.map(p => {
                const itens = p.itens && p.itens.length > 0 ? p.itens : [null]
                const linhasItens = itens.map((item, i) => (
                  <tr key={item ? item.id : p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    {i === 0 && (
                      <td rowSpan={itens.length} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                        {p.data_pedido ? new Date(p.data_pedido).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}
                      </td>
                    )}
                    {item ? (
                      <ItemCells item={item}
                        onEditar={finRole === 'fin_admin' ? (produto, quantidade, valorUnitario) => editarItem(p.id, item.id, produto, quantidade, valorUnitario) : null} />
                    ) : (
                      <>
                        <td colSpan={3} style={{ padding: '10px 16px', color: 'var(--color-text-muted)' }}>{p.descricao_produtos || '—'}</td>
                        <td colSpan={2} style={{ padding: '10px 16px' }}>
                          <ValorTotalEditavel pedido={p}
                            onEditar={finRole === 'fin_admin' ? (valorTotal) => editarValorTotal(p.id, valorTotal) : null} />
                        </td>
                      </>
                    )}
                    {i === 0 && (
                      <td rowSpan={itens.length} style={{ padding: '10px 16px', verticalAlign: 'top' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                          background: p.status === 'pago' ? 'color-mix(in srgb, var(--color-success) 18%, transparent)' : p.status === 'parcial' ? 'color-mix(in srgb, var(--color-warning) 18%, transparent)' : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                          color: p.status === 'pago' ? 'var(--color-success)' : p.status === 'parcial' ? 'var(--color-warning)' : 'var(--color-danger)'
                        }}>
                          {p.status}
                        </span>
                      </td>
                    )}
                  </tr>
                ))
                return [
                  ...linhasItens,
                  <tr key={`${p.id}-pagamentos`} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--color-bg)' }}>
                      <PainelPagamentos
                        pedido={p}
                        podeEditar={finRole === 'fin_admin'}
                        onRegistrar={(valor, data) => registrarPagamento(p.id, valor, data)}
                        onEditar={(pagamentoId, valor, data) => editarPagamento(p.id, pagamentoId, valor, data)}
                        onExcluir={(pagamentoId) => excluirPagamento(p.id, pagamentoId)}
                      />
                    </td>
                  </tr>
                ]
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

    </Layout>
  )
}
