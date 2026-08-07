export default function CardResumo({ titulo, valor, subtitulo, cor = 'var(--color-text)' }) {
  return (
    <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', padding:'20px 24px', minWidth:180 }}>
      <div style={{ fontSize:13, color:'var(--color-text-muted)', marginBottom:4 }}>{titulo}</div>
      <div style={{ fontSize:28, fontWeight:700, color: cor }}>
        {typeof valor === 'number'
          ? valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
          : valor}
      </div>
      {subtitulo && <div style={{ fontSize:12, color:'var(--color-text-muted)', marginTop:4 }}>{subtitulo}</div>}
    </div>
  )
}
