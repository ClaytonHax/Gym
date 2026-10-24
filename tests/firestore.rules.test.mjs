import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, collection, query, where, getDocs,
  addDoc, arrayUnion, deleteField, Timestamp,
} from 'firebase/firestore'

const RULES = readFileSync(process.argv[2] ?? fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8')
const BOT = 'streakbot'
const env = await initializeTestEnvironment({
  projectId: 'demo-gym',
  // The real bot uid is substituted by scripts/setup-streak-bot.mjs; use a fixed one here.
  firestore: { rules: RULES.replaceAll('__STREAK_BOT_UID__', BOT), host: '127.0.0.1', port: 8080 },
})

let pass = 0
let fail = 0
async function t(name, fn) {
  try {
    await fn()
    pass++
    console.log('ok  ', name)
  } catch (e) {
    fail++
    console.log('FAIL', name, e.message?.split('\n')[0])
  }
}

const A = env.authenticatedContext('alice').firestore()
const B = env.authenticatedContext('bob').firestore()
const C = env.authenticatedContext('carol').firestore()
const D = env.authenticatedContext('dave').firestore()

async function claim(db, uid, name) {
  const b = writeBatch(db)
  b.set(doc(db, 'usernames', name), { uid })
  b.set(doc(db, 'profiles', uid), {
    username: name, displayName: uid, joinedAt: serverTimestamp(), usernameChangedAt: serverTimestamp(), freeChange: true,
  })
  return b.commit()
}

await t('alice claims username', () => assertSucceeds(claim(A, 'alice', 'alice1')))
await t('bob claims username', () => assertSucceeds(claim(B, 'bob', 'bob1')))
await t('carol claims username', () => assertSucceeds(claim(C, 'carol', 'carol1')))
await t('carol cannot steal alice1', () => assertFails(claim(C, 'carol', 'alice1')))
await t('owner writes own stats', () => assertSucceeds(setDoc(doc(B, 'users/bob/public/stats'), { asOf: 'x' })))
await t('profiles searchable', () =>
  assertSucceeds(getDocs(query(collection(C, 'profiles'), where('username', '>=', 'al'), where('username', '<=', 'al')))))

async function rename(db, uid, from, to) {
  const b = writeBatch(db)
  b.delete(doc(db, 'usernames', from))
  b.set(doc(db, 'usernames', to), { uid })
  b.update(doc(db, 'profiles', uid), { username: to, usernameChangedAt: serverTimestamp(), freeChange: false })
  return b.commit()
}
await t('free rename', () => assertSucceeds(rename(A, 'alice', 'alice1', 'alice')))
await t('second rename blocked (cooldown)', () => assertFails(rename(A, 'alice', 'alice', 'alice2')))
await t('rename without releasing old blocked', async () => {
  const b = writeBatch(C)
  b.set(doc(C, 'usernames', 'carol2'), { uid: 'carol' })
  b.update(doc(C, 'profiles', 'carol'), { username: 'carol2', usernameChangedAt: serverTimestamp(), freeChange: false })
  await assertFails(b.commit())
})
await t('displayName update ok', () => assertSucceeds(updateDoc(doc(A, 'profiles/alice'), { displayName: 'Alice A' })))
await t('cannot reset freeChange', () => assertFails(updateDoc(doc(A, 'profiles/alice'), { freeChange: true })))
await t('cooldown passes after 30 days', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'profiles/alice'), {
      usernameChangedAt: Timestamp.fromMillis(Date.now() - 31 * 86400000),
    })
  })
  await assertSucceeds(rename(A, 'alice', 'alice', 'alice_x'))
})

