import { useCallback, useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Routine } from '../types'

export function useRoutines() {
  const { user } = useAuth()
  const [routines, setRoutines] = useState<Routine[]>([])

  useEffect(() => {
    if (!user) {
      setRoutines([])
      return
    }
    return onSnapshot(collection(db, 'users', user.uid, 'routines'), (snap) => {
      setRoutines(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Routine)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    })
  }, [user])

  const saveRoutine = useCallback(
    async (routine: Omit<Routine, 'id' | 'createdAt'>) => {
      if (!user) throw new Error('Not signed in')
      await addDoc(collection(db, 'users', user.uid, 'routines'), {
        ...routine,
        createdAt: new Date().toISOString(),
      })
    },
    [user]
  )

  const deleteRoutine = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not signed in')
      await deleteDoc(doc(db, 'users', user.uid, 'routines', id))
    },
    [user]
  )

  return { routines, saveRoutine, deleteRoutine }
}
