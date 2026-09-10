import { useEffect, useState } from 'react'

/**
 * Ponto único onde o layout deixa de ter espaço para o menu fixo.
 *
 * 768px é a largura de um tablet em pé. Abaixo disso, o menu de 220px comeria
 * mais da metade da tela: medido em produção num celular de 375px, sobravam
 * 155px para o conteúdo — 41% — e até o título da página estourava.
 */
export const LARGURA_ESTREITA = 768

function consultar() {
  return window.matchMedia(`(max-width: ${LARGURA_ESTREITA}px)`)
}

export function useTelaEstreita() {
  const [estreita, setEstreita] = useState(
    () => typeof window !== 'undefined' && consultar().matches,
  )

  useEffect(() => {
    const media = consultar()
    const aoMudar = (e) => setEstreita(e.matches)
    media.addEventListener('change', aoMudar)
    return () => media.removeEventListener('change', aoMudar)
  }, [])

  return estreita
}
