// src/components/UploadPedidoCompra.jsx
// Sobe um pedido de compra (PDF/foto) → a IA lê → ela confere → "já foi pago?"
// → sobe o comprovante → salva pedido (+ pagamento) com os anexos.
// A IA só lê; gravar é sempre no botão Salvar.
import { useRef, useState } from 'react'
import api from '../services/api'
import ItensPedidoForm, { ITEM_VAZIO, totalDosItens } from './ItensPedidoForm'

const TIPOS = 'application/pdf,image/jpeg,image/png'
const TAMANHO_MAX = 10 * 1024 * 1024

const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }
const botaoPrimario = { padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }
const botaoSecundario = { padding: '8px 20px', background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatData(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
}

function Faixa({ tipo = 'aviso', children }) {
  const cor = tipo === 'erro' ? 'var(--color-danger)' : 'var(--color-warning)'
  return (
    <div style={{ borderLeft: `4px solid ${cor}`, background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function validarArquivo(arquivo) {
  if (!arquivo) return 'Escolha um arquivo.'
  if (!TIPOS.split(',').includes(arquivo.type)) return 'Só PDF, JPG ou PNG.'
  if (arquivo.size > TAMANHO_MAX) return 'Arquivo maior que 10 MB.'
  return null
}

function mensagemDe(err, padrao) {
  return err?.response?.data?.error || padrao
}

export default function UploadPedidoCompra({ fornecedores, fornecedorSel, onSalvo }) {
  const [etapa, setEtapa] = useState('ocioso')
  const [erro, setErro] = useState(null)
  const inputPedido = useRef(null)
  const inputComprovante = useRef(null)

  // rascunho do pedido, preenchido pela leitura e editado por ela
  const [fornecedorId, setFornecedorId] = useState(fornecedorSel.id)
  const [numeroPedido, setNumeroPedido] = useState('')
  const [dataPedido, setDataPedido] = useState('')
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }])
  const [leitura, setLeitura] = useState(null)   // resposta crua do /pedidos/ler
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewTipo, setPreviewTipo] = useState(null)
  const [pedidoSalvoId, setPedidoSalvoId] = useState(null)

  // pagamento
  const [pago, setPago] = useState(null)         // null | false | true
  const [comprovante, setComprovante] = useState(null) // resposta do /pagamentos/ler
  const [valorPix, setValorPix] = useState('')
  const [dataPix, setDataPix] = useState('')

  const totalItens = totalDosItens(itens)
  const somaDifere = leitura?.total_documento != null && Math.abs(totalItens - leitura.total_documento) > 0.05
  const fornecedorEscolhido = fornecedores.find(f => f.id === fornecedorId)
  const pixParaOutro = comprovante && !comprovante.leitura_falhou
    && comprovante.fornecedor_sugerido_id && comprovante.fornecedor_sugerido_id !== fornecedorId

  function reiniciar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setEtapa('ocioso'); setErro(null)
    setFornecedorId(fornecedorSel.id); setNumeroPedido(''); setDataPedido('')
    setItens([{ ...ITEM_VAZIO }]); setLeitura(null); setPreviewUrl(null); setPreviewTipo(null)
    setPedidoSalvoId(null)
    setPago(null); setComprovante(null); setValorPix(''); setDataPix('')
  }

  async function lerPedido(arquivo) {
    const invalido = validarArquivo(arquivo)
    if (invalido) { setErro(invalido); return }
    setErro(null); setEtapa('lendoPedido')
    const form = new FormData()
    form.append('arquivo', arquivo)
    try {
      const r = await api.post(`/api/fornecedores/${fornecedorSel.id}/pedidos/ler`, form)
      const lido = r.data
      setLeitura(lido)
      setPreviewUrl(URL.createObjectURL(arquivo))
      setPreviewTipo(arquivo.type)
      setFornecedorId(lido.fornecedor_sugerido_id || fornecedorSel.id)
      setNumeroPedido(lido.numero_pedido || '')
      setDataPedido(lido.data_pedido || '')
      setItens(lido.itens.length ? lido.itens : [{ ...ITEM_VAZIO }])
      setEtapa('conferindo')
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui ler o arquivo.'))
      setEtapa('ocioso')
    }
  }

  async function lerComprovante(arquivo) {
    const invalido = validarArquivo(arquivo)
    if (invalido) { setErro(invalido); return }
    setErro(null); setEtapa('lendoComprovante')
    const form = new FormData()
    form.append('arquivo', arquivo)
    try {
      const r = await api.post(`/api/fornecedores/${fornecedorId}/pagamentos/ler`, form)
      setComprovante(r.data)
      setValorPix(r.data.valor != null ? String(r.data.valor) : '')
      setDataPix(r.data.data_pagamento || '')
      setEtapa('conferindo')
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui ler o comprovante.'))
      setEtapa('conferindo')
    }
  }

  async function salvar(e) {
    e.preventDefault()
    setErro(null)
    if (!dataPedido) { setErro('Informe a data do pedido.'); return }
    if (pago === null) { setErro('Diga se o pedido já foi pago.'); return }
    if (pago && !comprovante) { setErro('Suba o comprovante do Pix.'); return }
    if (pago === false && pedidoSalvoId) {
      // o pedido já foi salvo antes (retomando depois de uma falha no pagamento)
      // e agora ela decidiu não pagar: não há mais nada a gravar.
      reiniciar()
      onSalvo(fornecedorId)
      return
    }
    setEtapa('salvando')
    if (!pedidoSalvoId) {
      try {
        const r = await api.post(`/api/fornecedores/${fornecedorId}/pedidos`, {
          data_pedido: dataPedido,
          numero_pedido: numeroPedido || null,
          itens: itens.map(i => ({ produto: i.produto, quantidade: parseFloat(i.quantidade), valor_unitario: parseFloat(i.valor_unitario) })),
          arquivo_token: leitura?.arquivo_token || null,
          alias_vendedor: leitura?.texto_vendedor || null,
        })
        setPedidoSalvoId(r.data.id)
      } catch (err) {
        setErro(mensagemDe(err, 'Erro ao salvar o pedido.'))
        setEtapa('conferindo')
        return
      }
    }
    if (pago) {
      try {
        await api.post(`/api/fornecedores/${fornecedorId}/pagamentos`, {
          valor: parseFloat(valorPix),
          data_pagamento: dataPix,
          id_transacao: comprovante.id_transacao || null,
          arquivo_token: comprovante.arquivo_token || null,
          alias_destinatario: comprovante.destinatario || null,
        })
      } catch (err) {
        // o pedido já foi salvo: não deixar parecer que tudo falhou
        setErro(`Pedido salvo, mas o pagamento não: ${mensagemDe(err, 'erro ao registrar')} — clique em Salvar pagamento para tentar de novo.`)
        setEtapa('conferindo')
        onSalvo(fornecedorId)
        return
      }
    }
    reiniciar()
    onSalvo(fornecedorId)
  }

  if (etapa === 'ocioso' || etapa === 'lendoPedido') {
    return (
      <>
        <input ref={inputPedido} type="file" accept={TIPOS} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) lerPedido(f) }} />
        <button onClick={() => inputPedido.current.click()} disabled={etapa === 'lendoPedido'} style={botaoSecundario}>
          {etapa === 'lendoPedido' ? 'Lendo o pedido…' : '📎 Subir pedido de compra'}
        </button>
        {erro && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '6px 0 0' }}>{erro}</p>}
      </>
    )
  }

  return (
    <form onSubmit={salvar} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: previewUrl ? '1fr 320px' : '1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {leitura?.leitura_falhou && (
          <Faixa>Não consegui ler esse arquivo. Preencha à mão — o arquivo fica anexado mesmo assim.</Faixa>
        )}

        <label style={{ fontSize: 13 }}>Esse pedido é de<br />
          <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} style={{ ...inputStyle, width: 260 }}>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.apelido || f.nome}</option>)}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Nº do pedido<br />
            <input value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </label>
          <label style={{ fontSize: 12 }}>Data do pedido<br />
            <input required type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} style={{ ...inputStyle, width: 170 }} />
          </label>
        </div>

        {leitura?.pedido_existente && (
          <Faixa>Esse pedido (nº {numeroPedido}) já está lançado em {formatData(leitura.pedido_existente.data_pedido)}. Lançar de novo?</Faixa>
        )}

        <ItensPedidoForm itens={itens} onChange={setItens} />

        {somaDifere && (
          <Faixa>A soma dos itens ({formatMoeda(totalItens)}) não bate com o total do documento ({formatMoeda(leitura.total_documento)}). Confira.</Faixa>
        )}

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Já foi pago?</span>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 14 }}>
            <label><input type="radio" name="pago" checked={pago === false} onChange={() => { setPago(false); setComprovante(null) }} /> Não</label>
            <label><input type="radio" name="pago" checked={pago === true} onChange={() => setPago(true)} /> Sim</label>
          </div>

          {pago && !comprovante && (
            <div style={{ marginTop: 12 }}>
              <input ref={inputComprovante} type="file" accept={TIPOS} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) lerComprovante(f) }} />
              <button type="button" onClick={() => inputComprovante.current.click()} disabled={etapa === 'lendoComprovante'} style={botaoSecundario}>
                {etapa === 'lendoComprovante' ? 'Lendo o comprovante…' : '📎 Subir comprovante do Pix'}
              </button>
            </div>
          )}

          {pago && comprovante && (
            <div style={{ marginTop: 12, background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
              {comprovante.leitura_falhou
                ? <Faixa>Não consegui ler o comprovante. Preencha valor e data.</Faixa>
                : <p style={{ margin: '0 0 8px', fontSize: 14 }}>
                    Pix de <strong>{formatMoeda(comprovante.valor)}</strong> em <strong>{formatData(comprovante.data_pagamento)}</strong>
                    {comprovante.destinatario && <> para <strong>{comprovante.destinatario}</strong></>}
                    <br /><span style={{ color: 'var(--color-text-muted)' }}>→ cobre {formatMoeda(Math.min(parseFloat(valorPix) || 0, totalItens))} de {formatMoeda(totalItens)} deste pedido</span>
                  </p>}
              {pixParaOutro && (
                <Faixa>Esse Pix foi para {comprovante.destinatario}, que não está associado a {fornecedorEscolhido?.apelido || fornecedorEscolhido?.nome}. É isso mesmo?</Faixa>
              )}
              {comprovante.pagamento_existente && (
                <Faixa tipo="erro">Esse comprovante já foi lançado em {formatData(comprovante.pagamento_existente.data_pagamento)} ({formatMoeda(comprovante.pagamento_existente.valor)}).</Faixa>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ fontSize: 12 }}>Valor (R$)<br />
                  <input required type="number" step="0.01" min="0.01" value={valorPix} onChange={e => setValorPix(e.target.value)} style={{ ...inputStyle, width: 140 }} />
                </label>
                <label style={{ fontSize: 12 }}>Data<br />
                  <input required type="date" value={dataPix} onChange={e => setDataPix(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                </label>
                <button type="button" onClick={() => setComprovante(null)} style={{ ...botaoSecundario, alignSelf: 'flex-end', padding: '8px 12px', fontSize: 12 }}>Trocar comprovante</button>
              </div>
            </div>
          )}
        </div>

        {erro && <p style={{ color: 'var(--color-danger)', margin: 0, fontSize: 13 }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={reiniciar} style={botaoSecundario}>{pedidoSalvoId ? 'Fechar' : 'Cancelar'}</button>
          <button type="submit" disabled={etapa === 'salvando'} style={botaoPrimario}>
            {etapa === 'salvando' ? 'Salvando…'
              : pedidoSalvoId && pago === false ? 'Concluir'
              : pedidoSalvoId ? 'Salvar pagamento'
              : pago && comprovante?.pagamento_existente ? 'Salvar mesmo assim'
              : pago ? 'Salvar pedido e pagamento' : 'Salvar pedido'}
          </button>
        </div>
      </div>

      {previewUrl && (
        <div style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
          {previewTipo === 'application/pdf'
            ? <object data={previewUrl} type="application/pdf" style={{ width: '100%', height: 420, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                <a href={previewUrl} target="_blank" rel="noopener">Abrir o PDF</a>
              </object>
            : <img src={previewUrl} alt="Pedido enviado" style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />}
        </div>
      )}
    </form>
  )
}
