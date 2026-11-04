import { describe, expect, it } from 'vitest'
import { dayDiffers, exercisesToPlan } from './planDayDiff'
import type { PlanDay, WorkoutExercise } from '../types'

const bench = (targets: Array<string | undefined>, extra: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  exerciseId: 'bench',
  name: 'Bench',
  muscle: 'Chest',
  tracksWeight: true,
  sets: targets.map((t) => ({ weightKg: 60, reps: 8, done: true, ...(t ? { targetReps: t } : {}) })),
  ...extra,
})
const row: WorkoutExercise = {
  exerciseId: 'row',
  name: 'Rowing',
  muscle: 'Cardio',
  tracksWeight: false,
  logBy: 'time',
  targetDurationSec: 600,
  sets: [{ weightKg: 0, reps: 0, done: true, durationSec: 600 }],
}
const day = (exercises = exercisesToPlan([bench(['8-10', '8-10'])])): PlanDay => ({
  id: 'd',
  kind: 'workout',
  name: 'Push',
  exercises,
})

describe('exercisesToPlan', () => {
  it('skips warmups, keeps undone sets and drops undefined fields', () => {
    const ex = bench(['8-10', '8-10'])
    ex.sets.push({ weightKg: 0, reps: 0, done: false, targetReps: '6' }, { weightKg: 20, reps: 10, done: true, warmup: true })
    const [p] = exercisesToPlan([ex])
    expect(p.targets).toEqual(['8-10', '8-10', '6'])
    expect('restSec' in p).toBe(false)
  })
  it('maps timed exercises with no targets', () => {
    const [p] = exercisesToPlan([row])
    expect(p).toMatchObject({ logBy: 'time', targets: [], targetDurationSec: 600 })
  })
})

describe('dayDiffers', () => {
  it('is false when only weights and reps done differ', () => {
    const ex = bench(['8-10', '8-10'])
    ex.sets[0].weightKg = 100
    expect(dayDiffers(day(), [ex])).toBe(false)
  })
  it('detects changed targets and set counts', () => {
    expect(dayDiffers(day(), [bench(['6-8', '8-10'])])).toBe(true)
    expect(dayDiffers(day(), [bench(['8-10'])])).toBe(true)
  })
  it('detects added, removed and reordered exercises', () => {
    const two = day(exercisesToPlan([bench(['8']), row]))
    expect(dayDiffers(two, [bench(['8']), row])).toBe(false)
    expect(dayDiffers(two, [row, bench(['8'])])).toBe(true)
    expect(dayDiffers(two, [bench(['8'])])).toBe(true)
  })
  it('treats legacy set counts as blank targets', () => {
    const legacy = day([{ exerciseId: 'bench', name: 'Bench', muscle: 'Chest', tracksWeight: true, targets: undefined as unknown as string[], sets: 2 }])
    expect(dayDiffers(legacy, [bench([undefined, undefined])])).toBe(false)
  })
})
