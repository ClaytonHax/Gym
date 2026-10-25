import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Icon } from '../components/Icon'
import { ActivityHeatmap } from '../components/ActivityHeatmap'
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  SectionHeader,
  Segmented,
  Skeleton,
  StreakBadge,
} from '../components/ui'
import {
  ActivityCard,
  Avatar,
  displayOf,
  FriendActionButton,
  fmtMetric,
  NewChallengeSheet,
  NudgeSheet,
} from '../components/social'
import { useMyPublicStats } from '../components/SocialSync'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useProfile, useSocial } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { useFeed } from '../hooks/useFeed'
import { useAuthorPlans } from '../hooks/usePublicPlans'
import { PublicPlanList } from '../components/plans'
import { addDays, dayKey } from '../lib/date'
import { fmtWeight } from '../lib/units'
import {
  challengeScore,
  challengeState,
  whoLabel,
  lastTrainedLabel,
  liveStreak,
  METRICS,
  metricValue,
  toIso,
  type BoardMetric,
  type ChallengeMetric,
  type Period,
  type PublicProfile,
  type PublicStats,
} from '../lib/social'
import type { Workout } from '../types'

const VERSUS: BoardMetric[] = ['workouts', 'days', 'volume', 'sets', 'minutes']

/** Heatmap input from the sparse day totals friends share. */
function pseudoWorkouts(stats: PublicStats | undefined): Workout[] {
  if (!stats) return []
  return Object.entries(stats.days).map(([day, t]) => ({
    id: day,
    name: `${t[0]} workout${t[0] === 1 ? '' : 's'}`,
    startedAt: new Date(`${day}T12:00:00`).toISOString(),
    durationSec: t[3] * 60,
    exercises: [],
    totalVolumeKg: t[2],
    setCount: t[1],
  }))
}

