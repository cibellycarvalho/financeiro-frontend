import { useState } from 'react'

const STORAGE_KEY = 'cravelli-theme'

export function useTheme() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  function toggleTheme() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    setIsDark(next)
  }

  return { isDark, toggleTheme }
}
