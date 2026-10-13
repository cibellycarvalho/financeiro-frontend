/**
 * Devoluções ao fornecedor (05/10/2026): abatem o "Ainda devo" sem ser pagamento —
 * não entram em "Pago no mês". Pode apontar para um pedido (opcional) e levar
 * uma descrição.
 *
 * "Como voltou" (13/10/2026): 'dinheiro' = o fornecedor devolveu por Pix, então
 * o valor entra na Caixa da Semana; 'credito' (padrão, e como tudo já era antes)
 * só abate o "Ainda devo".
 */
import { useEffect, useState } from 'react'
import api from '../services/api'
import { lerValor } from '../pages/ContasPagar'
import { botaoPrimario, botaoSecundario, inputStyle, formatData, formatMoeda, mensagemDe } from './upload/comum'

const hoje = () => new Date().toISOString().slice(0, 10)
const FORMAS = { dinheiro: '💸 Dinheiro de volta', credito: '🏷️ Crédito' }
const paraTexto = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DevolucoesFornecedor({ fornecedorId, pedidos = [], podeEditar, aoMudar }) {
  const [lista, setLista] = useState([])
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [forma, setForma] = useState('credito')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hoje())
  const [pedidoId, setPedidoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    try {
      const r = await api.get(`/api/fornecedores/${fornecedorId}/devolucoes`)
      setLista(r.data)
    } catch {
      setErro('Não consegui carregar as devoluções.')
    }
  }
  useEffect(() => { carregar() }, [fornecedorId])  // eslint-disable-line react-hooks/exhaustive-deps

  function fechar() {
    setAberto(false); setEditandoId(null); setForma('credito')
    setValor(''); setData(hoje()); setPedidoId(''); setDescricao(''); setErro(null)
  }

  function editar(d) {
    setEditandoId(d.id); setForma(d.forma || 'credito'); setValor(paraTexto(d.valor))
    setData(String(d.data_devolucao).slice(0, 10)); setPedidoId(d.pedido_id || ''); setDescricao(d.descricao || '')
    setErro(null); setAberto(true)
  }

  async function salvar() {
    setErro(null)
    const v = lerValor(valor)
    if (!(v > 0)) { setErro('Informe o valor da devolução.'); return }
    setSalvando(true)
    try {
      const corpo = { valor: v, data_devolucao: data, pedido_id: pedidoId || null, descricao, forma }
      if (editandoId) await api.put(`/api/fornecedores/${fornecedorId}/devolucoes/${editandoId}`, corpo)
      else await api.post(`/api/fornecedores/${fornecedorId}/devolucoes`, corpo)
      fechar()
      await carregar()
      if (aoMudar) await aoMudar()
    } catch (err) {
      setErro(mensagemDe(err, 'Erro ao registrar a devolução.'))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(d) {
    if (!confirm(`Apagar a devolução de ${formatMoeda(d.valor)}? O "Ainda devo" volta a subir esse valor.`)) return
    try {
      await api.delete(`/api/fornecedores/${fornecedorId}/devolucoes/${d.id}`)
      await carregar()
      if (aoMudar) await aoMudar()
    } catch (err) {
      setErro(mensagemDe(err, 'Erro ao apagar a devolução.'))
    }
  }

  const somar = f => lista.filter(d => (d.forma || 'credito') === f).reduce((s, d) => s + Number(d.valor || 0), 0)
  const totalDinheiro = somar('dinheiro')
  const totalCredito = somar('credito')
  if (lista.length === 0 && !podeEditar) return null

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Abatem o "Ainda devo". Só a devolução em dinheiro entra no caixa; o crédito não.
        </span>
        <span style={{ fontSize: 13 }}>
          <span>Voltou em dinheiro: <strong>{formatMoeda(totalDinheiro)}</strong></span>
          {' · '}
          <span>Virou crédito: <strong>{formatMoeda(totalCredito)}</strong></span>
        </span>
      </div>

      {lista.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {lista.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
              <span>
                {formatData(d.data_devolucao)}
                {' · '}<span>{FORMAS[d.forma || 'credito']}</span>
                {d.numero_pedido ? ` · pedido ${d.numero_pedido}` : ''}
                {d.descricao ? ` · ${d.descricao}` : ''}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>− {formatMoeda(d.valor)}</strong>
                {podeEditar && (
                  <button onClick={() => editar(d)} title="Editar"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>✏️</button>
                )}
                {podeEditar && (
                  <button onClick={() => excluir(d)} title="Excluir"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 2 }}>🗑️</button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-muted)' }}>Nenhuma devolução registrada.</p>
      )}

      {podeEditar && !aberto && (
        <button onClick={() => setAberto(true)} style={{ ...botaoSecundario, padding: '4px 12px', fontSize: 12 }}>
          + Registrar devolução
        </button>
      )}

      {podeEditar && aberto && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <label style={{ fontSize: 12 }}>Como voltou
            <select value={forma} onChange={e => setForma(e.target.value)} style={inputStyle}>
              <option value="dinheiro">Dinheiro de volta (Pix/transferência) — entra no caixa</option>
              <option value="credito">Crédito para a próxima compra — só abate o "Ainda devo"</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Valor devolvido (R$)
            <input type="text" inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>Data
            <input type="date" value={data} onChange={e => setData(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>Pedido (opcional)
            <select value={pedidoId} onChange={e => setPedidoId(e.target.value)} style={inputStyle}>
              <option value="">— nenhum / não sei —</option>
              {pedidos.map(p => (
                <option key={p.id} value={p.id}>
                  {formatData(p.data_pedido)} · {p.numero_pedido ? `nº ${p.numero_pedido} · ` : ''}{formatMoeda(p.valor_total)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>Descrição (opcional)
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} style={inputStyle} />
          </label>
          {erro && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={salvar} disabled={salvando} style={{ ...botaoPrimario, opacity: salvando ? 0.6 : 1 }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button onClick={fechar} disabled={salvando} style={botaoSecundario}>Cancelar</button>
          </div>
        </div>
      )}
      {!aberto && erro && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '8px 0 0' }}>{erro}</p>}
    </div>
  )
}
