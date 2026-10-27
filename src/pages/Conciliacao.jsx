// src/pages/Conciliacao.jsx
// "Bancos e conciliação" (27/10/2026), no visual do desenho "Margem". Qualquer
// banco: ela baixa o extrato (OFX ou PDF) no app do banco e arrasta aqui. O sistema lê
// o saldo, lista os movimentos e diz com o que cada um casa; ela confirma o
// resto com um clique.
import { useCallback, useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'
import crmApi, { crmConfigurado } from '../services/crmApi'
import { formatMoeda, formatData, mensagemDe, Faixa } from '../components/upload/comum'

const cartao = { background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: 24, boxShadow: '0 1px 2px rgba(15,27,45,.06)' }
const rotulo = { fontSize: 12.5, color: 'var(--color-text-muted)' }
const selo = (fundo, cor) => ({ background: fundo, color: cor, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 })
const SELO = {
  casado: selo('#E3F3EA', '#0B5C39'),
  sugerido: selo('#E6EEFA', '#163F80'),
  novo: selo('var(--color-row)', 'var(--color-text-muted)'),
  ignorado: selo('var(--color-row)', 'var(--color-text-muted)'),
}
const botao = (escuro) => ({ minHeight: 36, padding: '0 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  border: escuro ? 'none' : '1px solid var(--color-border)', background: escuro ? 'var(--color-text)' : 'var(--color-surface)',
  color: escuro ? 'var(--color-surface)' : 'var(--color-text)' })

/** Texto do selo de um movimento. Função pura. */
export function textoStatus(m) {
  if (m.status === 'casado') return `Casado: ${m.casado_texto || 'confirmado'}`
  if (m.status === 'sugerido') return `Parece: ${m.casado_texto}`
  if (m.status === 'ignorado') return 'Ignorado'
  return Number(m.valor) > 0 ? 'Novo: entrada sem origem' : 'Novo: não achei lançamento'
}

export default function Conciliacao() {
  const [bancos, setBancos] = useState([])
  const [sel, setSel] = useState(null)
  const [movs, setMovs] = useState([])
  const [mp, setMp] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [erro, setErro] = useState(null)
  const input = useRef(null)

  const carregarBancos = useCallback(() => api.get('/api/bancos').then(r => {
    setBancos(r.data)
    setSel(s => s && r.data.some(b => b.id === s) ? s : r.data[0]?.id ?? null)
  }), [])
  const carregarMovs = useCallback(id => id && api.get(`/api/bancos/${id}/extrato`).then(r => setMovs(r.data))
    .catch(e => setErro(mensagemDe(e, 'Não carregou o extrato.'))), [])

  useEffect(() => {
    carregarBancos().catch(e => setErro(mensagemDe(e, 'Não carregou. Confira a internet.')))
    if (crmConfigurado()) crmApi.get('/api/caixa/hoje').then(r => setMp(r.data)).catch(() => {})
  }, [carregarBancos])
  useEffect(() => { setMovs([]); carregarMovs(sel) }, [sel, carregarMovs])

  async function enviar(arquivo) {
    if (!arquivo || !sel) return
    setEnviando(true); setErro(null); setAviso(null)
    const corpo = new FormData()
    corpo.append('arquivo', arquivo)
    try {
      const r = await api.post(`/api/bancos/${sel}/extrato`, corpo, { headers: { 'Content-Type': 'multipart/form-data' } })
      const { lidos, novos, saldo } = r.data
      setAviso(`${lidos} movimentos lidos, ${novos} novos${lidos > novos ? ` (${lidos - novos} já estavam aqui)` : ''}.${saldo != null ? ` Saldo atualizado: ${formatMoeda(saldo)}.` : ''}`)
      await Promise.all([carregarBancos(), carregarMovs(sel)])
    } catch (e) {
      setErro(mensagemDe(e, 'Não consegui ler o arquivo. Envie em OFX ou PDF.'))
    } finally {
      setEnviando(false)
      if (input.current) input.current.value = ''
    }
  }

  async function decidir(m, acao) {
    try {
      const r = await api.put(`/api/bancos/${sel}/extrato/${m.id}`, { acao })
      setMovs(lista => lista.map(x => (x.id === m.id ? r.data : x)))
    } catch (e) { setErro(mensagemDe(e, 'Não salvou. Tente de novo.')) }
  }

  const banco = bancos.find(b => b.id === sel)
  const casados = movs.filter(m => m.status === 'casado' || m.status === 'ignorado').length
  const pendentes = movs.filter(m => m.status === 'sugerido' || m.status === 'novo')

  const Cartao = ({ nome, saldo, fonte, principal, ativo, onClick }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
            style={{ ...cartao, padding: '16px 18px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', color: 'var(--color-text)', font: 'inherit',
                     border: 'none', outline: ativo ? '2px solid var(--color-text)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{nome}</strong>
        {principal && <span style={{ background: 'var(--color-text)', color: 'var(--color-surface)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>PRINCIPAL</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{saldo == null ? '—' : formatMoeda(saldo)}</div>
      <div style={{ ...rotulo, fontSize: 12, marginTop: 4 }}>{fonte}</div>
    </button>
  )

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
        <header>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Qualquer banco, quantas contas quiser</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 28 }}>Bancos e conciliação</h1>
        </header>

        {erro && <Faixa tipo="erro">{erro}</Faixa>}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {bancos.map(b => (
            <Cartao key={b.id} nome={b.nome} saldo={b.saldo} principal={b.principal} ativo={b.id === sel} onClick={() => setSel(b.id)}
                    fonte={b.saldo_em ? `Atualizado em ${formatData(b.saldo_em)}` : 'Sem saldo ainda'} />
          ))}
          <Cartao nome="Mercado Pago" saldo={mp?.disponivel}
                  fonte={mp ? `Automático${mp.a_liberar ? ` · + ${formatMoeda(mp.a_liberar)} a liberar` : ''}` : 'Automático'} />
        </section>
        <p style={{ ...rotulo, margin: '-8px 0 0' }}>Para adicionar outro banco ou trocar o principal, use a tela Hoje.</p>

        {banco && (
          <section style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>Extrato do {banco.nome}</h2>
                <div style={{ ...rotulo, marginTop: 2 }}>
                  {movs.length ? `${casados} de ${movs.length} movimentos resolvidos. ${pendentes.length ? 'Confirme o resto com um clique.' : 'Tudo certo.'}` : 'Baixe o extrato no app do banco (OFX ou PDF) e envie aqui.'}
                </div>
              </div>
              <label
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); enviar(e.dataTransfer.files[0]) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px dashed #9FB3D1', background: '#F2F6FC', color: '#1F5FBF',
                         borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: enviando ? 'wait' : 'pointer' }}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
                {enviando ? 'Lendo o extrato… (PDF leva até 1 minuto)' : 'Arraste o extrato (OFX ou PDF) ou clique'}
                <input ref={input} type="file" accept=".ofx,.OFX,.pdf,application/pdf" style={{ display: 'none' }} disabled={enviando} onChange={e => enviar(e.target.files[0])} />
              </label>
            </div>
            {aviso && <Faixa tipo="aviso">{aviso}</Faixa>}

            <div>
              {movs.map(m => {
                const entrada = Number(m.valor) > 0
                return (
                  <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', padding: '14px 4px', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ flex: '0 0 80px', fontSize: 13, color: 'var(--color-text-muted)' }}>{formatData(m.data)}</div>
                    <div style={{ flex: '1 1 220px', minWidth: 0, fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{m.descricao || '—'}</div>
                    <div style={{ flex: '0 0 130px', textAlign: 'right', fontWeight: 700, color: entrada ? 'var(--color-success)' : undefined }}>
                      {entrada ? '+ ' : '− '}{formatMoeda(Math.abs(m.valor))}
                    </div>
                    <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span style={SELO[m.status]}>{textoStatus(m)}</span>
                      {m.status === 'sugerido' && <button type="button" style={botao(true)} onClick={() => decidir(m, 'confirmar')}>Confirmar</button>}
                      {(m.status === 'sugerido' || m.status === 'novo') && <button type="button" style={botao(false)} onClick={() => decidir(m, 'ignorar')}>Ignorar</button>}
                      {(m.status === 'casado' || m.status === 'ignorado') && <button type="button" style={{ ...botao(false), border: 'none', color: 'var(--color-text-muted)' }} onClick={() => decidir(m, 'reabrir')}>Desfazer</button>}
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ ...rotulo, margin: 0, fontSize: 12 }}>"Novo" = saída que não está lançada em Contas, Fornecedores ou Funcionários. Lance lá e envie o extrato de novo, ou marque Ignorar (tarifa, transferência entre contas).</p>
          </section>
        )}
        {!banco && bancos.length === 0 && <Faixa tipo="aviso">Nenhuma conta bancária ainda. Cadastre na tela Hoje.</Faixa>}
      </div>
    </Layout>
  )
}
