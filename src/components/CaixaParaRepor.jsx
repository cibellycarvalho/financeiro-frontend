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

/** "19/10 a 25/10" a partir da segunda-feira da semana. */
export function periodoDaSemana(segundaIso) {
  const d = new Date(`${segundaIso}T12:00:00`)
  d.setDate(d.getDate() + 6)
  const fim = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${dia(segundaIso)} a ${fim}`
}

export function resumoSemana(semana, disponivel) {
  const falta = disponivel === null || disponivel === undefined ? null : semana.total - disponivel
  return { falta: falta !== null && falta > 0 ? falta : 0, cobre: falta !== null && falta <= 0 }
}

export default function CaixaParaRepor({ sobra, semanaAtual, onDados }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [abertas, setAbertas] = useState(() => new Set())
  const alternar = chave => setAbertas(a => { const n = new Set(a); if (n.has(chave)) n.delete(chave); else n.add(chave); return n })

  useEffect(() => {
    if (!crmConfigurado()) { setErro('Endereço do CRM não configurado.'); return }
    let vivo = true
    crmApi.get('/api/reposicao/caixa-necessario?conta_ml=YUSO,M12')
      .then(r => { if (vivo) { setDados(r.data); if (onDados) onDados(r.data) } })
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
        const aberta = abertas.has(s.semana)
        const atrasados = s.skus.filter(k => k.atrasado).length
        return (
          <div key={s.semana} style={{ marginBottom: 8 }}>
            {/* Uma linha por semana; a lista de produtos só abre no clique, para
                não poluir a tela inicial da Caixa (pedido dela, 20/10/2026). */}
            <button type="button" aria-expanded={aberta} onClick={() => alternar(s.semana)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                textAlign: 'left', cursor: 'pointer', fontSize: 14,
                background: atrasados ? 'var(--color-danger-bg, transparent)' : 'transparent',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '9px 12px',
              }}>
              <span aria-hidden="true">{aberta ? '▾' : '▸'}</span>
              <strong>Semana {periodoDaSemana(s.semana)}: ter {brl(s.total)} em caixa</strong>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                {s.skus.length} {s.skus.length === 1 ? 'produto' : 'produtos'}
                {atrasados > 0 && <strong style={{ color: 'var(--color-danger)' }}> · {atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}</strong>}
              </span>
              {atual && (
                <span style={{ fontSize: 12.5, color: cobre ? 'var(--color-success, inherit)' : 'var(--color-danger)' }}>
                  {cobre ? `disponível cobre (${brl(sobra)})` : `faltam ${brl(falta)} (disponível ${brl(sobra)})`}
                </span>
              )}
            </button>
            {aberta && (
              <ul style={{ margin: '6px 0 0', padding: '8px 12px 8px 30px', fontSize: 13,
                           border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                {s.skus.map(k => (
                  <li key={k.sku || k.titulo}>
                    {k.sku || k.titulo} — {k.quantidade_repor} un · {brl(k.valor)} · ruptura em {dia(k.ruptura_em)}
                    {k.atrasado ? ' · ATRASADO, comprar já' : ` · pagar até ${dia(k.pagar_ate)}`}
                    {k.em_transito > 0 ? ` · ${k.em_transito} un a caminho` : ''}
                    {k.comprado_nao_enviado > 0 ? ` · ${k.comprado_nao_enviado} un já compradas, falta enviar` : ''}
                  </li>
                ))}
              </ul>
            )}
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
