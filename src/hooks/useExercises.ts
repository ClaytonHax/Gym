import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { BUILTIN_EXERCISES } from '../data/exercises'
import type { Exercise } from '../types'

/** Built-in library merged with the user's own moves, sorted by name. */
export function useExercises() {
  const { user } = useAuth()
  const [custom, setCustom] = useState<Exercise[]>([])

  useEffect(() => {
    if (!user) {
      setCustom([])
      return
    }
    return onSnapshot(collection(db, 'users', user.uid, 'exercises'), (snap) => {
      setCustom(
        snap.docs.map((d) => ({ id: d.id, custom: true, ...d.data() }) as Exercise)
      )
    })
  }, [user])

  const exercises = useMemo(
    () =>
      [...BUILTIN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name)),
    [custom]
  )

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const addExercise = useCallback(
    async (exercise: Omit<Exercise, 'id' | 'custom'>) => {
      if (!user) throw new Error('Not signed in')
      const ref = await addDoc(collection(db, 'users', user.uid, 'exercises'), exercise)
      return ref.id
    },
    [user]
  )

  const deleteExercise = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not signed in')
      await deleteDoc(doc(db, 'users', user.uid, 'exercises', id))
    },
    [user]
  )

  return { exercises, custom, byId, addExercise, deleteExercise }
}
