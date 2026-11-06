import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ProfileDetail, SharedWorkout, StatsDetail } from '../lib/sharing'

export interface FriendShared {
  workouts: Map<string, SharedWorkout>
  stats: StatsDetail | null
  details: ProfileDetail | null
}

const EMPTY: FriendShared = { workouts: new Map(), stats: null, details: null }

/**
 * What a friend chose to share in depth. Live, so when they switch a setting off
 * the content disappears here at once. Permission errors just mean "nothing shared".
 */
export function useFriendShared(uid: string, enabled: boolean): FriendShared {
  const [state, setState] = useState<FriendShared>(EMPTY)

  useEffect(() => {
    setState(EMPTY)
    if (!uid || !enabled) return
    const unsubs = [
      onSnapshot(
        query(collection(db, 'users', uid, 'sharedWorkouts'), orderBy('startedAt', 'desc')),
        (snap) => {
          const workouts = new Map<string, SharedWorkout>()
          for (const d of snap.docs) workouts.set(d.id, d.data() as SharedWorkout)
          setState((prev) => ({ ...prev, workouts }))
        },
        () => setState((prev) => ({ ...prev, workouts: new Map() }))
      ),
      onSnapshot(
        doc(db, 'users', uid, 'public', 'statsDetail'),
        (snap) => setState((prev) => ({ ...prev, stats: snap.exists() ? (snap.data() as StatsDetail) : null })),
        () => setState((prev) => ({ ...prev, stats: null }))
      ),
      onSnapshot(
        doc(db, 'users', uid, 'public', 'profileDetail'),
        (snap) => setState((prev) => ({ ...prev, details: snap.exists() ? (snap.data() as ProfileDetail) : null })),
        () => setState((prev) => ({ ...prev, details: null }))
      ),
    ]
    return () => unsubs.forEach((u) => u())
  }, [uid, enabled])

  return state
}
