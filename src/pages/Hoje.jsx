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

// Visual do desenho "Margem" aprovado em 26/10/2026.
const cartao = { background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 24, boxShadow: '0 1px 2px rgba(15,27,45,.06)' }
const caixinha = { background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }
const rotulo = { fontSize: 12.5, color: 'var(--color-text-muted)' }
const valorMedio = { fontSize: 20, fontWeight: 700 }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const pct = v => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

/** Saudação pela hora de São Paulo. */
export function saudacao(agora = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(agora))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Cartões da direita e tabela "mais vendidos", a partir do /api/dashboard do CRM. Função pura. */
export function resumoVendas(dash) {
  if (!dash?.kpis) return null
  const k = dash.kpis
  const lucro = k.lucro_pos_ads ?? k.lucro_bruto
  const top = (dash.top_produtos || []).slice(0, 5).map(p => {
    const l = p.lucro_pos_ads ?? p.lucro
    return { id: p.ml_item_id, sku: p.sku, titulo: p.titulo, unidades: p.unidades, faturou: p.total_faturado,
             lucro: l, margem: l != null && p.total_faturado ? 100 * l / p.total_faturado : null }
  })
  return {
    faturamento: k.faturamento, pedidos: k.n_vendas, ticket: k.ticket_medio,
    lucro, margem: lucro != null && k.faturamento ? 100 * lucro / k.faturamento : null,
    ads: k.valor_ads, tacos: k.tacos,
    prejuizo: (dash.top_produtos || []).filter(p => (p.lucro_pos_ads ?? p.lucro) < 0).length,
    top,
  }
}

function Alerta({ titulo, texto, erro }) {
  return (
    <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderRadius: 12, padding: '14px 16px',
                                background: erro ? 'var(--color-danger-light)' : 'var(--color-warning-light)',
                                border: `1px solid ${erro ? 'var(--color-danger)' : 'var(--color-warning)'}33` }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={erro ? 'var(--color-danger)' : 'var(--color-warning)'} strokeWidth="2" style={{ flex: 'none', marginTop: 2 }}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
      <span><strong style={{ display: 'block', fontSize: 14 }}>{titulo}</strong><span style={{ fontSize: 13 }}>{texto}</span></span>
    </div>
  )
}

