// Shared Web Push helpers (VAPID). Only secret: VAPID_PRIVATE_KEY.
import { createHash } from 'node:crypto'
import webpush from 'web-push'

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/** Notification doc → the payload the service worker shows. */
export function message(n) {
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
    case 'streak_risk':
      return { title: 'Your streak is on the line', body: n.text || 'Train today to keep it alive.', url: '/' }
    case 'streak_lost':
      return { title: 'Streak ended', body: n.text || 'Start a new one today.', url: '/' }
    case 'friend_streak':
      return { title: 'A friend’s streak is at risk', body: n.text || 'Give them a nudge.', url: n.ref ? `/friends/${n.ref}` : '/friends' }
    default:
      return { title: 'Gym Tracker', body: n.text || '', url: '/notifications' }
  }
}

/** Send `payload` to every valid subscription. Returns { sent, gone }. */
export async function sendToSubs(subs, payload, { tag, topicSeed }) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://gym-zim.vercel.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  const body = JSON.stringify({ ...payload, tag })
  // Topic collapses duplicate deliveries of the same notification on the push service.
  const topic = createHash('sha256').update(topicSeed).digest('base64url').slice(0, 32)
  let sent = 0
  const gone = []
  await Promise.all(
    subs.map(async (sub) => {
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return
      try {
        await webpush.sendNotification(sub, body, { TTL: 60 * 60 * 24, topic, urgency: 'normal' })
        sent++
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint)
      }
    })
  )
  return { sent, gone: gone.length }
}
