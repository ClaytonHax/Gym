import { describe, expect, it } from 'vitest'
import { cloneDay, cloneDays, scheduleFor } from './plans'
import { nextWorkoutSlot } from './planUiLogic'
import type { ActivePlanState, Plan, PlanDay } from '../types'

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

describe('always-rest weekdays', () => {
  const plan = { id: 'p', name: 'P', days: [{ ...day, name: 'Push 1' }, { ...day, id: 'd2', name: 'Push 2' }], createdAt: '', updatedAt: '' } as Plan
  // 2026-11-07 is a Saturday, so Sunday the 8th lands on day 2 (Push 2).
  const state: ActivePlanState = { planId: 'p', startDate: '2026-11-07', adjustments: [] }
  const SUNDAY = 6
  const now = new Date(2026, 10, 8, 10)

  it('turns a workout on that weekday into a rest day', () => {
    expect(scheduleFor(plan, state, '2026-11-08', now).isRest).toBe(false)
    const slot = scheduleFor(plan, state, '2026-11-08', now, [SUNDAY])
    expect(slot.isRest).toBe(true)
    expect(slot.day?.name).toBe('Push 2')
  })
  it('leaves other days and the rotation alone', () => {
    const monday = scheduleFor(plan, state, '2026-11-09', now, [SUNDAY])
    expect(monday.isRest).toBe(false)
    expect(monday.day?.name).toBe('Push 1')
  })
  it('is not offered as the next workout', () => {
    const slots = ['2026-11-08', '2026-11-09'].map((d) => scheduleFor(plan, state, d, now, [SUNDAY]))
    expect(nextWorkoutSlot(slots, false)?.date).toBe('2026-11-09')
  })
})
