import type { LogMode } from '../types'

export function logModeOf(x: { logBy?: LogMode }): LogMode {
  return x.logBy ?? 'reps'
}

export function isTimed(x: { logBy?: LogMode }): boolean {
  return x.logBy === 'time'
}

/** "25:00", "1:02:30" — a stopwatch-style duration. */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Short target label: "20 min", "45 s", "1 h 30 min". */
export function fmtTargetDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * Parse typed durations. A bare number is minutes ("25" → 25:00); colons read
 * right-to-left as s, m, h ("25:30", "1:02:30"). Returns null when unparseable.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60)
  if (!/^\d+(:\d{1,2}){1,2}$/.test(t)) return null
  const parts = t.split(':').map(Number).reverse()
  if (parts.slice(0, 2).some((p, i) => i < parts.length - 1 && p >= 60)) return null
  return parts.reduce((total, p, i) => total + p * 60 ** i, 0)
}
