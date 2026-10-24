// Vercel serverless function (free Hobby tier): delivers a Web Push for a
// notification document the caller just wrote.
//
// It holds no Firebase admin credentials. Every read goes through the Firestore
// REST API *as the caller* (their Firebase ID token), so the security rules
// decide what is allowed: the caller must be the notification's sender, and must
// be allowed to read the recipient's push subscriptions (a friend, or someone
// with a pending friend request). The only secret here is the VAPID private key.
import { BASE, readAs } from './_lib/firestore.js'
import { message, pushConfigured, sendToSubs } from './_lib/webpush.js'

const MAX_AGE_MS = 10 * 60 * 1000
const ID = /^[A-Za-z0-9_-]{1,128}$/

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function POST(request) {
  try {
    return await handle(request)
  } catch (err) {
    console.error('push failed', err)
    return json(500, { error: 'internal error' })
  }
}

async function handle(request) {
  if (!pushConfigured()) return json(503, { error: 'push not configured' })

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'missing token' })

  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'bad json' })
  }
  const { to, id } = body ?? {}
  if (typeof to !== 'string' || typeof id !== 'string' || !ID.test(to) || !ID.test(id)) {
    return json(400, { error: 'bad input' })
  }

  const n = await readAs(token, `users/${to}/notifications/${id}`)
  if (!n || typeof n.from !== 'string' || !ID.test(n.from)) return json(403, { error: 'not allowed' })
  // Only fresh notifications can be pushed, so a replayed call can't spam.
  const created = Date.parse(n.createdAt)
  if (!n.createdAt || Number.isNaN(created) || Date.now() - created > MAX_AGE_MS) {
    return json(410, { error: 'too old' })
  }

  // Identity is uid-based: show the sender's *current* username, not the one
  // copied into the notification (which may be stale after a rename).
  const sender = await readAs(token, `profiles/${n.from}`)
  n.fromUsername = sender?.username || n.fromUsername || 'A friend'

  const push = await readAs(token, `users/${to}/public/push`)
  const subs = Array.isArray(push?.subs) ? push.subs : []
  if (subs.length === 0) return json(200, { sent: 0 })
  if (push?.prefs && push.prefs[n.type] === false) return json(200, { sent: 0, muted: true })

  const { sent, gone } = await sendToSubs(subs, message(n), {
    tag: n.type === 'nudge' ? `nudge-${n.from}` : id,
    topicSeed: `${to}/${id}`,
  })
  return json(200, { sent, gone })
}
