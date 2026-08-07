export default function AlertaBadge({ texto, tipo = 'warning' }) {
  const cores = {
    warning: 'var(--color-warning)',
    error: 'var(--color-danger)',
    ok: 'var(--color-success)',
    info: 'var(--color-accent)'
  }
  const cor = cores[tipo]
  return (
    <span style={{
      background: `color-mix(in srgb, ${cor} 18%, transparent)`,
      color: cor,
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 600
    }}>
      {texto}
    </span>
  )
}
