/**
 * Repasses ML — o que o Mercado Livre depositou e o que ele cobrou.
 *
 * Reformulada em 21/08/2026 no sistema visual descrito em
 * docs/superpowers/specs/2026-08-21-painel-sistema-visual-design.md.
 *
 * Os quatro números do topo formam uma conta encadeada — repasse bruto, menos
 * cobranças, menos contas pagas, resulta no saldo. Antes eram quatro cartões
 * soltos com cores fixas, e a relação entre eles ficava só na cabeça de quem
 * já sabia. Agora cada um diz o seu papel, e o saldo mostra a conta inteira.
 *
 * A cor do saldo passou a seguir o sinal. Estava fixa em verde — mesmo defeito
 * que o "Saldo disponível" da Visão da Semana tinha, e pela mesma razão.
 *
 * Preservado por ser comportamento: só `fin_admin` sincroniza com o Mercado
 * Pago e lança à mão; o sinal (+/−) do lançamento vem do tipo, não do valor.
 */
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import Indicador from '../components/Indicador'
import SecaoCard from '../components/SecaoCard'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

/** Anda `passo` meses a partir de "YYYY-MM". */
function deslocarMes(mes, passo) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + passo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function RepasesML() {
  const { finRole } = useAuth()
  const ehAdmin = finRole === 'fin_admin'

  const [repasses, setRepasses] = useState([])
  const [saldo, setSaldo] = useState(null)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [contaFiltro, setContaFiltro] = useState('YUSO')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'repasse', valor: '', data_referencia: '', conta_ml: 'YUSO', descricao: '' })
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  async function carregar() {
    const [r, s] = await Promise.all([
      api.get(`/api/repasses?mes=${mes}&conta_ml=${contaFiltro}`),
      api.get(`/api/repasses/saldo?mes=${mes}`),
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
    setForm({ tipo: 'repasse', valor: '', data_referencia: '', conta_ml: 'YUSO', descricao: '' })
    carregar()
  }

  const nEntradas = repasses.filter(r => r.tipo === 'repasse').length
  const nSaidas = repasses.length - nEntradas

  return (
    <Layout>
      <PaginaHeader
        titulo="Repasses ML"
        subtitulo="O que o Mercado Livre depositou e o que ele cobrou no mês."
        acao={ehAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sincronizarMP} disabled={syncLoading}
                    style={{ ...botao(), opacity: syncLoading ? 0.6 : 1 }}>
              {syncLoading ? 'Sincronizando…' : '↻ Sincronizar MP'}
            </button>
            <button onClick={() => setShowForm(!showForm)} style={botao(true)}>
              + Lançar repasse
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

      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mês</span>
        <button style={{ ...botao(), padding: '5px 11px' }} title="Mês anterior"
                onClick={() => setMes(m => deslocarMes(m, -1))}>‹</button>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
               style={{ ...entrada, width: 'auto' }} />
        <button style={{ ...botao(), padding: '5px 11px' }} title="Mês seguinte"
                onClick={() => setMes(m => deslocarMes(m, 1))}>›</button>

        <span style={{
          borderLeft: '1px solid var(--color-border)', paddingLeft: 12,
          fontSize: 13, color: 'var(--color-text-muted)',
        }}>
          Conta ML{' '}
          <select value={contaFiltro} onChange={e => setContaFiltro(e.target.value)}
                  style={{ ...entrada, width: 'auto' }}>
            <option value="YUSO">YUSO</option>
            <option value="M12">M12</option>
          </select>
        </span>
      </div>

      {saldo && (
        <div style={{
          display: 'grid', gap: 14, marginBottom: 22,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          <Indicador rotulo="Repasse bruto" valor={saldo.repasses_bruto}
                     composicao="O que o ML depositou no mês" />
          <Indicador rotulo="Cobranças ML" valor={saldo['cobranças_ml']} tom="divida"
                     composicao="Tarifas e cobranças descontadas" />
          <Indicador rotulo="Contas pagas" valor={saldo.contas_pagas} tom="divida"
                     composicao="Contas quitadas com esse dinheiro" />
          <Indicador rotulo="Saldo disponível" valor={saldo.saldo_disponivel} tom="auto"
                     composicao={
                       `${brl(saldo.repasses_bruto)} − ${brl(saldo['cobranças_ml'])} ` +
                       `− ${brl(saldo.contas_pagas)}`
                     } />
        </div>
      )}

      {showForm && ehAdmin && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 20,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
        }}>
          <label style={{ fontSize: 13 }}>Tipo<br />
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={entrada}>
              {['repasse', 'cobranca', 'tarifa'].map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>Conta ML<br />
            <select value={form.conta_ml} onChange={e => setForm({ ...form, conta_ml: e.target.value })} style={entrada}>
              {['YUSO', 'M12'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>Valor (R$)<br />
            <input required type="number" step="0.01" value={form.valor}
                   onChange={e => setForm({ ...form, valor: e.target.value })} style={entrada} />
          </label>
          <label style={{ fontSize: 13 }}>Data<br />
            <input required type="date" value={form.data_referencia}
                   onChange={e => setForm({ ...form, data_referencia: e.target.value })} style={entrada} />
          </label>
          <label style={{ fontSize: 13, gridColumn: '1 / -1' }}>Descrição<br />
            <input value={form.descricao}
                   onChange={e => setForm({ ...form, descricao: e.target.value })} style={entrada} />
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowForm(false)} style={botao()}>Cancelar</button>
            <button type="submit" style={botao(true)}>Salvar</button>
          </div>
        </form>
      )}

      <SecaoCard
        titulo="Movimentações do mês"
        subtitulo={repasses.length
          ? `${nEntradas} ${nEntradas === 1 ? 'entrada' : 'entradas'} e ${nSaidas} ${nSaidas === 1 ? 'saída' : 'saídas'} nesta conta.`
          : 'Entradas e saídas registradas nesta conta.'}
      >
        {repasses.length === 0 && (
          <p style={{
            margin: 0, padding: '18px 4px', textAlign: 'center',
            fontSize: 13, color: 'var(--color-text-muted)',
          }}>Nenhum lançamento para este mês.</p>
        )}

        {repasses.map(r => {
          const entrou = r.tipo === 'repasse'
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: 'var(--color-row)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
            }}>
              <span style={{
                flexShrink: 0, minWidth: 74, fontSize: 12, fontWeight: 600,
                color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums',
              }}>
                {r.data_referencia
                  ? new Date(r.data_referencia).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                  : '—'}
              </span>

              <span style={{
                padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, flexShrink: 0,
                background: entrou
                  ? 'color-mix(in srgb, var(--color-success) 18%, transparent)'
                  : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                color: entrou ? 'var(--color-success)' : 'var(--color-danger)',
              }}>{r.tipo}</span>

              <span style={{ flex: 1, minWidth: 160, fontSize: 14, color: 'var(--color-text-muted)' }}>
                {r.descricao || '—'}
              </span>

              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.conta_ml}</span>

              <span style={{
                fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: entrou ? 'var(--color-success)' : 'var(--color-danger)',
              }}>{entrou ? '+' : '−'}{brl(r.valor)}</span>
            </div>
          )
        })}
      </SecaoCard>
    </Layout>
  )
}
