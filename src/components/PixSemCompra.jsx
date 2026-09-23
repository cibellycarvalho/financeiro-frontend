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
 *
 * Fix round 1 (revisão do brief e da spec, 23/09/2026):
 *  - A redistribuição automática não pode mais sobrescrever um valor que a
 *    usuária já editou à mão — só mexe nas compras marcadas que ainda não
 *    foram tocadas (Set `tocados`, por Pix).
 *  - Um campo de valor apagado (marcado, mas sem número) trava o botão
 *    Amarrar com o motivo escrito na tela, em vez de sumir da amarração em
 *    silêncio.
 *  - A distribuição propõe `valor_total - amarrado` de cada compra (o que o
 *    backend manda em `GET /pedidos`), não o valor_total cheio — senão
 *    propunha amarrar de novo o que outro Pix já cobriu.
 *  - Busca os soltos de novo sempre que a lista de pedidos da tela mudar
 *    (não só quando troca de fornecedor), pra um Pix lançado do lado
 *    aparecer aqui sem precisar recarregar a página.
 *
 * Fix round 2 (23/09/2026): a guarda contra clique duplo do round 1 era um
 * único `salvando` (o id de um só Pix). Com dois Pix soltos na tela, clicar
 * em Amarrar no Pix B enquanto o Pix A ainda estava salvando não fazia nada
 * — sem erro, sem aviso, e o botão do B nem parecia desabilitado porque o
 * `disabled` já era por pagamento. Virou um objeto `{ [pagamentoId]: true }`:
 * cada Pix trava só a si mesmo, e vários podem salvar ao mesmo tempo.
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

function valorFaltando(v) {
  return v === '' || v === null || v === undefined
}

export default function PixSemCompra({ fornecedorId, pedidos, aoMudar }) {
  const [soltos, setSoltos] = useState([])
  const [escolhas, setEscolhas] = useState({})   // { [pagamentoId]: { [pedidoId]: valor } }
  const [tocados, setTocados] = useState({})     // { [pagamentoId]: Set(pedidoId) editado à mão }
  const [erros, setErros] = useState({})         // { [pagamentoId]: mensagem }
  const [salvando, setSalvando] = useState({})   // { [pagamentoId]: true } — Pix em voo, cada um independente

  useEffect(() => {
    let vivo = true
    api.get(`/api/fornecedores/${fornecedorId}/pagamentos/soltos`)
      .then(r => vivo && setSoltos(r.data))
      .catch(() => vivo && setSoltos([]))
    return () => { vivo = false }
    // `pedidos` muda de referência sempre que a tela recarrega os dados do
    // fornecedor — é o gatilho para buscar os soltos de novo sem precisar de
    // um prop dedicado (item 9 do fix round 1).
  }, [fornecedorId, pedidos])

  if (!soltos.length) return null

  const emAberto = pedidos
    .filter(p => !p.pago_em)
    .sort((a, b) => String(a.data_pedido).localeCompare(String(b.data_pedido)))

  // Distribui o que falta do Pix (descontado o que já está fixado por edição
  // manual) da compra mais antiga para a mais nova, só nas compras marcadas
  // que ainda não foram tocadas. Muta `desta` e devolve.
  function distribuir(pagamento, desta, tocadosDeste) {
    const marcados = emAberto.filter(p => desta[p.id] !== undefined)
    let restante = Number(pagamento.valor)
    marcados.forEach(p => {
      if (tocadosDeste.has(p.id)) restante -= Number(desta[p.id] || 0)
    })
    marcados.forEach(p => {
      if (tocadosDeste.has(p.id)) return
      const disponivel = Number(p.valor_total) - Number(p.amarrado || 0)
      const cabe = Math.max(0, Math.min(restante, disponivel))
      desta[p.id] = Number(cabe.toFixed(2))
      restante -= cabe
    })
    return desta
  }

  function alternar(pagamento, pedido) {
    const desta = { ...(escolhas[pagamento.id] || {}) }
    const tocadosDeste = new Set(tocados[pagamento.id] || [])
    if (desta[pedido.id] !== undefined) {
      delete desta[pedido.id]
      tocadosDeste.delete(pedido.id)
    } else {
      desta[pedido.id] = null
    }
    distribuir(pagamento, desta, tocadosDeste)
    setEscolhas(atual => ({ ...atual, [pagamento.id]: desta }))
    setTocados(atual => ({ ...atual, [pagamento.id]: tocadosDeste }))
  }

  function editarValor(pagamento, pedido, valor) {
    setEscolhas(atual => ({
      ...atual,
      [pagamento.id]: { ...(atual[pagamento.id] || {}), [pedido.id]: valor === '' ? '' : Number(valor) },
    }))
    setTocados(atual => {
      const setDeste = new Set(atual[pagamento.id] || [])
      setDeste.add(pedido.id)
      return { ...atual, [pagamento.id]: setDeste }
    })
  }

  async function amarrar(pagamento) {
    // Trava contra clique duplo do MESMO Pix, além do disabled do botão — não
    // pode ser um "salvando" global, senão o Pix B fica travado em silêncio
    // enquanto o Pix A está salvando (fix round 2).
    if (salvando[pagamento.id]) return
    const desta = escolhas[pagamento.id] || {}
    const itens = emAberto
      .filter(p => desta[p.id] !== undefined)
      .map(p => ({ pedido_id: p.id, valor: Number(desta[p.id]) }))
    setErros(atual => ({ ...atual, [pagamento.id]: null }))
    setSalvando(atual => ({ ...atual, [pagamento.id]: true }))
    try {
      await api.post(`/api/fornecedores/${fornecedorId}/pagamentos/${pagamento.id}/pedidos`, { itens })
      setSoltos(s => s.filter(x => x.id !== pagamento.id))
      aoMudar?.()
    } catch (e) {
      setErros(atual => ({ ...atual, [pagamento.id]: e.response?.data?.error || 'Não consegui amarrar. Tente de novo.' }))
    } finally {
      setSalvando(atual => {
        const { [pagamento.id]: _fora, ...resto } = atual
        return resto
      })
    }
  }

  return (
    <SecaoCard
      titulo="Pix sem compra"
      subtitulo="Estes pagamentos ainda não dizem qual compra pagaram. Amarrar é opcional — serve para o comprovante ir junto da nota quando você baixar o mês."
    >
      {soltos.map(pg => {
        const desta = escolhas[pg.id] || {}
        const marcados = Object.keys(desta)
        const faltaValor = marcados.some(id => valorFaltando(desta[id]))
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
                        disabled={!!salvando[pg.id]}
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
                          disabled={!!salvando[pg.id]}
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
                  disabled={!!salvando[pg.id] || marcados.length === 0 || faltaValor}
                  style={botao}
                >
                  {!!salvando[pg.id] ? 'Amarrando...' : 'Amarrar'}
                </button>
                {faltaValor && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-warning)' }}>
                    Preencha o valor de todas as compras marcadas antes de amarrar.
                  </p>
                )}
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
