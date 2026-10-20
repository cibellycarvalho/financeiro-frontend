/**
 * Sobra de uma semana (segunda a domingo), usada para dizer quanto dá para
 * comprar na semana seguinte. Regra dela (20/10/2026): "o que cai essa semana,
 * compra semana que vem" — o que se compra agora é a sobra da semana passada.
 *
 * Mesma conta da Caixa da Semana (entra − boletos − pago a fornecedor − pago a
 * funcionários), feita sobre dados crus da API. Diferenças de propósito: boleto
 * atrasado de antes da semana não entra (é pendência de hoje, não da semana).
 */

const dia = v => (v ? String(v).slice(0, 10) : null)
const dentro = (v, de, ate) => { const d = dia(v); return d !== null && d >= de && d <= ate }
const soma = l => l.reduce((s, x) => s + Number(x.valor || 0), 0)

/** Pagamentos da semana que contam: "Não descontar" (ajuste false) tira. */
function descontados(pagamentos, de, ate, ajustes) {
  return (pagamentos || []).filter(p => dentro(p.data_pagamento, de, ate) && ajustes[p.id] !== false)
}

export function sobraDaSemana({ de, ate, contas, repasses, agenda, pagamentos, funcionarios, devolucoes, ajustes }) {
  ajustes = ajustes || {}
  const diasAgenda = Object.entries(agenda || {}).filter(([d]) => dentro(d, de, ate))
  const entra = diasAgenda.length
    ? diasAgenda.reduce((s, [, v]) => s + Number(v || 0), 0)
    : soma((repasses || []).filter(r => r.tipo === 'repasse' && dentro(r.data_referencia, de, ate)))
  const reembolsos = soma((devolucoes || []).filter(d => dentro(d.data_devolucao, de, ate)))

  const naSemana = c => dentro(c.vencimento, de, ate) || (c.status === 'pago' && dentro(c.data_pagamento, de, ate))
  const doPeriodo = (contas || []).filter(c => (c.status === 'pago' ? naSemana(c) : dentro(c.vencimento, de, ate)))
  const boletos = soma(doPeriodo.filter(c => c.categoria !== 'FORNECEDOR'))
  const contasFornecedor = soma(doPeriodo.filter(c => c.categoria === 'FORNECEDOR' && c.status === 'pago'))
  const fornecedor = soma(descontados(pagamentos, de, ate, ajustes)) + contasFornecedor
  const func = soma(descontados(funcionarios, de, ate, ajustes))

  return {
    entra, reembolsos, boletos, fornecedor, funcionarios: func,
    sobra: Math.round((entra + reembolsos - boletos - fornecedor - func) * 100) / 100,
  }
}
