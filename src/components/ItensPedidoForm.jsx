// src/components/ItensPedidoForm.jsx
// Tabela de itens de um pedido — usada pelo "Novo pedido" e pelo upload do
// pedido de compra. Um lugar só para manter aparência e validação.

export const ITEM_VAZIO = { produto: '', quantidade: '', valor_unitario: '' }

const inputStyle = { display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', boxSizing: 'border-box' }

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function totalDoItem(item) {
  return (parseFloat(item.quantidade) || 0) * (parseFloat(item.valor_unitario) || 0)
}

export function totalDosItens(itens) {
  return itens.reduce((soma, item) => soma + totalDoItem(item), 0)
}

export default function ItensPedidoForm({ itens, onChange }) {
  function atualizar(index, campo, valor) {
    onChange(itens.map((item, i) => i === index ? { ...item, [campo]: valor } : item))
  }
  function adicionar() { onChange([...itens, { ...ITEM_VAZIO }]) }
  function remover(index) { onChange(itens.filter((_, i) => i !== index)) }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Itens do pedido</span>
        <button type="button" onClick={adicionar}
          style={{ padding: '6px 14px', fontSize: 13, background: 'transparent', color: 'var(--color-accent-solid)', border: '1px solid var(--color-accent-solid)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
          + Adicionar produto
        </button>
      </div>

      {itens.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <label style={{ fontSize: 12 }}>Produto<br />
            <input required value={item.produto} onChange={e => atualizar(i, 'produto', e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>Quantidade<br />
            <input required type="number" step="0.01" min="0.01" value={item.quantidade} onChange={e => atualizar(i, 'quantidade', e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>Valor unit. (R$)<br />
            <input required type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizar(i, 'valor_unitario', e.target.value)} style={inputStyle} />
          </label>
          <div style={{ fontSize: 12 }}>Total<br />
            <div style={{ padding: '8px 0', fontWeight: 600 }}>{formatMoeda(totalDoItem(item))}</div>
          </div>
          <button type="button" onClick={() => remover(i)} disabled={itens.length === 1}
            style={{ padding: 8, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: itens.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', opacity: itens.length === 1 ? 0.4 : 1 }}>
            ✕
          </button>
        </div>
      ))}

      <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 8, fontSize: 15 }}>
        Total do pedido: {formatMoeda(totalDosItens(itens))}
      </div>
    </div>
  )
}
