/**
 * Fechamento mensal — compras, fretes, montagem e despesas.
 *
 * Reconstruída (não copiada) do CRM em 19/08/2026. O CRM usa React Query,
 * Tailwind, recharts e lucide; o Painel não tem nenhum deles. Trazer essas
 * bibliotecas pra cá deixaria dois estilos convivendo num app de seis telas —
 * a usuária escolheu que a tela tivesse a cara do Painel.
 *
 * O que foi preservado por ser comportamento, não aparência:
 *   - o total da compra é calculado AQUI, enquanto se digita (quantidade ×
 *     valor unitário). O servidor não calcula, no CRM nem aqui;
 *   - `coleta_sp` é um sim/não, não um valor;
 *   - despesa vinda de importação bancária não é editável (`editavel: false`);
 *   - o filtro de datas afeta os totais, não só a listagem.
 */
import { useCallback, useEffect, useState } from 'react'

import Layout from '../components/Layout'
import api from '../services/api'

const LOJAS = ['YUSO', 'M12', 'J12', 'LOCITECH']

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const hoje = new Date()
const ANOS = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1]

const brl = v => (v === null || v === undefined || v === '')
  ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const entrada = {
  width: '100%', padding: 6, background: 'var(--color-bg)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
}

const botao = (destaque = false) => ({
  padding: '6px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
  border: destaque ? 'none' : '1px solid var(--color-border)',
  background: destaque ? 'var(--color-accent-solid)' : 'transparent',
  color: destaque ? 'var(--color-on-accent)' : 'var(--color-text)',
})

/** Uma linha está dentro do filtro de datas? Sem filtro, tudo entra. */
function dentroDoFiltro(linha, de, ate) {
  if (!de && !ate) return true
  const d = (linha.data || '').slice(0, 10)
  if (!d) return false
  if (de && d < de) return false
  if (ate && d > ate) return false
  return true
}

function somar(linhas, campo) {
  return linhas.reduce((total, l) => total + (parseFloat(l[campo]) || 0), 0)
}