// Friend flow
await t('non-friend cannot read stats', () => assertFails(getDoc(doc(A, 'users/bob/public/stats'))))
const req = () => setDoc(doc(A, 'friendRequests/alice_bob'), {
  from: 'alice', to: 'bob', createdAt: serverTimestamp(), fromUsername: 'alice_x', fromName: 'A', toUsername: 'bob1', toName: 'B',
})
await t('request with wrong id fails', () => assertFails(setDoc(doc(A, 'friendRequests/x_bob'), {
  from: 'alice', to: 'bob', createdAt: serverTimestamp(), fromUsername: '', fromName: '', toUsername: '', toName: '',
})))
await t('alice sends request', () => assertSucceeds(req()))
await t('bob lists incoming', () => assertSucceeds(getDocs(query(collection(B, 'friendRequests'), where('to', '==', 'bob')))))
await t('carol cannot read request', () => assertFails(getDoc(doc(C, 'friendRequests/alice_bob'))))
await t('requester can read push doc', () => assertSucceeds(getDoc(doc(A, 'users/bob/public/push'))))
await t('friend_request notification', () => assertSucceeds(setDoc(doc(A, 'users/bob/notifications/friend_request_alice_1'), {
  type: 'friend_request', from: 'alice', fromUsername: 'alice_x', read: false, createdAt: serverTimestamp(),
})))
await t('sender reads own notification', () => assertSucceeds(getDoc(doc(A, 'users/bob/notifications/friend_request_alice_1'))))
await t('carol cannot spoof notification', () => assertFails(setDoc(doc(C, 'users/bob/notifications/nudge_carol_1'), {
  type: 'nudge', from: 'carol', fromUsername: 'c', read: false, createdAt: serverTimestamp(),
})))
await t('carol cannot add herself to bob friends', () => assertFails(setDoc(doc(C, 'users/bob/friends/carol'), { since: serverTimestamp() })))
await t('bob accepts', async () => {
  const b = writeBatch(B)
  b.set(doc(B, 'users/bob/friends/alice'), { since: serverTimestamp() })
  b.set(doc(B, 'users/alice/friends/bob'), { since: serverTimestamp() })
  b.delete(doc(B, 'friendRequests/alice_bob'))
  await assertSucceeds(b.commit())
})
await t('alice reads bob stats', () => assertSucceeds(getDoc(doc(A, 'users/bob/public/stats'))))
await t('carol still cannot', () => assertFails(getDoc(doc(C, 'users/bob/public/stats'))))
await t('alice cannot read bob workouts', () => assertFails(getDoc(doc(A, 'users/bob/workouts/w1'))))

const day = Math.floor(Date.now() / 86400000)
const nudge = (db, id) => setDoc(doc(db, `users/bob/notifications/${id}`), {
  type: 'nudge', from: 'alice', fromUsername: 'alice_x', read: false, createdAt: serverTimestamp(), text: 'go',
})
await t('nudge with wrong day fails', () => assertFails(nudge(A, `nudge_alice_${day - 1}`)))
await t('nudge once', () => assertSucceeds(nudge(A, `nudge_alice_${day}`)))
await t('second nudge same day fails', () => assertFails(nudge(A, `nudge_alice_${day}`)))

// Activity reactions
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'users/bob/activity/w1'), { name: 'Pull 2', at: '2026', reactions: {} })
})
await t('alice reads bob activity list', () => assertSucceeds(getDocs(collection(A, 'users/bob/activity'))))
await t('alice reacts', () => assertSucceeds(updateDoc(doc(A, 'users/bob/activity/w1'), { 'reactions.alice': 'fire' })))
await t('alice clears reaction', () => assertSucceeds(updateDoc(doc(A, 'users/bob/activity/w1'), { 'reactions.alice': deleteField() })))
await t('alice cannot fake bob reaction', () => assertFails(updateDoc(doc(A, 'users/bob/activity/w1'), { 'reactions.carol': 'fire' })))
await t('alice cannot edit workout', () => assertFails(updateDoc(doc(A, 'users/bob/activity/w1'), { name: 'lol' })))
await t('carol cannot react', () => assertFails(updateDoc(doc(C, 'users/bob/activity/w1'), { 'reactions.carol': 'fire' })))

