export default function AlertaBadge({ texto, tipo = 'warning' }) {
  const cores = { warning: '#f59e0b', error: '#ef4444', ok: '#22c55e' }
  return (
    <span style={{
      background: cores[tipo] + '22',
      color: cores[tipo],
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 600
    }}>
      {texto}
    </span>
  )
}
