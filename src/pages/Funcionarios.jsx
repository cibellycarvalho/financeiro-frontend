// src/pages/Funcionarios.jsx
// Funcionários (prestadores MEI): cartões com o nome, e dentro de cada um o
// mês de competência com três blocos — pagamento, DAS e NF. Não copia
// Fornecedores.jsx: a página é a cola entre blocos pequenos.
import { useEffect, useState, useCallback, useRef } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import BlocoLancamentoFuncionario from '../components/BlocoLancamentoFuncionario'
import UploadDocumentoFuncionario from '../components/UploadDocumentoFuncionario'
import { abrirAnexo, botaoPrimario, botaoSecundario, inputStyle, formatData, formatMoeda, mensagemDe } from '../components/upload/comum'
import { mesAtual, mesDe, rotuloMes } from '../lib/meses'

const ROTULO_FALTA = { pagamento: 'pagamento', das: 'DAS', nf: 'NF' }

/** "falta: DAS, NF" / "DAS em aberto, vence 20/10" / "mês completo ✓" */
export function resumoTexto(r) {
  if (!r) return ''
  const partes = []
  if (r.falta?.length) partes.push(`falta: ${r.falta.map(t => ROTULO_FALTA[t] || t).join(', ')}`)
  if (r.das_em_aberto) partes.push(`DAS em aberto${r.das_vencimento ? `, vence ${formatData(r.das_vencimento).slice(0, 5)}` : ''}`)
  return partes.length ? partes.join(' · ') : 'mês completo ✓'
}

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 50 }
const modalBox = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 24, width: 360, maxWidth: '92vw' }

function ModalFuncionario({ titulo, inicial, onSalvar, onFechar }) {
  const [nome, setNome] = useState(inicial?.nome || '')
  const [cnpj, setCnpj] = useState(inicial?.cnpj || '')
  const [valor, setValor] = useState(inicial?.valor_combinado ?? '')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setErro(null); setSalvando(true)
    try {
      await onSalvar({ nome, cnpj: cnpj || null, valor_combinado: valor === '' ? null : parseFloat(valor) })
      onFechar()
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui salvar.'))
    } finally {
      setSalvando(false)
    }
  }
  return (
    <div style={modalOverlay} onClick={onFechar}>
      <form style={modalBox} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>{titulo}</h2>
        <label style={{ fontSize: 12 }}>Nome<br /><input required value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} /></label>
        <label style={{ fontSize: 12, display: 'block', marginTop: 10 }}>CNPJ do MEI (opcional)<br /><input value={cnpj} onChange={e => setCnpj(e.target.value)} style={inputStyle} placeholder="só números" /></label>
        <label style={{ fontSize: 12, display: 'block', marginTop: 10 }}>Valor combinado por mês (opcional)<br /><input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} style={inputStyle} /></label>
        {erro && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onFechar} style={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} style={botaoPrimario}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}

