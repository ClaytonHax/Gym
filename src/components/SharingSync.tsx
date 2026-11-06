import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { useBodyLog } from '../hooks/useBodyLog'
import { usePlans } from '../hooks/usePlans'
import { addDays } from '../lib/date'
import { stripUndefined } from '../lib/clean'
import { buildProfileDetail, buildSharedWorkout, buildStatsDetail, hashString, SHARED_WORKOUT_DAYS } from '../lib/sharing'

const BATCH = 400

/**
 * Headless: copies the parts of your data you chose to share into friend-readable
 * docs, and deletes them again the moment a setting is switched off. Nothing is
 * touched until your own settings have loaded from the server.
 */
export function SharingSync() {
  const { user } = useAuth()
  const { profile, loaded } = useSettings()
  const { workouts, loading: workoutsLoading } = useWorkouts()
  const { latest, loading: bodyLoading } = useBodyLog()
  const { activePlan, loading: plansLoading } = usePlans()
  const uid = user?.uid
  const { shareWorkouts, shareStats, shareProfile } = profile

  // id -> fingerprint of the shared workout docs that currently exist.
  const sharedIds = useRef<Map<string, string> | null>(null)
  const [sharedVersion, setSharedVersion] = useState(0)
  // Which docs exist under users/{uid}/public, with the fingerprint each was written with.
  const publicIds = useRef<Map<string, string> | null>(null)
  const [publicVersion, setPublicVersion] = useState(0)

  useEffect(() => {
    sharedIds.current = null
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'sharedWorkouts'),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return
        const map = new Map<string, string>()
        for (const d of snap.docs) map.set(d.id, String(d.data().fp ?? ''))
        sharedIds.current = map
        setSharedVersion((v) => v + 1)
      },
      (err) => console.warn('shared workouts listener failed', err)
    )
  }, [uid])

  useEffect(() => {
    publicIds.current = null
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'public'),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return
        publicIds.current = new Map(snap.docs.map((d) => [d.id, String(d.data().fp ?? '')]))
        setPublicVersion((v) => v + 1)
      },
      (err) => console.warn('public docs listener failed', err)
    )
  }, [uid])

  const ready = !!uid && loaded && !workoutsLoading && !bodyLoading && !plansLoading

  // Workouts in depth.
  useEffect(() => {
    if (!uid || !ready) return
    const existing = sharedIds.current
    if (!existing) return

    const commit = (ops: Array<{ id: string; data?: ReturnType<typeof buildSharedWorkout> }>) => {
      for (let i = 0; i < ops.length; i += BATCH) {
        const chunk = ops.slice(i, i + BATCH)
        const batch = writeBatch(db)
        for (const op of chunk) {
          const ref = doc(db, 'users', uid, 'sharedWorkouts', op.id)
          if (op.data) batch.set(ref, stripUndefined(op.data))
          else batch.delete(ref)
        }
        // Optimistic: update our view first, roll back on failure.
        for (const op of chunk) {
          if (op.data) existing.set(op.id, op.data.fp)
          else existing.delete(op.id)
        }
        batch.commit().catch((err) => {
          console.warn('shared workouts sync failed', err)
          for (const op of chunk) existing.delete(op.id)
        })
      }
    }

    if (shareWorkouts !== true) {
      if (existing.size > 0) commit([...existing.keys()].map((id) => ({ id })))
      return
    }

    const t = window.setTimeout(() => {
      const cutoff = addDays(new Date(), -SHARED_WORKOUT_DAYS).toISOString()
      const recent = workouts.filter((w) => w.startedAt >= cutoff)
      const keep = new Set(recent.map((w) => w.id))
      const ops: Array<{ id: string; data?: ReturnType<typeof buildSharedWorkout> }> = []
      for (const w of recent) {
        const built = buildSharedWorkout(w)
        if (existing.get(w.id) !== built.fp) ops.push({ id: w.id, data: built })
      }
      for (const id of existing.keys()) if (!keep.has(id)) ops.push({ id })
      if (ops.length > 0) commit(ops)
    }, 2000)
    return () => window.clearTimeout(t)
  }, [uid, ready, shareWorkouts, workouts, sharedVersion])

  // Stats and profile details.
  const statsDetail = useMemo(() => (shareStats === true ? buildStatsDetail(workouts) : null), [shareStats, workouts])
  const profileDetail = useMemo(
    () =>
      shareProfile === true
        ? buildProfileDetail(
            { heightCm: profile.heightCm, goalWeightKg: profile.goalWeightKg, weeklyGoal: profile.weeklyGoal },
            latest,
            activePlan?.name
          )
        : null,
    [shareProfile, profile.heightCm, profile.goalWeightKg, profile.weeklyGoal, latest, activePlan?.name]
  )

  useEffect(() => {
    if (!uid || !ready) return
    const existing = publicIds.current
    const timers: number[] = []

    const sync = (name: 'statsDetail' | 'profileDetail', data: object | null) => {
      const ref = doc(db, 'users', uid, 'public', name)
      if (!data) {
        // Only delete what is really there.
        if (existing?.has(name)) {
          deleteDoc(ref).catch((err) => console.warn(`${name} unshare failed`, err))
        }
        return
      }
      const { asOf: _asOf, ...comparable } = data as { asOf?: string }
      const hash = hashString(JSON.stringify(comparable))
      // Compared with what the doc says, so offline writes (seen locally at once) can't repeat.
      if (existing?.get(name) === hash) return
      timers.push(
        window.setTimeout(() => {
          setDoc(ref, stripUndefined({ ...data, fp: hash })).catch((err) => console.warn(`${name} sync failed`, err))
        }, 1500)
      )
    }

    // Deleting needs to know what exists; writing does not.
    if (existing || statsDetail) sync('statsDetail', statsDetail)
    if (existing || profileDetail) sync('profileDetail', profileDetail)
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [uid, ready, statsDetail, profileDetail, publicVersion])

  return null
}
