/**
 * Uma linha de valor dentro de um SecaoCard.
 *
 * O número da linha aparece à esquerda porque esta tela existe para alimentar a
 * planilha FECHAMENTO ATT.xlsx: na hora de colar, o que ela procura é a linha
 * de destino, não o rótulo. Antes esse número só existia escondido no texto dos
 * avisos ("deixe a linha 24 zerada"), o que obrigava a ler o aviso inteiro pra
 * achar um número de duas casas.
 *
 * O aviso, quando existe, fica colado na própria linha a que se refere. Solto
 * no rodapé da seção, como estava, exigia descobrir de qual valor ele falava.
 */
const brl = v => (v === null || v === undefined)
  ? '—'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function LinhaValor({ linha, rotulo, valor, aviso, indisponivel, copiado, onCopiar }) {
  return (
    <div style={{
      background: 'var(--color-row)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {linha !== undefined && linha !== null && (
          <span
            title={`Linha ${linha} da planilha de fechamento`}
            style={{
              flexShrink: 0, minWidth: 26, textAlign: 'center',
              fontSize: 11, fontWeight: 600, padding: '2px 6px',
              borderRadius: 6, color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >{linha}</span>
        )}

        <span style={{ flex: 1, fontSize: 14, color: 'var(--color-text-muted)' }}>
          {rotulo}
          {/* Confirmacao da copia como selo ao lado do rotulo. Trocar o rotulo
              pela palavra "copiado" apagava a informacao da linha por um
              instante e parecia defeito. */}
          {copiado && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600,
              color: 'var(--color-success)',
            }}>copiado</span>
          )}
        </span>

        <span style={{
          fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          // Valor que o sistema não conseguiu apurar não pode parecer um valor
          // apurado. Ele vem como "—" e em cinza, nunca como R$ 0,00.
          color: indisponivel ? 'var(--color-text-muted)' : 'var(--color-text)',
        }}>{brl(valor)}</span>

        <button
          onClick={onCopiar}
          disabled={valor === null || valor === undefined}
          title="Copiar o valor"
          style={{
            flexShrink: 0, fontSize: 12, padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', cursor: valor == null ? 'default' : 'pointer',
            border: '1px solid var(--color-border)', background: 'transparent',
            color: valor == null ? 'var(--color-text-muted)' : 'var(--color-text)',
          }}
        >copiar</button>
      </div>

      {aviso && (
        <p style={{
          margin: '8px 0 0', paddingLeft: linha != null ? 38 : 0,
          fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-muted)',
        }}>{aviso}</p>
      )}
    </div>
  )
}
