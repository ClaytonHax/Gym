/**
 * Deep copy that drops `undefined` (and NaN/Infinity) values. Firestore rejects
 * undefined anywhere in a document, and the rejection surfaces as an opaque
 * failed write — so everything bound for the database goes through this first.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      if (typeof v === 'number' && !Number.isFinite(v)) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}
