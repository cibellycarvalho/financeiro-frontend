/**
 * Compras desta semana. Regra dela (20/10/2026): "o que cai essa semana,
 * compra semana que vem; o que compro essa semana é o que caiu semana
 * passada". Então o disponível é a SOBRA DA SEMANA PASSADA (só ela; a tela não
 * acumula de semana em semana, de propósito).
 *
 * Seis cards: disponível, reposição necessária, pagamentos da semana,
 * concluídos, pendentes e sobra no caixa (= disponível − reposição − pendentes).
 */
import { useEffect, useState } from 'react'

import api from '../services/api'
import Indicador from './Indicador'
import CaixaParaRepor from './CaixaParaRepor'
import { sobraDaSemana } from '../lib/sobraSemana'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const semVazio = p => p.catch(() => ({ data: [] }))

export function montarCards({ disponivel, reposicao, pendentes, concluidos }) {
  const sobraNoCaixa = disponivel - reposicao - pendentes
  return {
    sobraNoCaixa,
    reposicaoFalta: Math.max(reposicao - disponivel, 0),
    pagamentosSemana: concluidos + pendentes,
  }
}

export default function ComprasDaSemana({ segunda, contas, pendentes, concluidos }) {
  const [passada, setPassada] = useState(null)
  const [erro, setErro] = useState(null)
  const [reposicao, setReposicao] = useState(null)   // total da semana atual, do CRM

  const ant = somaDias(segunda, -7)
  const de = ymd(ant)
  const ate = ymd(somaDias(ant, 6))
  const chaveSemana = ymd(segunda)

  useEffect(() => {
    if (!contas) return undefined
    let vivo = true
    setPassada(null); setErro(null)
    const meses = [...new Set([de, ate].map(d => d.slice(0, 7)))]
    Promise.all([
      api.get(`/api/planejamento/${de}`),
      Promise.all(meses.map(m => api.get(`/api/repasses?mes=${m}`))),
      api.get(`/api/fornecedores/pagamentos?de=${de}&ate=${ate}`),
      semVazio(api.get(`/api/funcionarios/pagamentos?de=${de}&ate=${ate}`)),
      semVazio(api.get(`/api/fornecedores/devolucoes?de=${de}&ate=${ate}`)),
    ]).then(([plano, repasses, pagamentos, funcionarios, devolucoes]) => {
      if (!vivo) return
      const linha = plano.data && !Array.isArray(plano.data) ? plano.data : {}
      setPassada(sobraDaSemana({
        de, ate, contas,
        repasses: repasses.flatMap(r => r.data),
        agenda: linha.agenda || {}, ajustes: linha.ajustes_pagamento || {},
        pagamentos: pagamentos.data, funcionarios: funcionarios.data, devolucoes: devolucoes.data,
      }))
    }).catch(() => { if (vivo) setErro('Não consegui calcular a sobra da semana passada.') })
    return () => { vivo = false }
  }, [de, ate, contas])  // eslint-disable-line react-hooks/exhaustive-deps

  const disponivel = passada ? passada.sobra : null
  const c = disponivel === null ? null
    : montarCards({ disponivel, reposicao: reposicao ?? 0, pendentes, concluidos })

  return (
    <>
      {erro && <p role="alert" style={{ color: 'var(--color-danger)' }}>{erro}</p>}
      <div style={{ display: 'grid', gap: 12, marginBottom: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Indicador rotulo="Disponível para comprar" tom="auto" valor={disponivel ?? 0}
          composicao={passada
            ? `sobra da semana passada (${de.slice(8)}/${de.slice(5, 7)} a ${ate.slice(8)}/${ate.slice(5, 7)}): ${brl(passada.entra + passada.reembolsos)} que caíram − ${brl(passada.boletos + passada.fornecedor + passada.funcionarios)} pagos`
            : 'calculando…'} />
        <Indicador rotulo="Reposição necessária" tom="divida" valor={reposicao ?? 0}
          composicao={reposicao === null ? 'calculando…'
            : c && c.reposicaoFalta > 0 ? `faltam ${brl(c.reposicaoFalta)} para cobrir`
              : 'o disponível cobre'} />
        <Indicador rotulo="Pagamentos da semana" tom="divida" valor={c ? c.pagamentosSemana : concluidos + pendentes}
          composicao="boletos, fornecedor e funcionários (concluídos + pendentes)" />
        <Indicador rotulo="Pagamentos concluídos" tom="neutro" valor={concluidos} composicao="já pagos nesta semana" />
        <Indicador rotulo="Pagamentos pendentes" tom="divida" valor={pendentes} composicao="boletos ainda não pagos" />
        <Indicador rotulo="Sobra no caixa" tom="auto" valor={c ? c.sobraNoCaixa : 0}
          composicao="disponível − reposição necessária − pendentes" />
      </div>
      <CaixaParaRepor sobra={disponivel} semanaAtual={chaveSemana}
        onDados={d => setReposicao((d.semanas.find(s => s.semana === chaveSemana) || { total: 0 }).total)} />
    </>
  )
}
