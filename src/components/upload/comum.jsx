// src/components/upload/comum.jsx
// O que os cartões de upload (pedido de compra, documentos de funcionário)
// têm em comum: tipos aceitos, estilos, faixas de aviso, preview do arquivo,
// o botão que esconde o <input type="file"> e o abrir-anexo-em-nova-aba.
import { useRef } from 'react'
import api from '../../services/api'

export const TIPOS = 'application/pdf,image/jpeg,image/png'
export const TAMANHO_MAX = 10 * 1024 * 1024

export const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }
export const botaoPrimario = { padding: '8px 20px', background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }
export const botaoSecundario = { padding: '8px 20px', background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }

export function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
export function formatData(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
}

export function Faixa({ tipo = 'aviso', children }) {
  const cor = tipo === 'erro' ? 'var(--color-danger)' : 'var(--color-warning)'
  return (
    <div style={{ borderLeft: `4px solid ${cor}`, background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 10 }}>
      {children}
    </div>
  )
}

export function validarArquivo(arquivo) {
  if (!arquivo) return 'Escolha um arquivo.'
  if (!TIPOS.split(',').includes(arquivo.type)) return 'Só PDF, JPG ou PNG.'
  if (arquivo.size > TAMANHO_MAX) return 'Arquivo maior que 10 MB.'
  return null
}

export function mensagemDe(err, padrao) {
  return err?.response?.data?.error || padrao
}

export function PreviewArquivo({ url, tipo, alt = 'Arquivo enviado' }) {
  if (!url) return null
  return (
    <div style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
      {tipo === 'application/pdf'
        ? <object data={url} type="application/pdf" style={{ width: '100%', height: 420, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
            <a href={url} target="_blank" rel="noopener">Abrir o PDF</a>
          </object>
        : <img src={url} alt={alt} style={{ maxWidth: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />}
    </div>
  )
}

/** Botão que abre o seletor de arquivo e entrega o File escolhido. */
export function BotaoSubirArquivo({ rotulo, rotuloLendo = 'Lendo…', lendo = false, disabled = false, onArquivo, style }) {
  const input = useRef(null)
  return (
    <>
      <input ref={input} type="file" accept={TIPOS} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onArquivo(f) }} />
      <button type="button" onClick={() => input.current.click()} disabled={disabled || lendo} style={{ ...botaoSecundario, ...style }}>
        {lendo ? rotuloLendo : rotulo}
      </button>
    </>
  )
}

/** Abre o anexo em nova aba. A aba abre no clique (depois do await o Safari bloqueia) e recebe a URL assinada. */
export async function abrirAnexo(caminho) {
  const janela = window.open('', '_blank')
  if (janela) janela.opener = null
  try {
    const r = await api.get(caminho)
    if (janela) janela.location.replace(r.data.url)
    else window.open(r.data.url, '_blank', 'noopener')
  } catch (err) {
    janela?.close()
    alert(err.response?.data?.error || 'Não consegui abrir o anexo.')
  }
}
