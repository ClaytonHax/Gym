import { useMemo } from 'react'
import { useWorkouts } from './useWorkouts'
import { levelFor, xpHistory } from '../lib/xp'
import { personalRecords } from '../lib/stats'
import { dayKey } from '../lib/date'

/** XP, level and PR records derived from saved workout history. */
export function useXp() {
  const { workouts } = useWorkouts()
  return useMemo(() => {
    const history = xpHistory(workouts)
    const today = dayKey()
    let todayXp = 0
    for (const w of workouts) {
      if (dayKey(new Date(w.startedAt)) === today) todayXp += history.byWorkout.get(w.id) ?? 0
    }
    return {
      total: history.total,
      level: levelFor(history.total),
      byWorkout: history.byWorkout,
      prsByWorkout: history.prsByWorkout,
      todayXp,
      // Same shape WorkoutActive builds today: exerciseId -> best estimated 1RM.
      records: new Map(personalRecords(workouts).map((r) => [r.exerciseId, r.estimated1rmKg])),
    }
  }, [workouts])
}
