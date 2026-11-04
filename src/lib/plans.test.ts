import { describe, expect, it } from 'vitest'
import { cloneDay, cloneDays } from './plans'
import type { PlanDay } from '../types'

const day: PlanDay = {
  id: 'd1',
  kind: 'workout',
  name: 'Push',
  exercises: [
    { exerciseId: 'bench', name: 'Bench', muscle: 'Chest', tracksWeight: true, targets: ['8-10', '8-10'], restSec: 90 },
  ],
}

describe('cloneDay', () => {
  it('gets a new id and a (copy) suffix', () => {
    const c = cloneDay(day)
    expect(c.id).not.toBe(day.id)
    expect(c.name).toBe('Push (copy)')
  })
  it('deep copies exercises and targets', () => {
    const c = cloneDay(day)
    expect(c.exercises).toEqual(day.exercises)
    expect(c.exercises[0]).not.toBe(day.exercises[0])
    c.exercises[0].targets.push('12')
    expect(day.exercises[0].targets).toHaveLength(2)
  })
  it('keeps rest day names', () => {
    const rest: PlanDay = { id: 'r', kind: 'rest', name: 'Rest', exercises: [] }
    expect(cloneDay(rest).name).toBe('Rest')
  })
  it('cloneDays keeps names', () => {
    expect(cloneDays([day])[0].name).toBe('Push')
  })
})
