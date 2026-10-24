import { useEffect, useMemo, useRef } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useSocial } from '../contexts/SocialContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { usePlans } from '../hooks/usePlans'
import { computeStreaks } from '../lib/streaks'
import { addDays, dayKey } from '../lib/date'
import { activityFor, buildPublicStats, challengeScore } from '../lib/social'
import { fmtVolume } from '../lib/units'

/** Activity older than this is pruned from friends' feeds. */
const FEED_DAYS = 30
/** Only brand-new sessions ping friends, not backfill on a new device. */
const FRESH_MS = 2 * 60 * 60 * 1000

/** Your own public stats, computed the same way friends see them. */
export function useMyPublicStats() {
  const { profile } = useSettings()
  const { workouts, loading } = useWorkouts()
  const { isRestDay, activeState, loading: plansLoading } = usePlans()
  const stats = useMemo(() => {
    const streaks = computeStreaks(workouts, {
      isRestDay,
      planStartDate: activeState?.startDate,
      weeklyGoal: profile.weeklyGoal,
    })
    return buildPublicStats(workouts, streaks, profile.weeklyGoal)
  }, [workouts, isRestDay, activeState?.startDate, profile.weeklyGoal])
  return { stats, workouts, ready: !loading && !plansLoading }
}

/**
 * Headless: mirrors your workouts into the friend-visible docs — stats summary,
 * activity feed and challenge scores — whenever they change.
 */
export function SocialSync() {
  const { user } = useAuth()
  const { profile } = useSettings()
  const { me, challenges, notifyFriends } = useSocial()
  const { stats, workouts, ready } = useMyPublicStats()
  const uid = user?.uid
  const lastStats = useRef<string>('')
  const activityIds = useRef<Map<string, string> | null>(null)

  // Stats summary, debounced and only written when something actually changed.
  useEffect(() => {
    if (!uid || !ready || !me) return
    const { asOf: _asOf, ...comparable } = stats
    const hash = JSON.stringify(comparable)
    if (hash === lastStats.current) return
    const t = window.setTimeout(() => {
      setDoc(doc(db, 'users', uid, 'public', 'stats'), stats)
        .then(() => {
          lastStats.current = hash
        })
        .catch((err) => console.warn('stats sync failed', err))
    }, 1500)
    return () => window.clearTimeout(t)
  }, [uid, ready, me, stats])

  // Track which activity docs exist (and a fingerprint of each) to diff against.
  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'activity'),
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return
        const map = new Map<string, string>()
        for (const d of snap.docs) {
          const a = d.data()
          map.set(d.id, `${a.name}|${a.sets}|${a.volumeKg}|${a.prs}`)
        }
        activityIds.current = map
      },
      () => {}
    )
  }, [uid])

  useEffect(() => {
    if (!uid || !ready || !me) return
    const t = window.setTimeout(() => {
      const existing = activityIds.current
      if (!existing) return
      const cutoff = addDays(new Date(), -FEED_DAYS).toISOString()
      const recent = workouts.filter((w) => w.startedAt >= cutoff)
      const keep = new Set(recent.map((w) => w.id))

      for (const w of recent) {
        const item = activityFor(w, workouts)
        const fingerprint = `${item.name}|${item.sets}|${item.volumeKg}|${item.prs}`
        const prev = existing.get(w.id)
        if (prev === fingerprint) continue
        const ref = doc(db, 'users', uid, 'activity', w.id)
        existing.set(w.id, fingerprint)
        if (prev === undefined) {
          setDoc(ref, { ...item, reactions: {} }).catch(() => existing.delete(w.id))
          const finished = new Date(w.finishedAt ?? w.startedAt).getTime()
          if (Date.now() - finished < FRESH_MS) {
            const pr = item.prs > 0 ? ` · ${item.prs} PR${item.prs === 1 ? '' : 's'}` : ''
            notifyFriends('workout', w.id, {
              text: `${item.name} · ${item.sets} sets · ${fmtVolume(item.volumeKg, profile.unit)}${pr}`,
              ref: w.id,
            })
          }
        } else {
          // Keep friends' reactions: update the workout fields only.
          updateDoc(ref, item).catch(() => {})
        }
      }
      for (const id of existing.keys()) {
        if (!keep.has(id)) {
          existing.delete(id)
          deleteDoc(doc(db, 'users', uid, 'activity', id)).catch(() => {})
        }
      }
    }, 2000)
    return () => window.clearTimeout(t)
  }, [uid, ready, me, workouts, notifyFriends, profile.unit])

  // Your score in every challenge you've joined, until a week after it ends.
  useEffect(() => {
    if (!uid || !ready) return
    const graceEnd = dayKey(addDays(new Date(), -7))
    for (const c of challenges) {
      if (!c.accepted.includes(uid) || c.endDay < graceEnd) continue
      const score = challengeScore(workouts, c.metric, c.startDay, c.endDay)
      if (c.scores[uid] === score) continue
      updateDoc(doc(db, 'challenges', c.id), { [`scores.${uid}`]: score }).catch(() => {})
    }
  }, [uid, ready, challenges, workouts])

  return null
}
