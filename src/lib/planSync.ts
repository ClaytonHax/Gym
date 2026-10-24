import type { FirestoreTime, Plan, PlanDay } from '../types'

/** What to do with a followed copy given the source's latest `updatedAt` (ISO), or null if the source is gone. */
export type SyncAction = 'none' | 'auto' | 'prompt' | 'orphaned'

/** Firestore Timestamp -> ISO string; null while a server timestamp is still pending. */
export function isoOf(t: FirestoreTime | undefined): string | null {
  return t ? new Date(t.toMillis()).toISOString() : null
}

/**
 * Pure sync decision for a copy someone made from a published plan.
 * - source deleted -> orphaned (the copy keeps working)
 * - not newer than what the copy last synced -> none
 * - newer: untouched copies update themselves (auto); customised ones, and legacy
 *   copies that predate syncedAt (we can't tell what they were based on), ask first.
 */
export function syncAction(copy: Plan, source: { updatedAt: string } | null): SyncAction {
  const from = copy.sharedFrom
  if (!from) return 'none'
  if (!source) return 'orphaned'
  if (!from.syncedAt) return 'prompt'
  if (Date.parse(source.updatedAt) <= Date.parse(from.syncedAt)) return 'none'
  return from.customized ? 'prompt' : 'auto'
}

/** Drop every occurrence of one exercise from a plan's days (days are never removed). */
export function stripExercise(days: PlanDay[], exerciseId: string): PlanDay[] {
  return days.map((d) =>
    d.exercises.some((e) => e.exerciseId === exerciseId)
      ? { ...d, exercises: d.exercises.filter((e) => e.exerciseId !== exerciseId) }
      : d
  )
}

export function hasExercise(days: PlanDay[], exerciseId: string): boolean {
  return days.some((d) => d.exercises.some((e) => e.exerciseId === exerciseId))
}

/** JSON with sorted keys: Firestore hands maps back in a different key order than we wrote them. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val
  )
}

/** Same name and same days, ignoring key order, undefined fields and day ids (copies get fresh ones). */
export function samePlanContent(
  a: { name: string; days: PlanDay[] },
  b: { name: string; days: PlanDay[] }
): boolean {
  const norm = (p: { name: string; days: PlanDay[] }) =>
    canonical({ name: p.name.trim(), days: p.days.map(({ id: _id, ...rest }) => rest) })
  return norm(a) === norm(b)
}

/**
 * Which private plan of the owner's becomes the published classic PPL: one already
 * linked wins (so seeding is idempotent), then one without the removed exercise,
 * then the most recently edited. Plans published under another id are left alone.
 */
export function pickOwnerPplPlan(
  plans: Plan[],
  opts: { templateId: string; publicId: string; avoidExerciseId?: string }
): Plan | null {
  const candidates = plans.filter(
    (p) =>
      (!p.publishedId || p.publishedId === opts.publicId) &&
      (p.publishedId === opts.publicId ||
        p.templateId === opts.templateId ||
        p.sharedFrom?.publicPlanId === opts.publicId ||
        /push.*pull.*legs/i.test(p.name))
  )
  const rank = (p: Plan) => [
    p.publishedId === opts.publicId ? 0 : 1,
    opts.avoidExerciseId && hasExercise(p.days, opts.avoidExerciseId) ? 1 : 0,
  ]
  candidates.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra[0] - rb[0] || ra[1] - rb[1] || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })
  return candidates[0] ?? null
}
