import { MUSCLE_GROUPS } from '../data/exercises'
import type { CardioField, Exercise, MuscleGroup } from '../types'

export type SharedExercise = Omit<Exercise, 'id' | 'custom'>

const CARDIO_FIELDS: CardioField[] = ['speed', 'incline', 'level', 'distance']

/** Link that opens the import screen for this exercise. The data rides in the URL, no server needed. */
export function exerciseShareUrl(ex: Exercise, origin = window.location.origin): string {
  const data: SharedExercise = {
    name: ex.name,
    muscle: ex.muscle,
    tracksWeight: ex.tracksWeight,
    ...(ex.equipment ? { equipment: ex.equipment } : {}),
    ...(ex.logBy ? { logBy: ex.logBy } : {}),
    ...(ex.cardioFields?.length ? { cardioFields: ex.cardioFields } : {}),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(data))
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${origin}/x/${b64}`
}

/** Parses and sanitises a shared exercise; null when the link is garbled. */
export function parseSharedExercise(code: string): SharedExercise | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
    if (!name || !MUSCLE_GROUPS.includes(raw.muscle)) return null
    const timed = raw.logBy === 'time'
    const fields = Array.isArray(raw.cardioFields)
      ? raw.cardioFields.filter((f: unknown): f is CardioField => CARDIO_FIELDS.includes(f as CardioField))
      : []
    return {
      name,
      muscle: raw.muscle as MuscleGroup,
      tracksWeight: timed ? false : raw.tracksWeight !== false,
      ...(typeof raw.equipment === 'string' && raw.equipment ? { equipment: raw.equipment.slice(0, 40) } : {}),
      ...(timed ? { logBy: 'time' as const, ...(fields.length ? { cardioFields: fields } : {}) } : {}),
    }
  } catch {
    return null
  }
}