function Kpi({ rotulo, valor, cor, filtrado }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${cor}`, borderRadius: 'var(--radius-md)', padding: 14,
    }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
        {rotulo}{filtrado && <span style={{ color: 'var(--color-warning)' }}> · filtrado</span>}
      </p>
      <p style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>{valor}</p>
    </div>
  )
}

/**
 * Uma seção do fechamento: tabela com edição na própria linha, adicionar e
 * excluir. Genérica porque as quatro seções só diferem nas colunas.
 */
function Secao({ titulo, colunas, linhas, carregando, erro, onCriar, onSalvar, onExcluir }) {
  const [novo, setNovo] = useState({})
  const [editando, setEditando] = useState(null)   // id da linha em edição
  const [rascunho, setRascunho] = useState({})

  function mudar(setter, atual, coluna, valor) {
    const proximo = { ...atual, [coluna.key]: valor }
    setter(coluna.aoMudar ? coluna.aoMudar(proximo, coluna.key, valor) : proximo)
  }

  const total = somar(linhas, colunas.find(c => c.somar)?.key || '')

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{titulo}</h2>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {linhas.length} {linhas.length === 1 ? 'registro' : 'registros'} · {brl(total)}
        </span>
      </div>

      {erro && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>
          Não foi possível carregar: {erro}
        </p>
      )}

      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {colunas.map(c => (
                <th key={c.key} style={{
                  padding: '10px 12px', textAlign: c.direita ? 'right' : 'left',
                  color: 'var(--color-text-muted)', fontWeight: 500, whiteSpace: 'nowrap',
                }}>{c.label}</th>
              ))}
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={colunas.length + 1} style={{ padding: 16, color: 'var(--color-text-muted)' }}>
                Carregando…
              </td></tr>
            )}

            {!carregando && linhas.length === 0 && (
              <tr><td colSpan={colunas.length + 1} style={{ padding: 16, color: 'var(--color-text-muted)' }}>
                Nada lançado neste mês.
              </td></tr>
            )}

            {linhas.map(linha => {
              const emEdicao = editando === linha.id
              // Linha vinda de importação bancária: registro do banco, não
              // lançamento manual. Não se edita nem se apaga pela tela.
              const bloqueada = linha.editavel === false
              return (
                <tr key={linha.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {colunas.map(c => (
                    <td key={c.key} style={{ padding: '8px 12px', textAlign: c.direita ? 'right' : 'left' }}>
                      {emEdicao && !c.somenteLeitura ? (
                        c.tipo === 'bool' ? (
                          <input type="checkbox" checked={!!rascunho[c.key]}
                                 onChange={e => mudar(setRascunho, rascunho, c, e.target.checked)} />
                        ) : (
                          <input type={c.tipo || 'text'} value={rascunho[c.key] ?? ''} style={entrada}
                                 onChange={e => mudar(setRascunho, rascunho, c, e.target.value)} />
                        )
                      ) : (
                        c.exibir ? c.exibir(linha[c.key]) : (linha[c.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {bloqueada ? (
                      <span title="Veio de importação bancária — registro do banco, não lançamento manual"
                            style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>importada</span>
                    ) : emEdicao ? (
                      <>
                        <button style={botao(true)} onClick={async () => {
                          await onSalvar(linha.id, rascunho); setEditando(null)
                        }}>Salvar</button>{' '}
                        <button style={botao()} onClick={() => setEditando(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button style={botao()} onClick={() => { setEditando(linha.id); setRascunho(linha) }}>
                          Editar
                        </button>{' '}
                        <button style={{ ...botao(), color: 'var(--color-danger)' }}
                                onClick={() => { if (confirm('Excluir este lançamento?')) onExcluir(linha.id) }}>
                          Excluir
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* linha de adicionar */}
            <tr>
              {colunas.map(c => (
                <td key={c.key} style={{ padding: '8px 12px' }}>
                  {c.somenteLeitura ? (
                    <span style={{ color: 'var(--color-text-muted)' }}>{brl(novo[c.key])}</span>
                  ) : c.tipo === 'bool' ? (
                    <input type="checkbox" checked={!!novo[c.key]}
                           onChange={e => mudar(setNovo, novo, c, e.target.checked)} />
                  ) : (
                    <input type={c.tipo || 'text'} placeholder={c.label} value={novo[c.key] ?? ''}
                           style={entrada}
                           onChange={e => mudar(setNovo, novo, c, e.target.value)} />
                  )}
                </td>
              ))}
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                <button style={botao(true)} onClick={async () => {
                  await onCriar(novo); setNovo({})
                }}>Adicionar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function Fechamento() {
  const [loja, setLoja] = useState(LOJAS[0])
  const [mes, setMes] = useState(String(hoje.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno] = useState(String(hoje.getFullYear()))
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const [dados, setDados] = useState({ compras: [], fretes: [], montagem: [], despesas: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const mesAno = `${ano}-${mes}`
  const temFiltro = Boolean(de || ate)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const q = `mes_ano=${mesAno}&conta_ml=${loja}`
      const [compras, fretes, montagem, despesas] = await Promise.all([
        api.get(`/api/fechamento/compras?${q}`),
        api.get(`/api/fechamento/fretes?${q}`),
        api.get(`/api/fechamento/montagem?${q}`),
        api.get(`/api/fechamento/despesas-unificadas?competencia=${mesAno}&conta_ml=${loja}`),
      ])
      setDados({
        compras: compras.data,
        fretes: fretes.data,
        montagem: montagem.data,
        despesas: despesas.data.despesas,
      })
    } catch (e) {
      // Dizer o que houve, em vez de mostrar tabela vazia — tabela vazia parece
      // "não lancei nada neste mês", que é conclusão errada e cara.
      setErro(e?.response?.data?.error || e.message)
    } finally {
      setCarregando(false)
    }
  }, [mesAno, loja])

  useEffect(() => { carregar() }, [carregar])

  function acoes(recurso) {
    return {
      onCriar: async corpo => {
        await api.post(`/api/fechamento/${recurso}?conta_ml=${loja}`, { ...corpo, mes_ano: mesAno })
        carregar()
      },
      onSalvar: async (id, corpo) => {
        await api.put(`/api/fechamento/${recurso}/${id}?conta_ml=${loja}`, corpo)
        carregar()
      },
      onExcluir: async id => {
        await api.delete(`/api/fechamento/${recurso}/${id}?conta_ml=${loja}`)
        carregar()
      },
    }
  }

  /** Total da compra = quantidade × valor unitário, calculado enquanto digita.
      É assim no CRM, e o servidor não recalcula — nem lá, nem aqui. */
  function totalDaCompra(linha) {
    const qtd = parseFloat(linha.quantidade) || 0
    const unit = parseFloat(linha.valor_unitario) || 0
    return qtd && unit ? { ...linha, valor_total: (qtd * unit).toFixed(2) } : linha
  }

  const colunasCompras = [
    { key: 'data', label: 'Data', tipo: 'date' },
    { key: 'fornecedor', label: 'Fornecedor' },
    { key: 'produto', label: 'Produto' },
    { key: 'quantidade', label: 'Qtd', tipo: 'number', direita: true, aoMudar: totalDaCompra },
    { key: 'valor_unitario', label: 'V. Unit.', tipo: 'number', direita: true,
      exibir: brl, aoMudar: totalDaCompra },
    { key: 'valor_total', label: 'Total', direita: true, exibir: brl, somenteLeitura: true, somar: true },
    { key: 'status', label: 'Status' },
    { key: 'nota', label: 'Obs.' },
  ]

  const colunasFretes = [
    { key: 'data', label: 'Data', tipo: 'date' },
    { key: 'motorista', label: 'Motorista' },
    // Sim/não, não valor em reais.
    { key: 'coleta_sp', label: 'Coleta SP', tipo: 'bool', exibir: v => (v ? 'Sim' : 'Não') },
    { key: 'frete_full', label: 'Frete Full', tipo: 'number', direita: true, exibir: brl },
    { key: 'total', label: 'Total', tipo: 'number', direita: true, exibir: brl, somar: true },
    { key: 'status', label: 'Status' },
  ]

  const colunasMontagem = [
    { key: 'data', label: 'Data', tipo: 'date' },
    { key: 'montador', label: 'Montador' },
    { key: 'valor', label: 'Valor', tipo: 'number', direita: true, exibir: brl, somar: true },
  ]

  const colunasDespesas = [
    { key: 'data', label: 'Data', tipo: 'date' },
    { key: 'categoria', label: 'Categoria' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'valor', label: 'Valor', tipo: 'number', direita: true, exibir: brl, somar: true },
    { key: 'status', label: 'Status' },
  ]

  const filtrar = linhas => linhas.filter(l => dentroDoFiltro(l, de, ate))
  const compras = filtrar(dados.compras)
  const fretes = filtrar(dados.fretes)
  const montagem = filtrar(dados.montagem)
  const despesas = filtrar(dados.despesas)

  const totalCompras = somar(compras, 'valor_total')
  const totalFretes = somar(fretes, 'total')
  const totalMontagem = somar(montagem, 'valor')
  const totalDespesas = somar(despesas, 'valor')
  const totalGeral = totalCompras + totalFretes + totalMontagem + totalDespesas

  return (
    <Layout>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Fechamento</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ fontSize: 13 }}>Loja{' '}
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...entrada, width: 'auto' }}>
            {LOJAS.map(l => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>Mês{' '}
          <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...entrada, width: 'auto' }}>
            {MESES.map((nome, i) => (
              <option key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>Ano{' '}
          <select value={ano} onChange={e => setAno(e.target.value)} style={{ ...entrada, width: 'auto' }}>
            {ANOS.map(a => <option key={a}>{a}</option>)}
          </select>
        </label>

        <span style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 12, fontSize: 13 }}>
          Filtrar datas{' '}
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ ...entrada, width: 'auto' }} />
          {' até '}
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...entrada, width: 'auto' }} />
          {temFiltro && (
            <button style={{ ...botao(), marginLeft: 8 }} onClick={() => { setDe(''); setAte('') }}>
              Limpar
            </button>
          )}
        </span>

        <button style={botao()} onClick={carregar}>Atualizar</button>
      </div>

      {temFiltro && (
        <p style={{ fontSize: 12, color: 'var(--color-warning)', marginTop: -8 }}>
          Filtro de data aplicado — os totais abaixo consideram só o período escolhido.
        </p>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        <Kpi rotulo="Compras" valor={brl(totalCompras)} cor="var(--color-accent-solid)" filtrado={temFiltro} />
        <Kpi rotulo="Fretes" valor={brl(totalFretes)} cor="var(--color-warning)" filtrado={temFiltro} />
        <Kpi rotulo="Montagem" valor={brl(totalMontagem)} cor="var(--color-text-muted)" filtrado={temFiltro} />
        <Kpi rotulo="Despesas" valor={brl(totalDespesas)} cor="var(--color-danger)" filtrado={temFiltro} />
        <Kpi rotulo="Total Geral" valor={brl(totalGeral)} cor="var(--color-success-solid)" filtrado={temFiltro} />
      </div>

      <Secao titulo="Compras" colunas={colunasCompras} linhas={compras}
             carregando={carregando} erro={erro} {...acoes('compras')} />
      <Secao titulo="Fretes" colunas={colunasFretes} linhas={fretes}
             carregando={carregando} erro={erro} {...acoes('fretes')} />
      <Secao titulo="Montagem" colunas={colunasMontagem} linhas={montagem}
             carregando={carregando} erro={erro} {...acoes('montagem')} />
      <Secao titulo="Despesas" colunas={colunasDespesas} linhas={despesas}
             carregando={carregando} erro={erro} {...acoes('despesas')} />
    </Layout>
  )
}
