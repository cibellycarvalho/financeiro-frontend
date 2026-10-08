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
 *   - só `fin_admin` cria conta e marca como paga;
 *   - conta importada do banco (origem 'dda') fica marcada, porque é registro
 *     do banco e não lançamento manual. A importação em si saiu junto com o
 *     Pluggy em 08/09/2026; o selo continua porque as linhas antigas seguem lá;
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
import { TIPOS, validarArquivo, mensagemDe, abrirAnexo } from '../components/upload/comum'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// O Flask manda "Mon, 14 Sep 2026 00:00:00 GMT"; somar 'T00:00:00' nisso dava
// "Invalid Date". Lido em UTC para o dia não voltar um no horário de Brasília.
const dia = d => {
  if (!d) return '—'
  const s = String(d)
  const data = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : new Date(s)
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

const PERIODOS = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mês' },
  { id: 'todos', label: 'Todas' },
]

const entrada = {
  width: '100%', padding: '7px 9px', background: 'var(--color-bg)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
}

const FORM_VAZIO = { descricao: '', categoria: 'IMPOSTO_DAS', valor: '', vencimento: '', marca: 'GERAL', observacao: '' }

// O Flask manda a data como "Mon, 14 Sep 2026 00:00:00 GMT"; o campo de data só
// aceita ano-mês-dia. Lido em UTC pelo mesmo motivo de `dia` acima.
const paraInputData = d => {
  if (!d) return ''
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const data = new Date(s)
  return Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10)
}

// O campo de valor é texto de propósito: <input type="number"> não entende
// "54.520,00" e mandava o valor antigo sem avisar (08/10/2026). Aceita o jeito
// brasileiro (ponto de milhar, vírgula decimal) e também "54.52" / "54520.5".
export function lerValor(texto) {
  const t = String(texto ?? '').replace(/R\$|\s/g, '')
  if (!t) return null
  let n
  if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '')
  else n = t
  if (!/^\d+(\.\d+)?$/.test(n)) return null
  return Number(n)
}

