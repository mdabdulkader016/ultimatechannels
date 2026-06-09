import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import App from './App.jsx'
import Admin from './components/Admin.jsx'
import './styles.css'

inject()
injectSpeedInsights()

// Hidden admin route — reachable only by typing /admin, never linked in the UI.
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <Admin /> : <App />}
  </React.StrictMode>,
)
