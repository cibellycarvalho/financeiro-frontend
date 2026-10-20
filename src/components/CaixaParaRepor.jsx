/**
 * Caixa para repor — quanto precisa estar no caixa, semana a semana, para
 * repor o estoque do Full ANTES de dar ruptura (lead time de 10 dias).
 *
 * O cálculo mora no CRM (GET /api/reposicao/caixa-necessario), que conhece o
 * estoque e as vendas. Aqui só se compara com a "sobra para comprar" da semana.
 */
import { useEffect, useState } from 'react'

import SecaoCard from './SecaoCard'
import crmApi, { crmConfigurado } from '../services/crmApi'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function resumoSemana(semana, disponivel) {
  const falta = disponivel === null || disponivel === undefined ? null : semana.total - disponivel
  return { falta: falta !== null && falta > 0 ? falta : 0, cobre: falta !== null && falta <= 0 }
}

export default function CaixaParaRepor({ sobra, semanaAtual }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!crmConfigurado()) { setErro('Endereço do CRM não configurado.'); return }
    let vivo = true
    crmApi.get('/api/reposicao/caixa-necessario?conta_ml=YUSO,M12')
      .then(r => { if (vivo) setDados(r.data) })
      .catch(() => { if (vivo) setErro('Não foi possível calcular a reposição agora.') })
    return () => { vivo = false }
  }, [])

  return (
    <SecaoCard
      titulo="Caixa para repor"
      subtitulo={`Quanto ter em caixa para repor antes da ruptura (${dados?.lead_time_dias ?? 10} dias da compra até o estoque no Full).`}
    >
      {erro && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--color-danger)' }}>{erro}</p>}
      {!erro && !dados && <p style={{ margin: 0, fontSize: 13 }}>Calculando…</p>}
      {dados && dados.semanas.length === 0 && (
        <p style={{ margin: 0, fontSize: 13 }}>Nenhum produto entra em ruptura nas próximas semanas.</p>
      )}
      {dados && dados.semanas.map(s => {
        const atual = s.semana === semanaAtual
        const { falta, cobre } = resumoSemana(s, atual ? sobra : null)
        return (
          <div key={s.semana} style={{ marginBottom: 14 }}>
            <strong style={{ fontSize: 14 }}>
              Semana de {dia(s.semana)}: ter {brl(s.total)} em caixa
            </strong>
            {atual && (
              <span style={{ marginLeft: 8, fontSize: 12.5, color: cobre ? 'var(--color-success, inherit)' : 'var(--color-danger)' }}>
                {cobre ? `sobra cobre (${brl(sobra)})` : `faltam ${brl(falta)} (sobra ${brl(sobra)})`}
              </span>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {s.skus.map(k => (
                <li key={k.sku || k.titulo}>
                  {k.sku || k.titulo} — {k.quantidade_repor} un · {brl(k.valor)} · ruptura em {dia(k.ruptura_em)}
                  {k.atrasado ? ' · ATRASADO, comprar já' : ` · pagar até ${dia(k.pagar_ate)}`}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {dados?.sem_custo?.length > 0 && (
        <p style={{ margin: 0, fontSize: 12.5 }}>
          Sem custo cadastrado (fora da conta): {dados.sem_custo.map(x => x.sku || x.titulo).join(', ')}
        </p>
      )}
    </SecaoCard>
  )
}
