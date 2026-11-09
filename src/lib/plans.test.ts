import { describe, expect, it } from 'vitest'
import { cloneDay, cloneDays, scheduleFor, withAdjustment, withRestart } from './plans'
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

describe('restarting the split', () => {
  const mk = (id: string) => ({ ...day, id, name: id })
  const plan = { id: 'p', name: 'P', days: ['A', 'B', 'C', 'D'].map(mk), createdAt: '', updatedAt: '' } as Plan
  const now = new Date(2026, 10, 10, 12)
  const base: ActivePlanState = { planId: 'p', startDate: '2026-11-01', adjustments: [] }
  const at = (s: ActivePlanState, k: string) => scheduleFor(plan, s, k, now)
  const idx = (s: ActivePlanState, k: string) => at(s, k).dayIndex

  it('moves the rotation from its date and continues', () => {
    const s = withRestart(plan, base, '2026-11-10', 2, now)
    expect([10, 11, 12, 13].map((d) => idx(s, `2026-11-${d}`))).toEqual([2, 3, 0, 1])
  })
  it('leaves earlier dates exactly as they were, even with earlier delays', () => {
    const delayed = withAdjustment(withAdjustment(base, '2026-11-03', 'delay'), '2026-11-06', 'skip')
    const s = withRestart(plan, delayed, '2026-11-10', 3, now)
    for (let d = 1; d < 10; d++) {
      const k = `2026-11-${String(d).padStart(2, '0')}`
      expect(at(s, k)).toEqual(at(delayed, k))
    }
  })
  it('counts delays after a restart but not before it', () => {
    const delayedBefore = withAdjustment(base, '2026-11-05', 'delay')
    const s = withRestart(plan, delayedBefore, '2026-11-10', 1, now)
    expect(idx(s, '2026-11-12')).toBe(3)
    const after = withAdjustment(s, '2026-11-11', 'delay')
    expect(idx(after, '2026-11-12')).toBe(2)
    expect(idx(after, '2026-11-11')).toBe(2)
    expect(idx(after, '2026-11-13')).toBe(3)
  })
  it('takes effect on a plan whose start date is still ahead', () => {
    const later = { ...base, startDate: '2026-11-20' }
    const s = withRestart(plan, later, '2026-11-10', 1, now)
    expect(s.startDate).toBe('2026-11-10')
    expect(at(s, '2026-11-10')).toMatchObject({ dayIndex: 1 })
  })
  it('continues rounds and increments on wrap', () => {
    const s = withRestart(plan, base, '2026-11-10', 2, now)
    const c0 = at(s, '2026-11-10').cycle
    expect(c0).toBe(at(base, '2026-11-10').cycle)
    expect(at(s, '2026-11-11').cycle).toBe(c0)
    expect(at(s, '2026-11-12').cycle).toBe(c0 + 1)
    expect(at(s, '2026-11-12').dayIndex).toBe(0)
  })
  it('a later restart supersedes same-date and future restarts', () => {
    const a = withRestart(plan, base, '2026-11-10', 2, now)
    const b = withRestart(plan, a, '2026-11-12', 1, now)
    expect(b.restarts).toHaveLength(2)
    const c = withRestart(plan, b, '2026-11-10', 0, now)
    expect(c.restarts).toEqual([{ date: '2026-11-10', dayIndex: 0, cycle: at(base, '2026-11-10').cycle }])
    expect(idx(c, '2026-11-12')).toBe(2)
  })
  it("clears today's skip so the chosen day is scheduled", () => {
    const skipped = withAdjustment(base, '2026-11-10', 'skip')
    expect(at(skipped, '2026-11-10').isRest).toBe(true)
    const s = withRestart(plan, skipped, '2026-11-10', 1, now)
    expect(at(s, '2026-11-10')).toMatchObject({ dayIndex: 1, isRest: false })
    expect(s.adjustments).toEqual([])
  })
  it('keeps earlier adjustments and drops later ones', () => {
    const adj = withAdjustment(withAdjustment(base, '2026-11-08', 'skip'), '2026-11-12', 'skip')
    expect(withRestart(plan, adj, '2026-11-10', 0, now).adjustments).toEqual([{ date: '2026-11-08', type: 'skip' }])
  })
  it('a tomorrow restart leaves today alone', () => {
    const s = withRestart(plan, base, '2026-11-11', 0, now)
    expect(at(s, '2026-11-10')).toEqual(at(base, '2026-11-10'))
    expect(idx(s, '2026-11-11')).toBe(0)
  })
  it('clamps and wraps when the plan shrank', () => {
    const s = withRestart(plan, base, '2026-11-10', 99, now)
    expect(s.restarts?.[0].dayIndex).toBe(3)
    const smaller = { ...plan, days: plan.days.slice(0, 2) } as Plan
    const old: ActivePlanState = { ...base, restarts: [{ date: '2026-11-10', dayIndex: 3, cycle: 2 }] }
    const slot = scheduleFor(smaller, old, '2026-11-11', now)
    expect(slot.dayIndex).toBe(0)
    expect(slot.cycle).toBe(4)
  })
  it('behaves as before with no restarts, and withAdjustment keeps them', () => {
    expect(idx(base, '2026-11-10')).toBe(1)
    const s = withAdjustment(withRestart(plan, base, '2026-11-10', 2, now), '2026-11-11', 'delay')
    expect(s.restarts).toHaveLength(1)
  })
})
