import type { DayKey, PlanDay, PublicPlan, ScheduleSlot } from '../types'
import { estimateMinutes, rotationText } from './plans'
import { addDays, dayKey, parseDayKey } from './date'

export const DELETE_PHRASE = 'delete my plan'

/**
 * The startDate that makes `dayIndex` (0-based) fall on `chosen`: cycle day 1 sits
 * dayIndex days earlier. scheduleFor() then reads the chosen date as that day.
 */
export function startDateFor(chosen: DayKey, dayIndex: number): DayKey {
  return dayKey(addDays(parseDayKey(chosen), -Math.max(0, Math.floor(dayIndex))))
}

/** Case-insensitive, whitespace-trimmed (inner runs collapsed) match of the typed confirmation. */
export function matchesDeletePhrase(s: string): boolean {
  return s.trim().replace(/\s+/g, ' ').toLowerCase() === DELETE_PHRASE
}

const ms = (p: Pick<PublicPlan, 'updatedAt' | 'createdAt'>) =>
  (p.updatedAt ?? p.createdAt)?.toMillis() ?? Number.MAX_SAFE_INTEGER

/**
 * Splits public plans into the owner's recommended picks (starred === true, by
 * starOrder then name) and everything else (newest edit first; pending server
 * timestamps count as newest).
 */
export function partitionStarred<T extends Pick<PublicPlan, 'starred' | 'starOrder' | 'name' | 'updatedAt' | 'createdAt'>>(
  plans: T[]
): { starred: T[]; others: T[] } {
  const starred = plans
    .filter((p) => p.starred === true)
    .sort(
      (a, b) =>
        (a.starOrder ?? Number.MAX_SAFE_INTEGER) - (b.starOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name)
    )
  const others = plans.filter((p) => p.starred !== true).sort((a, b) => ms(b) - ms(a))
  return { starred, others }
}

/** Average workout length in minutes (nearest 5); 0 when there are no workout days. */
export function avgSessionMinutes(days: PlanDay[]): number {
  const w = days.filter((d) => d.kind === 'workout')
  return w.length ? Math.round(w.reduce((t, d) => t + estimateMinutes(d.exercises), 0) / w.length / 5) * 5 : 0
}

/** "8-day rotation · 6 workouts · 2 rest days · ~55 min" */
export function infoLine(days: PlanDay[]): string {
  const min = avgSessionMinutes(days)
  return `${rotationText({ days })}${min ? ` · ~${min} min` : ''}`
}

/**
 * The next workout to point the user at. Once today's workout is done we look from
 * tomorrow, otherwise "up next" would be the workout they just finished.
 */
export function nextWorkoutSlot(slots: ScheduleSlot[], todayDone: boolean): ScheduleSlot | undefined {
  return slots.find((s) => !s.isRest && s.day && !(todayDone && s.isToday))
}

/** "Today", "Tomorrow", or the weekday name ("Tuesday") for a day key. */
export function whenLabel(date: DayKey, now: Date = new Date()): string {
  const today = dayKey(now)
  if (date === today) return 'Today'
  if (date === dayKey(addDays(parseDayKey(today), 1))) return 'Tomorrow'
  return parseDayKey(date).toLocaleDateString(undefined, { weekday: 'long' })
}

/** "Tomorrow: Pull 1" / "Tuesday: Pull 1". */
export function nextWorkoutLabel(slot: ScheduleSlot, now: Date = new Date()): string {
  return `${whenLabel(slot.date, now)}: ${slot.day?.name ?? 'Workout'}`
}
