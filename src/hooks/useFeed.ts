import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { ActivityItem } from '../lib/social'

/**
 * Recent workouts for a set of people, newest first. One small listener per
 * person: Firestore rules can't filter a collection-group query by friendship.
 */
export function useFeed(uids: string[], perPerson = 8) {
  const key = [...new Set(uids)].sort().join(',')
  const [byUser, setByUser] = useState<Record<string, ActivityItem[]>>({})
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!key) return
    const unsubs = key.split(',').map((uid) =>
      onSnapshot(
        query(collection(db, 'users', uid, 'activity'), orderBy('at', 'desc'), limit(perPerson)),
        (snap) => {
          setByUser((prev) => ({
            ...prev,
            [uid]: snap.docs.map((d) => ({ id: d.id, uid, reactions: {}, ...d.data() }) as ActivityItem),
          }))
          setLoaded((prev) => ({ ...prev, [uid]: true }))
        },
        () => setLoaded((prev) => ({ ...prev, [uid]: true }))
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [key, perPerson])

  const items = useMemo(
    () =>
      key
        ? key
            .split(',')
            .flatMap((uid) => byUser[uid] ?? [])
            .sort((a, b) => b.at.localeCompare(a.at))
        : [],
    [key, byUser]
  )
  const loading = key ? key.split(',').some((uid) => !loaded[uid]) : false
  return { items, loading }
}
