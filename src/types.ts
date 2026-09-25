export type Unit = 'kg' | 'lb'

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Legs'
  | 'Glutes'
  | 'Core'
  | 'Cardio'
  | 'Other'

export interface Exercise {
  id: string
  name: string
  muscle: MuscleGroup
  equipment?: string
  /** Bodyweight / cardio moves are logged as reps or time only. */
  tracksWeight: boolean
  custom?: boolean
}

export interface WorkoutSet {
  /** Always stored in kilograms; converted at the edges for display. */
  weightKg: number
  reps: number
  done: boolean
  /** Rate of perceived exertion, 6–10. */
  rpe?: number
  warmup?: boolean
}

export interface WorkoutExercise {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  tracksWeight: boolean
  sets: WorkoutSet[]
  notes?: string
}

export interface Workout {
  id: string
  name: string
  /** ISO timestamps — sortable as strings and safe to cache offline. */
  startedAt: string
  finishedAt?: string
  durationSec: number
  exercises: WorkoutExercise[]
  notes?: string
  /** Denormalised so history and charts never have to re-reduce every set. */
  totalVolumeKg: number
  setCount: number
}

/** A workout still being performed — one per user, kept in Firestore + localStorage. */
export interface ActiveWorkout {
  name: string
  startedAt: string
  exercises: WorkoutExercise[]
  notes?: string
}

export interface BodyEntry {
  id: string
  /** yyyy-mm-dd, one entry per day. */
  date: string
  weightKg: number
  bodyFatPct?: number
  notes?: string
}

export interface Profile {
  displayName: string
  unit: Unit
  theme: 'dark' | 'light' | 'system'
  heightCm?: number
  goalWeightKg?: number
  weeklyGoal: number
}

export interface PersonalRecord {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  bestWeightKg: number
  bestReps: number
  estimated1rmKg: number
  date: string
}
