import { describe, expect, it } from 'vitest'
import { estimateCalories, setMet, treadmillMet } from './calories'
import type { WorkoutExercise } from '../types'

const timed = (name: string, sets: WorkoutExercise['sets']): WorkoutExercise => ({
  exerciseId: name,
  name,
  muscle: 'Cardio',
  tracksWeight: false,
  logBy: 'time',
  sets,
})

describe('calories', () => {
  it('uses the ACSM walking equation with incline', () => {
    expect(treadmillMet(5.5, 0)).toBeCloseTo(3.62, 1)
    expect(treadmillMet(5.5, 6)).toBeGreaterThan(treadmillMet(5.5, 0) + 2)
  })

  it('raises bike MET with the level setting', () => {
    const bike = timed('Weighted bike', [])
    expect(setMet(bike, { weightKg: 0, reps: 0, done: true, level: 8 })).toBeGreaterThan(
      setMet(bike, { weightKg: 0, reps: 0, done: true, level: 2 })
    )
  })

  it('estimates a 50-minute cardio session for a 98 kg person', () => {
    const kcal = estimateCalories(
      {
        durationSec: 3000,
        exercises: [
          timed('Treadmill', [{ weightKg: 0, reps: 0, done: true, durationSec: 1200, speedKmh: 5.5, inclinePct: 6 }]),
          timed('Rowing Machine', [{ weightKg: 0, reps: 0, done: true, durationSec: 600 }]),
          timed('Weighted bike', [{ weightKg: 0, reps: 0, done: true, durationSec: 900, level: 8 }]),
          timed('Cross trainer', [{ weightKg: 0, reps: 0, done: false, durationSec: 600 }]),
        ],
      },
      98
    )
    expect(kcal).toBeGreaterThan(400)
    expect(kcal).toBeLessThan(800)
  })

  it('counts leftover session time as strength work only when there were rep sets', () => {
    const lift: WorkoutExercise = {
      exerciseId: 'bp',
      name: 'Bench Press',
      muscle: 'Chest',
      tracksWeight: true,
      sets: [{ weightKg: 60, reps: 10, done: true }],
    }
    expect(estimateCalories({ durationSec: 3600, exercises: [lift] }, 80)).toBe(320)
    expect(estimateCalories({ durationSec: 3600, exercises: [] }, 80)).toBe(0)
  })
})
