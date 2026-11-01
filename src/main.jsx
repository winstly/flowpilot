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
        toastOptions={{
          duration: 2600,
          style: { fontSize: 14, borderRadius: 12, border: '1px solid var(--color-line)', boxShadow: 'var(--shadow-pop)' },
        }}
      />
    </HashRouter>
  </React.StrictMode>,
)
