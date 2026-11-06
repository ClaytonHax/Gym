import { describe, expect, it } from 'vitest'
import { buildProfileDetail, buildSharedWorkout, buildStatsDetail, hashString } from './sharing'
import type { Workout } from '../types'

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: 'w1',
  name: 'Pull day',
  startedAt: '2025-03-03T10:00:00.000Z',
  finishedAt: '2025-03-03T11:00:00.000Z',
  durationSec: 3600,
  totalVolumeKg: 1000,
  setCount: 3,
  notes: 'SECRET-WORKOUT-NOTE',
  caloriesKcal: 321,
  planDayName: 'Pull',
  exercises: [
    {
      exerciseId: 'assisted-pull-up',
      name: 'Assisted Pull-Up',
      muscle: 'Back',
      tracksWeight: true,
      notes: 'SECRET-EXERCISE-NOTE',
      sets: [
        { weightKg: 50, reps: 8, done: true, assistKg: 30, bodyweightKg: 80, rpe: 8, timerStartedAt: '2024-01-01T00:00:00Z' },
        { weightKg: 50, reps: 6, done: false, assistKg: 30, bodyweightKg: 80 },
        { weightKg: 20, reps: 10, done: true, warmup: true },
      ],
    },
    { exerciseId: 'x', name: 'Skipped', muscle: 'Chest', tracksWeight: true, sets: [{ weightKg: 10, reps: 5, done: false }] },
  ],
  ...over,
})

describe('buildSharedWorkout', () => {
  const shared = buildSharedWorkout(workout())
  const json = JSON.stringify(shared)

  it('leaves out private fields', () => {
    for (const banned of ['SECRET', 'notes', 'assistKg', 'bodyweightKg', 'timerStartedAt', 'caloriesKcal', 'done', 'targetReps']) {
      expect(json).not.toContain(banned)
    }
  })

  it('keeps only done sets and drops empty exercises', () => {
    expect(shared.exercises).toHaveLength(1)
    expect(shared.exercises[0].sets).toHaveLength(2)
    expect(shared.exercises[0].sets[0]).toEqual({ weightKg: 50, reps: 8, rpe: 8 })
    expect(shared.exercises[0].sets[1].warmup).toBe(true)
    expect(shared.planDayName).toBe('Pull')
  })

  it('has a stable fingerprint that changes with content', () => {
    expect(buildSharedWorkout(workout()).fp).toBe(shared.fp)
    expect(buildSharedWorkout(workout({ name: 'Other' })).fp).not.toBe(shared.fp)
    expect(hashString('a')).toBe(hashString('a'))
  })
})

describe('buildStatsDetail', () => {
  it('limits records to 20 and weekly volume to 12 weeks', () => {
    const exercises = Array.from({ length: 30 }, (_, i) => ({
      exerciseId: `e${i}`,
      name: `E${i}`,
      muscle: 'Chest' as const,
      tracksWeight: true,
      sets: [{ weightKg: 10 + i, reps: 5, done: true }],
    }))
    const d = buildStatsDetail([workout({ exercises, startedAt: new Date().toISOString() })])
    expect(d.records).toHaveLength(20)
    expect(d.records[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(d.weeklyVolume).toHaveLength(12)
    expect(d.muscleSets[0].muscle).toBe('Chest')
  })
})

describe('buildProfileDetail', () => {
  it('only exposes the whitelisted fields', () => {
    const d = buildProfileDetail(
      { heightCm: 180, goalWeightKg: 75, weeklyGoal: 4, displayName: 'Secret', restWeekdays: [1], theme: 'dark' } as never,
      { weightKg: 80, bodyFatPct: 15 },
      'PPL'
    )
    expect(d).toEqual({ heightCm: 180, bodyWeightKg: 80, bodyFatPct: 15, goalWeightKg: 75, weeklyGoal: 4, planName: 'PPL' })
  })
  it('omits missing values', () => {
    expect(buildProfileDetail({ weeklyGoal: 3 }, null, null)).toEqual({ weeklyGoal: 3 })
  })
})
