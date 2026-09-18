// src/components/BlocoLancamentoFuncionario.jsx
// Um dos três blocos do mês de um funcionário: Pagamento, DAS ou NF.
// Mostra as linhas daquele tipo, os botões de subir/lançar e o ✏️/🗑️ de cada
// linha. Quem abre o cartão de conferência é a página (onAbrir).
import { useState } from 'react'
import api from '../services/api'
import { BotaoSubirArquivo, formatMoeda, formatData, inputStyle, botaoSecundario, botaoPrimario, mensagemDe } from './upload/comum'
import { mesDe } from '../lib/meses'

const TITULO = { pagamento: 'PAGAMENTO', das: 'DAS', nf: 'NF' }
const botaoMini = { ...botaoSecundario, padding: '6px 12px', fontSize: 12 }
const botaoIcone = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.7, padding: 4 }

export function descricaoDaLinha(linha) {
  if (linha.tipo === 'pagamento') return `${formatMoeda(linha.valor)} · pago em ${formatData(linha.pago_em)}`
  if (linha.tipo === 'das') {
    const partes = [formatMoeda(linha.valor)]
    if (linha.vencimento) partes.push(`vence ${formatData(linha.vencimento)}`)
    partes.push(linha.pago_em ? `pago em ${formatData(linha.pago_em)}` : 'em aberto')
    return partes.join(' · ')
  }
  const partes = [linha.numero_nf ? `NF nº ${linha.numero_nf}` : 'NF sem número']
  if (linha.valor != null) partes.push(formatMoeda(linha.valor))
  return partes.join(' · ')
}

function Anexos({ linha, onAbrirAnexo }) {
  const link = (qual, rotulo) => (
    <button type="button" key={qual} onClick={() => onAbrirAnexo(linha, qual)} title="Abrir em nova aba"
      style={{ ...botaoIcone, fontSize: 12, textDecoration: 'underline', color: 'var(--color-text-muted)' }}>{rotulo}</button>
  )
  if (linha.tipo === 'das') return <>{linha.boleto_path && link('boleto', '📎 boleto')}{linha.comprovante_path && link('comprovante', '📎 comprovante')}</>
  return linha.arquivo_path ? link('arquivo', '📎') : null
}

function LinhaLancamento({ linha, podeEditar, onMudou, onAbrirAnexo }) {
  const [editando, setEditando] = useState(false)
  const [comp, setComp] = useState(mesDe(linha.competencia) || '')
  const [valor, setValor] = useState(linha.valor ?? '')
  const [pagoEm, setPagoEm] = useState(linha.pago_em ? String(linha.pago_em).slice(0, 10) : '')
  const [vencimento, setVencimento] = useState(linha.vencimento ? String(linha.vencimento).slice(0, 10) : '')
  const [numeroNf, setNumeroNf] = useState(linha.numero_nf || '')
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)

  // Reseeda os campos a partir da linha atual (props). Chamada ao abrir o
  // editor — cobre tanto "abrir de novo depois de Cancelar" (descarta o que
  // foi digitado) quanto "a página recarregou a linha" (mesmo id, dado novo).
  function reiniciar() {
    setComp(mesDe(linha.competencia) || '')
    setValor(linha.valor ?? '')
    setPagoEm(linha.pago_em ? String(linha.pago_em).slice(0, 10) : '')
    setVencimento(linha.vencimento ? String(linha.vencimento).slice(0, 10) : '')
    setNumeroNf(linha.numero_nf || '')
    setErro(null)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro(null); setSalvando(true)
    const corpo = { competencia: comp, valor: valor === '' ? null : parseFloat(valor) }
    if (linha.tipo === 'pagamento') corpo.pago_em = pagoEm
    if (linha.tipo === 'das') { corpo.vencimento = vencimento || null; corpo.pago_em = pagoEm || null }
    if (linha.tipo === 'nf') corpo.numero_nf = numeroNf || null
    try {
      await api.put(`/api/funcionarios/${linha.funcionario_id}/lancamentos/${linha.id}`, corpo)
      setEditando(false)
      onMudou()
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!confirm('Apagar este lançamento?')) return
    try {
      await api.delete(`/api/funcionarios/${linha.funcionario_id}/lancamentos/${linha.id}`)
      onMudou()
    } catch (err) {
      alert(mensagemDe(err, 'Não consegui apagar.'))
    }
  }

  if (editando) {
    return (
      <form onSubmit={salvar} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '8px 0' }}>
        <label style={{ fontSize: 12 }}>Competência<br /><input type="month" value={comp} onChange={e => setComp(e.target.value)} style={{ ...inputStyle, width: 150 }} /></label>
        {linha.tipo === 'nf' && <label style={{ fontSize: 12 }}>Nº da nota<br /><input value={numeroNf} onChange={e => setNumeroNf(e.target.value)} style={{ ...inputStyle, width: 130 }} /></label>}
        <label style={{ fontSize: 12 }}>Valor (R$)<br /><input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} style={{ ...inputStyle, width: 120 }} /></label>
        {linha.tipo === 'das' && <label style={{ fontSize: 12 }}>Vencimento<br /><input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} style={{ ...inputStyle, width: 150 }} /></label>}
        {linha.tipo !== 'nf' && <label style={{ fontSize: 12 }}>Pago em{linha.tipo === 'das' ? ' (vazio = em aberto)' : ''}<br /><input type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} style={{ ...inputStyle, width: 150 }} /></label>}
        <button type="submit" disabled={salvando} style={{ ...botaoPrimario, padding: '8px 14px' }}>Salvar</button>
        <button type="button" onClick={() => { reiniciar(); setEditando(false) }} style={botaoMini}>Cancelar</button>
        {erro && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{erro}</span>}
      </form>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14 }}>
      <span>{descricaoDaLinha(linha)}</span>
      <Anexos linha={linha} onAbrirAnexo={onAbrirAnexo} />
      {podeEditar && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button type="button" onClick={() => { reiniciar(); setEditando(true) }} title="Editar" style={botaoIcone}>✏️</button>
          <button type="button" onClick={apagar} title="Apagar" style={botaoIcone}>🗑️</button>
        </span>
      )}
    </div>
  )
}

