import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { cloneDays, planSummary, templateToPlanDays } from '../lib/plans'
import type { DayKey, FirestoreTime, Plan, PlanDay, PlanTemplate, PublicPlan } from '../types'
import { isoOf } from '../lib/planSync'
import { clean, usePlans } from './usePlans'

const PAGE = 30
/** Firestore rules cap a published plan at 14 days. */
const MAX_DAYS = 14

function toPublicPlan(d: QueryDocumentSnapshot<DocumentData> | { id: string; data(): DocumentData | undefined }): PublicPlan {
  const data = d.data() ?? {}
  return { usedBy: {}, days: [], ...data, id: d.id } as unknown as PublicPlan
}

const ms = (t: FirestoreTime | undefined) => (t ? t.toMillis() : Number.MAX_SAFE_INTEGER)

export function usedByCount(p: Pick<PublicPlan, 'usedBy'>): number {
  return Object.keys(p.usedBy ?? {}).length
}

/** "8-day cycle · 6 workouts · 2 rest" — the tagline stored on a published plan (≤ 80 chars). */
export function taglineOf(days: PlanDay[]): string {
  const { length, workouts, rests } = planSummary({ days })
  return `${length}-day cycle · ${workouts} workouts · ${rests} rest`
}

interface Stream<T> {
  data: T
  loading: boolean
  error: boolean
}

/**
 * Starred plans (set by hand in the console), by starOrder then name. No composite
 * index needed. Nothing is starred until the owner stars it: no stand-in plan.
 */
export function useRecommendedPlans(): Stream<PublicPlan[]> {
  const { user } = useAuth()
  const [starred, setStarred] = useState<Stream<PublicPlan[]>>({ data: [], loading: true, error: false })

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'publicPlans'), where('starred', '==', true)),
      (snap) => {
        const data = snap.docs
          .map(toPublicPlan)
          .sort(
            (a, b) =>
              (a.starOrder ?? Number.MAX_SAFE_INTEGER) - (b.starOrder ?? Number.MAX_SAFE_INTEGER) ||
              a.name.localeCompare(b.name)
          )
        setStarred({ data, loading: false, error: false })
      },
      (err) => {
        console.error('recommended plans listener failed', err)
        setStarred({ data: [], loading: false, error: true })
      }
    )
  }, [user])

  if (!user) return { data: [], loading: false, error: false }
  return starred
}

export interface AllPublicPlans extends Stream<PublicPlan[]> {
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => Promise<void>
}

/**
 * Non-starred plans, newest-edited first: a live first page, then "Load more" pages via
 * startAfter. Starred ones are dropped client-side (they live in the Recommended section),
 * so paging counts raw documents.
 */
export function useAllPublicPlans(): AllPublicPlans {
  const { user } = useAuth()
  const [head, setHead] = useState<{ docs: QueryDocumentSnapshot<DocumentData>[]; loading: boolean; error: boolean }>({
    docs: [],
    loading: true,
    error: false,
  })
  const [more, setMore] = useState<QueryDocumentSnapshot<DocumentData>[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'publicPlans'), orderBy('updatedAt', 'desc'), limit(PAGE)),
      (snap) => setHead({ docs: snap.docs, loading: false, error: false }),
      (err) => {
        console.error('explore plans listener failed', err)
        setHead({ docs: [], loading: false, error: true })
      }
    )
  }, [user])

  const last = more.length > 0 ? more[more.length - 1] : head.docs[head.docs.length - 1]
  const hasMore = !exhausted && head.docs.length >= PAGE

  const loadMore = useCallback(async () => {
    if (!last || loadingMore) return
    setLoadingMore(true)
    try {
      const snap = await getDocs(
        query(collection(db, 'publicPlans'), orderBy('updatedAt', 'desc'), startAfter(last), limit(PAGE))
      )
      setMore((m) => [...m, ...snap.docs])
      if (snap.docs.length < PAGE) setExhausted(true)
    } finally {
      setLoadingMore(false)
    }
  }, [last, loadingMore])

  const data = useMemo(() => {
    const seen = new Set<string>()
    return [...head.docs, ...more]
      .filter((d) => !seen.has(d.id) && !!seen.add(d.id))
      .map(toPublicPlan)
      .filter((p) => p.starred !== true)
  }, [head.docs, more])

  return { data, loading: !!user && head.loading, error: head.error, hasMore, loadingMore, loadMore }
}

