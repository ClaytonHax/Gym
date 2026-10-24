import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { dayKey } from '../lib/date'
import { cloneDays, isPlannedRest, scheduleFor, scheduleRange, withAdjustment } from '../lib/plans'
import type { ActivePlanState, DayKey, Plan, ScheduleSlot } from '../types'

export interface UsePlans {
  /** Newest edit first. */
  plans: Plan[]
  loading: boolean
  activeState: ActivePlanState | null
  activePlan: Plan | null
  /** Recomputed when the calendar day changes. */
  today: ScheduleSlot | null
  /** Today plus the next n - 1 days; [] with no active plan. */
  upcoming: (n?: number) => ScheduleSlot[]
  isRestDay: ((date: DayKey) => boolean) | undefined
  savePlan: (p: Pick<Plan, 'name' | 'days' | 'templateId'>) => Promise<string>
  updatePlan: (id: string, p: Pick<Plan, 'name' | 'days'>) => Promise<void>
  /** Clears the active state too when the plan was active. */
  deletePlan: (id: string) => Promise<void>
  duplicatePlan: (id: string) => Promise<string>
  activatePlan: (planId: string, startDate?: DayKey) => Promise<void>
  deactivatePlan: () => Promise<void>
  delayToday: () => Promise<void>
  skipToday: () => Promise<void>
}

/** Firestore rejects undefined fields; JSON round-trip drops them (all data here is plain JSON). */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function usePlans(): UsePlans {
  const { user } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  const [activeState, setActiveState] = useState<ActivePlanState | null>(null)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [todayKey, setTodayKey] = useState(() => dayKey())

  useEffect(() => {
    if (!user) {
      setPlans([])
      setPlansLoaded(false)
      return
    }
    return onSnapshot(collection(db, 'users', user.uid, 'plans'), (snap) => {
      setPlans(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Plan)
          .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      )
      setPlansLoaded(true)
    }, (err) => {
      // Don't leave the UI on a skeleton forever (e.g. rules not deployed).
      console.error('plans listener failed', err)
      setPlansLoaded(true)
    })
  }, [user])

  useEffect(() => {
    if (!user) {
      setActiveState(null)
      setStateLoaded(false)
      return
    }
    return onSnapshot(doc(db, 'users', user.uid, 'state', 'activePlan'), (snap) => {
      const data = snap.data() as Partial<ActivePlanState> | undefined
      setActiveState(
        data?.planId && data.startDate
          ? { planId: data.planId, startDate: data.startDate, adjustments: data.adjustments ?? [] }
          : null
      )
      setStateLoaded(true)
    }, (err) => {
      console.error('active plan listener failed', err)
      setStateLoaded(true)
    })
  }, [user])

  // Roll "today" over at midnight, and when a backgrounded PWA comes back to the foreground.
  useEffect(() => {
    const sync = () => setTodayKey((k) => (k === dayKey() ? k : dayKey()))
    const id = window.setInterval(sync, 60_000)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const activePlan = useMemo(
    () => (activeState ? (plans.find((p) => p.id === activeState.planId) ?? null) : null),
    [plans, activeState]
  )

  const today = useMemo(
    () => (activePlan && activeState ? scheduleFor(activePlan, activeState, todayKey) : null),
    // todayKey is the intended trigger for recomputing when the day changes.
    [activePlan, activeState, todayKey]
  )

  const upcoming = useCallback(
    (n = 7) =>
      activePlan && activeState
        ? scheduleRange(activePlan, activeState, todayKey, n, new Date())
        : [],
    [activePlan, activeState, todayKey]
  )

  const isRestDay = useMemo(
    () =>
      activePlan && activeState
        ? (date: DayKey) => isPlannedRest(activePlan, activeState, date)
        : undefined,
    [activePlan, activeState]
  )

  const requireUser = useCallback(() => {
    if (!user) throw new Error('Not signed in')
    return user
  }, [user])

  const savePlan = useCallback(
    async (p: Pick<Plan, 'name' | 'days' | 'templateId'>) => {
      const u = requireUser()
      const now = new Date().toISOString()
      const ref = await addDoc(
        collection(db, 'users', u.uid, 'plans'),
        clean({ ...p, createdAt: now, updatedAt: now })
      )
      return ref.id
    },
    [requireUser]
  )

  const updatePlan = useCallback(
    async (id: string, p: Pick<Plan, 'name' | 'days'>) => {
      const u = requireUser()
      await updateDoc(
        doc(db, 'users', u.uid, 'plans', id),
        clean({ name: p.name, days: p.days, updatedAt: new Date().toISOString() })
      )
    },
    [requireUser]
  )

  const deactivatePlan = useCallback(async () => {
    const u = requireUser()
    await deleteDoc(doc(db, 'users', u.uid, 'state', 'activePlan'))
  }, [requireUser])

  const deletePlan = useCallback(
    async (id: string) => {
      const u = requireUser()
      if (activeState?.planId === id) await deactivatePlan()
      await deleteDoc(doc(db, 'users', u.uid, 'plans', id))
    },
    [requireUser, activeState, deactivatePlan]
  )

  const duplicatePlan = useCallback(
    async (id: string) => {
      const src = plans.find((p) => p.id === id)
      if (!src) throw new Error('Plan not found')
      return savePlan({
        name: `${src.name} (copy)`,
        days: cloneDays(src.days),
        ...(src.templateId ? { templateId: src.templateId } : {}),
      })
    },
    [plans, savePlan]
  )

  const activatePlan = useCallback(
    async (planId: string, startDate: DayKey = dayKey()) => {
      const u = requireUser()
      const next: ActivePlanState = { planId, startDate, adjustments: [] }
      await setDoc(doc(db, 'users', u.uid, 'state', 'activePlan'), next)
    },
    [requireUser]
  )

  const adjustToday = useCallback(
    async (type: 'delay' | 'skip') => {
      const u = requireUser()
      if (!activeState) throw new Error('No active plan')
      const next = withAdjustment(activeState, dayKey(), type)
      await setDoc(doc(db, 'users', u.uid, 'state', 'activePlan'), next)
    },
    [requireUser, activeState]
  )

  const delayToday = useCallback(() => adjustToday('delay'), [adjustToday])
  const skipToday = useCallback(() => adjustToday('skip'), [adjustToday])

  return {
    plans,
    loading: !!user && !(plansLoaded && stateLoaded),
    activeState,
    activePlan,
    today,
    upcoming,
    isRestDay,
    savePlan,
    updatePlan,
    deletePlan,
    duplicatePlan,
    activatePlan,
    deactivatePlan,
    delayToday,
    skipToday,
  }
}
