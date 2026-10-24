// Shared Firestore REST helpers for the serverless functions. Every call is
// made with a Firebase ID token (the caller's, or the streak bot's), so the
// security rules decide what is allowed. No admin credentials live here.
// (Files and folders starting with `_` are not exposed as routes by Vercel.)

export const PROJECT =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'fitness-a85e8'
export const DB = `projects/${PROJECT}/databases/(default)/documents`
export const BASE = `https://firestore.googleapis.com/v1/${DB}`

/** Firestore REST "typed values" → plain JSON. */
export function decode(value) {
  if (!value || typeof value !== 'object') return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {})
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode)
  return null
}

export function decodeFields(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v)
  return out
}

/** Plain JSON → Firestore REST typed value (strings, booleans, ints, arrays only). */
export function encode(v) {
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return { integerValue: String(Math.trunc(v)) }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } }
  return { nullValue: null }
}

export async function readAs(token, docPath) {
  try {
    const res = await fetch(`${BASE}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const doc = await res.json()
    return decodeFields(doc.fields ?? {})
  } catch {
    return null
  }
}

/** One page of a collection: { docs: [{ id, data }], next }. Returns null on error. */
export async function listPage(token, collectionPath, pageSize = 100, pageToken) {
  try {
    const qs = new URLSearchParams({ pageSize: String(pageSize) })
    if (pageToken) qs.set('pageToken', pageToken)
    const res = await fetch(`${BASE}/${collectionPath}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = await res.json()
    const docs = (body.documents ?? []).map((d) => ({
      id: d.name.split('/').pop(),
      data: decodeFields(d.fields ?? {}),
    }))
    return { docs, next: body.nextPageToken || null }
  } catch {
    return null
  }
}

/** Every doc in a collection (bounded by maxDocs). */
export async function listAll(token, collectionPath, { pageSize = 100, maxDocs = 2000 } = {}) {
  const out = []
  let pageToken
  do {
    const page = await listPage(token, collectionPath, pageSize, pageToken)
    if (!page) break
    out.push(...page.docs)
    pageToken = page.next
  } while (pageToken && out.length < maxDocs)
  return out
}

/**
 * Create a document that must not exist yet, stamping `createdAt` with the
 * server's request time (what the rules compare against). Returns
 * 'created' | 'exists' | 'error'.
 */
export async function createWithTimestamp(token, docPath, data) {
  try {
    const fields = {}
    for (const [k, v] of Object.entries(data)) fields[k] = encode(v)
    const res = await fetch(`${BASE}:commit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: { name: `${DB}/${docPath}`, fields },
            updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { exists: false },
          },
        ],
      }),
    })
    if (res.ok) return 'created'
    const body = await res.json().catch(() => null)
    return body?.error?.status === 'ALREADY_EXISTS' ? 'exists' : 'error'
  } catch {
    return 'error'
  }
}

/** Sign in with email + password via the Identity Toolkit REST API → ID token. */
export async function signIn(email, password) {
  const key = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY
  if (!key) throw new Error('missing firebase api key')
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`bot sign-in failed (${res.status})`)
  const body = await res.json()
  return { idToken: body.idToken, uid: body.localId }
}