// Challenges
let cid
const challenge = (db, members) => addDoc(collection(db, 'challenges'), {
  creator: members[0], members, accepted: [members[0]], declined: [], metric: 'workouts', title: 'Most workouts',
  startDay: '2026-10-24', endDay: '2026-10-30', createdAt: serverTimestamp(), scores: { [members[0]]: 1 },
})
await t('challenge non-friend fails', () => assertFails(challenge(A, ['alice', 'carol'])))
await t('challenge friend', async () => {
  const ref = await assertSucceeds(challenge(A, ['alice', 'bob']))
  cid = ref.id
})
await t('bob lists challenges', () => assertSucceeds(getDocs(query(collection(B, 'challenges'), where('members', 'array-contains', 'bob')))))
await t('bob joins', () => assertSucceeds(updateDoc(doc(B, `challenges/${cid}`), { accepted: arrayUnion('bob'), 'scores.bob': 3 })))
await t('bob cannot set alice score', () => assertFails(updateDoc(doc(B, `challenges/${cid}`), { 'scores.alice': 0 })))
await t('bob cannot change metric', () => assertFails(updateDoc(doc(B, `challenges/${cid}`), { metric: 'volume' })))
await t('challenge_invite notification', () => assertSucceeds(setDoc(doc(A, `users/bob/notifications/challenge_invite_alice_${cid}`), {
  type: 'challenge_invite', from: 'alice', fromUsername: 'alice_x', read: false, createdAt: serverTimestamp(), text: 'x',
})))
await t('bob cannot delete alice challenge', () => assertFails(deleteDoc(doc(B, `challenges/${cid}`))))
await t('alice deletes challenge', () => assertSucceeds(deleteDoc(doc(A, `challenges/${cid}`))))

await t('unfriend by bob', async () => {
  const b = writeBatch(B)
  b.delete(doc(B, 'users/bob/friends/alice'))
  b.delete(doc(B, 'users/alice/friends/bob'))
  await assertSucceeds(b.commit())
})
await t('alice loses access', () => assertFails(getDoc(doc(A, 'users/bob/public/stats'))))

// ---- Added coverage ----
await t('confirm username keeps name, spends free change', async () => {
  await assertSucceeds(updateDoc(doc(C, 'profiles/carol'), { freeChange: false, usernameChangedAt: serverTimestamp() }))
})
await t('rename right after confirm blocked (cooldown)', () => assertFails(rename(C, 'carol', 'carol1', 'carolnew')))
await t('confirming twice fails', () =>
  assertFails(updateDoc(doc(C, 'profiles/carol'), { freeChange: false, usernameChangedAt: serverTimestamp() })))
await t('confirm with client-chosen timestamp fails', async () => {
  await assertSucceeds(claim(D, 'dave', 'dave1'))
  await assertFails(updateDoc(doc(D, 'profiles/dave'), { freeChange: false, usernameChangedAt: Timestamp.fromMillis(Date.now() + 1e9) }))
})
await t('cannot write another user profile', () => assertFails(updateDoc(doc(C, 'profiles/dave'), { displayName: 'hax' })))
await t('cannot create usernames entry for someone else', () => assertFails(setDoc(doc(C, 'usernames/stolen'), { uid: 'dave' })))
await t('cannot create usernames entry pointing at self without profile', () => assertFails(setDoc(doc(C, 'usernames/orphan'), { uid: 'carol' })))

// Friendship is keyed by uid and survives a rename.
await t('re-friend alice/bob', async () => {
  await assertSucceeds(req())
  const b = writeBatch(B)
  b.set(doc(B, 'users/bob/friends/alice'), { since: serverTimestamp() })
  b.set(doc(B, 'users/alice/friends/bob'), { since: serverTimestamp() })
  b.delete(doc(B, 'friendRequests/alice_bob'))
  await assertSucceeds(b.commit())
})
await t('bob renames (free change)', () => assertSucceeds(rename(B, 'bob', 'bob1', 'bobby')))
await t('alice still reads bob stats after rename', () => assertSucceeds(getDoc(doc(A, 'users/bob/public/stats'))))

