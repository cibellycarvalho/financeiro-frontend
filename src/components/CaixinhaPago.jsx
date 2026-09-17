/**
 * Caixinha "Pago" de um pedido de fornecedor.
 *
 * Pedido da Cibelly em 17/09/2026. Pagamento a fornecedor era um registro
 * corrido, distribuído do pedido mais antigo para o mais novo — mas ela paga
 * pedido específico, e o vencido da Flávia saía errado.
 *
 * Marcar oferece duas coisas, porque os Pix de agosto já estão lançados:
 *  - "Lançar pagamento": cria o pagamento do valor do pedido, amarrado a ele.
 *    É ele que sai da sobra na Caixa da Semana.
 *  - "Pix já lançado": só marca. Sem isso, marcar um pedido antigo lançaria o
 *    mesmo dinheiro de novo.
 * Desmarcar apaga o pagamento que estava amarrado ao pedido.
 */
import { useState } from 'react'
import api from '../services/api'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const botao = {
  background: 'var(--color-surface)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  padding: '5px 9px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
}

export default function CaixinhaPago({ fornecedorId, pedido, onMudou, podeEditar = true }) {
  const [abrindo, setAbrindo] = useState(false)
  const [data, setData] = useState(hojeISO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const pago = !!pedido.pago_em
  const url = `/api/fornecedores/${fornecedorId}/pedidos/${pedido.id}/pago`

  async function marcar(modo) {
    setSalvando(true)
    setErro(null)
    try {
      await api.post(url, { modo, data_pagamento: data })
      setAbrindo(false)
      onMudou?.()
    } catch (e) {
      setErro(e?.response?.data?.error || 'Não consegui marcar como pago.')
    } finally {
      setSalvando(false)
    }
  }

  async function desmarcar() {
    if (!window.confirm('Desmarcar como pago? O pagamento lançado para este pedido é apagado.')) return
    setSalvando(true)
    setErro(null)
    try {
      await api.delete(url)
      onMudou?.()
    } catch (e) {
      setErro(e?.response?.data?.error || 'Não consegui desmarcar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ fontSize: 12.5 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: podeEditar ? 'pointer' : 'default' }}>
        <input
          type="checkbox"
          checked={pago || abrindo}
          disabled={!podeEditar || salvando}
          onChange={() => {
            if (pago) desmarcar()
            else { setErro(null); setAbrindo(v => !v) }
          }}
        />
        Pago
      </label>

      {abrindo && !pago && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
                 aria-label="Data do pagamento"
                 style={{ ...botao, padding: '4px 6px' }} />
          <button type="button" style={botao} disabled={salvando} onClick={() => marcar('lancar')}>
            Lançar pagamento de {brl(pedido.valor_total)}
          </button>
          <button type="button" style={botao} disabled={salvando} onClick={() => marcar('ja_lancado')}>
            Pix já lançado
          </button>
          <button type="button" style={botao} disabled={salvando} onClick={() => setAbrindo(false)}>
            Cancelar
          </button>
        </div>
      )}

      {erro && <div style={{ marginTop: 4, color: 'var(--color-danger)' }}>{erro}</div>}
    </div>
  )
}
