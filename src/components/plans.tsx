import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Icon } from './Icon'
import { Avatar, displayOf } from './social'
import { Badge, Button, Sheet, Skeleton } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { MUSCLE_COLORS } from '../data/exercises'
import { getTemplate, OWNER_UID, PLAN_TEMPLATES, PPL_PUBLIC_ID, PPL_TEMPLATE_ID } from '../data/programs'
import { clean } from '../hooks/usePlans'
import { taglineOf, usePublicPlanActions, usedByCount, useRecommendedPlans } from '../hooks/usePublicPlans'
import { estimateMinutes, setCountOf } from '../lib/plans'
import { fmtDuration } from '../lib/date'
import type { PlanDay, PublicPlan } from '../types'

/** Workout days filled orange, rest days outlined — the same chips the template cards use. */
export function DayChips({ days, className = '' }: { days: PlanDay[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Cycle order">
      {days.map((d) => (
        <li
          key={d.id}
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
            d.kind === 'rest' ? 'border border-rest text-rest' : 'bg-brand-500/15 text-brand-400'
          }`}
        >
          {d.name}
        </li>
      ))}
    </ul>
  )
}

/** "by @username", resolved live from the uid — usernames are never stored on plans. */
export function ByLine({ uid }: { uid: string }) {
  const { handle } = displayOf(useProfile(uid))
  return <>{handle ? `by ${handle}` : 'by …'}</>
}

/** Avatar + "by @username", linking to the author's profile. */
export function AuthorLink({ uid, label = 'by' }: { uid: string; label?: 'by' | 'By' }) {
  const profile = useProfile(uid)
  const { name, handle } = displayOf(profile)
  return (
    <Link
      to={`/friends/${uid}`}
      className="-ml-1 inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:text-brand-400"
    >
      <Avatar uid={uid} name={name} size={24} />
      <span className="truncate">{handle ? `${label} ${handle}` : `${label} …`}</span>
    </Link>
  )
}

function UsedBy({ plan }: { plan: Pick<PublicPlan, 'usedBy'> }) {
  const n = usedByCount(plan)
  return (
    <span className="tabular flex shrink-0 items-center gap-1 text-xs text-[var(--color-fg-muted)]">
      <Icon name="users" size={14} />
      Used by {n}
    </span>
  )
}

/** A library plan: tap the body for the preview, tap the author for their profile. */
export function PublicPlanCard({
  plan,
  onOpen,
  showAuthor = true,
}: {
  plan: PublicPlan
  onOpen: () => void
  showAuthor?: boolean
}) {
  return (
    <div className={plan.starred ? 'card-accent overflow-hidden' : 'card overflow-hidden'}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Preview ${plan.name}`}
        className="flex w-full flex-col gap-2 p-4 pb-2 text-left"
      >
        <span className="flex w-full items-start gap-2">
          <span className="min-w-0 flex-1">
            {plan.starred ? (
              <Badge className="mb-1.5 gap-1 bg-brand-500/15 text-brand-400">
                <Icon name="star" size={12} />
                Recommended
              </Badge>
            ) : null}
            <span className="num-display block text-2xl">{plan.name}</span>
            {plan.tagline ? (
              <span className="mt-1 block text-sm text-[var(--color-fg-muted)]">{plan.tagline}</span>
            ) : null}
          </span>
          <Icon name="chevron-right" size={20} className="mt-1 shrink-0 text-[var(--color-fg-muted)]" />
        </span>
        <DayChips days={plan.days} className="w-full" />
      </button>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
        {showAuthor ? <AuthorLink uid={plan.authorUid} /> : <span />}
        <UsedBy plan={plan} />
      </div>
    </div>
  )
}

/** Full-height day-by-day preview with the primary "Add to my plans" action. */
export function PublicPlanSheet({ plan, onClose }: { plan: PublicPlan | null; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { adopt, copyOf } = usePublicPlanActions()
  const [busy, setBusy] = useState(false)
  const mine = plan ? copyOf(plan.id) : undefined
  const isAuthor = !!plan && plan.authorUid === user?.uid

  async function add() {
    if (!plan) return
    if (mine) {
      onClose()
      return navigate(`/plans/${mine.id}`)
    }
    setBusy(true)
    try {
      const id = await adopt(plan)
      toast('Added to your plans.')
      onClose()
      navigate(`/plans/${id}`)
    } catch {
      toast('Could not add the plan. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const firstWorkout = plan?.days.findIndex((d) => d.kind === 'workout') ?? -1

  return (
    <Sheet
      open={plan !== null}
      onClose={onClose}
      size="full"
      title={plan?.name ?? 'Plan'}
      footer={
        plan ? (
          <div className={isAuthor ? 'grid grid-cols-2 gap-3' : ''}>
            {isAuthor ? (
              <Button
                variant="secondary"
                size="lg"
                icon="pencil"
                onClick={() => {
                  onClose()
                  navigate(`/plans/public/${plan.id}/edit`)
                }}
              >
                Edit
              </Button>
            ) : null}
            <Button full variant="go" size="lg" icon={mine ? 'check' : 'plus'} loading={busy} onClick={() => void add()}>
              {mine ? 'In my plans' : 'Add to my plans'}
            </Button>
          </div>
        ) : null
      }
    >
      {plan ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {plan.tagline ? <p className="tabular text-sm text-[var(--color-fg-muted)]">{plan.tagline}</p> : null}
            {plan.description ? <p className="text-sm">{plan.description}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <AuthorLink uid={plan.authorUid} />
              <UsedBy plan={plan} />
            </div>
          </div>
          <ol className="flex flex-col gap-2">
            {plan.days.map((d, i) =>
              d.kind === 'rest' ? (
                <li key={d.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-rest/50 px-3 text-rest">
                  <span className="tabular w-5 font-display text-lg font-bold">{i + 1}</span>
                  <Icon name="moon" size={18} />
                  <span className="font-semibold">Rest day</span>
                </li>
              ) : (
                <li key={d.id} className="card overflow-hidden border-l-4 border-l-brand-500">
                  <details open={i === firstWorkout} className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                      <span className="tabular w-5 font-display text-lg font-bold text-brand-400">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-xl font-semibold">{d.name}</span>
                        <span className="tabular block truncate text-xs text-[var(--color-fg-muted)]">
                          {d.focus ? `${d.focus} · ` : ''}
                          {d.exercises.length} exercises · {setCountOf(d.exercises)} sets · ~
                          {fmtDuration(estimateMinutes(d.exercises) * 60)}
                        </span>
                      </span>
                      <Icon
                        name="chevron-down"
                        size={18}
                        className="shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200 group-open:rotate-180"
                      />
                    </summary>
                    <ul className="flex flex-col gap-1.5 px-3 pb-3 text-sm">
                      {d.exercises.map((e, j) => (
                        <li key={`${e.exerciseId}-${j}`} className="flex items-center gap-2">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: MUSCLE_COLORS[e.muscle] }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate">{e.name}</span>
                          <span className="tabular shrink-0 text-xs text-[var(--color-fg-muted)]">
                            {e.targets.length}×{e.targets[0] || '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )
            )}
          </ol>
        </div>
      ) : null}
    </Sheet>
  )
}

/** Cards for a set of library plans, owning the preview sheet. */
export function PublicPlanList({
  plans,
  showAuthor = true,
  extra,
}: {
  plans: PublicPlan[]
  showAuthor?: boolean
  /** Rendered under a card, e.g. an owner-only action. */
  extra?: (plan: PublicPlan) => ReactNode
}) {
  const [open, setOpen] = useState<string | null>(null)
  const opened = plans.find((p) => p.id === open) ?? null
  return (
    <>
      <ul className="flex flex-col gap-3">
        {plans.map((p) => (
          <li key={p.id}>
            <PublicPlanCard plan={p} showAuthor={showAuthor} onOpen={() => setOpen(p.id)} />
            {extra?.(p)}
          </li>
        ))}
      </ul>
      <PublicPlanSheet plan={opened} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * The top starred plans as compact "Start this plan" rows, for the moments a
 * user has no active plan. Falls back to the built-in templates when nothing is
 * starred or the library can't be reached; `fallback={false}` renders nothing then.
 */
export function StarterPlans({
  max = 3,
  fallback = true,
  title,
}: {
  max?: number
  fallback?: boolean
  title?: string
}) {
  const toast = useToast()
  const { data, loading } = useRecommendedPlans()
  const { adopt, startTemplate } = usePublicPlanActions()
  const [open, setOpen] = useState<PublicPlan | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const starred = data.slice(0, max)
  const templates = fallback && starred.length === 0 ? PLAN_TEMPLATES : []
  if (!loading && starred.length === 0 && templates.length === 0) return null

  async function start(id: string, name: string, go: () => Promise<unknown>) {
    setBusy(id)
    try {
      await go()
      toast(`${name} is now your plan.`)
    } catch {
      toast('Could not start the plan. Try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const row = 'card-accent flex items-center gap-2 p-3'
  const text = 'min-h-11 min-w-0 flex-1 text-left'

  return (
    <section aria-label={title ?? 'Recommended plans'} className="flex flex-col gap-2">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {loading ? (
        <Skeleton className="h-[76px]" />
      ) : (
        <ul className="flex flex-col gap-2">
          {starred.map((p) => (
            <li key={p.id} className={row}>
              <button type="button" onClick={() => setOpen(p)} className={text} aria-label={`Preview ${p.name}`}>
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-400">
                  <Icon name="star" size={12} />
                  Recommended
                </span>
                <span className="block truncate font-display text-xl font-semibold leading-tight">{p.name}</span>
                <span className="block truncate text-xs text-[var(--color-fg-muted)]">
                  {p.tagline ? `${p.tagline} · ` : ''}
                  <ByLine uid={p.authorUid} />
                </span>
              </button>
              <Button
                variant="go"
                size="sm"
                loading={busy === p.id}
                disabled={busy !== null}
                onClick={() => void start(p.id, p.name, () => adopt(p, { activate: true }))}
                className="shrink-0"
              >
                Start this plan
              </Button>
            </li>
          ))}
          {templates.map((t) => (
            <li key={t.id} className={row}>
              <Link to={`/plans/new?template=${t.id}`} className={`${text} flex flex-col justify-center`}>
                <span className="block truncate font-display text-xl font-semibold leading-tight">{t.name}</span>
                <span className="block truncate text-xs text-[var(--color-fg-muted)]">{t.tagline}</span>
              </Link>
              <Button
                variant="go"
                size="sm"
                loading={busy === t.id}
                disabled={busy !== null}
                onClick={() => void start(t.id, t.name, () => startTemplate(t))}
                className="shrink-0"
              >
                Start this plan
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PublicPlanSheet plan={open} onClose={() => setOpen(null)} />
    </section>
  )
}

/**
 * Headless: the first time @ClaytonHax opens the app, publish the built-in
 * Push / Pull / Legs plan under his account so he can edit it in-app.
 */
export function PublicPlanSeeder() {
  const { user } = useAuth()
  const seeded = useRef(false)

  useEffect(() => {
    if (!user || user.uid !== OWNER_UID || seeded.current) return
    seeded.current = true
    const template = getTemplate(PPL_TEMPLATE_ID)
    if (!template) return
    const ref = doc(db, 'publicPlans', PPL_PUBLIC_ID)

    async function seed() {
      try {
        // Ask the server: an empty offline cache must not look like "missing".
        const snap = await getDocFromServer(ref)
        if (snap.exists()) return
        await setDoc(ref, {
          authorUid: OWNER_UID,
          name: template!.name,
          description: template!.description,
          tagline: taglineOf(template!.days),
          days: clean(template!.days),
          usedBy: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      } catch (err) {
        // Offline (or rules not deployed yet): try again when the connection returns.
        console.warn('could not seed the PPL plan', err)
        window.addEventListener('online', () => void seed(), { once: true })
      }
    }
    void seed()
  }, [user])

  return null
}