export default function Funcionarios() {
  const { finRole } = useAuth()
  const podeEditar = finRole === 'fin_admin'
  const [funcionarios, setFuncionarios] = useState(null)
  const [sel, setSel] = useState(null)
  const [mes, setMes] = useState(mesAtual())
  const [linhas, setLinhas] = useState([])
  const [meses, setMeses] = useState([])
  // { tipo, arquivo, n } — cartão de conferência aberto. `n` é um contador que
  // sobe a cada onAbrir: o UploadDocumentoFuncionario lê o arquivo num efeito
  // que só roda na montagem, então precisa de uma key nova a cada abertura —
  // mesmo tipo e mesmo mês (ex.: reabrir "lançar à mão" depois de Cancelar).
  const [cartao, setCartao] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [erro, setErro] = useState(null)
  // Conta os pedidos de carregarMes para descartar respostas atrasadas: ao
  // trocar de mês rapidamente, a resposta de um mês antigo pode chegar depois
  // da do mês atual e não pode sobrescrever o que já está na tela.
  const pedidoAtual = useRef(0)

  const carregarFuncionarios = useCallback(async () => {
    try {
      const r = await api.get('/api/funcionarios')
      setErro(null)
      setFuncionarios(r.data)
      setSel(s => (s ? r.data.find(f => f.id === s.id) || null : s))
    } catch {
      setErro('Não consegui carregar os funcionários.')
    }
  }, [])

  const carregarMes = useCallback(async (f, m) => {
    const pedido = ++pedidoAtual.current
    setErro(null)
    try {
      const [rLinhas, rMeses] = await Promise.all([
        api.get(`/api/funcionarios/${f.id}/lancamentos?competencia=${m}`),
        api.get(`/api/funcionarios/${f.id}/meses?ate=${m}&n=12`),
      ])
      if (pedido !== pedidoAtual.current) return  // resposta atrasada de um mês que não é mais o atual
      setLinhas(rLinhas.data)
      setMeses(rMeses.data)
    } catch {
      if (pedido !== pedidoAtual.current) return
      setLinhas([])
      setMeses([])
      setErro('Não consegui carregar o mês.')
    }
  }, [])

  useEffect(() => { carregarFuncionarios() }, [carregarFuncionarios])
  useEffect(() => { if (sel) carregarMes(sel, mes) }, [sel?.id, mes])  // eslint-disable-line react-hooks/exhaustive-deps

  function recarregar() {
    carregarFuncionarios()
    if (sel) carregarMes(sel, mes)
  }

  async function excluir(f) {
    if (!confirm(`Desativar "${f.nome}"? Os lançamentos ficam guardados.`)) return
    try {
      await api.delete(`/api/funcionarios/${f.id}`)
      if (sel?.id === f.id) setSel(null)
      carregarFuncionarios()
    } catch (err) {
      alert(mensagemDe(err, 'Não consegui desativar.'))
    }
  }

  const doTipo = t => linhas.filter(l => l.tipo === t)
  const resumoDoMes = meses.find(m => mesDe(m.competencia) === mes)
  const existenteParaCartao = cartao
    ? (cartao.tipo === 'nf' ? doTipo('nf')[0] : cartao.tipo.startsWith('das') ? doTipo('das')[0] : null) || null
    : null

  return (
    <Layout>
      <PaginaHeader
        titulo="Funcionários"
        subtitulo="Por pessoa e por mês de competência: o pagamento, o DAS e a NF. Pagamento e DAS pagos saem da sobra na Caixa da Semana."
        acao={podeEditar && <button onClick={() => setModalNovo(true)} style={botaoPrimario}>+ Novo funcionário</button>}
      />

      {erro && <p style={{ color: 'var(--color-danger)' }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        {funcionarios && funcionarios.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nenhum funcionário cadastrado ainda.</p>
        )}
        {(funcionarios || []).map(f => {
          const ativo = sel?.id === f.id
          return (
            <div key={f.id} style={{ position: 'relative', cursor: 'pointer', minWidth: 180, padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: ativo ? 'var(--color-accent-solid)' : 'var(--color-surface)', color: ativo ? 'var(--color-on-accent)' : 'var(--color-text)' }}>
              <div onClick={() => { setSel(f); setCartao(null) }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{f.nome}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{rotuloMes(mesDe(f.mes_atual?.competencia))}: {resumoTexto(f.mes_atual)}</div>
              </div>
              {podeEditar && (
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}>
                  <button onClick={e => { e.stopPropagation(); setModalEditar(f) }} title="Editar funcionário" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.7, color: 'inherit' }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); excluir(f) }} title="Desativar funcionário" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.7, color: 'inherit' }}>🗑️</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {sel && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>{sel.nome} · {rotuloMes(mes)}
              <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--color-text-muted)', marginLeft: 10 }}>{resumoTexto(resumoDoMes)}</span>
            </h2>
            <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>Mês<br />
              <input type="month" value={mes} onChange={e => { setMes(e.target.value); setCartao(null) }} style={{ ...inputStyle, width: 170 }} />
            </label>
          </div>

          {cartao && (
            <UploadDocumentoFuncionario
              key={`${cartao.tipo}-${mes}-${cartao.n}`}
              funcionario={sel} tipo={cartao.tipo} competencia={mes} arquivo={cartao.arquivo} existente={existenteParaCartao}
              onSalvo={compSalva => { setCartao(null); if (compSalva !== mes) setMes(compSalva); else recarregar() }}
              onCancelar={() => setCartao(null)}
            />
          )}

          {['pagamento', 'das', 'nf'].map(t => (
            <BlocoLancamentoFuncionario key={t} tipo={t} linhas={doTipo(t)} podeEditar={podeEditar}
              onAbrir={(tipoCartao, arquivo) => setCartao(c => ({ tipo: tipoCartao, arquivo, n: (c?.n || 0) + 1 }))}
              onMudou={recarregar}
              onAbrirAnexo={(l, qual) => abrirAnexo(`/api/funcionarios/${sel.id}/lancamentos/${l.id}/anexo?qual=${qual}`)} />
          ))}

          <section style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>Últimos 12 meses</h3>
            <div style={{ display: 'grid', gap: 4 }}>
              {meses.map(m => {
                const chave = mesDe(m.competencia)
                return (
                  <button key={chave} type="button" onClick={() => { setMes(chave); setCartao(null) }}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'left', padding: '8px 12px', fontSize: 13, background: chave === mes ? 'var(--color-bg)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', cursor: 'pointer' }}>
                    <span>{rotuloMes(chave)}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{m.total_pago > 0 ? `${formatMoeda(m.total_pago)} · ` : ''}{resumoTexto(m)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}

      {modalNovo && <ModalFuncionario titulo="Novo funcionário" onFechar={() => setModalNovo(false)}
        onSalvar={async d => { await api.post('/api/funcionarios', d); carregarFuncionarios() }} />}
      {modalEditar && <ModalFuncionario titulo="Editar funcionário" inicial={modalEditar} onFechar={() => setModalEditar(null)}
        onSalvar={async d => { await api.put(`/api/funcionarios/${modalEditar.id}`, d); carregarFuncionarios() }} />}
    </Layout>
  )
}
