/**
 * Cartão de seção — um bloco de valores com cabeçalho e, opcionalmente, um
 * total no rodapé.
 *
 * Desenhado a partir do Finco (o SaaS que ela assina e usa de referência):
 * cabeçalho com título e uma linha explicando o que é o bloco, valores no
 * meio, total destacado embaixo. O subtítulo não é enfeite — é o que evita a
 * pergunta "o que entra nesta parte?" toda vez que ela abre a tela.
 *
 * As cores são as da Cravelli, não as do Finco. O que se copiou de lá foi a
 * estrutura e o respiro; a identidade (verde garrafa, marfim, Manrope) foi uma
 * escolha dela no rebrand de agosto e continua valendo.
 */
export default function SecaoCard({ titulo, subtitulo, total, totalRotulo = 'Total', children }) {
  return (
    <section style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <header style={{ padding: '16px 20px 12px' }}>
        <h2 style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--color-text)',
        }}>
          {/* Marca de seção: uma barra do acento da marca. Faz o papel do
              ícone do Finco sem trazer uma biblioteca inteira pra dentro. */}
          <span aria-hidden="true" style={{
            width: 3, height: 16, borderRadius: 2,
            background: 'var(--color-accent-solid)', flexShrink: 0,
          }} />
          {titulo}
        </h2>
        {subtitulo && (
          <p style={{
            margin: '4px 0 0 11px', fontSize: 13, color: 'var(--color-text-muted)',
          }}>{subtitulo}</p>
        )}
      </header>

      <div style={{ padding: '0 20px 16px', display: 'grid', gap: 6 }}>
        {children}
      </div>

      {total !== undefined && total !== null && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, padding: '14px 20px',
          borderTop: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{totalRotulo}</span>
          <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {total}
          </span>
        </div>
      )}
    </section>
  )
}
