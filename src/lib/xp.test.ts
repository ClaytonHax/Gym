import { describe, expect, it } from 'vitest'
import type { Workout, WorkoutExercise, WorkoutSet } from '../types'
import { exercisesXp, levelFor, levelUp, setXp, workoutXp, xpHistory } from './xp'

const set = (o: Partial<WorkoutSet> = {}): WorkoutSet => ({
  weightKg: 100,
  reps: 5,
  done: true,
  ...o,
})

const bench = (sets: WorkoutSet[]): WorkoutExercise => ({
  exerciseId: 'bench',
  name: 'Bench',
  muscle: 'Chest',
  tracksWeight: true,
  sets,
})

const workout = (id: string, startedAt: string, exercises: WorkoutExercise[]): Workout =>
  ({
    id,
    name: 'Session',
    startedAt,
    durationSec: 3600,
    exercises,
    totalVolumeKg: 0,
    setCount: 0,
  }) as Workout

describe('setXp', () => {
  it('pays 10 for a working set, 3 for a warm-up, 0 when not done', () => {
    expect(setXp({ done: true })).toBe(10)
    expect(setXp({ done: true, warmup: true })).toBe(3)
    expect(setXp({ done: false })).toBe(0)
    expect(setXp({ done: false, warmup: true })).toBe(0)
  })
})

describe('exercisesXp and workoutXp', () => {
  it('gives the exercise bonus only when every set is done', () => {
    expect(exercisesXp([bench([set(), set()])])).toBe(20 + 20)
    expect(exercisesXp([bench([set(), set({ done: false })])])).toBe(10)
  })

  it('does not award the exercise bonus for an exercise with no sets', () => {
    expect(exercisesXp([bench([])])).toBe(0)
  })

  it('adds PR bonuses and the finish bonus only in workoutXp', () => {
    const w = workout('a', '2026-01-01T10:00:00Z', [bench([set()])])
    expect(exercisesXp(w.exercises, 2)).toBe(10 + 20 + 80)
    expect(workoutXp(w)).toBe(10 + 20 + 50)
    expect(workoutXp(w, 1)).toBe(10 + 20 + 40 + 50)
  })
})

describe('xpHistory', () => {
  it('does not count the first-ever session as a PR', () => {
    const h = xpHistory([workout('a', '2026-01-01T10:00:00Z', [bench([set()])])])
    expect(h.prsByWorkout.get('a')).toBe(0)
    expect(h.byWorkout.get('a')).toBe(10 + 20 + 50)
  })

  it('detects a PR only when the estimate beats the previous best', () => {
    const w1 = workout('1', '2026-01-01T10:00:00Z', [bench([set()])])
    const w2 = workout('2', '2026-01-02T10:00:00Z', [bench([set()])]) // same load, no PR
    const w3 = workout('3', '2026-01-03T10:00:00Z', [bench([set({ weightKg: 105 })])]) // PR
    const h = xpHistory([w3, w1, w2]) // newest-first input must still walk oldest first
    expect(h.prsByWorkout.get('1')).toBe(0)
    expect(h.prsByWorkout.get('2')).toBe(0)
    expect(h.prsByWorkout.get('3')).toBe(1)
    expect(h.byWorkout.get('3')).toBe(10 + 20 + 40 + 50)
    expect(h.total).toBe(80 + 80 + 120)
  })

  it('counts at most one PR per exercise per workout', () => {
    const w1 = workout('1', '2026-01-01T10:00:00Z', [bench([set()])])
    const w2 = workout('2', '2026-01-02T10:00:00Z', [
      bench([set({ weightKg: 110 })]),
      bench([set({ weightKg: 120 })]),
    ])
    expect(xpHistory([w1, w2]).prsByWorkout.get('2')).toBe(1)
  })

  it('ignores timed exercises and exercises without weight for PRs', () => {
    const run: WorkoutExercise = {
      ...bench([set({ durationSec: 600 })]),
      exerciseId: 'run',
      logBy: 'time',
    }
    const w1 = workout('1', '2026-01-01T10:00:00Z', [run])
    const w2 = workout('2', '2026-01-02T10:00:00Z', [{ ...run, sets: [set({ durationSec: 1200 })] }])
    expect(xpHistory([w1, w2]).prsByWorkout.get('2')).toBe(0)
  })
})

describe('levelFor', () => {
  it('starts at level 1 with 0 XP', () => {
    expect(levelFor(0)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      levelSize: 150,
      totalForNext: 150,
      progress: 0,
    })
  })

  it('moves to the next level exactly at the boundary', () => {
    expect(levelFor(149).level).toBe(1)
    expect(levelFor(150).level).toBe(2)
    // Level 2 costs 225, so level 3 starts at 375.
    expect(levelFor(374).level).toBe(2)
    expect(levelFor(375)).toMatchObject({ level: 3, xpIntoLevel: 0, levelSize: 300, totalForNext: 675 })
  })

  it('reports progress through the current level', () => {
    const info = levelFor(150 + 113)
    expect(info.level).toBe(2)
    expect(info.xpIntoLevel).toBe(113)
    expect(info.progress).toBeCloseTo(113 / 225)
  })
})

describe('levelUp', () => {
  it('returns the new level only when a boundary is crossed', () => {
    expect(levelUp(0, 100)).toBeNull()
    expect(levelUp(100, 150)).toBe(2)
    expect(levelUp(100, 400)).toBe(3)
    expect(levelUp(400, 401)).toBeNull()
  })
})
