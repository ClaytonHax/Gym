import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { registerApply, setUpdateAvailable, updateAction, watchForUpdates } from './lib/swUpdate'
import { trackEditingFocus } from './lib/editingFocus'
import './index.css'

trackEditingFocus()

// Prompt mode: a new version found mid-session asks the user (UpdatePrompt);
// one found right at startup is applied immediately.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => {
    if (updateAction(performance.now()) === 'apply') void updateSW(true)
    else setUpdateAvailable(true)
  },
  onRegisteredSW: (_url, registration) => {
    if (registration) watchForUpdates(registration)
  },
})

registerApply(() => void updateSW(true))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
