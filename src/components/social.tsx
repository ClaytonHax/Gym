import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { Badge, Button, ConfirmSheet, Field, IconButton, Segmented, Sheet, Spinner } from './ui'
import { ProofSheet, ProofWall } from './proofs'
import { useUpdateAvailable } from './UpdatePrompt'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles, useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useChallengeProofs, useVerifiedIds } from '../hooks/useChallengeProofs'
import { useUnit } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { usePlans } from '../hooks/usePlans'
import { dayKey, fmtDuration } from '../lib/date'
import { fmtDistance, fmtVolume } from '../lib/units'
import {
  avatarColor,
  daysLeft,
  challengeState,
  hasLeft,
  initials,
  lastTrainedLabel,
  METRIC_HELP,
  METRICS,
  normalizeUsername,
  nudgePresetsFor,
  rankLabel,
  rankWithTies,
  REACTIONS,
  sameChallengePeople,
  timeAgo,
  whoLabel,
  withTimeout,
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

/** "Jake QA · @jake" — name first, handle second. */
export function nameAndHandle(p: PublicProfile | undefined): string {
  return p?.displayName ? `${p.displayName} · @${p.username}` : whoLabel(p)
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
  // A waiting app update sits in the inbox too, so it counts here.
  const unread = useSocial().unread + (useUpdateAvailable() ? 1 : 0)
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex h-14 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border
        border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-[var(--color-fg-muted)] transition-colors
        duration-200 hover:border-brand-500/60 hover:text-brand-400"
    >
      <Icon name="bell" size={20} />
      <span className="text-xs font-medium leading-none">Alerts</span>
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
  const { nudge, friends } = useSocial()
  const toast = useToast()
  const navigate = useNavigate()
  // You earn a nudge by training today; a planned rest day counts as doing your part.
  const { workouts } = useWorkouts()
  const { isRestDay } = usePlans()
  const today = dayKey()
  const earned =
    Boolean(isRestDay?.(today)) || workouts.some((w) => dayKey(new Date(w.startedAt)) === today)
  // Suggest messages that fit how this friend trains (a walker isn't asked to lift).
  const presets = useMemo(
    () => nudgePresetsFor(friends.find((f) => f.uid === friend?.uid)?.stats),
    [friends, friend?.uid]
  )
  const [choice, setChoice] = useState(presets[0])
  const [custom, setCustom] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (friend) {
      setChoice(presets[0])
      setCustom('')
    }
    // Reset only when a different friend is picked, not when their stats refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend?.uid])

  async function send() {
    if (!friend) return
    setSending(true)
    try {
      const text = custom.trim() || choice
      const result = await nudge(friend.uid, text)
      toast(
        result === 'sent' ? `Nudge sent to ${whoLabel(friend)}.` : `You already nudged ${whoLabel(friend)} today.`,
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
      title={friend ? `Nudge ${whoLabel(friend)}` : 'Nudge'}
      footer={
        earned ? (
          <Button full size="lg" icon="hand" loading={sending} onClick={send}>
            Send nudge
          </Button>
        ) : (
          <Button
            full
            size="lg"
            icon="dumbbell"
            onClick={() => {
              onClose()
              navigate('/')
            }}
          >
            Go train
          </Button>
        )
      }
    >
      {earned ? renderPicker() : (
        <p className="text-[15px] text-[var(--color-fg-muted)]">
          Practice what you preach. Log a workout today and you can nudge {friend ? whoLabel(friend) : 'them'}.
          On a rest day in your plan, you can nudge anytime.
        </p>
      )}
    </Sheet>
  )

  function renderPicker() {
    return (
      <>
      <p className="mb-3 text-sm text-[var(--color-fg-muted)]">
        One nudge per friend per day — make it count.
      </p>
      <fieldset>
        <legend className="sr-only">Pick a message</legend>
        <div className="flex flex-col gap-2">
          {presets.map((text) => {
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
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!sending) void send()
        }}
      >
        <Field
          label="Or write your own"
          enterKeyHint="send"
          value={custom}
          maxLength={140}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Write a short message…"
          hint={`${custom.length}/140`}
        />
      </form>
      </>
    )
  }
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
  const { react } = useSocial()
  const toast = useToast()
  const unit = useUnit()
  const mine = item.uid === user?.uid
  const myReaction = user ? item.reactions[user.uid] : undefined
  const { name, handle } = displayOf(profile)
  const [pending, setPending] = useState<Reaction | null>(null)
  const verified = useVerifiedIds().has(item.id)
  // Sessions with no weight lifted (walks, rides) show minutes instead of "0 kg".
  const cardio = item.cardio ?? item.volumeKg <= 0

  const counts = useMemo(() => {
    const c: Record<Reaction, number> = { fire: 0, strong: 0, beast: 0 }
    for (const r of Object.values(item.reactions)) if (r in c) c[r]++
    return c
  }, [item.reactions])

  const reactorIds = useMemo(() => (mine ? Object.keys(item.reactions) : []), [mine, item.reactions])
  const profileOf = useProfiles(reactorIds)
  const reactors = reactorIds.map((id) => whoLabel(profileOf(id)) )

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
        {verified ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-go-500/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-go-400">
            <Icon name="camera" size={12} />
            Verified
          </span>
        ) : null}
      </div>

      <dl className="tabular mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--color-surface-2)] p-2.5 text-center">
        {(cardio
          ? [
              { label: 'Minutes', value: String(Math.max(1, Math.round(item.durationSec / 60))) },
              { label: 'Sets', value: String(item.sets) },
              item.distanceKm
                ? { label: 'Distance', value: fmtDistance(item.distanceKm, unit) }
                : { label: 'Exercises', value: String(item.exerciseCount) },
            ]
          : [
              { label: 'Time', value: fmtDuration(item.durationSec).replace(/ \d+s$/, '') },
              { label: 'Sets', value: String(item.sets) },
              { label: 'Volume', value: fmtVolume(item.volumeKg, unit) },
            ]
        ).map((s) => (
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
              ? `${reactors.slice(0, 2).join(', ')}${reactors.length > 2 ? ` +${reactors.length - 2}` : ''} reacted`
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

/** Keyed by uid, so the link keeps working after a rename. */
export function inviteUrl(uid: string): string {
  return `${window.location.origin}/add/${uid}`
}

export async function shareInvite(who: Pick<PublicProfile, 'uid' | 'username'>, toast: ReturnType<typeof useToast>) {
  const url = inviteUrl(who.uid)
  const text = `Add me on Gym Tracker — I'm @${who.username}. Let's compete.`
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
            toast(`You and ${whoLabel(target)} are now friends.`)
          } else {
            const result = await sendRequest(target)
            toast(result === 'accepted' ? `You and ${whoLabel(target)} are now friends.` : `Request sent to ${whoLabel(target)}.`)
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

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; term: string; results: PublicProfile[] }

const SEARCH_TIMEOUT_MS = 8000

export function AddFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, searchUsers } = useSocial()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [state, setState] = useState<SearchState>({ status: 'idle' })
  const [tooShort, setTooShort] = useState(false)
  // Only the latest request may update the screen.
  const latest = useRef(0)

  const term = normalizeUsername(q)

  const run = useCallback(
    (raw: string) => {
      const t = normalizeUsername(raw)
      if (t.length < 2) {
        latest.current++
        setState({ status: 'idle' })
        return
      }
      const id = ++latest.current
      setState({ status: 'loading' })
      withTimeout(searchUsers(t), SEARCH_TIMEOUT_MS)
        .then((results) => {
          if (id === latest.current) setState({ status: 'done', term: t, results })
        })
        .catch(() => {
          if (id === latest.current) setState({ status: 'error' })
        })
    },
    [searchUsers]
  )

  useEffect(() => {
    if (!open) {
      latest.current++
      setQ('')
      setTooShort(false)
      setState({ status: 'idle' })
    }
  }, [open])

  // Live search while typing, after a short pause.
  useEffect(() => {
    if (!open) return
    setTooShort(false)
    if (term.length < 2) {
      latest.current++
      setState({ status: 'idle' })
      return
    }
    const t = window.setTimeout(() => run(q), 400)
    return () => window.clearTimeout(t)
  }, [q, term.length, open, run])

  function submit() {
    if (term.length < 2) {
      setTooShort(true)
      return
    }
    run(q)
  }

  const searching = state.status === 'loading'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add friends"
      size="full"
      pinned={
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="min-w-0 flex-1">
            <Field
              label="Search by username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="jake or @jake"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
              enterKeyHint="search"
              error={tooShort ? 'Type at least 2 letters of their username.' : undefined}
            />
          </div>
          <Button type="submit" icon="search" loading={searching} className="shrink-0">
            Search
          </Button>
        </form>
      }
    >
      <div aria-live="polite">
        {state.status === 'loading' ? (
          <p className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-[var(--color-fg-muted)]">
            <Spinner size={16} /> Searching…
          </p>
        ) : null}

        {state.status === 'error' ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-rose-500/10 p-4 text-center">
            <p className="text-sm text-rose-300">Couldn’t search. Check your connection and try again.</p>
            <Button variant="secondary" icon="rotate" onClick={() => run(q)}>
              Retry
            </Button>
          </div>
        ) : null}

        {state.status === 'done' && state.results.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {state.results.map((p) => (
              <li key={p.uid} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5">
                <Avatar uid={p.uid} name={p.displayName || p.username} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.displayName || p.username}</span>
                  <span className="block truncate text-sm text-[var(--color-fg-muted)]">@{p.username}</span>
                </span>
                <FriendActionButton target={p} />
              </li>
            ))}
          </ul>
        ) : null}

        {state.status === 'done' && state.results.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--color-fg-muted)]">
            No one found with @{state.term}. Check the spelling, or send them your invite link below.
          </p>
        ) : null}
      </div>

      {me ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">Your username</p>
          <p className="font-display text-2xl font-bold">@{me.username}</p>
          <Button variant="secondary" full icon="share" className="mt-3" onClick={() => shareInvite(me, toast)}>
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
  const { friends, createChallenge, challenges } = useSocial()
  const { user } = useAuth()
  const toast = useToast()
  const [picked, setPicked] = useState<string[]>([])
  const [metric, setMetric] = useState<ChallengeMetric>('workouts')
  const [days, setDays] = useState<(typeof DURATIONS)[number]['value']>('7')
  const [verify, setVerify] = useState<'none' | 'photo'>('none')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Every time it opens: fresh form, sensible defaults.
    if (open) {
      setPicked(preselect ? [preselect] : [])
      setMetric('workouts')
      setDays('7')
      setVerify('none')
    }
  }, [open, preselect])

  // A battle with exactly these people may already be running.
  const running = useMemo(() => {
    if (picked.length === 0 || !user) return undefined
    const people = [user.uid, ...picked]
    return challenges.find((c) => challengeState(c) !== 'finished' && sameChallengePeople(c, people))
  }, [challenges, picked, user])

  const title = `Most ${METRICS[metric].label.toLowerCase()}`

  async function create() {
    if (picked.length === 0) return
    setSaving(true)
    try {
      const n = Number(days)
      await createChallenge({ title, metric, days: n, members: picked, myScore: verify === 'photo' ? 0 : myScoreFor(metric, n), verify })
      toast(`Challenge sent to ${picked.length} friend${picked.length === 1 ? '' : 's'}.`)
      setPicked([])
      setMetric('workouts')
      setDays('7')
      setVerify('none')
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
            What counts
          </p>
          <div role="radiogroup" aria-label="What counts" className="flex flex-col gap-2">
            {CHALLENGE_METRICS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metric === m}
                onClick={() => setMetric(m)}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors duration-200 ${
                  metric === m
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-[var(--color-line)] hover:bg-[var(--color-surface-2)]'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{METRICS[m].label}</span>
                  <span className="block text-sm text-[var(--color-fg-muted)]">{METRIC_HELP[m]}</span>
                </span>
                {metric === m ? <Icon name="check" size={18} className="shrink-0 text-brand-400" /> : null}
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
            Verification
          </p>
          <Segmented
            label="Verification"
            value={verify}
            onChange={setVerify}
            options={[
              { value: 'none', label: 'Honor system' },
              { value: 'photo', label: 'Photo proof' },
            ]}
          />
          <p className="mt-1.5 text-xs text-[var(--color-fg-muted)]">
            {verify === 'photo'
              ? 'Every workout needs a photo to count. Everyone in the battle can see them.'
              : 'Scores come straight from your logged workouts.'}
          </p>
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
          {running ? (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-400">
              <Icon name="swords" size={16} className="mt-0.5 shrink-0" />
              You already have a battle running with {picked.length === 1 ? 'this friend' : 'these friends'}: “{running.title}”. You can still start another.
            </p>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}

/** "2 workouts", "1 day", "35m" — a score gap in words. */
function gapText(metric: ChallengeMetric, n: number, unit: Unit): string {
  if (metric === 'workouts') return `${n} workout${n === 1 ? '' : 's'}`
  if (metric === 'days') return `${n} day${n === 1 ? '' : 's'}`
  if (metric === 'sets') return `${n} set${n === 1 ? '' : 's'}`
  return fmtMetric(metric, n, unit)
}

export function ChallengeCard({
  c,
  myScoreFor,
  myLastAt,
}: {
  c: Challenge
  myScoreFor: (c: Challenge) => number
  /** ISO of your latest workout, for the "last trained" line. */
  myLastAt?: string | null
}) {
  const { user } = useAuth()
  const { me, friends, joinChallenge, declineChallenge, leaveChallenge, deleteChallenge } = useSocial()
  const profileOf = useProfiles(c.members)
  const toast = useToast()
  const unit = useUnit()
  const [busy, setBusy] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [wallOpen, setWallOpen] = useState(false)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const uid = user?.uid ?? ''
  const state = challengeState(c)
  const invited = !c.accepted.includes(uid) && !c.declined.includes(uid)
  const photo = c.verify === 'photo'
  const left = hasLeft(c, uid)
  const joined = c.accepted.includes(uid) && !left
  // Only joined players stream the (large) proofs, and they're shared with the wall and sheet.
  const { proofs } = useChallengeProofs(c.id, photo && joined)
  const verifiedBy = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of proofs) n.set(p.uid, (n.get(p.uid) ?? 0) + 1)
    return n
  }, [proofs])

  // Name first; the handle rides along as secondary text.
  const nameOf = (id: string) => (id === uid ? 'You' : profileOf(id) ? whoLabel(profileOf(id)) : 'Player')
  const handleOf = (id: string) => {
    const p = profileOf(id)
    return id !== uid && p?.displayName ? `@${p.username}` : ''
  }
  const lastAtOf = (id: string): string | null | undefined =>
    id === uid ? myLastAt : friends.find((f) => f.uid === id)?.stats?.lastWorkoutAt

  const players = c.members
    // Declined invites vanish; people who joined and then left stay, marked "Left".
    .filter((m) => !c.declined.includes(m) || c.accepted.includes(m))
    .map((m) => ({
      uid: m,
      joined: c.accepted.includes(m) && !c.declined.includes(m),
      left: hasLeft(c, m),
      score: c.scores[m] ?? 0,
      name: m === uid ? (me?.displayName || 'You') : (profileOf(m)?.displayName ?? ''),
    }))
    .sort(
      (a, b) =>
        Number(a.left) - Number(b.left) || Number(b.joined) - Number(a.joined) || b.score - a.score
    )
  const ranking = players.filter((p) => p.joined)
  const ranks = rankWithTies(ranking.map((p) => p.score))
  const top = Math.max(1, ...ranking.map((p) => p.score))
  const topScore = ranking[0]?.score ?? 0
  const leaders = ranking.filter((p) => p.score === topScore && topScore > 0)
  const tied = leaders.length > 1
  const leader = leaders[0]

  const days = daysLeft(c)
  const status =
    state === 'finished'
      ? leader
        ? tied
          ? 'Finished · tied for first'
          : `Finished · ${leader.uid === uid ? 'You won' : `${nameOf(leader.uid)} won`}`
        : 'Finished'
      : state === 'upcoming'
        ? 'Starts soon'
        : days === 1
          ? 'Last day'
          : `${days} days left`

  // One plain sentence on where you stand.
  const myIdx = ranking.findIndex((p) => p.uid === uid)
  let standing = ''
  if (joined && myIdx >= 0 && ranking.length >= 2 && state !== 'upcoming') {
    const mine = ranking[myIdx]
    if (topScore === 0) standing = 'No one has scored yet. Be first.'
    else if (ranks[myIdx].rank === 1 && tied) standing = 'Tied for first'
    else if (ranks[myIdx].rank === 1) {
      const second = ranking.find((p) => p.score < mine.score)
      standing = second ? `You lead by ${gapText(c.metric, mine.score - second.score, unit)}` : 'You lead'
    } else if (leader) {
      standing = `${gapText(c.metric, leader.score - mine.score, unit)} behind ${nameOf(leader.uid)}`
    }
  }

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
            className={`text-xs font-bold uppercase tracking-[0.14em] ${
              state === 'finished' ? 'text-[var(--color-fg-muted)]' : 'text-brand-400'
            }`}
          >
            {status}
          </p>
          <h3 className="mt-0.5 font-display text-2xl font-bold leading-tight">{c.title}</h3>
          {photo ? (
            <Badge className="mt-1 gap-1 bg-go-500/15 text-go-400">
              <Icon name="camera" size={12} />
              Photo proof
            </Badge>
          ) : null}
          <p className="text-xs text-[var(--color-fg-muted)]">
            {new Date(`${c.startDay}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} –{' '}
            {new Date(`${c.endDay}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {c.creator !== uid ? ` · from ${nameOf(c.creator)}` : ''}
          </p>
        </div>
        {c.creator === uid ? (
          <IconButton
            icon="trash"
            label="Delete challenge"
            onClick={() => setConfirm('delete')}
            className="hover:bg-rose-500/15 hover:text-rose-400"
          />
        ) : null}
      </div>

      {standing ? (
        <p className="mt-2 rounded-lg bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-400">{standing}</p>
      ) : null}

      <ol className="mt-3 flex flex-col gap-2.5">
        {players.map((p) => {
          const idx = ranking.findIndex((r) => r.uid === p.uid)
          const last = p.joined || p.left ? lastAtOf(p.uid) : undefined
          return (
            <li key={p.uid} className="flex items-center gap-3">
              <span className="tabular w-6 text-center text-sm font-bold text-[var(--color-fg-muted)]">
                {idx >= 0 ? rankLabel(ranks[idx]) : '–'}
              </span>
              <Avatar uid={p.uid} name={p.name || nameOf(p.uid)} size={32} ring={p.uid === uid} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                    {idx >= 0 && p.uid === leader?.uid && !tied ? <Icon name="crown" size={14} className="shrink-0 text-amber-400" /> : null}
                    <span className="truncate">{nameOf(p.uid)}</span>
                    {photo && p.joined && joined ? (
                      <span className="tabular shrink-0 text-xs font-normal text-[var(--color-fg-muted)]">
                        · {verifiedBy.get(p.uid) ?? 0} verified
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular shrink-0 text-sm font-bold">
                    {p.left ? 'Left' : p.joined ? fmtMetric(c.metric, p.score, unit) : 'Invited'}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${p.uid === uid ? 'bg-brand-500' : 'bg-sky-400'}`}
                    style={{ width: `${p.joined ? (p.score / top) * 100 : 0}%` }}
                  />
                </div>
                {handleOf(p.uid) || (last !== undefined && !p.left) ? (
                  <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">
                    {[handleOf(p.uid), last !== undefined && !p.left ? lastTrainedLabel(last) : ''].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {photo && joined ? (
        <div className="mt-4 flex gap-2">
          {state === 'active' ? (
            <Button variant="go" full icon="camera" onClick={() => setProofOpen(true)}>
              Add proof
            </Button>
          ) : null}
          <Button variant="secondary" full icon="image" onClick={() => setWallOpen(true)}>
            Proof wall
          </Button>
        </div>
      ) : null}

      {photo && joined ? (
        <>
          <ProofSheet c={c} open={proofOpen} onClose={() => setProofOpen(false)} fmt={(v) => fmtMetric(c.metric, v, unit)} />
          <ProofWall
            c={c}
            open={wallOpen}
            onClose={() => setWallOpen(false)}
            nameOf={nameOf}
            fmt={(v) => fmtMetric(c.metric, v, unit)}
            metricLabel={METRICS[c.metric].label}
          />
        </>
      ) : null}

      {invited && state !== 'finished' ? (
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
          <Button variant="ghost" className="border border-[var(--color-line)]" loading={busy} onClick={() => run(() => declineChallenge(c))}>
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

      {joined && c.creator !== uid && state !== 'finished' ? (
        <Button variant="ghost" size="sm" className="mt-3 text-rose-400 hover:text-rose-400" onClick={() => setConfirm('leave')}>
          Leave challenge
        </Button>
      ) : null}

      <ConfirmSheet
        open={confirm === 'leave'}
        title="Leave this challenge?"
        message="You’ll drop out of the ranking and your score stops counting. The others carry on without you. You can’t rejoin."
        confirmLabel="Leave challenge"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          void run(() => leaveChallenge(c), 'You left the challenge.')
        }}
      />
      <ConfirmSheet
        open={confirm === 'delete'}
        title="Delete this challenge?"
        message="It disappears for everyone in it, including the scores. This can’t be undone."
        confirmLabel="Delete challenge"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          void run(() => deleteChallenge(c), 'Challenge deleted.')
        }}
      />
    </article>
  )
}
