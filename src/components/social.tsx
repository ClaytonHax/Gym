import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { Button, Field, IconButton, Segmented, Sheet, Spinner } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useUnit } from '../contexts/SettingsContext'
import { fmtDuration } from '../lib/date'
import { fmtVolume } from '../lib/units'
import {
  avatarColor,
  daysLeft,
  challengeState,
  initials,
  METRICS,
  NUDGE_PRESETS,
  REACTIONS,
  timeAgo,
  type ActivityItem,
  type BoardMetric,
  type Challenge,
  type ChallengeMetric,
  type PublicProfile,
  type Reaction,
} from '../lib/social'
import type { Unit } from '../types'

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export function Avatar({
  uid,
  name,
  size = 44,
  ring = false,
}: {
  uid: string
  name: string
  size?: number
  ring?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-display font-bold text-ink-950 ${
        ring ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-[var(--color-surface)]' : ''
      }`}
      style={{ width: size, height: size, backgroundColor: avatarColor(uid), fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  )
}

export function displayOf(p: PublicProfile | undefined): { name: string; handle: string } {
  if (!p) return { name: 'Friend', handle: '' }
  return { name: p.displayName || p.username, handle: `@${p.username}` }
}

export function fmtMetric(metric: BoardMetric, value: number, unit: Unit): string {
  if (metric === 'volume') return fmtVolume(value, unit)
  if (metric === 'minutes') {
    const h = Math.floor(value / 60)
    return h > 0 ? `${h}h ${String(Math.round(value % 60)).padStart(2, '0')}m` : `${Math.round(value)}m`
  }
  if (metric === 'streak') return String(value)
  return value.toLocaleString()
}

/* -------------------------------------------------------------------------- */
/* Notifications bell                                                          */
/* -------------------------------------------------------------------------- */

export function NotificationBell() {
  const { unread } = useSocial()
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--color-line)]
        bg-[var(--color-surface)] text-[var(--color-fg-muted)] transition-colors duration-200
        hover:border-brand-500/60 hover:text-brand-400"
    >
      <Icon name="bell" size={20} />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="animate-pop absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full
            bg-rose-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[var(--color-canvas)]"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/* Nudge                                                                       */
/* -------------------------------------------------------------------------- */

export function NudgeSheet({
  friend,
  onClose,
}: {
  friend: PublicProfile | null
  onClose: () => void
}) {
  const { nudge } = useSocial()
  const toast = useToast()
  const [choice, setChoice] = useState(NUDGE_PRESETS[0])
  const [custom, setCustom] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (friend) {
      setChoice(NUDGE_PRESETS[0])
      setCustom('')
    }
  }, [friend])

  async function send() {
    if (!friend) return
    setSending(true)
    try {
      const text = custom.trim() || choice
      const result = await nudge(friend.uid, text)
      toast(
        result === 'sent' ? `Nudge sent to @${friend.username}.` : `You already nudged @${friend.username} today.`,
        result === 'sent' ? 'success' : 'info'
      )
      onClose()
    } catch {
      toast('Couldn’t send that nudge. Check your connection.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet
      open={friend !== null}
      onClose={onClose}
      title={friend ? `Nudge @${friend.username}` : 'Nudge'}
      footer={
        <Button full size="lg" icon="hand" loading={sending} onClick={send}>
          Send nudge
        </Button>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-fg-muted)]">
        One nudge per friend per day — make it count.
      </p>
      <fieldset>
        <legend className="sr-only">Pick a message</legend>
        <div className="flex flex-col gap-2">
          {NUDGE_PRESETS.map((text) => {
            const selected = !custom.trim() && choice === text
            return (
              <button
                key={text}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setChoice(text)
                  setCustom('')
                }}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-[15px] font-medium transition-colors duration-200 ${
                  selected
                    ? 'border-brand-500 bg-brand-500/10 text-[var(--color-fg)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                }`}
              >
                {text}
                {selected ? <Icon name="check" size={18} className="shrink-0 text-brand-400" /> : null}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="mt-4">
        <Field
          label="Or write your own"
          value={custom}
          maxLength={140}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Leg day waits for no one…"
          hint={`${custom.length}/140`}
        />
      </div>
    </Sheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Feed                                                                        */
/* -------------------------------------------------------------------------- */

const REACTION_ICON: Record<Reaction, IconName> = { fire: 'flame', strong: 'dumbbell', beast: 'zap' }

export function ActivityCard({
  item,
  profile,
  onNameClick = true,
}: {
  item: ActivityItem
  profile: PublicProfile | undefined
  onNameClick?: boolean
}) {
  const { user } = useAuth()
  const { react, friends } = useSocial()
  const toast = useToast()
  const unit = useUnit()
  const mine = item.uid === user?.uid
  const myReaction = user ? item.reactions[user.uid] : undefined
  const { name, handle } = displayOf(profile)
  const [pending, setPending] = useState<Reaction | null>(null)

  const counts = useMemo(() => {
    const c: Record<Reaction, number> = { fire: 0, strong: 0, beast: 0 }
    for (const r of Object.values(item.reactions)) if (r in c) c[r]++
    return c
  }, [item.reactions])

  const reactors = useMemo(() => {
    if (!mine) return []
    return Object.keys(item.reactions).map(
      (id) => friends.find((f) => f.uid === id)?.profile?.username ?? 'friend'
    )
  }, [mine, item.reactions, friends])

  async function toggle(r: Reaction) {
    if (mine || pending) return
    setPending(r)
    try {
      await react(item.uid, item.id, item.name, myReaction === r ? null : r)
    } catch {
      toast('Couldn’t react to that workout.', 'error')
    } finally {
      setPending(null)
    }
  }

  const header = (
    <>
      <Avatar uid={item.uid} name={name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {mine ? 'You' : name}
          <span className="font-normal text-[var(--color-fg-muted)]"> trained</span>
        </span>
        <span className="block truncate text-xs text-[var(--color-fg-muted)]">
          {mine ? '' : `${handle} · `}
          {timeAgo(item.at)}
        </span>
      </span>
    </>
  )

  return (
    <article className="card p-4">
      {onNameClick && !mine ? (
        <Link to={`/friends/${item.uid}`} className="-m-1 flex items-center gap-3 rounded-xl p-1 hover:bg-[var(--color-surface-2)]">
          {header}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{header}</div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <h3 className="min-w-0 truncate font-display text-2xl font-bold leading-none">{item.name}</h3>
        {item.prs > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-950">
            <Icon name="trophy" size={12} />
            {item.prs} PR{item.prs === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <dl className="tabular mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--color-surface-2)] p-2.5 text-center">
        {[
          { label: 'Time', value: fmtDuration(item.durationSec).replace(/ \d+s$/, '') },
          { label: 'Sets', value: String(item.sets) },
          { label: 'Volume', value: fmtVolume(item.volumeKg, unit) },
        ].map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{s.label}</dt>
            <dd className="truncate font-display text-lg font-bold leading-tight">{s.value}</dd>
          </div>
        ))}
      </dl>

      {item.exercises.length > 0 ? (
        <p className="mt-2.5 line-clamp-2 text-sm text-[var(--color-fg-muted)]">
          {item.exercises.join(' · ')}
          {item.exerciseCount > item.exercises.length ? ` · +${item.exerciseCount - item.exercises.length} more` : ''}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-line)] pt-3">
        {REACTIONS.map((r) => {
          const selected = myReaction === r.id
          const count = counts[r.id]
          if (mine && count === 0) return null
          return (
            <button
              key={r.id}
              type="button"
              disabled={mine}
              aria-pressed={mine ? undefined : selected}
              aria-label={`${r.label}${count ? `, ${count}` : ''}`}
              onClick={() => toggle(r.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors duration-200 disabled:cursor-default disabled:opacity-100 ${
                selected
                  ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                  : 'border-[var(--color-line)] text-[var(--color-fg-muted)] enabled:hover:border-brand-500/60 enabled:hover:text-brand-400'
              }`}
            >
              {pending === r.id ? <Spinner size={16} /> : <Icon name={REACTION_ICON[r.id]} size={16} />}
              {count > 0 ? <span className="tabular">{count}</span> : <span className="sr-only">{r.label}</span>}
            </button>
          )
        })}
        {mine ? (
          <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-fg-muted)]">
            {reactors.length > 0
              ? `@${reactors.slice(0, 2).join(', @')}${reactors.length > 2 ? ` +${reactors.length - 2}` : ''} reacted`
              : 'No reactions yet'}
          </p>
        ) : null}
      </div>
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/* Add friends                                                                 */
/* -------------------------------------------------------------------------- */

export function inviteUrl(username: string): string {
  return `${window.location.origin}/u/${username}`
}

export async function shareInvite(username: string, toast: ReturnType<typeof useToast>) {
  const url = inviteUrl(username)
  const text = `Add me on Gym Tracker — I'm @${username}. Let's compete.`
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Gym Tracker', text, url })
      return
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    toast('Invite link copied.')
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') toast('Couldn’t share the link.', 'error')
  }
}

export function FriendActionButton({ target }: { target: PublicProfile }) {
  const { user } = useAuth()
  const { isFriend, outgoing, incoming, sendRequest, acceptRequest } = useSocial()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (target.uid === user?.uid) {
    return <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">You</span>
  }
  if (isFriend(target.uid)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-go-400">
        <Icon name="check" size={14} /> Friends
      </span>
    )
  }
  if (outgoing.some((r) => r.to === target.uid)) {
    return <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">Requested</span>
  }
  const theirs = incoming.find((r) => r.from === target.uid)

  return (
    <Button
      size="sm"
      variant={theirs ? 'go' : 'primary'}
      icon={theirs ? 'check' : 'user-plus'}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          if (theirs) {
            await acceptRequest(theirs)
            toast(`You and @${target.username} are now friends.`)
          } else {
            const result = await sendRequest(target)
            toast(result === 'accepted' ? `You and @${target.username} are now friends.` : `Request sent to @${target.username}.`)
          }
        } catch {
          toast('Couldn’t send that request.', 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {theirs ? 'Accept' : 'Add'}
    </Button>
  )
}

export function AddFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, searchUsers } = useSocial()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) {
      setQ('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.replace(/^@/, '').length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const t = window.setTimeout(() => {
      searchUsers(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => window.clearTimeout(t)
  }, [q, searchUsers])

  return (
    <Sheet open={open} onClose={onClose} title="Add friends">
      <Field
        label="Search by username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="@username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="search"
        suffix={searching ? <Spinner size={16} /> : <Icon name="search" size={18} />}
      />

      <ul className="mt-3 flex flex-col gap-1" aria-live="polite">
        {results.map((p) => (
          <li key={p.uid} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar uid={p.uid} name={p.displayName || p.username} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.displayName || p.username}</span>
              <span className="block truncate text-sm text-[var(--color-fg-muted)]">@{p.username}</span>
            </span>
            <FriendActionButton target={p} />
          </li>
        ))}
        {!searching && q.replace(/^@/, '').trim().length >= 2 && results.length === 0 ? (
          <li className="px-2 py-4 text-center text-sm text-[var(--color-fg-muted)]">
            Nobody with that username yet. Send them an invite instead.
          </li>
        ) : null}
      </ul>

      {me ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">Your username</p>
          <p className="font-display text-2xl font-bold">@{me.username}</p>
          <Button variant="secondary" full icon="share" className="mt-3" onClick={() => shareInvite(me.username, toast)}>
            Share invite link
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/* -------------------------------------------------------------------------- */
/* Challenges                                                                  */
/* -------------------------------------------------------------------------- */

const CHALLENGE_METRICS: ChallengeMetric[] = ['workouts', 'days', 'volume', 'sets', 'minutes']
const DURATIONS = [
  { value: '3', label: '3 days' },
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '30 days' },
] as const

export function NewChallengeSheet({
  open,
  onClose,
  preselect,
  myScoreFor,
}: {
  open: boolean
  onClose: () => void
  preselect?: string
  /** Your score so far for a challenge starting today. */
  myScoreFor: (metric: ChallengeMetric, days: number) => number
}) {
  const { friends, createChallenge } = useSocial()
  const toast = useToast()
  const [picked, setPicked] = useState<string[]>([])
  const [metric, setMetric] = useState<ChallengeMetric>('workouts')
  const [days, setDays] = useState<(typeof DURATIONS)[number]['value']>('7')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setPicked(preselect ? [preselect] : [])
  }, [open, preselect])

  const title = `Most ${METRICS[metric].label.toLowerCase()}`

  async function create() {
    if (picked.length === 0) return
    setSaving(true)
    try {
      const n = Number(days)
      await createChallenge({ title, metric, days: n, members: picked, myScore: myScoreFor(metric, n) })
      toast(`Challenge sent to ${picked.length} friend${picked.length === 1 ? '' : 's'}.`)
      onClose()
    } catch {
      toast('Couldn’t create that challenge.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New challenge"
      footer={
        <Button full size="lg" icon="swords" loading={saving} disabled={picked.length === 0} onClick={create}>
          {picked.length === 0 ? 'Pick at least one friend' : 'Send challenge'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
            Compete on
          </p>
          <div className="flex flex-wrap gap-2">
            {CHALLENGE_METRICS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`min-h-11 rounded-full border px-4 text-sm font-bold transition-colors duration-200 ${
                  metric === m
                    ? 'border-brand-500 bg-brand-500 text-ink-950'
                    : 'border-[var(--color-line)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                }`}
              >
                {METRICS[m].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
            Duration
          </p>
          <Segmented label="Challenge length" value={days} onChange={setDays} options={[...DURATIONS]} />
          <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">Starts today. Today’s workouts count.</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]">
            Who’s in? <span className="normal-case tracking-normal">(up to 4)</span>
          </p>
          {friends.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">Add a friend first to challenge them.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {friends.map((f) => {
                const checked = picked.includes(f.uid)
                const { name, handle } = displayOf(f.profile)
                const full = !checked && picked.length >= 4
                return (
                  <li key={f.uid}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={full}
                      onClick={() =>
                        setPicked((p) => (checked ? p.filter((x) => x !== f.uid) : [...p, f.uid]))
                      }
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors duration-200 disabled:opacity-40 ${
                        checked ? 'border-brand-500 bg-brand-500/10' : 'border-transparent hover:bg-[var(--color-surface-2)]'
                      }`}
                    >
                      <Avatar uid={f.uid} name={name} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{name}</span>
                        <span className="block truncate text-xs text-[var(--color-fg-muted)]">{handle}</span>
                      </span>
                      <span
                        className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${
                          checked ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-[var(--color-line)]'
                        }`}
                      >
                        {checked ? <Icon name="check" size={14} /> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  )
}

export function ChallengeCard({
  c,
  myScoreFor,
}: {
  c: Challenge
  myScoreFor: (c: Challenge) => number
}) {
  const { user } = useAuth()
  const { me, friends, joinChallenge, declineChallenge, deleteChallenge } = useSocial()
  const toast = useToast()
  const unit = useUnit()
  const [busy, setBusy] = useState(false)
  const uid = user?.uid ?? ''
  const state = challengeState(c)
  const invited = !c.accepted.includes(uid) && !c.declined.includes(uid)

  const nameOf = (id: string) =>
    id === uid ? 'You' : (friends.find((f) => f.uid === id)?.profile?.username ?? 'player')

  const players = c.members
    .filter((m) => !c.declined.includes(m))
    .map((m) => ({
      uid: m,
      joined: c.accepted.includes(m),
      score: c.scores[m] ?? 0,
      name: m === uid ? (me?.displayName || 'You') : (friends.find((f) => f.uid === m)?.profile?.displayName ?? ''),
    }))
    .sort((a, b) => Number(b.joined) - Number(a.joined) || b.score - a.score)
  const top = Math.max(1, ...players.map((p) => p.score))
  const leader = players.find((p) => p.joined && p.score > 0 && p.score === top)
  const tied = players.filter((p) => p.joined && p.score === leader?.score).length > 1

  const status =
    state === 'finished'
      ? leader
        ? tied
          ? 'Finished · tie'
          : `Finished · ${leader.uid === uid ? 'You won' : `@${nameOf(leader.uid)} won`}`
        : 'Finished'
      : state === 'upcoming'
        ? 'Starts soon'
        : `${daysLeft(c)} day${daysLeft(c) === 1 ? '' : 's'} left`

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
    } catch {
      toast('Something went wrong. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`p-4 ${state === 'active' ? 'card-accent' : 'card'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
              state === 'finished' ? 'text-[var(--color-fg-muted)]' : 'text-brand-400'
            }`}
          >
            {status}
          </p>
          <h3 className="mt-0.5 font-display text-2xl font-bold leading-tight">{c.title}</h3>
          <p className="text-xs text-[var(--color-fg-muted)]">
            {new Date(`${c.startDay}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} –{' '}
            {new Date(`${c.endDay}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {c.creator !== uid ? ` · from @${nameOf(c.creator)}` : ''}
          </p>
        </div>
        {c.creator === uid ? (
          <IconButton
            icon="trash"
            label="Delete challenge"
            onClick={() => run(() => deleteChallenge(c), 'Challenge deleted.')}
            className="hover:bg-rose-500/15 hover:text-rose-400"
          />
        ) : null}
      </div>

      <ol className="mt-3 flex flex-col gap-2.5">
        {players.map((p, i) => (
          <li key={p.uid} className="flex items-center gap-3">
            <span className="tabular w-4 text-center text-sm font-bold text-[var(--color-fg-muted)]">
              {p.joined ? i + 1 : '–'}
            </span>
            <Avatar uid={p.uid} name={p.name || nameOf(p.uid)} size={32} ring={p.uid === uid} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                  {p.uid === leader?.uid && !tied ? <Icon name="crown" size={14} className="shrink-0 text-amber-400" /> : null}
                  {p.uid === uid ? 'You' : `@${nameOf(p.uid)}`}
                </span>
                <span className="tabular shrink-0 text-sm font-bold">
                  {p.joined ? fmtMetric(c.metric, p.score, unit) : 'Invited'}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${p.uid === uid ? 'bg-brand-500' : 'bg-sky-400'}`}
                  style={{ width: `${p.joined ? (p.score / top) * 100 : 0}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {invited && state !== 'finished' ? (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" full loading={busy} onClick={() => run(() => declineChallenge(c))}>
            Decline
          </Button>
          <Button
            variant="go"
            full
            icon="swords"
            loading={busy}
            onClick={() => run(() => joinChallenge(c, myScoreFor(c)), 'Challenge accepted. Game on.')}
          >
            Accept
          </Button>
        </div>
      ) : null}
    </article>
  )
}
