import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './design-tokens.css'

const STORAGE_KEY = 'cravelli-theme'
const savedTheme = localStorage.getItem(STORAGE_KEY)
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
