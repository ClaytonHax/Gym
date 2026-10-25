import type { Unit } from '../types'
import { BAR_WEIGHTS } from './plates'

/** Every denomination the calculator knows about; the person picks which their gym actually stocks. */
export const ALL_PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
}

/** What's ticked until the person changes it (the original fixed set). */
export const DEFAULT_PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

const KEY = (unit: Unit) => `gym.plates.${unit}`

export function loadPlates(unit: Unit): number[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((n): n is number => typeof n === 'number' && ALL_PLATES[unit].includes(n))
      if (valid.length > 0) return valid.sort((a, b) => b - a)
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_PLATES[unit]
}

export function savePlates(unit: Unit, plates: number[]) {
  try {
    localStorage.setItem(KEY(unit), JSON.stringify(plates))
  } catch {
    // Not persisted; still applies for this session.
  }
}

export interface PlateSetResult {
  perSide: Array<{ plate: number; count: number }>
  achieved: number
  remainder: number
}

/** Greedy per-side breakdown using only the plates the gym has. */
export function platesForSet(target: number, bar: number, plates: number[]): PlateSetResult {
  let side = Math.max(0, (target - bar) / 2)
  const perSide: PlateSetResult['perSide'] = []
  let loaded = 0
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const count = Math.floor((side + 1e-9) / plate)
    if (count > 0) {
      perSide.push({ plate, count })
      side -= count * plate
      loaded += count * plate
    }
  }
  return { perSide, achieved: bar + loaded * 2, remainder: Math.round(side * 2 * 100) / 100 }
}

export { BAR_WEIGHTS }
