/**
 * Avisa quando o Painel já publicou uma versão nova e esta aba ainda roda a
 * anterior.
 *
 * Portado do CRM (ml-seller-app), onde nasceu para resolver "atualizo e vem do
 * jeito programado; troco de aba e some tudo o que você programou" — não sumia
 * nada, a outra aba nunca tinha recarregado.
 *
 * No Painel a necessidade apareceu em 21/08/2026 pelo caminho oposto: o
 * redesenho do Lucro Real subiu, o servidor já entregava a versão nova, e ela
 * disse "não tô vendo nada de diferente". A causa era o index.html ficar em
 * cache — isso foi corrigido no nginx.conf. Este aviso é a segunda linha de
 * defesa, para a aba que já estava aberta antes do deploy: nenhuma política de
 * cache conserta isso, porque a aba aberta simplesmente não pede nada de novo.
 *
 * Não recarrega sozinho de propósito: ela pode estar no meio de um lançamento
 * do Fechamento, e perder o que digitou seria pior que a tela desatualizada.
 */
import { useEffect, useState } from 'react'

function bundleAtual() {
  const s = document.querySelector('script[type="module"][src]') ||
            document.querySelector('script[src*="/assets/"]')
  return s ? s.getAttribute('src') : null
}

async function bundleDoServidor() {
  const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
  const m = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)
  return m ? m[1] : null
}

export default function AvisoNovaVersao({ intervaloMs = 60000 }) {
  const [temNova, setTemNova] = useState(false)

  useEffect(() => {
    const meu = bundleAtual()
    if (!meu) return // servidor de desenvolvimento: sem hash, nada a comparar

    let vivo = true
    async function conferir() {
      if (!vivo || document.hidden) return
      try {
        const doServidor = await bundleDoServidor()
        if (vivo && doServidor && doServidor !== meu) setTemNova(true)
      } catch {
        // rede oscilou — tenta de novo no próximo ciclo, sem incomodar
      }
    }

    const timer = setInterval(conferir, intervaloMs)
    // Voltar pra aba é exatamente quando o desencontro aparece: confere na hora.
    document.addEventListener('visibilitychange', conferir)
    window.addEventListener('focus', conferir)
    conferir()

    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', conferir)
      window.removeEventListener('focus', conferir)
    }
  }, [intervaloMs])

  if (!temNova) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 12, maxWidth: 380,
      background: 'var(--color-surface)', color: 'var(--color-text)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)', padding: '12px 16px',
    }}>
      <p style={{ margin: 0, flex: 1, fontSize: 13 }}>
        Existe uma versão nova do Painel. Esta aba ainda está com a anterior.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0, fontSize: 13, padding: '6px 14px', cursor: 'pointer',
          border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'var(--color-accent-solid)', color: 'var(--color-on-accent)',
        }}
      >Atualizar</button>
    </div>
  )
}