export default function BlocoLancamentoFuncionario({ tipo, linhas, podeEditar, onAbrir, onMudou, onAbrirAnexo }) {
  const subir = (rotulo, tipoCartao) => (
    <BotaoSubirArquivo key={tipoCartao} rotulo={rotulo} style={{ padding: '6px 12px', fontSize: 12 }}
      onArquivo={f => onAbrir(tipoCartao, f)} />
  )
  const aMao = (rotulo, tipoCartao) => (
    <button type="button" key={rotulo} onClick={() => onAbrir(tipoCartao, null)} style={botaoMini}>{rotulo}</button>
  )

  let botoes = []
  if (podeEditar) {
    if (tipo === 'pagamento') botoes = [subir('📎 Subir comprovante do Pix', 'pagamento'), aMao('+ lançar à mão', 'pagamento')]
    if (tipo === 'das') {
      const das = linhas[0]
      if (!das) botoes = [subir('📎 Subir boleto', 'das_boleto'), subir('📎 Subir comprovante', 'das_comprovante'), aMao('+ lançar à mão', 'das_boleto')]
      else if (!das.pago_em) botoes = [!das.boleto_path && subir('📎 Subir boleto', 'das_boleto'), subir('📎 Subir comprovante', 'das_comprovante'), aMao('✓ marcar pago à mão', 'das_comprovante')]
      else botoes = [!das.boleto_path && subir('📎 Subir boleto', 'das_boleto'), !das.comprovante_path && subir('📎 Subir comprovante', 'das_comprovante')]
    }
    if (tipo === 'nf') {
      const nf = linhas[0]
      if (!nf) botoes = [subir('📎 Subir NF', 'nf'), aMao('+ lançar à mão', 'nf')]
      else if (!nf.arquivo_path) botoes = [subir('📎 Anexar o arquivo da NF', 'nf')]
    }
  }

  return (
    <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', minWidth: 90, color: 'var(--color-text-muted)' }}>{TITULO[tipo]}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          {linhas.length === 0
            ? <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>— nada ainda —</span>
            : linhas.map(l => <LinhaLancamento key={l.id} linha={l} podeEditar={podeEditar} onMudou={onMudou} onAbrirAnexo={onAbrirAnexo} />)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{botoes.filter(Boolean)}</div>
      </div>
    </section>
  )
}
