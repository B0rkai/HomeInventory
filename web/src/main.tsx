import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { client } from './api/client.gen'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })
// Every API answer is JSON; anything else (say, an HTML page) is an error, not data.
// Keepalive lets a change held back for undoing still reach the server when the app closes.
client.setConfig({ parseAs: 'json', keepalive: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
