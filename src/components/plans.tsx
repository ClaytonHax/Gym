import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDocFromServer, getDocsFromServer, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { Icon } from './Icon'
import { Avatar, displayOf } from './social'
import { Badge, Button, Sheet, Skeleton } from './ui'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/SocialContext'
import { useToast } from '../contexts/ToastContext'
import { MUSCLE_COLORS } from '../data/exercises'
import { getTemplate, OWNER_UID, PLAN_TEMPLATES, PPL_PUBLIC_ID, PPL_TEMPLATE_ID } from '../data/programs'
import { usePlanSync } from '../contexts/PlanSyncContext'
import { hasExercise, pickOwnerPplPlan, samePlanContent, stripExercise, type SyncAction } from '../lib/planSync'
import { clean } from '../hooks/usePlans'
import { taglineOf, usePublicPlanActions, usedByCount, useRecommendedPlans } from '../hooks/usePublicPlans'
import { daySummary, exerciseTargetLabel } from '../lib/plans'
import type { Plan, PlanDay, PlanTemplate, PublicPlan } from '../types'

/** Workout days filled orange, rest days outlined — the same chips the template cards use. */
export function DayChips({ days, className = '' }: { days: PlanDay[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Order of days">
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
  const { name } = displayOf(useProfile(uid))
  return <>by {name}</>
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
      <span className="truncate">
        {label} {name}
        {handle && name !== handle.slice(1) ? <span className="font-normal opacity-80"> ({handle})</span> : null}
      </span>
    </Link>
  )
}

function UsedBy({ plan }: { plan: Pick<PublicPlan, 'usedBy'> }) {
  const n = usedByCount(plan)
  // "Used by 0" reads as a warning; only show the count once it means something.
  if (n < 2) return null
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
                          {daySummary(d.exercises)}
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
                            {exerciseTargetLabel(e)}
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


/** Followed-copy pill: green while it auto-updates, amber once it's the user's own, muted if the source is gone. */
export function FollowPill({ plan, action }: { plan: Plan; action: SyncAction }) {
  const from = plan.sharedFrom
  const { name: authorName } = displayOf(useProfile(from?.authorUid))
  if (!from) return null
  const who = authorName || 'author'
  const base = 'mt-1 inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold'
  if (action === 'orphaned') {
    return (
      <span className={`${base} bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]`}>
        <Icon name="eye-off" size={14} className="shrink-0" />
        <span className="truncate">No longer published</span>
      </span>
    )
  }
  if (from.syncedAt && !from.customized) {
    return (
      <span className={`${base} bg-go-500/15 text-go-400`}>
        <Icon name="rotate" size={14} className="shrink-0" />
        <span className="truncate">Following {who} · auto-updates</span>
      </span>
    )
  }
  return (
    <span className={`${base} bg-amber-500/15 text-amber-400`}>
      <Icon name="pencil" size={14} className="shrink-0" />
      <span className="truncate">{from.customized ? 'Customised' : `Copy of ${who}`}</span>
    </span>
  )
}

/** Shown in the editor on an untouched followed copy, before the first change. */
export function StopsUpdatesNotice({ authorUid }: { authorUid: string }) {
  const { name: authorName } = displayOf(useProfile(authorUid))
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-400">
      <Icon name="rotate" size={16} className="mt-0.5 shrink-0" />
      <span className="min-w-0">Editing will stop automatic updates from {authorName || 'the author'}</span>
    </p>
  )
}

/** "Author updated this plan": the copy is customised (or predates sync), so the user decides. */
export function PlanUpdateCard({ plan }: { plan: Plan }) {
  const toast = useToast()
  const { accept, keep, sourceOf } = usePlanSync()
  const [busy, setBusy] = useState<'update' | 'keep' | null>(null)
  const { name: authorName } = displayOf(useProfile(plan.sharedFrom?.authorUid))
  const src = plan.sharedFrom ? sourceOf(plan.sharedFrom.publicPlanId) : undefined

  async function run(kind: 'update' | 'keep') {
    setBusy(kind)
    try {
      await (kind === 'update' ? accept(plan.id) : keep(plan.id))
      toast(kind === 'update' ? 'Plan updated.' : 'Keeping your version.')
    } catch {
      toast('Could not update the plan. Try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div role="status" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-400">
        <Icon name="rotate" size={16} className="shrink-0" />
        Author updated this plan
      </p>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
        {authorName || 'The author'} changed {src ? `“${src.name}”` : 'it'}. Update replaces your copy with their version;
        Keep mine hides this.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="go" size="sm" loading={busy === 'update'} disabled={busy !== null} onClick={() => void run('update')}>
          Update
        </Button>
        <Button variant="secondary" size="sm" loading={busy === 'keep'} disabled={busy !== null} onClick={() => void run('keep')}>
          Keep mine
        </Button>
      </div>
    </div>
  )
}

interface RecommendedCardProps {
  name: string
  tagline?: string
  days: PlanDay[]
  /** Author of a library plan; undefined for the built-in template. */
  authorUid?: string
  usedBy?: Pick<PublicPlan, 'usedBy'>
  busy: boolean
  disabled: boolean
  onStart: () => void
  /** Opens the preview sheet (library plans) or the editor (templates). */
  onPreview?: () => void
  previewTo?: string
}

/** The top recommended plan as a bold block: who made it, what's in it, one big button. */
function RecommendedCard({
  name,
  tagline,
  days,
  authorUid,
  usedBy,
  busy,
  disabled,
  onStart,
  onPreview,
  previewTo,
}: RecommendedCardProps) {
  const body = (
    <>
      <span className="num-display block text-3xl">{name}</span>
      {tagline ? <span className="tabular mt-0.5 block text-sm text-[var(--color-fg-muted)]">{tagline}</span> : null}
      <DayChips days={days} className="mt-2" />
    </>
  )
  const bodyClass = 'block min-h-11 w-full text-left'
  return (
    <div className="card-accent flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge className="gap-1 bg-brand-500/15 text-brand-400">
          <Icon name="star" size={12} />
          Recommended
        </Badge>
        {usedBy ? <UsedBy plan={usedBy} /> : null}
      </div>
      {previewTo ? (
        <Link to={previewTo} className={bodyClass}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onPreview} aria-label={`Preview ${name}`} className={bodyClass}>
          {body}
        </button>
      )}
      {authorUid ? <AuthorLink uid={authorUid} /> : null}
      <Button full variant="go" size="lg" icon="play" loading={busy} disabled={disabled} onClick={onStart}>
        Start this plan
      </Button>
    </div>
  )
}

/**
 * The recommended plans for the moments a user has no active plan: the top one as a
 * hero card, further ones as compact rows. Only plans the owner starred count; with none
 * it renders nothing (callers show a "Browse plans" CTA), unless `fallback` opts into the
 * built-in templates.
 */
export function StarterPlans({
  max = 3,
  fallback = false,
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
  // Beginners get the cardio starter beside the recommended picks.
  const templates = fallback && starred.length === 0 ? PLAN_TEMPLATES : PLAN_TEMPLATES.filter((t) => t.id !== PPL_TEMPLATE_ID)
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
  const [heroPlan, ...morePlans] = starred
  const noLibrary = starred.length === 0
  const heroTemplate: PlanTemplate | undefined = noLibrary ? templates[0] : undefined
  const moreTemplates: PlanTemplate[] = noLibrary ? templates.slice(1) : templates

  return (
    <section aria-label={title ?? 'Recommended plans'} className="flex flex-col gap-3">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      {loading ? (
        <Skeleton className="h-[264px]" />
      ) : (
        <>
          {heroPlan ? (
            <RecommendedCard
              name={heroPlan.name}
              tagline={heroPlan.tagline}
              days={heroPlan.days}
              authorUid={heroPlan.authorUid}
              usedBy={heroPlan}
              busy={busy === heroPlan.id}
              disabled={busy !== null}
              onPreview={() => setOpen(heroPlan)}
              onStart={() => void start(heroPlan.id, heroPlan.name, () => adopt(heroPlan, { activate: true }))}
            />
          ) : null}
          {heroTemplate ? (
            <RecommendedCard
              name={heroTemplate.name}
              tagline={heroTemplate.tagline}
              days={heroTemplate.days}
              busy={busy === heroTemplate.id}
              disabled={busy !== null}
              previewTo={`/plans/new?template=${heroTemplate.id}`}
              onStart={() => void start(heroTemplate.id, heroTemplate.name, () => startTemplate(heroTemplate))}
            />
          ) : null}
          {morePlans.length + moreTemplates.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {morePlans.map((p) => (
                <li key={p.id} className={row}>
                  <button type="button" onClick={() => setOpen(p)} className={text} aria-label={`Preview ${p.name}`}>
                    <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-400">
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
              {moreTemplates.map((t) =>
                t ? (
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
                ) : null
              )}
            </ul>
          ) : null}
        </>
      )}
      <PublicPlanSheet plan={open} onClose={() => setOpen(null)} />
    </section>
  )
}

/** A published plan must have 1-14 days (firestore.rules) to be written. */
const publishable = (days: PlanDay[]) => days.length >= 1 && days.length <= 14

/**
 * One idempotent pass that makes the owner's classic PPL the published one. Every read
 * goes to the server (an empty offline cache must not look like "missing"), and a plan
 * that is already linked is reused, so repeats and other devices never duplicate links.
 */
async function seedOwnerPpl(uid: string): Promise<void> {
  const template = getTemplate(PPL_TEMPLATE_ID)
  if (!template) return
  const pubRef = doc(db, 'publicPlans', PPL_PUBLIC_ID)
  const [plansSnap, pubSnap] = await Promise.all([
    getDocsFromServer(collection(db, 'users', uid, 'plans')),
    getDocFromServer(pubRef),
  ])
  const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Plan)
  const pub = pubSnap.exists() ? (pubSnap.data() as { name: string; days: PlanDay[] }) : null
  const mine = pickOwnerPplPlan(plans, {
    templateId: PPL_TEMPLATE_ID,
    publicId: PPL_PUBLIC_ID,
    avoidExerciseId: 'woodchopper',
  })

  const create = (name: string, days: PlanDay[], description?: string) =>
    setDoc(pubRef, {
      authorUid: uid,
      name,
      ...(description ? { description } : {}),
      tagline: taglineOf(days),
      days: clean(days),
      usedBy: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  const update = (name: string, days: PlanDay[]) =>
    updateDoc(pubRef, { name, tagline: taglineOf(days), days: clean(days), updatedAt: serverTimestamp() })

  if (mine && publishable(mine.days)) {
    // His own plan becomes the published one.
    const linked = mine.publishedId === PPL_PUBLIC_ID
    // The recommended PPL never includes the woodchopper; drop it from his copy
    // too on first link so the private and published plans stay identical.
    const days = linked ? mine.days : stripExercise(mine.days, 'woodchopper')
    if (!linked) {
      await updateDoc(doc(db, 'users', uid, 'plans', mine.id), {
        publishedId: PPL_PUBLIC_ID,
        ...(hasExercise(mine.days, 'woodchopper') ? { days: clean(days) } : {}),
      })
    }
    const name = mine.name.trim().slice(0, 60) || template.name
    if (!pub) await create(name, days)
    // Already linked => author saves keep the doc current; only a fresh link overwrites it.
    else if (!linked && !samePlanContent(pub, { name, days })) await update(name, days)
    return
  }

  if (!pub) await create(template.name, template.days, template.description)
  else if (hasExercise(pub.days, 'woodchopper')) await update(pub.name, stripExercise(pub.days, 'woodchopper'))
}

/**
 * Headless: whenever @ClaytonHax opens the app (once per session), link his own
 * Push / Pull / Legs plan to the public PPL doc and publish it, or seed it from the
 * built-in template when he has none.
 */
export function PublicPlanSeeder() {
  const { user } = useAuth()
  const seeded = useRef(false)

  useEffect(() => {
    if (!user || user.uid !== OWNER_UID || seeded.current) return
    seeded.current = true
    const uid = user.uid
    let running = false

    async function seed() {
      if (running) return
      running = true
      try {
        await seedOwnerPpl(uid)
      } catch (err) {
        // Offline (or rules not deployed yet): try again when the connection returns.
        console.warn('could not seed the PPL plan', err)
        window.addEventListener('online', () => void seed(), { once: true })
      } finally {
        running = false
      }
    }
    void seed()
  }, [user])

  return null
}
