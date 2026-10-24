// Vercel serverless function (free Hobby tier): delivers a Web Push for a
// notification document the caller just wrote.
//
// It holds no Firebase admin credentials. Every read goes through the Firestore
// REST API *as the caller* (their Firebase ID token), so the security rules
// decide what is allowed: the caller must be the notification's sender, and must
// be allowed to read the recipient's push subscriptions (a friend, or someone
// with a pending friend request). The only secret here is the VAPID private key.
import { createHash } from 'node:crypto'
import webpush from 'web-push'

const PROJECT =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'fitness-a85e8'
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const MAX_AGE_MS = 10 * 60 * 1000
const ID = /^[A-Za-z0-9_-]{1,128}$/

/** Firestore REST "typed values" → plain JSON. */
function decode(value) {
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

function decodeFields(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v)
  return out
}

async function readAs(token, docPath) {
  const res = await fetch(`${BASE}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const json = await res.json()
  return decodeFields(json.fields ?? {})
}

function message(n) {
  const who = `@${n.fromUsername}`
  switch (n.type) {
    case 'friend_request':
      return { title: 'New friend request', body: `${who} wants to train with you.`, url: '/friends?tab=friends' }
    case 'friend_accept':
      return { title: 'Friend request accepted', body: `${who} is now your friend. Time to compete.`, url: `/friends/${n.from}` }
    case 'nudge':
      return { title: `${who} nudged you`, body: n.text || 'Time to train!', url: '/' }
    case 'kudos':
      return { title: `${who} reacted to your workout`, body: n.text || 'Keep it up!', url: n.ref ? `/history/${n.ref}` : '/friends' }
    case 'workout':
      return { title: `${who} just trained`, body: n.text || 'Your move.', url: `/friends/${n.from}` }
    case 'challenge_invite':
      return { title: `${who} challenged you`, body: n.text || 'Accept the challenge?', url: '/friends?tab=challenges' }
    case 'challenge_join':
      return { title: `${who} accepted your challenge`, body: n.text || 'Game on.', url: '/friends?tab=challenges' }
    default:
      return { title: 'Gym Tracker', body: n.text || '', url: '/notifications' }
  }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function POST(request) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json(503, { error: 'push not configured' })

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
  if (!n) return json(403, { error: 'not allowed' })
  // Only fresh notifications can be pushed, so a replayed call can't spam.
  if (!n.createdAt || Date.now() - Date.parse(n.createdAt) > MAX_AGE_MS) {
    return json(410, { error: 'too old' })
  }

  const push = await readAs(token, `users/${to}/public/push`)
  const subs = Array.isArray(push?.subs) ? push.subs : []
  if (subs.length === 0) return json(200, { sent: 0 })
  if (push?.prefs && push.prefs[n.type] === false) return json(200, { sent: 0, muted: true })

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://gym-zim.vercel.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )

  const payload = JSON.stringify({ ...message(n), tag: n.type === 'nudge' ? `nudge-${n.from}` : id })
  // Topic collapses duplicate deliveries of the same notification on the push service.
  const topic = createHash('sha256').update(`${to}/${id}`).digest('base64url').slice(0, 32)

  let sent = 0
  const gone = []
  await Promise.all(
    subs.map(async (sub) => {
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return
      try {
        await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24, topic, urgency: 'normal' })
        sent++
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint)
      }
    })
  )
  return json(200, { sent, gone: gone.length })
}
