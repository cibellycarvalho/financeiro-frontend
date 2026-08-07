import { useState } from 'react'

const STORAGE_KEY = 'cravelli-theme'

export function useTheme() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  function toggleTheme() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    } catch {
      // localStorage indisponível (ex: storage bloqueado) — tema ainda funciona nesta sessão
    }
    setIsDark(next)
  }

  return { isDark, toggleTheme }
}
