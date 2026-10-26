import type { Workout, WorkoutExercise } from '../types'
import type { IconName } from '../components/Icon'
import { completedSetCount } from './stats'
import { dayKey } from './date'

export interface QuestStats {
  sets: number
  workouts: number
  xp: number
  minutes: number
  prs: number
  muscles: number
}

export interface Quest {
  id: string
  label: string
  icon: IconName
  target: number
  progress: number
  done: boolean
}

interface QuestDef {
  id: string
  label: string
  icon: IconName
  target: number
  /** Reads this quest's current value out of the day's stats. */
  value: (s: QuestStats) => number
}

const POOL: QuestDef[] = [
  { id: 'finish', label: 'Finish a workout', icon: 'check-circle', target: 1, value: (s) => s.workouts },
  { id: 'sets12', label: 'Log 12 sets', icon: 'dumbbell', target: 12, value: (s) => s.sets },
  { id: 'sets20', label: 'Log 20 sets', icon: 'dumbbell', target: 20, value: (s) => s.sets },
  { id: 'xp150', label: 'Earn 150 XP', icon: 'zap', target: 150, value: (s) => s.xp },
  { id: 'xp250', label: 'Earn 250 XP', icon: 'zap', target: 250, value: (s) => s.xp },
  { id: 'min30', label: 'Train for 30 minutes', icon: 'clock', target: 30, value: (s) => s.minutes },
  { id: 'pr', label: 'Hit a new PR', icon: 'trophy', target: 1, value: (s) => s.prs },
  { id: 'muscles3', label: 'Train 3 muscle groups', icon: 'target', target: 3, value: (s) => s.muscles },
]

/** FNV-1a: small, stable, and the same answer on every device for the same day. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 3 quests for the day: 'finish' plus two picked from the rest of the pool by the day's hash. */
export function dailyQuests(day: string, stats: QuestStats): Quest[] {
  const finish = POOL[0]
  const rest = POOL.slice(1)
  const h = hash(day)
  const first = rest[h % rest.length]
  const remaining = rest.filter((q) => q !== first)
  const second = remaining[(h >>> 16) % remaining.length]
  return [finish, first, second].map((def) => {
    const value = Math.floor(def.value(stats))
    const progress = Math.min(value, def.target)
    return {
      id: def.id,
      label: def.label,
      icon: def.icon,
      target: def.target,
      progress,
      done: progress >= def.target,
    }
  })
}

/**
 * Today's stats from saved workouts, plus an optional live session. Live work
 * counts toward sets, XP, minutes and muscles but not toward finished workouts.
 */
export function todayQuestStats(
  workouts: Workout[],
  xpByWorkout: Map<string, number>,
  prsByWorkout: Map<string, number>,
  live?: { exercises: WorkoutExercise[]; startedAt: string; xp: number }
): QuestStats {
  const today = dayKey()
  const todays = workouts.filter((w) => dayKey(new Date(w.startedAt)) === today)

  const exercises: WorkoutExercise[] = todays.flatMap((w) => w.exercises)
  if (live) exercises.push(...live.exercises)

  let xp = live?.xp ?? 0
  let minutes = 0
  let prs = 0
  for (const w of todays) {
    xp += xpByWorkout.get(w.id) ?? 0
    prs += prsByWorkout.get(w.id) ?? 0
    minutes += w.durationSec / 60
  }
  if (live) minutes += Math.max(0, Date.now() - new Date(live.startedAt).getTime()) / 60000

  const muscles = new Set<string>()
  for (const ex of exercises) {
    if (ex.muscle === 'Other') continue
    if (ex.sets.some((s) => s.done && !s.warmup)) muscles.add(ex.muscle)
  }

  return {
    sets: completedSetCount(exercises),
    workouts: todays.length,
    xp,
    minutes,
    prs,
    muscles: muscles.size,
  }
}
