/**
 * "Foi desconto?" — quando o Pix ficou menor que o pedido.
 *
 * Pedido da Cibelly em 20/10/2026: o pedido do ALTOMEX era R$ 7.050,00, o Pix
 * foi R$ 6.556,50 e os R$ 493,50 de diferença ficaram "em aberto" para sempre.
 * Se houve pagamento amarrado ao pedido e ainda falta valor, a tela pergunta;
 * "Sim" grava a diferença como desconto (o servidor calcula) e o pedido fica
 * quitado. "Não" deixa como está: a diferença é dívida de verdade.
 */
import { useState } from 'react'

import api from '../services/api'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const botao = {
  background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  padding: '3px 9px', fontSize: 12, cursor: 'pointer',
}

/** Quanto ainda falta pagar do pedido, já considerando o desconto. */
export function faltaDoPedido(pedido) {
  const falta = Number(pedido.valor_total || 0) - Number(pedido.desconto || 0) - Number(pedido.amarrado || 0)
  return Math.round(falta * 100) / 100
}

export default function DescontoDoPedido({ fornecedorId, pedido, podeEditar, onMudou }) {
  const [ocupado, setOcupado] = useState(false)
  const [dispensado, setDispensado] = useState(false)
  const [erro, setErro] = useState(null)
  const url = `/api/fornecedores/${fornecedorId}/pedidos/${pedido.id}/desconto`
  const desconto = Number(pedido.desconto || 0)
  const falta = faltaDoPedido(pedido)

  async function chamar(fn) {
    setOcupado(true); setErro(null)
    try { await fn(); if (onMudou) await onMudou() } catch (e) {
      setErro(e?.response?.data?.error || 'Não consegui salvar o desconto.')
    } finally { setOcupado(false) }
  }

  if (desconto > 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Desconto {brl(desconto)}
        {podeEditar && (
          <button type="button" style={{ ...botao, marginLeft: 8 }} disabled={ocupado}
                  onClick={() => chamar(() => api.delete(url))}>Desfazer</button>
        )}
        {erro && <span role="alert" style={{ color: 'var(--color-danger)', marginLeft: 8 }}>{erro}</span>}
      </div>
    )
  }

  if (!podeEditar || dispensado || Number(pedido.amarrado || 0) <= 0 || falta <= 0.005) return null

  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>Faltam {brl(falta)}. Foi desconto?</span>
      <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
        <button type="button" style={botao} disabled={ocupado}
                onClick={() => chamar(() => api.post(url, {}))}>Sim, foi desconto</button>
        <button type="button" style={botao} disabled={ocupado}
                onClick={() => setDispensado(true)}>Não, ainda devo</button>
      </span>
      {erro && <span role="alert" style={{ color: 'var(--color-danger)', marginLeft: 8 }}>{erro}</span>}
    </div>
  )
}
