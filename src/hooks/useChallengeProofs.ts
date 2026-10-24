import { useCallback, useSyncExternalStore } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { dayKey } from '../lib/date'
import { proofId, toIso, workoutValue, type Challenge, type Proof } from '../lib/social'
import type { PhotoSvg } from '../lib/photoSvg'
import type { Workout } from '../types'

/**
 * Proofs are big (an SVG each), so one listener per battle is shared by every
 * card / sheet that wants them and torn down when the last one unmounts.
 */
export interface ProofsState {
  proofs: Proof[]
  loading: boolean
  error: boolean
}

interface Store {
  state: ProofsState
  subs: Set<() => void>
  unsub: () => void
}

const EMPTY: ProofsState = { proofs: [], loading: true, error: false }
const IDLE: ProofsState = { proofs: [], loading: false, error: false }
const stores = new Map<string, Store>()

/** Workout ids you know have a proof — your own (SocialSync) plus any streamed battle. */
const own = new Map<string, Set<string>>()
const verifiedSubs = new Set<() => void>()
let verified: ReadonlySet<string> = new Set()

function rebuildVerified() {
  const next = new Set<string>()
  for (const ids of own.values()) for (const id of ids) next.add(id)
  for (const s of stores.values()) for (const p of s.state.proofs) next.add(p.workoutId)
  verified = next
  verifiedSubs.forEach((cb) => cb())
}

/** SocialSync reports the workouts you've proven in each battle (empty = none / gone). */
export function publishMyProofs(cid: string, workoutIds: string[] | null) {
  if (workoutIds === null) own.delete(cid)
  else own.set(cid, new Set(workoutIds))
  rebuildVerified()
}

/** Workout ids that carry a proof in a battle you can see. */
export function useVerifiedIds(): ReadonlySet<string> {
  const subscribe = useCallback((cb: () => void) => {
    verifiedSubs.add(cb)
    return () => {
      verifiedSubs.delete(cb)
    }
  }, [])
  return useSyncExternalStore(subscribe, () => verified)
}

function open(cid: string): Store {
  const existing = stores.get(cid)
  if (existing) return existing
  const store: Store = { state: EMPTY, subs: new Set(), unsub: () => {} }
  stores.set(cid, store)
  store.unsub = onSnapshot(
    collection(db, 'challenges', cid, 'proofs'),
    (snap) => {
      const proofs = snap.docs
        .map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' })
          return { ...data, id: d.id, createdAt: toIso(data.createdAt) } as Proof
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      store.state = { proofs, loading: false, error: false }
      store.subs.forEach((cb) => cb())
      rebuildVerified()
    },
    (err) => {
      console.warn('proofs listener failed', err)
      store.state = { proofs: [], loading: false, error: true }
      store.subs.forEach((cb) => cb())
    }
  )
  return store
}

/** Every proof in one battle, newest first. Pass `enabled=false` to stay unsubscribed. */
export function useChallengeProofs(cid: string, enabled = true): ProofsState {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!enabled) return () => {}
      const store = open(cid)
      store.subs.add(cb)
      return () => {
        store.subs.delete(cb)
        if (store.subs.size === 0) {
          store.unsub()
          stores.delete(cid)
          rebuildVerified()
        }
      }
    },
    [cid, enabled]
  )
  return useSyncExternalStore(subscribe, () => (enabled ? (stores.get(cid)?.state ?? EMPTY) : IDLE))
}

type Battle = Pick<Challenge, 'id' | 'metric' | 'startDay' | 'endDay'>

/** The local day a workout belongs to — what the rules compare against the battle range. */
export const workoutDay = (w: Workout) => dayKey(new Date(w.startedAt))

export function inBattleRange(c: Battle, w: Workout): boolean {
  const day = workoutDay(w)
  return day >= c.startDay && day <= c.endDay
}

const WRITE_TIMEOUT_MS = 15000

/** Writes exactly the shape firestore.rules validates. Rejects if the server doesn't answer in time. */
export async function postProof(
  c: Battle,
  uid: string,
  w: Workout,
  photo: PhotoSvg,
  caption?: string
): Promise<void> {
  const text = caption?.trim()
  const write = setDoc(doc(db, 'challenges', c.id, 'proofs', proofId(uid, w.id)), {
    uid,
    workoutId: w.id,
    day: workoutDay(w),
    workoutName: (w.planDayName ?? w.name).slice(0, 80),
    value: workoutValue(w, c.metric),
    svg: photo.svg,
    w: photo.w,
    h: photo.h,
    ...(text ? { caption: text.slice(0, 140) } : {}),
    createdAt: serverTimestamp(),
  })
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('timeout')), WRITE_TIMEOUT_MS)
  })
  try {
    await Promise.race([write, timeout])
  } finally {
    window.clearTimeout(timer)
  }
}

export function deleteProof(cid: string, p: Pick<Proof, 'id'>): Promise<void> {
  return deleteDoc(doc(db, 'challenges', cid, 'proofs', p.id))
}
