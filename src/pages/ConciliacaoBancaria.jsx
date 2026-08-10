import { useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'

const ACOES = [
  { valor: 'confirmar_match', label: 'Confirmar' },
  { valor: 'criar_conta', label: 'Criar conta nova' },
  { valor: 'ignorar', label: 'Ignorar' },
]

export default function ConciliacaoBancaria() {
  const [resumo, setResumo] = useState(null)
  const [transacoes, setTransacoes] = useState([])
  const [acoes, setAcoes] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)

  async function handleUpload(e) {
    const arquivo = e.target.files[0]
    if (!arquivo) return
    setMsg(null)
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    try {
      const r = await api.post('/api/conciliacao/importar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResumo(r.data)
      if (r.data.lote_id) {
        const lote = await api.get(`/api/conciliacao/lotes/${r.data.lote_id}`)
        setTransacoes(lote.data)
        const acoesIniciais = {}
        lote.data.forEach(t => {
          acoesIniciais[t.id] = t.match_tabela ? 'confirmar_match' : (t.tipo === 'DEBIT' ? 'criar_conta' : 'ignorar')
        })
        setAcoes(acoesIniciais)
      } else {
        setTransacoes([])
      }
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.response?.data?.error || 'Erro ao importar extrato.' })
    }
    e.target.value = ''
  }

  async function confirmar() {
    setEnviando(true)
    try {
      const itens = transacoes.map(t => ({ transacao_id: t.id, acao: acoes[t.id] }))
      await api.post(`/api/conciliacao/lotes/${resumo.lote_id}/confirmar`, { itens })
      setMsg({ tipo: 'ok', texto: 'Conciliação aplicada com sucesso.' })
      setTransacoes([])
      setResumo(null)
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.response?.data?.error || 'Erro ao confirmar conciliação.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Layout>
      <h1 style={{ marginTop:0 }}>Conciliação Bancária</h1>

      <div style={{ background:'white', borderRadius:12, padding:24, marginBottom:24 }}>
        <label style={{ display:'inline-block', padding:'10px 20px', background:'#1a1a1a', color:'white', borderRadius:8, cursor:'pointer' }}>
          Importar extrato (.ofx)
          <input type="file" accept=".ofx" onChange={handleUpload} style={{ display:'none' }} />
        </label>
      </div>

      {msg && (
        <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:8,
          background: msg.tipo === 'ok' ? '#22c55e22' : '#ef444422',
          color: msg.tipo === 'ok' ? '#15803d' : '#b91c1c', fontSize:14 }}>
          {msg.texto}
        </div>
      )}

      {resumo && !resumo.lote_id && (
        <p style={{ color:'#666' }}>
          Nada de novo pra revisar — as {resumo.total} transações do arquivo já tinham sido importadas antes.
        </p>
      )}

      {resumo?.lote_id && (
        <>
          <p style={{ color:'#666', fontSize:14 }}>
            {resumo.total} transações no arquivo — {resumo.casadas} casadas automaticamente, {resumo.novas} sem match (débito), {resumo.sem_match} sem match (crédito).
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', background:'white', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
            <thead>
              <tr style={{ background:'#f0f0f0', textAlign:'left' }}>
                {['Data','Descrição','Valor','Sugestão','Ação'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transacoes.map(t => (
                <tr key={t.id} style={{ borderTop:'1px solid #eee' }}>
                  <td style={{ padding:'10px 16px' }}>{new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style={{ padding:'10px 16px' }}>{t.descricao}</td>
                  <td style={{ padding:'10px 16px', fontWeight:600 }}>
                    {t.tipo === 'DEBIT' ? '-' : '+'} {Number(t.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:13, color:'#666' }}>
                    {t.match_tabela ? `Match: ${t.match_descricao}` : (t.tipo === 'DEBIT' ? 'Sem match — vira conta nova' : 'Não identificado')}
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    <select value={acoes[t.id]} onChange={e => setAcoes({ ...acoes, [t.id]: e.target.value })} style={{ padding:6 }}>
                      {ACOES.filter(a => a.valor !== 'confirmar_match' || t.match_tabela).map(a => (
                        <option key={a.valor} value={a.valor}>{a.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={confirmar} disabled={enviando}
            style={{ padding:'10px 24px', background:'#22c55e', color:'white', border:'none', borderRadius:8, cursor:'pointer', opacity: enviando ? 0.6 : 1 }}>
            {enviando ? 'Confirmando...' : 'Confirmar'}
          </button>
        </>
      )}
    </Layout>
  )
}