function Kpi({ rotulo: r, valor, detalhe }) {
  return (
    <div style={{ ...cartao, padding: '16px 18px' }}>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{r}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{detalhe}</div>
    </div>
  )
}

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
  const [mp, setMp] = useState(null)          // { disponivel, a_liberar, lojas, lojas_indisponiveis }
  const [mpErro, setMpErro] = useState(null)
  const [agenda, setAgenda] = useState(null)  // { por_dia, total }
  const [dash, setDash] = useState(null)      // /api/dashboard?periodo=hoje do CRM
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [hora] = useState(() => new Date())

  const carregarBancos = useCallback(() => api.get('/api/bancos').then(r => setBancos(r.data)), [])

  useEffect(() => {
    let vivo = true
    const fim = somaDias(hoje, 7)
    // O dashboard do CRM recebe as lojas que o Mercado Pago devolveu: sem
    // conta_ml ele mostraria só a loja do login.
    const vendas = (lojas) => crmApi.get('/api/dashboard', { params: { periodo: 'hoje', ...(lojas?.length ? { conta_ml: lojas.join(',') } : {}) } })
      .then(r => vivo && setDash(r.data)).catch(() => {})
    Promise.all([
      carregarBancos(),
      api.get('/api/contas', { params: { periodo: 'semana' } }).then(r => vivo && setContas(r.data)),
      (crmConfigurado()
        ? crmApi.get('/api/caixa/hoje').then(r => { if (vivo) setMp(r.data); return vendas((r.data.lojas || []).map(l => l.loja)) },
                                              e => { vendas(); throw e })
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
  const deHoje = conta.vencendo.length - vencidas.length
  const saldoVelho = principal?.saldo_em && principal.saldo_em.slice(0, 10) < hoje
  const v = resumoVendas(dash)

  const dias = Array.from({ length: 7 }, (_, i) => somaDias(hoje, i + 1))
  const porDia = agenda?.por_dia || {}
  const maxDia = Math.max(1, ...dias.map(d => porDia[d] || 0))
  const totalACair = agenda ? agenda.total : mp?.a_liberar
  const dataLonga = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }).format(hora)

  // O que pede atenção vai em cima (pedido dela, 15/10/2026).
  const alertas = []
  if (vencidas.length) alertas.push({ erro: true, titulo: `${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} já vencida${vencidas.length > 1 ? 's' : ''}`, texto: `Em aberto, somam ${formatMoeda(vencidas.reduce((s, c) => s + Number(c.valor), 0))}.` })
  if (deHoje) alertas.push({ titulo: `${deHoje} conta${deHoje > 1 ? 's vencem' : ' vence'} hoje`, texto: `Somam ${formatMoeda(conta.vencendo.filter(c => c.vencimento.slice(0, 10) === hoje).reduce((s, c) => s + Number(c.valor), 0))}.` })
  if (v?.prejuizo) alertas.push({ titulo: `${v.prejuizo} anúncio${v.prejuizo > 1 ? 's' : ''} no prejuízo hoje`, texto: 'Venderam com lucro negativo depois de ads. Veja no CRM.' })
  if (!carregando && !principal) alertas.push({ titulo: 'Falta o banco principal', texto: 'Cadastre lá embaixo para a conta fechar.' })
  if (saldoVelho) alertas.push({ titulo: `Saldo do ${principal.nome} é de ${formatData(principal.saldo_em)}`, texto: 'Atualize com o de hoje lá embaixo.' })
  if (mpErro) alertas.push({ titulo: 'Mercado Pago não respondeu', texto: mpErro })
  if (mp?.lojas_indisponiveis?.length) alertas.push({ titulo: 'Loja sem resposta', texto: `${mp.lojas_indisponiveis.join(', ')} ficou fora do total.` })

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14, textTransform: 'capitalize' }}>{dataLonga}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 28 }}>{saudacao(hora)}. Aqui está o seu dia.</h1>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Atualizado às {hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </header>

        {erro && <Faixa tipo="erro">{erro}</Faixa>}

        {alertas.length > 0 && (
          <section aria-label="Precisa de atenção" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {alertas.map(a => <Alerta key={a.titulo} {...a} />)}
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div style={{ ...cartao, gridColumn: 'span 2', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }} className="hoje-principal">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)' }}>Pode gastar hoje</div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4, lineHeight: 1.1,
                            color: conta.total == null ? 'var(--color-text-muted)' : conta.total < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {carregando ? '…' : conta.total == null ? '—' : formatMoeda(conta.total)}
              </div>
              <div style={rotulo}>
                {!carregando && conta.total == null ? `Falta: ${conta.falta.join(' e ')}.` : 'Dinheiro que já está disponível, menos o que vence hoje.'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div style={caixinha}>
                <span style={rotulo}>Banco principal{principal ? ` · ${principal.nome}` : ''}</span>
                <span style={valorMedio}>{principal?.saldo != null ? formatMoeda(principal.saldo) : '—'}</span>
              </div>
              <div style={caixinha}>
                <span style={rotulo}>Mercado Pago disponível</span>
                <span style={valorMedio}>{mp?.disponivel != null ? formatMoeda(mp.disponivel) : '—'}</span>
              </div>
              <div style={{ ...caixinha, background: conta.totalVencendo > 0 ? 'var(--color-danger-light)' : caixinha.background }}>
                <span style={rotulo}>Vence hoje ({conta.vencendo.length} conta{conta.vencendo.length === 1 ? '' : 's'})</span>
                <span style={{ ...valorMedio, color: conta.totalVencendo > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                  {conta.totalVencendo > 0 ? '− ' : ''}{formatMoeda(conta.totalVencendo)}
                </span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 12 }}>
                <span style={{ fontWeight: 600 }}>Ainda cai nos próximos 7 dias</span>
                <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{totalACair != null ? '+ ' + formatMoeda(totalACair) : '—'}</span>
              </div>
              {agenda && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'end', marginTop: 12 }}>
                  {dias.map(d => (
                    <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{porDia[d] ? formatMoeda(porDia[d]).replace(',00', '') : '—'}</span>
                      <div aria-hidden="true" style={{ height: Math.max(3, Math.round(80 * (porDia[d] || 0) / maxDia)), background: '#CDE8DA', borderRadius: '6px 6px 2px 2px' }} />
                      <span style={rotulo}>{DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} {d.slice(8)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ ...rotulo, marginTop: 10 }}>Liberações do Mercado Pago já agendadas. Não entram no "pode gastar hoje".</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Kpi rotulo="Vendas hoje" valor={v ? formatMoeda(v.faturamento) : '—'}
                 detalhe={v ? `${v.pedidos} pedido${v.pedidos === 1 ? '' : 's'} · ticket médio ${formatMoeda(v.ticket)}` : 'O CRM não respondeu agora.'} />
            <Kpi rotulo="Lucro real hoje" valor={v?.lucro != null ? formatMoeda(v.lucro) : '—'}
                 detalhe={v ? `${pct(v.margem)} depois de comissão, frete, imposto e ads` : ''} />
            <Kpi rotulo="Ads hoje" valor={v ? formatMoeda(v.ads) : '—'} detalhe={v?.tacos != null ? `TACOS ${pct(v.tacos)}` : ''} />
          </div>
        </section>

        {v?.top.length > 0 && (
          <section style={cartao}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Mais vendidos hoje</h2>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                  {['Anúncio', 'Vendas', 'Faturou', 'Lucro real', 'Margem'].map(t => <th key={t} style={{ padding: '8px 6px', fontWeight: 600 }}>{t}</th>)}
                </tr></thead>
                <tbody>
                  {v.top.map(t => {
                    const cor = t.lucro == null ? undefined : t.lucro < 0 ? 'var(--color-danger)' : t.margem < 15 ? 'var(--color-warning)' : 'var(--color-success)'
                    return (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 6px' }}>{t.sku && <strong>{t.sku} · </strong>}{t.titulo}</td>
                        <td style={{ padding: '10px 6px' }}>{t.unidades}</td>
                        <td style={{ padding: '10px 6px' }}>{formatMoeda(t.faturou)}</td>
                        <td style={{ padding: '10px 6px', fontWeight: 700, color: cor }}>{t.lucro != null ? formatMoeda(t.lucro) : '—'}</td>
                        <td style={{ padding: '10px 6px', color: cor }}>{pct(t.margem)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {conta.vencendo.length > 0 && (
          <section style={cartao}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>Contas de hoje</h2>
            {conta.vencendo.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                <span><strong>{c.descricao}</strong> <span style={rotulo}>· vence {formatData(c.vencimento)}</span></span>
                <span style={{ fontWeight: 700 }}>{formatMoeda(c.valor)}</span>
              </div>
            ))}
          </section>
        )}

        <section style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Contas bancárias</h2>
          <p style={{ ...rotulo, margin: 0 }}>Digite o saldo de agora. Quando a conciliação ficar pronta, isso vem sozinho do extrato.</p>
          {[principal, ...outras].filter(Boolean).map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <strong style={{ flex: '1 1 140px' }}>{b.nome}{b.principal && <span style={{ marginLeft: 8, background: 'var(--color-text)', color: 'var(--color-surface)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>PRINCIPAL</span>}</strong>
              <span style={{ ...valorMedio, fontSize: 16 }}>{b.saldo != null ? formatMoeda(b.saldo) : '—'}</span>
              <div style={{ flex: '1 1 220px' }}><SaldoBanco conta={b} onSalvo={carregarBancos} /></div>
              {!b.principal && <button type="button" style={{ ...botaoSecundario, padding: '8px 12px' }}
                      onClick={() => api.put(`/api/bancos/${b.id}`, { principal: true }).then(carregarBancos)}>Tornar principal</button>}
            </div>
          ))}
          <NovaConta temPrincipal={!!principal} onCriada={carregarBancos} />
        </section>
      </div>
      <style>{'@media (max-width: 700px) { .hoje-principal { grid-column: auto !important } }'}</style>
    </Layout>
  )
}
