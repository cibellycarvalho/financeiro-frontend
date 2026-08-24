/**
 * Contas a Pagar — o que vence, o que já venceu e o que já foi pago.
 *
 * Reformulada em 21/08/2026 no sistema visual descrito em
 * docs/superpowers/specs/2026-08-21-painel-sistema-visual-design.md.
 *
 * Ganho que não é de aparência: a tela não mostrava total nenhum. Dava para ver
 * a lista e não para saber quanto o período custa — a soma ficava na cabeça
 * dela. Os três indicadores no topo são calculados aqui mesmo, a partir da
 * lista que já vinha; nenhum campo novo foi pedido ao servidor.
 *
 * Preservado por ser comportamento:
 *   - só `fin_admin` cria conta, marca como paga e mexe no Sicredi;
 *   - conta importada do banco (origem 'dda') fica marcada, porque é registro
 *     do banco e não lançamento manual;
 *   - o filtro de período é do servidor (semana/mes/todos), não da tela.
 */
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import Indicador from '../components/Indicador'
import SecaoCard from '../components/SecaoCard'
import AlertaBadge from '../components/AlertaBadge'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

const PERIODOS = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mês' },
  { id: 'todos', label: 'Todas' },
]

const entrada = {
  width: '100%', padding: '7px 9px', background: 'var(--color-bg)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
}

const botao = (destaque = false) => ({
  padding: '7px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
  border: destaque ? 'none' : '1px solid var(--color-border)',
  background: destaque ? 'var(--color-accent-solid)' : 'transparent',
  color: destaque ? 'var(--color-on-accent)' : 'var(--color-text)',
})

