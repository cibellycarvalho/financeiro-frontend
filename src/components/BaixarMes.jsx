/**
 * Baixa o pacote do mês: um .zip com uma pasta por compra, com nota, pedido e
 * comprovantes — o que o backend monta em `GET /api/pacote/compras/<AAAA-MM>`.
 *
 * A chamada usa `responseType: 'blob'` porque a resposta de sucesso é o
 * próprio arquivo. Isso tem um efeito colateral: quando o backend responde
 * erro (404 mês sem compra, 400 mês inválido), o corpo do erro TAMBÉM chega
 * como Blob em vez de JSON já decodificado — o axios não sabe que aquele
 * blob é, na verdade, `{"error": "..."}`. Por isso o catch lê o texto do
 * blob e faz o parse antes de mostrar a mensagem; sem isso a tela mostraria
 * "[object Blob]" ou o aviso genérico, mesmo o backend tendo mandado a frase
 * certa.
 */
import { useState } from 'react'
import api from '../services/api'

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// jsdom (o ambiente dos testes) ainda não implementa Blob.text(), embora todo
// navegador de verdade implemente — por isso o fallback via FileReader, que
// os dois suportam.
function lerBlobComoTexto(blob) {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result)
    leitor.onerror = () => reject(leitor.error)
    leitor.readAsText(blob)
  })
}

async function mensagemDoErro(erro) {
  const dados = erro.response?.data
  if (!dados) return null
  if (dados instanceof Blob) {
    try {
      const texto = await lerBlobComoTexto(dados)
      return JSON.parse(texto).error || null
    } catch {
      return null
    }
  }
  return dados.error || null
}

const campoStyle = {
  padding: '6px 10px', fontSize: 13,
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
  background: 'var(--color-bg)', color: 'var(--color-text)',
}

const botaoStyle = {
  padding: '6px 16px', fontSize: 13,
  background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)',
  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
}

export default function BaixarMes() {
  const [mes, setMes] = useState(mesAtual())
  const [erro, setErro] = useState(null)
  const [baixando, setBaixando] = useState(false)

  async function baixar() {
    if (baixando) return // trava contra clique duplo enquanto monta o zip
    setErro(null)
    setBaixando(true)
    try {
      const { data } = await api.get(`/api/pacote/compras/${mes}`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `compras-${mes}.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = await mensagemDoErro(e)
      setErro(msg || 'Não consegui montar o arquivo. Tente de novo.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Mês
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          disabled={baixando}
          style={{ ...campoStyle, marginTop: 4 }}
        />
      </label>
      <button onClick={baixar} disabled={baixando} style={botaoStyle}>
        {baixando ? 'Montando…' : 'Baixar mês'}
      </button>
      {erro && (
        <p role="alert" style={{ margin: 0, width: '100%', fontSize: 12, color: 'var(--color-danger)' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
