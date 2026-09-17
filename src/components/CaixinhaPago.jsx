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
 *
 * Comprovante (pedido dela, 17/09/2026): subir o Pix preenche valor e data
 * pela leitura. Se esse Pix já estava lançado — um Pix que pagou dois pedidos,
 * como o de 49.310 de 14/09 —, o segundo pedido só é marcado, sem lançar o
 * dinheiro de novo.
 */
import { useState } from 'react'
import api from '../services/api'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Data do jsonify do Flask ("Mon, 14 Sep 2026 00:00:00 GMT") ou ISO para AAAA-MM-DD. */
function paraISO(v) {
  const s = String(v || '')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? hojeISO() : d.toISOString().slice(0, 10)
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
  const [pix, setPix] = useState(null)   // leitura do comprovante, em conferência
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

  async function lerComprovante(arquivo) {
    if (!arquivo) return
    setSalvando(true)
    setErro(null)
    const form = new FormData()
    form.append('arquivo', arquivo)
    try {
      const r = (await api.post(`/api/fornecedores/${fornecedorId}/pagamentos/ler`, form)).data
      if (r.pagamento_existente) {
        const dataExistente = paraISO(r.pagamento_existente.data_pagamento)
        await api.post(url, { modo: 'ja_lancado', data_pagamento: dataExistente })
        setAbrindo(false)
        onMudou?.()
        return
      }
      setPix({
        valor: r.valor != null ? String(r.valor) : String(pedido.valor_total),
        data: r.data_pagamento || data,
        leituraFalhou: r.leitura_falhou,
        aviso: r.aviso,
        id_transacao: r.id_transacao,
        arquivo_token: r.arquivo_token,
        destinatario: r.destinatario,
      })
    } catch (e) {
      setErro(e?.response?.data?.error || 'Não consegui ler o comprovante.')
    } finally {
      setSalvando(false)
    }
  }

  async function lancarComprovante() {
    const valor = Number(String(pix.valor).replace(',', '.'))
    if (!(valor > 0) || !pix.data) { setErro('Confira valor e data do Pix.'); return }
    setSalvando(true)
    setErro(null)
    try {
      // O endpoint de pagamento guarda o anexo e o ID do Pix, recusa comprovante
      // repetido e, com pedido_id, já marca o pedido como pago.
      await api.post(`/api/fornecedores/${fornecedorId}/pagamentos`, {
        valor,
        data_pagamento: pix.data,
        id_transacao: pix.id_transacao || null,
        arquivo_token: pix.arquivo_token || null,
        alias_destinatario: pix.destinatario || null,
        pedido_id: pedido.id,
      })
      setPix(null)
      setAbrindo(false)
      onMudou?.()
    } catch (e) {
      setErro(e?.response?.data?.error || 'Não consegui lançar o pagamento.')
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
            else { setErro(null); setPix(null); setAbrindo(v => !v) }
          }}
        />
        Pago
      </label>

      {abrindo && !pago && pix && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>
            {pix.leituraFalhou ? 'Não consegui ler o comprovante — preencha:' : 'Confira o Pix:'}
          </span>
          <input type="text" inputMode="decimal" value={pix.valor} aria-label="Valor do Pix"
                 onChange={e => setPix({ ...pix, valor: e.target.value })}
                 style={{ ...botao, padding: '4px 6px', width: 100 }} />
          <input type="date" value={pix.data} aria-label="Data do Pix"
                 onChange={e => setPix({ ...pix, data: e.target.value })}
                 style={{ ...botao, padding: '4px 6px' }} />
          <button type="button" style={botao} disabled={salvando} onClick={lancarComprovante}>
            Lançar com comprovante
          </button>
          <button type="button" style={botao} disabled={salvando} onClick={() => setPix(null)}>Voltar</button>
          {pix.aviso && <span style={{ color: 'var(--color-warning)' }}>{pix.aviso}</span>}
        </div>
      )}

      {abrindo && !pago && !pix && (
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
          <label style={{ ...botao, display: 'inline-block' }}>
            📎 Subir comprovante
            <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
                   disabled={salvando}
                   onChange={e => { lerComprovante(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" style={botao} disabled={salvando} onClick={() => setAbrindo(false)}>
            Cancelar
          </button>
        </div>
      )}

      {erro && <div style={{ marginTop: 4, color: 'var(--color-danger)' }}>{erro}</div>}
    </div>
  )
}
