import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
      <Toaster
        position="top-right"
        containerStyle={{ top: 'calc(var(--titlebar-h) + 12px)', right: '12px' }}
        toastOptions={{
          duration: 2600,
          style: {
            fontSize: 14, fontWeight: 500, borderRadius: 12,
            background: 'var(--color-panel)', color: 'var(--color-ink)',
            border: '1px solid var(--color-line)', boxShadow: 'var(--shadow-toast)',
          },
        }}
      />
    </HashRouter>
  </React.StrictMode>,
)
