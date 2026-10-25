import type { Workout, WorkoutExercise, WorkoutSet } from '../types'

/** Used when the person hasn't logged a body weight; the UI says so and links to Body. */
export const DEFAULT_BODY_WEIGHT_KG = 75

/** Resistance training, Compendium of Physical Activities (moderate effort). */
const STRENGTH_MET = 4

/** km/h → m/min, the unit the ACSM equations use. */
const mPerMin = (kmh: number) => (kmh * 1000) / 60

/**
 * ACSM metabolic equations: walking below 8 km/h, running above. Incline is a
 * fraction of grade. Returns METs (VO2 / 3.5).
 */
export function treadmillMet(speedKmh: number, inclinePct = 0): number {
  const s = mPerMin(speedKmh)
  const grade = Math.max(0, inclinePct) / 100
  const vo2 = speedKmh < 8 ? 3.5 + 0.1 * s + 1.8 * s * grade : 3.5 + 0.2 * s + 0.9 * s * grade
  return vo2 / 3.5
}

/**
 * MET for one timed set, chosen by the exercise's name (so custom exercises like
 * "Weighted bike" still get a sensible value) and refined by speed/incline/level.
 * Machine levels have no universal scale, so level nudges the MET within a range.
 */
export function setMet(ex: Pick<WorkoutExercise, 'name' | 'muscle'>, set: WorkoutSet): number {
  const name = ex.name.toLowerCase()
  const level = set.level && set.level > 0 ? Math.min(set.level, 20) : undefined
  const byLevel = (base: number, perLevel: number, fallback: number) =>
    level !== undefined ? base + perLevel * level : fallback

  if (/treadmill|walk|run|jog|hike/.test(name)) {
    if (set.speedKmh && set.speedKmh > 0) return treadmillMet(set.speedKmh, set.inclinePct)
    if (set.distanceKm && set.durationSec) return treadmillMet(set.distanceKm / (set.durationSec / 3600), set.inclinePct)
    return /run|jog/.test(name) ? 9.8 : 4.3
  }
  if (/assault|air ?bike|fan bike|echo/.test(name)) return byLevel(6, 0.5, 8)
  if (/bike|cycl|spin/.test(name)) return byLevel(4, 0.45, 6.8)
  if (/row/.test(name) && ex.muscle === 'Cardio') return byLevel(5, 0.3, 7)
  if (/ellipt|cross ?trainer/.test(name)) return byLevel(4, 0.3, 5)
  if (/stair|step/.test(name)) return byLevel(6, 0.4, 9)
  if (/rope|skip/.test(name)) return 11
  if (/ski/.test(name)) return byLevel(5, 0.35, 7)
  if (/swim/.test(name)) return 7
  if (ex.muscle === 'Cardio') return byLevel(4, 0.35, 6)
  // Planks, carries and other timed holds.
  return 3.8
}

const kcal = (met: number, kg: number, sec: number) => (met * kg * sec) / 3600

/**
 * Estimated energy for a whole session. Timed sets use their own duration and
 * MET; whatever wall-clock time is left is counted as strength work, but only if
 * the session had weighted/rep sets at all.
 */
export function estimateCalories(
  w: Pick<Workout, 'exercises' | 'durationSec'>,
  bodyWeightKg: number = DEFAULT_BODY_WEIGHT_KG
): number {
  const kg = bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_BODY_WEIGHT_KG
  let timedSec = 0
  let total = 0
  let hasRepWork = false
  for (const ex of w.exercises) {
    for (const set of ex.sets) {
      if (!set.done) continue
      if (ex.logBy === 'time') {
        const sec = set.durationSec ?? 0
        timedSec += sec
        total += kcal(setMet(ex, set), kg, sec)
      } else {
        hasRepWork = true
      }
    }
  }
  if (hasRepWork) total += kcal(STRENGTH_MET, kg, Math.max(0, w.durationSec - timedSec))
  return Math.round(total)
}