function HeadToHead({ mine, theirs, theirName }: { mine: PublicStats; theirs: PublicStats | undefined; theirName: string }) {
  const { profile } = useSettings()
  const [period, setPeriod] = useState<Period>('week')
  let myWins = 0
  let theirWins = 0
  const rows = VERSUS.map((m) => {
    const a = metricValue(mine, m, period)
    const b = metricValue(theirs, m, period)
    if (a > b) myWins++
    else if (b > a) theirWins++
    return { m, a, b }
  })

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Head to head</h2>
        <p className="tabular font-display text-2xl font-bold">
          <span className={myWins >= theirWins ? 'text-brand-400' : ''}>{myWins}</span>
          <span className="mx-1 text-[var(--color-fg-muted)]">–</span>
          <span className={theirWins > myWins ? 'text-sky-400' : ''}>{theirWins}</span>
        </p>
      </div>
      <Segmented
        size="sm"
        label="Compare period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'all', label: 'All time' },
        ]}
      />
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
        <span>You</span>
        <span />
        <span className="truncate text-right">{theirName}</span>
      </div>
      <ul className="mt-1 flex flex-col gap-3">
        {rows.map(({ m, a, b }) => {
          const max = Math.max(1, a, b)
          return (
            <li key={m}>
              <p className="mb-1 text-center text-xs font-semibold text-[var(--color-fg-muted)]">{METRICS[m].label}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex items-center justify-end gap-2">
                  <span className={`tabular text-sm font-bold ${a > b ? 'text-brand-400' : ''}`}>
                    {fmtMetric(m, a, profile.unit)}
                  </span>
                  <span className="flex h-2 w-full max-w-24 justify-end overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(a / max) * 100}%` }} />
                  </span>
                </div>
                <span className="grid size-5 place-items-center">
                  {a !== b ? (
                    <Icon
                      name="crown"
                      size={14}
                      className={a > b ? 'text-brand-400' : 'text-sky-400'}
                      title={a > b ? 'You lead' : `${theirName} leads`}
                    />
                  ) : (
                    <span className="text-xs text-[var(--color-fg-muted)]">=</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-full max-w-24 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <span className="block h-full rounded-full bg-sky-400" style={{ width: `${(b / max) * 100}%` }} />
                  </span>
                  <span className={`tabular text-sm font-bold ${b > a ? 'text-sky-400' : ''}`}>
                    {fmtMetric(m, b, profile.unit)}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function FriendProfile() {
  const { uid: friendUid = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile: settings } = useSettings()
  const { friends, isFriend, unfriend, challenges } = useSocial()
  const toast = useToast()
  const { stats: myStats, workouts } = useMyPublicStats()
  const friend = friends.find((f) => f.uid === friendUid)
  const liveProfile = useProfile(friendUid)
  const [stranger, setStranger] = useState<PublicProfile | null | undefined>(undefined)
  const [nudging, setNudging] = useState<PublicProfile | null>(null)
  const [challenging, setChallenging] = useState(false)
  const [confirmUnfriend, setConfirmUnfriend] = useState(false)
  const friendNow = isFriend(friendUid)
  const authored = useAuthorPlans(friendUid)
  const { items, loading: feedLoading } = useFeed(friendNow ? [friendUid] : [], 10)

  useEffect(() => {
    if (friendUid === user?.uid) navigate('/friends', { replace: true })
  }, [friendUid, user?.uid, navigate])

  // Non-friends (from an invite link or search) only get the public profile.
  useEffect(() => {
    if (friendNow || !friendUid) return
    let cancelled = false
    getDoc(doc(db, 'profiles', friendUid))
      .then((snap) => {
        if (cancelled) return
        const d = snap.data()
        setStranger(
          d
            ? {
                uid: friendUid,
                username: String(d.username),
                displayName: String(d.displayName ?? ''),
                joinedAt: d.joinedAt ? toIso(d.joinedAt) : undefined,
                freeChange: Boolean(d.freeChange),
              }
            : null
        )
      })
      .catch(() => !cancelled && setStranger(null))
    return () => {
      cancelled = true
    }
  }, [friendNow, friendUid])

  const profile = friend?.profile ?? liveProfile ?? stranger ?? undefined
  const stats = friend?.stats
  const heat = useMemo(() => pseudoWorkouts(stats), [stats])
  const { name, handle } = displayOf(profile)
  const streak = liveStreak(stats)

  const myScoreForNew = (metric: ChallengeMetric, days: number) =>
    challengeScore(workouts, metric, dayKey(), dayKey(addDays(new Date(), days - 1)))

  const back = (
    <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => navigate(-1)} className="-ml-2">
      Back
    </Button>
  )

  // Running battles you share: removing them takes you out of those.
  const sharedBattles = challenges.filter(
    (c) => c.members.includes(friendUid) && !c.declined.includes(user?.uid ?? '') && challengeState(c) !== 'finished'
  )

  if (!friendNow && stranger === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <EmptyState icon="users" title="User not found" message="That profile doesn’t exist, or the link is out of date." />
      </div>
    )
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <div>{back}</div>

      <header className="flex flex-col items-center text-center">
        <Avatar uid={profile.uid} name={name} size={88} />
        <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-wide">{name}</h1>
        <p className="mt-1 text-sm font-semibold text-[var(--color-fg-muted)]">{handle}</p>
        {friendNow ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <StreakBadge count={streak} unit={stats?.streak.unit ?? 'day'} active={streak > 0} size="sm" />
            <span className="text-sm text-[var(--color-fg-muted)]">{lastTrainedLabel(stats?.lastWorkoutAt)}</span>
          </div>
        ) : (
          <div className="mt-4">
            <FriendActionButton target={profile} />
          </div>
        )}
      </header>

      {friendNow ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" icon="hand" onClick={() => setNudging(profile)}>
              Nudge
            </Button>
            <Button size="lg" variant="secondary" icon="swords" onClick={() => setChallenging(true)}>
              Challenge
            </Button>
          </div>

          <HeadToHead mine={myStats} theirs={stats} theirName={name} />

          <section aria-label="Activity">
            <SectionHeader title="Activity" />
            <Card>
              {stats ? (
                <ActivityHeatmap workouts={heat} readOnly />
              ) : (
                <p className="text-sm text-[var(--color-fg-muted)]">No stats shared yet — they appear after their next app open.</p>
              )}
            </Card>
          </section>

          {stats ? (
            <section aria-label="Lifetime">
              <SectionHeader title="Lifetime" />
              <dl className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Workouts', value: stats.totals.workouts.toLocaleString() },
                  { label: 'Longest', value: `${stats.streak.longest}${stats.streak.unit === 'day' ? 'd' : 'w'}` },
                  { label: 'PRs', value: String(stats.prCount) },
                ].map((t) => (
                  <div key={t.label} className="card px-2 py-3 text-center">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">{t.label}</dt>
                    <dd className="tabular font-display text-3xl font-bold leading-none">{t.value}</dd>
                  </div>
                ))}
              </dl>
              {stats.topLifts.length > 0 ? (
                <Card className="mt-2">
                  <h3 className="mb-2 text-sm font-semibold normal-case tracking-normal" style={{ fontFamily: 'var(--font-sans)' }}>
                    Top lifts (est. 1RM)
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {stats.topLifts.map((l) => (
                      <li key={l.name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 truncate">
                          <Icon name="trophy" size={14} className="shrink-0 text-brand-400" />
                          {l.name}
                        </span>
                        <span className="tabular font-bold">{fmtWeight(l.e1rmKg, settings.unit)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Plans">
            <SectionHeader title="Plans" />
            {authored.loading ? (
              <Skeleton className="h-36" />
            ) : authored.error ? (
              <Card>
                <p className="text-sm text-[var(--color-fg-muted)]">Couldn’t load their plans right now.</p>
              </Card>
            ) : authored.data.length === 0 ? (
              <Card>
                <p className="text-sm text-[var(--color-fg-muted)]">No published plans yet.</p>
              </Card>
            ) : (
              <PublicPlanList plans={authored.data} showAuthor={false} />
            )}
          </section>

          <section aria-label="Recent workouts">
            <SectionHeader title="Recent workouts" />
            {feedLoading && items.length === 0 ? (
              <Skeleton className="h-48" />
            ) : items.length === 0 ? (
              <Card>
                <p className="text-sm text-[var(--color-fg-muted)]">Nothing in the last 30 days.</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <ActivityCard item={item} profile={profile} onNameClick={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Button variant="ghost" full onClick={() => setConfirmUnfriend(true)} className="text-rose-400 hover:text-rose-400">
            Remove friend
          </Button>

          <NudgeSheet friend={nudging} onClose={() => setNudging(null)} />
          <NewChallengeSheet
            open={challenging}
            onClose={() => setChallenging(false)}
            preselect={profile.uid}
            myScoreFor={myScoreForNew}
          />
          <ConfirmSheet
            open={confirmUnfriend}
            title={`Remove ${whoLabel(profile)}?`}
            message={`You’ll stop seeing each other’s workouts and stats. You can add each other again any time.${
              sharedBattles.length > 0
                ? ` You have ${sharedBattles.length} battle${sharedBattles.length === 1 ? '' : 's'} running together. You’ll leave ${sharedBattles.length === 1 ? 'it' : 'them'}: your score stops counting and you show as “Left” for them, who get a notice.`
                : ''
            }`}
            confirmLabel="Remove"
            onCancel={() => setConfirmUnfriend(false)}
            onConfirm={async () => {
              setConfirmUnfriend(false)
              try {
                await unfriend(profile.uid)
                toast(`Removed ${whoLabel(profile)}.`, 'info')
                navigate('/friends?tab=friends', { replace: true })
              } catch {
                toast('Couldn’t remove that friend.', 'error')
              }
            }}
          />
        </>
      ) : (
        <Card>
          <p className="text-center text-sm text-[var(--color-fg-muted)]">
            Become friends to compare stats, see workouts and start battles.
          </p>
        </Card>
      )}
    </div>
  )
}

/** /u/:username — invite links resolve to a profile. */
export function UserLookup() {
  const { username = '' } = useParams()
  const navigate = useNavigate()
  const { lookupUsername } = useSocial()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    lookupUsername(username)
      .then((p) => {
        if (cancelled) return
        if (p) navigate(`/friends/${p.uid}`, { replace: true })
        else setMissing(true)
      })
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [username, lookupUsername, navigate])

  if (!missing) return <Skeleton className="h-40" />
  return (
    <EmptyState
      icon="users"
      title={`@${username} not found`}
      message="They may have changed their username. Ask them for a fresh invite link."
      action={
        <Button variant="secondary" onClick={() => navigate('/friends')}>
          Go to Friends
        </Button>
      }
    />
  )
}
