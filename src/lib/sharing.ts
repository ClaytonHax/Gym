import type { BodyEntry, LogMode, MuscleGroup, Profile, Workout, WorkoutExercise, WorkoutSet } from '../types'
import { dayKey } from './date'
import { muscleBalance, personalRecords, weeklyVolume } from './stats'

/** Workouts newer than this are mirrored for friends when "Workouts in depth" is on. */
export const SHARED_WORKOUT_DAYS = 30

export interface SharedSet {
  weightKg: number
  reps: number
  warmup?: boolean
  rpe?: number
  durationSec?: number
  distanceKm?: number
  speedKmh?: number
  inclinePct?: number
  level?: number
}

export interface SharedExercise {
  exerciseId: string
  name: string
  muscle: MuscleGroup
  tracksWeight: boolean
  logBy?: LogMode
  sets: SharedSet[]
}

export interface SharedWorkout {
  name: string
  planDayName?: string
  startedAt: string
  durationSec: number
  totalVolumeKg: number
  setCount: number
  exercises: SharedExercise[]
  /** Hash of everything above, used to skip unchanged writes. */
  fp: string
}

export interface StatsDetail {
  asOf: string
  records: Array<{ name: string; muscle: MuscleGroup; bestWeightKg: number; bestReps: number; e1rmKg: number; date: string }>
  weeklyVolume: Array<{ date: string; value: number }>
  muscleSets: Array<{ muscle: string; sets: number }>
}

export interface ProfileDetail {
  heightCm?: number
  bodyWeightKg?: number
  bodyFatPct?: number
  goalWeightKg?: number
  weeklyGoal: number
  planName?: string
}

/** Small, stable string hash (djb2). Not security, just change detection. */
export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function pickSet(s: WorkoutSet): SharedSet {
  // Explicit whitelist. Never spread: assistKg / bodyweightKg would reveal body weight.
  const out: SharedSet = { weightKg: s.weightKg, reps: s.reps }
  if (s.warmup) out.warmup = true
  if (s.rpe) out.rpe = s.rpe
  if (s.durationSec) out.durationSec = s.durationSec
  if (s.distanceKm) out.distanceKm = s.distanceKm
  if (s.speedKmh) out.speedKmh = s.speedKmh
  if (s.inclinePct) out.inclinePct = s.inclinePct
  if (s.level) out.level = s.level
  return out
}

function pickExercise(e: WorkoutExercise): SharedExercise | null {
  const sets = e.sets.filter((s) => s.done).map(pickSet)
  if (sets.length === 0) return null
  const out: SharedExercise = {
    exerciseId: e.exerciseId,
    name: e.name,
    muscle: e.muscle,
    tracksWeight: e.tracksWeight,
    sets,
  }
  if (e.logBy) out.logBy = e.logBy
  return out
}

export function buildSharedWorkout(w: Workout): SharedWorkout {
  const exercises = w.exercises.map(pickExercise).filter((e): e is SharedExercise => e !== null)
  const body: Omit<SharedWorkout, 'fp'> = {
    name: w.name,
    startedAt: w.startedAt,
    durationSec: w.durationSec,
    totalVolumeKg: w.totalVolumeKg,
    setCount: w.setCount,
    exercises,
  }
  if (w.planDayName) body.planDayName = w.planDayName
  return { ...body, fp: hashString(JSON.stringify(body)) }
}

export function buildStatsDetail(workouts: Workout[], now = new Date()): StatsDetail {
  return {
    asOf: now.toISOString(),
    records: personalRecords(workouts)
      .slice(0, 20)
      .map((r) => ({
        name: r.name,
        muscle: r.muscle,
        bestWeightKg: r.bestWeightKg,
        bestReps: r.bestReps,
        e1rmKg: r.estimated1rmKg,
        date: dayKey(new Date(r.date)),
      })),
    weeklyVolume: weeklyVolume(workouts, 12).map((p) => ({ date: p.date, value: Math.round(p.value) })),
    muscleSets: muscleBalance(workouts, 30).map((m) => ({ muscle: m.muscle, sets: m.sets })),
  }
}

export function buildProfileDetail(
  profile: Pick<Profile, 'heightCm' | 'goalWeightKg' | 'weeklyGoal'>,
  latestBody: Pick<BodyEntry, 'weightKg' | 'bodyFatPct'> | null | undefined,
  planName?: string | null
): ProfileDetail {
  const out: ProfileDetail = { weeklyGoal: profile.weeklyGoal }
  if (profile.heightCm) out.heightCm = profile.heightCm
  if (latestBody?.weightKg) out.bodyWeightKg = latestBody.weightKg
  if (latestBody?.bodyFatPct) out.bodyFatPct = latestBody.bodyFatPct
  if (profile.goalWeightKg) out.goalWeightKg = profile.goalWeightKg
  if (planName) out.planName = planName
  return out
}