/** One author's published plans, newest edit first. */
export function useAuthorPlans(authorUid: string | undefined): Stream<PublicPlan[]> {
  const { user } = useAuth()
  const [state, setState] = useState<Stream<PublicPlan[]> & { key: string }>({
    data: [],
    loading: true,
    error: false,
    key: '',
  })

  useEffect(() => {
    if (!user || !authorUid) return
    return onSnapshot(
      query(collection(db, 'publicPlans'), where('authorUid', '==', authorUid)),
      (snap) =>
        setState({
          key: authorUid,
          data: snap.docs.map(toPublicPlan).sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)),
          loading: false,
          error: false,
        }),
      (err) => {
        console.error('author plans listener failed', err)
        setState({ key: authorUid, data: [], loading: false, error: true })
      }
    )
  }, [user, authorUid])

  if (!user || !authorUid) return { data: [], loading: false, error: false }
  // A new author id shows loading until its first snapshot lands.
  return state.key === authorUid ? state : { data: [], loading: true, error: false }
}

/** A single published plan by id. */
export function usePublicPlan(id: string | undefined): { plan: PublicPlan | null; loading: boolean; error: boolean } {
  const { user } = useAuth()
  const [state, setState] = useState<{ id: string; plan: PublicPlan | null; error: boolean }>({
    id: '',
    plan: null,
    error: false,
  })

  useEffect(() => {
    if (!user || !id) return
    return onSnapshot(
      doc(db, 'publicPlans', id),
      (snap) => setState({ id, plan: snap.exists() ? toPublicPlan(snap) : null, error: false }),
      (err) => {
        console.error('public plan listener failed', err)
        setState({ id, plan: null, error: true })
      }
    )
  }, [user, id])

  if (!user || !id) return { plan: null, loading: false, error: false }
  const ready = state.id === id
  return { plan: ready ? state.plan : null, loading: !ready, error: ready && state.error }
}

export interface PublicPlanActions {
  /** Copy one of my plans into the library; resolves to the new public id. */
  publish: (planId: string) => Promise<string>
  /** Push my plan's current name and days to its published copy. */
  updatePublished: (planId: string) => Promise<void>
  unpublish: (planId: string) => Promise<void>
  /** Remove a published plan I authored that has no private copy. */
  removePublic: (publicId: string) => Promise<void>
  /** Author edit of a published plan in place. */
  savePublic: (publicId: string, p: Pick<PublicPlan, 'name' | 'days'>) => Promise<void>
  /** My private copy of this public plan, if I already added it. */
  copyOf: (publicId: string) => Plan | undefined
  /** Add (or reuse) my copy and optionally make it active. Resolves to my plan id. */
  adopt: (plan: PublicPlan, opts?: { activate?: boolean; startDate?: DayKey }) => Promise<string>
  /** Save a built-in template as my plan and make it active. */
  startTemplate: (t: PlanTemplate) => Promise<string>
  /** I no longer use this public plan (drops my usedBy entry). */
  stopUsing: (publicId: string) => Promise<void>
}

