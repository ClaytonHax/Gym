import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  SectionHeader,
  Segmented,
  Skeleton,
  StreakBadge,
} from '../components/ui'
import {
  ActivityCard,
  AddFriendSheet,
  Avatar,
  ChallengeCard,
  displayOf,
  fmtMetric,
  NewChallengeSheet,
  NotificationBell,
  NudgeSheet,
  shareInvite,
} from '../components/social'
import { useMyPublicStats } from '../components/SocialSync'
import { openProfileSetup } from '../components/ProfileSetup'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useProfiles, useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useFeed } from '../hooks/useFeed'
import { dayKey, addDays } from '../lib/date'
import {
  challengeScore,
  challengeState,
  daysSince,
  lastTrainedLabel,
  liveStreak,
  friendAtRisk,
  METRICS,
  metricValue,
  type BoardMetric,
  type Challenge,
  type ChallengeMetric,
  type Period,
  type PublicProfile,
  type PublicStats,
} from '../lib/social'

type Tab = 'feed' | 'ranks' | 'challenges' | 'friends'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'feed', label: 'Feed' },
  { value: 'ranks', label: 'Ranks' },
  { value: 'challenges', label: 'Battles' },
  { value: 'friends', label: 'Friends' },
]

const BOARD_METRICS: BoardMetric[] = ['workouts', 'days', 'volume', 'sets', 'minutes', 'streak']

const MEDAL = ['text-amber-400', 'text-ink-300', 'text-orange-700']

interface Entry {
  uid: string
  profile: PublicProfile | undefined
  stats: PublicStats | undefined
  isMe: boolean
}