await t('unknown notification type fails', () => assertFails(setDoc(doc(A, 'users/bob/notifications/bogus_alice_1'), {
  type: 'bogus', from: 'alice', fromUsername: 'a', read: false, createdAt: serverTimestamp(),
})))
await t('notification text over 140 chars fails', () => assertFails(setDoc(doc(A, 'users/bob/notifications/kudos_alice_long'), {
  type: 'kudos', from: 'alice', fromUsername: 'a', read: false, createdAt: serverTimestamp(), text: 'x'.repeat(141),
})))
await t('notification text of 140 chars ok', () => assertSucceeds(setDoc(doc(A, 'users/bob/notifications/kudos_alice_ok'), {
  type: 'kudos', from: 'alice', fromUsername: 'a', read: false, createdAt: serverTimestamp(), text: 'x'.repeat(140),
})))
await t('non-member cannot read challenge', async () => {
  const ref = await assertSucceeds(challenge(A, ['alice', 'bob']))
  await assertFails(getDoc(doc(C, `challenges/${ref.id}`)))
  await assertSucceeds(getDoc(doc(B, `challenges/${ref.id}`)))
})

// ---- Streak bot ----
const botDb = env.authenticatedContext(BOT).firestore()
const watch = (extra = {}) => ({
  tz: 'Africa/Johannesburg', unit: 'day', current: 5, asOfDay: '2026-10-24', lastWorkoutDay: '2026-10-23',
  restDays: ['2026-10-25'], weeklyGoal: 3, weekStart: '2026-10-19', workoutsThisWeek: 2, prevWeekWorkouts: 3,
  streakBeforePrev: 2, updatedAt: '2026-10-24T10:00:00Z', ...extra,
})
await t('owner writes own streakWatch', () => assertSucceeds(setDoc(doc(B, 'streakWatch/bob'), watch())))
await t('streakWatch with extra field fails', () => assertFails(setDoc(doc(B, 'streakWatch/bob'), watch({ secret: 'x' }))))
await t('streakWatch with bad unit fails', () => assertFails(setDoc(doc(B, 'streakWatch/bob'), watch({ unit: 'month' }))))
await t('streakWatch with too many rest days fails', () =>
  assertFails(setDoc(doc(B, 'streakWatch/bob'), watch({ restDays: Array(15).fill('2026-10-25') }))))
await t('cannot write others streakWatch', () => assertFails(setDoc(doc(A, 'streakWatch/bob'), watch())))
await t('friend cannot read streakWatch', () => assertFails(getDoc(doc(A, 'streakWatch/bob'))))
await t('stranger cannot list streakWatch', () => assertFails(getDocs(collection(C, 'streakWatch'))))
await t('owner reads own streakWatch', () => assertSucceeds(getDoc(doc(B, 'streakWatch/bob'))))
await t('bot lists streakWatch', () => assertSucceeds(getDocs(collection(botDb, 'streakWatch'))))
await t('bot cannot write streakWatch', () => assertFails(setDoc(doc(botDb, 'streakWatch/bob'), watch())))
await t('bot reads friends list', () => assertSucceeds(getDocs(collection(botDb, 'users/bob/friends'))))
await t('bot reads push doc', () => assertSucceeds(getDoc(doc(botDb, 'users/bob/public/push'))))
await t('bot cannot read stats', () => assertFails(getDoc(doc(botDb, 'users/bob/public/stats'))))
await t('bot cannot read workouts', () => assertFails(getDoc(doc(botDb, 'users/bob/workouts/w1'))))
await t('bot cannot read bodylog', () => assertFails(getDocs(collection(botDb, 'users/bob/bodylog'))))
await t('bot cannot write push doc', () => assertFails(setDoc(doc(botDb, 'users/bob/public/push'), { subs: [] })))
await t('bot cannot write friends', () => assertFails(setDoc(doc(botDb, 'users/bob/friends/bot'), { since: serverTimestamp() })))
await t('bot reads profiles', () => assertSucceeds(getDoc(doc(botDb, 'profiles/bob'))))
const botN = (type, extra = {}) => ({
  type, from: BOT, fromUsername: 'Gym', read: false, createdAt: serverTimestamp(), text: 'streak', ...extra,
})
await t('bot creates streak_risk', () =>
  assertSucceeds(setDoc(doc(botDb, `users/bob/notifications/streak_risk_${BOT}_2026-10-24`), botN('streak_risk'))))
