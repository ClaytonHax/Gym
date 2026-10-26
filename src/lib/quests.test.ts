import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workout, WorkoutExercise, WorkoutSet } from '../types'
import { dailyQuests, todayQuestStats, type QuestStats } from './quests'

const stats = (o: Partial<QuestStats> = {}): QuestStats => ({
  sets: 0,
  workouts: 0,
  xp: 0,
  minutes: 0,
  prs: 0,
  muscles: 0,
  ...o,
})

const set = (o: Partial<WorkoutSet> = {}): WorkoutSet => ({ weightKg: 60, reps: 10, done: true, ...o })

const ex = (muscle: WorkoutExercise['muscle'], sets: WorkoutSet[]): WorkoutExercise => ({
  exerciseId: muscle,
  name: muscle,
  muscle,
  tracksWeight: true,
  sets,
})

const workout = (id: string, startedAt: string, exercises: WorkoutExercise[], durationSec = 0): Workout =>
  ({ id, name: 'W', startedAt, durationSec, exercises, totalVolumeKg: 0, setCount: 0 }) as Workout

// Fixed local noon so "today" is stable regardless of when the suite runs.
const NOW = new Date(2026, 9, 26, 12, 0, 0)
const todayIso = (hour = 9) => new Date(2026, 9, 26, hour, 0, 0).toISOString()
const yesterdayIso = new Date(2026, 9, 25, 9, 0, 0).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dailyQuests', () => {
  it('always returns finish first and three distinct quests', () => {
    const q = dailyQuests('2026-10-26', stats())
    expect(q).toHaveLength(3)
    expect(q[0].id).toBe('finish')
    expect(new Set(q.map((x) => x.id)).size).toBe(3)
  })

  it('is deterministic for a given day', () => {
    expect(dailyQuests('2026-10-26', stats())).toEqual(dailyQuests('2026-10-26', stats()))
  })

  it('varies the picks across days', () => {
    const seconds = new Set<string>()
    for (let d = 1; d <= 30; d++) {
      const day = `2026-10-${String(d).padStart(2, '0')}`
      seconds.add(dailyQuests(day, stats())[1].id)
    }
    expect(seconds.size).toBeGreaterThan(1)
  })

  it('clamps progress to target and marks done', () => {
    const q = dailyQuests('2026-10-26', stats({ workouts: 5, sets: 500, xp: 9999, minutes: 999, prs: 9, muscles: 9 }))
    for (const quest of q) {
      expect(quest.progress).toBe(quest.target)
      expect(quest.done).toBe(true)
    }
  })

  it('reports partial progress as not done', () => {
    const q = dailyQuests('2026-10-26', stats())
    expect(q[0]).toMatchObject({ id: 'finish', progress: 0, target: 1, done: false })
  })
})

describe('todayQuestStats', () => {
  it('counts only today\'s saved workouts and their XP and PRs', () => {
    const workouts = [
      workout('t', todayIso(), [ex('Chest', [set(), set()])], 1800),
      workout('y', yesterdayIso, [ex('Back', [set()])], 3600),
    ]
    const s = todayQuestStats(
      workouts,
      new Map([['t', 70], ['y', 999]]),
      new Map([['t', 1], ['y', 1]])
    )
    expect(s.workouts).toBe(1)
    expect(s.sets).toBe(2)
    expect(s.xp).toBe(70)
    expect(s.prs).toBe(1)
    expect(s.minutes).toBe(30)
    expect(s.muscles).toBe(1)
  })

  it('adds live sets, XP and elapsed minutes without counting the live session as a workout', () => {
    const live = {
      exercises: [ex('Legs', [set(), set({ done: false }), set({ warmup: true })]), ex('Chest', [set({ done: false })])],
      startedAt: new Date(2026, 9, 26, 11, 30, 0).toISOString(), // 30 minutes ago
      xp: 25,
    }
    const s = todayQuestStats([], new Map(), new Map(), live)
    expect(s.workouts).toBe(0)
    expect(s.sets).toBe(1) // warm-up and undone sets don't count
    expect(s.xp).toBe(25)
    expect(s.minutes).toBeCloseTo(30)
    expect(s.muscles).toBe(1) // Chest has no done set yet
  })

  it('combines saved and live muscles, excluding Other', () => {
    const workouts = [workout('t', todayIso(), [ex('Chest', [set()]), ex('Other', [set()])])]
    const live = { exercises: [ex('Legs', [set()]), ex('Other', [set()])], startedAt: NOW.toISOString(), xp: 0 }
    expect(todayQuestStats(workouts, new Map(), new Map(), live).muscles).toBe(2)
  })
})
