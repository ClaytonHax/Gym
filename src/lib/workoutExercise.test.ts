import { describe, expect, it } from 'vitest'
import {
  aimLabel,
  completeUnfinished,
  fmtMinutes,
  sessionDurationSec,
  stripKeys,
  unfinishedSummary,
  withKeys,
} from './workoutExercise'
import type { WorkoutExercise } from '../types'

const rower: WorkoutExercise = {
  exerciseId: 'row',
  name: 'Rowing',
  muscle: 'Cardio',
  tracksWeight: false,
  logBy: 'time',
  sets: [{ weightKg: 0, reps: 0, done: false, durationSec: 600 }],
}
const bench: WorkoutExercise = {
  exerciseId: 'bench',
  name: 'Bench',
  muscle: 'Chest',
  tracksWeight: true,
  sets: [
    { weightKg: 60, reps: 8, done: true },
    { weightKg: 60, reps: 8, done: false },
    { weightKg: 0, reps: 0, done: false },
  ],
}

describe('workoutExercise', () => {
  it('names exercises with typed-but-unticked sets', () => {
    expect(unfinishedSummary([rower, bench])).toEqual([
      { name: 'Rowing', count: 1 },
      { name: 'Bench', count: 1 },
    ])
  })

  it('marks them done without touching blank sets', () => {
    const [r, b] = completeUnfinished([rower, bench])
    expect(r.sets[0].done).toBe(true)
    expect(b.sets.map((s) => s.done)).toEqual([true, true, false])
  })

  it('freezes a running stopwatch', () => {
    const now = Date.parse('2026-01-01T10:05:00Z')
    const running = { ...rower, sets: [{ weightKg: 0, reps: 0, done: false, timerStartedAt: '2026-01-01T10:00:00Z' }] }
    const [r] = completeUnfinished([running], now)
    expect(r.sets[0].durationSec).toBe(300)
    expect(r.sets[0].timerStartedAt).toBeUndefined()
  })

  it('duration is at least the logged timed work', () => {
    const done = { ...rower, sets: [{ weightKg: 0, reps: 0, done: true, durationSec: 300 }] }
    const now = Date.parse('2026-01-01T10:00:56Z')
    expect(sessionDurationSec('2026-01-01T10:00:00Z', [done], now)).toBe(300)
    expect(sessionDurationSec('2026-01-01T09:00:00Z', [done], now)).toBe(3656)
  })

  it('formats aims in plain words', () => {
    expect(aimLabel([{ targetReps: '5-9' }, { targetReps: '5-9' }])).toBe('Aim: 5–9 reps')
    expect(aimLabel([{ targetReps: '10-12' }, { targetReps: 'failure' }])).toBe('Aim: 10–12 reps, then as many as you can')
    expect(aimLabel([{}])).toBeNull()
  })

  it('adds keys once and strips them for history', () => {
    const w = withKeys({ name: 'x', startedAt: 'a', exercises: [bench] })
    expect(withKeys(w)).toBe(w)
    const key = (w.exercises[0] as { key?: string }).key
    expect(key).toBeTruthy()
    const clean = stripKeys(w.exercises[0])
    expect('key' in clean).toBe(false)
    expect('key' in clean.sets[0]).toBe(false)
  })

  it('formats minutes', () => {
    expect(fmtMinutes(56 * 60)).toBe('56 min')
    expect(fmtMinutes(3900)).toBe('1 h 05 min')
    expect(fmtMinutes(30)).toBe('30 sec')
  })
})

import { repSuggestion, swapExercise, timedPlaceholders } from './workoutExercise'

describe('swap and suggestions', () => {
  it('swaps in place keeping set count, targets, rest and pairing', () => {
    const old: WorkoutExercise = {
      exerciseId: 'a',
      name: 'Leg press',
      muscle: 'Legs',
      tracksWeight: true,
      restSec: 120,
      supersetId: 'ss1',
      sets: [
        { weightKg: 100, reps: 10, done: true, targetReps: '8-10' },
        { weightKg: 100, reps: 10, done: true, targetReps: '8-10' },
        { weightKg: 0, reps: 0, done: false, targetReps: 'failure' },
      ],
    }
    const next = swapExercise(old, { id: 'b', name: 'Hack squat', muscle: 'Legs', tracksWeight: true })
    expect(next.exerciseId).toBe('b')
    expect(next.restSec).toBe(120)
    expect(next.supersetId).toBe('ss1')
    expect(next.sets.map((s) => [s.done, s.reps, s.targetReps])).toEqual([
      [false, 0, '8-10'],
      [false, 0, '8-10'],
      [false, 0, 'failure'],
    ])
  })

  it('suggests the previous working set, then last session', () => {
    const ex: WorkoutExercise = {
      exerciseId: 'a',
      name: 'x',
      muscle: 'Chest',
      tracksWeight: true,
      sets: [
        { weightKg: 50, reps: 5, done: true, warmup: true },
        { weightKg: 80, reps: 8, done: true },
        { weightKg: 0, reps: 0, done: false },
      ],
    }
    expect(repSuggestion(ex, 2, [{ weightKg: 1, reps: 1 }])).toEqual({ weightKg: 80, reps: 8 })
    expect(repSuggestion(ex, 0, [{ weightKg: 70, reps: 6 }])).toEqual({ weightKg: 70, reps: 6 })
    expect(repSuggestion(ex, 0, [])).toBeUndefined()
  })

  it('timed placeholders prefer the previous set today', () => {
    const ex: WorkoutExercise = {
      exerciseId: 't',
      name: 'Treadmill',
      muscle: 'Cardio',
      tracksWeight: false,
      logBy: 'time',
      sets: [
        { weightKg: 0, reps: 0, done: true, durationSec: 300, speedKmh: 8 },
        { weightKg: 0, reps: 0, done: false },
      ],
    }
    const last = [{ weightKg: 0, reps: 0, done: true, durationSec: 600, speedKmh: 6, inclinePct: 2 }]
    expect(timedPlaceholders(ex, 1, last)).toEqual({ durationSec: 300, speedKmh: 8 })
    expect(timedPlaceholders(ex, 0, last)).toEqual({ durationSec: 600, speedKmh: 6, inclinePct: 2 })
  })
})