function contar(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`
}

export default function ContasPagar() {
  const { finRole } = useAuth()
  const ehAdmin = finRole === 'fin_admin'

  const [contas, setContas] = useState([])
  const [periodo, setPeriodo] = useState('semana')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ descricao: '', categoria: 'IMPOSTO_DAS', valor: '', vencimento: '', marca: 'GERAL', observacao: '' })
  const [pluggyStatus, setPluggyStatus] = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [connectLoading, setConnectLoading] = useState(false)

  async function carregar() {
    const params = periodo === 'todos' ? '' : `?periodo=${periodo}`
    const r = await api.get(`/api/contas${params}`)
    setContas(r.data)
  }

  async function carregarPluggyStatus() {
    try {
      const r = await api.get('/api/pluggy/status')
      setPluggyStatus(r.data)
    } catch {
      setPluggyStatus({ conectado: false, items: [] })
    }
  }

  useEffect(() => { carregar() }, [periodo])
  useEffect(() => { carregarPluggyStatus() }, [])

  async function conectarSicredi() {
    setConnectLoading(true)
    setSyncMsg(null)
    try {
      const r = await api.post('/api/pluggy/connect-token')
      window.location.href = r.data.url
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Erro ao gerar link. Verifique as configurações do Pluggy no servidor.'
      setSyncMsg({ tipo: 'erro', texto: msg })
      setConnectLoading(false)
    }
  }

  async function sincronizarDDA() {
    setSyncLoading(true)
    setSyncMsg(null)
    try {
      const r = await api.post('/api/pluggy/sync')
      setSyncMsg({ tipo: 'ok', texto: `${r.data.sincronizados} lançamentos importados do Sicredi (${r.data.periodo}).` })
      await carregar()
    } catch (err) {
      setSyncMsg({ tipo: 'erro', texto: err.response?.data?.error || 'Erro ao sincronizar DDA.' })
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await api.post('/api/contas', { ...form, valor: parseFloat(form.valor) })
    setShowForm(false)
    setForm({ descricao: '', categoria: 'IMPOSTO_DAS', valor: '', vencimento: '', marca: 'GERAL', observacao: '' })
    carregar()
  }

  async function marcarPago(id) {
    const hoje = new Date().toISOString().split('T')[0]
    await api.put(`/api/contas/${id}`, { status: 'pago', data_pagamento: hoje })
    carregar()
  }

  // Somas da lista que já está na tela. O servidor não devolve totais e não
  // precisa: o filtro de período já aconteceu lá, então somar aqui dá o mesmo
  // número com uma chamada a menos.
  const soma = f => contas.filter(f).reduce((s, c) => s + Number(c.valor || 0), 0)
  const abertas = contas.filter(c => c.status !== 'pago')
  const vencidas = contas.filter(c => c.status === 'vencido')
  const pagas = contas.filter(c => c.status === 'pago')

  const rotuloPeriodo = PERIODOS.find(p => p.id === periodo)?.label.toLowerCase()

  return (
    <Layout>
      <PaginaHeader
        titulo="Contas a Pagar"
        subtitulo="O que vence, o que já venceu e o que já foi pago."
        acao={ehAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pluggyStatus?.conectado ? (
              <button onClick={sincronizarDDA} disabled={syncLoading}
                      style={{ ...botao(), opacity: syncLoading ? 0.6 : 1 }}>
                {syncLoading ? 'Sincronizando…' : '↻ Sync DDA Sicredi'}
              </button>
            ) : (
              <button onClick={conectarSicredi} disabled={connectLoading}
                      style={{ ...botao(), opacity: connectLoading ? 0.6 : 1 }}>
                {connectLoading ? 'Gerando link…' : '🔗 Conectar Sicredi'}
              </button>
            )}
            <button onClick={() => setShowForm(!showForm)} style={botao(true)}>
              + Nova conta
            </button>
          </div>
        )}
      />

      {syncMsg && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: 14,
          background: syncMsg.tipo === 'ok'
            ? 'color-mix(in srgb, var(--color-success) 18%, transparent)'
            : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
          color: syncMsg.tipo === 'ok' ? 'var(--color-success-dark)' : 'var(--color-danger)',
        }}>
          {syncMsg.texto}
        </div>
      )}

      {/* Filtro de período em pílulas, no padrão do Finco */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginRight: 4 }}>Período</span>
        {PERIODOS.map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
                  style={{
                    padding: '6px 16px', borderRadius: 99, cursor: 'pointer', fontSize: 13,
                    border: '1px solid var(--color-border)',
                    background: periodo === p.id ? 'var(--color-accent-solid)' : 'transparent',
                    color: periodo === p.id ? 'var(--color-on-accent)' : 'var(--color-text)',
                  }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid', gap: 14, marginBottom: 22,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        <Indicador
          rotulo="Em aberto"
          valor={soma(c => c.status !== 'pago')}
          tom="divida"
          composicao={`${contar(abertas.length, 'conta', 'contas')} · ${rotuloPeriodo}`}
        />
        <Indicador
          rotulo="Vencidas"
          valor={soma(c => c.status === 'vencido')}
          tom="divida"
          composicao={vencidas.length
            ? `${contar(vencidas.length, 'conta passou', 'contas passaram')} do vencimento`
            : 'Nenhuma conta atrasada'}
        />
        <Indicador
          rotulo="Já pagas"
          valor={soma(c => c.status === 'pago')}
          composicao={`${contar(pagas.length, 'conta quitada', 'contas quitadas')} · ${rotuloPeriodo}`}
        />
      </div>

      {showForm && ehAdmin && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 20,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
        }}>
          <label style={{ fontSize: 13 }}>Descrição<br />
            <input required value={form.descricao}
                   onChange={e => setForm({ ...form, descricao: e.target.value })} style={entrada} />
          </label>
          <label style={{ fontSize: 13 }}>Categoria<br />
            <select value={form.categoria}
                    onChange={e => setForm({ ...form, categoria: e.target.value })} style={entrada}>
              {['FORNECEDOR', 'CONTABILIDADE', 'IMPOSTO_DAS', 'SISTEMA', 'OUTRO'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>Valor (R$)<br />
            <input required type="number" step="0.01" value={form.valor}
                   onChange={e => setForm({ ...form, valor: e.target.value })} style={entrada} />
          </label>
          <label style={{ fontSize: 13 }}>Vencimento<br />
            <input required type="date" value={form.vencimento}
                   onChange={e => setForm({ ...form, vencimento: e.target.value })} style={entrada} />
          </label>
          <label style={{ fontSize: 13 }}>Marca<br />
            <select value={form.marca}
                    onChange={e => setForm({ ...form, marca: e.target.value })} style={entrada}>
              {['YUSO', 'M12', 'GERAL'].map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>Observação<br />
            <input value={form.observacao}
                   onChange={e => setForm({ ...form, observacao: e.target.value })} style={entrada} />
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowForm(false)} style={botao()}>Cancelar</button>
            <button type="submit" style={botao(true)}>Salvar</button>
          </div>
        </form>
      )}

      <SecaoCard
        titulo="Lançamentos"
        subtitulo="Da mais próxima do vencimento para a mais distante."
        total={contas.length ? brl(soma(() => true)) : undefined}
        totalRotulo={`Total · ${contar(contas.length, 'conta', 'contas')}`}
      >
        {contas.length === 0 && (
          <p style={{
            margin: 0, padding: '18px 4px', textAlign: 'center',
            fontSize: 13, color: 'var(--color-text-muted)',
          }}>Nenhuma conta encontrada neste período.</p>
        )}

        {contas.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            // Conta importada do banco fica com fundo próprio: é registro do
            // Sicredi, não lançamento que alguém digitou aqui.
            background: c.origem === 'dda'
              ? 'color-mix(in srgb, var(--color-accent) 10%, var(--color-row))'
              : 'var(--color-row)',
          }}>
            <span style={{
              flexShrink: 0, minWidth: 74, fontSize: 12, fontWeight: 600,
              color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums',
            }}>{dia(c.vencimento)}</span>

            <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}>
              {c.origem === 'dda' && (
                <span title="Importado do Sicredi via DDA" style={{
                  marginRight: 6, fontSize: 11, padding: '1px 6px', borderRadius: 99,
                  background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                  color: 'var(--color-accent)',
                }}>DDA</span>
              )}
              {c.descricao}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {c.categoria} · {c.marca}
              </span>
            </span>

            <span style={{
              fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            }}>{brl(c.valor)}</span>

            <AlertaBadge
              texto={c.status === 'a_confirmar' ? 'a confirmar' : c.status}
              tipo={c.status === 'vencido' ? 'error'
                : c.status === 'pago' ? 'ok'
                : c.status === 'a_confirmar' ? 'info' : 'warning'}
            />

            {ehAdmin && c.status !== 'pago' && (
              <button onClick={() => marcarPago(c.id)} style={{
                ...botao(), padding: '4px 12px', fontSize: 12,
                background: 'var(--color-success-solid)', color: 'var(--color-on-success)',
                border: 'none',
              }}>Marcar pago</button>
            )}
          </div>
        ))}
      </SecaoCard>
    </Layout>
  )
}