const valorParaCampo = v => (v === null || v === undefined || v === '')
  ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  const [form, setForm] = useState(FORM_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [erro, setErro] = useState(null)

  async function carregar() {
    const params = periodo === 'todos' ? '' : `?periodo=${periodo}`
    const r = await api.get(`/api/contas${params}`)
    setContas(r.data)
  }

  useEffect(() => { carregar() }, [periodo])

  function fecharForm() {
    setShowForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO)
  }

  function abrirNova() {
    if (showForm && !editandoId) { fecharForm(); return }
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setErro(null)
    setShowForm(true)
  }

  function editar(c) {
    setEditandoId(c.id)
    setForm({
      descricao: c.descricao || '', categoria: c.categoria, valor: valorParaCampo(c.valor),
      vencimento: paraInputData(c.vencimento), marca: c.marca, observacao: c.observacao || '',
    })
    setErro(null)
    setShowForm(true)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    const valor = lerValor(form.valor)
    if (valor === null) { setErro('Valor inválido. Digite assim: 54.520,00'); return }
    const corpo = { ...form, valor }
    try {
      if (editandoId) await api.put(`/api/contas/${editandoId}`, corpo)
      else await api.post('/api/contas', corpo)
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui salvar a conta.'))
      return
    }
    fecharForm()
    carregar()
  }

  // Exclusão é definitiva (o servidor apaga a linha), por isso pede confirmação
  // mostrando qual conta é. Se a conta estava aberta no formulário de edição,
  // o formulário fecha junto para não salvar em cima de uma conta que não existe.
  async function excluir(c) {
    if (!confirm(`Excluir "${c.descricao}" (${brl(c.valor)}, vence ${dia(c.vencimento)})? Isso não pode ser desfeito.`)) return
    setErro(null)
    try {
      await api.delete(`/api/contas/${c.id}`)
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui excluir a conta.'))
      return
    }
    if (editandoId === c.id) fecharForm()
    carregar()
  }

  async function marcarPago(id) {
    const hoje = new Date().toISOString().split('T')[0]
    await api.put(`/api/contas/${id}`, { status: 'pago', data_pagamento: hoje })
    carregar()
  }

  // Nota fiscal e comprovante nunca são obrigatórios: é só um upload à parte,
  // no mesmo padrão do clipe de nota fiscal da compra do fornecedor (Task 6).
  async function subirAnexoConta(conta, tipo, arquivo) {
    if (!arquivo) return
    const invalido = validarArquivo(arquivo)
    if (invalido) { setErro(invalido); return }
    const jaTem = tipo === 'nf' ? conta.nf_path : conta.comprovante_path
    if (jaTem && !confirm('Já tem arquivo aqui. Substituir?')) return
    setErro(null)
    const corpo = new FormData()
    corpo.append('arquivo', arquivo)
    try {
      await api.post(`/api/contas/${conta.id}/anexo/${tipo}`, corpo,
        { headers: { 'Content-Type': 'multipart/form-data' } })
      await carregar()
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui guardar o arquivo.'))
    }
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
            <button onClick={abrirNova} style={botao(true)}>
              + Nova conta
            </button>
          </div>
        )}
      />

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
            <input required type="text" inputMode="decimal" placeholder="0,00" value={form.valor}
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
          {editandoId && (
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 13, fontWeight: 600 }}>Editando conta</p>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={fecharForm} style={botao()}>Cancelar</button>
            <button type="submit" style={botao(true)}>Salvar</button>
          </div>
        </form>
      )}

      {erro && (
        <p style={{
          margin: '0 0 14px', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-danger)', color: 'var(--color-danger)', fontSize: 13,
        }}>{erro}</p>
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

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <label style={{ cursor: 'pointer', fontSize: 12.5, opacity: c.nf_path ? 1 : 0.6, whiteSpace: 'nowrap' }}
                title={c.nf_path ? 'Substituir nota fiscal' : 'Anexar nota fiscal'}>
                🧾 {c.nf_path ? 'Nota fiscal' : 'Nota fiscal (sem)'}
                <input
                  type="file"
                  data-testid={`nf-${c.id}`}
                  accept={TIPOS}
                  style={{ display: 'none' }}
                  onChange={e => { const arquivo = e.target.files[0]; e.target.value = ''; subirAnexoConta(c, 'nf', arquivo) }}
                />
              </label>
              {c.nf_path && (
                <button onClick={() => abrirAnexo(`/api/contas/${c.id}/anexo/nf`)} title="Ver nota fiscal"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.7, padding: 0 }}>
                  👁️
                </button>
              )}
            </span>

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <label style={{ cursor: 'pointer', fontSize: 12.5, opacity: c.comprovante_path ? 1 : 0.6, whiteSpace: 'nowrap' }}
                title={c.comprovante_path ? 'Substituir comprovante' : 'Anexar comprovante'}>
                📄 {c.comprovante_path ? 'Comprovante' : 'Comprovante (sem)'}
                <input
                  type="file"
                  data-testid={`comprovante-${c.id}`}
                  accept={TIPOS}
                  style={{ display: 'none' }}
                  onChange={e => { const arquivo = e.target.files[0]; e.target.value = ''; subirAnexoConta(c, 'comprovante', arquivo) }}
                />
              </label>
              {c.comprovante_path && (
                <button onClick={() => abrirAnexo(`/api/contas/${c.id}/anexo/comprovante`)} title="Ver comprovante"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.7, padding: 0 }}>
                  👁️
                </button>
              )}
            </span>

            {ehAdmin && (
              <button onClick={() => editar(c)} title="Editar esta conta" style={{
                ...botao(), padding: '4px 12px', fontSize: 12,
              }}>Editar</button>
            )}

            {ehAdmin && c.status !== 'pago' && (
              <button onClick={() => marcarPago(c.id)} style={{
                ...botao(), padding: '4px 12px', fontSize: 12,
                background: 'var(--color-success-solid)', color: 'var(--color-on-success)',
                border: 'none',
              }}>Marcar pago</button>
            )}

            {ehAdmin && (
              <button onClick={() => excluir(c)} title="Excluir esta conta" style={{
                ...botao(), padding: '4px 12px', fontSize: 12,
                color: 'var(--color-danger)', borderColor: 'var(--color-danger)',
              }}>Excluir</button>
            )}
          </div>
        ))}
      </SecaoCard>
    </Layout>
  )
}
