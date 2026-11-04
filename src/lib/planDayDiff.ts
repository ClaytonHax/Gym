import { isTimed } from './logMode'
import type { PlanDay, PlanExercise, WorkoutExercise } from '../types'

/** Firestore rejects `undefined` fields, so cleared optionals must be dropped, not set. */
function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/**
 * The prescription a session amounts to: one entry per exercise, with a rep target per
 * working set (done or not). Used to save a session as a routine or back into a plan day.
 */
export function exercisesToPlan(exercises: WorkoutExercise[]): PlanExercise[] {
  return exercises.map((ex) =>
    dropUndefined({
      exerciseId: ex.exerciseId,
      name: ex.name,
      muscle: ex.muscle,
      tracksWeight: ex.tracksWeight,
      ...(isTimed(ex)
        ? {
            logBy: 'time' as const,
            targets: [],
            targetDurationSec: ex.targetDurationSec,
            cardioFields: ex.cardioFields,
          }
        : { targets: ex.sets.filter((s) => !s.warmup).map((s) => s.targetReps ?? '') }),
      restSec: ex.restSec,
      supersetId: ex.supersetId,
    })
  )
}

function planTargets(p: PlanExercise): string[] {
  return (p.targets ?? Array.from({ length: p.sets ?? 3 }, () => '')).map((t) => t.trim())
}

/** True when the session's exercises, order or rep targets differ from the plan day. Weights and reps done are ignored. */
export function dayDiffers(planDay: PlanDay, exercises: WorkoutExercise[]): boolean {
  const now = exercisesToPlan(exercises)
  const was = planDay.exercises
  if (now.length !== was.length) return true
  return now.some((n, i) => {
    const p = was[i]
    if (n.exerciseId !== p.exerciseId) return true
    if (n.logBy === 'time' || p.logBy === 'time') {
      return n.logBy !== p.logBy || (n.targetDurationSec ?? 0) !== (p.targetDurationSec ?? 0)
    }
    const a = planTargets(n)
    const b = planTargets(p)
    return a.length !== b.length || a.some((t, k) => t !== b[k])
  })
}
