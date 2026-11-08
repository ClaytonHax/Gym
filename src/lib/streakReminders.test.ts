import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module shared with the Vercel cron
import { evaluateWatch, forgottenWorkout, missedPlanDay, reminderHour } from '../../api/_lib/streakLogic.js'

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

describe('evaluateWatch with rest days and freezes', () => {
  const day = (extra = {}) => ({ unit: 'day', current: 5, asOfDay: '2026-11-07', lastWorkoutDay: '2026-11-07', restDays: [], weeklyGoal: 3, ...extra })
  const week = (extra = {}) => ({ unit: 'week', current: 2, asOfDay: '2026-11-07', lastWorkoutDay: '2026-11-06', restDays: [], weeklyGoal: 3, weekStart: '2026-11-02', workoutsThisWeek: 2, prevWeekWorkouts: 3, streakBeforePrev: 1, ...extra })
  const sun = { day: '2026-11-08', hour: 18 }
  const mon = { day: '2026-11-09', hour: 18 }

  it('warns on an ordinary day', () => {
    expect(evaluateWatch(day(), sun).status).toBe('risk')
  })
  it('stays quiet on a rest day', () => {
    expect(evaluateWatch(day({ restDays: ['2026-11-08'] }), sun).status).toBe(null)
  })
  it('carries the streak over a rest day', () => {
    expect(evaluateWatch(day({ restDays: ['2026-11-08'] }), mon)).toEqual({ status: 'risk', streak: 6 })
  })
  it('reports a real break', () => {
    expect(evaluateWatch(day(), mon).status).toBe('lost')
  })
  it('does not warn or report lost with a freeze left', () => {
    expect(evaluateWatch(day({ freezes: 1 }), sun).status).toBe(null)
    expect(evaluateWatch(day({ freezes: 1 }), mon).status).toBe('risk')
    expect(evaluateWatch(day({ freezes: 2 }), mon).status).toBe(null)
  })
  it('weekly: no warning on a rest day', () => {
    expect(evaluateWatch(week({ restDays: ['2026-11-08'] }), sun).status).toBe(null)
  })
  it('weekly: warns on the last day you can train', () => {
    expect(evaluateWatch(week({ restDays: ['2026-11-08'], asOfDay: '2026-11-06' }), { day: '2026-11-07', hour: 18 }).status).toBe('risk')
  })
  it('weekly: a freeze silences the warning', () => {
    expect(evaluateWatch(week({ freezes: 1 }), sun).status).toBe(null)
  })
})
