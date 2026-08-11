import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
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

function formatData(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
}

function paraDataInput(data) {
  return data ? new Date(data).toISOString().split('T')[0] : ''
}

const PDF_COR_MARCA = [61, 107, 82]
const PDF_COR_DEVEDOR = [201, 79, 63]
const PDF_COR_DEVEDOR_FUNDO = [250, 227, 223]
const PDF_COR_PAGO = [47, 138, 92]
const PDF_COR_PAGO_FUNDO = [216, 237, 226]
const PDF_COR_PENDENTE_FUNDO = [250, 235, 210]
const PDF_COR_PENDENTE = [161, 110, 26]
const PDF_COR_TEXTO = [40, 40, 40]
const PDF_COR_BORDA = [214, 214, 214]

function gerarResumoPDF(fornecedor, pedidos, pagamentos) {
  const doc = new jsPDF()
  const marginX = 14
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const colWidths = [20, 60, 20, 24, 30, 28]
  const colX = [marginX]
  colWidths.forEach((w, i) => colX.push(colX[i] + w))
  const tableWidth = colWidths.reduce((a, b) => a + b, 0)
  const rowH = 7
  let y = 20

  function quebrarPaginaSeNecessario(altura) {
    if (y + altura > pageHeight - 34) {
      doc.addPage()
      y = 20
      desenharCabecalhoTabela()
    }
  }

  function desenharCabecalhoTabela() {
    doc.setFillColor(...PDF_COR_MARCA)
    doc.rect(marginX, y, tableWidth, rowH, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(8)
    const titulos = ['DATA', 'PRODUTO', 'QTD.', 'R$ UNIT.', 'SALDO DEVEDOR', 'PAG. FEITO']
    titulos.forEach((titulo, i) => {
      const alinhado = i >= 2 ? 'right' : 'left'
      const posX = alinhado === 'right' ? colX[i + 1] - 2 : colX[i] + 2
      doc.text(titulo, posX, y + 4.7, { align: alinhado })
    })
    doc.setTextColor(...PDF_COR_TEXTO)
    y += rowH
  }

  function desenharLinha(colunas, opcoes = {}) {
    quebrarPaginaSeNecessario(rowH)
    if (opcoes.fundo) {
      doc.setFillColor(...opcoes.fundo)
      doc.rect(marginX, y, tableWidth, rowH, 'F')
    }
    doc.setDrawColor(...PDF_COR_BORDA)
    doc.rect(marginX, y, tableWidth, rowH, 'S')
    for (let i = 1; i < colX.length - 1; i++) {
      doc.line(colX[i], y, colX[i], y + rowH)
    }
    doc.setFontSize(8)
    doc.setFont(undefined, opcoes.negrito ? 'bold' : 'normal')
    colunas.forEach((texto, i) => {
      if (!texto) return
      doc.setTextColor(...(opcoes.cores?.[i] || PDF_COR_TEXTO))
      const alinhado = i >= 2 ? 'right' : 'left'
      const posX = alinhado === 'right' ? colX[i + 1] - 2 : colX[i] + 2
      doc.text(String(texto), posX, y + 4.7, { align: alinhado })
    })
    doc.setTextColor(...PDF_COR_TEXTO)
    y += rowH
  }

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(...PDF_COR_MARCA)
  doc.text('CRAVELLI', marginX, y)
  doc.setTextColor(...PDF_COR_TEXTO)
  y += 6
  doc.setFontSize(11)
  doc.text(`Resumo de Pedidos — ${fornecedor.nome}`, marginX, y)
  y += 5
  doc.setFontSize(8)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(130, 130, 130)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, marginX, y)
  doc.setTextColor(...PDF_COR_TEXTO)
  y += 8

  desenharCabecalhoTabela()

  const linhas = []
  pedidos.forEach(p => {
    if (p.itens && p.itens.length > 0) {
      p.itens.forEach(item => {
        linhas.push({
          tipo: 'item', data: p.data_pedido, produto: item.produto,
          quantidade: item.quantidade, valorUnitario: item.valor_unitario, valorTotal: item.valor_total
        })
      })
    } else {
      linhas.push({
        tipo: 'item', data: p.data_pedido, produto: p.descricao_produtos || 'Saldo devedor',
        quantidade: null, valorUnitario: null, valorTotal: p.valor_total
      })
    }
  })
  pagamentos.forEach(pg => {
    linhas.push({ tipo: 'pagamento', data: pg.data_pagamento, valor: pg.valor })
  })
  linhas.sort((a, b) => new Date(a.data) - new Date(b.data))

  let totalComprado = 0
  let totalPago = 0

  linhas.forEach(linha => {
    if (linha.tipo === 'item') {
      desenharLinha(
        [formatData(linha.data), linha.produto,
          linha.quantidade != null ? Number(linha.quantidade).toLocaleString('pt-BR') : '',
          linha.valorUnitario != null ? formatMoeda(linha.valorUnitario) : '',
          formatMoeda(linha.valorTotal), ''],
        { cores: { 4: PDF_COR_DEVEDOR } }
      )
      totalComprado += Number(linha.valorTotal)
    } else {
      desenharLinha(
        [formatData(linha.data), 'PAGAMENTO REALIZADO', '', '', '', formatMoeda(linha.valor)],
        { fundo: PDF_COR_PAGO_FUNDO, negrito: true, cores: { 1: PDF_COR_PAGO, 5: PDF_COR_PAGO } }
      )
      totalPago += Number(linha.valor)
    }
  })

  y += 8
  quebrarPaginaSeNecessario(24)

  const gap = 6
  const boxW = (tableWidth - gap * 2) / 3
  const boxH = 18

  function caixaResumo(x, label, valor, corFundo, corTexto) {
    doc.setFillColor(...corFundo)
    doc.rect(x, y, boxW, boxH, 'F')
    doc.setTextColor(...corTexto)
    doc.setFont(undefined, 'bold')
    doc.setFontSize(8)
    doc.text(label, x + boxW / 2, y + 7, { align: 'center' })
    doc.setFontSize(12)
    doc.text(formatMoeda(valor), x + boxW / 2, y + 14, { align: 'center' })
    doc.setTextColor(...PDF_COR_TEXTO)
  }

  caixaResumo(marginX, 'TOTAL COMPRADO', totalComprado, PDF_COR_PENDENTE_FUNDO, PDF_COR_PENDENTE)
  caixaResumo(marginX + boxW + gap, 'TOTAL PAGO', totalPago, PDF_COR_PAGO_FUNDO, PDF_COR_PAGO)
  caixaResumo(marginX + (boxW + gap) * 2, 'SALDO DEVEDOR', totalComprado - totalPago, PDF_COR_DEVEDOR_FUNDO, PDF_COR_DEVEDOR)

  const nomeArquivo = `resumo-${(fornecedor.apelido || fornecedor.nome).toLowerCase().replace(/\s+/g, '-')}.pdf`
  doc.save(nomeArquivo)
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
  const [data, setData] = useState(paraDataInput(pagamento.data_pagamento))
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
      <span>{formatData(pagamento.data_pagamento)}</span>
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

function PainelPagamentosFornecedor({ pagamentos, saldoAberto, podeEditar, onRegistrar, onEditar, onExcluir }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
          Pagamentos{pagamentos.length ? ` (${pagamentos.length})` : ''}
        </span>
        <span style={{ fontSize: 13 }}>
          Saldo devedor: <strong>{formatMoeda(saldoAberto)}</strong>
        </span>
      </div>

      {pagamentos.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {pagamentos.map(pg => (
            <LinhaPagamento key={pg.id} pagamento={pg} onEditar={onEditar} onExcluir={onExcluir} />
          ))}
        </div>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>Nenhum pagamento registrado ainda.</p>
      )}

      {podeEditar && saldoAberto > 0 && !mostrarForm && (
        <button onClick={() => setMostrarForm(true)}
          style={{ padding: '4px 12px', fontSize: 12, background: 'var(--color-success-solid)', color: 'var(--color-on-success)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
          + Registrar pagamento
        </button>
      )}

      {podeEditar && saldoAberto > 0 && mostrarForm && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Valor (R$)<br />
            <input required type="number" step="0.01" min="0.01" max={saldoAberto}
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

function ItemCells({ item, onEditar, onExcluir }) {
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

  async function excluir() {
    if (!confirm(`Excluir o produto "${item.produto}"?`)) return
    setLoading(true)
    try {
      await onExcluir()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao excluir produto.')
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
        <div style={{ display: 'flex', gap: 4 }}>
          {onEditar && (
            <button onClick={() => setEditando(true)} title="Editar produto" disabled={loading}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.6, padding: 2 }}>
              ✏️
            </button>
          )}
          {onExcluir && (
            <button onClick={excluir} title="Excluir produto" disabled={loading}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.6, padding: 2 }}>
              🗑️
            </button>
          )}
        </div>
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

function DataEditavel({ pedido, onEditar }) {
  const [editando, setEditando] = useState(false)
  const [data, setData] = useState(paraDataInput(pedido.data_pedido))
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  async function salvar() {
    setErro(null)
    setLoading(true)
    try {
      await onEditar(data)
      setEditando(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao editar data.')
    } finally {
      setLoading(false)
    }
  }

  if (editando) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, width: 140 }} />
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{formatData(pedido.data_pedido)}</span>
      {onEditar && (
        <button onClick={() => setEditando(true)} title="Editar data"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>
          ✏️
        </button>
      )}
    </div>
  )
}

function AdicionarItemForm({ onAdicionar }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [produto, setProduto] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await onAdicionar(produto, parseFloat(quantidade), parseFloat(valorUnitario))
      setProduto('')
      setQuantidade('')
      setValorUnitario('')
      setMostrarForm(false)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao adicionar produto.')
    } finally {
      setLoading(false)
    }
  }

  if (!mostrarForm) {
    return (
      <button onClick={() => setMostrarForm(true)}
        style={{ padding: '4px 12px', fontSize: 12, background: 'transparent', color: 'var(--color-accent-solid)', border: '1px solid var(--color-accent-solid)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
        + Adicionar produto
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12 }}>Produto<br />
        <input required value={produto} onChange={e => setProduto(e.target.value)}
          style={{ ...inputStyle, marginTop: 4, width: 180 }} />
      </label>
      <label style={{ fontSize: 12 }}>Quantidade<br />
        <input required type="number" step="0.01" min="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value)}
          style={{ ...inputStyle, marginTop: 4, width: 100 }} />
      </label>
      <label style={{ fontSize: 12 }}>Valor unit. (R$)<br />
        <input required type="number" step="0.01" min="0" value={valorUnitario} onChange={e => setValorUnitario(e.target.value)}
          style={{ ...inputStyle, marginTop: 4, width: 100 }} />
      </label>
      <button type="submit" disabled={loading}
        style={{ padding: '8px 16px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
        {loading ? 'Salvando...' : 'Adicionar'}
      </button>
      <button type="button" onClick={() => setMostrarForm(false)}
        style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text)' }}>
        Cancelar
      </button>
      {erro && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{erro}</p>}
    </form>
  )
}

const ITEM_VAZIO = { produto: '', quantidade: '', valor_unitario: '' }

export default function Fornecedores() {
  const { finRole } = useAuth()
  const [fornecedores, setFornecedores] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [pagamentos, setPagamentos] = useState([])
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
    const [rPedidos, rPagamentos] = await Promise.all([
      api.get(`/api/fornecedores/${f.id}/pedidos`),
      api.get(`/api/fornecedores/${f.id}/pagamentos`)
    ])
    setPedidos(rPedidos.data)
    setPagamentos(rPagamentos.data)
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

  async function recarregarDados() {
    const [rPedidos, rPagamentos, rFornecedores] = await Promise.all([
      api.get(`/api/fornecedores/${fornecedorSel.id}/pedidos`),
      api.get(`/api/fornecedores/${fornecedorSel.id}/pagamentos`),
      api.get('/api/fornecedores')
    ])
    setPedidos(rPedidos.data)
    setPagamentos(rPagamentos.data)
    setFornecedores(rFornecedores.data)
    const atualizado = rFornecedores.data.find(f => f.id === fornecedorSel.id)
    if (atualizado) setFornecedorSel(atualizado)
  }

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
      await recarregarDados()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar pedido.')
    }
  }

  async function registrarPagamentoFornecedor(valor, dataPagamento) {
    await api.post(`/api/fornecedores/${fornecedorSel.id}/pagamentos`, {
      valor, data_pagamento: dataPagamento
    })
    await recarregarDados()
  }

  async function editarPagamentoFornecedor(pagamentoId, valor, dataPagamento) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pagamentos/${pagamentoId}`, {
      valor, data_pagamento: dataPagamento
    })
    await recarregarDados()
  }

  async function excluirPagamentoFornecedor(pagamentoId) {
    await api.delete(`/api/fornecedores/${fornecedorSel.id}/pagamentos/${pagamentoId}`)
    await recarregarDados()
  }

  async function editarItem(pedidoId, itemId, produto, quantidade, valorUnitario) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/itens/${itemId}`, {
      produto, quantidade, valor_unitario: valorUnitario
    })
    await recarregarDados()
  }

  async function editarValorTotal(pedidoId, valorTotal) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}`, { valor_total: valorTotal })
    await recarregarDados()
  }

  async function excluirItem(pedidoId, itemId) {
    await api.delete(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/itens/${itemId}`)
    await recarregarDados()
  }

  async function excluirPedido(pedidoId) {
    if (!confirm('Excluir este pedido inteiro? Essa ação não pode ser desfeita.')) return
    try {
      await api.delete(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}`)
      await recarregarDados()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao excluir pedido.')
    }
  }

  async function adicionarProdutoAoPedido(pedidoId, produto, quantidade, valorUnitario) {
    await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}/itens`, {
      produto, quantidade, valor_unitario: valorUnitario
    })
    await recarregarDados()
  }

  async function editarDataPedido(pedidoId, dataPedido) {
    await api.put(`/api/fornecedores/${fornecedorSel.id}/pedidos/${pedidoId}`, { data_pedido: dataPedido })
    await recarregarDados()
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
      if (fornecedorSel?.id === f.id) { setFornecedorSel(null); setPedidos([]); setPagamentos([]) }
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => gerarResumoPDF(fornecedorSel, pedidos, pagamentos)}
                disabled={pedidos.length === 0 && pagamentos.length === 0}
                style={{ padding: '8px 20px', background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: (pedidos.length === 0 && pagamentos.length === 0) ? 'not-allowed' : 'pointer', opacity: (pedidos.length === 0 && pagamentos.length === 0) ? 0.5 : 1 }}>
                📄 Baixar PDF
              </button>
              {finRole === 'fin_admin' && (
                <button onClick={() => setShowForm(!showForm)}
                  style={{ padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                  + Novo pedido
                </button>
              )}
            </div>
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
                {['Data', 'Produto', 'Quantidade', 'Valor unitário', 'Valor total', ''].map((h, i) => (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <DataEditavel pedido={p}
                            onEditar={finRole === 'fin_admin' ? (dataPedido) => editarDataPedido(p.id, dataPedido) : null} />
                          {finRole === 'fin_admin' && (
                            <button onClick={() => excluirPedido(p.id)} title="Excluir pedido"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {item ? (
                      <ItemCells item={item}
                        onEditar={finRole === 'fin_admin' ? (produto, quantidade, valorUnitario) => editarItem(p.id, item.id, produto, quantidade, valorUnitario) : null}
                        onExcluir={finRole === 'fin_admin' ? () => excluirItem(p.id, item.id) : null} />
                    ) : (
                      <>
                        <td colSpan={3} style={{ padding: '10px 16px', color: 'var(--color-text-muted)' }}>{p.descricao_produtos || '—'}</td>
                        <td colSpan={2} style={{ padding: '10px 16px' }}>
                          <ValorTotalEditavel pedido={p}
                            onEditar={finRole === 'fin_admin' ? (valorTotal) => editarValorTotal(p.id, valorTotal) : null} />
                        </td>
                      </>
                    )}
                  </tr>
                ))
                return [
                  ...linhasItens,
                  itens.length > 1 && itens[0] && (
                    <tr key={`${p.id}-total`} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td colSpan={4} />
                      <td style={{ padding: '10px 16px', fontWeight: 700 }}>Total do pedido: {formatMoeda(p.valor_total)}</td>
                      <td />
                    </tr>
                  ),
                  finRole === 'fin_admin' && (
                    <tr key={`${p.id}-add-item`} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td colSpan={6} style={{ padding: '8px 16px' }}>
                        <AdicionarItemForm
                          onAdicionar={(produto, quantidade, valorUnitario) => adicionarProdutoAoPedido(p.id, produto, quantidade, valorUnitario)} />
                      </td>
                    </tr>
                  )
                ]
              })}
              {pedidos.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhum pedido cadastrado.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 32 }}>
            <h2 style={{ marginBottom: 16 }}>Pagamentos — {fornecedorSel.nome}</h2>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
              <PainelPagamentosFornecedor
                pagamentos={pagamentos}
                saldoAberto={fornecedorSel.saldo_aberto}
                podeEditar={finRole === 'fin_admin'}
                onRegistrar={registrarPagamentoFornecedor}
                onEditar={editarPagamentoFornecedor}
                onExcluir={excluirPagamentoFornecedor}
              />
            </div>
          </div>
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
