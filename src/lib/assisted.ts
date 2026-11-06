import { isTimed } from './logMode'
import type { WorkoutExercise, WorkoutSet } from '../types'

/** Assisted machine exercises. Id-based so plans, routines and repeats need no extra flag. */
export function isAssisted(e: { exerciseId?: string }): boolean {
  return e.exerciseId === 'assisted-pull-up'
}

/** What you actually lift: body weight minus the machine's help, never below zero. */
export function effectiveKg(bodyKg: number, assistKg: number): number {
  return Math.max(0, bodyKg - assistKg)
}

/** The set fields for an assisted set. weightKg stays the effective weight so stats work unchanged. */
export function assistedPatch(bodyKg: number, assistKg: number) {
  return { assistKg, bodyweightKg: bodyKg, weightKg: effectiveKg(bodyKg, assistKg) }
}

/**
 * Finished assisted sets that never got a body weight (e.g. saved via "save them as done")
 * get today's. Returns the same array when nothing changes.
 */
export function settleAssisted(exercises: WorkoutExercise[], bodyKg: number | null): WorkoutExercise[] {
  if (bodyKg === null) return exercises
  let changed = false
  const out = exercises.map((e) => {
    if (!isAssisted(e) || isTimed(e)) return e
    if (!e.sets.some((s) => s.done && !s.bodyweightKg)) return e
    changed = true
    return {
      ...e,
      sets: e.sets.map((s): WorkoutSet =>
        s.done && !s.bodyweightKg ? { ...s, ...assistedPatch(bodyKg, s.assistKg ?? 0) } : s
      ),
    }
  })
  return changed ? out : exercises
}
