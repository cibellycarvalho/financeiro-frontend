// src/pages/Hoje.jsx
// Caixa de Hoje (26/10/2026): "quanto eu tenho hoje", não até domingo. Banco
// principal + Mercado Pago disponível − o que vence hoje (e já venceu). O que
// ainda vai cair aparece embaixo, separado: não dá para comprar com ele hoje.
import { useCallback, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import api from '../services/api'
import crmApi, { crmConfigurado } from '../services/crmApi'
import { botaoPrimario, botaoSecundario, inputStyle, formatData, formatMoeda, mensagemDe, Faixa } from '../components/upload/comum'

/** Data de hoje em São Paulo, YYYY-MM-DD — o navegador pode estar em outro fuso. */
export function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

function somaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * A conta da tela. Função pura.
 * total = null quando falta o saldo do banco principal ou o do Mercado Pago:
 * mostrar um número sem uma das partes faria parecer que há menos dinheiro.
 */
export function calcularPodeGastar({ saldoBanco, mpDisponivel, contas, hoje }) {
  const vencendo = (contas || []).filter(c => c.status !== 'pago' && c.vencimento && c.vencimento.slice(0, 10) <= hoje)
  const totalVencendo = Math.round(vencendo.reduce((s, c) => s + Number(c.valor || 0), 0) * 100) / 100
  const falta = []
  if (saldoBanco == null) falta.push('saldo do banco principal')
  if (mpDisponivel == null) falta.push('saldo do Mercado Pago')
  const total = falta.length ? null : Math.round((Number(saldoBanco) + Number(mpDisponivel) - totalVencendo) * 100) / 100
  return { vencendo, totalVencendo, total, falta }
}

const cartao = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 20 }
const caixinha = { background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }
const rotulo = { fontSize: 12.5, color: 'var(--color-text-muted)' }
const valorMedio = { fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function SaldoBanco({ conta, onSalvo }) {
  const [valor, setValor] = useState(conta.saldo ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  useEffect(() => { setValor(conta.saldo ?? '') }, [conta.saldo])
  async function salvar(e) {
    e.preventDefault()
    const texto = String(valor).trim().replace(/\./g, '').replace(',', '.')
    const numero = texto === '' ? null : Number(texto)
    if (numero !== null && Number.isNaN(numero)) { setErro('Digite só o número, ex.: 9870,50'); return }
    setSalvando(true); setErro(null)
    try { await api.put(`/api/bancos/${conta.id}`, { saldo: numero }); onSalvo() }
    catch (err) { setErro(mensagemDe(err, 'Não salvou. Tente de novo.')) }
    finally { setSalvando(false) }
  }
  return (
    <form onSubmit={salvar} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="saldo de agora"
             style={{ ...inputStyle, marginTop: 0, flex: '1 1 120px', width: 'auto' }} aria-label={`Saldo do ${conta.nome}`} />
      <button type="submit" disabled={salvando} style={{ ...botaoSecundario, padding: '8px 12px' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      {erro && <span role="alert" style={{ width: '100%', fontSize: 12, color: 'var(--color-danger)' }}>{erro}</span>}
    </form>
  )
}

function NovaConta({ temPrincipal, onCriada }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [principal, setPrincipal] = useState(!temPrincipal)
  const [erro, setErro] = useState(null)
  if (!aberto) return <button type="button" onClick={() => setAberto(true)} style={botaoSecundario}>+ Adicionar conta bancária</button>
  async function criar(e) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Dê um nome, ex.: Itaú'); return }
    try { await api.post('/api/bancos', { nome, principal }); setAberto(false); setNome(''); onCriada() }
    catch (err) { setErro(mensagemDe(err, 'Não criou. Tente de novo.')) }
  }
  return (
    <form onSubmit={criar} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ flex: '1 1 180px' }}>Banco<input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Itaú" style={inputStyle} /></label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={principal} onChange={e => setPrincipal(e.target.checked)} /> Principal</label>
      <button type="submit" style={botaoPrimario}>Criar</button>
      <button type="button" onClick={() => setAberto(false)} style={botaoSecundario}>Cancelar</button>
      {erro && <span role="alert" style={{ width: '100%', fontSize: 12, color: 'var(--color-danger)' }}>{erro}</span>}
    </form>
  )
}

export default function Hoje() {
  const hoje = hojeSP()
  const [bancos, setBancos] = useState([])
  const [contas, setContas] = useState([])
  const [mp, setMp] = useState(null)          // { disponivel, a_liberar, lojas_indisponiveis }
  const [mpErro, setMpErro] = useState(null)
  const [agenda, setAgenda] = useState(null)  // { por_dia, total }
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const carregarBancos = useCallback(() => api.get('/api/bancos').then(r => setBancos(r.data)), [])

  useEffect(() => {
    let vivo = true
    const fim = somaDias(hoje, 7)
    Promise.all([
      carregarBancos(),
      api.get('/api/contas', { params: { periodo: 'semana' } }).then(r => vivo && setContas(r.data)),
      (crmConfigurado()
        ? crmApi.get('/api/caixa/hoje').then(r => vivo && setMp(r.data))
        : Promise.reject(new Error('CRM não configurado'))
      ).catch(e => vivo && setMpErro(mensagemDe(e, 'Não deu para ler o Mercado Pago agora.'))),
      api.get('/api/repasses/a-liberar', { params: { de: somaDias(hoje, 1), ate: fim } })
        .then(r => vivo && setAgenda(r.data)).catch(() => {}),
    ]).catch(e => vivo && setErro(mensagemDe(e, 'Não carregou. Confira a internet.')))
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [hoje, carregarBancos])

  const principal = bancos.find(b => b.principal)
  const outras = bancos.filter(b => !b.principal)
  const conta = calcularPodeGastar({ saldoBanco: principal?.saldo, mpDisponivel: mp?.disponivel, contas, hoje })
  const vencidas = conta.vencendo.filter(c => c.vencimento.slice(0, 10) < hoje)
  const saldoVelho = principal?.saldo_em && principal.saldo_em.slice(0, 10) < hoje

  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje, i + 1))
  const porDia = agenda?.por_dia || {}
  const maxDia = Math.max(1, ...dias.map(d => porDia[d] || 0))
  const totalACair = agenda ? agenda.total : mp?.a_liberar

  return (
    <Layout>
      <PaginaHeader titulo="Hoje" subtitulo="Quanto dá para gastar agora: banco principal + Mercado Pago − o que vence hoje." />

      {erro && <Faixa tipo="erro">{erro}</Faixa>}

      {/* O que pede atenção vai em cima (pedido dela, 15/10/2026). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {vencidas.length > 0 && <Faixa tipo="erro">{vencidas.length} conta{vencidas.length > 1 ? 's' : ''} já vencida{vencidas.length > 1 ? 's' : ''} e em aberto — {formatMoeda(vencidas.reduce((s, c) => s + Number(c.valor), 0))}.</Faixa>}
        {conta.vencendo.length - vencidas.length > 0 && <Faixa tipo="aviso">{conta.vencendo.length - vencidas.length} conta{conta.vencendo.length - vencidas.length > 1 ? 's vencem' : ' vence'} hoje.</Faixa>}
        {!carregando && !principal && <Faixa tipo="aviso">Cadastre o seu banco principal lá embaixo para a conta fechar.</Faixa>}
        {saldoVelho && <Faixa tipo="aviso">O saldo do {principal.nome} é de {formatData(principal.saldo_em)}. Atualize com o de hoje.</Faixa>}
        {mpErro && <Faixa tipo="aviso">Mercado Pago: {mpErro}</Faixa>}
        {mp?.lojas_indisponiveis?.length > 0 && <Faixa tipo="aviso">Não deu para ler o Mercado Pago de: {mp.lojas_indisponiveis.join(', ')}. O total abaixo está sem ela{mp.lojas_indisponiveis.length > 1 ? 's' : ''}.</Faixa>}
      </div>

      <section style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ ...rotulo, fontSize: 14, fontWeight: 600 }}>Pode gastar hoje</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
                        color: conta.total == null ? 'var(--color-text-muted)' : conta.total < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {carregando ? '…' : conta.total == null ? '—' : formatMoeda(conta.total)}
          </div>
          {!carregando && conta.total == null && <div style={rotulo}>Falta: {conta.falta.join(' e ')}.</div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={caixinha}>
            <span style={rotulo}>Banco principal{principal ? ` · ${principal.nome}` : ''}</span>
            <span style={valorMedio}>{principal?.saldo != null ? formatMoeda(principal.saldo) : '—'}</span>
            {principal && <SaldoBanco conta={principal} onSalvo={carregarBancos} />}
          </div>
          <div style={caixinha}>
            <span style={rotulo}>Mercado Pago disponível</span>
            <span style={valorMedio}>{mp?.disponivel != null ? formatMoeda(mp.disponivel) : '—'}</span>
            <span style={rotulo}>automático, das lojas conectadas</span>
          </div>
          <div style={caixinha}>
            <span style={rotulo}>Vence hoje ou já venceu</span>
            <span style={{ ...valorMedio, color: conta.totalVencendo > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
              {conta.totalVencendo > 0 ? '− ' : ''}{formatMoeda(conta.totalVencendo)}
            </span>
            <span style={rotulo}>{conta.vencendo.length} conta{conta.vencendo.length === 1 ? '' : 's'} em aberto</span>
          </div>
        </div>
      </section>

      <section style={{ ...cartao, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Ainda cai nos próximos 7 dias</h2>
          <strong style={{ color: 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>{totalACair != null ? '+ ' + formatMoeda(totalACair) : '—'}</strong>
        </div>
        {agenda ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'end', marginTop: 14 }}>
            {dias.map(d => (
              <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{porDia[d] ? formatMoeda(porDia[d]).replace(',00', '') : '—'}</span>
                <div aria-hidden="true" style={{ height: Math.max(3, Math.round(70 * (porDia[d] || 0) / maxDia)), background: 'var(--color-success)', opacity: 0.35, borderRadius: 4 }} />
                <span style={rotulo}>{DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} {d.slice(8)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...rotulo, margin: '8px 0 0' }}>Total que o Mercado Pago ainda vai liberar. A agenda por dia não respondeu agora.</p>
        )}
        <p style={{ ...rotulo, margin: '10px 0 0' }}>Não entra no "pode gastar hoje": ainda não está na conta.</p>
      </section>

      {conta.vencendo.length > 0 && (
        <section style={{ ...cartao, marginTop: 16 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Contas de hoje</h2>
          {conta.vencendo.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
              <span><strong>{c.descricao}</strong> <span style={rotulo}>· vence {formatData(c.vencimento)}</span></span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoeda(c.valor)}</span>
            </div>
          ))}
        </section>
      )}

      <section style={{ ...cartao, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Outras contas bancárias</h2>
        {outras.length === 0 && <p style={{ ...rotulo, margin: 0 }}>Nenhuma além da principal.</p>}
        {outras.map(b => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
            <strong style={{ flex: '1 1 140px' }}>{b.nome}</strong>
            <span style={{ ...valorMedio, fontSize: 16 }}>{b.saldo != null ? formatMoeda(b.saldo) : '—'}</span>
            <div style={{ flex: '1 1 220px' }}><SaldoBanco conta={b} onSalvo={carregarBancos} /></div>
            <button type="button" style={{ ...botaoSecundario, padding: '8px 12px' }}
                    onClick={() => api.put(`/api/bancos/${b.id}`, { principal: true }).then(carregarBancos)}>Tornar principal</button>
          </div>
        ))}
        <NovaConta temPrincipal={!!principal} onCriada={carregarBancos} />
      </section>
    </Layout>
  )
}
