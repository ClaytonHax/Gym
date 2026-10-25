import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Button, IconButton } from './ui'
import { applyUpdate, subscribeUpdate } from '../lib/swUpdate'

/**
 * "A new version is ready" prompt. Updating reloads the page, so it only ever
 * happens when the user taps Update; ignoring it is fine, the new version takes
 * over on the next restart or reload.
 */
export function UpdatePrompt() {
  const [available, setAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeUpdate(setAvailable), [])

  if (!available || dismissed) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-60 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div
        role="status"
        className="animate-rise pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl border
          border-brand-500/40 bg-[var(--color-surface)] p-3 shadow-2xl shadow-ink-950/40"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="rotate" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Update available</p>
          <p className="text-xs text-[var(--color-fg-muted)]">Reload for the latest version, or it applies next time you open the app.</p>
        </div>
        <Button
          size="sm"
          loading={busy}
          onClick={() => {
            setBusy(true)
            applyUpdate()
          }}
        >
          Update
        </Button>
        <IconButton icon="x" label="Not now" onClick={() => setDismissed(true)} />
      </div>
    </div>
  )
}
