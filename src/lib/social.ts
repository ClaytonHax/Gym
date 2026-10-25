import type { Workout } from '../types'
import { addDays, dayKey, parseDayKey, startOfWeek } from './date'
import { bestSetOf, estimate1rm } from './stats'
import type { StreakStats } from './streaks'
import { isTimed } from './logMode'

/* -------------------------------------------------------------------------- */
/* Types — mirrors of the Firestore docs described in firestore.rules          */
/* -------------------------------------------------------------------------- */

/** profiles/{uid} — the only thing a non-friend can see about you. */
export interface PublicProfile {
  uid: string
  username: string
  displayName: string
  /** ISO, converted from the server timestamp. */
  joinedAt?: string
  usernameChangedAt?: string
  /** One free rename after joining; afterwards once every 30 days. */
  freeChange: boolean
}

/** [workouts, sets, volumeKg, minutes] for one day. */
export type DayTotals = [number, number, number, number]

/** users/{uid}/public/stats — what friends compete against. */
export interface PublicStats {
  asOf: string
  /** Sparse: only days with a workout, last STATS_DAYS days. */
  days: Record<string, DayTotals>
  totals: { workouts: number; sets: number; volumeKg: number; minutes: number; activeDays: number }
  streak: { current: number; longest: number; unit: 'day' | 'week' }
  weeklyGoal: number
  lastWorkoutAt: string | null
  prCount: number
  topLifts: Array<{ name: string; e1rmKg: number }>
  /** Owner-computed at last sync: streak ends today unless they train. Trust only if atRiskDay is the viewer's today. */
  atRisk?: boolean
  atRiskDay?: string
}

export type Reaction = 'fire' | 'strong' | 'beast'

/** users/{uid}/activity/{workoutId} — one card in friends' feeds. */
export interface ActivityItem {
  id: string
  uid: string
  name: string
  at: string
  durationSec: number
  sets: number
  volumeKg: number
  exercises: string[]
  exerciseCount: number
  prs: number
  planDayName?: string
  reactions: Record<string, Reaction>
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accept'
  | 'nudge'
  | 'kudos'
  | 'workout'
  | 'challenge_invite'
  | 'challenge_join'
  | 'streak_risk'
  | 'streak_lost'
  | 'friend_streak'

export interface AppNotification {
  id: string
  type: NotificationType
  from: string
  fromUsername: string
  text?: string
  ref?: string
  createdAt: string
  read: boolean
}

export interface FriendRequest {
  id: string
  from: string
  to: string
  fromUsername: string
  fromName: string
  toUsername: string
  toName: string
  createdAt: string
}

export type ChallengeMetric = 'workouts' | 'days' | 'volume' | 'sets' | 'minutes'

export interface Challenge {
  id: string
  creator: string
  members: string[]
  accepted: string[]
  declined: string[]
  metric: ChallengeMetric
  title: string
  startDay: string
  endDay: string
  createdAt: string
  scores: Record<string, number>
  /** 'photo': only workouts with one of your proofs count. Immutable. */
  verify?: 'none' | 'photo'
}

/** challenges/{cid}/proofs/{uid}_{workoutId} — a photo (as a tiny SVG) for one workout. */
export interface Proof {
  id: string
  uid: string
  workoutId: string
  /** yyyy-mm-dd, local day of the workout. */
  day: string
  workoutName: string
  value: number
  svg: string
  w: number
  h: number
  caption?: string
  createdAt: string
}

export const proofId = (uid: string, workoutId: string) => `${uid}_${workoutId}`

export interface Friend {
  uid: string
  since?: string
  profile?: PublicProfile
  stats?: PublicStats
}

/* -------------------------------------------------------------------------- */
/* Usernames                                                                   */
/* -------------------------------------------------------------------------- */

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
export const RENAME_COOLDOWN_DAYS = 30

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

export function usernameError(name: string): string | null {
  if (name.length < 3) return 'At least 3 characters.'
  if (name.length > 20) return '20 characters max.'
  if (!USERNAME_RE.test(name)) return 'Letters, numbers, dots and underscores only.'
  if (/^[._]|[._]$/.test(name)) return 'Can’t start or end with a dot or underscore.'
  return null
}

/** "Clayton Banks" → "claytonbanks482". Always valid against USERNAME_RE. */
export function suggestUsername(seed: string): string {
  let base = seed
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 14)
  if (base.length < 3) base = 'lifter'
  return `${base}${Math.floor(100 + Math.random() * 900)}`
}

