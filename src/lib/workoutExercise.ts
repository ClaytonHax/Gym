import { isTimed } from './logMode'
import type { ActiveWorkout, Exercise, PlanExercise, Workout, WorkoutExercise, WorkoutSet } from '../types'

/**
 * Stable React keys for the live session. Exercises and sets have no ids of their
 * own, and index keys let one row's typed text leak into another after a removal
 * or reorder. The key is stored on the object (it survives reloads and device
 * sync) and stripped again when the workout is saved to history.
 */
export function newKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function keyOf(x: object, fallback: string): string {
  return (x as { key?: string }).key ?? fallback
}

function setWithKey(s: WorkoutSet): WorkoutSet {
  return keyOf(s, '') ? s : ({ ...s, key: newKey() } as WorkoutSet)
}

export function needsKeys(w: ActiveWorkout): boolean {
  return w.exercises.some((e) => !keyOf(e, '') || e.sets.some((s) => !keyOf(s, '')))
}

/** Fills in any missing keys; returns the same object when nothing was missing. */
export function withKeys(w: ActiveWorkout): ActiveWorkout {
  if (!needsKeys(w)) return w
  return {
    ...w,
    exercises: w.exercises.map((e) => ({
      ...(keyOf(e, '') ? e : { ...e, key: newKey() }),
      sets: e.sets.map(setWithKey),
    })),
  }
}

export function stripKeys<T extends WorkoutExercise>(ex: T): T {
  const { key: _k, ...rest } = ex as T & { key?: string }
  return { ...rest, sets: ex.sets.map((s) => { const { key: _s, ...r } = s as WorkoutSet & { key?: string }; return r }) } as T
}

export function emptySet(): WorkoutSet {
  return { weightKg: 0, reps: 0, done: false, key: newKey() } as WorkoutSet
}

export function toWorkoutExercise(ex: Exercise): WorkoutExercise {
  return {
    key: newKey(),
    exerciseId: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    tracksWeight: ex.tracksWeight,
    ...(ex.logBy ? { logBy: ex.logBy } : {}),
    ...(ex.cardioFields ? { cardioFields: ex.cardioFields } : {}),
    sets: [emptySet()],
  } as WorkoutExercise
}

/**
 * planToExercises (data/programs.ts) predates cardioFields; this copies them across
 * by position (it maps 1:1) so plan/routine starts show speed/incline/level fields.
 */
export function attachCardioFields(exercises: WorkoutExercise[], plan: PlanExercise[]): WorkoutExercise[] {
  return exercises.map((e, i) => {
    const fields = plan[i]?.cardioFields
    return fields && plan[i].exerciseId === e.exerciseId ? { ...e, cardioFields: fields } : e
  })
}

export function withCardioFields(w: ActiveWorkout, plan: PlanExercise[]): ActiveWorkout {
  return { ...w, exercises: attachCardioFields(w.exercises, plan) }
}

/** "Aim: 5–9 reps" or "Aim: 10–12 reps, then 6–8 reps"; null when no targets are set. */
export function aimLabel(sets: Array<Pick<WorkoutSet, 'targetReps' | 'warmup'>>): string | null {
  const parts: string[] = []
  for (const s of sets) {
    if (s.warmup || !s.targetReps) continue
    const t = s.targetReps.trim().toLowerCase()
    const label = t === 'failure' ? 'as many as you can' : `${t.replace(/\s*-\s*/g, '–')} reps`
    if (parts[parts.length - 1] !== label) parts.push(label)
  }
  return parts.length ? `Aim: ${parts.join(', then ')}` : null
}


/** The seconds a timed set currently holds, counting a still-running stopwatch. */
export function timedSeconds(s: WorkoutSet, now = Date.now()): number {
  if (s.timerStartedAt) return Math.max(0, Math.floor((now - new Date(s.timerStartedAt).getTime()) / 1000))
  return s.durationSec ?? 0
}

/** A set the person has typed into but not ticked, and which has enough to count as done. */
export function isUnfinished(ex: WorkoutExercise, s: WorkoutSet, now = Date.now()): boolean {
  if (s.done) return false
  return isTimed(ex) ? timedSeconds(s, now) > 0 : s.reps > 0
}

export interface UnfinishedSummary {
  name: string
  count: number
}

export function unfinishedSummary(exercises: WorkoutExercise[], now = Date.now()): UnfinishedSummary[] {
  return exercises
    .map((e) => ({ name: e.name, count: e.sets.filter((s) => isUnfinished(e, s, now)).length }))
    .filter((e) => e.count > 0)
}

