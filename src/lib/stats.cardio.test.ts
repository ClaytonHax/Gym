import { describe, expect, it } from 'vitest'
import { BUILTIN_EXERCISES, matchesExercise } from '../data/exercises'
import { niceTicks } from './stats'

describe('exercise search', () => {
  const find = (q: string) => BUILTIN_EXERCISES.filter((e) => matchesExercise(e, q)).map((e) => e.id)
  it('finds cardio by alias and ignores punctuation/case', () => {
    expect(find('bike')).toContain('cycling')
    expect(find('Cross-Trainer')).toContain('elliptical')
    expect(find('walk')).toContain('treadmill')
  })
})

describe('niceTicks', () => {
  it('returns unique ascending ticks', () => {
    const t = niceTicks(2100)
    expect(new Set(t).size).toBe(t.length)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(2100)
  })
})
