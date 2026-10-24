import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, collection, query, where, getDocs,
  addDoc, arrayUnion, deleteField, Timestamp,
} from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-gym',
  firestore: { rules: readFileSync(process.argv[2] ?? fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8'), host: '127.0.0.1', port: 8080 },
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

console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail ? 1 : 0)
