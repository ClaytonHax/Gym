import { describe, expect, it } from 'vitest'
import { computeStreaks, freezeJustUsed } from './streaks'
import { parseDayKey } from './date'
import type { Workout } from '../types'

const at = (day: string, id = day) =>
  ({ id, name: 'W', startedAt: parseDayKey(day).toISOString(), exercises: [], setCount: 1, totalVolumeKg: 0, durationSec: 60 }) as unknown as Workout

const isSunday = (d: string) => parseDayKey(d).getDay() === 0
const noRest = () => false
const today = (d: string) => parseDayKey(d)
// A finished empty workout is worth 50 XP, and level 2 costs 150: three sessions level up once.
const levelUpOn = (day: string) => [at(day, `${day}-a`), at(day, `${day}-b`), at(day, `${day}-c`)]

describe('plan streaks and rest days', () => {
  it('counts an always-rest Sunday and does not break on it', () => {
    // Fri, Sat trained; Sunday 2026-11-15 rest; today Monday not yet trained.
    const s = computeStreaks([at('2026-11-13'), at('2026-11-14')], {
      isRestDay: isSunday, planStartDate: '2026-11-13', weeklyGoal: 3, today: today('2026-11-16'),
    })
    expect(s.current).toBe(3)
    expect(s.frozen).toEqual([])
  })
  it('flags today as a rest day', () => {
    const s = computeStreaks([], { isRestDay: isSunday, planStartDate: '2026-11-13', weeklyGoal: 3, today: today('2026-11-15') })
    expect(s.todayRest).toBe(true)
  })
})

describe('streak freezes', () => {
  const plan = (now: string) => ({ isRestDay: noRest, planStartDate: '2026-11-09', weeklyGoal: 3, today: today(now) })

  it('earns one per level gained from launch on', () => {
    expect(computeStreaks(levelUpOn('2026-11-09'), plan('2026-11-09')).freezes).toBe(1)
    expect(computeStreaks(levelUpOn('2026-11-01'), plan('2026-11-09')).freezes).toBe(0)
  })
  it('spends one on a missed day and keeps the run without adding to it', () => {
    const w = [...levelUpOn('2026-11-09'), at('2026-11-11')]
    const s = computeStreaks(w, plan('2026-11-11'))
    expect(s.current).toBe(2)
    expect(s.frozen).toEqual(['2026-11-10'])
    expect(s.freezes).toBe(0)
  })
  it('breaks once freezes run out', () => {
    const w = [...levelUpOn('2026-11-09'), at('2026-11-12')]
    const s = computeStreaks(w, plan('2026-11-12'))
    expect(s.current).toBe(1)
    expect(s.frozen).toEqual(['2026-11-10'])
  })
  it('never spends one on today, or with no streak running', () => {
    expect(computeStreaks(levelUpOn('2026-11-09'), plan('2026-11-09')).freezes).toBe(1)
    const noRun = computeStreaks(levelUpOn('2026-11-12'), plan('2026-11-12'))
    expect(noRun.frozen).toEqual([])
    expect(noRun.freezes).toBe(1)
  })
  it('never spends one on a rest day', () => {
    const s = computeStreaks(levelUpOn('2026-11-14'), { isRestDay: isSunday, planStartDate: '2026-11-14', weeklyGoal: 3, today: today('2026-11-16') })
    expect(s.freezes).toBe(1)
    expect(s.current).toBe(2)
  })
  it('covers a missed week in weekly mode', () => {
    const met = (d: string) => [at(d, `${d}-1`), at(d, `${d}-2`), at(d, `${d}-3`)]
    const s = computeStreaks([...met('2026-11-09'), ...met('2026-11-23')], { weeklyGoal: 3, today: today('2026-11-25') })
    expect(s.current).toBe(2)
    expect(s.frozen).toEqual(['2026-11-16'])
  })
  it('reports a freeze spent yesterday', () => {
    const w = [...levelUpOn('2026-11-09'), at('2026-11-11')]
    expect(freezeJustUsed(computeStreaks(w, plan('2026-11-11')), today('2026-11-11'))).toBe(true)
    expect(freezeJustUsed(computeStreaks(w, plan('2026-11-11')), today('2026-11-12'))).toBe(false)
  })
})

describe('weekly goal and rest days', () => {
  it('caps the goal at the days that can be trained', () => {
    const six = ['09', '10', '11', '12', '13', '14'].map((d) => at(`2026-11-${d}`))
    const s = computeStreaks(six, { isRestDay: isSunday, weeklyGoal: 7, today: today('2026-11-16') })
    expect(s.current).toBe(1)
    expect(s.weeklyGoal).toBe(6)
  })
})
