import { useCallback, useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Workout } from '../types'
import { completedSetCount, volumeOf } from '../lib/stats'

export function useWorkouts() {
  const { user } = useAuth()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setWorkouts([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'users', user.uid, 'workouts'),
      orderBy('startedAt', 'desc')
    )
    return onSnapshot(
      q,
      (snap) => {
        setWorkouts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workout))
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [user])

  const saveWorkout = useCallback(
    async (workout: Omit<Workout, 'id' | 'totalVolumeKg' | 'setCount'>) => {
      if (!user) throw new Error('Not signed in')
      const payload = {
        ...workout,
        totalVolumeKg: volumeOf(workout.exercises),
        setCount: completedSetCount(workout.exercises),
      }
      const ref = await addDoc(collection(db, 'users', user.uid, 'workouts'), payload)
      return ref.id
    },
    [user]
  )

  const updateWorkout = useCallback(
    async (id: string, patch: Partial<Workout>) => {
      if (!user) throw new Error('Not signed in')
      const next = { ...patch }
      // Keep the denormalised totals honest whenever sets change.
      if (patch.exercises) {
        next.totalVolumeKg = volumeOf(patch.exercises)
        next.setCount = completedSetCount(patch.exercises)
      }
      await updateDoc(doc(db, 'users', user.uid, 'workouts', id), next)
    },
    [user]
  )

  const deleteWorkout = useCallback(
    async (id: string) => {
      if (!user) throw new Error('Not signed in')
      await deleteDoc(doc(db, 'users', user.uid, 'workouts', id))
    },
    [user]
  )

  return { workouts, loading, saveWorkout, updateWorkout, deleteWorkout }
}
