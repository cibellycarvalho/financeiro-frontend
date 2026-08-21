/**
 * Lucro Real — os números do mês, prontos para a planilha de fechamento.
 *
 * Esta tela fala com DOIS backends, e isso é de propósito:
 *   - o CRM calcula o Lucro Real e captura o estoque, porque as duas coisas
 *     dependem da integração com o Mercado Livre, que só existe lá;
 *   - o Painel guarda a contagem do galpão, que é um número contado à mão e
 *     não tem nada de ML.
 *
 * Cada bloco trata seu próprio erro: se o CRM não responder, a contagem do
 * galpão continua funcionando, e vice-versa. Uma tela em branco esconderia
 * qual das duas partes falhou.
 *
 * Layout redesenhado em 21/08/2026 a pedido dela, tendo o Finco como
 * referência — o SaaS de gestão financeira que ela assina. Do Finco vieram a
 * ESTRUTURA e o respiro: cabeçalho com subtítulo, filtros num cartão próprio,
 * seções com total no rodapé, valores em linhas destacadas. As cores e a fonte
 * continuam as da Cravelli: a identidade foi escolha dela no rebrand de agosto,
 * e copiar o cinza-e-azul do Finco desfaria isso sem ninguém pedir.
 *
 * A tela NÃO calcula o lucro final, e isso é intencional: ela alimenta a
 * planilha FECHAMENTO ATT.xlsx, que é onde o fechamento acontece. Por isso o
 * número da linha da planilha aparece em cada valor.
 */
import { useCallback, useEffect, useState } from 'react'

import Layout from '../components/Layout'
import SecaoCard from '../components/SecaoCard'
import LinhaValor from '../components/LinhaValor'
import api from '../services/api'
import crmApi, { crmConfigurado } from '../services/crmApi'

const LOJAS = ['YUSO', 'M12', 'J12', 'LOCITECH']

/** Título e uma linha dizendo o que entra na parte. O subtítulo evita a
    pergunta "o que cai aqui?" toda vez que ela abre a tela. */
const PARTES = {
  1: { titulo: 'Receitas do mês', sub: 'Tudo que entrou como venda, antes de qualquer desconto.' },
  2: { titulo: 'Deduções do marketplace', sub: 'O que o Mercado Livre retém e o que voltou como cancelamento.' },
  3: { titulo: 'CMV', sub: 'Quanto custaram os produtos que saíram no mês.' },
  4: { titulo: 'Despesas reais do mês', sub: 'Dinheiro que saiu e não volta.' },
  5: { titulo: 'Saídas que não são prejuízo', sub: 'Saiu do caixa, mas virou estoque — não é despesa.' },
  8: { titulo: 'Controle de estoque', sub: 'Mercadoria parada no fim do mês, dentro e fora do Full.' },
}

const brl = v => (v === null || v === undefined)
  ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Anda `passo` meses a partir de "YYYY-MM". Existe pra dar as setas ‹ › do
    Finco: abrir o calendário só pra ver o mês anterior é caro demais. */
