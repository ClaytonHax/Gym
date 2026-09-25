import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Button, IconButton } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'gym.installDismissed'

/**
 * Add-to-home-screen nudge. Chrome/Android gets the native prompt; iOS Safari
 * has no API, so it gets the manual Share → Add to Home Screen instructions.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const ua = navigator.userAgent
    const isIosSafari =
      /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    // Delay so it doesn't land on top of the first paint.
    const timer = isIosSafari ? window.setTimeout(() => setShowIos(true), 6000) : undefined

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
    setShowIos(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    dismiss()
  }

  if (!deferred && !showIos) return null

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4">
      <div className="animate-rise mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-brand-500/40 bg-[var(--color-surface)] p-3 shadow-2xl shadow-ink-950/40">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="download" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Gym Tracker</p>
          <p className="text-xs text-[var(--color-fg-muted)]">
            {deferred
              ? 'Add it to your home screen for full-screen, offline use.'
              : 'Tap Share, then “Add to Home Screen”.'}
          </p>
        </div>
        {deferred ? (
          <Button size="sm" onClick={install}>
            Install
          </Button>
        ) : null}
        <IconButton icon="x" label="Dismiss install prompt" onClick={dismiss} />
      </div>
    </div>
  )
}
