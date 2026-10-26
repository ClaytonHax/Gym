import { repSuggestion } from '../../lib/workoutExercise'
import type { WorkoutExercise } from '../../types'

/**
 * What the current-set panel shows for set `i`: what was typed, else the suggestion
 * (previous set / last session) or the plan's numeric target. Logging commits these
 * same numbers when the person never touched the steppers.
 */
export function shownValues(ex: WorkoutExercise, i: number, lastSets?: Array<{ weightKg: number; reps: number }>) {
  const set = ex.sets[i]
  const suggestion = repSuggestion(ex, i, lastSets)
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
