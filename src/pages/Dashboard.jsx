/**
 * Visão da Semana — o que vence, o que entra e o que sobra.
 *
 * Primeira tela reformulada no sistema visual descrito em
 * docs/superpowers/specs/2026-08-21-painel-sistema-visual-design.md, tendo o
 * Finco como referência de anatomia e as cores da Cravelli mantidas.
 *
 * O que veio do Finco: cabeçalho com subtítulo, grade de indicadores de largura
 * igual, e — o que mais importa — a CONTA embaixo de cada número. Lá, embaixo
 * do lucro líquido está escrito de que ele é feito. É isso que faz a tela
 * parecer simples; sem essa linha, cada número é um oráculo.
 *
 * O que NÃO veio: abas, barra de sincronização e exportar PDF. O Finco tem
 * porque tem o que pôr ali; esta tela não tem. Copiar deixaria a tela parecida
 * com o Finco e pior de usar. No lugar do cartão de filtros dele, uma faixa
 * dizendo de quando é o dado — a honestidade sem o controle inerte.
 */
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PaginaHeader from '../components/PaginaHeader'
import Indicador from '../components/Indicador'
import SecaoCard from '../components/SecaoCard'
import AlertaBadge from '../components/AlertaBadge'
import api from '../services/api'

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** "3 contas" / "1 conta" / "nenhuma conta" — plural escrito na mão porque são
    dois casos e Intl.PluralRules seria mais código que benefício aqui. */
function contar(n, singular, plural) {
  if (!n) return `nenhum${singular.endsWith('a') ? 'a' : ''} ${singular}`
  return `${n} ${n === 1 ? singular : plural}`
}

function Vazio({ children }) {
  return (
    <p style={{
      margin: 0, padding: '18px 4px', textAlign: 'center',
      fontSize: 13, color: 'var(--color-text-muted)',
    }}>{children}</p>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    api.get('/api/dashboard')
      .then(r => setData(r.data))
      .catch(() => setErro('Erro ao carregar dados.'))
  }, [])

  if (erro) return <Layout><p style={{ color: 'var(--color-danger)' }}>{erro}</p></Layout>
  if (!data) return <Layout><p style={{ color: 'var(--color-text-muted)' }}>Carregando…</p></Layout>

  const { totais, contas_semana, alertas, fornecedores_aberto } = data

  const hoje = new Date()
  const fim = new Date(hoje.getTime() + 7 * 86400000)
  const fmt = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const mesPorExtenso = hoje.toLocaleDateString('pt-BR', { month: 'long' })

  return (
    <Layout>
      <PaginaHeader
        titulo="Visão da Semana"
        subtitulo="O que vence, o que entra e o que sobra nos próximos 7 dias."
      />

      {/* De quando são os números. O Finco sempre diz o período; aqui a tela
          não tem filtro nenhum, então em vez de um cartão de controles vazio
          fica só a informação. */}
      <p style={{
        margin: '0 0 18px', fontSize: 12.5, color: 'var(--color-text-muted)',
      }}>
        Semana de {fmt(hoje)} a {fmt(fim)} · valores do mês de {mesPorExtenso}
      </p>

      {alertas?.repasse_divergencia && (
        <div style={{ marginBottom: 16 }}>
          <AlertaBadge texto="⚠️ Divergência de repasse detectada" tipo="error" />
        </div>
      )}

      <div style={{
        display: 'grid', gap: 14, marginBottom: 22,
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
      }}>
        <Indicador
          rotulo="A pagar esta semana"
          valor={totais.a_pagar_semana}
          tom="divida"
          composicao={`${contar(totais.n_contas_semana, 'conta', 'contas')} até ${fmt(fim)}`}
        />
        <Indicador
          rotulo="Saldo disponível para compras"
          valor={totais.saldo_disponivel}
          tom="auto"
          composicao={
            `Repasses ${brl(totais.repasses_bruto_mes)} − cobranças do ML ` +
            `${brl(totais.cobranças_ml_mes)} − contas ${brl(Number(totais.contas_pagas_mes || 0) + Number(totais.contas_pendentes_mes || 0))} ` +
            `− fornecedores ${brl(totais.fornecedores_aberto)}`
          }
        />
        <Indicador
          rotulo={`Repasse ML (${mesPorExtenso})`}
          valor={totais.repasses_bruto_mes}
          composicao={`O ML já cobrou ${brl(totais.cobranças_ml_mes)} neste mês`}
        />
        <Indicador
          rotulo="Fornecedores em aberto"
          valor={totais.fornecedores_aberto}
          tom="divida"
          composicao={contar(totais.n_fornecedores_aberto, 'fornecedor com saldo', 'fornecedores com saldo')}
        />
      </div>

      <SecaoCard
        titulo="Contas vencendo em 7 dias"
        subtitulo="Só o que ainda não foi pago, da mais próxima para a mais distante."
      >
        {contas_semana.length === 0
          ? <Vazio>Nenhuma conta vencendo nos próximos 7 dias.</Vazio>
          : contas_semana.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: 'var(--color-row)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
            }}>
              <span style={{
                flexShrink: 0, fontSize: 12, fontWeight: 600, minWidth: 46,
                color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums',
              }}>{dia(c.vencimento)}</span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 14 }}>
                {c.descricao}
                {c.categoria && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {c.categoria}
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              }}>{brl(c.valor)}</span>
              <AlertaBadge
                texto={c.status}
                tipo={c.status === 'vencido' ? 'error' : c.status === 'pago' ? 'ok' : 'warning'}
              />
            </div>
          ))
        }
      </SecaoCard>

      <SecaoCard
        titulo="Fornecedores com saldo em aberto"
        subtitulo="Pedidos já recebidos que ainda não foram pagos por inteiro."
        total={fornecedores_aberto.length > 1 ? brl(totais.fornecedores_aberto) : undefined}
      >
        {fornecedores_aberto.length === 0
          ? <Vazio>Nenhum fornecedor com saldo em aberto.</Vazio>
          : fornecedores_aberto.map(f => (
            <div key={f.nome} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--color-row)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
            }}>
              <span style={{ flex: 1, fontSize: 14 }}>{f.nome}</span>
              <span style={{
                fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-warning)',
              }}>{brl(f.saldo_aberto)}</span>
            </div>
          ))
        }
      </SecaoCard>
    </Layout>
  )
}
