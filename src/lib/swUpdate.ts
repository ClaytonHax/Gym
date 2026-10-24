/**
 * Deferred service-worker updates.
 *
 * A new deploy must never reload the page while someone is typing, so when a
 * new version is waiting we only apply it once the user has been idle for
 * IDLE_MS with no editable element focused. Hiding the page applies it
 * immediately (nobody is typing then). The active workout is persisted, so a
 * reload at idle is safe. If we never get the chance, the waiting worker
 * activates on the next cold start of the app anyway.
 */
export const IDLE_MS = 5000
export const CHECK_MS = 30 * 60 * 1000

const ACTIVITY = ['keydown', 'input', 'pointerdown', 'touchstart', 'wheel', 'scroll'] as const

function editableFocused(): boolean {
  const el = document.activeElement
  return (
    el instanceof HTMLElement &&
    el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  )
}

/** Returns `notify()` to call when an update is waiting, and `stop()`. */
export function createUpdateScheduler(apply: () => void) {
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const run = () => {
    timer = undefined
    if (!pending) return
    if (editableFocused()) return // re-armed by focusout/activity
    pending = false
    stop()
    apply()
  }
  const arm = () => {
    if (!pending) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, IDLE_MS)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && pending) {
      pending = false
      stop()
      apply()
    }
  }
  const onFocusOut = () => arm()

  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
    for (const t of ACTIVITY) window.removeEventListener(t, arm, true)
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('focusout', onFocusOut)
  }

  return {
    notify() {
      if (pending) return
      pending = true
      for (const t of ACTIVITY) window.addEventListener(t, arm, { capture: true, passive: true })
      document.addEventListener('visibilitychange', onVisibility)
      document.addEventListener('focusout', onFocusOut)
      arm()
    },
    stop,
  }
}

/** Poll for new deploys so long-open PWAs notice them. */
export function watchForUpdates(registration: ServiceWorkerRegistration) {
  const check = () => void registration.update().catch(() => {})
  setInterval(check, CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
