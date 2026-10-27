// Daily Vercel Cron (Hobby: once a day). Signs in as a dedicated "streak bot"
// Firebase user and, using only Firestore REST + the security rules, finds users
// whose streak is about to end (or just ended), then writes an inbox notification
// and sends Web Push to them, and "nudge them?" notifications to their friends.
// No admin SDK / service account. Env: CRON_SECRET, BOT_EMAIL, BOT_PASSWORD,
// VITE_FIREBASE_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
import { createWithTimestamp, listAll, readAs, signIn } from './_lib/firestore.js'
import { evaluateWatch, forgottenWorkout, localParts, missedPlanDay, reminderHour } from './_lib/streakLogic.js'
import { message, pushConfigured, sendToSubs } from './_lib/webpush.js'

export const config = { maxDuration: 60 }

const BUDGET_MS = 50_000
const CONCURRENCY = 8
const MAX_FRIENDS = 200

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function GET(request) {
  try {
    return await run(request)
  } catch (err) {
    console.error('streak-check failed', err)
    return json(200, { ok: false, error: 'internal error' })
  }
}

async function run(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json(401, { error: 'unauthorized' })
  }
  const { BOT_EMAIL, BOT_PASSWORD } = process.env
  if (!BOT_EMAIL || !BOT_PASSWORD) return json(503, { error: 'bot not configured' })

  const started = Date.now()
  const bot = await signIn(BOT_EMAIL, BOT_PASSWORD)

  // Manual check (needs the cron secret): /api/streak-check?test=<username> sends that user one real reminder.
  const testUser = new URL(request.url).searchParams.get('test')
  if (testUser) return json(200, await sendTest(bot, testUser))
  const watches = await listAll(bot.idToken, 'streakWatch', { pageSize: 100, maxDocs: 3000 })
  const summary = { ok: true, users: watches.length, risk: 0, lost: 0, unfinished: 0, missed: 0, friendPings: 0, pushes: 0, errors: 0, skipped: 0 }

  let i = 0
  async function worker() {
    while (i < watches.length) {
      if (Date.now() - started > BUDGET_MS) {
        summary.skipped += watches.length - i
        return
      }
      const w = watches[i++]
      try {
        await handleUser(bot, w, summary)
      } catch (err) {
        summary.errors++
        console.error('streak user failed', w.id, err?.message)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return json(200, summary)
}

/** Sends one finish_workout reminder to a username through the real delivery path. */
async function sendTest(bot, username) {
  const summary = { ok: true, test: true, pushes: 0, errors: 0 }
  const entry = await readAs(bot.idToken, `usernames/${username.toLowerCase()}`)
  if (!entry?.uid) return { ok: false, error: 'unknown username' }
  const text = 'Test reminder: this is how the "finish your workout" nudge will look.'
  const day = localParts('UTC').day
  summary.created = await deliver(bot, entry.uid, { type: 'finish_workout', text }, `finish_workout_${bot.uid}_${day}`, summary)
  return summary
}

/** Inbox notification (once per id) + push. Returns true if newly created. */
async function deliver(bot, to, n, id, summary) {
  const doc = { type: n.type, from: bot.uid, fromUsername: 'Gym', text: n.text, read: false }
  if (n.ref) doc.ref = n.ref
  const res = await createWithTimestamp(bot.idToken, `users/${to}/notifications/${id}`, doc)
  if (res === 'error') summary.errors++
  if (res !== 'created') return false
  if (!pushConfigured()) return true
  const push = await readAs(bot.idToken, `users/${to}/public/push`)
  const subs = Array.isArray(push?.subs) ? push.subs : []
  if (subs.length === 0 || push?.prefs?.[n.type] === false) return true
  const r = await sendToSubs(subs, message({ ...doc, ref: n.ref }), { tag: id, topicSeed: `${to}/${id}` })
  summary.pushes += r.sent
  return true
}

async function handleUser(bot, w, summary) {
  const data = w.data
  const tz = typeof data.tz === 'string' ? data.tz : 'UTC'
  const now = localParts(tz)
  const uid = w.id
  const canRemind = reminderHour(now.hour)

  if (canRemind && forgottenWorkout(data)) {
    const text = 'You logged sets but never finished your workout. Open the app and press Complete workout so it counts.'
    if (await deliver(bot, uid, { type: 'finish_workout', text }, `finish_workout_${bot.uid}_${now.day}`, summary)) summary.unfinished++
  }

  const verdict = evaluateWatch(data, now)
  const missed = canRemind && missedPlanDay(data, now)
  if (!verdict.status && !missed) return
  const unit = data.unit === 'week' ? 'week' : 'day'
  const n = verdict.streak
  const label = `${n}-${unit}`

  if (!verdict.status) {
    const text = 'You missed a workout. Get to the gym today, or open the app to skip a day.'
    if (await deliver(bot, uid, { type: 'missed_day', text }, `missed_day_${bot.uid}_${now.day}`, summary)) summary.missed++
    return
  }

  if (verdict.status === 'lost') {
    const text = missed
      ? `Your ${label} streak ended. Get to the gym today, or open the app to skip a day.`
      : `Your ${label} streak ended. Start a new one today.`
    if (await deliver(bot, uid, { type: 'streak_lost', text }, `streak_lost_${bot.uid}_${now.day}`, summary)) summary.lost++
    return
  }

  const text =
    unit === 'day'
      ? `Your ${label} streak ends tonight. Train today to keep it.`
      : `Your ${label} streak ends this week. Train today to keep it alive.`
  const fresh = await deliver(bot, uid, { type: 'streak_risk', text }, `streak_risk_${bot.uid}_${now.day}`, summary)
  if (!fresh) return
  summary.risk++

  const profile = await readAs(bot.idToken, `profiles/${uid}`)
  const name = profile?.username || 'A friend'
  const friends = (await listAll(bot.idToken, `users/${uid}/friends`, { pageSize: 100, maxDocs: MAX_FRIENDS })).map((f) => f.id)
  const ftext = (
    unit === 'day'
      ? `@${name}’s ${label} streak ends tonight. Nudge them?`
      : `@${name}’s ${label} streak ends this week. Nudge them?`
  ).slice(0, 140)
  for (const f of friends) {
    try {
      const ok = await deliver(bot, f, { type: 'friend_streak', text: ftext, ref: uid }, `friend_streak_${bot.uid}_${uid}_${now.day}`, summary)
      if (ok) summary.friendPings++
    } catch (err) {
      summary.errors++
    }
  }
}
