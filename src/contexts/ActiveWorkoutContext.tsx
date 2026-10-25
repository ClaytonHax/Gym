import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './AuthContext'
import { reconcileRemote } from '../lib/activeSync'
import { stripUndefined } from '../lib/clean'
import type { ActiveWorkout } from '../types'

const LOCAL_KEY = 'gym.activeWorkout'
/** startedAt of the session last known to exist in Firestore — lets a reload tell "deleted elsewhere" from "never synced". */
const MIRRORED_KEY = 'gym.activeWorkout.mirrored'
/** Typing fires a change per keystroke; one write per pause keeps the Firestore stream calm. */
const WRITE_DELAY_MS = 600

function readLocal(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null
  } catch {
    return null
  }
}

function readMirrored(): string | null {
  try {
    return localStorage.getItem(MIRRORED_KEY)
  } catch {
    return null
  }
}

function writeMirrored(startedAt: string | null) {
  try {
    if (startedAt) localStorage.setItem(MIRRORED_KEY, startedAt)
    else localStorage.removeItem(MIRRORED_KEY)
  } catch {
    // Private mode — the session still works, it just can't detect remote deletion after a reload.
  }
}

type SaveInput = ActiveWorkout | null | ((prev: ActiveWorkout | null) => ActiveWorkout | null)

interface ActiveWorkoutValue {
  active: ActiveWorkout | null
  /** Pass the next session, or an updater that receives the latest one (safe for same-tick edits). */
  save: (next: SaveInput) => void
  hydrated: boolean
  /** True while the cloud mirror is failing; the session itself is still safe on this device. */
  syncError: boolean
}

const Ctx = createContext<ActiveWorkoutValue | null>(null)

/**
 * The in-progress session, as ONE shared store. localStorage is the source of
 * truth while training (instant, works with no signal); Firestore mirrors it so a
 * session started on the phone can be finished on a laptop.
 *
 * Writes are coalesced and serialised: only the latest state is sent, and a
 * delete can never race an earlier set (which is what used to produce failed
 * writes right after saving a workout).
 */
export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [active, setActive] = useState<ActiveWorkout | null>(readLocal)
  const [hydrated, setHydrated] = useState(false)
  const [syncError, setSyncError] = useState(false)

  const activeRef = useRef(active)
  const mirroredRef = useRef<string | null>(readMirrored())
  const tombstoneRef = useRef<string | null>(null)
  const pendingRef = useRef<{ uid: string; value: ActiveWorkout | null } | null>(null)
  const timerRef = useRef<number | null>(null)
  const flushingRef = useRef(false)

  const flush = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    try {
      while (pendingRef.current) {
        const item = pendingRef.current
        pendingRef.current = null
        const ref = doc(db, 'users', item.uid, 'state', 'activeWorkout')
        try {
          if (item.value) {
            await setDoc(ref, stripUndefined(item.value))
            mirroredRef.current = item.value.startedAt
            writeMirrored(item.value.startedAt)
          } else {
            await deleteDoc(ref)
            mirroredRef.current = null
            writeMirrored(null)
          }
          setSyncError(false)
        } catch {
          // Keep the failed state for a retry unless something newer is queued.
          if (!pendingRef.current) pendingRef.current = item
          setSyncError(true)
          break
        }
      }
    } finally {
      flushingRef.current = false
    }
  }, [])

  const flushNow = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    void flush()
  }, [flush])

  // Push out anything pending when the tab hides or the connection returns.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flushNow()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushNow)
    window.addEventListener('online', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushNow)
      window.removeEventListener('online', flushNow)
    }
  }, [flushNow])

  useEffect(() => {
    if (!uid) {
      setHydrated(true)
      return
    }
    const ref = doc(db, 'users', uid, 'state', 'activeWorkout')
    return onSnapshot(
      ref,
      (snap) => {
        const remote = snap.exists() ? (snap.data() as ActiveWorkout) : null
        const next = reconcileRemote({
          local: activeRef.current,
          remote,
          lastMirrored: mirroredRef.current,
          tombstone: tombstoneRef.current,
          // Unsent local edits count as pending too, or a late echo would revert fresh typing.
          remotePending: snap.metadata.hasPendingWrites || pendingRef.current !== null || timerRef.current !== null,
          fromCache: snap.metadata.fromCache,
        })
        if (remote && next === remote) {
          mirroredRef.current = remote.startedAt
          writeMirrored(remote.startedAt)
        }
        if (next !== activeRef.current) {
          activeRef.current = next
          setActive(next)
          try {
            if (next) localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
            else {
              localStorage.removeItem(LOCAL_KEY)
              mirroredRef.current = null
              writeMirrored(null)
            }
          } catch {
            // Storage unavailable — in-memory state still drives the UI.
          }
        }
        setHydrated(true)
      },
      () => setHydrated(true)
    )
  }, [uid])

  const save = useCallback(
    (input: SaveInput) => {
      const prev = activeRef.current
      const next = typeof input === 'function' ? input(prev) : input
      if (next === prev) return
      activeRef.current = next
      setActive(next)
      try {
        if (next) localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
        else localStorage.removeItem(LOCAL_KEY)
      } catch {
        // Quota or private mode: keep going in memory.
      }

      if (!next && prev) tombstoneRef.current = prev.startedAt
      if (!uid) return

      // Fire-and-forget: the UI must never wait on the network mid-set.
      pendingRef.current = { uid, value: next }
      if (!next) {
        flushNow()
      } else if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null
          void flush()
        }, WRITE_DELAY_MS)
      }
    },
    [uid, flush, flushNow]
  )

  const value = useMemo(() => ({ active, save, hydrated, syncError }), [active, save, hydrated, syncError])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useActiveWorkoutContext(): ActiveWorkoutValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useActiveWorkout must be used inside <ActiveWorkoutProvider>')
  return ctx
}
