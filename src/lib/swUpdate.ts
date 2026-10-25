/**
 * Service-worker update flow.
 *
 * - A new version found while the app is open never reloads the page on its own:
 *   we surface an "Update available" prompt (see UpdatePrompt) and the user
 *   chooses when to apply it.
 * - If they ignore it, the new version simply takes over the next time the app
 *   is restarted or reloaded: a waiting worker detected right at startup is
 *   applied immediately, before anyone has had a chance to start typing.
 * - We poll for new deploys so long-open PWAs notice them.
 */
export const CHECK_MS = 30 * 60 * 1000
/** A waiting worker found within this long of page load counts as "a restart". */
export const BOOT_MS = 4000

type Listener = (available: boolean) => void
const listeners = new Set<Listener>()
let available = false

/** UI subscribes here; returns the current state immediately. */
export function subscribeUpdate(fn: Listener): () => void {
  listeners.add(fn)
  fn(available)
  return () => void listeners.delete(fn)
}

export function setUpdateAvailable(next: boolean) {
  available = next
  for (const fn of listeners) fn(next)
}

let apply: () => void = () => {}
/** main.tsx hands over the real "activate the waiting worker + reload" function. */
export function registerApply(fn: () => void) {
  apply = fn
}
export function applyUpdate() {
  apply()
}

function editableFocused(): boolean {
  const el = document.activeElement
  return (
    el instanceof HTMLElement &&
    el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  )
}

/**
 * Decide what to do when a waiting worker is reported. At startup it is applied
 * straight away (the page just (re)loaded); mid-session the user is asked.
 */
export function updateAction(msSincePageLoad: number, typing = editableFocused()): 'apply' | 'prompt' {
  return msSincePageLoad < BOOT_MS && !typing ? 'apply' : 'prompt'
}

/** Poll for new deploys so long-open PWAs notice them. */
export function watchForUpdates(registration: ServiceWorkerRegistration) {
  const check = () => void registration.update().catch(() => {})
  setInterval(check, CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
