import type { BodyEntry, PersonalRecord, Unit, Workout, WorkoutExercise, WorkoutSet } from '../types'
import { distanceUnit, kmTo } from './units'
import { isTimed } from './logMode'
import { estimateCalories } from './calories'
import { addDays, dayKey, parseDayKey, startOfWeek } from './date'

/** Only completed working sets count toward volume. */
export function volumeOf(exercises: WorkoutExercise[]): number {
  let total = 0
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.done && !set.warmup) total += set.weightKg * set.reps
    }
  }
  return total
}

export function completedSetCount(exercises: WorkoutExercise[]): number {
  return exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.done && !s.warmup).length, 0)
}

/**
 * Epley estimate of a one-rep max. Above ~12 reps the formula drifts badly,
 * so we clamp the rep count rather than reporting a fantasy number.
 */
export function estimate1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0
  const r = Math.min(reps, 12)
  return r === 1 ? weightKg : weightKg * (1 + r / 30)
}

export function bestSetOf(ex: WorkoutExercise): { weightKg: number; reps: number } | null {
  let best: { weightKg: number; reps: number } | null = null
  let bestScore = 0
  for (const s of ex.sets) {
    if (!s.done || s.warmup) continue
    const score = estimate1rm(s.weightKg, s.reps)
    if (score > bestScore) {
      bestScore = score
      best = { weightKg: s.weightKg, reps: s.reps }
    }
  }
  return best
}

/** Longest completed working set of a timed exercise, with the distance logged on it. */
export function timedBestOf(
  ex: WorkoutExercise
): { durationSec: number; distanceKm: number | undefined } | null {
  let best: { durationSec: number; distanceKm: number | undefined } | null = null
  for (const s of ex.sets) {
    if (!s.done || s.warmup || !s.durationSec) continue
    if (!best || s.durationSec > best.durationSec) {
      best = { durationSec: s.durationSec, distanceKm: s.distanceKm }
    }
  }
  return best
}

/** Longest single timed set per exercise across history — drives the "longest session" toast. */
export function bestDurationByExercise(workouts: Workout[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!isTimed(ex)) continue
      const b = timedBestOf(ex)
      if (b && b.durationSec > (best.get(ex.exerciseId) ?? 0)) best.set(ex.exerciseId, b.durationSec)
    }
  }
  return best
}

export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecord>()
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!ex.tracksWeight || isTimed(ex)) continue
      const best = bestSetOf(ex)
      if (!best) continue
      const est = estimate1rm(best.weightKg, best.reps)
      const current = byExercise.get(ex.exerciseId)
      if (!current || est > current.estimated1rmKg) {
        byExercise.set(ex.exerciseId, {
          exerciseId: ex.exerciseId,
          name: ex.name,
          muscle: ex.muscle,
          bestWeightKg: best.weightKg,
          bestReps: best.reps,
          estimated1rmKg: est,
          date: w.startedAt,
        })
      }
    }
  }
  return [...byExercise.values()].sort((a, b) => b.estimated1rmKg - a.estimated1rmKg)
}

/** Consecutive weeks (ending this week or last) containing at least one workout. */
export function weekStreak(workouts: Workout[]): number {
  if (workouts.length === 0) return 0
  const weeks = new Set(workouts.map((w) => dayKey(startOfWeek(new Date(w.startedAt)))))
  let cursor = startOfWeek()
  // A streak shouldn't read as broken on Monday morning before you've trained.
  if (!weeks.has(dayKey(cursor))) {
    cursor = addDays(cursor, -7)
    if (!weeks.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (weeks.has(dayKey(cursor))) {
    streak++
    cursor = addDays(cursor, -7)
  }
  return streak
}

export function workoutsThisWeek(workouts: Workout[]): Workout[] {
  const from = startOfWeek().getTime()
  return workouts.filter((w) => new Date(w.startedAt).getTime() >= from)
}

export interface TrendPoint {
  date: string
  label: string
  value: number
}

/** Body-weight series plus a 7-point moving average to cut daily water noise. */
export function bodyWeightSeries(
  entries: BodyEntry[],
  days: number
): Array<TrendPoint & { avg: number | null }> {
  const cutoff = addDays(new Date(), -days).getTime()
  const sorted = [...entries]
    .filter((e) => parseDayKey(e.date).getTime() >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((e, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1)
    const avg = window.reduce((s, w) => s + w.weightKg, 0) / window.length
    return {
      date: e.date,
      label: parseDayKey(e.date).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
      value: e.weightKg,
      avg: window.length >= 3 ? avg : null,
    }
  })
}

/** Total volume per ISO week, oldest first, gaps filled with zero. */
export function weeklyVolume(workouts: Workout[], weeks: number): TrendPoint[] {
  const buckets = new Map<string, number>()
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.set(dayKey(addDays(startOfWeek(), -7 * i)), 0)
  }
  for (const w of workouts) {
    const key = dayKey(startOfWeek(new Date(w.startedAt)))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + w.totalVolumeKg)
  }
  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: parseDayKey(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    value,
  }))
}

/** Completed sets per muscle group over a window — feeds the balance radar. */
export function muscleBalance(workouts: Workout[], days: number) {
  const cutoff = addDays(new Date(), -days).getTime()
  const counts = new Map<string, number>()
  for (const w of workouts) {
    if (new Date(w.startedAt).getTime() < cutoff) continue
    for (const ex of w.exercises) {
      const sets = ex.sets.filter((s) => s.done && !s.warmup).length
      if (sets === 0) continue
      counts.set(ex.muscle, (counts.get(ex.muscle) ?? 0) + sets)
    }
  }
  return [...counts.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets)
}

