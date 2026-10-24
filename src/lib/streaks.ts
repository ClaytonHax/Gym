import type { Workout } from '../types'
import { addDays, dayKey, parseDayKey, startOfWeek } from './date'

/** yyyy-mm-dd local-day key (see lib/date.ts dayKey). */
type DayKey = string

export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatCell {
  date: DayKey
  level: HeatLevel
  workoutCount: number
  setCount: number
  volumeKg: number
  workouts: Array<{ id: string; name: string }>
  /** Planned rest day with nothing logged. */
  isRest: boolean
  isFuture: boolean
  isToday: boolean
  /** False for padding cells after today. */
  inRange: boolean
}

export interface HeatmapData {
  /** Oldest first; each week is 7 cells, Monday..Sunday. */
  weeks: HeatCell[][]
  /** Label for the first column of each month. */
  months: Array<{ label: string; col: number }>
  thresholds: [number, number, number]
}

export interface StreakOptions {
  isRestDay?: (date: DayKey) => boolean
  planStartDate?: DayKey
  weeklyGoal: number
  today?: Date
}

export interface StreakStats {
  mode: 'plan' | 'weekly-goal'
  current: number
  longest: number
  todayDone: boolean
  workoutsThisWeek: number
  weeklyGoal: number
  totalWorkouts: number
}

/** Group sessions by the local calendar day they started on. */
export function workoutsByDay(workouts: Workout[]): Map<DayKey, Workout[]> {
  const map = new Map<DayKey, Workout[]>()
  for (const w of workouts) {
    const key = dayKey(new Date(w.startedAt))
    const list = map.get(key)
    if (list) list.push(w)
    else map.set(key, [w])
  }
  return map
}

/** Fixed fallback used until there are enough active days to take quartiles of. */
const FIXED_THRESHOLDS: [number, number, number] = [1, 8, 16]

/**
 * Intensity is the day's completed-set count. Once there are at least 4 active
 * days, levels are the quartiles of the non-zero days, so the ramp adapts to
 * how much the user trains. A level is `<= t0 -> 1`, `<= t1 -> 2`, `<= t2 -> 3`,
 * otherwise 4; any logged workout is at least level 1.
 */
function thresholdsFor(setCounts: number[]): [number, number, number] {
  const sorted = setCounts.filter((n) => n > 0).sort((a, b) => a - b)
  if (sorted.length < 4) return FIXED_THRESHOLDS
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  return [q(0.25), q(0.5), q(0.75)]
}

function levelFor(sets: number, workoutCount: number, t: [number, number, number]): HeatLevel {
  if (workoutCount === 0) return 0
  if (sets <= t[0]) return 1
  if (sets <= t[1]) return 2
  if (sets <= t[2]) return 3
  return 4
}

export function buildHeatmap(
  workouts: Workout[],
  weeks: number,
  opts: { isRestDay?: (d: DayKey) => boolean; today?: Date } = {}
): HeatmapData {
  const now = opts.today ?? new Date()
  const todayKey = dayKey(now)
  const byDay = workoutsByDay(workouts)

  const totals = new Map<DayKey, { sets: number; volume: number }>()
  for (const [key, list] of byDay) {
    totals.set(key, {
      sets: list.reduce((s, w) => s + w.setCount, 0),
      volume: list.reduce((s, w) => s + w.totalVolumeKg, 0),
    })
  }
  const thresholds = thresholdsFor([...totals.values()].map((t) => t.sets))

  const firstMonday = addDays(startOfWeek(now), -(weeks - 1) * 7)
  const grid: HeatCell[][] = []
  const months: Array<{ label: string; col: number }> = []
  let lastMonth = -1

  for (let c = 0; c < weeks; c++) {
    const monday = addDays(firstMonday, c * 7)
    if (monday.getMonth() !== lastMonth) {
      lastMonth = monday.getMonth()
      months.push({ label: monday.toLocaleDateString(undefined, { month: 'short' }), col: c })
    }
    const col: HeatCell[] = []
    for (let r = 0; r < 7; r++) {
      const key = dayKey(addDays(monday, r))
      const list = byDay.get(key) ?? []
      const t = totals.get(key)
      const isFuture = key > todayKey
      col.push({
        date: key,
        level: levelFor(t?.sets ?? 0, list.length, thresholds),
        workoutCount: list.length,
        setCount: t?.sets ?? 0,
        volumeKg: t?.volume ?? 0,
        workouts: list.map((w) => ({ id: w.id, name: w.name })),
        isRest: list.length === 0 && !isFuture && !!opts.isRestDay?.(key),
        isFuture,
        isToday: key === todayKey,
        inRange: !isFuture,
      })
    }
    grid.push(col)
  }

  // Avoid two labels colliding when a month starts one or two columns in.
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift()

  return { weeks: grid, months, thresholds }
}

