// src/components/KitsSkus.jsx
// Kits: quantas unidades do produto vão num anúncio de cada SKU, e de qual SKU
// avulso ele é feito. O título do anúncio ("Kit 10") só sugere; o custo do kit
// só é atualizado pelo pedido depois que ela confirma aqui.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { inputStyle, botaoPrimario, mensagemDe } from './upload/comum'

export default function KitsSkus({ podeEditar }) {
  const [kits, setKits] = useState(null)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState(null)

  function carregar() {
    api.get('/api/fornecedores/kits').then(r => setKits(r.data)).catch(err => setErro(mensagemDe(err, 'Não consegui carregar os kits.')))
  }
  useEffect(carregar, [])

  if (!kits) return erro ? <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{erro}</p> : null
  const pendentes = kits.filter(k => !k.confirmado).length

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 24 }}>
      <button type="button" onClick={() => setAberto(!aberto)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text)', fontWeight: 600, fontSize: 15 }}>
        {aberto ? '▾' : '▸'} Kits
        {pendentes > 0
          ? <span style={{ color: 'var(--color-danger)', fontWeight: 400 }}> · {pendentes} para confirmar — o pedido não atualiza o custo deles até lá</span>
          : <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · todos confirmados</span>}
      </button>
      {aberto && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
            Unidades = quantos produtos vão em um anúncio. "Feito do SKU" = o produto avulso; quando o pedido atualizar ele, o kit é recalculado. Se não for kit de verdade, confirme com 1 unidade.
          </p>
          {kits.map(k => <LinhaKit key={k.sku} kit={k} podeEditar={podeEditar} onSalvo={carregar} />)}
        </div>
      )}
    </div>
  )
}

function LinhaKit({ kit, podeEditar, onSalvo }) {
  const [unidades, setUnidades] = useState(String(kit.unidades ?? ''))
  const [base, setBase] = useState(kit.sku_base || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function confirmar() {
    setSalvando(true); setErro(null)
    try {
      await api.put(`/api/fornecedores/kits/${encodeURIComponent(kit.sku)}`, { unidades: parseFloat(unidades), sku_base: base.trim() || null })
      onSalvo()
    } catch (err) {
      setErro(mensagemDe(err, 'Não consegui salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 120px auto', gap: 8, alignItems: 'end', padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ fontWeight: 600 }}>{kit.sku}</div>
      <div style={{ fontSize: 13 }}>
        {kit.titulo}
        {!kit.confirmado && <div style={{ fontSize: 11, color: 'var(--color-danger)' }}>sugestão, falta confirmar</div>}
        {erro && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{erro}</div>}
      </div>
      <label style={{ fontSize: 12 }}>Unidades
        <input type="number" min="1" step="1" value={unidades} disabled={!podeEditar} aria-label={`Unidades do kit ${kit.sku}`}
          onChange={e => setUnidades(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ fontSize: 12 }}>Feito do SKU
        <input value={base} placeholder="(nenhum)" disabled={!podeEditar} aria-label={`SKU avulso do kit ${kit.sku}`}
          onChange={e => setBase(e.target.value)} style={inputStyle} />
      </label>
      {podeEditar && (
        <button type="button" onClick={confirmar} disabled={salvando || !(parseFloat(unidades) > 0)} style={botaoPrimario}>
          {salvando ? '…' : kit.confirmado ? 'Salvar' : 'Confirmar'}
        </button>
      )}
    </div>
  )
}
