/**
 * Cartão de indicador — um número com a conta dele embaixo.
 *
 * A linha de baixo é a razão de este componente existir. No Finco, embaixo de
 * "Lucro Líquido" está escrito `Base: R$ 11.881,48 − Ads: R$ 7.917,56 − Fixos:
 * R$ 1.104,87`. É isso que faz a tela parecer simples: o número deixa de ser um
 * oráculo. Sem essa linha, isto aqui vira o CardResumo que já existia.
 *
 * Sobre a cor: ela segue o SINAL, não um parâmetro fixo. O Dashboard mostrava
 * "Saldo disponível −R$ 50.314,96" em verde porque a cor estava escrita à mão
 * na chamada — saldo negativo lendo como boa notícia. Quem sabe se o número é
 * bom é o número.
 */
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * @param tom  'auto'    — verde se positivo, vermelho se negativo (dinheiro que
 *                         é resultado: saldo, lucro)
 *             'divida'  — quanto MAIOR pior; neutro em zero (a pagar, saldo de
 *                         fornecedor). Zero não é vitória, é só zero.
 *             'neutro'  — contagens e valores sem juízo de valor
 */
function corDoValor(tom, valor) {
  if (tom === 'neutro') return 'var(--color-text)'
  if (tom === 'divida') {
    return Number(valor) > 0 ? 'var(--color-warning)' : 'var(--color-text)'
  }
  if (Number(valor) < 0) return 'var(--color-danger)'
  if (Number(valor) > 0) return 'var(--color-success)'
  return 'var(--color-text)'
}

export default function Indicador({ rotulo, valor, composicao, tom = 'neutro', formato = 'moeda' }) {
  const texto = formato === 'moeda' ? brl(valor) : String(valor)
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 6,
      minHeight: 104,
    }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{rotulo}</span>
      <span style={{
        fontSize: 26, fontWeight: 700, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: corDoValor(tom, valor),
      }}>{texto}</span>
      {composicao && (
        <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
          {composicao}
        </span>
      )}
    </div>
  )
}