await t('bot streak_risk twice same id fails', () =>
  assertFails(setDoc(doc(botDb, `users/bob/notifications/streak_risk_${BOT}_2026-10-24`), botN('streak_risk'))))
await t('bot creates streak_lost', () =>
  assertSucceeds(setDoc(doc(botDb, `users/bob/notifications/streak_lost_${BOT}_2026-10-24`), botN('streak_lost'))))
await t('bot streak id with bad day fails', () =>
  assertFails(setDoc(doc(botDb, `users/bob/notifications/streak_risk_${BOT}_whenever`), botN('streak_risk'))))
await t('bot creates friend_streak for a friend', () =>
  assertSucceeds(setDoc(doc(botDb, `users/alice/notifications/friend_streak_${BOT}_bob_2026-10-24`), botN('friend_streak', { ref: 'bob' }))))
await t('bot friend_streak to non-friend fails', () =>
  assertFails(setDoc(doc(botDb, `users/carol/notifications/friend_streak_${BOT}_bob_2026-10-24`), botN('friend_streak', { ref: 'bob' }))))
await t('bot friend_streak without ref fails', () =>
  assertFails(setDoc(doc(botDb, `users/alice/notifications/friend_streak_${BOT}_bob_2026-10-25`), botN('friend_streak'))))
await t('bot cannot create nudge', () =>
  assertFails(setDoc(doc(botDb, `users/alice/notifications/nudge_${BOT}_${day}`), botN('nudge'))))
await t('bot cannot create kudos', () =>
  assertFails(setDoc(doc(botDb, 'users/alice/notifications/kudos_streakbot_1'), botN('kudos'))))
await t('bot notification with text over 140 fails', () =>
  assertFails(setDoc(doc(botDb, `users/bob/notifications/streak_risk_${BOT}_2026-10-26`), botN('streak_risk', { text: 'x'.repeat(141) }))))
await t('bot notification with client timestamp fails', () =>
  assertFails(setDoc(doc(botDb, `users/bob/notifications/streak_risk_${BOT}_2026-10-27`), botN('streak_risk', { createdAt: Timestamp.fromMillis(1) }))))
await t('user cannot create streak_risk', () =>
  assertFails(setDoc(doc(A, 'users/bob/notifications/streak_risk_alice_2026-10-24'), { ...botN('streak_risk'), from: 'alice' })))
await t('user cannot create friend_streak', () =>
  assertFails(setDoc(doc(A, 'users/bob/notifications/friend_streak_alice_bob_2026-10-24'), { ...botN('friend_streak', { ref: 'bob' }), from: 'alice' })))
await t('user cannot spoof the bot', () =>
  assertFails(setDoc(doc(A, `users/bob/notifications/streak_risk_${BOT}_2026-10-28`), botN('streak_risk'))))

// With the placeholder still in place, nobody is the bot.
const envPh = await initializeTestEnvironment({
  projectId: 'demo-gym-placeholder',
  firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
})
await envPh.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'streakWatch/bob'), watch())
  await setDoc(doc(ctx.firestore(), 'users/bob/friends/alice'), { since: Timestamp.now() })
})
for (const uid of [BOT, 'alice', 'x', '__STREAK_BOT_UI']) {
  const pdb = envPh.authenticatedContext(uid).firestore()
  await t(`placeholder rules: ${uid} cannot list streakWatch`, () => assertFails(getDocs(collection(pdb, 'streakWatch'))))
}
await t('placeholder rules: unauthenticated denied', () => assertFails(getDocs(collection(envPh.unauthenticatedContext().firestore(), 'streakWatch'))))
await t('placeholder rules: bot uid cannot create notification', () =>
  assertFails(setDoc(doc(envPh.authenticatedContext(BOT).firestore(), `users/bob/notifications/streak_risk_${BOT}_2026-10-24`), botN('streak_risk'))))
await envPh.cleanup()

console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
