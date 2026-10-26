import type { Workout, WorkoutExercise, WorkoutSet } from '../types'
import { estimate1rm } from './stats'
import { isTimed } from './logMode'

/** Every number that feeds XP lives here so the rules read in one place. */
export const XP_RULES = { set: 10, warmup: 3, exercise: 20, finish: 50, pr: 40 } as const

/** XP for one completed set (0 if not done). Warm-ups 3, working sets 10. */
export function setXp(set: Pick<WorkoutSet, 'done' | 'warmup'>): number {
  if (!set.done) return 0
  return set.warmup ? XP_RULES.warmup : XP_RULES.set
}

/**
 * XP for a list of exercises: sets + a bonus per fully-done exercise + a bonus
 * per PR. No finish bonus — that's added by workoutXp.
 */
export function exercisesXp(exercises: WorkoutExercise[], prCount = 0): number {
  let total = 0
  for (const ex of exercises) {
    for (const s of ex.sets) total += setXp(s)
    // An exercise only counts as complete when every set is done, so skipping one forfeits the bonus.
    if (ex.sets.length > 0 && ex.sets.every((s) => s.done)) total += XP_RULES.exercise
  }
  return total + prCount * XP_RULES.pr
}

/** Saved workout XP = exercisesXp + finish bonus. */
export function workoutXp(w: Pick<Workout, 'exercises'>, prCount = 0): number {
  return exercisesXp(w.exercises, prCount) + XP_RULES.finish
}

/** Best estimated 1RM per exercise for one workout's weighted, non-timed sets. */
function bestEstimatesOf(exercises: WorkoutExercise[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const ex of exercises) {
    if (!ex.tracksWeight || isTimed(ex)) continue
    for (const s of ex.sets) {
      if (!s.done || s.warmup) continue
      const est = estimate1rm(s.weightKg, s.reps)
      if (est > (best.get(ex.exerciseId) ?? 0)) best.set(ex.exerciseId, est)
    }
  }
  return best
}

/**
 * Walk history oldest → newest. A PR is an exercise whose best estimated 1RM in
 * a workout beats the best seen before. The first-ever session is not a PR,
 * because there is nothing to beat yet.
 */
export function xpHistory(workouts: Workout[]): {
  total: number
  byWorkout: Map<string, number>
  prsByWorkout: Map<string, number>
} {
  const sorted = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const seenBest = new Map<string, number>()
  const byWorkout = new Map<string, number>()
  const prsByWorkout = new Map<string, number>()
  let total = 0

  for (const w of sorted) {
    let prs = 0
    // Compare once per exercise per workout, so a duplicated exercise can't earn two PRs.
    for (const [exerciseId, est] of bestEstimatesOf(w.exercises)) {
      const prev = seenBest.get(exerciseId)
      if (prev !== undefined && est > prev + 0.01) prs++
      if (prev === undefined || est > prev) seenBest.set(exerciseId, est)
    }
    const xp = workoutXp(w, prs)
    byWorkout.set(w.id, xp)
    prsByWorkout.set(w.id, prs)
    total += xp
  }
  return { total, byWorkout, prsByWorkout }
}

export interface LevelInfo {
  level: number
  xpIntoLevel: number
  levelSize: number
  /** Cumulative XP at which the next level starts. */
  totalForNext: number
  /** 0..1 through the current level. */
  progress: number
}

/** XP needed to go from `level` to `level + 1`. */
function costOfLevel(level: number): number {
  return 150 + 75 * (level - 1)
}

/** Level 1 starts at 0. Level n → n+1 costs 150 + 75*(n-1) XP. */
export function levelFor(totalXp: number): LevelInfo {
  const total = Math.max(0, totalXp)
  let level = 1
  let start = 0
  // Levels are short and the cost grows linearly, so a walk is plenty fast here.
  while (total >= start + costOfLevel(level)) {
    start += costOfLevel(level)
    level++
  }
  const levelSize = costOfLevel(level)
  const xpIntoLevel = total - start
  return {
    level,
    xpIntoLevel,
    levelSize,
    totalForNext: start + levelSize,
    progress: xpIntoLevel / levelSize,
  }
}

/** Did going from `before` to `after` cross one or more levels? Returns the new level or null. */
export function levelUp(before: number, after: number): number | null {
  const next = levelFor(after).level
  return next > levelFor(before).level ? next : null
}