/** Marks every unfinished set done, freezing any running stopwatch at its elapsed time. */
export function completeUnfinished(exercises: WorkoutExercise[], now = Date.now()): WorkoutExercise[] {
  return exercises.map((e) => {
    if (!e.sets.some((s) => isUnfinished(e, s, now))) return e
    return {
      ...e,
      sets: e.sets.map((s) => {
        if (!isUnfinished(e, s, now)) return s
        const { timerStartedAt: _t, ...rest } = s
        return isTimed(e) ? { ...rest, durationSec: timedSeconds(s, now), done: true } : { ...rest, done: true }
      }),
    }
  })
}

/** Wall-clock time, but never less than the timed work actually logged (a typed 5:00 on the treadmill counts). */
export function sessionDurationSec(startedAt: string, exercises: WorkoutExercise[], now = Date.now()): number {
  const wall = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000))
  let timed = 0
  for (const e of exercises) {
    if (!isTimed(e)) continue
    for (const s of e.sets) if (s.done) timed += s.durationSec ?? 0
  }
  return Math.max(wall, timed)
}

/** Minutes for the finish sheet: "56 min", "1 h 05 min", or seconds under a minute. */
export function fmtMinutes(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  if (s < 60) return `${s} sec`
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}


/**
 * Replace an exercise in place (the machine is taken): same position, same number
 * of sets and the same targets, rest and pairing, with the logged numbers cleared.
 */
export function swapExercise(old: WorkoutExercise, next: Exercise): WorkoutExercise {
  const timed = next.logBy === 'time'
  return {
    key: newKey(),
    exerciseId: next.id,
    name: next.name,
    muscle: next.muscle,
    tracksWeight: next.tracksWeight,
    ...(timed ? { logBy: 'time' as const } : {}),
    ...(next.cardioFields ? { cardioFields: next.cardioFields } : {}),
    ...(timed && old.targetDurationSec ? { targetDurationSec: old.targetDurationSec } : {}),
    ...(old.restSec ? { restSec: old.restSec } : {}),
    ...(old.supersetId ? { supersetId: old.supersetId } : {}),
    ...(old.notes ? { notes: old.notes } : {}),
    sets: timed
      ? [emptySet()]
      : old.sets.map((s) => ({
          key: newKey(),
          weightKg: 0,
          reps: 0,
          done: false,
          ...(s.targetReps ? { targetReps: s.targetReps } : {}),
          ...(s.warmup ? { warmup: true } : {}),
        })),
  } as WorkoutExercise
}

/** Previous-session (or previous-set) numbers shown greyed in empty timed fields. */
export interface TimedPlaceholders {
  durationSec?: number
  distanceKm?: number
  speedKmh?: number
  inclinePct?: number
  level?: number
}

/** The counted sets from the most recent session containing this exercise, with every field. */
export function lastSetsFull(workouts: Workout[], exerciseId: string): WorkoutSet[] {
  let best: Workout | undefined
  for (const w of workouts) {
    if (!w.exercises.some((e) => e.exerciseId === exerciseId)) continue
    if (!best || w.startedAt > best.startedAt) best = w
  }
  const ex = best?.exercises.find((e) => e.exerciseId === exerciseId)
  return ex ? ex.sets.filter((s) => s.done && !s.warmup) : []
}

/** Placeholders for timed set `i`: the previous set this session, else the same set last time. */
export function timedPlaceholders(ex: WorkoutExercise, i: number, last: WorkoutSet[]): TimedPlaceholders {
  const prev = [...ex.sets.slice(0, i)].reverse().find((s) => !s.warmup && (s.durationSec ?? 0) > 0)
  const src = prev ?? last[i] ?? last[last.length - 1]
  const out: TimedPlaceholders = {}
  const dur = last[i]?.durationSec ?? prev?.durationSec ?? ex.targetDurationSec
  if (dur) out.durationSec = dur
  if (src?.distanceKm) out.distanceKm = src.distanceKm
  if (src?.speedKmh) out.speedKmh = src.speedKmh
  if (src?.inclinePct) out.inclinePct = src.inclinePct
  if (src?.level) out.level = src.level
  return out
}

/** What an empty rep set should suggest: the previous working set today, else the same set last time. */
export function repSuggestion(
  ex: WorkoutExercise,
  i: number,
  last?: Array<{ weightKg: number; reps: number }>
): { weightKg: number; reps: number } | undefined {
  const prev = [...ex.sets.slice(0, i)].reverse().find((s) => s.reps > 0 && !s.warmup)
  if (prev) return { weightKg: prev.weightKg, reps: prev.reps }
  const l = last?.[i] ?? last?.[last.length - 1]
  return l ? { weightKg: l.weightKg, reps: l.reps } : undefined
}
