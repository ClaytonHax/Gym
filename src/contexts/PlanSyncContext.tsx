import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './AuthContext'
import { useProfiles } from './SocialContext'
import { useToast } from './ToastContext'
import { displayOf } from '../components/social'
import { usePlans } from '../hooks/usePlans'
import { isoOf, samePlanContent, syncAction, type SyncAction } from '../lib/planSync'
import type { Plan, PublicPlan } from '../types'

interface PlanSyncValue {
  /** What the app is doing about this followed copy (always 'none' for plans you didn't copy). */
  actionFor: (plan: Plan) => SyncAction
  /** The live published source: undefined until loaded, null once deleted. */
  sourceOf: (publicId: string) => PublicPlan | null | undefined
  /** Take the author's current version (and follow future edits again). */
  accept: (planId: string) => Promise<void>
  /** Keep my version: dismisses the update and stays customised. */
  keep: (planId: string) => Promise<void>
}

const PlanSyncContext = createContext<PlanSyncValue | null>(null)

/** A copy of someone else's published plan that we should keep an eye on. */
const isFollowed = (p: Plan, uid: string) => !!p.sharedFrom && !p.publishedId && p.sharedFrom.authorUid !== uid

/**
 * Keeps one live listener per published plan the user copied (deduped) and brings
 * untouched copies up to date. Customised and legacy copies are never overwritten:
 * they surface as "prompt" for the Plans page to ask about.
 */
export function PlanSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const { plans } = usePlans()
  const [sources, setSources] = useState<Record<string, PublicPlan | null>>({})
  const handled = useRef(new Set<string>())

  const uid = user?.uid ?? ''
  const followed = useMemo(() => plans.filter((p) => isFollowed(p, uid)), [plans, uid])
  const idsKey = [...new Set(followed.map((p) => p.sharedFrom!.publicPlanId))].sort().join(',')
  const profileOf = useProfiles(followed.map((p) => p.sharedFrom!.authorUid))

  useEffect(() => {
    if (!idsKey) return
    const stops = idsKey.split(',').map((id) =>
      onSnapshot(
        doc(db, 'publicPlans', id),
        (snap) =>
          setSources((s) => ({
            ...s,
            [id]: snap.exists() ? ({ usedBy: {}, days: [], ...snap.data(), id } as unknown as PublicPlan) : null,
          })),
        // Offline or no access: leave it unknown rather than call the source deleted.
        (err) => console.warn('followed plan listener failed', id, err)
      )
    )
    return () => stops.forEach((stop) => stop())
  }, [idsKey])

  const actionFor = useCallback(
    (plan: Plan): SyncAction => {
      if (!isFollowed(plan, uid)) return 'none'
      const src = sources[plan.sharedFrom!.publicPlanId]
      if (src === undefined) return 'none'
      if (src === null) return syncAction(plan, null)
      const updatedAt = isoOf(src.updatedAt)
      return updatedAt ? syncAction(plan, { updatedAt }) : 'none'
    },
    [sources, uid]
  )

  const sourceOf = useCallback((publicId: string) => sources[publicId], [sources])

  const write = useCallback(
    (plan: Plan, src: PublicPlan, fields: Record<string, unknown>) =>
      updateDoc(doc(db, 'users', uid, 'plans', plan.id), {
        ...fields,
        'sharedFrom.syncedAt': isoOf(src.updatedAt) ?? new Date().toISOString(),
      }),
    [uid]
  )

  const accept = useCallback(
    async (planId: string) => {
      const plan = plans.find((p) => p.id === planId)
      const src = plan?.sharedFrom ? sources[plan.sharedFrom.publicPlanId] : undefined
      if (!plan || !src) throw new Error('Plan is no longer available')
      // JSON round-trip: plain data, no undefined (Firestore rejects it).
      await write(plan, src, {
        name: src.name,
        days: JSON.parse(JSON.stringify(src.days)),
        updatedAt: new Date().toISOString(),
        'sharedFrom.customized': deleteField(),
      })
    },
    [plans, sources, write]
  )

  const keep = useCallback(
    async (planId: string) => {
      const plan = plans.find((p) => p.id === planId)
      const src = plan?.sharedFrom ? sources[plan.sharedFrom.publicPlanId] : undefined
      if (!plan || !src) throw new Error('Plan is no longer available')
      await write(plan, src, { 'sharedFrom.customized': true })
    },
    [plans, sources, write]
  )

  // Auto-update untouched copies. Each (copy, source version) is handled once, and the
  // write moves syncedAt forward, so this can't loop.
  useEffect(() => {
    for (const plan of followed) {
      const src = sources[plan.sharedFrom!.publicPlanId]
      const updatedAt = src ? isoOf(src.updatedAt) : null
      if (!src || !updatedAt) continue
      const action = actionFor(plan)
      const key = `${plan.id}@${updatedAt}`
      if (handled.current.has(key)) continue

      if (action === 'auto') {
        handled.current.add(key)
        const { handle } = displayOf(profileOf(src.authorUid))
        // Nothing actually changed (e.g. only the tagline): just move the marker.
        const same = samePlanContent(plan, src)
        void (same
          ? write(plan, src, {})
          : write(plan, src, {
              name: src.name,
              days: JSON.parse(JSON.stringify(src.days)),
              updatedAt: new Date().toISOString(),
            }).then(() => toast(`${src.name} was updated${handle ? ` by ${handle}` : ' by its author'}.`, 'info'))
        ).catch((err) => console.warn('could not sync plan', err))
      } else if (action === 'prompt' && !plan.sharedFrom!.syncedAt && samePlanContent(plan, src)) {
        // A legacy copy that already matches the source: nothing to ask about.
        handled.current.add(key)
        void write(plan, src, {}).catch((err) => console.warn('could not stamp plan', err))
      }
    }
  }, [followed, sources, actionFor, write, toast, profileOf])

  const value = useMemo(() => ({ actionFor, sourceOf, accept, keep }), [actionFor, sourceOf, accept, keep])
  return <PlanSyncContext.Provider value={value}>{children}</PlanSyncContext.Provider>
}

export function usePlanSync(): PlanSyncValue {
  const ctx = useContext(PlanSyncContext)
  if (!ctx) throw new Error('usePlanSync must be used inside <PlanSyncProvider>')
  return ctx
}
