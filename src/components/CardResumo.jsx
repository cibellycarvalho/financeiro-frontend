export default function CardResumo({ titulo, valor, subtitulo, cor = '#1a1a1a' }) {
  return (
    <div style={{ background:'white', borderRadius:12, padding:'20px 24px', boxShadow:'0 1px 8px rgba(0,0,0,0.06)', minWidth:180 }}>
      <div style={{ fontSize:13, color:'#666', marginBottom:4 }}>{titulo}</div>
      <div style={{ fontSize:28, fontWeight:700, color: cor }}>
        {typeof valor === 'number'
          ? valor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
          : valor}
      </div>
      {subtitulo && <div style={{ fontSize:12, color:'#999', marginTop:4 }}>{subtitulo}</div>}
    </div>
  )
}
