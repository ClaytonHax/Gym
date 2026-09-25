import { useCallback, useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { BodyEntry } from '../types'

/**
 * Body-weight log. The document id *is* the yyyy-mm-dd key, which gives us
 * one-entry-per-day for free — logging twice just corrects the day.
 */
export function useBodyLog() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<BodyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setEntries([])
      setLoading(false)
      return
    }
    return onSnapshot(
      collection(db, 'users', user.uid, 'bodylog'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BodyEntry)
        rows.sort((a, b) => b.date.localeCompare(a.date))
        setEntries(rows)
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [user])

  const saveEntry = useCallback(
    async (entry: Omit<BodyEntry, 'id'>) => {
      if (!user) throw new Error('Not signed in')
      await setDoc(doc(db, 'users', user.uid, 'bodylog', entry.date), entry, { merge: true })
    },
    [user]
  )

  const deleteEntry = useCallback(
    async (date: string) => {
      if (!user) throw new Error('Not signed in')
      await deleteDoc(doc(db, 'users', user.uid, 'bodylog', date))
    },
    [user]
  )

  const latest = entries[0] ?? null
  const previous = entries[1] ?? null

  return { entries, loading, saveEntry, deleteEntry, latest, previous }
}
