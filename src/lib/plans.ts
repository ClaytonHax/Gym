import type {
  ActivePlanState,
  ActiveWorkout,
  DayKey,
  Plan,
  PlanDay,
  PlanExercise,
  PlanTemplate,
  ScheduleSlot,
} from '../types'
import { planToExercises } from '../data/programs'
import { fmtTargetDuration, isTimed } from './logMode'
import { addDays, dayKey, parseDayKey } from './date'

export function newDayId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function newRestDay(): PlanDay {
  return { id: newDayId(), kind: 'rest', name: 'Rest', exercises: [] }
}

export function newWorkoutDay(name = 'Workout'): PlanDay {
  return { id: newDayId(), kind: 'workout', name, exercises: [] }
}

/** Deep copy with fresh day ids, so edits never touch the source. */
export function cloneDays(days: PlanDay[]): PlanDay[] {
  return days.map((d) => ({
    ...d,
    id: newDayId(),
    exercises: d.exercises.map((e) => ({ ...e, targets: [...(e.targets ?? [])] })),
  }))
}

function toDate(d: Date | DayKey): Date {
  return typeof d === 'string' ? parseDayKey(d) : d
}

/** Whole calendar days from a to b, immune to DST (both read as UTC midnights). */
function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/**
 * What the plan says for `date`.
 * offset = days since start minus earlier 'delay's (each pushes the cycle back a day);
 * 'skip' only blanks its own date. An adjustment on `date` itself forces rest.
 */
export function scheduleFor(
  plan: Plan,
  state: ActivePlanState,
  date: Date | DayKey,
  now: Date = new Date()
): ScheduleSlot {
  const key = typeof date === 'string' ? date : dayKey(date)
  const today = dayKey(now)
  const n = plan.days.length
  const base = { date: key, cycleLength: n, isFuture: key > today, isToday: key === today }
  const elapsed = daysBetween(state.startDate, key)
  if (elapsed < 0 || n === 0) {
    return { ...base, dayIndex: null, day: null, cycle: 0, dayNumber: 0, isRest: false }
  }
  const delays = state.adjustments.filter((a) => a.type === 'delay' && a.date < key).length
  const offset = elapsed - delays
  const dayIndex = ((offset % n) + n) % n
  const cycle = Math.max(1, Math.floor(offset / n) + 1)
  const day = plan.days[dayIndex]
  const adj = state.adjustments.find((a) => a.date === key)
  return {
    ...base,
    dayIndex,
    day,
    cycle,
    dayNumber: dayIndex + 1,
    isRest: day.kind === 'rest' || !!adj,
    ...(adj ? { adjusted: adj.type } : {}),
  }
}

export function scheduleRange(
  plan: Plan,
  state: ActivePlanState,
  from: Date | DayKey,
  n: number,
  now: Date = new Date()
): ScheduleSlot[] {
  const start = toDate(from)
  return Array.from({ length: n }, (_, i) => scheduleFor(plan, state, addDays(start, i), now))
}

/** True when the plan (or an adjustment) makes this date a rest day; false before startDate. */
export function isPlannedRest(plan: Plan, state: ActivePlanState, date: DayKey): boolean {
  const slot = scheduleFor(plan, state, date)
  return slot.dayIndex !== null && slot.isRest
}

/** Replaces any adjustment already on that date. */
export function withAdjustment(
  state: ActivePlanState,
  date: DayKey,
  type: 'delay' | 'skip'
): ActivePlanState {
  return {
    ...state,
    adjustments: [...state.adjustments.filter((a) => a.date !== date), { date, type }].sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
  }
}

/** A fresh active workout prefilled from the slot's day and tagged with its place in the plan. */
export function startPlanDay(plan: Plan, slot: ScheduleSlot): ActiveWorkout {
  if (!slot.day || slot.day.kind === 'rest' || slot.dayIndex === null) {
    throw new Error('Cannot start a rest day')
  }
  return {
    name: slot.day.name,
    startedAt: new Date().toISOString(),
    exercises: planToExercises(slot.day.exercises),
    planId: plan.id,
    planName: plan.name,
    planDayIndex: slot.dayIndex,
    planDayName: slot.day.name,
    planCycle: slot.cycle,
  }
}

export function setCountOf(exercises: PlanExercise[]): number {
  return exercises.reduce((t, e) => t + (isTimed(e) ? 1 : (e.targets?.length ?? e.sets ?? 0)), 0)
}

/** "3×10-15" for rep work, "20 min" for timed. */
export function exerciseTargetLabel(e: PlanExercise): string {
  if (isTimed(e)) return fmtTargetDuration(e.targetDurationSec ?? 600)
  return `${e.targets?.length ?? e.sets ?? 0}×${e.targets?.[0] || '—'}`
}

/** Rough session length: ~45s under tension per set plus the prescribed rest, to the nearest 5 min. */
export function estimateMinutes(exercises: PlanExercise[]): number {
  const sec = exercises.reduce(
    (t, e) =>
      t +
      (isTimed(e)
        ? (e.targetDurationSec ?? 600)
        : (e.targets?.length ?? e.sets ?? 0) * (45 + (e.restSec ?? 90))),
    0
  )
  return Math.round(sec / 60 / 5) * 5
}

export function planSummary(plan: Pick<Plan, 'days'>): { workouts: number; rests: number; length: number } {
  const rests = plan.days.filter((d) => d.kind === 'rest').length
  return { workouts: plan.days.length - rests, rests, length: plan.days.length }
}

export function templateToPlanDays(t: PlanTemplate): PlanDay[] {
  return cloneDays(t.days)
}

export function blankPlanDays(): PlanDay[] {
  return [newWorkoutDay('Day 1')]
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "8-day rotation · 6 workouts · 2 rest days"; a one-day plan reads "1 workout · repeats every day". */
export function rotationText(plan: Pick<Plan, 'days'>): string {
  const { workouts, rests, length } = planSummary(plan)
  if (length === 1) return workouts ? '1 workout · repeats every day' : '1 rest day · repeats every day'
  return `${length}-day rotation · ${plural(workouts, 'workout')} · ${plural(rests, 'rest day')}`
}

/** "5 exercises · 18 sets · ~55 min"; all-timed days read "2 activities · ~35 min". */
export function daySummary(exercises: PlanExercise[]): string {
  const min = estimateMinutes(exercises)
  const mins = min ? ` · ~${min} min` : ''
  if (exercises.length > 0 && exercises.every((e) => isTimed(e))) return `${plural(exercises.length, 'activity').replace('activitys', 'activities')}${mins}`
  return `${plural(exercises.length, 'exercise')} · ${plural(setCountOf(exercises), 'set')}${mins}`
}