/** Estimated-1RM progression for a single exercise, one point per workout. */
export function exerciseProgress(workouts: Workout[], exerciseId: string): TrendPoint[] {
  return [...workouts]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((w) => {
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId)
      if (!ex || isTimed(ex)) return []
      const best = bestSetOf(ex)
      if (!best) return []
      return [
        {
          date: w.startedAt,
          label: new Date(w.startedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          }),
          value: estimate1rm(best.weightKg, best.reps),
        },
      ]
    })
}

/** The most recent completed sets for an exercise, shown as "last time" targets. */
export function lastPerformance(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string
): {
  date: string
  sets: Array<{ weightKg: number; reps: number; durationSec?: number; distanceKm?: number }>
} | null {
  const sorted = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const w of sorted) {
    if (w.id === excludeWorkoutId) continue
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) continue
    const sets = ex.sets
      .filter((s) => s.done && !s.warmup)
      .map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
        ...(s.distanceKm !== undefined ? { distanceKm: s.distanceKm } : {}),
      }))
    if (sets.length > 0) return { date: w.startedAt, sets }
  }
  return null
}

/* ------------------------------ Cardio helpers ----------------------------- */


/** Completed timed time and distance in one session. */
export function cardioTotals(w: Pick<Workout, 'exercises'>): { sec: number; km: number } {
  let sec = 0
  let km = 0
  for (const ex of w.exercises) {
    if (!isTimed(ex)) continue
    for (const s of ex.sets) {
      if (!s.done || s.warmup) continue
      sec += s.durationSec ?? 0
      km += s.distanceKm ?? 0
    }
  }
  return { sec, km }
}

/** True when nothing in the session was logged by weight/reps (volume would read 0). */
export function isCardioOnly(w: Pick<Workout, 'exercises'>): boolean {
  return (
    w.exercises.length > 0 &&
    w.exercises.every((ex) => isTimed(ex) && ex.muscle === 'Cardio')
  )
}

/** Saved estimate, or a fresh one (using the latest body weight) for older sessions. */
export function caloriesOf(w: Workout, bodyWeightKg?: number): { kcal: number; saved: boolean } {
  if (w.caloriesKcal !== undefined) return { kcal: w.caloriesKcal, saved: true }
  return { kcal: estimateCalories(w, bodyWeightKg), saved: false }
}

/** Per-week buckets (oldest first) of a per-workout number. */
function weeklySum(workouts: Workout[], weeks: number, pick: (w: Workout) => number): TrendPoint[] {
  const buckets = new Map<string, number>()
  for (let i = weeks - 1; i >= 0; i--) buckets.set(dayKey(addDays(startOfWeek(), -7 * i)), 0)
  for (const w of workouts) {
    const key = dayKey(startOfWeek(new Date(w.startedAt)))
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + pick(w))
  }
  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: parseDayKey(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    value,
  }))
}

/** Minutes of timed (cardio) work per week. */
export function weeklyCardioMinutes(workouts: Workout[], weeks: number): TrendPoint[] {
  return weeklySum(workouts, weeks, (w) => cardioTotals(w).sec / 60)
}

/** Estimated calories per week; older sessions are estimated from body weight. */
export function weeklyCalories(workouts: Workout[], weeks: number, bodyWeightKg?: number): TrendPoint[] {
  return weeklySum(workouts, weeks, (w) => caloriesOf(w, bodyWeightKg).kcal)
}

/** True when most sessions are cardio-only — Progress then leads with minutes, not kg. */
export function mostlyCardio(workouts: Workout[]): boolean {
  if (workouts.length === 0) return false
  return workouts.filter(isCardioOnly).length * 2 > workouts.length
}

export interface CardioBests {
  longest: { name: string; durationSec: number; date: string } | null
  farthest: { name: string; distanceKm: number; date: string } | null
}

/** Longest single timed set and farthest distance across history. */
export function cardioBests(workouts: Workout[]): CardioBests {
  const out: CardioBests = { longest: null, farthest: null }
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!isTimed(ex)) continue
      for (const s of ex.sets) {
        if (!s.done || s.warmup) continue
        if (s.durationSec && s.durationSec > (out.longest?.durationSec ?? 0)) {
          out.longest = { name: ex.name, durationSec: s.durationSec, date: w.startedAt }
        }
        if (s.distanceKm && s.distanceKm > (out.farthest?.distanceKm ?? 0)) {
          out.farthest = { name: ex.name, distanceKm: s.distanceKm, date: w.startedAt }
        }
      }
    }
  }
  return out
}

/** Round a chart axis up to a "nice" ceiling so ticks are unique and even. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const frac = rough / pow
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

/** "15:00 · Level 8 · 2.1 km" — the extras a timed set recorded, in reading order. */
export function fmtCardioSet(
  s: WorkoutSet,
  unit: Unit,
  fmts: { clock: (sec: number) => string; distance: (km: number, unit: Unit) => string }
): string {
  const parts: string[] = []
  if (s.durationSec) parts.push(fmts.clock(s.durationSec))
  if (s.distanceKm) parts.push(fmts.distance(s.distanceKm, unit))
  if (s.speedKmh) {
    const v = Math.round(kmTo(unit, s.speedKmh) * 10) / 10
    parts.push(`${v} ${distanceUnit(unit)}/h`)
  }
  if (s.inclinePct) parts.push(`${s.inclinePct}% incline`)
  if (s.level) parts.push(`Level ${s.level}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
