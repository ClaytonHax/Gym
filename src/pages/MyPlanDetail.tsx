import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { DayAccordion, DeletePlanSheet, PlanSourcePill, PlanStats, SwitchPlanSheet } from '../components/planUi'
import { PlanUpdateCard } from '../components/plans'
import { Badge, Button, ConfirmSheet, EmptyState, Skeleton } from '../components/ui'
import { useToast } from '../contexts/ToastContext'
import { usePlanSync } from '../contexts/PlanSyncContext'
import { usePlans } from '../hooks/usePlans'
import { usePublicPlan, usePublicPlanActions } from '../hooks/usePublicPlans'
import { samePlanContent } from '../lib/planSync'

type Pending = 'publish' | 'unpublish'

/** One of my plans in full: every day, plus edit / switch / publish / duplicate / delete. */
export function MyPlanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { plans, loading, activePlan, duplicatePlan } = usePlans()
  const { publish, updatePublished, unpublish } = usePublicPlanActions()
  const { actionFor } = usePlanSync()
  const plan = plans.find((p) => p.id === id) ?? null
  // The library copy supplies the "About" text and tells us whether the published copy is stale.
  const { plan: pub } = usePublicPlan(plan?.publishedId ?? plan?.sharedFrom?.publicPlanId)
  const [switching, setSwitching] = useState<typeof plan>(null)
  const [deleting, setDeleting] = useState<typeof plan>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      toast(done)
    } catch (err) {
      // Our own validation errors are readable; Firebase errors carry a `code` and aren't.
      toast(err instanceof Error && !('code' in err) ? err.message : 'Something went wrong. Try again.', 'error')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon="layers"
          title="Plan not found"
          message="It may have been deleted. Head back to your plans to pick another."
        />
        <Button onClick={() => navigate('/plans', { replace: true })}>Back to plans</Button>
      </div>
    )
  }

  const isActive = plan.id === activePlan?.id
  const ownPub = plan.publishedId ? pub : null
  // Saves publish automatically; this only shows if that failed (compared by content, not clocks).
  const stale = !!ownPub && !samePlanContent(plan, ownPub)
  const about = pub?.description?.trim() || pub?.tagline
  const confirm =
    pending === 'publish'
      ? {
          title: `Publish “${plan.name}”?`,
          message:
            'Anyone using the app can find this plan, see your name as the author and add a copy. Your logged workouts stay private.',
          label: 'Publish',
          tone: 'primary' as const,
          go: () => run(() => publish(plan.id), 'Plan published.'),
        }
      : pending === 'unpublish'
        ? {
            title: `Unpublish “${plan.name}”?`,
            message: 'It disappears from the library. Copies people already added keep working.',
            label: 'Unpublish',
            tone: 'danger' as const,
            go: () => run(() => unpublish(plan.id), 'Plan unpublished.'),
          }
        : null

  return (
    <div className="animate-rise flex flex-col gap-5">
      <Link
        to="/plans"
        className="-ml-2 inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--color-fg-muted)] transition-colors duration-200 hover:text-brand-400 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <Icon name="chevron-left" size={18} />
        Plans
      </Link>

      <header className="card-accent flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <h1 className="num-display min-w-0 flex-1 break-words text-3xl">{plan.name}</h1>
          {isActive ? <Badge color="#22c55e">Active</Badge> : null}
        </div>
        {about ? <p className="text-sm text-[var(--color-fg-muted)]">{about}</p> : null}
        <PlanSourcePill plan={plan} />
        <PlanStats days={plan.days} />
        {actionFor(plan) === 'prompt' ? <PlanUpdateCard plan={plan} /> : null}
      </header>

      <div className="grid grid-cols-2 gap-2">
        {isActive ? (
          <span
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-go-500/50 bg-go-500/10 px-4 text-sm font-bold text-go-400"
            role="status"
          >
            <Icon name="check-circle" size={18} />
            Active plan
          </span>
        ) : (
          <Button variant="go" icon="play" onClick={() => setSwitching(plan)}>
            Start this plan
          </Button>
        )}
        <Button variant="secondary" icon="pencil" onClick={() => navigate(`/plans/${plan.id}`)}>
          Edit
        </Button>
      </div>

      <section aria-label="Days">
        <h2 className="mb-3 text-lg font-semibold">Day by day</h2>
        <DayAccordion days={plan.days} />
      </section>

      <section aria-label="Share and manage" className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">Manage</h2>
        {plan.publishedId ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-go-400">
            <Icon name="check-circle" size={16} className="shrink-0" />
            <span>{stale ? 'Published · changes not published yet' : 'Published to the library'}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {plan.publishedId ? (
            <>
              {stale ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="rotate"
                  loading={busy}
                  onClick={() => void run(() => updatePublished(plan.id), 'Published plan updated.')}
                >
                  Update published
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setPending('unpublish')}>
                Unpublish
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon="share" onClick={() => setPending('publish')}>
              Publish
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon="copy"
            onClick={() =>
              void duplicatePlan(plan.id).then(
                () => toast('Plan duplicated.'),
                () => toast('Could not duplicate the plan.', 'error')
              )
            }
          >
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            className="text-rose-400 hover:text-rose-400"
            onClick={() => setDeleting(plan)}
          >
            Delete
          </Button>
        </div>
      </section>

      <SwitchPlanSheet plan={switching} onClose={() => setSwitching(null)} />
      <DeletePlanSheet plan={deleting} onClose={() => setDeleting(null)} onDeleted={() => navigate('/plans', { replace: true })} />
      <ConfirmSheet
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        tone={confirm?.tone ?? 'danger'}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm?.go()}
      />
    </div>
  )
}
