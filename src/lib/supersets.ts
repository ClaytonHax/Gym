/** Anything that can be grouped into a superset (plan items and live workout exercises). */
type Groupable = { supersetId?: string }

/** True when item `i` and the one after it share a superset. */
export function linkedToNext(items: Groupable[], i: number): boolean {
  const id = items[i]?.supersetId
  return Boolean(id) && items[i + 1]?.supersetId === id
}

function strip<T extends Groupable>(item: T): T {
  const { supersetId: _unused, ...rest } = item
  return rest as T
}

/**
 * Drop superset ids that no longer join neighbours — after a move or removal a
 * lone exercise shouldn't still read as "Superset". Unchanged items keep their identity.
 */
export function tidySupersets<T extends Groupable>(items: T[]): T[] {
  return items.map((it, i) =>
    it.supersetId && !linkedToNext(items, i) && !linkedToNext(items, i - 1) ? strip(it) : it
  )
}

/** Join item `i` with the next one, or split them apart if they're already joined. */
export function toggleSupersetWithNext<T extends Groupable>(items: T[], i: number, newId: () => string): T[] {
  const a = items[i]
  const b = items[i + 1]
  if (!a || !b) return items
  if (linkedToNext(items, i)) {
    // Split: everything after the break gets a fresh id so it stays grouped with its own partners.
    const id = a.supersetId
    const fresh = newId()
    const next = items.map((it, j) => (j > i && it.supersetId === id ? { ...it, supersetId: fresh } : it))
    return tidySupersets(next)
  }
  const id = a.supersetId ?? b.supersetId ?? newId()
  const old = b.supersetId
  return items.map((it, j) =>
    j === i || j === i + 1 || (old && it.supersetId === old) ? { ...it, supersetId: id } : it
  )
}

/** Move item `from` to position `to`, then tidy any superset it left behind. */
export function moveItem<T extends Groupable>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return tidySupersets(next)
}

export const newSupersetId = () => `ss-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const SUPERSET_COLORS = ['#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#ef4444', '#84cc16']

/** Each superset in the list gets its own colour, by order of first appearance. */
export function supersetColor(items: Groupable[], i: number): string | undefined {
  const id = items[i]?.supersetId
  if (!id) return undefined
  const ids = [...new Set(items.map((it) => it.supersetId).filter(Boolean))]
  return SUPERSET_COLORS[ids.indexOf(id) % SUPERSET_COLORS.length]
}
