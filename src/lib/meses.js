// Meses no formato 'AAAA-MM' — o que o <input type="month"> fala e o que o
// backend aceita como competência.
const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function mesAtual(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

/** '2026-09', '2026-09-01' ou data RFC do backend → '2026-09'. Sem data → null. */
export function mesDe(data) {
  if (!data) return null
  if (typeof data === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(data)) return data.slice(0, 7)
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function rotuloMes(mes) {
  if (!mes) return ''
  const [ano, m] = mes.split('-')
  return `${NOMES[Number(m) - 1]} ${ano}`
}
