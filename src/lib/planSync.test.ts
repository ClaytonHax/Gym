import { describe, expect, it } from 'vitest'
import { hasExercise, isoOf, pickOwnerPplPlan, samePlanContent, stripExercise, syncAction } from './planSync'
import type { Plan, PlanDay, PlanExercise } from '../types'

const ex = (exerciseId: string): PlanExercise => ({
  exerciseId,
  name: exerciseId,
  muscle: 'Core',
  tracksWeight: false,
  targets: ['10'],
  restSec: 60,
})
const day = (id: string, ids: string[]): PlanDay => ({
  id,
  kind: 'workout',
  name: id,
  exercises: ids.map(ex),
})
const plan = (over: Partial<Plan>): Plan => ({
  id: 'p',
  name: 'Plan',
  days: [day('d', ['a'])],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})
const copy = (from: Partial<NonNullable<Plan['sharedFrom']>>) =>
  plan({ sharedFrom: { authorUid: 'u', publicPlanId: 'x', ...from } })

describe('syncAction', () => {
  const t1 = '2026-02-01T10:00:00.000Z'
  const t2 = '2026-02-02T10:00:00.000Z'

  it('ignores plans that were not copied from a published plan', () => {
    expect(syncAction(plan({}), { updatedAt: t2 })).toBe('none')
  })
  it('is orphaned when the source is gone', () => {
    expect(syncAction(copy({ syncedAt: t1 }), null)).toBe('orphaned')
  })
  it('does nothing when up to date', () => {
    expect(syncAction(copy({ syncedAt: t1 }), { updatedAt: t1 })).toBe('none')
    expect(syncAction(copy({ syncedAt: t2 }), { updatedAt: t1 })).toBe('none')
  })
  it('auto-updates untouched copies when the source is newer', () => {
    expect(syncAction(copy({ syncedAt: t1 }), { updatedAt: t2 })).toBe('auto')
  })
  it('asks first for customised copies', () => {
    expect(syncAction(copy({ syncedAt: t1, customized: true }), { updatedAt: t2 })).toBe('prompt')
    expect(syncAction(copy({ syncedAt: t2, customized: true }), { updatedAt: t2 })).toBe('none')
  })
  it('asks first for legacy copies without syncedAt', () => {
    expect(syncAction(copy({}), { updatedAt: t1 })).toBe('prompt')
  })
})

describe('stripExercise', () => {
  it('removes the exercise everywhere without touching other days or exercises', () => {
    const days = [day('a', ['x', 'woodchopper', 'y']), day('b', ['z']), day('c', ['woodchopper'])]
    const out = stripExercise(days, 'woodchopper')
    expect(out.map((d) => d.exercises.map((e) => e.exerciseId))).toEqual([['x', 'y'], ['z'], []])
    expect(out[1]).toBe(days[1])
    expect(hasExercise(days, 'woodchopper')).toBe(true)
    expect(hasExercise(out, 'woodchopper')).toBe(false)
    expect(days[0].exercises).toHaveLength(3)
  })
})

describe('pickOwnerPplPlan', () => {
  const opts = { templateId: 'ppl-8', publicId: 'ppl-8day', avoidExerciseId: 'woodchopper' }
  const chop = [day('d', ['woodchopper'])]

  it('returns null with no candidates', () => {
    expect(pickOwnerPplPlan([plan({ name: 'Bro split' })], opts)).toBeNull()
  })
  it('matches by template, adopted public id, or name', () => {
    expect(pickOwnerPplPlan([plan({ id: 'a', templateId: 'ppl-8' })], opts)?.id).toBe('a')
    expect(pickOwnerPplPlan([plan({ id: 'b', sharedFrom: { authorUid: 'u', publicPlanId: 'ppl-8day' } })], opts)?.id).toBe('b')
    expect(pickOwnerPplPlan([plan({ id: 'c', name: 'my PUSH pull & legs' })], opts)?.id).toBe('c')
  })
  it('prefers one without the removed exercise, then the newest', () => {
    const plans = [
      plan({ id: 'old', templateId: 'ppl-8', updatedAt: '2026-01-01T00:00:00.000Z' }),
      plan({ id: 'chop', templateId: 'ppl-8', days: chop, updatedAt: '2026-03-01T00:00:00.000Z' }),
      plan({ id: 'new', templateId: 'ppl-8', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(pickOwnerPplPlan(plans, opts)?.id).toBe('new')
  })
  it('keeps an already-linked plan (idempotent) and skips ones published elsewhere', () => {
    const plans = [
      plan({ id: 'other', templateId: 'ppl-8', publishedId: 'abc', updatedAt: '2026-05-01T00:00:00.000Z' }),
      plan({ id: 'fresh', templateId: 'ppl-8', updatedAt: '2026-04-01T00:00:00.000Z' }),
      plan({ id: 'linked', templateId: 'ppl-8', publishedId: 'ppl-8day', days: chop, updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    expect(pickOwnerPplPlan(plans, opts)?.id).toBe('linked')
  })
})

describe('samePlanContent / isoOf', () => {
  it('ignores key order, undefined fields and day ids', () => {
    const a = { name: 'P', days: [{ id: 'd', kind: 'workout', name: 'D', exercises: [] }] as PlanDay[] }
    const b = { name: ' P ', days: [{ exercises: [], name: 'D', kind: 'workout', id: 'other', focus: undefined }] as PlanDay[] }
    expect(samePlanContent(a, b)).toBe(true)
    expect(samePlanContent(a, { ...b, name: 'Q' })).toBe(false)
  })
  it('converts timestamps and tolerates pending ones', () => {
    expect(isoOf({ toMillis: () => 0 })).toBe('1970-01-01T00:00:00.000Z')
    expect(isoOf(null)).toBeNull()
  })
})
