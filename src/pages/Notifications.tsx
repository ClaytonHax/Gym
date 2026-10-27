import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Button, EmptyState, PageTitle } from '../components/ui'
import { Avatar } from '../components/social'
import { PushToggleCard } from '../components/PushSettings'
import { UpdateNotice, useUpdateAvailable } from '../components/UpdatePrompt'
import { useProfiles, useSocial } from '../contexts/SocialContext'
import { dayKey } from '../lib/date'
import { describeNotification, timeAgo, type AppNotification, type NotificationType, type PublicProfile } from '../lib/social'

const TYPE_ICON: Record<NotificationType, { icon: IconName; tone: string }> = {
  friend_request: { icon: 'user-plus', tone: 'bg-sky-500 text-ink-950' },
  friend_accept: { icon: 'users', tone: 'bg-go-500 text-ink-950' },
  nudge: { icon: 'hand', tone: 'bg-brand-500 text-ink-950' },
  kudos: { icon: 'flame', tone: 'bg-brand-500 text-ink-950' },
  workout: { icon: 'dumbbell', tone: 'bg-violet-400 text-ink-950' },
  challenge_invite: { icon: 'swords', tone: 'bg-amber-400 text-ink-950' },
  challenge_join: { icon: 'swords', tone: 'bg-go-500 text-ink-950' },
  challenge_left: { icon: 'swords', tone: 'bg-rest text-ink-950' },
  streak_risk: { icon: 'flame', tone: 'bg-brand-500 text-ink-950' },
  streak_lost: { icon: 'flame', tone: 'bg-rest text-ink-950' },
  finish_workout: { icon: 'dumbbell', tone: 'bg-brand-500 text-ink-950' },
  missed_day: { icon: 'flame', tone: 'bg-rest text-ink-950' },
  friend_streak: { icon: 'flame', tone: 'bg-brand-500 text-ink-950' },
}

function Row({
  n,
  sender,
  onOpen,
}: {
  n: AppNotification
  /** The sender's current profile; the stored handle may predate a rename and has no name. */
  sender: PublicProfile | undefined
  onOpen: (n: AppNotification) => void
}) {
  const d = describeNotification(n, sender)
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
        <Avatar uid={n.type === 'friend_streak' && n.ref ? n.ref : n.from} name={sender?.displayName || sender?.username || n.fromUsername} size={44} />
        <span className={`absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full ring-2 ring-[var(--color-surface)] ${t.tone}`}>
          <Icon name={t.icon} size={13} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${n.read ? '' : 'font-semibold'}`}>{d.title}</span>
        {d.body ? <span className="mt-0.5 block text-sm text-[var(--color-fg-muted)]">“{d.body}”</span> : null}
        <span className="mt-1 block text-xs text-[var(--color-fg-muted)]">
          {sender?.displayName && d.handle ? `${d.handle} · ` : ''}
          {timeAgo(n.createdAt)}
        </span>
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
  const { notifications, markRead } = useSocial()
  // Count straight from the list on screen so the header can never contradict it.
  const unread = notifications.filter((n) => !n.read).length
  const update = useUpdateAvailable()
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
    navigate(describeNotification(n, profileOf(n.from)).to)
  }

  return (
    <div className="animate-rise flex flex-col gap-5">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => navigate(-1)} className="-ml-2 mt-1">
          Back
        </Button>
        <div className="flex-1">
          <PageTitle title="Notifications" subtitle={notifications.length === 0 && !update ? 'Nothing here yet' : unread > 0 ? `${unread} unread` : update ? 'Update available' : 'You’re all caught up'} />
        </div>
        {unread > 0 ? (
          <Button size="sm" variant="ghost" icon="check" onClick={() => markRead()} className="mt-1">
            Read all
          </Button>
        ) : null}
      </div>

      <UpdateNotice />

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
                  <Row n={n} sender={profileOf(n.from)} onOpen={open} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
