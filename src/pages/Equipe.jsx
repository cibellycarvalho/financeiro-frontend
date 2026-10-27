// src/pages/Equipe.jsx
// "Contas e equipe" (27/10/2026): o que sai do caixa, numa tela só, no visual
// do desenho "Margem". Pedido dela: Contas a Pagar, Fornecedores e Funcionários
// separados eram "quadrados" — só ela sabia usar. Aqui junta tudo em linguagem
// simples; as telas antigas continuam para lançar e anexar.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import { formatMoeda, formatData, mensagemDe, Faixa } from '../components/upload/comum'
import { hojeSP } from './Hoje'

const cartao = { background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 24, boxShadow: '0 1px 2px rgba(15,27,45,.06)' }
const rotulo = { fontSize: 12.5, color: 'var(--color-text-muted)' }
const selo = (fundo, cor) => ({ background: fundo, color: cor, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' })
const SELO = {
  vencida: selo('var(--color-danger-light)', 'var(--color-danger)'),
  hoje: selo('var(--color-danger-light)', 'var(--color-danger)'),
  aberto: selo('var(--color-warning-light)', 'var(--color-warning)'),
  parcial: selo('#E6EEFA', '#163F80'),
  pago: selo('#E3F3EA', '#0B5C39'),
}
const botao = { minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function somaDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "Hoje", "Qua 28" ou a data, para a coluna da esquerda. */
export function quando(iso, hoje) {
  if (!iso) return 'Sem data'
  const d = iso.slice(0, 10)
  if (d === hoje) return 'Hoje'
  if (d < hoje) return formatData(d)
  return `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}`
}

/**
 * Junta contas a pagar, DAS em aberto da equipe e saldo devedor de fornecedor
 * numa lista só, do mais urgente para o menos. Função pura.
 * Entra o que já venceu e o que vence até `dias` à frente; fornecedor sem data
 * vai para o fim (é dívida corrente, não boleto).
 */
export function montarAPagar({ contas = [], funcionarios = [], fornecedores = [], hoje, dias = 7 }) {
  const limite = somaDias(hoje, dias)
  const linhas = []
  for (const c of contas) {
    if (c.status === 'pago' || !c.vencimento) continue
    const v = c.vencimento.slice(0, 10)
    if (v > limite) continue
    linhas.push({ chave: 'c' + c.id, data: v, nome: c.descricao, origem: c.categoria ? `Conta · ${c.categoria}` : 'Conta a pagar',
                  valor: Number(c.valor || 0), situacao: v < hoje ? 'vencida' : v === hoje ? 'hoje' : 'aberto', contaId: c.id, link: '/contas' })
  }
  for (const f of funcionarios) {
    const m = f.mes_atual
    if (!m?.das_em_aberto) continue
    const v = m.das_vencimento
    if (v && v > limite) continue
    linhas.push({ chave: 'd' + f.id, data: v, nome: `DAS · ${f.nome}`, origem: 'Imposto da equipe', valor: m.das_valor || 0,
                  situacao: v && v < hoje ? 'vencida' : v === hoje ? 'hoje' : 'aberto', link: '/funcionarios' })
  }
  for (const f of fornecedores) {
    const saldo = Number(f.saldo_aberto || 0)
    if (saldo <= 0.005) continue
    linhas.push({ chave: 'f' + f.id, data: null, nome: f.apelido || f.nome, origem: 'Fornecedor · saldo em aberto', valor: saldo, situacao: 'aberto', link: '/fornecedores' })
  }
  linhas.sort((a, b) => (a.data ?? '9999') < (b.data ?? '9999') ? -1 : (a.data ?? '9999') > (b.data ?? '9999') ? 1 : 0)
  return linhas
}

/** Situação do mês de um funcionário: salário combinado contra o que já foi pago. Função pura. */
export function situacaoPessoa(f) {
  const salario = f.valor_combinado != null ? Number(f.valor_combinado) : null
  const pago = Number(f.mes_atual?.total_pago || 0)
  if (salario == null) return { salario, pago, falta: null, pct: null, status: 'Sem salário cadastrado', tipo: 'aberto' }
  const falta = Math.max(0, Math.round((salario - pago) * 100) / 100)
  const pct = salario > 0 ? Math.min(100, Math.round(100 * pago / salario)) : 0
  if (falta === 0) return { salario, pago, falta, pct: 100, status: 'Pago', tipo: 'pago' }
  if (pago > 0) return { salario, pago, falta, pct, status: `Parcial · ${pct}%`, tipo: 'parcial' }
  return { salario, pago, falta, pct: 0, status: 'A pagar', tipo: 'aberto' }
}

const ROTULO = { vencida: 'Vencida', hoje: 'Vence hoje', aberto: 'Em aberto' }

export default function Equipe() {
  const hoje = hojeSP()
  const [contas, setContas] = useState([])
  const [funcionarios, setFuncionarios] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(() => {
    setErro(null)
    return Promise.all([
      api.get('/api/contas', { params: { periodo: 'mes' } }).then(r => setContas(r.data)),
      api.get('/api/funcionarios').then(r => setFuncionarios(r.data)),
      api.get('/api/fornecedores').then(r => setFornecedores(r.data)),
    ]).catch(e => setErro(mensagemDe(e, 'Não carregou. Confira a internet.')))
      .finally(() => setCarregando(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function marcarPaga(id) {
    try { await api.put(`/api/contas/${id}`, { status: 'pago', data_pagamento: hoje }); carregar() }
    catch (e) { setErro(mensagemDe(e, 'Não marcou. Tente de novo.')) }
  }

  const aPagar = montarAPagar({ contas, funcionarios, fornecedores, hoje })
  const comData = aPagar.filter(l => l.data)
  const fornecedoresAbertos = aPagar.filter(l => !l.data && l.chave.startsWith('f'))
  const semData = aPagar.filter(l => !l.data && !l.chave.startsWith('f'))
  const total = comData.reduce((s, l) => s + l.valor, 0)
  const urgentes = comData.filter(l => l.situacao !== 'aberto')
  const mesNome = MESES[Number(hoje.slice(5, 7)) - 1]

  const Linha = ({ l }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', padding: '12px 4px', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ flex: '0 0 90px', fontSize: 13, fontWeight: 600, color: l.situacao === 'aberto' ? undefined : 'var(--color-danger)' }}>{quando(l.data, hoje)}</div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{l.nome}</div>
        <div style={rotulo}>{l.origem}</div>
      </div>
      <div style={{ flex: '0 0 120px', textAlign: 'right', fontWeight: 700 }}>{formatMoeda(l.valor)}</div>
      <div style={{ flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 170 }}>
        <span style={SELO[l.situacao]}>{ROTULO[l.situacao]}</span>
        {l.contaId
          ? <button type="button" style={botao} onClick={() => marcarPaga(l.contaId)}>Marcar paga</button>
          : <Link to={l.link} style={botao}>Abrir</Link>}
      </div>
    </div>
  )

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
        <header>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>O que sai do caixa nos próximos dias</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 28 }}>Contas e equipe</h1>
        </header>

        {erro && <Faixa tipo="erro">{erro}</Faixa>}
        {urgentes.length > 0 && (
          <Faixa tipo="erro">{urgentes.length} conta{urgentes.length > 1 ? 's' : ''} vencida{urgentes.length > 1 ? 's' : ''} ou vencendo hoje: {formatMoeda(urgentes.reduce((s, l) => s + l.valor, 0))}.</Faixa>
        )}

        <section style={cartao}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>A pagar · próximos 7 dias</h2>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{formatMoeda(total)}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            {carregando && <p style={rotulo}>Carregando…</p>}
            {!carregando && comData.length + semData.length === 0 && <p style={rotulo}>Nada vencendo nos próximos 7 dias.</p>}
            {[...comData, ...semData].map(l => <Linha key={l.chave} l={l} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Link to="/contas" style={botao}>+ Lançar conta</Link>
            <Link to="/contas" style={{ ...botao, border: 'none', color: 'var(--color-accent)' }}>Ver todas as contas</Link>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {funcionarios.map(f => {
            const s = situacaoPessoa(f)
            return (
              <div key={f.id} style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{f.nome}</div>
                    <div style={rotulo}>Serviço de {mesNome} · pago no mês seguinte</div>
                  </div>
                  <span style={SELO[s.tipo]}>{s.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  {[['Salário', s.salario], ['Já pago', s.pago], ['Falta', s.falta]].map(([r, v]) => (
                    <div key={r} style={{ background: 'var(--color-bg)', borderRadius: 10, padding: 12, minWidth: 0 }}>
                      <div style={rotulo}>{r}</div>
                      <div style={{ fontSize: 17, fontWeight: 700 }}>{v == null ? '—' : formatMoeda(v)}</div>
                    </div>
                  ))}
                </div>
                {s.pct != null && (
                  <div aria-hidden="true" style={{ height: 8, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: s.pct + '%', background: s.tipo === 'pago' ? 'var(--color-success)' : 'var(--color-accent)', borderRadius: 999 }} />
                  </div>
                )}
                {f.mes_atual?.falta?.length > 0 && (
                  <div style={rotulo}>Falta no mês: {f.mes_atual.falta.map(t => ({ pagamento: 'pagamento', das: 'DAS', nf: 'nota fiscal' })[t]).join(', ')}.</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to="/funcionarios" style={botao}>Lançar pagamento</Link>
                </div>
              </div>
            )
          })}
        </section>

        {fornecedoresAbertos.length > 0 && (
          <section style={cartao}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>Fornecedores · quanto ainda devo</h2>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{formatMoeda(fornecedoresAbertos.reduce((s, l) => s + l.valor, 0))}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {fornecedoresAbertos.map(l => (
                <div key={l.chave} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', padding: '12px 4px', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ flex: '1 1 220px', fontSize: 14, fontWeight: 600 }}>{l.nome}</div>
                  <div style={{ flex: '0 0 140px', textAlign: 'right', fontWeight: 700 }}>{formatMoeda(l.valor)}</div>
                  <Link to="/fornecedores" style={botao}>Pedidos e pagamentos</Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}
