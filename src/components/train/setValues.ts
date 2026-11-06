import { repSuggestion } from '../../lib/workoutExercise'
import { effectiveKg, isAssisted } from '../../lib/assisted'
import type { WorkoutExercise } from '../../types'

/**
 * What the current-set panel shows for set `i`: what was typed, else the suggestion
 * (previous set / last session) or the plan's numeric target. Logging commits these
 * same numbers when the person never touched the steppers.
 */
export interface ShownValues {
  reps: number
  weightKg: number
  repsSuggested: boolean
  weightSuggested: boolean
  /** Assisted exercises only. */
  assistKg?: number
  assistSuggested?: boolean
  bodyKg?: number | null
}

export function shownValues(
  ex: WorkoutExercise,
  i: number,
  lastSets?: Array<{ weightKg: number; reps: number; assistKg?: number }>,
  bodyKg?: number | null
): ShownValues {
  const set = ex.sets[i]
  const suggestion = repSuggestion(ex, i, lastSets)
  if (isAssisted(ex)) {
    const suggestedReps = suggestion?.reps || (/^\d+$/.test(set?.targetReps ?? '') ? Number(set.targetReps) : 0)
    const body = set.done && set.bodyweightKg ? set.bodyweightKg : (bodyKg ?? set.bodyweightKg ?? null)
    const assistKg = set.assistKg ?? suggestion?.assistKg ?? 0
    return {
      reps: set.reps || suggestedReps,
      weightKg: body ? effectiveKg(body, assistKg) : 0,
      repsSuggested: set.reps === 0 && suggestedReps > 0,
      weightSuggested: false,
      assistKg,
      assistSuggested: set.assistKg === undefined && (suggestion?.assistKg ?? 0) > 0,
      bodyKg: body,
    }
  }
  const planReps = /^\d+$/.test(set?.targetReps ?? '') ? Number(set.targetReps) : 0
  const suggestedReps = suggestion?.reps || planReps
  const suggestedKg = ex.tracksWeight ? suggestion?.weightKg || 0 : 0
  return {
    reps: set.reps || suggestedReps,
    weightKg: set.weightKg || suggestedKg,
    repsSuggested: set.reps === 0 && suggestedReps > 0,
    weightSuggested: set.weightKg === 0 && suggestedKg > 0,
  }
}
