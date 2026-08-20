/**
 * Lucro Real — a planilha de fechamento montada a partir dos dados do sistema.
 *
 * Reconstruída do CRM em 19/08/2026, no estilo do Painel.
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
 */
import { useCallback, useEffect, useState } from 'react'

import Layout from '../components/Layout'
import api from '../services/api'
import crmApi, { crmConfigurado } from '../services/crmApi'

const LOJAS = ['YUSO', 'M12', 'J12', 'LOCITECH']

const PARTES = {
  1: 'Receitas do mês',
  2: 'Deduções do marketplace',
  3: 'CMV',
  4: 'Despesas reais do mês',
  5: 'Saídas que não são prejuízo',
  8: 'Controle de estoque',
}

const brl = v => (v === null || v === undefined)
  ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const entrada = {
  padding: 6, background: 'var(--color-bg)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13,
}

const botao = (destaque = false) => ({
  padding: '6px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
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

  const linhas = dados?.linhas || []
  const partes = [...new Set(linhas.map(l => l.parte))].sort((a, b) => a - b)

  return (
    <Layout>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Lucro Real</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ fontSize: 13 }}>Loja{' '}
          <select value={loja} onChange={e => setLoja(e.target.value)} style={entrada}>
            {LOJAS.map(l => <option key={l}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>Mês{' '}
          <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} style={entrada} />
        </label>
        <button style={botao()} onClick={() => { carregarCrm(); carregarGalpao() }}>Atualizar</button>
      </div>

      {/* Contagem do galpão — vive no Painel, não depende do CRM */}
      <section style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Contagem do galpão</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 0 }}>
          Mercadoria que o Mercado Livre não enxerga. É um número do seu negócio,
          não de uma loja — vale para todas.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" step="0.01" min="0" value={valorGalpao} placeholder="0,00"
                 onChange={e => setValorGalpao(e.target.value)} style={{ ...entrada, width: 160 }} />
          <button style={botao(true)} onClick={salvarGalpao} disabled={salvandoGalpao || valorGalpao === ''}>
            {salvandoGalpao ? 'Salvando…' : galpao ? 'Atualizar contagem' : 'Registrar contagem'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {galpao
              ? `Registrado: ${brl(galpao.valor)}`
              : 'Ainda não registrado neste mês'}
          </span>
        </div>
        {erroGalpao && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{erroGalpao}</p>
        )}
      </section>

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

      {partes.map(parte => (
        <section key={parte} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>{PARTES[parte] || `Parte ${parte}`}</h2>
          {linhas.filter(l => l.parte === parte).map(l => (
            <div key={l.linha} style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '6px 0', borderBottom: '1px solid var(--color-border)',
            }}>
              <span style={{ flex: 1, fontSize: 13 }}>{l.rotulo}</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: l.origem === 'indisponivel' ? 'var(--color-text-muted)' : 'var(--color-text)',
              }}>{brl(l.valor)}</span>
              <button style={{ ...botao(), padding: '2px 8px' }} disabled={l.valor == null}
                      title="Copiar valor"
                      onClick={() => navigator.clipboard.writeText(String(l.valor ?? ''))}>
                copiar
              </button>
            </div>
          ))}
          {linhas.filter(l => l.parte === parte).some(l => l.aviso) && (
            <ul style={{ margin: '8px 0 0 18px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              {linhas.filter(l => l.parte === parte && l.aviso)
                .map(l => <li key={`aviso-${l.linha}`}>{l.aviso}</li>)}
            </ul>
          )}
        </section>
      ))}
    </Layout>
  )
}