/**
 * Streak definitions
 * - Plan mode (an active plan: isRestDay + planStartDate): a day is "honoured"
 *   when a workout was logged OR it is a planned rest day. The current streak
 *   walks back from today; today being unmet neither breaks nor counts (the day
 *   isn't over), a past unmet day breaks it, and nothing before planStartDate is
 *   considered. Longest runs the same rule over the whole plan history.
 * - Weekly-goal mode (no plan): consecutive Monday-first weeks with at least
 *   `weeklyGoal` workouts. The current week counts once met and doesn't break
 *   the streak while still in progress.
 */
export function computeStreaks(workouts: Workout[], opts: StreakOptions): StreakStats {
  const now = opts.today ?? new Date()
  const todayKey = dayKey(now)
  const byDay = workoutsByDay(workouts)
  const weekStart = startOfWeek(now).getTime()
  const goal = Math.max(1, opts.weeklyGoal)
  const thisWeek = workouts.filter((w) => new Date(w.startedAt).getTime() >= weekStart).length

  const base = {
    todayDone: byDay.has(todayKey),
    workoutsThisWeek: thisWeek,
    weeklyGoal: opts.weeklyGoal,
    totalWorkouts: workouts.length,
  }

  if (opts.isRestDay && opts.planStartDate) {
    const isRestDay = opts.isRestDay
    const honoured = (key: DayKey) => byDay.has(key) || isRestDay(key)
    const start = parseDayKey(opts.planStartDate)
    const today = parseDayKey(todayKey)

    let current = 0
    for (let d = today; d >= start; d = addDays(d, -1)) {
      const key = dayKey(d)
      if (honoured(key)) current++
      else if (key !== todayKey) break
    }

    let longest = 0
    let run = 0
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (honoured(dayKey(d))) {
        run++
        if (run > longest) longest = run
      } else if (dayKey(d) !== todayKey) {
        run = 0
      }
    }
    return { mode: 'plan', current, longest: Math.max(longest, current), ...base }
  }

  const perWeek = new Map<DayKey, number>()
  for (const w of workouts) {
    const k = dayKey(startOfWeek(new Date(w.startedAt)))
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1)
  }
  const met = (monday: Date) => (perWeek.get(dayKey(monday)) ?? 0) >= goal

  const thisMonday = startOfWeek(now)
  let current = 0
  for (let m = thisMonday; ; m = addDays(m, -7)) {
    if (met(m)) current++
    else if (m.getTime() !== thisMonday.getTime()) break
    else if (perWeek.size === 0) break
    if (current > 5000) break
  }

  let longest = 0
  if (workouts.length > 0) {
    const earliest = startOfWeek(new Date(workouts.reduce((a, w) => (w.startedAt < a ? w.startedAt : a), workouts[0].startedAt)))
    let run = 0
    for (let m = earliest; m.getTime() <= thisMonday.getTime(); m = addDays(m, 7)) {
      if (met(m)) {
        run++
        if (run > longest) longest = run
      } else if (m.getTime() !== thisMonday.getTime()) {
        run = 0
      }
    }
  }
  return { mode: 'weekly-goal', current, longest: Math.max(longest, current), ...base }
}
