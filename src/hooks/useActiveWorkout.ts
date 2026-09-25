import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { ActiveWorkout } from '../types'

const LOCAL_KEY = 'gym.activeWorkout'

function readLocal(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

/**
 * The in-progress session. localStorage is the source of truth while training
 * (instant, works with no signal); Firestore mirrors it so a session started on
 * the phone can be finished on a laptop.
 */
export function useActiveWorkout() {
  const { user } = useAuth()
  const [active, setActive] = useState<ActiveWorkout | null>(readLocal)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!user) {
      setHydrated(true)
      return
    }
    const ref = doc(db, 'users', user.uid, 'state', 'activeWorkout')
    return onSnapshot(
      ref,
      (snap) => {
        const remote = snap.exists() ? (snap.data() as ActiveWorkout) : null
        setActive((local) => {
          if (!remote) return hydrated ? local : local
          if (!local) return remote
          // Last writer wins, judged by start time then set count.
          return remote.startedAt >= local.startedAt ? remote : local
        })
        setHydrated(true)
      },
      () => setHydrated(true)
    )
    // `hydrated` intentionally excluded: re-subscribing on hydration would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const save = useCallback(
    (next: ActiveWorkout | null) => {
      setActive(next)
      if (next) localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
      else localStorage.removeItem(LOCAL_KEY)

      if (!user) return
      const ref = doc(db, 'users', user.uid, 'state', 'activeWorkout')
      // Fire-and-forget: the UI must never wait on the network mid-set.
      if (next) void setDoc(ref, next)
      else void deleteDoc(ref).catch(() => undefined)
    },
    [user]
  )

  return { active, save, hydrated }
}
