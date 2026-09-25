import type { BodyEntry, PersonalRecord, Workout, WorkoutExercise } from '../types'
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

export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecord>()
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!ex.tracksWeight) continue
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
      if (!ex) return []
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
): { date: string; sets: Array<{ weightKg: number; reps: number }> } | null {
  const sorted = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const w of sorted) {
    if (w.id === excludeWorkoutId) continue
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) continue
    const sets = ex.sets
      .filter((s) => s.done && !s.warmup)
      .map((s) => ({ weightKg: s.weightKg, reps: s.reps }))
    if (sets.length > 0) return { date: w.startedAt, sets }
  }
  return null
}