function Leaderboard({ entries, onNudge }: { entries: Entry[]; onNudge: (p: PublicProfile) => void }) {
  const { profile } = useSettings()
  const [metric, setMetric] = useState<BoardMetric>('workouts')
  const [period, setPeriod] = useState<Period>('week')

  const ranked = useMemo(
    () =>
      entries
        .map((e) => ({ ...e, value: metricValue(e.stats, metric, period) }))
        .sort((a, b) => b.value - a.value || Number(b.isMe) - Number(a.isMe)),
    [entries, metric, period]
  )
  const top = Math.max(1, ranked[0]?.value ?? 0)
  const myRank = ranked.findIndex((e) => e.isMe) + 1
  const ahead = myRank > 1 ? ranked[myRank - 2] : null
  const myValue = ranked[myRank - 1]?.value ?? 0

  return (
    <div className="flex flex-col gap-4">
      {metric !== 'streak' ? (
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'all', label: 'All time' },
          ]}
        />
      ) : null}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Rank by">
        {BOARD_METRICS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => setMetric(m)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors duration-200 ${
              metric === m
                ? 'border-brand-500 bg-brand-500 text-ink-950'
                : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {METRICS[m].short}
          </button>
        ))}
      </div>

      <section aria-label={`${METRICS[metric].label} leaderboard`} className="hero rounded-2xl p-5 text-ink-950">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">
          {METRICS[metric].label}
          {metric === 'streak' ? '' : period === 'week' ? ' · this week' : period === 'month' ? ' · this month' : ' · all time'}
        </p>
        <p className="mt-1 font-display text-5xl font-bold leading-none">
          {myRank > 0 ? `#${myRank}` : '–'}
          <span className="ml-2 text-xl">of {ranked.length}</span>
        </p>
        <p className="mt-2 text-sm font-semibold">
          {ranked.length < 2
            ? 'Add friends to start competing.'
            : myRank === 1
              ? ranked[1] && ranked[1].value === myValue
                ? 'Tied for the lead. Break it.'
                : 'You’re leading. Defend the crown.'
              : ahead
                ? `${fmtMetric(metric, ahead.value - myValue, profile.unit)} behind @${ahead.profile?.username ?? 'friend'}`
                : ''}
        </p>
      </section>

      <ol className="card flex flex-col p-2">
        {ranked.map((e, i) => {
          const { name, handle } = displayOf(e.profile)
          const idle = !e.isMe && period === 'week' && metric !== 'streak' && e.value === 0
          const row = (
            <>
              <span className="grid w-7 shrink-0 place-items-center">
                {i < 3 && e.value > 0 ? (
                  <Icon name="medal" size={22} className={MEDAL[i]} title={`Rank ${i + 1}`} />
                ) : (
                  <span className="tabular text-sm font-bold text-[var(--color-fg-muted)]">{i + 1}</span>
                )}
              </span>
              <Avatar uid={e.uid} name={e.isMe ? 'You' : name} size={40} ring={e.isMe} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{e.isMe ? 'You' : name}</span>
                  <span className="tabular shrink-0 font-display text-xl font-bold">
                    {fmtMetric(metric, e.value, profile.unit)}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-500 ${
                      e.isMe ? 'bg-brand-500' : i === 0 ? 'bg-amber-400' : 'bg-sky-400'
                    }`}
                    style={{ width: `${(e.value / top) * 100}%` }}
                  />
                </span>
                {!e.isMe ? (
                  <span className="mt-0.5 block truncate text-xs text-[var(--color-fg-muted)]">{handle}</span>
                ) : null}
              </span>
            </>
          )
          return (
            <li key={e.uid} className={`flex items-center gap-1 rounded-xl ${e.isMe ? 'bg-brand-500/10' : ''}`}>
              {e.isMe ? (
                <div className="flex min-h-16 flex-1 items-center gap-3 px-2 py-2">{row}</div>
              ) : (
                <Link
                  to={`/friends/${e.uid}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
                >
                  {row}
                </Link>
              )}
              {idle && e.profile ? (
                <IconButton icon="hand" label={`Nudge @${e.profile.username}`} onClick={() => onNudge(e.profile!)} className="text-brand-400" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FeedTab({ uids, profileOf }: { uids: string[]; profileOf: (uid: string) => PublicProfile | undefined }) {
  const { items, loading } = useFeed(uids)
  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon="dumbbell"
        title="Quiet in here"
        message="Workouts you and your friends finish in the last 30 days show up here. Go set the pace."
      />
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.slice(0, 40).map((item) => (
        <li key={`${item.uid}/${item.id}`}>
          <ActivityCard item={item} profile={profileOf(item.uid)} />
        </li>
      ))}
    </ul>
  )
}

function FriendsTab({ onAdd, onNudge }: { onAdd: () => void; onNudge: (p: PublicProfile) => void }) {
  const { friends, incoming, outgoing, acceptRequest, declineRequest } = useSocial()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  // Requests carry the usernames from when they were sent; show the current ones.
  const profileOf = useProfiles([...incoming.map((r) => r.from), ...outgoing.map((r) => r.to)])

  async function run(id: string, fn: () => Promise<void>, ok?: string) {
    setBusy(id)
    try {
      await fn()
      if (ok) toast(ok)
    } catch {
      toast('Something went wrong. Try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {incoming.length > 0 ? (
        <section>
          <SectionHeader title={`Requests (${incoming.length})`} />
          <ul className="flex flex-col gap-2">
            {incoming.map((r) => {
              const p = profileOf(r.from)
              const handle = p?.username || r.fromUsername
              const label = p?.displayName || p?.username || r.fromName || r.fromUsername
              return (
              <li key={r.id} className="card-accent flex flex-wrap items-center gap-3 p-3">
                <Avatar uid={r.from} name={label} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{label}</span>
                  <span className="block truncate text-sm text-[var(--color-fg-muted)]">@{handle}</span>
                </span>
                <span className="flex gap-2">
                  <IconButton
                    icon="x"
                    label={`Decline @${handle}`}
                    variant="secondary"
                    disabled={busy === r.id}
                    onClick={() => run(r.id, () => declineRequest(r))}
                  />
                  <Button
                    size="sm"
                    variant="go"
                    icon="check"
                    loading={busy === r.id}
                    onClick={() => run(r.id, () => acceptRequest(r), `You and @${handle} are now friends.`)}
                  >
                    Accept
                  </Button>
                </span>
              </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeader
          title={`Friends (${friends.length})`}
          action={
            <Button size="sm" variant="secondary" icon="user-plus" onClick={onAdd}>
              Add
            </Button>
          }
        />
        {friends.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-fg-muted)]">
              No friends yet. Search by username or share your invite link.
            </p>
          </Card>
        ) : (
          <ul className="card flex flex-col p-2">
            {friends.map((f) => {
              const { name, handle } = displayOf(f.profile)
              const idle = (daysSince(f.stats?.lastWorkoutAt) ?? 99) >= 2
              const streak = liveStreak(f.stats)
              const risk = friendAtRisk(f.stats)
              return (
                <li key={f.uid} className="flex items-center gap-1">
                  <Link
                    to={`/friends/${f.uid}`}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
                  >
                    <Avatar uid={f.uid} name={name} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{name}</span>
                      <span className="block truncate text-xs text-[var(--color-fg-muted)]">
                        {handle} · {lastTrainedLabel(f.stats?.lastWorkoutAt)}
                      </span>
                      {risk ? (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-brand-400">
                          <Icon name="flame" size={12} /> Streak ends tonight
                        </span>
                      ) : null}
                    </span>
                    {streak > 0 ? (
                      <StreakBadge count={streak} unit={f.stats?.streak.unit ?? 'day'} size="sm" />
                    ) : null}
                  </Link>
                  {f.profile ? (
                    <IconButton
                      icon="hand"
                      label={`Nudge @${f.profile.username}`}
                      onClick={() => onNudge(f.profile!)}
                      className={idle || risk ? 'text-brand-400' : ''}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section>
          <SectionHeader title="Sent requests" />
          <ul className="card flex flex-col p-2">
            {outgoing.map((r) => {
              const p = profileOf(r.to)
              return (
              <li key={r.id} className="flex min-h-14 items-center gap-3 px-2 py-1.5">
                <Avatar uid={r.to} name={p?.displayName || p?.username || r.toName || r.toUsername} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">@{p?.username || r.toUsername}</span>
                  <span className="block text-xs text-[var(--color-fg-muted)]">Waiting for them to accept</span>
                </span>
                <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => run(r.id, () => declineRequest(r))}>
                  Cancel
                </Button>
              </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function ChallengesTab({
  onNew,
  myScoreFor,
}: {
  onNew: () => void
  myScoreFor: (c: Challenge) => number
}) {
  const { user } = useAuth()
  const { challenges } = useSocial()
  const uid = user?.uid ?? ''
  const visible = challenges.filter((c) => !c.declined.includes(uid))
  const invites = visible.filter((c) => !c.accepted.includes(uid) && challengeState(c) !== 'finished')
  const active = visible.filter((c) => c.accepted.includes(uid) && challengeState(c) !== 'finished')
  const cutoff = dayKey(addDays(new Date(), -30))
  const finished = visible.filter((c) => challengeState(c) === 'finished' && c.endDay >= cutoff)

  return (
    <div className="flex flex-col gap-6">
      <Button size="lg" full icon="swords" onClick={onNew}>
        New challenge
      </Button>
      {invites.length > 0 ? (
        <section>
          <SectionHeader title={`Invites (${invites.length})`} />
          <ul className="flex flex-col gap-3">
            {invites.map((c) => (
              <li key={c.id}>
                <ChallengeCard c={c} myScoreFor={myScoreFor} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <SectionHeader title="Active" />
        {active.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-fg-muted)]">
              No live battles. Challenge a friend to most workouts this week, or most volume in 30
              days. Scores update on their own as you train.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((c) => (
              <li key={c.id}>
                <ChallengeCard c={c} myScoreFor={myScoreFor} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {finished.length > 0 ? (
        <section>
          <SectionHeader title="Recent results" />
          <ul className="flex flex-col gap-3">
            {finished.map((c) => (
              <li key={c.id}>
                <ChallengeCard c={c} myScoreFor={myScoreFor} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export function Friends() {
  const { user } = useAuth()
  const { me, friends, friendsLoading, incoming, challenges } = useSocial()
  const toast = useToast()
  const { stats: myStats, workouts } = useMyPublicStats()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'feed') as Tab
  const [adding, setAdding] = useState(false)
  const [nudging, setNudging] = useState<PublicProfile | null>(null)
  const [newChallenge, setNewChallenge] = useState(false)
  const uid = user?.uid ?? ''

  const setTab = (t: Tab) => setParams(t === 'feed' ? {} : { tab: t }, { replace: true })

  const entries = useMemo<Entry[]>(
    () => [
      { uid, profile: me ?? undefined, stats: myStats, isMe: true },
      ...friends.map((f) => ({ uid: f.uid, profile: f.profile, stats: f.stats, isMe: false })),
    ],
    [uid, me, myStats, friends]
  )

  const { profileOf } = useSocial()

  const myScoreFor = useCallback(
    (c: Challenge) => challengeScore(workouts, c.metric, c.startDay, c.endDay),
    [workouts]
  )
  const myScoreForNew = useCallback(
    (metric: ChallengeMetric, days: number) => {
      const start = dayKey()
      return challengeScore(workouts, metric, start, dayKey(addDays(new Date(), days - 1)))
    },
    [workouts]
  )

  const pendingInvites = challenges.filter(
    (c) => !c.accepted.includes(uid) && !c.declined.includes(uid) && challengeState(c) !== 'finished'
  ).length
  const badge: Partial<Record<Tab, number>> = { friends: incoming.length, challenges: pendingInvites }

  return (
    <div className="animate-rise flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold tracking-wide">Friends</h1>
          {me ? (
            <button
              type="button"
              onClick={() => shareInvite(me, toast)}
              className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-[var(--color-fg-muted)] hover:text-brand-400"
            >
              @{me.username}
              <Icon name="share" size={14} />
              <span className="sr-only">Share invite link</span>
            </button>
          ) : (
            <Skeleton className="mt-1 h-5 w-32" />
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <NotificationBell />
          <button
            type="button"
            aria-label="Add friends"
            onClick={() => setAdding(true)}
            className="grid size-11 place-items-center rounded-xl bg-brand-500 text-ink-950 shadow-lg shadow-brand-500/25 transition-colors duration-200 hover:bg-brand-400"
          >
            <Icon name="user-plus" size={20} />
          </button>
        </div>
      </header>

      {me?.freeChange ? (
        <button
          type="button"
          onClick={openProfileSetup}
          className="card flex min-h-14 w-full items-center gap-3 p-3.5 text-left transition-colors duration-200 hover:border-brand-500/60"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Icon name="at" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">You’re @{me.username}</span>
            <span className="block text-xs text-[var(--color-fg-muted)]">
              Choose your username — change it freely until you save, then once a month.
            </span>
          </span>
          <Icon name="chevron-right" size={18} className="text-[var(--color-fg-muted)]" />
        </button>
      ) : null}

      <div role="tablist" aria-label="Friends sections" className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
        {TABS.map((t) => {
          const selected = t.value === tab
          const count = badge[t.value] ?? 0
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(t.value)}
              className={`relative min-h-10 rounded-lg px-1 text-sm font-semibold transition-colors duration-200 ${
                selected ? 'bg-brand-500 text-ink-950 shadow-md shadow-brand-500/25' : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
              }`}
            >
              {t.label}
              {count > 0 ? (
                <span className="absolute -right-0.5 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                  {count}
                  <span className="sr-only"> pending</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {friendsLoading ? (
        <Skeleton className="h-64" />
      ) : friends.length === 0 && tab !== 'friends' ? (
        <EmptyState
          icon="users"
          title="Train together"
          message="Add friends to race them on the leaderboard, send nudges when they slack, react to their sessions and start head-to-head battles."
          action={
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button full icon="user-plus" onClick={() => setAdding(true)}>
                Find friends
              </Button>
              {me ? (
                <Button full variant="secondary" icon="share" onClick={() => shareInvite(me, toast)}>
                  Share invite link
                </Button>
              ) : null}
            </div>
          }
        />
      ) : tab === 'feed' ? (
        <FeedTab uids={[uid, ...friends.map((f) => f.uid)]} profileOf={profileOf} />
      ) : tab === 'ranks' ? (
        <Leaderboard entries={entries} onNudge={setNudging} />
      ) : tab === 'challenges' ? (
        <ChallengesTab onNew={() => setNewChallenge(true)} myScoreFor={myScoreFor} />
      ) : (
        <FriendsTab onAdd={() => setAdding(true)} onNudge={setNudging} />
      )}

      <AddFriendSheet open={adding} onClose={() => setAdding(false)} />
      <NudgeSheet friend={nudging} onClose={() => setNudging(null)} />
      <NewChallengeSheet open={newChallenge} onClose={() => setNewChallenge(false)} myScoreFor={myScoreForNew} />
    </div>
  )
}
