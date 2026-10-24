import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Button, EmptyState, IconButton, PageTitle } from '../components/ui'
import { Avatar } from '../components/social'
import { PushToggleCard } from '../components/PushSettings'
import { useProfiles, useSocial } from '../contexts/SocialContext'
import { dayKey } from '../lib/date'
import { describeNotification, timeAgo, type AppNotification, type NotificationType } from '../lib/social'

const TYPE_ICON: Record<NotificationType, { icon: IconName; tone: string }> = {
  friend_request: { icon: 'user-plus', tone: 'bg-sky-500 text-ink-950' },
  friend_accept: { icon: 'users', tone: 'bg-go-500 text-ink-950' },
  nudge: { icon: 'hand', tone: 'bg-brand-500 text-ink-950' },
  kudos: { icon: 'flame', tone: 'bg-brand-500 text-ink-950' },
  workout: { icon: 'dumbbell', tone: 'bg-violet-400 text-ink-950' },
  challenge_invite: { icon: 'swords', tone: 'bg-amber-400 text-ink-950' },
  challenge_join: { icon: 'swords', tone: 'bg-go-500 text-ink-950' },
}

function Row({
  n,
  username,
  onOpen,
}: {
  n: AppNotification
  /** The sender's current handle; the stored one may predate a rename. */
  username: string | undefined
  onOpen: (n: AppNotification) => void
}) {
  const d = describeNotification(n, username)
  const t = TYPE_ICON[n.type] ?? TYPE_ICON.nudge
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`flex min-h-16 w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150 hover:bg-[var(--color-surface-2)] ${
        n.read ? '' : 'bg-brand-500/[0.07]'
      }`}
    >
      <span className="relative shrink-0">
        <Avatar uid={n.from} name={username || n.fromUsername} size={44} />
        <span className={`absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full ring-2 ring-[var(--color-surface)] ${t.tone}`}>
          <Icon name={t.icon} size={13} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${n.read ? '' : 'font-semibold'}`}>{d.title}</span>
        {d.body ? <span className="mt-0.5 block text-sm text-[var(--color-fg-muted)]">“{d.body}”</span> : null}
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">{timeAgo(n.createdAt)}</span>
      </span>
      {!n.read ? (
        <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand-500">
          <span className="sr-only">Unread</span>
        </span>
      ) : null}
    </button>
  )
}

export function Notifications() {
  const navigate = useNavigate()
  const { notifications, unread, markRead } = useSocial()
  const opened = useRef(false)
  const profileOf = useProfiles(useMemo(() => notifications.map((n) => n.from), [notifications]))

  // Opening the inbox clears the badge after a moment, like most apps.
  useEffect(() => {
    if (opened.current || unread === 0) return
    opened.current = true
    const t = window.setTimeout(() => markRead().catch(() => {}), 2500)
    return () => window.clearTimeout(t)
  }, [unread, markRead])

  const groups = useMemo(() => {
    const today = dayKey()
    const t: AppNotification[] = []
    const earlier: AppNotification[] = []
    for (const n of notifications) (dayKey(new Date(n.createdAt)) === today ? t : earlier).push(n)
    return [
      { label: 'Today', items: t },
      { label: 'Earlier', items: earlier },
    ].filter((g) => g.items.length > 0)
  }, [notifications])

  function open(n: AppNotification) {
    if (!n.read) markRead([n.id]).catch(() => {})
    navigate(describeNotification(n, profileOf(n.from)?.username).to)
  }

  return (
    <div className="animate-rise flex flex-col gap-5">
      <div className="flex items-start gap-2">
        <IconButton icon="chevron-left" label="Back" onClick={() => navigate(-1)} className="-ml-2 mt-1" />
        <div className="flex-1">
          <PageTitle title="Notifications" subtitle={unread > 0 ? `${unread} unread` : 'You’re all caught up'} />
        </div>
        {unread > 0 ? (
          <Button size="sm" variant="ghost" icon="check" onClick={() => markRead()} className="mt-1">
            Read all
          </Button>
        ) : null}
      </div>

      <PushToggleCard compact />

      {notifications.length === 0 ? (
        <EmptyState
          icon="bell"
          title="No notifications yet"
          message="Nudges, friend requests, reactions and challenge invites land here."
        />
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              {g.label}
            </h2>
            <ul className="card flex flex-col p-1.5">
              {g.items.map((n) => (
                <li key={n.id}>
                  <Row n={n} username={profileOf(n.from)?.username} onOpen={open} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