/** When the next rename is allowed, or null if one is available now. */
export function nextRenameAt(p: PublicProfile): Date | null {
  if (p.freeChange || !p.usernameChangedAt) return null
  const next = new Date(p.usernameChangedAt)
  next.setDate(next.getDate() + RENAME_COOLDOWN_DAYS)
  // Small margin so the client never offers a rename the server would refuse.
  next.setMinutes(next.getMinutes() + 1)
  return next.getTime() > Date.now() ? next : null
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                     */
/* -------------------------------------------------------------------------- */

// Saturated fills that all keep ink-950 initials above 4.5:1.
const AVATAR_COLORS = ['#fb923c', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#2dd4bf', '#f87171']

export function avatarColor(uid: string): string {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string, fallback = '?'): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback.slice(0, 1).toUpperCase()
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/* -------------------------------------------------------------------------- */
/* Public stats                                                                */
/* -------------------------------------------------------------------------- */

export const STATS_DAYS = 120

export function buildPublicStats(workouts: Workout[], streaks: StreakStats, weeklyGoal: number): PublicStats {
  const cutoff = dayKey(addDays(new Date(), -STATS_DAYS))
  const days: Record<string, DayTotals> = {}
  const active = new Set<string>()
  let sets = 0
  let volume = 0
  let minutes = 0
  for (const w of workouts) {
    const key = dayKey(new Date(w.startedAt))
    const mins = Math.round(w.durationSec / 60)
    active.add(key)
    sets += w.setCount
    volume += w.totalVolumeKg
    minutes += mins
    if (key < cutoff) continue
    const t = days[key] ?? [0, 0, 0, 0]
    days[key] = [t[0] + 1, t[1] + w.setCount, Math.round(t[2] + w.totalVolumeKg), t[3] + mins]
  }

  const lifts = new Map<string, { name: string; e1rmKg: number }>()
  let prCount = 0
  const chronological = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const w of chronological) {
    for (const ex of w.exercises) {
      if (!ex.tracksWeight || isTimed(ex)) continue
      const best = bestSetOf(ex)
      if (!best) continue
      const e1rm = estimate1rm(best.weightKg, best.reps)
      const prev = lifts.get(ex.exerciseId)
      if (!prev || e1rm > prev.e1rmKg) {
        if (prev) prCount++
        lifts.set(ex.exerciseId, { name: ex.name, e1rmKg: Math.round(e1rm * 10) / 10 })
      }
    }
  }

  return {
    asOf: dayKey(),
    days,
    totals: {
      workouts: workouts.length,
      sets,
      volumeKg: Math.round(volume),
      minutes,
      activeDays: active.size,
    },
    streak: {
      current: streaks.current,
      longest: streaks.longest,
      unit: streaks.mode === 'plan' ? 'day' : 'week',
    },
    weeklyGoal,
    lastWorkoutAt: workouts[0]?.startedAt ?? null,
    prCount,
    topLifts: [...lifts.values()].sort((a, b) => b.e1rmKg - a.e1rmKg).slice(0, 3),
  }
}

/**
 * A friend's stored streak is only as fresh as their last app open. Drop it to
 * zero when their own data shows it must have lapsed since.
 */
export function liveStreak(s: PublicStats | undefined): number {
  if (!s) return 0
  const last = s.lastWorkoutAt ? dayKey(new Date(s.lastWorkoutAt)) : null
  if (!last) return 0
  const today = parseDayKey(dayKey())
  if (s.streak.unit === 'day') {
    // Plans allow at most a couple of rest days in a row.
    const gap = Math.round((today.getTime() - parseDayKey(last).getTime()) / 86400000)
    return gap > 3 ? 0 : s.streak.current
  }
  const thisMonday = startOfWeek()
  if (s.asOf >= dayKey(thisMonday)) return s.streak.current
  // Stats are from an earlier week: last week must have met the goal.
  const lastMonday = addDays(thisMonday, -7)
  let count = 0
  for (let i = 0; i < 7; i++) count += s.days[dayKey(addDays(lastMonday, i))]?.[0] ?? 0
  return count >= Math.max(1, s.weeklyGoal) ? s.streak.current : 0
}

/* -------------------------------------------------------------------------- */
/* Competition metrics                                                         */
/* -------------------------------------------------------------------------- */

export type Period = 'week' | 'month' | 'all'
export type BoardMetric = ChallengeMetric | 'streak'

export const METRICS: Record<BoardMetric, { label: string; short: string; unit: string }> = {
  workouts: { label: 'Workouts', short: 'Workouts', unit: '' },
  days: { label: 'Active days', short: 'Days', unit: 'days' },
  volume: { label: 'Volume lifted', short: 'Volume', unit: 'kg' },
  sets: { label: 'Working sets', short: 'Sets', unit: 'sets' },
  minutes: { label: 'Time training', short: 'Time', unit: 'min' },
  streak: { label: 'Current streak', short: 'Streak', unit: '' },
}

export function periodStart(period: Period): string | null {
  const now = new Date()
  if (period === 'week') return dayKey(startOfWeek(now))
  if (period === 'month') return dayKey(new Date(now.getFullYear(), now.getMonth(), 1))
  return null
}

function sumDays(days: Record<string, DayTotals>, from: string, to: string, metric: ChallengeMetric): number {
  let total = 0
  for (const [key, t] of Object.entries(days)) {
    if (key < from || key > to) continue
    if (metric === 'workouts') total += t[0]
    else if (metric === 'days') total += t[0] > 0 ? 1 : 0
    else if (metric === 'sets') total += t[1]
    else if (metric === 'volume') total += t[2]
    else total += t[3]
  }
  return total
}

export function metricValue(s: PublicStats | undefined, metric: BoardMetric, period: Period): number {
  if (!s) return 0
  if (metric === 'streak') return liveStreak(s)
  const from = periodStart(period)
  if (from) return sumDays(s.days, from, dayKey(), metric)
  const t = s.totals
  return metric === 'workouts'
    ? t.workouts
    : metric === 'days'
      ? t.activeDays
      : metric === 'sets'
        ? t.sets
        : metric === 'volume'
          ? t.volumeKg
          : t.minutes
}

/** What one workout contributes to a challenge score (days: 1, the day dedupes). */
export function workoutValue(w: Workout, metric: ChallengeMetric): number {
  if (metric === 'workouts' || metric === 'days') return 1
  if (metric === 'sets') return w.setCount
  if (metric === 'volume') return Math.round(w.totalVolumeKg)
  return Math.round(w.durationSec / 60)
}

/**
 * A challenge score straight from your own workouts (inclusive day range).
 * `allowed` limits it to those workout ids — photo battles pass your proven ones.
 */
export function challengeScore(
  workouts: Workout[],
  metric: ChallengeMetric,
  startDay: string,
  endDay: string,
  allowed?: ReadonlySet<string>
): number {
  const days = new Set<string>()
  let total = 0
  for (const w of workouts) {
    if (allowed && !allowed.has(w.id)) continue
    const key = dayKey(new Date(w.startedAt))
    if (key < startDay || key > endDay) continue
    if (metric === 'workouts') total++
    else if (metric === 'days') days.add(key)
    else if (metric === 'sets') total += w.setCount
    else if (metric === 'volume') total += w.totalVolumeKg
    else total += w.durationSec / 60
  }
  return Math.round(metric === 'days' ? days.size : total)
}

export function challengeState(c: Challenge, today = dayKey()): 'upcoming' | 'active' | 'finished' {
  if (today < c.startDay) return 'upcoming'
  if (today > c.endDay) return 'finished'
  return 'active'
}

export function daysLeft(c: Challenge): number {
  const end = parseDayKey(c.endDay).getTime()
  const today = parseDayKey(dayKey()).getTime()
  return Math.max(0, Math.round((end - today) / 86400000) + 1)
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

/** How many of this workout's lifts beat every earlier session. */
export function prsIn(workout: Workout, all: Workout[]): number {
  const best = new Map<string, number>()
  for (const w of all) {
    if (w.startedAt >= workout.startedAt) continue
    for (const ex of w.exercises) {
      const b = bestSetOf(ex)
      if (!b || !ex.tracksWeight || isTimed(ex)) continue
      const e = estimate1rm(b.weightKg, b.reps)
      if (e > (best.get(ex.exerciseId) ?? 0)) best.set(ex.exerciseId, e)
    }
  }
  let count = 0
  for (const ex of workout.exercises) {
    const b = bestSetOf(ex)
    if (!b || !ex.tracksWeight || isTimed(ex)) continue
    const prev = best.get(ex.exerciseId)
    if (prev !== undefined && estimate1rm(b.weightKg, b.reps) > prev) count++
  }
  return count
}

export function activityFor(w: Workout, all: Workout[]): Omit<ActivityItem, 'id' | 'uid' | 'reactions'> {
  return {
    name: w.planDayName ?? w.name,
    at: w.startedAt,
    durationSec: w.durationSec,
    sets: w.setCount,
    volumeKg: Math.round(w.totalVolumeKg),
    exercises: w.exercises.slice(0, 6).map((e) => e.name),
    exerciseCount: w.exercises.length,
    prs: prsIn(w, all),
    ...(w.planDayName ? { planDayName: w.planDayName } : {}),
  }
}

export const REACTIONS: Array<{ id: Reaction; label: string }> = [
  { id: 'fire', label: 'Fire' },
  { id: 'strong', label: 'Strong' },
  { id: 'beast', label: 'Beast mode' },
]

export const NUDGE_PRESETS = [
  'Time to lift. Let’s go!',
  'Don’t break your streak.',
  'Gym today? I’m going.',
  'Your weights miss you.',
  'One set at a time. You’ve got this.',
]

/** Days since a friend last trained, or null if never. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const then = parseDayKey(dayKey(new Date(iso))).getTime()
  const now = parseDayKey(dayKey()).getTime()
  return Math.round((now - then) / 86400000)
}

export function lastTrainedLabel(iso: string | null | undefined): string {
  const d = daysSince(iso)
  if (d === null) return 'No workouts yet'
  if (d === 0) return 'Trained today'
  if (d === 1) return 'Trained yesterday'
  return `Last trained ${d} days ago`
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** UTC day number — must match dayNumber() in firestore.rules. */
export function utcDayNumber(): number {
  return Math.floor(Date.now() / 86400000)
}

/** `currentUsername` is the sender's live handle; the stored one may be stale after a rename. */
export function describeNotification(
  n: AppNotification,
  currentUsername?: string
): { title: string; body?: string; to: string } {
  const who = `@${currentUsername || n.fromUsername}`
  switch (n.type) {
    case 'friend_request':
      return { title: `${who} sent you a friend request`, to: '/friends?tab=friends' }
    case 'friend_accept':
      return { title: `${who} accepted your friend request`, to: `/friends/${n.from}` }
    case 'nudge':
      return { title: `${who} nudged you`, body: n.text, to: '/' }
    case 'kudos':
      return { title: `${who} reacted to your workout`, body: n.text, to: n.ref ? `/history/${n.ref}` : '/friends' }
    case 'workout':
      return { title: `${who} just trained`, body: n.text, to: `/friends/${n.from}` }
    case 'challenge_invite':
      return { title: `${who} challenged you`, body: n.text, to: '/friends?tab=challenges' }
    case 'challenge_join':
      return { title: `${who} accepted your challenge`, body: n.text, to: '/friends?tab=challenges' }
    case 'streak_risk':
      return { title: n.text || 'Your streak is on the line', to: '/' }
    case 'streak_lost':
      return { title: n.text || 'Your streak ended. Start a new one today.', to: '/' }
    case 'friend_streak':
      return { title: n.text || `${who}’s streak is at risk`, to: n.ref ? `/friends/${n.ref}` : '/friends' }
  }
}

/** Firestore Timestamp | ISO | undefined → ISO. */
export function toIso(v: unknown): string {
  if (!v) return new Date().toISOString()
  if (typeof v === 'string') return v
  const t = v as { toDate?: () => Date }
  return t.toDate ? t.toDate().toISOString() : new Date().toISOString()
}

/**
 * Is this friend's streak ending today? Based on their last sync, so it is only
 * trusted when it was computed today and they haven't trained since (by their
 * latest workout). Hidden before noon so mornings aren't nagging.
 */
export function friendAtRisk(s: PublicStats | undefined): boolean {
  if (!s?.atRisk || s.atRiskDay !== dayKey()) return false
  if (new Date().getHours() < 12) return false
  if (s.lastWorkoutAt && dayKey(new Date(s.lastWorkoutAt)) === dayKey()) return false
  return liveStreak(s) >= 2
}
