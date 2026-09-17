// src/components/UploadDocumentoFuncionario.jsx
// Cartão de conferência de um documento de funcionário: sobe o arquivo (ou
// abre vazio, "à mão") → a IA lê → ela confere → Salvar. A IA só lê; gravar
// é sempre no botão. Um componente para os quatro casos (pagamento, boleto do
// DAS, comprovante do DAS, NF) porque a mecânica é a mesma; o que muda são os
// campos e o corpo que vai para a API.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { Faixa, PreviewArquivo, inputStyle, botaoPrimario, botaoSecundario, formatMoeda, formatData, mensagemDe, validarArquivo } from './upload/comum'
import { rotuloMes } from '../lib/meses'

const ROTA_LEITURA = { pagamento: 'pix', das_boleto: 'das', das_comprovante: 'pix', nf: 'nf' }
const TITULO = { pagamento: 'Pagamento', das_boleto: 'Boleto do DAS', das_comprovante: 'Comprovante do DAS', nf: 'Nota fiscal' }
const ROTULO_EXISTENTE = { das_boleto: 'DAS', nf: 'NF' }

const hojeISO = () => new Date().toISOString().slice(0, 10)
const mesDeISO = d => (d ? String(d).slice(0, 7) : null)

export default function UploadDocumentoFuncionario({ funcionario, tipo, competencia, arquivo, existente, onSalvo, onCancelar }) {
  const [etapa, setEtapa] = useState(arquivo ? 'lendo' : 'conferindo')
  const [leitura, setLeitura] = useState(null)
  const [erro, setErro] = useState(null)
  const [conflito, setConflito] = useState(null)   // { id, mensagem } — 409 do POST
  const [previewUrl] = useState(() => (arquivo ? URL.createObjectURL(arquivo) : null))

  const [comp, setComp] = useState(competencia)
  const [valor, setValor] = useState(() => {
    if (tipo === 'pagamento') return funcionario.valor_combinado ?? ''
    if (existente?.valor != null) return existente.valor
    return ''
  })
  const [data, setData] = useState(hojeISO())          // pago_em
  const [vencimento, setVencimento] = useState(existente?.vencimento?.slice(0, 10) || '')
  const [numeroNf, setNumeroNf] = useState(existente?.numero_nf || '')

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  useEffect(() => {
    if (!arquivo) return
    const invalido = validarArquivo(arquivo)
    if (invalido) { setErro(invalido); setEtapa('conferindo'); return }
    const form = new FormData()
    form.append('arquivo', arquivo)
    api.post(`/api/funcionarios/${funcionario.id}/ler/${ROTA_LEITURA[tipo]}`, form)
      .then(r => { setLeitura(r.data); preencher(r.data) })
      .catch(err => setErro(mensagemDe(err, 'Não consegui ler o arquivo.')))
      .finally(() => setEtapa('conferindo'))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function preencher(lido) {
    if (lido.leitura_falhou) return
    if (tipo === 'pagamento' || tipo === 'das_comprovante') {
      if (lido.valor != null) setValor(lido.valor)
      if (lido.data_pagamento) setData(lido.data_pagamento)
    }
    if (tipo === 'das_boleto') {
      if (lido.valor != null) setValor(lido.valor)
      setVencimento(lido.vencimento || '')
      if (lido.competencia) setComp(mesDeISO(lido.competencia))
    }
    if (tipo === 'nf') {
      setNumeroNf(lido.numero || '')
      if (lido.valor != null) setValor(lido.valor)
      if (lido.competencia) setComp(mesDeISO(lido.competencia))
    }
  }

  // DAS/NF que já existe na competência escolhida: o do mês aberto (vem da
  // página) ou o do mês lido (vem do /ler). Outro mês qualquer → só o 409 diz.
  const compLida = mesDeISO(leitura?.competencia)
  const jaExiste = tipo === 'das_comprovante' ? null
    : comp === competencia ? existente
    : comp === compLida ? (leitura?.das_existente || leitura?.nf_existente || null)
    : null
  const alvoPut = conflito?.id || (tipo === 'das_comprovante' ? existente?.id : jaExiste?.id) || null

  function corpo() {
    const token = leitura?.arquivo_token || null
    if (tipo === 'pagamento') return { tipo: 'pagamento', competencia: comp, valor: parseFloat(valor), pago_em: data, id_transacao: leitura?.id_transacao || null, arquivo_token: token }
    if (tipo === 'das_boleto') return { tipo: 'das', competencia: comp, valor: parseFloat(valor), vencimento: vencimento || null, boleto_token: token }
    if (tipo === 'das_comprovante') return { tipo: 'das', competencia, valor: parseFloat(valor), pago_em: data, id_transacao: leitura?.id_transacao || null, comprovante_token: token }
    return { tipo: 'nf', competencia: comp, numero_nf: numeroNf || null, valor: valor === '' ? null : parseFloat(valor), arquivo_token: token }
  }

  function validar() {
    if (tipo !== 'das_comprovante' && !comp) return 'Informe a competência.'
    if (tipo !== 'nf' && !(parseFloat(valor) > 0)) return 'Informe o valor.'
    if ((tipo === 'pagamento' || tipo === 'das_comprovante') && !data) return 'Informe a data do pagamento.'
    if (tipo === 'nf' && !numeroNf && !leitura?.arquivo_token) return 'Informe o número da nota ou suba o arquivo.'
    return null
  }

  async function salvar(e, forcarPut = null) {
    e?.preventDefault()
    if (etapa === 'salvando') return
    const invalido = validar()
    if (invalido) { setErro(invalido); return }
    setErro(null); setEtapa('salvando')
    const alvo = forcarPut || alvoPut
    const compSalva = tipo === 'das_comprovante' ? competencia : comp
    try {
      if (alvo) await api.put(`/api/funcionarios/${funcionario.id}/lancamentos/${alvo}`, corpo())
      else await api.post(`/api/funcionarios/${funcionario.id}/lancamentos`, corpo())
      onSalvo(compSalva)
    } catch (err) {
      const r = err.response
      if (r?.status === 409 && r.data?.existente_id && tipo !== 'pagamento') setConflito({ id: r.data.existente_id, mensagem: r.data.error })
      else setErro(mensagemDe(err, 'Não consegui salvar.'))
      setEtapa('conferindo')
    }
  }

  const campoCompetencia = (
    <label style={{ fontSize: 12 }}>Competência (mês do serviço)<br />
      <input type="month" value={comp} onChange={e => setComp(e.target.value)} style={{ ...inputStyle, width: 170 }} />
    </label>
  )
  const campoValor = (
    <label style={{ fontSize: 12 }}>Valor (R$)<br />
      <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} style={{ ...inputStyle, width: 140 }} />
    </label>
  )
  const campoPagoEm = (
    <label style={{ fontSize: 12 }}>Pago em<br />
      <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ ...inputStyle, width: 160 }} />
    </label>
  )

  return (
    <form onSubmit={salvar} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: previewUrl ? '1fr 320px' : '1fr', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {TITULO[tipo]} · {funcionario.nome}
          {tipo === 'das_comprovante' && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · {rotuloMes(competencia)}</span>}
        </div>

        {etapa === 'lendo' && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Lendo o arquivo…</p>}
        {leitura?.leitura_falhou && <Faixa>Não consegui ler esse arquivo. Preencha à mão.</Faixa>}
        {leitura?.aviso && <Faixa>{leitura.aviso}</Faixa>}
        {leitura?.pagamento_existente && (
          <Faixa tipo="erro">Esse comprovante já foi lançado em {formatData(leitura.pagamento_existente.data_pagamento)} ({formatMoeda(leitura.pagamento_existente.valor)}) — em {leitura.pagamento_existente.onde}.</Faixa>
        )}
        {leitura && leitura.cnpj_confere === false && (
          <Faixa>O CNPJ do documento ({leitura.cnpj || leitura.cnpj_prestador}) não é o de {funcionario.nome} ({funcionario.cnpj}). É dessa pessoa mesmo?</Faixa>
        )}
        {compLida && compLida !== competencia && tipo !== 'das_comprovante' && (
          <Faixa>O documento é de {rotuloMes(compLida)}, e o mês aberto é {rotuloMes(competencia)}. A competência abaixo já veio com a do documento — confira.</Faixa>
        )}
        {leitura?.competencia_inferida && <Faixa>A nota não diz o mês dos serviços; usei o mês da emissão ({formatData(leitura.data_emissao)}).</Faixa>}
        {jaExiste && (
          <Faixa>Já existe {ROTULO_EXISTENTE[tipo]} em {rotuloMes(comp)}{jaExiste.valor != null ? ` (${formatMoeda(jaExiste.valor)})` : ''}. Salvar substitui.</Faixa>
        )}
        {tipo === 'das_comprovante' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {existente ? `Vai marcar o DAS de ${rotuloMes(competencia)} como pago.` : `Não há boleto do DAS em ${rotuloMes(competencia)} — vai lançar o DAS já pago.`}
          </p>
        )}
        {conflito && (
          <Faixa>{conflito.mensagem}. <button type="button" onClick={() => salvar(null, conflito.id)} disabled={etapa !== 'conferindo'} style={{ ...botaoSecundario, padding: '4px 10px', fontSize: 12, marginLeft: 8 }}>Substituir</button></Faixa>
        )}

        {leitura && !leitura.leitura_falhou && (tipo === 'pagamento' || tipo === 'das_comprovante') && (
          <p style={{ margin: 0, fontSize: 14 }}>
            Pix de <strong>{formatMoeda(leitura.valor)}</strong> em <strong>{formatData(leitura.data_pagamento)}</strong>
            {leitura.destinatario && <> para <strong>{leitura.destinatario}</strong></>}
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {tipo === 'pagamento' && <>{campoCompetencia}{campoValor}{campoPagoEm}</>}
          {tipo === 'das_boleto' && <>{campoCompetencia}{campoValor}
            <label style={{ fontSize: 12 }}>Vencimento<br />
              <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label></>}
          {tipo === 'das_comprovante' && <>{campoValor}{campoPagoEm}</>}
          {tipo === 'nf' && <>{campoCompetencia}
            <label style={{ fontSize: 12 }}>Nº da nota<br />
              <input value={numeroNf} onChange={e => setNumeroNf(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </label>{campoValor}</>}
        </div>

        {erro && <p style={{ color: 'var(--color-danger)', margin: 0, fontSize: 13 }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancelar} disabled={etapa === 'salvando'} style={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={etapa !== 'conferindo'} style={botaoPrimario}>
            {etapa === 'salvando' ? 'Salvando…' : jaExiste ? 'Substituir' : 'Salvar'}
          </button>
        </div>
      </div>

      <PreviewArquivo url={previewUrl} tipo={arquivo?.type} alt={TITULO[tipo]} />
    </form>
  )
}
