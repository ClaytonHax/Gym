import type { MuscleGroup, Workout } from '../types'

export type RecoveryState = 'fresh' | 'recovering' | 'untrained'

export interface MuscleRecovery {
  muscle: MuscleGroup
  hoursSince: number | null
  state: RecoveryState
}

const TRACKED: MuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core']

/** Large muscles take longer to recover; the usual 48–72h rule of thumb. */
const RECOVERY_HOURS: Partial<Record<MuscleGroup, number>> = {
  Legs: 72,
  Back: 60,
  Chest: 48,
  Glutes: 60,
  Shoulders: 48,
  Biceps: 36,
  Triceps: 36,
  Core: 24,
}

/** Rule-based readiness per muscle group, from how long ago it was last worked. */
export function muscleRecovery(workouts: Workout[], now = Date.now()): MuscleRecovery[] {
  const last = new Map<MuscleGroup, number>()
  for (const w of workouts) {
    const t = new Date(w.startedAt).getTime()
    for (const ex of w.exercises) {
      if (!ex.sets.some((s) => s.done && !s.warmup)) continue
      if (t > (last.get(ex.muscle) ?? 0)) last.set(ex.muscle, t)
    }
  }
  return TRACKED.map((muscle) => {
    const t = last.get(muscle)
    if (!t) return { muscle, hoursSince: null, state: 'untrained' as const }
    const hoursSince = (now - t) / 3_600_000
    return {
      muscle,
      hoursSince,
      state: hoursSince >= (RECOVERY_HOURS[muscle] ?? 48) ? ('fresh' as const) : ('recovering' as const),
    }
  })
}
