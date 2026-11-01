import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './theme.css'

// 桌面壳注入高度偏移标记（标题条 32px；Web 不打标）
if (window.desktop) document.documentElement.classList.add('is-desktop')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2600,
          style: { fontSize: 13, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(15,20,40,.10)' },
        }}
      />
    </HashRouter>
  </React.StrictMode>,
)
