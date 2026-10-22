import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNativeApp } from './lib/nativeApp'
import { getConfigNotices } from './config/diagnostics'
import { log } from './lib/security'

// Validate the browser-safe environment once at startup. Notices name only the
// VARIABLE that needs attention — never a key value. Missing credentials are a
// supported demo state, so this is diagnostic (not fatal) by design.
for (const notice of getConfigNotices()) {
  log.warn('config', `${notice.message} [${notice.variables.join(', ')}]`)
}

// Register Capacitor hardware-back handling before first render. No-op on web.
initNativeApp()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
