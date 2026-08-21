/**
 * Cabeçalho de página: título, uma linha dizendo o que a tela é, e um espaço à
 * direita para o controle de contexto (loja, período, ação principal).
 *
 * O subtítulo é obrigatório de propósito. Toda tela do Finco tem um, e é o que
 * responde "o que eu estou vendo aqui?" sem obrigar a decifrar os números. Uma
 * tela que não consegue se descrever numa linha normalmente está fazendo coisa
 * demais — o subtítulo é um teste barato disso.
 */
export default function PaginaHeader({ titulo, subtitulo, acao }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap', marginBottom: 20,
    }}>
      <div>
        <h1 style={{ fontSize: 22, margin: 0, letterSpacing: '-0.01em' }}>{titulo}</h1>
        {subtitulo && (
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' }}>
            {subtitulo}
          </p>
        )}
      </div>
      {acao}
    </header>
  )
}
