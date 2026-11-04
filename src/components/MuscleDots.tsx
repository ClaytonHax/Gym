import { MUSCLE_COLORS } from '../data/exercises'
import type { PlanExercise } from '../types'

/** Small dots, one per distinct muscle, for a compact "what's in this" row. */
export function MuscleDots({ exercises, className = '' }: { exercises: PlanExercise[]; className?: string }) {
  const muscles = [...new Set(exercises.map((e) => e.muscle))].slice(0, 6)
  return (
    <span className={`flex gap-1 ${className}`} aria-hidden>
      {muscles.map((m) => (
        <span key={m} className="size-2.5 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[m] }} />
      ))}
    </span>
  )
}
