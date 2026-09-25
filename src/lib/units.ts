import type { Unit } from '../types'

const LB_PER_KG = 2.2046226218

export function kgTo(unit: Unit, kg: number): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function toKg(unit: Unit, value: number): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

/** Display a stored kg value in the user's unit, trimming pointless decimals. */
export function fmtWeight(kg: number, unit: Unit, withUnit = true): string {
  const v = kgTo(unit, kg)
  const rounded = Math.round(v * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return withUnit ? `${text} ${unit}` : text
}

/** Volume gets large fast — 12,480 kg reads better as 12.5t. */
export function fmtVolume(kg: number, unit: Unit): string {
  const v = kgTo(unit, kg)
  if (v >= 100_000) return `${(v / 1000).toFixed(0)}k ${unit}`
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k ${unit}`
  return `${Math.round(v).toLocaleString()} ${unit}`
}

/** Plate-friendly increments so the steppers feel like a real barbell. */
export function step(unit: Unit): number {
  return unit === 'kg' ? 2.5 : 5
}
