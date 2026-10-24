import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { createUpdateScheduler, watchForUpdates } from './lib/swUpdate'
import { trackEditingFocus } from './lib/editingFocus'
import './index.css'

trackEditingFocus()

// Prompt mode: a new version waits until the user is idle (never mid-typing).
const scheduler = createUpdateScheduler(() => void updateSW(true))
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => scheduler.notify(),
  onRegisteredSW: (_url, registration) => {
    if (registration) watchForUpdates(registration)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
