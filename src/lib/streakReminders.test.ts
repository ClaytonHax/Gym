import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the Vercel cron
import { forgottenWorkout, missedPlanDay, reminderHour } from '../../api/_lib/streakLogic.js'

const watch = (extra = {}) => ({
  asOfDay: '2026-10-26',
  lastWorkoutDay: '2026-10-25',
  planDays: ['2026-10-25', '2026-10-26', '2026-10-27'],
  trainedDays: ['2026-10-25'],
  ...extra,
})

describe('missedPlanDay', () => {
  it('flags a scheduled day with nothing logged', () => {
    expect(missedPlanDay(watch(), { day: '2026-10-27', hour: 10 })).toBe(true)
  })
  it('ignores a day that was trained', () => {
    expect(missedPlanDay(watch({ trainedDays: ['2026-10-26'], lastWorkoutDay: '2026-10-26' }), { day: '2026-10-27', hour: 10 })).toBe(false)
  })
  it('ignores rest or skipped days (not in planDays)', () => {
    expect(missedPlanDay(watch({ planDays: ['2026-10-25'] }), { day: '2026-10-27', hour: 10 })).toBe(false)
  })
  it('stops nagging once today is trained', () => {
    expect(missedPlanDay(watch({ lastWorkoutDay: '2026-10-27' }), { day: '2026-10-27', hour: 10 })).toBe(false)
  })
  it('ignores a stale doc and old docs without the new fields', () => {
    expect(missedPlanDay(watch(), { day: '2026-11-05', hour: 10 })).toBe(false)
    expect(missedPlanDay({ asOfDay: '2026-10-26', lastWorkoutDay: '' }, { day: '2026-10-27', hour: 10 })).toBe(false)
  })
})

describe('forgottenWorkout', () => {
  const now = Date.parse('2026-10-27T16:00:00Z')
  it('flags a session left open for hours', () => {
    expect(forgottenWorkout({ openSince: '2026-10-27T10:00:00Z' }, now)).toBe(true)
  })
  it('gives a fresh session time', () => {
    expect(forgottenWorkout({ openSince: '2026-10-27T15:30:00Z' }, now)).toBe(false)
  })
  it('ignores no open session', () => {
    expect(forgottenWorkout({ openSince: '' }, now)).toBe(false)
    expect(forgottenWorkout({}, now)).toBe(false)
  })
})

it('only reminds during waking hours', () => {
  expect(reminderHour(3)).toBe(false)
  expect(reminderHour(9)).toBe(true)
  expect(reminderHour(23)).toBe(false)
})
