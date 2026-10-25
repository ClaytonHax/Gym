import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Button } from './ui'
import { applyUpdate, subscribeUpdate } from '../lib/swUpdate'

/** True while a new version is waiting. */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => subscribeUpdate(setAvailable), [])
  return available
}

/**
 * "A new version is ready" row at the top of the inbox. It counts towards the
 * bell badge instead of popping over the page. Updating reloads, so it only
 * happens when the user taps Update (or pulls to refresh); ignoring it is fine,
 * the new version takes over on the next restart or reload.
 */
export function UpdateNotice() {
  const available = useUpdateAvailable()
  const [busy, setBusy] = useState(false)

  if (!available) return null

  return (
    <div role="status" className="card flex items-center gap-3 border-brand-500/40 p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
        <Icon name="rotate" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Update available</p>
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
    </div>
  )
}
