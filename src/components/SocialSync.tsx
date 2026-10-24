import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useSocial } from '../contexts/SocialContext'
import { useWorkouts } from '../hooks/useWorkouts'
import { usePlans } from '../hooks/usePlans'
import { publishMyProofs } from '../hooks/useChallengeProofs'
import { computeStreaks } from '../lib/streaks'
import { addDays, dayKey } from '../lib/date'
import { activityFor, buildPublicStats, challengeScore } from '../lib/social'
import { fmtVolume } from '../lib/units'
import { buildStreakWatch, evaluateWatch, localNow } from '../lib/streakWatch'

/** Activity older than this is pruned from friends' feeds. */
const FEED_DAYS = 30
/** Only brand-new sessions ping friends, not backfill on a new device. */
const FRESH_MS = 2 * 60 * 60 * 1000

/** Your own public stats, computed the same way friends see them. */
export function useMyPublicStats() {
  const { profile } = useSettings()
  const { workouts, loading } = useWorkouts()
  const { isRestDay, activeState, loading: plansLoading } = usePlans()
  const computed = useMemo(() => {
    const streaks = computeStreaks(workouts, {
      isRestDay,
      planStartDate: activeState?.startDate,
      weeklyGoal: profile.weeklyGoal,
    })
    const watch = buildStreakWatch(workouts, streaks, { isRestDay, weeklyGoal: profile.weeklyGoal })
    const risk = evaluateWatch(watch, localNow(), 0)
    const base = buildPublicStats(workouts, streaks, profile.weeklyGoal)
    return {
      stats: {
        ...base,
        atRisk: risk.status === 'risk',
        atRiskDay: risk.status === 'risk' ? watch.asOfDay : '',
      },
      watch,
      // In-app cards wait until midday so they don't nag at breakfast.
      status: evaluateWatch(watch, localNow(), 12),
      streaks,
    }
  }, [workouts, isRestDay, activeState?.startDate, profile.weeklyGoal])
  return { stats: computed.stats, watch: computed.watch, status: computed.status, streaks: computed.streaks, workouts, ready: !loading && !plansLoading }
}

/**
 * Headless: mirrors your workouts into the friend-visible docs — stats summary,
 * activity feed and challenge scores — whenever they change.
 */
export function SocialSync() {
  const { user } = useAuth()
  const { profile } = useSettings()
  const { me, challenges, notifyFriends } = useSocial()
  const { stats, watch, workouts, ready } = useMyPublicStats()
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

  // Streak watch: the few facts the daily server check needs. Debounced, only
  // written when something other than the timestamp changed.
  const lastWatch = useRef<string>('')
  useEffect(() => {
    if (!uid || !ready || !me) return
    const { updatedAt: _u, ...comparable } = watch
    const hash = JSON.stringify(comparable)
    if (hash === lastWatch.current) return
    const t = window.setTimeout(() => {
      setDoc(doc(db, 'streakWatch', uid), watch)
        .then(() => {
          lastWatch.current = hash
        })
        .catch((err) => console.warn('streak watch sync failed', err))
    }, 2500)
    return () => window.clearTimeout(t)
  }, [uid, ready, me, watch])

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
      (err) => console.warn('activity listener failed', err)
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
          // merge: never wipe reactions friends added before our snapshot caught up.
          setDoc(ref, { ...item, reactions: {} }, { merge: true }).catch((err) => {
            console.warn('activity sync failed', err)
            existing.delete(w.id)
          })
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
          updateDoc(ref, item).catch((err) => console.warn('activity update failed', err))
        }
      }
      for (const id of existing.keys()) {
        if (!keep.has(id)) {
          existing.delete(id)
          deleteDoc(doc(db, 'users', uid, 'activity', id)).catch((err) => console.warn('activity prune failed', err))
        }
      }
    }, 2000)
    return () => window.clearTimeout(t)
  }, [uid, ready, me, workouts, notifyFriends, profile.unit])

  // Photo battles only count workouts with one of your proofs, so listen to
  // your own proofs in every live one (a week of grace after it ends).
  const [proofIds, setProofIds] = useState<Record<string, string[]>>({})
  const photoKey = useMemo(() => {
    if (!uid) return ''
    const graceEnd = dayKey(addDays(new Date(), -7))
    return challenges
      .filter((c) => c.verify === 'photo' && c.accepted.includes(uid) && c.endDay >= graceEnd)
      .map((c) => c.id)
      .sort()
      .join(',')
  }, [uid, challenges])

  useEffect(() => {
    if (!uid || !photoKey) {
      setProofIds({})
      return
    }
    const ids = photoKey.split(',')
    const unsubs = ids.map((cid) =>
      onSnapshot(
        query(collection(db, 'challenges', cid, 'proofs'), where('uid', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data().workoutId as string)
          publishMyProofs(cid, list)
          setProofIds((prev) => ({ ...prev, [cid]: list }))
        },
        (err) => console.warn('proofs listener failed', err)
      )
    )
    return () => {
      unsubs.forEach((u) => u())
      ids.forEach((cid) => publishMyProofs(cid, null))
    }
  }, [uid, photoKey])

  // Your score in every challenge you've joined, until a week after it ends.
  useEffect(() => {
    if (!uid || !ready) return
    const graceEnd = dayKey(addDays(new Date(), -7))
    for (const c of challenges) {
      if (!c.accepted.includes(uid) || c.endDay < graceEnd) continue
      let allowed: Set<string> | undefined
      if (c.verify === 'photo') {
        // Wait for the proofs so a slow load never posts a false zero.
        const list = proofIds[c.id]
        if (!list) continue
        allowed = new Set(list)
      }
      const score = challengeScore(workouts, c.metric, c.startDay, c.endDay, allowed)
      if (c.scores[uid] === score) continue
      updateDoc(doc(db, 'challenges', c.id), { [`scores.${uid}`]: score }).catch((err) => console.warn('score sync failed', err))
    }
  }, [uid, ready, challenges, workouts, proofIds])

  return null
}