export function usePublicPlanActions(): PublicPlanActions {
  const { user } = useAuth()
  const { plans, savePlan, activatePlan } = usePlans()

  const requireUser = useCallback(() => {
    if (!user) throw new Error('Not signed in')
    return user
  }, [user])

  const publish = useCallback(
    async (planId: string) => {
      const u = requireUser()
      const plan = plans.find((p) => p.id === planId)
      if (!plan) throw new Error('Plan not found')
      if (plan.days.length > MAX_DAYS) throw new Error(`Only plans up to ${MAX_DAYS} days can be published.`)
      if (planSummary(plan).workouts === 0) throw new Error('Add a workout day before publishing.')
      const ref = await addDoc(collection(db, 'publicPlans'), {
        authorUid: u.uid,
        name: plan.name.trim().slice(0, 60) || 'Untitled plan',
        tagline: taglineOf(plan.days),
        days: clean(plan.days),
        usedBy: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      try {
        await updateDoc(doc(db, 'users', u.uid, 'plans', planId), { publishedId: ref.id })
      } catch (err) {
        await deleteDoc(ref).catch(() => undefined)
        throw err
      }
      return ref.id
    },
    [plans, requireUser]
  )

  const updatePublished = useCallback(
    async (planId: string) => {
      const u = requireUser()
      const plan = plans.find((p) => p.id === planId)
      if (!plan?.publishedId) throw new Error('Plan is not published')
      try {
        await updateDoc(doc(db, 'publicPlans', plan.publishedId), {
          name: plan.name.trim().slice(0, 60) || 'Untitled plan',
          tagline: taglineOf(plan.days),
          days: clean(plan.days),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        if ((err as { code?: string }).code === 'not-found') {
          await updateDoc(doc(db, 'users', u.uid, 'plans', planId), { publishedId: deleteField() })
          throw new Error('This plan is no longer published.')
        }
        throw err
      }
    },
    [plans, requireUser]
  )

  const unpublish = useCallback(
    async (planId: string) => {
      const u = requireUser()
      const plan = plans.find((p) => p.id === planId)
      if (!plan?.publishedId) return
      await deleteDoc(doc(db, 'publicPlans', plan.publishedId))
      await updateDoc(doc(db, 'users', u.uid, 'plans', planId), { publishedId: deleteField() })
    },
    [plans, requireUser]
  )

  const removePublic = useCallback(
    async (publicId: string) => {
      requireUser()
      await deleteDoc(doc(db, 'publicPlans', publicId))
    },
    [requireUser]
  )

  const savePublic = useCallback(
    async (publicId: string, p: Pick<PublicPlan, 'name' | 'days'>) => {
      requireUser()
      await updateDoc(doc(db, 'publicPlans', publicId), {
        name: p.name.trim().slice(0, 60),
        tagline: taglineOf(p.days),
        days: clean(p.days),
        updatedAt: serverTimestamp(),
      })
    },
    [requireUser]
  )

  const copyOf = useCallback(
    (publicId: string) => plans.find((p) => p.sharedFrom?.publicPlanId === publicId),
    [plans]
  )

  const adopt = useCallback(
    async (plan: PublicPlan, opts: { activate?: boolean; startDate?: DayKey } = {}) => {
      const u = requireUser()
      let id = copyOf(plan.id)?.id
      if (!id) {
        id = await savePlan({
          name: plan.name,
          days: cloneDays(plan.days),
          sharedFrom: {
            authorUid: plan.authorUid,
            publicPlanId: plan.id,
            // The version this copy matches, so later edits by the author can be synced.
            syncedAt: isoOf(plan.updatedAt) ?? new Date().toISOString(),
          },
        })
        // The "used by" count is a nicety; never fail an add over it.
        await updateDoc(doc(db, 'publicPlans', plan.id), { [`usedBy.${u.uid}`]: true }).catch((err) =>
          console.warn('could not mark plan as used', err)
        )
      }
      if (opts.activate) await activatePlan(id, opts.startDate)
      return id
    },
    [requireUser, copyOf, savePlan, activatePlan]
  )

  const startTemplate = useCallback(
    async (t: PlanTemplate) => {
      const id = await savePlan({ name: t.name, days: templateToPlanDays(t), templateId: t.id })
      await activatePlan(id)
      return id
    },
    [savePlan, activatePlan]
  )

  const stopUsing = useCallback(
    async (publicId: string) => {
      const u = requireUser()
      await updateDoc(doc(db, 'publicPlans', publicId), { [`usedBy.${u.uid}`]: deleteField() }).catch(() => undefined)
    },
    [requireUser]
  )

  return { publish, updatePublished, unpublish, removePublic, savePublic, copyOf, adopt, startTemplate, stopUsing }
}
