// src/pages/Lucro.jsx
// "Lucro por anúncio" (27/10/2026), no visual do desenho "Margem": quanto cada
// anúncio deixa no bolso por venda, já com comissão, frete, subsídio, imposto
// e ads. Os números vêm do /api/dashboard do CRM — nada é recalculado aqui além
// de dividir o total do anúncio pelas unidades.
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import crmApi, { crmConfigurado } from '../services/crmApi'
import { formatMoeda, mensagemDe, Faixa } from '../components/upload/comum'

const cartao = { background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 24, boxShadow: '0 1px 2px rgba(15,27,45,.06)' }
const rotulo = { fontSize: 12.5, color: 'var(--color-text-muted)' }
const selo = (fundo, cor) => ({ background: fundo, color: cor, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' })
const SITUACAO = {
  pr: { texto: 'No prejuízo', estilo: selo('var(--color-danger-light)', 'var(--color-danger)'), cor: 'var(--color-danger)' },
  at: { texto: 'Margem baixa', estilo: selo('var(--color-warning-light)', 'var(--color-warning)'), cor: 'var(--color-warning)' },
  ok: { texto: 'Saudável', estilo: selo('#E3F3EA', '#0B5C39'), cor: 'var(--color-success)' },
}
const PERIODOS = [['7d', '7 dias'], ['30d', '30 dias']]
// Abaixo disso de margem (lucro depois de ads ÷ faturado) o anúncio pede atenção.
const MARGEM_BAIXA = 10

/** Uma linha da tabela por anúncio, com valores POR VENDA. Função pura. */
export function linhaAnuncio(p) {
  const u = Number(p.unidades) || 0
  const porVenda = v => (v == null || !u ? null : v / u)
  const lucroTotal = p.lucro_pos_ads ?? p.lucro
  const margem = lucroTotal != null && p.total_faturado ? 100 * lucroTotal / p.total_faturado : null
  const grupo = lucroTotal == null ? null : lucroTotal < 0 ? 'pr' : margem < MARGEM_BAIXA ? 'at' : 'ok'
  return {
    id: p.ml_item_id, sku: p.sku, titulo: p.titulo, unidades: u,
    preco: p.preco_atual ?? p.preco_medio, custo: p.custo_unitario,
    comissao: porVenda(p.comissao), frete: porVenda(p.frete), subsidio: porVenda(p.subsidio_ml),
    lucro: porVenda(lucroTotal), margem, minimo: p.preco_minimo, grupo,
  }
}

export default function Lucro() {
  const [periodo, setPeriodo] = useState('30d')
  const [filtro, setFiltro] = useState('todos')
  const [dash, setDash] = useState(null)
  const [lojas, setLojas] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  // Sem conta_ml o CRM devolve só a loja do login; as lojas vêm do Mercado Pago.
  useEffect(() => {
    if (!crmConfigurado()) { setErro('CRM não configurado.'); setCarregando(false); return }
    crmApi.get('/api/caixa/hoje').then(r => setLojas((r.data.lojas || []).map(l => l.loja))).catch(() => setLojas([]))
  }, [])

  useEffect(() => {
    if (lojas == null) return
    let vivo = true
    setCarregando(true); setErro(null)
    crmApi.get('/api/dashboard', { params: { periodo, ...(lojas.length ? { conta_ml: lojas.join(',') } : {}) } })
      .then(r => vivo && setDash(r.data))
      .catch(e => vivo && setErro(mensagemDe(e, 'O CRM não respondeu. Tente de novo.')))
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [periodo, lojas])

  const linhas = (dash?.top_produtos || []).map(linhaAnuncio)
  const conta = g => linhas.filter(l => l.grupo === g).length
  const visiveis = filtro === 'todos' ? linhas : linhas.filter(l => l.grupo === filtro)
  const k = dash?.kpis || {}
  const lucro = k.lucro_pos_ads ?? k.lucro_bruto
  const comSubsidio = linhas.filter(l => l.subsidio > 0).length
  const vezesComissao = k.frete_vendedor && k.taxas_ml ? k.frete_vendedor / k.taxas_ml : null
  const m = v => (v == null ? '—' : formatMoeda(v))

  const botaoFiltro = ativo => ({ minHeight: 40, padding: '0 16px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${ativo ? 'var(--color-text)' : 'var(--color-border)'}`,
    background: ativo ? 'var(--color-text)' : 'var(--color-surface)', color: ativo ? 'var(--color-surface)' : 'var(--color-text)' })

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Últimos {periodo === '7d' ? 7 : 30} dias · {linhas.length} anúncios que venderam</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 28 }}>Quanto cada anúncio deixa no seu bolso</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PERIODOS.map(([id, r]) => <button key={id} type="button" style={botaoFiltro(periodo === id)} onClick={() => setPeriodo(id)}>{r}</button>)}
          </div>
        </header>

        {erro && <Faixa tipo="erro">{erro}</Faixa>}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            ['Faturamento', m(k.faturamento), `${k.n_vendas ?? '—'} pedidos`],
            ['Lucro real', m(lucro), k.faturamento && lucro != null ? `${(100 * lucro / k.faturamento).toFixed(1).replace('.', ',')}% de margem, depois de ads` : '', lucro < 0 ? 'var(--color-danger)' : 'var(--color-success)'],
            ['Frete que você pagou', m(k.frete_vendedor), vezesComissao ? `${vezesComissao.toFixed(1).replace('.', ',')}× a comissão` : ''],
            ['Subsídio do ML recebido', m(k.subsidio_ml), `em ${comSubsidio} anúncio${comSubsidio === 1 ? '' : 's'}`],
          ].map(([r, v, d, cor]) => (
            <div key={r} style={{ ...cartao, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{r}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: cor }}>{carregando ? '…' : v}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d}</div>
            </div>
          ))}
        </section>

        <section style={cartao}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['todos', 'Todos'], ['pr', `No prejuízo (${conta('pr')})`], ['at', `Margem baixa (${conta('at')})`]].map(([id, r]) => (
              <button key={id} type="button" style={botaoFiltro(filtro === id)} onClick={() => setFiltro(id)}>{r}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 960 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                {['Anúncio', 'Vendas', 'Preço', 'Custo', 'Comissão', 'Frete', 'Subsídio ML', 'Lucro por venda', 'Preço mínimo', 'Situação'].map(t =>
                  <th key={t} style={{ padding: '8px 6px', fontWeight: 600 }}>{t}</th>)}
              </tr></thead>
              <tbody>
                {visiveis.map(l => {
                  const s = SITUACAO[l.grupo]
                  return (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px 6px', maxWidth: 280 }}><strong>{l.sku || l.id}</strong><div style={{ ...rotulo, fontSize: 12 }}>{l.titulo}</div></td>
                      <td style={{ padding: '12px 6px' }}>{l.unidades}</td>
                      <td style={{ padding: '12px 6px' }}>{m(l.preco)}</td>
                      <td style={{ padding: '12px 6px' }}>{m(l.custo)}</td>
                      <td style={{ padding: '12px 6px' }}>{m(l.comissao)}</td>
                      <td style={{ padding: '12px 6px' }}>{m(l.frete)}</td>
                      <td style={{ padding: '12px 6px' }}>{l.subsidio > 0 ? '+ ' + formatMoeda(l.subsidio) : '—'}</td>
                      <td style={{ padding: '12px 6px', fontWeight: 700, color: s?.cor }}>{m(l.lucro)}</td>
                      <td style={{ padding: '12px 6px' }}>{m(l.minimo)}</td>
                      <td style={{ padding: '12px 6px' }}>{s ? <span style={s.estilo}>{s.texto}</span> : <span style={rotulo}>sem custo</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!carregando && visiveis.length === 0 && <p style={rotulo}>Nenhum anúncio aqui.</p>}
          </div>
          <p style={{ ...rotulo, margin: '14px 0 0', fontSize: 12 }}>Lucro por venda já desconta comissão, frete, imposto do mês, ads e o custo do produto (com a nota fiscal). Preço mínimo = menor preço que ainda dá lucro.</p>
        </section>
      </div>
    </Layout>
  )
}
