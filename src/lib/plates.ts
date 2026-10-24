import type { Unit } from '../types'

const PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
}

export const BAR_WEIGHTS: Record<Unit, number[]> = {
  kg: [20, 15, 10],
  lb: [45, 35, 25],
}

export interface PlateResult {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: Array<{ plate: number; count: number }>
  /** What's actually loadable; differs from the target when it isn't a plate multiple. */
  achieved: number
  remainder: number
}

/** Greedy plate breakdown — correct for standard denominations, which nest evenly. */
export function platesFor(target: number, bar: number, unit: Unit): PlateResult {
  let side = Math.max(0, (target - bar) / 2)
  const perSide: PlateResult['perSide'] = []
  let loaded = 0
  for (const plate of PLATES[unit]) {
    const count = Math.floor((side + 1e-9) / plate)
    if (count > 0) {
      perSide.push({ plate, count })
      side -= count * plate
      loaded += count * plate
    }
  }
  return { perSide, achieved: bar + loaded * 2, remainder: Math.round(side * 2 * 100) / 100 }
}