function deslocarMes(mesAno, passo) {
  const [a, m] = mesAno.split('-').map(Number)
  const d = new Date(a, m - 1 + passo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const entrada = {
  padding: '7px 10px', background: 'var(--color-bg)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
}

const botao = (destaque = false) => ({
  padding: '7px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
  border: destaque ? 'none' : '1px solid var(--color-border)',
  background: destaque ? 'var(--color-accent-solid)' : 'transparent',
  color: destaque ? 'var(--color-on-accent)' : 'var(--color-text)',
})

function Aviso({ tom, titulo, children }) {
  const cores = {
    bom: 'var(--color-success)',
    atencao: 'var(--color-warning)',
    neutro: 'var(--color-text-muted)',
  }
  return (
    <div style={{
      border: `1px solid ${cores[tom]}`, borderLeft: `3px solid ${cores[tom]}`,
      borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 16,
    }}>
      {titulo && <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{titulo}</p>}
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{children}</div>
    </div>
  )
}

function Conferencia({ c }) {
  if (!c) return null
  if (c.status === 'indisponivel') {
    return <Aviso tom="neutro" titulo="Conferência indisponível">{c.motivo}</Aviso>
  }
  const bate = c.status === 'bate'
  return (
    <Aviso tom={bate ? 'bom' : 'atencao'}
           titulo={bate
             ? 'Bate! Estoque, compras e CMV estão consistentes.'
             : 'Não bateu — a diferença passou de 5%.'}>
      <p style={{ margin: '4px 0' }}>
        CMV pela movimentação do estoque: {brl(c.cmv_teorico)} · CMV do sistema:{' '}
        {brl(c.cmv_informado)} · diferença: {brl(c.diferenca)}
      </p>
      {c.causas_provaveis?.length > 0 && (
        <ul style={{ margin: '6px 0 0 18px' }}>
          {c.causas_provaveis.map((causa, i) => <li key={i}>{causa}</li>)}
        </ul>
      )}
    </Aviso>
  )
}

export default function LucroReal() {
  const [loja, setLoja] = useState(LOJAS[0])
  const [mesAno, setMesAno] = useState(mesAtual())

  const [dados, setDados] = useState(null)
  const [erroCrm, setErroCrm] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const [galpao, setGalpao] = useState(null)
  const [erroGalpao, setErroGalpao] = useState(null)
  const [valorGalpao, setValorGalpao] = useState('')
  const [salvandoGalpao, setSalvandoGalpao] = useState(false)
  const [copiada, setCopiada] = useState(null)

  const carregarCrm = useCallback(async () => {
    setCarregando(true)
    setErroCrm(null)
    if (!crmConfigurado()) {
      setErroCrm('O endereço do sistema de vendas não está configurado neste ambiente.')
      setCarregando(false)
      return
    }
    try {
      const r = await crmApi.get(
        `/api/fechamento/lucro-real?mes_ano=${mesAno}&conta_ml=${loja}`)
      setDados(r.data)
    } catch (e) {
      // Dizer que foi o sistema de vendas que não respondeu — sem isso, a tela
      // fica vazia e parece que o mês não tem dado.
      setErroCrm(e?.response?.data?.erro
        || 'O sistema de vendas não respondeu. Os lançamentos do fechamento continuam disponíveis.')
    } finally {
      setCarregando(false)
    }
  }, [mesAno, loja])

  const carregarGalpao = useCallback(async () => {
    setErroGalpao(null)
    try {
      const r = await api.get(`/api/fechamento/galpao?mes_ano=${mesAno}`)
      setGalpao(r.data)
      setValorGalpao(String(r.data.valor ?? ''))
    } catch (e) {
      if (e?.response?.status === 404) {
        // 404 aqui não é erro: é "ainda não contei este mês", que é diferente
        // de "contei e deu zero".
        setGalpao(null)
        setValorGalpao('')
      } else {
        setErroGalpao(e?.response?.data?.error || e.message)
      }
    }
  }, [mesAno])

  useEffect(() => { carregarCrm() }, [carregarCrm])
  useEffect(() => { carregarGalpao() }, [carregarGalpao])

  async function salvarGalpao() {
    setSalvandoGalpao(true)
    setErroGalpao(null)
    try {
      await api.put('/api/fechamento/galpao', {
        mes_ano: mesAno,
        valor: parseFloat(valorGalpao),
      })
      await carregarGalpao()
      carregarCrm()   // a conferência usa o galpão; recalcula com o número novo
    } catch (e) {
      setErroGalpao(e?.response?.data?.error || e.message)
    } finally {
      setSalvandoGalpao(false)
    }
  }

  function copiar(linha) {
    navigator.clipboard.writeText(String(linha.valor ?? ''))
    setCopiada(linha.linha)
    setTimeout(() => setCopiada(c => (c === linha.linha ? null : c)), 1500)
  }

  const linhas = dados?.linhas || []
  const partes = [...new Set(linhas.map(l => l.parte))].sort((a, b) => a - b)

  /** Soma da parte. Devolve null se QUALQUER linha estiver sem valor: um total
      parcial passaria por completo e ela somaria menos do que devia na
      planilha. Mesma regra que o backend usa nos cancelamentos. */
  function subtotal(daParte) {
    if (daParte.length < 2) return undefined          // uma linha só não precisa de total
    if (daParte.some(l => l.valor === null || l.valor === undefined)) return null
    return daParte.reduce((s, l) => s + Number(l.valor), 0)
  }

  return (
    <Layout>
      {/* Cabeçalho: o que é a tela e de qual loja. O seletor de loja fica aqui
          em cima, junto do título, como no Finco — é a pergunta "de quem são
          estes números?", não um filtro qualquer. */}
      <header style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Lucro Real</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Os números do mês prontos para a planilha de fechamento.
          </p>
        </div>
        <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loja{' '}
          <select value={loja} onChange={e => setLoja(e.target.value)} style={entrada}>
            {LOJAS.map(l => <option key={l}>{l}</option>)}
          </select>
        </label>
      </header>

      {/* Filtros no seu próprio cartão, com setas pra andar de mês em mês */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
      }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mês</span>
        <button style={{ ...botao(), padding: '6px 12px' }} title="Mês anterior"
                onClick={() => setMesAno(m => deslocarMes(m, -1))}>‹</button>
        <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={entrada} />
        <button style={{ ...botao(), padding: '6px 12px' }} title="Mês seguinte"
                onClick={() => setMesAno(m => deslocarMes(m, 1))}>›</button>
        <button style={{ ...botao(), marginLeft: 'auto' }}
                onClick={() => { carregarCrm(); carregarGalpao() }}>Atualizar</button>
      </div>

      {carregando && <p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p>}

      {erroCrm && <Aviso tom="atencao" titulo="Não foi possível calcular o Lucro Real">{erroCrm}</Aviso>}

      {dados?.pendencias?.length > 0 && (
        <Aviso tom="atencao" titulo="Pendências deste mês">
          <ul style={{ margin: '4px 0 0 18px' }}>
            {dados.pendencias.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          {dados.contas_faltando?.length > 0 && (
            <p>Falta registrar o estoque de: <strong>{dados.contas_faltando.join(', ')}</strong>.</p>
          )}
        </Aviso>
      )}

      <Conferencia c={dados?.conferencia} />

      {partes.map(parte => {
        const daParte = linhas.filter(l => l.parte === parte)
        const soma = subtotal(daParte)
        const info = PARTES[parte] || { titulo: `Parte ${parte}` }
        return (
          <SecaoCard
            key={parte}
            titulo={info.titulo}
            subtitulo={info.sub}
            total={soma === undefined ? undefined : (soma === null ? '—' : brl(soma))}
            totalRotulo={soma === null ? 'Total — falta apurar um valor' : 'Total'}
          >
            {daParte.map(l => (
              <LinhaValor
                key={l.linha}
                linha={l.linha}
                rotulo={l.rotulo}
                copiado={copiada === l.linha}
                valor={l.valor}
                aviso={l.aviso}
                indisponivel={l.origem === 'indisponivel'}
                onCopiar={() => copiar(l)}
              />
            ))}

            {/* A contagem do galpão vive aqui dentro, junto do valor que ela
                alimenta. Antes abria a tela, acima de tudo, sendo um campo de
                digitação — e a pessoa lia o formulário antes de ver os
                números. */}
            {parte === 8 && (
              <div style={{
                marginTop: 4, padding: '12px 14px',
                border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)',
              }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                  Contagem do galpão
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Mercadoria que o Mercado Livre não enxerga. É um número do seu negócio,
                  não de uma loja — vale para todas.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="number" step="0.01" min="0" value={valorGalpao} placeholder="0,00"
                         onChange={e => setValorGalpao(e.target.value)}
                         style={{ ...entrada, width: 150 }} />
                  <button style={botao(true)} onClick={salvarGalpao}
                          disabled={salvandoGalpao || valorGalpao === ''}>
                    {salvandoGalpao ? 'Salvando…' : galpao ? 'Atualizar contagem' : 'Registrar contagem'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {galpao
                      ? `Registrado: ${brl(galpao.valor)}`
                      : 'Ainda não registrado neste mês'}
                  </span>
                </div>
                {erroGalpao && (
                  <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '8px 0 0' }}>
                    {erroGalpao}
                  </p>
                )}
              </div>
            )}
          </SecaoCard>
        )
      })}
    </Layout>
  )
}
