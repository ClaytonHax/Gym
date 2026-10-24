import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Card, IconButton } from './ui'
import { Avatar, displayOf, NudgeSheet } from './social'
import { useMyPublicStats } from './SocialSync'
import { useAuth } from '../contexts/AuthContext'
import { useSocial } from '../contexts/SocialContext'
import { challengeState, daysSince, metricValue, type PublicProfile } from '../lib/social'

/** Home-screen slice of the friends system: this week's race + who needs a nudge. */
export function FriendsPulse() {
  const { user } = useAuth()
  const { me, friends, friendsLoading, challenges } = useSocial()
  const { stats } = useMyPublicStats()
  const [nudging, setNudging] = useState<PublicProfile | null>(null)
  const uid = user?.uid ?? ''

  const ranked = useMemo(
    () =>
      [
        { uid, profile: me ?? undefined, value: metricValue(stats, 'workouts', 'week'), isMe: true },
        ...friends.map((f) => ({ uid: f.uid, profile: f.profile, value: metricValue(f.stats, 'workouts', 'week'), isMe: false })),
      ].sort((a, b) => b.value - a.value || Number(b.isMe) - Number(a.isMe)),
    [uid, me, stats, friends]
  )

  if (friendsLoading) return null

  if (friends.length === 0) {
    return (
      <Link
        to="/friends"
        className="card flex items-center gap-3 p-4 transition-colors duration-200 hover:border-brand-500/60"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="users" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Train with friends</span>
          <span className="block text-sm text-[var(--color-fg-muted)]">
            Race them on the leaderboard, nudge them and start battles.
          </span>
        </span>
        <Icon name="chevron-right" size={18} className="text-[var(--color-fg-muted)]" />
      </Link>
    )
  }

  const myRank = ranked.findIndex((r) => r.isMe) + 1
  const idle = friends.find((f) => (daysSince(f.stats?.lastWorkoutAt) ?? 99) >= 3 && f.profile)
  const live = challenges.filter((c) => c.accepted.includes(uid) && challengeState(c) === 'active').length

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Friends this week</h2>
        <Link to="/friends?tab=ranks" className="text-sm font-semibold text-brand-400 hover:text-brand-300">
          Leaderboard
        </Link>
      </div>
      <p className="mb-3 font-display text-3xl font-bold leading-none">
        #{myRank}
        <span className="ml-1.5 text-base text-[var(--color-fg-muted)]">of {ranked.length} in workouts</span>
      </p>
      <ol className="flex flex-col gap-1.5">
        {ranked.slice(0, 3).map((r, i) => {
          const { name } = displayOf(r.profile)
          return (
            <li key={r.uid} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${r.isMe ? 'bg-brand-500/10' : ''}`}>
              <span className="tabular w-4 text-center text-sm font-bold text-[var(--color-fg-muted)]">{i + 1}</span>
              <Avatar uid={r.uid} name={r.isMe ? 'You' : name} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.isMe ? 'You' : name}</span>
              <span className="tabular font-display text-lg font-bold">{r.value}</span>
            </li>
          )
        })}
      </ol>
      {idle?.profile || live > 0 ? (
        <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-line)] pt-3">
          {idle?.profile ? (
            <>
              <p className="min-w-0 flex-1 text-sm text-[var(--color-fg-muted)]">
                <span className="font-semibold text-[var(--color-fg)]">@{idle.profile.username}</span> hasn’t trained in{' '}
                {daysSince(idle.stats?.lastWorkoutAt) ?? 'a few'} days.
              </p>
              <IconButton
                icon="hand"
                label={`Nudge @${idle.profile.username}`}
                variant="secondary"
                onClick={() => setNudging(idle.profile!)}
              />
            </>
          ) : (
            <Link to="/friends?tab=challenges" className="flex min-h-11 flex-1 items-center gap-2 text-sm font-semibold text-brand-400">
              <Icon name="swords" size={16} />
              {live} live battle{live === 1 ? '' : 's'}
            </Link>
          )}
        </div>
      ) : null}
      <NudgeSheet friend={nudging} onClose={() => setNudging(null)} />
    </Card>
  )
}
