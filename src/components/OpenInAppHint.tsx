import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { IconButton } from './ui'
import { isIos, isStandalone } from '../lib/push'

/**
 * Invite links open the installed app on Android (the manifest's link capture),
 * but iPhone always opens them in Safari, which has its own separate login. So
 * on an iPhone browser visit from an invite, point people at the Home Screen
 * app; they can still carry on here if they don't have it.
 */
export function OpenInAppHint({ handle }: { handle?: string }) {
  const { pathname, search } = useLocation()
  const [dismissed, setDismissed] = useState(false)
  const fromInvite = pathname.startsWith('/add/') || new URLSearchParams(search).has('invite')

  if (dismissed || !fromInvite || isStandalone() || !isIos()) return null

  return (
    <div role="note" className="card mx-auto flex w-full max-w-2xl items-start gap-3 p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
        <Icon name="download" size={18} />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Got Gym on your Home Screen?</span>
        <span className="block text-[var(--color-fg-muted)]">
          iPhone opens links in Safari. Open the app and search{' '}
          {handle ? <b className="text-[var(--color-fg)]">{handle}</b> : 'their username'} in Friends, or carry on here.
        </span>
      </p>
      <IconButton icon="x" label="Dismiss" onClick={() => setDismissed(true)} />
    </div>
  )
}
