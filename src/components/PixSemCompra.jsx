/**
 * Amarra um Pix às compras que ele pagou.
 *
 * Existe porque, em 23/09/2026, só 4 dos ~30 pagamentos lançados desde agosto
 * diziam qual compra pagaram — sem isso o comprovante não vai junto da nota no
 * pacote do mês. Um Pix pode cobrir mais de uma compra (o de R$ 49.310 pagou
 * 10/08 e 11/08), então a distribuição é da mais antiga para a mais nova e cada
 * valor pode ser editado à mão. Amarrar nunca é obrigatório — a seção só
 * aparece quando existe Pix solto (adiantamento parcial é válido de propósito).
 *
 * O backend já valida tudo (soma passar do Pix, passar do que a compra tem em
 * aberto, compra repetida, compra de outro fornecedor) e devolve a mensagem
 * pronta em português — este componente só mostra o que ele manda, sem
 * reescrever nem revalidar essas regras aqui.
 */
import { useEffect, useState } from 'react'
import api from '../services/api'
import SecaoCard from './SecaoCard'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const linha = {
  background: 'var(--color-row)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px 14px',
}

const botao = {
  padding: '6px 14px', fontSize: 12, marginTop: 8,
  background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)',
  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
}

const campoValor = {
  width: 100, marginLeft: 8, padding: '3px 6px', fontSize: 12,
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
  background: 'var(--color-bg)', color: 'var(--color-text)',
}

export default function PixSemCompra({ fornecedorId, pedidos, aoMudar }) {
  const [soltos, setSoltos] = useState([])
  const [escolhas, setEscolhas] = useState({})   // { [pagamentoId]: { [pedidoId]: valor } }
  const [erros, setErros] = useState({})         // { [pagamentoId]: mensagem }
  const [salvando, setSalvando] = useState(null) // pagamentoId em voo

  useEffect(() => {
    let vivo = true
    api.get(`/api/fornecedores/${fornecedorId}/pagamentos/soltos`)
      .then(r => vivo && setSoltos(r.data))
      .catch(() => vivo && setSoltos([]))
    return () => { vivo = false }
  }, [fornecedorId])

  if (!soltos.length) return null

  const emAberto = pedidos
    .filter(p => !p.pago_em)
    .sort((a, b) => String(a.data_pedido).localeCompare(String(b.data_pedido)))

  function alternar(pagamento, pedido) {
    setEscolhas(atual => {
      const desta = { ...(atual[pagamento.id] || {}) }
      if (desta[pedido.id] !== undefined) delete desta[pedido.id]
      else desta[pedido.id] = null
      // Distribui o valor do Pix da compra mais antiga para a mais nova.
      let restante = Number(pagamento.valor)
      const marcados = emAberto.filter(p => desta[p.id] !== undefined)
      marcados.forEach(p => {
        const cabe = Math.min(restante, Number(p.valor_total))
        desta[p.id] = Number(cabe.toFixed(2))
        restante -= cabe
      })
      return { ...atual, [pagamento.id]: desta }
    })
  }

  function editarValor(pagamento, pedido, valor) {
    setEscolhas(atual => ({
      ...atual,
      [pagamento.id]: { ...(atual[pagamento.id] || {}), [pedido.id]: valor === '' ? '' : Number(valor) },
    }))
  }

  async function amarrar(pagamento) {
    const desta = escolhas[pagamento.id] || {}
    const itens = emAberto
      .filter(p => desta[p.id] !== undefined && desta[p.id] !== '')
      .map(p => ({ pedido_id: p.id, valor: Number(desta[p.id]) }))
    setErros(atual => ({ ...atual, [pagamento.id]: null }))
    setSalvando(pagamento.id)
    try {
      await api.post(`/api/fornecedores/${fornecedorId}/pagamentos/${pagamento.id}/pedidos`, { itens })
      setSoltos(s => s.filter(x => x.id !== pagamento.id))
      aoMudar?.()
    } catch (e) {
      setErros(atual => ({ ...atual, [pagamento.id]: e.response?.data?.error || 'Não consegui amarrar. Tente de novo.' }))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <SecaoCard
      titulo="Pix sem compra"
      subtitulo="Estes pagamentos ainda não dizem qual compra pagaram. Amarrar é opcional — serve para o comprovante ir junto da nota quando você baixar o mês."
    >
      {soltos.map(pg => {
        const desta = escolhas[pg.id] || {}
        return (
          <div key={pg.id} style={linha}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 15 }}>{brl(pg.valor)}</strong>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {String(pg.data_pagamento).slice(0, 10).split('-').reverse().join('/')}
              </span>
            </div>

            {emAberto.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Não há compra em aberto deste fornecedor para amarrar.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {emAberto.map(p => {
                  const marcado = desta[p.id] !== undefined
                  return (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        aria-label={`pedido ${p.numero_pedido || 'sem número'}`}
                        checked={marcado}
                        disabled={salvando === pg.id}
                        onChange={() => alternar(pg, p)}
                      />
                      <span style={{ marginLeft: 8 }}>
                        {`pedido ${p.numero_pedido || 'sem número'} · ${String(p.data_pedido).slice(0, 10).split('-').reverse().join('/')} · ${brl(p.valor_total)}`}
                      </span>
                      {marcado && (
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`valor amarrado ao pedido ${p.numero_pedido || 'sem número'}`}
                          value={desta[p.id] ?? ''}
                          disabled={salvando === pg.id}
                          onClick={e => e.stopPropagation()}
                          onChange={e => editarValor(pg, p, e.target.value)}
                          style={campoValor}
                        />
                      )}
                    </label>
                  )
                })}
                <button
                  onClick={() => amarrar(pg)}
                  disabled={salvando === pg.id || Object.keys(desta).length === 0}
                  style={botao}
                >
                  {salvando === pg.id ? 'Amarrando...' : 'Amarrar'}
                </button>
              </div>
            )}

            {erros[pg.id] && (
              <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>
                {erros[pg.id]}
              </p>
            )}
          </div>
        )
      })}
    </SecaoCard>
  )
}
