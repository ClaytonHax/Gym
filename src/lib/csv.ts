import type { Workout } from '../types'

function cell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per set, in the shape Strong/Hevy export so it imports elsewhere. Weights in kg. */
export function workoutsToCsv(workouts: Workout[]): string {
  const rows = [['Date', 'Workout', 'Exercise', 'Set', 'Weight (kg)', 'Reps', 'Duration (s)', 'Distance (km)', 'RPE', 'Warm-up', 'Notes']]
  for (const w of [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) => {
        if (!s.done) return
        rows.push([
          w.startedAt,
          w.name,
          ex.name,
          String(i + 1),
          String(Math.round(s.weightKg * 100) / 100),
          String(s.reps),
          s.durationSec ? String(s.durationSec) : '',
          s.distanceKm ? String(Math.round(s.distanceKm * 1000) / 1000) : '',
          s.rpe ? String(s.rpe) : '',
          s.warmup ? 'yes' : '',
          ex.notes ?? '',
        ])
      })
    }
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n')
}
