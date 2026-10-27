import type { Workout } from '../types'
import { addDays, dayKey, startOfWeek } from './date'
import type { StreakStats } from './streaks'

/**
 * streakWatch/{uid} — the few non-sensitive facts the daily server check needs
 * to decide on a streak reminder without reading any workout data.
 * The decision logic mirrors api/_lib/streakLogic.js — keep them in sync.
 */
export interface StreakWatch {
  tz: string
  unit: 'day' | 'week'
  current: number
  asOfDay: string
  lastWorkoutDay: string
  /** Planned rest days from 3 days back to 7 days ahead. */
  restDays: string[]
  weeklyGoal: number
  weekStart: string
  workoutsThisWeek: number
  prevWeekWorkouts: number
  streakBeforePrev: number
  /** startedAt of an unfinished session that has logged sets; '' when none. */
  openSince: string
  /** Scheduled training days from 3 days back to 7 ahead (plan only, rest days excluded). */
  planDays: string[]
  /** Days in the last 3 with a logged workout. */
  trainedDays: string[]
  updatedAt: string
}

export type StreakStatus = { status: 'risk' | 'lost' | null; streak: number }

export function buildStreakWatch(
  workouts: Workout[],
  streaks: StreakStats,
  opts: { isRestDay?: (d: string) => boolean; isTrainingDay?: (d: string) => boolean; openSince?: string; weeklyGoal: number; now?: Date }
): StreakWatch {
  const now = opts.now ?? new Date()
  const today = dayKey(now)
  const goal = Math.max(1, opts.weeklyGoal)
  const monday = startOfWeek(now)
  const prevMonday = addDays(monday, -7)

  const perWeek = new Map<string, number>()
  let last = ''
  for (const w of workouts) {
    const d = new Date(w.startedAt)
    const k = dayKey(startOfWeek(d))
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1)
    if (w.startedAt > last) last = w.startedAt
  }
  let streakBeforePrev = 0
  for (let m = addDays(monday, -14); (perWeek.get(dayKey(m)) ?? 0) >= goal && streakBeforePrev < 5000; m = addDays(m, -7)) {
    streakBeforePrev++
  }

  const restDays: string[] = []
  if (streaks.mode === 'plan' && opts.isRestDay) {
    for (let i = -3; i <= 7; i++) {
      const k = dayKey(addDays(now, i))
      if (opts.isRestDay(k)) restDays.push(k)
    }
  }

  const planDays: string[] = []
  if (opts.isTrainingDay) {
    for (let i = -3; i <= 7; i++) {
      const k = dayKey(addDays(now, i))
      if (opts.isTrainingDay(k)) planDays.push(k)
    }
  }
  const recent = new Set(Array.from({ length: 4 }, (_, i) => dayKey(addDays(now, -i))))
  const trainedDays = [...new Set(workouts.map((w) => dayKey(new Date(w.startedAt))).filter((d) => recent.has(d)))].sort()

  let tz = 'UTC'
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    /* keep UTC */
  }

  return {
    tz: tz.slice(0, 64),
    unit: streaks.mode === 'plan' ? 'day' : 'week',
    current: streaks.current,
    asOfDay: today,
    lastWorkoutDay: last ? dayKey(new Date(last)) : '',
    restDays,
    weeklyGoal: Math.min(100, goal),
    weekStart: dayKey(monday),
    workoutsThisWeek: streaks.workoutsThisWeek,
    prevWeekWorkouts: perWeek.get(dayKey(prevMonday)) ?? 0,
    streakBeforePrev,
    openSince: opts.openSince ?? '',
    planDays,
    trainedDays,
    updatedAt: now.toISOString(),
  }
}

const DAY = 86400000
const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const addDay = (key: string, n: number) => new Date(parseDay(key) + n * DAY).toISOString().slice(0, 10)
const weekdayIndex = (key: string) => (new Date(parseDay(key)).getUTCDay() + 6) % 7

/** Same decision as the server. `now.day` is the viewer's local day key. */
export function evaluateWatch(w: StreakWatch, now: { day: string; hour: number }, minHour = 15): StreakStatus {
  const none: StreakStatus = { status: null, streak: 0 }
  const today = now.day
  const lag = (parseDay(today) - parseDay(w.asOfDay)) / DAY
  if (!(lag >= 0 && lag <= 2)) return none
  const rest = new Set(w.restDays)
  const trainedToday = w.lastWorkoutDay === today

  if (w.unit === 'day') {
    const honoured = (d: string) => rest.has(d) || w.lastWorkoutDay === d
    let end = honoured(w.asOfDay) ? w.asOfDay : addDay(w.asOfDay, -1)
    let chain = w.current
    for (let d = addDay(w.asOfDay, 1); d < today; d = addDay(d, 1)) {
      if (end === addDay(d, -1) && honoured(d)) {
        chain++
        end = d
      } else break
    }
    const yesterday = addDay(today, -1)
    if (trainedToday || chain < 2) return none
    if (end === yesterday) {
      if (rest.has(today)) return none
      return now.hour >= minHour ? { status: 'risk', streak: chain } : none
    }
    if (end === addDay(yesterday, -1) && !rest.has(yesterday)) return { status: 'lost', streak: chain }
    return none
  }

  const goal = Math.max(1, w.weeklyGoal || 1)
  const monday = addDay(today, -weekdayIndex(today))
  if (w.weekStart === monday) {
    if (trainedToday) return none
    const remaining = goal - w.workoutsThisWeek
    const daysLeft = 7 - weekdayIndex(today)
    if (remaining > 0 && remaining >= daysLeft && w.current >= 1) {
      return now.hour >= minHour ? { status: 'risk', streak: w.current } : none
    }
    if (today === monday && w.prevWeekWorkouts < goal && w.streakBeforePrev >= 1) {
      return { status: 'lost', streak: w.streakBeforePrev }
    }
    return none
  }
  if (w.weekStart === addDay(monday, -7) && today === monday) {
    if (w.workoutsThisWeek < goal && w.current >= 1) return { status: 'lost', streak: w.current }
  }
  return none
}

export function localNow(d = new Date()) {
  return { day: dayKey(d), hour: d.getHours() }
}
